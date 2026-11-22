import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@sharm/database';
import {
  AgeBandRule,
  BOOKING_STATUS_LABELS,
  CreateBookingDto,
  ERROR_CODES,
  QuoteRequestDto,
  applyBasisPoints,
  cairoLocalToUtc,
  canTransitionBookingStatus,
  computeServerQuote,
  escapeCsvCell,
  isPastBookingCutoff,
} from '@sharm/contracts';
import {
  enqueueOutboxJob,
  lockDeparturesForUpdate,
  lockPromotionForUpdate,
  releaseBookingAllocationInTx,
  remainingSeats,
  runWithSerializableRetry,
} from '@sharm/database';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { RateLimitService } from '../common/rate-limit.service';
import { DomainError } from '../common/http-exception.filter';
import { getAppEnv } from '../common/env';
import { hmacSha256Hex, randomOpaqueToken, sha256Hex, timingSafeEqualStr } from '../common/crypto';
import { VoucherService } from './voucher.service';

export interface GuestSessionClaims {
  bookingId: string;
  tokenId: string;
  exp: number;
}

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
    private readonly voucher: VoucherService,
  ) {}

  private generateBookingReference(): string {
    const year = new Date().getUTCFullYear();
    const suffix = randomOpaqueToken(4).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, 'X');
    return `SPT-${year}-${suffix}`;
  }

  private signGuestSession(claims: GuestSessionClaims): string {
    const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    const sig = hmacSha256Hex(getAppEnv().SESSION_SECRET, `guest:${payload}`);
    return `${payload}.${sig}`;
  }

  verifyGuestSession(cookieVal: string | undefined): GuestSessionClaims {
    if (!cookieVal || !cookieVal.includes('.')) {
      throw new DomainError(ERROR_CODES.UNAUTHORIZED, 'Valid booking access session required', HttpStatus.UNAUTHORIZED);
    }
    const [payload, sig] = cookieVal.split('.');
    const expected = hmacSha256Hex(getAppEnv().SESSION_SECRET, `guest:${payload}`);
    if (!timingSafeEqualStr(sig, expected)) {
      throw new DomainError(ERROR_CODES.UNAUTHORIZED, 'Invalid booking access session', HttpStatus.UNAUTHORIZED);
    }
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as GuestSessionClaims;
    if (!claims.bookingId || !claims.exp || claims.exp < Date.now()) {
      throw new DomainError(ERROR_CODES.UNAUTHORIZED, 'Booking access session expired', HttpStatus.UNAUTHORIZED);
    }
    return claims;
  }

  private async loadPricingContext(
    tx: Prisma.TransactionClient | PrismaService,
    input: {
      tourId: string;
      departureId: string;
      addons: Array<{ addonId: string; quantity: number }>;
      pickupZoneId?: string | null;
      promoCode?: string | null;
      customerEmail?: string | null;
    },
  ) {
    const tour = await tx.tour.findUnique({
      where: { id: input.tourId },
      include: {
        addons: { include: { addon: true } },
        pickupZones: { include: { pickupZone: true } },
        policy: { include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } },
      },
    });
    if (!tour || tour.status !== 'PUBLISHED') {
      throw new DomainError(ERROR_CODES.NOT_FOUND, 'Tour is not available for booking', HttpStatus.NOT_FOUND);
    }

    const departure = await tx.departure.findUnique({ where: { id: input.departureId } });
    if (!departure || departure.tourId !== tour.id) {
      throw new DomainError(ERROR_CODES.NOT_FOUND, 'Selected departure does not belong to this tour', HttpStatus.NOT_FOUND);
    }
    if (departure.status !== 'OPEN') {
      throw new DomainError(ERROR_CODES.CONFLICT, 'Selected departure is closed or cancelled', HttpStatus.CONFLICT);
    }
    if (
      isPastBookingCutoff({
        departureDate: departure.departureDate,
        startTime: departure.startTime,
        cutoffHours: departure.cutoffHours,
        timeZone: departure.timezone,
      })
    ) {
      throw new DomainError(ERROR_CODES.CUTOFF_PASSED, 'Booking cutoff time has passed for this departure');
    }

    // Validate add-ons belong to this tour and are active
    const allowedAddons = new Map(
      tour.addons.filter((ta) => ta.addon.isActive).map((ta) => [ta.addonId, ta.addon]),
    );
    const selectedAddons = input.addons.map(({ addonId, quantity }) => {
      const addon = allowedAddons.get(addonId);
      if (!addon) {
        throw new DomainError(ERROR_CODES.VALIDATION_ERROR, `Add-on ${addonId} is not permitted for this tour`);
      }
      return {
        addon: {
          id: addon.id,
          title: addon.title,
          pricingBasis: addon.pricingBasis as 'PER_PERSON' | 'PER_BOOKING',
          priceMinor: addon.priceMinor,
          maxQuantity: addon.maxQuantity,
          eligibleBands: (addon.eligibleBandsJson as Array<'ADULT' | 'CHILD' | 'INFANT'>) ?? ['ADULT', 'CHILD'],
        },
        quantity,
      };
    });

    // Validate pickup zone belongs to this tour and is active
    let pickupZone: {
      id: string;
      name: string;
      surchargeMinor: number;
      pricingBasis: 'PER_PERSON' | 'PER_BOOKING';
      requiresHotelDetails: boolean;
    } | null = null;
    if (input.pickupZoneId) {
      const foundPz = tour.pickupZones.find((tp) => tp.pickupZoneId === input.pickupZoneId && tp.pickupZone.isActive);
      if (!foundPz) {
        throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Selected pickup zone is not available for this tour');
      }
      pickupZone = {
        id: foundPz.pickupZone.id,
        name: foundPz.pickupZone.name,
        surchargeMinor: foundPz.pickupZone.surchargeMinor,
        pricingBasis: foundPz.pickupZone.pricingBasis as 'PER_PERSON' | 'PER_BOOKING',
        requiresHotelDetails: foundPz.pickupZone.requiresHotelDetails,
      };
    }

    // Validate promotion if provided
    let promotion: {
      id: string;
      code: string;
      discountType: 'FIXED' | 'PERCENT';
      value: number;
      minOrderMinor: number;
      maxTotalUses: number | null;
      usedCount: number;
      maxUsesPerEmail: number | null;
    } | null = null;

    if (input.promoCode) {
      const normalized = input.promoCode.trim().toUpperCase();
      const promo = await tx.promotion.findUnique({ where: { code: normalized } });
      const now = new Date();
      if (!promo || !promo.isActive || promo.validFrom > now || promo.validUntil < now) {
        throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Promotion code is invalid or expired');
      }
      if (promo.discountType === 'FIXED' && promo.currency !== tour.currency) {
        throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Promotion currency does not match tour currency');
      }
      const eligibleIds = Array.isArray(promo.eligibleTourIdsJson) ? (promo.eligibleTourIdsJson as string[]) : [];
      if (eligibleIds.length > 0 && !eligibleIds.includes(tour.id)) {
        throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Promotion code is not eligible for this tour');
      }
      if (promo.maxTotalUses !== null && promo.usedCount >= promo.maxTotalUses) {
        throw new DomainError(ERROR_CODES.CONFLICT, 'Promotion usage limit has been reached', HttpStatus.CONFLICT);
      }
      if (promo.maxUsesPerEmail !== null && input.customerEmail) {
        const emailCount = await tx.promotionRedemption.count({
          where: {
            promotionId: promo.id,
            customerEmail: input.customerEmail.trim().toLowerCase(),
            status: { in: ['RESERVED', 'FINALIZED'] },
          },
        });
        if (emailCount >= promo.maxUsesPerEmail) {
          throw new DomainError(ERROR_CODES.CONFLICT, 'You have already reached the usage limit for this promotion', HttpStatus.CONFLICT);
        }
      }
      promotion = {
        id: promo.id,
        code: promo.code,
        discountType: promo.discountType as 'FIXED' | 'PERCENT',
        value: promo.value,
        minOrderMinor: promo.minOrderMinor,
        maxTotalUses: promo.maxTotalUses,
        usedCount: promo.usedCount,
        maxUsesPerEmail: promo.maxUsesPerEmail,
      };
    }

    const activePolicyVersion = tour.policy?.versions[0] ?? null;
    if (!activePolicyVersion) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Tour has no active booking policy configured');
    }

    return { tour, departure, selectedAddons, pickupZone, promotion, activePolicyVersion };
  }

  async createQuote(dto: QuoteRequestDto) {
    const ctx = await this.loadPricingContext(this.prisma, {
      tourId: dto.tourId,
      departureId: dto.departureId,
      addons: dto.addons,
      pickupZoneId: dto.pickupZoneId,
      promoCode: dto.promoCode,
    });

    const settings = await this.prisma.siteSetting.findUnique({ where: { key: 'singleton' } });
    this.assertPaymentChoiceAllowed(dto.paymentChoice, settings);

    let computed;
    try {
      computed = computeServerQuote({
        tour: {
          currency: ctx.tour.currency,
          pricingMode: ctx.tour.pricingMode as 'PER_PERSON' | 'PRIVATE_GROUP',
          pricingVersion: ctx.tour.pricingVersion,
          privateGroupPriceMinor: ctx.tour.privateGroupPriceMinor,
          minAdults: ctx.tour.minAdults,
          minPartySize: ctx.tour.minPartySize,
          maxPartySize: ctx.tour.maxPartySize,
          ageBands: ctx.tour.ageBandsJson as unknown as AgeBandRule[],
          taxIncluded: ctx.tour.taxIncluded,
          taxRateBps: ctx.tour.taxRateBps,
          serviceFeeIncluded: ctx.tour.serviceFeeIncluded,
          serviceFeeBps: ctx.tour.serviceFeeBps,
          depositEnabled: ctx.tour.depositEnabled,
          depositPercentBps: ctx.tour.depositPercentBps,
        },
        departureOverride: {
          adultPriceMinor: ctx.departure.adultPriceOverrideMinor,
          childPriceMinor: ctx.departure.childPriceOverrideMinor,
          infantPriceMinor: ctx.departure.infantPriceOverrideMinor,
          privateGroupPriceMinor: ctx.departure.privateGroupPriceOverrideMinor,
        },
        travelers: { adults: dto.adults, children: dto.children, infants: dto.infants },
        selectedAddons: ctx.selectedAddons,
        pickupZone: ctx.pickupZone,
        promotion: ctx.promotion,
        paymentChoice: dto.paymentChoice,
      });
    } catch (err) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, err instanceof Error ? err.message : 'Invalid booking parameters');
    }

    const rem = remainingSeats(ctx.departure);
    if (computed.seatsRequired > rem) {
      throw new DomainError(
        ERROR_CODES.CAPACITY_EXCEEDED,
        rem === 0
          ? 'This departure is sold out.'
          : `Only ${rem} seat(s) remaining on this departure; ${computed.seatsRequired} requested.`,
        HttpStatus.CONFLICT,
      );
    }

    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const quote = await this.prisma.bookingQuote.create({
      data: {
        tourId: ctx.tour.id,
        departureId: ctx.departure.id,
        currency: computed.currency,
        pricingVersion: computed.pricingVersion,
        pricingMode: computed.pricingMode,
        seatsRequired: computed.seatsRequired,
        travelersJson: { adults: dto.adults, children: dto.children, infants: dto.infants },
        selectedAddonsJson: dto.addons,
        pickupZoneId: dto.pickupZoneId ?? null,
        promotionId: ctx.promotion?.id ?? null,
        paymentChoice: dto.paymentChoice,
        baseSubtotalMinor: computed.baseSubtotalMinor,
        addonsSubtotalMinor: computed.addonsSubtotalMinor,
        pickupSubtotalMinor: computed.pickupSubtotalMinor,
        discountMinor: computed.discountMinor,
        serviceFeeMinor: computed.serviceFeeMinor,
        taxMinor: computed.taxMinor,
        grandTotalMinor: computed.grandTotalMinor,
        dueNowMinor: computed.dueNowMinor,
        dueLaterMinor: computed.dueLaterMinor,
        lineItemsJson: computed.lineItems as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
    });

    return {
      quoteId: quote.id,
      expiresAt: quote.expiresAt.toISOString(),
      tourTitle: ctx.tour.title,
      departureDate: ctx.departure.departureDate,
      startTime: ctx.departure.startTime,
      timezone: ctx.departure.timezone,
      remainingSeats: rem,
      requiresHotelDetails: ctx.pickupZone?.requiresHotelDetails ?? false,
      policy: {
        versionId: ctx.activePolicyVersion.id,
        title: ctx.activePolicyVersion.title,
        bodyMarkdown: ctx.activePolicyVersion.bodyMarkdown,
        freeCancellationHours: ctx.activePolicyVersion.freeCancellationHours,
        partialRefundHours: ctx.activePolicyVersion.partialRefundHours,
        partialRefundPercentBps: ctx.activePolicyVersion.partialRefundPercentBps,
      },
      quote: computed,
    };
  }

  private assertPaymentChoiceAllowed(
    choice: 'PAY_LATER' | 'BANK_TRANSFER' | 'ONLINE_FULL' | 'ONLINE_DEPOSIT',
    settings: {
      payLaterEnabled: boolean;
      bankTransferEnabled: boolean;
      encryptedPaymobSecretsJson: string | null;
      paymobNonSecretConfigJson: unknown;
    } | null,
  ) {
    if (choice === 'PAY_LATER' && settings && !settings.payLaterEnabled) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Pay Later bookings are currently disabled');
    }
    if (choice === 'BANK_TRANSFER' && settings && !settings.bankTransferEnabled) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Bank transfer is not currently enabled');
    }
    if (choice === 'ONLINE_FULL' || choice === 'ONLINE_DEPOSIT') {
      const cfg = (settings?.paymobNonSecretConfigJson ?? {}) as { enabled?: boolean; sandboxVerified?: boolean };
      const hasSecret = Boolean(process.env.PAYMOB_SECRET_KEY || settings?.encryptedPaymobSecretsJson);
      if (!cfg.enabled || !cfg.sandboxVerified || !hasSecret) {
        throw new DomainError(
          ERROR_CODES.PROVIDER_NOT_CONFIGURED,
          'Online payment gateway is not configured and verified. Please select Pay Later or Bank Transfer.',
        );
      }
    }
  }

  async createBooking(dto: CreateBookingDto, idempotencyKey: string, correlationId?: string) {
    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'A valid Idempotency-Key header (min 8 chars) is required');
    }
    const cleanKey = idempotencyKey.trim().slice(0, 128);
    const requestHash = sha256Hex(JSON.stringify(dto));

    // Check existing idempotency record before entering lock
    const existingIdem = await this.prisma.idempotencyRecord.findUnique({
      where: { scope_key: { scope: 'booking:create', key: cleanKey } },
    });
    if (existingIdem) {
      if (existingIdem.requestHash !== requestHash) {
        throw new DomainError(
          ERROR_CODES.IDEMPOTENCY_CONFLICT,
          'Idempotency-Key was already used with a different booking payload',
          HttpStatus.CONFLICT,
        );
      }
      return existingIdem.responseJson;
    }

    const settings = await this.prisma.siteSetting.findUnique({ where: { key: 'singleton' } });
    this.assertPaymentChoiceAllowed(dto.paymentChoice, settings);

    const env = getAppEnv();

    return runWithSerializableRetry(this.prisma, async (tx) => {
      // Double-check idempotency inside transaction against concurrent duplicate submits
      const idemInTx = await tx.idempotencyRecord.findUnique({
        where: { scope_key: { scope: 'booking:create', key: cleanKey } },
      });
      if (idemInTx) {
        if (idemInTx.requestHash !== requestHash) {
          throw new DomainError(
            ERROR_CODES.IDEMPOTENCY_CONFLICT,
            'Idempotency-Key was already used with a different booking payload',
            HttpStatus.CONFLICT,
          );
        }
        return idemInTx.responseJson;
      }

      const quote = await tx.bookingQuote.findUnique({
        where: { id: dto.quoteId },
        include: { promotion: true },
      });
      if (!quote) {
        throw new DomainError(ERROR_CODES.NOT_FOUND, 'Quote not found', HttpStatus.NOT_FOUND);
      }
      if (quote.consumedAt) {
        throw new DomainError(ERROR_CODES.CONFLICT, 'Quote has already been used for a booking', HttpStatus.CONFLICT);
      }
      if (quote.expiresAt.getTime() <= Date.now()) {
        throw new DomainError(
          ERROR_CODES.QUOTE_EXPIRED,
          'Your quote has expired. Please refresh availability and review the updated total.',
          HttpStatus.GONE,
        );
      }

      // Consistent lock ordering: 1) Departure FOR UPDATE, 2) Promotion FOR UPDATE
      const lockedDeps = await lockDeparturesForUpdate(tx, [quote.departureId]);
      const lockedDep = lockedDeps.get(quote.departureId);
      if (!lockedDep) {
        throw new DomainError(ERROR_CODES.NOT_FOUND, 'Departure not found', HttpStatus.NOT_FOUND);
      }

      let lockedPromo = null;
      if (quote.promotionId) {
        lockedPromo = await lockPromotionForUpdate(tx, quote.promotionId);
      }

      const travelers = quote.travelersJson as { adults: number; children: number; infants: number };
      const addonsInput = quote.selectedAddonsJson as Array<{ addonId: string; quantity: number }>;

      // Re-validate full pricing live on server (never trust client totals!)
      const ctx = await this.loadPricingContext(tx, {
        tourId: quote.tourId,
        departureId: quote.departureId,
        addons: addonsInput,
        pickupZoneId: quote.pickupZoneId,
        promoCode: lockedPromo?.code ?? null,
        customerEmail: dto.leadEmail,
      });

      if (dto.acceptedPolicyVersionId !== ctx.activePolicyVersion.id) {
        throw new DomainError(
          ERROR_CODES.POLICY_REQUIRED,
          'Booking policy has updated; please review and accept the current policy version.',
          HttpStatus.CONFLICT,
        );
      }

      if (ctx.pickupZone?.requiresHotelDetails && (!dto.hotelName || dto.hotelName.trim().length < 2)) {
        throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Hotel or pickup location name is required for the selected pickup zone');
      }

      const recomputed = computeServerQuote({
        tour: {
          currency: ctx.tour.currency,
          pricingMode: ctx.tour.pricingMode as 'PER_PERSON' | 'PRIVATE_GROUP',
          pricingVersion: ctx.tour.pricingVersion,
          privateGroupPriceMinor: ctx.tour.privateGroupPriceMinor,
          minAdults: ctx.tour.minAdults,
          minPartySize: ctx.tour.minPartySize,
          maxPartySize: ctx.tour.maxPartySize,
          ageBands: ctx.tour.ageBandsJson as unknown as AgeBandRule[],
          taxIncluded: ctx.tour.taxIncluded,
          taxRateBps: ctx.tour.taxRateBps,
          serviceFeeIncluded: ctx.tour.serviceFeeIncluded,
          serviceFeeBps: ctx.tour.serviceFeeBps,
          depositEnabled: ctx.tour.depositEnabled,
          depositPercentBps: ctx.tour.depositPercentBps,
        },
        departureOverride: {
          adultPriceMinor: lockedDep.adultPriceOverrideMinor,
          childPriceMinor: lockedDep.childPriceOverrideMinor,
          infantPriceMinor: lockedDep.infantPriceOverrideMinor,
          privateGroupPriceMinor: lockedDep.privateGroupPriceOverrideMinor,
        },
        travelers,
        selectedAddons: ctx.selectedAddons,
        pickupZone: ctx.pickupZone,
        promotion: ctx.promotion,
        paymentChoice: dto.paymentChoice,
      });

      // Reject tampered totals, currency mismatch, or pricing version drift
      if (
        recomputed.grandTotalMinor !== dto.expectedGrandTotalMinor ||
        recomputed.currency !== dto.expectedCurrency.toUpperCase() ||
        recomputed.pricingVersion !== dto.expectedPricingVersion
      ) {
        throw new DomainError(
          ERROR_CODES.QUOTE_CHANGED,
          'Pricing or availability terms have changed since your quote was generated. Please confirm the updated total.',
          HttpStatus.CONFLICT,
          { updatedQuote: recomputed },
        );
      }

      // Enforce authoritative seat capacity under FOR UPDATE row lock
      const rem = remainingSeats(lockedDep);
      if (recomputed.seatsRequired > rem) {
        throw new DomainError(
          ERROR_CODES.CAPACITY_EXCEEDED,
          rem === 0
            ? 'Sorry, this departure just sold out.'
            : `Only ${rem} seat(s) left on this departure; ${recomputed.seatsRequired} requested.`,
          HttpStatus.CONFLICT,
        );
      }

      // Enforce promotion total usage under FOR UPDATE row lock
      if (lockedPromo) {
        if (lockedPromo.maxTotalUses !== null && lockedPromo.usedCount + 1 > lockedPromo.maxTotalUses) {
          throw new DomainError(ERROR_CODES.CONFLICT, 'Promotion usage limit has been reached', HttpStatus.CONFLICT);
        }
        await tx.promotion.update({
          where: { id: lockedPromo.id },
          data: { usedCount: { increment: 1 } },
        });
      }

      const normalizedEmail = dto.leadEmail.trim().toLowerCase();
      // Never merge guests on name alone; match customer contact strictly by normalized email
      const customer = await tx.customer.upsert({
        where: { email: normalizedEmail },
        update: {
          fullName: dto.leadName.trim(),
          phone: dto.leadPhone.trim(),
          ...(dto.nationality ? { nationality: dto.nationality.trim() } : {}),
        },
        create: {
          email: normalizedEmail,
          fullName: dto.leadName.trim(),
          phone: dto.leadPhone.trim(),
          nationality: dto.nationality?.trim() ?? null,
        },
      });

      const isInstantConfirm = dto.paymentChoice === 'PAY_LATER' && ctx.tour.instantConfirmPayLater;
      const isOnline = dto.paymentChoice === 'ONLINE_FULL' || dto.paymentChoice === 'ONLINE_DEPOSIT';

      const initialStatus = isInstantConfirm ? 'CONFIRMED' : isOnline ? 'HELD' : 'REQUESTED';
      const initialPaymentStatus = isOnline ? 'PENDING' : 'UNPAID';
      const now = new Date();
      const holdExpiresAt = isOnline
        ? new Date(now.getTime() + (settings?.onlineCheckoutHoldMinutes ?? 15) * 60_000)
        : null;
      const decisionDeadlineAt =
        initialStatus === 'REQUESTED'
          ? new Date(now.getTime() + (settings?.manualRequestHoldHours ?? 24) * 3600_000)
          : null;

      // Allocate seats atomically
      if (initialStatus === 'CONFIRMED') {
        await tx.departure.update({
          where: { id: lockedDep.id },
          data: { bookedSeats: { increment: recomputed.seatsRequired } },
        });
      } else {
        await tx.departure.update({
          where: { id: lockedDep.id },
          data: { heldSeats: { increment: recomputed.seatsRequired } },
        });
      }

      const reference = this.generateBookingReference();
      const rawManageToken = randomOpaqueToken(32);
      const rawQrToken = randomOpaqueToken(24);

      const snapshot = {
        tourTitle: ctx.tour.title,
        tourSlug: ctx.tour.slug,
        destinationId: ctx.tour.destinationId,
        departureDate: lockedDep.departureDate,
        startTime: lockedDep.startTime,
        timezone: 'Africa/Cairo',
        meetingPoint: ctx.tour.meetingPoint,
        pickupZoneName: ctx.pickupZone?.name ?? null,
        currency: recomputed.currency,
        pricingMode: recomputed.pricingMode,
        pricingVersion: recomputed.pricingVersion,
        lineItems: recomputed.lineItems,
        grandTotalMinor: recomputed.grandTotalMinor,
        policyVersionId: ctx.activePolicyVersion.id,
        policyTitle: ctx.activePolicyVersion.title,
        policyMarkdown: ctx.activePolicyVersion.bodyMarkdown,
        freeCancellationHours: ctx.activePolicyVersion.freeCancellationHours,
        partialRefundHours: ctx.activePolicyVersion.partialRefundHours,
        partialRefundPercentBps: ctx.activePolicyVersion.partialRefundPercentBps,
        qrCheckinTokenRaw: rawQrToken, // Stored server-side in snapshot for voucher rendering only, never exposed publicly except authorized voucher PDF
      };

      const booking = await tx.booking.create({
        data: {
          reference,
          status: initialStatus,
          paymentStatus: initialPaymentStatus,
          tourId: ctx.tour.id,
          departureId: lockedDep.id,
          customerId: customer.id,
          seatsAllocated: recomputed.seatsRequired,
          allocationActive: true,
          holdExpiresAt,
          decisionDeadlineAt,
          currency: recomputed.currency,
          pricingVersion: recomputed.pricingVersion,
          baseSubtotalMinor: recomputed.baseSubtotalMinor,
          addonsSubtotalMinor: recomputed.addonsSubtotalMinor,
          pickupSubtotalMinor: recomputed.pickupSubtotalMinor,
          discountMinor: recomputed.discountMinor,
          serviceFeeMinor: recomputed.serviceFeeMinor,
          taxMinor: recomputed.taxMinor,
          grandTotalMinor: recomputed.grandTotalMinor,
          dueNowMinor: recomputed.dueNowMinor,
          dueLaterMinor: recomputed.dueLaterMinor,
          paymentChoice: dto.paymentChoice,
          leadName: dto.leadName.trim(),
          leadEmail: normalizedEmail,
          leadPhone: dto.leadPhone.trim(),
          nationality: dto.nationality?.trim() ?? null,
          hotelName: dto.hotelName?.trim() ?? null,
          meetingNotes: dto.meetingNotes?.trim() ?? null,
          specialRequests: dto.specialRequests?.trim() ?? null,
          travelersJson: { ...travelers, ...(dto.childAges ? { childAges: dto.childAges } : {}) },
          snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
          policyVersionId: ctx.activePolicyVersion.id,
          acceptedPolicyAt: now,
          promotionId: lockedPromo?.id ?? null,
          qrCheckinTokenHash: sha256Hex(rawQrToken),
        },
      });

      await tx.bookingQuote.update({
        where: { id: quote.id },
        data: { consumedAt: now },
      });

      if (lockedPromo) {
        await tx.promotionRedemption.create({
          data: {
            promotionId: lockedPromo.id,
            bookingId: booking.id,
            customerEmail: normalizedEmail,
            status: initialStatus === 'CONFIRMED' ? 'FINALIZED' : 'RESERVED',
          },
        });
      }

      const tokenExpiry = new Date(now.getTime() + 30 * 86400_000);
      await tx.guestAccessToken.create({
        data: {
          bookingId: booking.id,
          tokenHash: sha256Hex(rawManageToken),
          expiresAt: tokenExpiry,
        },
      });

      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          actorType: 'GUEST',
          eventType: 'BOOKING_CREATED',
          message: `Created with status ${initialStatus} (${dto.paymentChoice})`,
          metadataJson: { correlationId, seatsAllocated: recomputed.seatsRequired },
        },
      });

      const manageLink = `${env.PUBLIC_SITE_URL}/booking/manage?token=${encodeURIComponent(rawManageToken)}`;
      const templateKey = initialStatus === 'CONFIRMED' ? 'booking_confirmed' : 'booking_requested';

      await enqueueOutboxJob(tx, {
        jobType: 'SEND_EMAIL',
        dedupeKey: `booking-created:${booking.id}`,
        payload: {
          templateKey,
          toEmail: booking.leadEmail,
          bookingId: booking.id,
          reference: booking.reference,
          leadName: booking.leadName,
          tourTitle: ctx.tour.title,
          departureDate: lockedDep.departureDate,
          startTime: lockedDep.startTime,
          currency: booking.currency,
          grandTotalMinor: booking.grandTotalMinor,
          dueNowMinor: booking.dueNowMinor,
          dueLaterMinor: booking.dueLaterMinor,
          statusLabel: BOOKING_STATUS_LABELS[initialStatus],
          manageLink,
          deadlineIso: (holdExpiresAt ?? decisionDeadlineAt)?.toISOString() ?? null,
        },
      });

      const responsePayload = {
        bookingId: booking.id,
        reference: booking.reference,
        status: booking.status,
        statusLabel: BOOKING_STATUS_LABELS[booking.status as keyof typeof BOOKING_STATUS_LABELS],
        paymentStatus: booking.paymentStatus,
        paymentChoice: booking.paymentChoice,
        currency: booking.currency,
        grandTotalMinor: booking.grandTotalMinor,
        dueNowMinor: booking.dueNowMinor,
        dueLaterMinor: booking.dueLaterMinor,
        seatsAllocated: booking.seatsAllocated,
        holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
        decisionDeadlineAt: booking.decisionDeadlineAt?.toISOString() ?? null,
        manageExchangeToken: rawManageToken,
        bankDetails:
          dto.paymentChoice === 'BANK_TRANSFER' && settings?.bankTransferEnabled
            ? settings.bankDetailsJson
            : null,
        snapshot: {
          tourTitle: snapshot.tourTitle,
          departureDate: snapshot.departureDate,
          startTime: snapshot.startTime,
          timezone: snapshot.timezone,
          lineItems: snapshot.lineItems,
          policyTitle: snapshot.policyTitle,
        },
      };

      await tx.idempotencyRecord.create({
        data: {
          scope: 'booking:create',
          key: cleanKey,
          requestHash,
          statusCode: 201,
          responseJson: responsePayload as unknown as Prisma.InputJsonValue,
          bookingId: booking.id,
          expiresAt: new Date(now.getTime() + 7 * 86400_000),
        },
      });

      return responsePayload;
    });
  }

  // ==================== GUEST SECURE ACCESS ====================

  async exchangeManageToken(rawToken: string): Promise<{ sessionCookie: string; reference: string }> {
    if (!rawToken || rawToken.length < 16) {
      throw new DomainError(ERROR_CODES.UNAUTHORIZED, 'Invalid booking access link', HttpStatus.UNAUTHORIZED);
    }
    const tokenHash = sha256Hex(rawToken);
    const record = await this.prisma.guestAccessToken.findUnique({
      where: { tokenHash },
      include: { booking: { select: { id: true, reference: true } } },
    });
    const now = new Date();
    if (!record || record.revokedAt !== null || record.expiresAt.getTime() <= now.getTime()) {
      throw new DomainError(ERROR_CODES.UNAUTHORIZED, 'This booking link is invalid, expired, or revoked', HttpStatus.UNAUTHORIZED);
    }

    await this.prisma.guestAccessToken.update({
      where: { id: record.id },
      data: { lastUsedAt: now },
    });

    const sessionCookie = this.signGuestSession({
      bookingId: record.bookingId,
      tokenId: record.id,
      exp: now.getTime() + 2 * 3600_000, // 2h short-lived secure cookie
    });

    return { sessionCookie, reference: record.booking.reference };
  }

  async recoverManageAccess(reference: string, email: string, ipAddress?: string): Promise<{ accepted: true }> {
    const rl = this.rateLimit.check(`guest:recover:${ipAddress ?? 'unknown'}`, 5, 15 * 60_000);
    if (!rl.allowed) {
      throw new DomainError(ERROR_CODES.RATE_LIMITED, 'Too many recovery requests. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const booking = await this.prisma.booking.findUnique({ where: { reference: reference.trim().toUpperCase() } });
    if (booking && booking.leadEmail === email.trim().toLowerCase()) {
      const rawToken = randomOpaqueToken(32);
      const now = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.guestAccessToken.create({
          data: {
            bookingId: booking.id,
            tokenHash: sha256Hex(rawToken),
            expiresAt: new Date(now.getTime() + 7 * 86400_000),
          },
        });
        await enqueueOutboxJob(tx, {
          jobType: 'SEND_EMAIL',
          payload: {
            templateKey: 'booking_access_link',
            toEmail: booking.leadEmail,
            bookingId: booking.id,
            reference: booking.reference,
            leadName: booking.leadName,
            manageLink: `${getAppEnv().PUBLIC_SITE_URL}/booking/manage?token=${encodeURIComponent(rawToken)}`,
          },
        });
      });
    }
    // Always generic response so reference numbers cannot be probed
    return { accepted: true };
  }

  async getGuestBookingView(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        tour: { select: { id: true, slug: true, title: true, primaryImageUrl: true, primaryImageAlt: true } },
        departure: true,
        ledgerEntries: { orderBy: { createdAt: 'asc' } },
        paymentProofs: {
          select: {
            id: true,
            submittedAmountMinor: true,
            submittedCurrency: true,
            transferReference: true,
            status: true,
            createdAt: true,
            reviewNote: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        refundRequests: {
          select: { id: true, amountMinor: true, currency: true, status: true, reason: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!booking) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);

    const collectedMinor = booking.ledgerEntries
      .filter((e) => e.type === 'CAPTURE' || e.type === 'MANUAL_PAYMENT')
      .reduce((s, e) => s + e.amountMinor, 0);
    const refundedMinor = booking.ledgerEntries
      .filter((e) => e.type === 'REFUND')
      .reduce((s, e) => s + e.amountMinor, 0);

    const snapshot = booking.snapshotJson as Record<string, unknown>;
    const safeSnapshot = { ...snapshot };
    delete safeSnapshot.qrCheckinTokenRaw; // Never expose raw check-in token in JSON

    const settings = await this.prisma.siteSetting.findUnique({ where: { key: 'singleton' } });

    // Upcoming alternative departures for reschedule
    const altDepartures = await this.prisma.departure.findMany({
      where: {
        tourId: booking.tourId,
        status: 'OPEN',
        id: { not: booking.departureId },
        startUtc: { gt: new Date() },
      },
      orderBy: [{ departureDate: 'asc' }, { startTime: 'asc' }],
      take: 14,
    });

    return {
      id: booking.id,
      reference: booking.reference,
      status: booking.status,
      statusLabel: BOOKING_STATUS_LABELS[booking.status as keyof typeof BOOKING_STATUS_LABELS],
      paymentStatus: booking.paymentStatus,
      paymentChoice: booking.paymentChoice,
      seatsAllocated: booking.seatsAllocated,
      currency: booking.currency,
      grandTotalMinor: booking.grandTotalMinor,
      dueNowMinor: booking.dueNowMinor,
      dueLaterMinor: booking.dueLaterMinor,
      collectedMinor,
      refundedMinor,
      outstandingMinor: Math.max(0, booking.grandTotalMinor - collectedMinor),
      holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
      decisionDeadlineAt: booking.decisionDeadlineAt?.toISOString() ?? null,
      leadName: booking.leadName,
      leadEmail: booking.leadEmail,
      leadPhone: booking.leadPhone,
      hotelName: booking.hotelName,
      specialRequests: booking.specialRequests,
      travelers: booking.travelersJson,
      snapshot: safeSnapshot,
      tour: booking.tour,
      departure: {
        id: booking.departure.id,
        departureDate: booking.departure.departureDate,
        startTime: booking.departure.startTime,
        timezone: booking.departure.timezone,
      },
      bankDetails:
        settings?.bankTransferEnabled && booking.paymentChoice === 'BANK_TRANSFER'
          ? settings.bankDetailsJson
          : null,
      paymentProofs: booking.paymentProofs,
      refundRequests: booking.refundRequests,
      rescheduleOptions: altDepartures
        .filter((d) => remainingSeats(d) >= booking.seatsAllocated)
        .map((d) => ({
          id: d.id,
          departureDate: d.departureDate,
          startTime: d.startTime,
          remainingSeats: remainingSeats(d),
        })),
    };
  }

  async generateVoucherPdfBuffer(bookingId: string): Promise<{ filename: string; buffer: Buffer }> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { ledgerEntries: true },
    });
    if (!booking) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);

    const collectedMinor = booking.ledgerEntries
      .filter((e) => e.type === 'CAPTURE' || e.type === 'MANUAL_PAYMENT')
      .reduce((s, e) => s + e.amountMinor, 0);

    const snapshot = booking.snapshotJson as {
      tourTitle: string;
      departureDate: string;
      startTime: string;
      timezone: string;
      meetingPoint?: string;
      policyTitle?: string;
      lineItems?: Array<{ label: string; quantity: number; totalMinor: number }>;
      qrCheckinTokenRaw?: string;
    };

    const buffer = await this.voucher.generateBookingPdf({
      reference: booking.reference,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      leadName: booking.leadName,
      leadEmail: booking.leadEmail,
      leadPhone: booking.leadPhone,
      hotelName: booking.hotelName,
      meetingNotes: booking.meetingNotes,
      specialRequests: booking.specialRequests,
      seatsAllocated: booking.seatsAllocated,
      currency: booking.currency,
      grandTotalMinor: booking.grandTotalMinor,
      dueNowMinor: booking.dueNowMinor,
      dueLaterMinor: booking.dueLaterMinor,
      collectedMinor,
      snapshot,
      qrCheckinPayload: booking.status === 'CONFIRMED' ? snapshot.qrCheckinTokenRaw : undefined,
    });

    const kind = booking.status === 'CONFIRMED' ? 'voucher' : 'request-summary';
    return { filename: `sharm-pharaoh-${booking.reference}-${kind}.pdf`, buffer };
  }

  async guestCancelBooking(bookingId: string, reason?: string) {
    return runWithSerializableRetry(this.prisma, async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { departure: true, ledgerEntries: true },
      });
      if (!booking) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);
      if (!canTransitionBookingStatus(booking.status as 'REQUESTED', 'CANCELLED')) {
        throw new DomainError(ERROR_CODES.INVALID_STATE_TRANSITION, `Cannot cancel booking in ${booking.status} state`);
      }

      await lockDeparturesForUpdate(tx, [booking.departureId]);

      const snapshot = booking.snapshotJson as {
        freeCancellationHours?: number;
        partialRefundHours?: number;
        partialRefundPercentBps?: number;
      };
      const freeHours = snapshot.freeCancellationHours ?? 24;
      const partialHours = snapshot.partialRefundHours ?? 12;
      const partialBps = snapshot.partialRefundPercentBps ?? 5000;

      const { zoned } = cairoLocalToUtc(booking.departure.departureDate, booking.departure.startTime, booking.departure.timezone);
      const hoursUntilDeparture = (zoned.epochMilliseconds - Date.now()) / 3600_000;

      const collectedMinor = booking.ledgerEntries
        .filter((e) => e.type === 'CAPTURE' || e.type === 'MANUAL_PAYMENT')
        .reduce((s, e) => s + e.amountMinor, 0);
      const alreadyRefunded = booking.ledgerEntries
        .filter((e) => e.type === 'REFUND')
        .reduce((s, e) => s + e.amountMinor, 0);
      const netCollected = Math.max(0, collectedMinor - alreadyRefunded);

      let eligibleRefundMinor = 0;
      let policyTier = 'NON_REFUNDABLE';
      if (hoursUntilDeparture >= freeHours) {
        eligibleRefundMinor = netCollected;
        policyTier = 'FREE_CANCELLATION';
      } else if (hoursUntilDeparture >= partialHours) {
        eligibleRefundMinor = applyBasisPoints(netCollected, partialBps);
        policyTier = 'PARTIAL_REFUND';
      }

      await releaseBookingAllocationInTx(tx, booking);

      const updated = await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: reason?.trim() || `Guest cancellation (${policyTier})`,
          version: { increment: 1 },
        },
      });

      let refundRequest = null;
      if (eligibleRefundMinor > 0) {
        refundRequest = await tx.refundRequest.create({
          data: {
            bookingId: booking.id,
            amountMinor: eligibleRefundMinor,
            currency: booking.currency,
            reason: `Eligible ${policyTier} refund per accepted booking policy snapshot`,
            status: 'PENDING',
            requestedByType: 'GUEST',
          },
        });
      }

      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          actorType: 'GUEST',
          eventType: 'BOOKING_CANCELLED',
          message: `Guest cancelled booking (${policyTier})`,
          metadataJson: { hoursUntilDeparture: Math.round(hoursUntilDeparture * 10) / 10, eligibleRefundMinor },
        },
      });

      await enqueueOutboxJob(tx, {
        jobType: 'SEND_EMAIL',
        dedupeKey: `booking-cancelled:${booking.id}`,
        payload: {
          templateKey: 'booking_cancelled',
          toEmail: booking.leadEmail,
          bookingId: booking.id,
          reference: booking.reference,
          leadName: booking.leadName,
          reason: updated.cancellationReason,
          eligibleRefundMinor,
          currency: booking.currency,
        },
      });

      return { booking: updated, policyTier, eligibleRefundMinor, refundRequest };
    });
  }

  async rescheduleBooking(params: {
    bookingId: string;
    newDepartureId: string;
    acceptPriceDifference?: boolean;
    actorType: 'GUEST' | 'STAFF';
    actorId?: string;
    actorRole?: string;
    reason?: string;
    requestId?: string;
  }) {
    return runWithSerializableRetry(this.prisma, async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: params.bookingId },
        include: { tour: true },
      });
      if (!booking) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);
      if (!['REQUESTED', 'HELD', 'CONFIRMED'].includes(booking.status)) {
        throw new DomainError(ERROR_CODES.INVALID_STATE_TRANSITION, `Cannot reschedule a ${booking.status} booking`);
      }
      if (booking.departureId === params.newDepartureId) {
        throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Booking is already assigned to this departure');
      }

      // Consistent sorted lock ordering across BOTH departures to guarantee deadlock freedom!
      const lockedMap = await lockDeparturesForUpdate(tx, [booking.departureId, params.newDepartureId]);
      const oldDep = lockedMap.get(booking.departureId);
      const newDep = lockedMap.get(params.newDepartureId);
      if (!oldDep || !newDep || newDep.tourId !== booking.tourId) {
        throw new DomainError(ERROR_CODES.NOT_FOUND, 'Target departure not found for this tour', HttpStatus.NOT_FOUND);
      }
      if (newDep.status !== 'OPEN') {
        throw new DomainError(ERROR_CODES.CONFLICT, 'Target departure is not open', HttpStatus.CONFLICT);
      }
      if (
        params.actorType === 'GUEST' &&
        isPastBookingCutoff({ departureDate: newDep.departureDate, startTime: newDep.startTime, cutoffHours: newDep.cutoffHours })
      ) {
        throw new DomainError(ERROR_CODES.CUTOFF_PASSED, 'Target departure cutoff has passed');
      }

      // Check price difference between old and new departure
      const oldAdult = oldDep.adultPriceOverrideMinor ?? 0;
      const newAdult = newDep.adultPriceOverrideMinor ?? 0;
      const travelers = booking.travelersJson as { adults: number; children: number };
      const estimatedDiffMinor =
        newDep.adultPriceOverrideMinor !== oldDep.adultPriceOverrideMinor
          ? (newAdult - oldAdult) * (travelers.adults ?? 1)
          : 0;

      if (estimatedDiffMinor > 0 && !params.acceptPriceDifference) {
        throw new DomainError(
          ERROR_CODES.QUOTE_CHANGED,
          'The selected departure has a higher slot price. Confirm the price difference before rescheduling.',
          HttpStatus.CONFLICT,
          { priceDifferenceMinor: estimatedDiffMinor, currency: booking.currency },
        );
      }

      // Acquire NEW departure slot BEFORE releasing old slot!
      if (remainingSeats(newDep) < booking.seatsAllocated) {
        throw new DomainError(
          ERROR_CODES.CAPACITY_EXCEEDED,
          `Target departure does not have ${booking.seatsAllocated} available seats`,
          HttpStatus.CONFLICT,
        );
      }

      const isConfirmed = booking.status === 'CONFIRMED';
      if (booking.allocationActive) {
        if (isConfirmed) {
          await tx.departure.update({
            where: { id: newDep.id },
            data: { bookedSeats: { increment: booking.seatsAllocated } },
          });
          await tx.departure.update({
            where: { id: oldDep.id },
            data: { bookedSeats: { decrement: booking.seatsAllocated } },
          });
        } else {
          await tx.departure.update({
            where: { id: newDep.id },
            data: { heldSeats: { increment: booking.seatsAllocated } },
          });
          await tx.departure.update({
            where: { id: oldDep.id },
            data: { heldSeats: { decrement: booking.seatsAllocated } },
          });
        }
      }

      const prevSnap = booking.snapshotJson as Record<string, unknown>;
      const nextSnap = {
        ...prevSnap,
        departureDate: newDep.departureDate,
        startTime: newDep.startTime,
      };

      const updated = await tx.booking.update({
        where: { id: booking.id },
        data: {
          departureId: newDep.id,
          snapshotJson: nextSnap as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });

      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          actorType: params.actorType,
          actorId: params.actorId ?? null,
          eventType: 'BOOKING_RESCHEDULED',
          message: `Rescheduled from ${oldDep.departureDate} ${oldDep.startTime} to ${newDep.departureDate} ${newDep.startTime}${params.reason ? ` (${params.reason})` : ''}`,
          metadataJson: { oldDepartureId: oldDep.id, newDepartureId: newDep.id, priceDifferenceMinor: estimatedDiffMinor },
        },
      });

      if (params.actorType === 'STAFF' && params.actorId) {
        await this.audit.log({
          actorId: params.actorId,
          actorRole: params.actorRole,
          action: 'booking.reschedule',
          targetType: 'Booking',
          targetId: booking.id,
          requestId: params.requestId,
          reason: params.reason,
          before: { departureId: oldDep.id },
          after: { departureId: newDep.id },
        });
      }

      return { booking: updated, priceDifferenceMinor: estimatedDiffMinor };
    });
  }

  // ==================== ADMIN BOOKING MANAGEMENT ====================

  async listAdminBookings(params: {
    q?: string;
    status?: string;
    paymentStatus?: string;
    tourId?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));
    const where: Prisma.BookingWhereInput = {};
    if (params.status) where.status = params.status as 'REQUESTED';
    if (params.paymentStatus) where.paymentStatus = params.paymentStatus as 'UNPAID';
    if (params.tourId) where.tourId = params.tourId;
    if (params.fromDate || params.toDate) {
      where.departure = {
        departureDate: {
          ...(params.fromDate ? { gte: params.fromDate } : {}),
          ...(params.toDate ? { lte: params.toDate } : {}),
        },
      };
    }
    if (params.q) {
      where.OR = [
        { reference: { contains: params.q, mode: 'insensitive' } },
        { leadName: { contains: params.q, mode: 'insensitive' } },
        { leadEmail: { contains: params.q, mode: 'insensitive' } },
        { leadPhone: { contains: params.q, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        include: {
          tour: { select: { id: true, title: true, slug: true } },
          departure: { select: { id: true, departureDate: true, startTime: true, capacity: true, bookedSeats: true, heldSeats: true } },
          assignedStaff: { select: { id: true, fullName: true } },
          ledgerEntries: { select: { type: true, amountMinor: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: items.map((b) => {
        const collectedMinor = b.ledgerEntries
          .filter((e) => e.type === 'CAPTURE' || e.type === 'MANUAL_PAYMENT')
          .reduce((s, e) => s + e.amountMinor, 0);
        return { ...b, collectedMinor };
      }),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getAdminBookingDetail(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        tour: true,
        departure: true,
        customer: true,
        assignedStaff: { select: { id: true, fullName: true, email: true } },
        notes: { include: { author: { select: { id: true, fullName: true } } }, orderBy: { createdAt: 'desc' } },
        events: { orderBy: { createdAt: 'desc' } },
        paymentAttempts: { orderBy: { createdAt: 'desc' } },
        paymentProofs: { include: { mediaAsset: true }, orderBy: { createdAt: 'desc' } },
        ledgerEntries: { orderBy: { createdAt: 'desc' } },
        refundRequests: { orderBy: { createdAt: 'desc' } },
        emailDeliveries: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!booking) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);
    return booking;
  }

  async approveBooking(id: string, actor: { userId: string; role: string; requestId?: string }) {
    return runWithSerializableRetry(this.prisma, async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id }, include: { tour: true } });
      if (!booking) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);
      if (!canTransitionBookingStatus(booking.status as 'REQUESTED', 'CONFIRMED')) {
        throw new DomainError(ERROR_CODES.INVALID_STATE_TRANSITION, `Booking in ${booking.status} state cannot be approved`);
      }

      const lockedMap = await lockDeparturesForUpdate(tx, [booking.departureId]);
      const dep = lockedMap.get(booking.departureId)!;

      // Consume active held allocation OR atomically reacquire seats if expired (NEVER bypass capacity!)
      if (booking.allocationActive && (booking.status === 'REQUESTED' || booking.status === 'HELD')) {
        await tx.departure.update({
          where: { id: dep.id },
          data: {
            heldSeats: { decrement: booking.seatsAllocated },
            bookedSeats: { increment: booking.seatsAllocated },
          },
        });
      } else {
        const rem = remainingSeats(dep);
        if (rem < booking.seatsAllocated) {
          throw new DomainError(
            ERROR_CODES.CAPACITY_EXCEEDED,
            `Cannot confirm expired booking: only ${rem} seat(s) left, ${booking.seatsAllocated} needed.`,
            HttpStatus.CONFLICT,
          );
        }
        await tx.departure.update({
          where: { id: dep.id },
          data: { bookedSeats: { increment: booking.seatsAllocated } },
        });
      }

      const updated = await tx.booking.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          allocationActive: true,
          holdExpiresAt: null,
          decisionDeadlineAt: null,
          version: { increment: 1 },
        },
      });

      if (booking.promotionId) {
        await tx.promotionRedemption.updateMany({
          where: { bookingId: booking.id, status: 'RESERVED' },
          data: { status: 'FINALIZED' },
        });
      }

      await tx.bookingEvent.create({
        data: {
          bookingId: id,
          actorType: 'STAFF',
          actorId: actor.userId,
          eventType: 'BOOKING_APPROVED',
          message: 'Reservation approved and seats confirmed',
        },
      });

      const rawToken = randomOpaqueToken(32);
      await tx.guestAccessToken.create({
        data: {
          bookingId: id,
          tokenHash: sha256Hex(rawToken),
          expiresAt: new Date(Date.now() + 30 * 86400_000),
        },
      });

      await enqueueOutboxJob(tx, {
        jobType: 'SEND_EMAIL',
        dedupeKey: `booking-confirmed:${id}:${updated.version}`,
        payload: {
          templateKey: 'booking_confirmed',
          toEmail: booking.leadEmail,
          bookingId: id,
          reference: booking.reference,
          leadName: booking.leadName,
          tourTitle: booking.tour.title,
          departureDate: dep.departureDate,
          startTime: dep.startTime,
          currency: booking.currency,
          grandTotalMinor: booking.grandTotalMinor,
          manageLink: `${getAppEnv().PUBLIC_SITE_URL}/booking/manage?token=${encodeURIComponent(rawToken)}`,
        },
      });

      await this.audit.log({
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'booking.approve',
        targetType: 'Booking',
        targetId: id,
        requestId: actor.requestId,
        before: { status: booking.status },
        after: { status: 'CONFIRMED' },
      });

      return updated;
    });
  }

  async declineOrCancelBookingByStaff(
    id: string,
    reason: string,
    actor: { userId: string; role: string; requestId?: string },
  ) {
    if (!reason || reason.trim().length < 4) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'A clear cancellation/decline reason is required for audit records');
    }

    return runWithSerializableRetry(this.prisma, async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id } });
      if (!booking) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);
      if (!canTransitionBookingStatus(booking.status as 'REQUESTED', 'CANCELLED')) {
        throw new DomainError(ERROR_CODES.INVALID_STATE_TRANSITION, `Cannot cancel booking in ${booking.status} state`);
      }

      await lockDeparturesForUpdate(tx, [booking.departureId]);
      await releaseBookingAllocationInTx(tx, booking);

      const updated = await tx.booking.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: reason.trim(),
          version: { increment: 1 },
        },
      });

      await tx.bookingEvent.create({
        data: {
          bookingId: id,
          actorType: 'STAFF',
          actorId: actor.userId,
          eventType: booking.status === 'REQUESTED' ? 'BOOKING_DECLINED' : 'BOOKING_CANCELLED_STAFF',
          message: reason.trim(),
        },
      });

      await enqueueOutboxJob(tx, {
        jobType: 'SEND_EMAIL',
        dedupeKey: `booking-staff-cancel:${id}:${updated.version}`,
        payload: {
          templateKey: 'booking_cancelled',
          toEmail: booking.leadEmail,
          bookingId: id,
          reference: booking.reference,
          leadName: booking.leadName,
          reason: reason.trim(),
        },
      });

      await this.audit.log({
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'booking.cancel_or_decline',
        targetType: 'Booking',
        targetId: id,
        requestId: actor.requestId,
        reason: reason.trim(),
        before: { status: booking.status },
        after: { status: 'CANCELLED' },
      });

      return updated;
    });
  }

  async addPrivateNote(bookingId: string, body: string, actor: { userId: string; role: string }) {
    if (!body.trim()) throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Note body is required');
    return this.prisma.bookingNote.create({
      data: { bookingId, authorId: actor.userId, body: body.trim() },
      include: { author: { select: { id: true, fullName: true } } },
    });
  }

  async assignStaff(bookingId: string, staffId: string | null, actor: { userId: string; role: string; requestId?: string }) {
    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { assignedStaffId: staffId },
    });
    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'booking.assign',
      targetType: 'Booking',
      targetId: bookingId,
      requestId: actor.requestId,
      after: { assignedStaffId: staffId },
    });
    return updated;
  }

  async resendNotification(bookingId: string, actor: { userId: string; role: string }) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { tour: true, departure: true },
    });
    if (!booking) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);

    const rawToken = randomOpaqueToken(32);
    await this.prisma.$transaction(async (tx) => {
      await tx.guestAccessToken.create({
        data: {
          bookingId,
          tokenHash: sha256Hex(rawToken),
          expiresAt: new Date(Date.now() + 30 * 86400_000),
        },
      });
      await enqueueOutboxJob(tx, {
        jobType: 'SEND_EMAIL',
        payload: {
          templateKey: booking.status === 'CONFIRMED' ? 'booking_confirmed' : 'booking_requested',
          toEmail: booking.leadEmail,
          bookingId,
          reference: booking.reference,
          leadName: booking.leadName,
          tourTitle: booking.tour.title,
          departureDate: booking.departure.departureDate,
          startTime: booking.departure.startTime,
          currency: booking.currency,
          grandTotalMinor: booking.grandTotalMinor,
          manageLink: `${getAppEnv().PUBLIC_SITE_URL}/booking/manage?token=${encodeURIComponent(rawToken)}`,
        },
      });
      await tx.bookingEvent.create({
        data: {
          bookingId,
          actorType: 'STAFF',
          actorId: actor.userId,
          eventType: 'NOTIFICATION_RESENT',
          message: 'Confirmation/summary email queued for resend',
        },
      });
    });
    return { queued: true };
  }

  /**
   * Idempotent staff QR check-in validation using unguessable opaque token hash.
   */
  async checkInByQrToken(rawQrToken: string, actor: { userId: string; role: string; requestId?: string }) {
    const hash = sha256Hex(rawQrToken.trim());
    const booking = await this.prisma.booking.findUnique({
      where: { qrCheckinTokenHash: hash },
      include: { tour: { select: { title: true } }, departure: { select: { departureDate: true, startTime: true } } },
    });
    if (!booking) {
      throw new DomainError(ERROR_CODES.NOT_FOUND, 'Invalid check-in QR code', HttpStatus.NOT_FOUND);
    }
    if (booking.status !== 'CONFIRMED' && booking.status !== 'COMPLETED') {
      throw new DomainError(ERROR_CODES.INVALID_STATE_TRANSITION, `Booking ${booking.reference} is not confirmed (${booking.status})`);
    }
    if (booking.checkedInAt) {
      return {
        alreadyCheckedIn: true,
        checkedInAt: booking.checkedInAt.toISOString(),
        reference: booking.reference,
        leadName: booking.leadName,
        seatsAllocated: booking.seatsAllocated,
      };
    }

    const now = new Date();
    await this.prisma.booking.update({
      where: { id: booking.id },
      data: { checkedInAt: now },
    });
    await this.prisma.bookingEvent.create({
      data: {
        bookingId: booking.id,
        actorType: 'STAFF',
        actorId: actor.userId,
        eventType: 'QR_CHECKIN',
        message: 'Traveler checked in via QR scan',
      },
    });
    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'booking.checkin_qr',
      targetType: 'Booking',
      targetId: booking.id,
      requestId: actor.requestId,
    });

    return {
      alreadyCheckedIn: false,
      checkedInAt: now.toISOString(),
      reference: booking.reference,
      leadName: booking.leadName,
      seatsAllocated: booking.seatsAllocated,
      tourTitle: booking.tour.title,
      departureDate: booking.departure.departureDate,
    };
  }

  async bulkAction(
    body: { bookingIds: string[]; action: 'APPROVE' | 'DECLINE'; reason?: string },
    actor: { userId: string; role: string; requestId?: string },
  ) {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const id of body.bookingIds) {
      try {
        if (body.action === 'APPROVE') {
          await this.approveBooking(id, actor);
        } else {
          await this.declineOrCancelBookingByStaff(id, body.reason || 'Bulk declined by staff', actor);
        }
        succeeded.push(id);
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : 'Action failed' });
      }
    }
    return { succeeded, failed };
  }

  async exportBookingsCsv(params: { status?: string; fromDate?: string; toDate?: string }): Promise<string> {
    const res = await this.listAdminBookings({ ...params, page: 1, limit: 100 });
    const header = [
      'Reference',
      'Status',
      'Payment Status',
      'Tour',
      'Departure Date (Africa/Cairo)',
      'Start Time',
      'Lead Name',
      'Lead Email',
      'Seats',
      'Currency',
      'Booked Total (Minor)',
      'Collected (Minor)',
      'Created At (UTC)',
    ];
    const rows = res.items.map((b) =>
      [
        b.reference,
        b.status,
        b.paymentStatus,
        b.tour.title,
        b.departure.departureDate,
        b.departure.startTime,
        b.leadName,
        b.leadEmail,
        b.seatsAllocated,
        b.currency,
        b.grandTotalMinor,
        b.collectedMinor,
        b.createdAt.toISOString(),
      ]
        .map(escapeCsvCell)
        .join(','),
    );
    return [header.map(escapeCsvCell).join(','), ...rows].join('\r\n');
  }
}
