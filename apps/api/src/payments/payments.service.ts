import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@sharm/database';
import {
  ERROR_CODES,
  computePaymentStatusFromLedger,
} from '@sharm/contracts';
import {
  enqueueOutboxJob,
  lockDeparturesForUpdate,
  remainingSeats,
  runWithSerializableRetry,
} from '@sharm/database';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { DomainError } from '../common/http-exception.filter';
import { getAppEnv } from '../common/env';
import { decryptSecretJson, encryptSecretJson, maskSecret } from '../common/crypto';
import { MediaService } from '../media/media.service';
import { PaymobAdapter, PaymobConfig } from './paymob.adapter';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly paymob: PaymobAdapter,
  ) {}

  async resolvePaymobConfig(): Promise<PaymobConfig> {
    const env = getAppEnv();
    const settings = await this.prisma.siteSetting.findUnique({ where: { key: 'singleton' } });
    const nonSecret = (settings?.paymobNonSecretConfigJson ?? {}) as {
      enabled?: boolean;
      sandboxVerified?: boolean;
      currency?: string;
      integrationId?: string;
      callbackUrl?: string;
      apiBaseUrl?: string;
    };

    let storedSecrets: { secretKey?: string; publicKey?: string; hmacSecret?: string } = {};
    if (settings?.encryptedPaymobSecretsJson) {
      try {
        storedSecrets = decryptSecretJson(
          settings.encryptedPaymobSecretsJson,
          env.CREDENTIALS_ENCRYPTION_KEY,
        );
      } catch {
        storedSecrets = {};
      }
    }

    return {
      apiBaseUrl: nonSecret.apiBaseUrl || env.PAYMOB_API_BASE_URL,
      secretKey: env.PAYMOB_SECRET_KEY || storedSecrets.secretKey || '',
      publicKey: env.PAYMOB_PUBLIC_KEY || storedSecrets.publicKey || '',
      hmacSecret: env.PAYMOB_HMAC_SECRET || storedSecrets.hmacSecret || '',
      integrationId: nonSecret.integrationId || env.PAYMOB_INTEGRATION_ID || '',
      currency: nonSecret.currency || env.PAYMOB_CURRENCY || settings?.baseCurrency || 'USD',
      callbackUrl: nonSecret.callbackUrl || `${env.PUBLIC_SITE_URL}/api/v1/webhooks/paymob`,
      enabled: Boolean(nonSecret.enabled ?? env.PAYMOB_ENABLED === 'true'),
      sandboxVerified: Boolean(nonSecret.sandboxVerified ?? env.PAYMOB_SANDBOX_VERIFIED === 'true'),
    };
  }

  async getProviderConfigStatus() {
    const cfg = await this.resolvePaymobConfig();
    const health = this.paymob.getHealthStatus(cfg);
    return {
      provider: 'PAYMOB',
      health,
      enabled: cfg.enabled,
      sandboxVerified: cfg.sandboxVerified,
      currency: cfg.currency,
      integrationId: cfg.integrationId,
      callbackUrl: cfg.callbackUrl,
      apiBaseUrl: cfg.apiBaseUrl,
      // Masked write-only status — NEVER return raw decrypted secrets to the browser!
      secretKeyMasked: maskSecret(cfg.secretKey),
      publicKeyMasked: maskSecret(cfg.publicKey),
      hmacSecretMasked: maskSecret(cfg.hmacSecret),
    };
  }

  async updatePaymobConfig(
    body: {
      enabled?: boolean;
      sandboxVerified?: boolean;
      currency?: string;
      integrationId?: string;
      callbackUrl?: string;
      apiBaseUrl?: string;
      secretKey?: string;
      publicKey?: string;
      hmacSecret?: string;
    },
    actor: { userId: string; role: string; requestId?: string },
  ) {
    const env = getAppEnv();
    const settings = await this.prisma.siteSetting.findUniqueOrThrow({ where: { key: 'singleton' } });
    const existingNonSecret = (settings.paymobNonSecretConfigJson ?? {}) as Record<string, unknown>;
    let existingSecrets: Record<string, string> = {};
    if (settings.encryptedPaymobSecretsJson) {
      try {
        existingSecrets = decryptSecretJson(settings.encryptedPaymobSecretsJson, env.CREDENTIALS_ENCRYPTION_KEY);
      } catch {
        existingSecrets = {};
      }
    }

    const nextSecrets = { ...existingSecrets };
    if (body.secretKey && body.secretKey.trim()) nextSecrets.secretKey = body.secretKey.trim();
    if (body.publicKey && body.publicKey.trim()) nextSecrets.publicKey = body.publicKey.trim();
    if (body.hmacSecret && body.hmacSecret.trim()) nextSecrets.hmacSecret = body.hmacSecret.trim();

    const nextNonSecret = {
      ...existingNonSecret,
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.sandboxVerified !== undefined ? { sandboxVerified: body.sandboxVerified } : {}),
      ...(body.currency !== undefined ? { currency: body.currency.toUpperCase() } : {}),
      ...(body.integrationId !== undefined ? { integrationId: body.integrationId.trim() } : {}),
      ...(body.callbackUrl !== undefined ? { callbackUrl: body.callbackUrl.trim() } : {}),
      ...(body.apiBaseUrl !== undefined ? { apiBaseUrl: body.apiBaseUrl.trim() } : {}),
    };

    const hasAnySecret = Object.keys(nextSecrets).length > 0;
    await this.prisma.siteSetting.update({
      where: { key: 'singleton' },
      data: {
        paymobNonSecretConfigJson: nextNonSecret as Prisma.InputJsonValue,
        ...(hasAnySecret
          ? { encryptedPaymobSecretsJson: encryptSecretJson(nextSecrets, env.CREDENTIALS_ENCRYPTION_KEY) }
          : {}),
        version: { increment: 1 },
      },
    });

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'payments.provider_config.update',
      targetType: 'SiteSetting',
      targetId: settings.id,
      requestId: actor.requestId,
      after: { enabled: nextNonSecret.enabled, sandboxVerified: nextNonSecret.sandboxVerified, currency: nextNonSecret.currency },
    });

    return this.getProviderConfigStatus();
  }

  /**
   * Guest submits a manual bank transfer proof upload.
   * Stored in private storage. NEVER marks the booking paid!
   */
  async submitBankTransferProof(params: {
    bookingId: string;
    fileBuffer: Buffer;
    originalFilename: string;
    submittedAmountMinor: number;
    submittedCurrency: string;
    transferReference: string;
    note?: string;
  }) {
    const booking = await this.prisma.booking.findUnique({ where: { id: params.bookingId } });
    if (!booking) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);
    if (!['REQUESTED', 'HELD', 'CONFIRMED'].includes(booking.status)) {
      throw new DomainError(ERROR_CODES.INVALID_STATE_TRANSITION, `Cannot upload payment proof for ${booking.status} booking`);
    }
    if (!Number.isInteger(params.submittedAmountMinor) || params.submittedAmountMinor <= 0) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Submitted transfer amount must be a positive integer');
    }
    if (params.submittedCurrency.toUpperCase() !== booking.currency) {
      throw new DomainError(
        ERROR_CODES.VALIDATION_ERROR,
        `Transfer currency (${params.submittedCurrency}) must match booking currency (${booking.currency})`,
      );
    }

    const uploaded = await this.media.uploadAsset({
      buffer: params.fileBuffer,
      originalFilename: params.originalFilename,
      visibility: 'PRIVATE',
      allowPdf: true,
      folder: 'payment-proofs',
      altText: `Payment proof for ${booking.reference}`,
    });

    const proof = await this.prisma.$transaction(async (tx) => {
      const created = await tx.paymentProof.create({
        data: {
          bookingId: booking.id,
          mediaAssetId: uploaded.id,
          submittedAmountMinor: params.submittedAmountMinor,
          submittedCurrency: params.submittedCurrency.toUpperCase(),
          transferReference: params.transferReference.trim().slice(0, 120),
          note: params.note?.trim().slice(0, 500) ?? null,
          status: 'PENDING_REVIEW',
        },
      });

      // Mark paymentStatus PENDING (never PAID!) if currently UNPAID/FAILED
      if (booking.paymentStatus === 'UNPAID' || booking.paymentStatus === 'FAILED') {
        await tx.booking.update({
          where: { id: booking.id },
          data: { paymentStatus: 'PENDING' },
        });
      }

      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          actorType: 'GUEST',
          eventType: 'PAYMENT_PROOF_UPLOADED',
          message: `Manual bank transfer proof uploaded (${created.transferReference}) — pending staff verification`,
        },
      });
      return created;
    });

    return proof;
  }

  private async recalculateBookingPaymentStatusInTx(tx: Prisma.TransactionClient, bookingId: string) {
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { ledgerEntries: true, paymentAttempts: true, paymentProofs: true },
    });
    const capturedMinor = booking.ledgerEntries
      .filter((e) => e.type === 'CAPTURE' || e.type === 'MANUAL_PAYMENT')
      .reduce((s, e) => s + e.amountMinor, 0);
    const refundedMinor = booking.ledgerEntries
      .filter((e) => e.type === 'REFUND')
      .reduce((s, e) => s + e.amountMinor, 0);
    const hasPending =
      booking.paymentAttempts.some((a) => a.status === 'PENDING') ||
      booking.paymentProofs.some((p) => p.status === 'PENDING_REVIEW');
    const hasFailed = booking.paymentAttempts.some((a) => a.status === 'FAILED');

    const nextPaymentStatus = computePaymentStatusFromLedger({
      totalMinor: booking.grandTotalMinor,
      capturedMinor,
      refundedMinor,
      hasPendingAttempt: hasPending,
      hasFailedAttempt: hasFailed,
    });

    await tx.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: nextPaymentStatus,
        dueLaterMinor: Math.max(0, booking.grandTotalMinor - capturedMinor),
      },
    });

    return { paymentStatus: nextPaymentStatus, capturedMinor, refundedMinor };
  }

  /**
   * Authorized staff verifies or rejects a manual bank transfer proof.
   * Blocks wrong currency / mismatched amounts unless explicitly recorded accurately.
   */
  async reviewPaymentProof(
    proofId: string,
    body: {
      decision: 'VERIFY' | 'REJECT';
      verifiedAmountMinor?: number;
      verifiedCurrency?: string;
      confirmBookingIfEligible?: boolean;
      reviewNote: string;
    },
    actor: { userId: string; role: string; requestId?: string },
  ) {
    if (!body.reviewNote || body.reviewNote.trim().length < 3) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Review note is required for audit records');
    }

    return runWithSerializableRetry(this.prisma, async (tx) => {
      const proof = await tx.paymentProof.findUnique({
        where: { id: proofId },
        include: { booking: true },
      });
      if (!proof) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Payment proof not found', HttpStatus.NOT_FOUND);
      if (proof.status !== 'PENDING_REVIEW') {
        throw new DomainError(ERROR_CODES.CONFLICT, 'Payment proof has already been reviewed', HttpStatus.CONFLICT);
      }

      if (body.decision === 'REJECT') {
        await tx.paymentProof.update({
          where: { id: proofId },
          data: {
            status: 'REJECTED',
            reviewedById: actor.userId,
            reviewedAt: new Date(),
            reviewNote: body.reviewNote.trim(),
          },
        });
        await tx.bookingEvent.create({
          data: {
            bookingId: proof.bookingId,
            actorType: 'STAFF',
            actorId: actor.userId,
            eventType: 'PAYMENT_PROOF_REJECTED',
            message: `Transfer proof rejected: ${body.reviewNote.trim()}`,
          },
        });
        const ledgerState = await this.recalculateBookingPaymentStatusInTx(tx, proof.bookingId);
        await this.audit.log({
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'payments.proof.reject',
          targetType: 'PaymentProof',
          targetId: proofId,
          requestId: actor.requestId,
          reason: body.reviewNote.trim(),
        });
        return { status: 'REJECTED', ...ledgerState };
      }

      // VERIFY path
      const amount = body.verifiedAmountMinor ?? proof.submittedAmountMinor;
      const currency = (body.verifiedCurrency ?? proof.submittedCurrency).toUpperCase();
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Verified amount must be a positive integer in minor units');
      }
      if (currency !== proof.booking.currency) {
        throw new DomainError(
          ERROR_CODES.VALIDATION_ERROR,
          `Currency mismatch: booking is in ${proof.booking.currency} but verified payment is ${currency}`,
        );
      }

      const existingLedger = await tx.paymentLedgerEntry.findMany({ where: { bookingId: proof.bookingId } });
      const alreadyCaptured = existingLedger
        .filter((e) => e.type === 'CAPTURE' || e.type === 'MANUAL_PAYMENT')
        .reduce((s, e) => s + e.amountMinor, 0);
      if (alreadyCaptured + amount > proof.booking.grandTotalMinor) {
        throw new DomainError(
          ERROR_CODES.CONFLICT,
          `Recording ${amount} would exceed booking grand total (${proof.booking.grandTotalMinor}); already collected ${alreadyCaptured}.`,
          HttpStatus.CONFLICT,
        );
      }

      await tx.paymentProof.update({
        where: { id: proofId },
        data: {
          status: 'VERIFIED',
          reviewedById: actor.userId,
          reviewedAt: new Date(),
          reviewNote: body.reviewNote.trim(),
        },
      });

      await tx.paymentLedgerEntry.create({
        data: {
          bookingId: proof.bookingId,
          type: 'MANUAL_PAYMENT',
          provider: 'BANK_TRANSFER',
          amountMinor: amount,
          currency,
          externalRef: proof.transferReference,
          reason: body.reviewNote.trim(),
          recordedById: actor.userId,
        },
      });

      const ledgerState = await this.recalculateBookingPaymentStatusInTx(tx, proof.bookingId);

      // Confirm booking ONLY following authoritative inventory locking rules!
      let bookingConfirmed = false;
      if (body.confirmBookingIfEligible && ['REQUESTED', 'HELD'].includes(proof.booking.status)) {
        const lockedMap = await lockDeparturesForUpdate(tx, [proof.booking.departureId]);
        const dep = lockedMap.get(proof.booking.departureId)!;
        if (proof.booking.allocationActive) {
          await tx.departure.update({
            where: { id: dep.id },
            data: {
              heldSeats: { decrement: proof.booking.seatsAllocated },
              bookedSeats: { increment: proof.booking.seatsAllocated },
            },
          });
        } else {
          if (remainingSeats(dep) < proof.booking.seatsAllocated) {
            throw new DomainError(ERROR_CODES.CAPACITY_EXCEEDED, 'Insufficient remaining seats to confirm booking', HttpStatus.CONFLICT);
          }
          await tx.departure.update({
            where: { id: dep.id },
            data: { bookedSeats: { increment: proof.booking.seatsAllocated } },
          });
        }
        await tx.booking.update({
          where: { id: proof.bookingId },
          data: { status: 'CONFIRMED', allocationActive: true, holdExpiresAt: null, decisionDeadlineAt: null },
        });
        bookingConfirmed = true;
      }

      await tx.bookingEvent.create({
        data: {
          bookingId: proof.bookingId,
          actorType: 'STAFF',
          actorId: actor.userId,
          eventType: 'MANUAL_PAYMENT_VERIFIED',
          message: `Verified ${amount} ${currency} (ref ${proof.transferReference})`,
        },
      });

      await this.audit.log({
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'payments.proof.verify',
        targetType: 'PaymentProof',
        targetId: proofId,
        requestId: actor.requestId,
        reason: body.reviewNote.trim(),
        after: { amountMinor: amount, currency, bookingConfirmed },
      });

      return { status: 'VERIFIED', bookingConfirmed, ...ledgerState };
    });
  }

  /**
   * Direct manual payment entry (e.g. cash/card at office or bank transfer without guest upload).
   */
  async recordManualPayment(
    body: {
      bookingId: string;
      amountMinor: number;
      currency: string;
      provider: 'PAY_LATER' | 'BANK_TRANSFER';
      externalRef: string;
      reason: string;
    },
    actor: { userId: string; role: string; requestId?: string },
  ) {
    if (!Number.isInteger(body.amountMinor) || body.amountMinor <= 0) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'amountMinor must be a positive integer');
    }
    if (!body.reason || body.reason.trim().length < 3) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Reason is required for manual payment ledger entries');
    }

    return runWithSerializableRetry(this.prisma, async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: body.bookingId }, include: { ledgerEntries: true } });
      if (!booking) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);
      if (body.currency.toUpperCase() !== booking.currency) {
        throw new DomainError(ERROR_CODES.VALIDATION_ERROR, `Currency mismatch: expected ${booking.currency}`);
      }
      const collected = booking.ledgerEntries
        .filter((e) => e.type === 'CAPTURE' || e.type === 'MANUAL_PAYMENT')
        .reduce((s, e) => s + e.amountMinor, 0);
      if (collected + body.amountMinor > booking.grandTotalMinor) {
        throw new DomainError(ERROR_CODES.CONFLICT, 'Manual payment exceeds remaining booking balance', HttpStatus.CONFLICT);
      }

      const entry = await tx.paymentLedgerEntry.create({
        data: {
          bookingId: booking.id,
          type: 'MANUAL_PAYMENT',
          provider: body.provider,
          amountMinor: body.amountMinor,
          currency: booking.currency,
          externalRef: body.externalRef.trim().slice(0, 120),
          reason: body.reason.trim(),
          recordedById: actor.userId,
        },
      });
      const state = await this.recalculateBookingPaymentStatusInTx(tx, booking.id);
      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          actorType: 'STAFF',
          actorId: actor.userId,
          eventType: 'MANUAL_PAYMENT_RECORDED',
          message: `Recorded ${body.amountMinor} ${booking.currency} (${body.externalRef})`,
        },
      });
      await this.audit.log({
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'payments.manual.record',
        targetType: 'Booking',
        targetId: booking.id,
        requestId: actor.requestId,
        reason: body.reason.trim(),
        after: { amountMinor: body.amountMinor, currency: booking.currency, externalRef: body.externalRef },
      });
      return { entry, ...state };
    });
  }

  /**
   * Starts a hosted Paymob online payment attempt for a booking (never stores card data).
   */
  async initiateOnlineCheckout(bookingId: string) {
    const cfg = await this.resolvePaymobConfig();
    const health = this.paymob.getHealthStatus(cfg);
    if (health.status !== 'READY') {
      throw new DomainError(ERROR_CODES.PROVIDER_NOT_CONFIGURED, `Online checkout unavailable: ${health.label}`);
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { tour: true, ledgerEntries: true },
    });
    if (!booking) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);
    if (booking.currency !== cfg.currency) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, `Online checkout supports ${cfg.currency}; booking is in ${booking.currency}`);
    }
    const collected = booking.ledgerEntries
      .filter((e) => e.type === 'CAPTURE' || e.type === 'MANUAL_PAYMENT')
      .reduce((s, e) => s + e.amountMinor, 0);
    const amountDue = Math.max(0, (booking.dueNowMinor > 0 ? booking.dueNowMinor : booking.grandTotalMinor) - collected);
    if (amountDue <= 0) {
      throw new DomainError(ERROR_CODES.CONFLICT, 'No online balance due for this booking', HttpStatus.CONFLICT);
    }

    const merchantOrderId = `${booking.reference}-${Date.now().toString(36)}`;
    const parts = booking.leadName.split(' ');
    const intention = await this.paymob.createCheckoutIntention(cfg, {
      amountMinor: amountDue,
      currency: booking.currency,
      merchantOrderId,
      billing: {
        firstName: parts[0] || 'Guest',
        lastName: parts.slice(1).join(' ') || 'Traveler',
        email: booking.leadEmail,
        phone: booking.leadPhone,
      },
      itemName: booking.tour.title,
      notificationUrl: cfg.callbackUrl,
      redirectionUrl: `${getAppEnv().PUBLIC_SITE_URL}/booking/manage?ref=${encodeURIComponent(booking.reference)}`,
    });

    const attempt = await this.prisma.paymentAttempt.create({
      data: {
        bookingId: booking.id,
        provider: 'PAYMOB',
        externalOrderId: merchantOrderId,
        externalIntentionId: intention.externalIntentionId,
        amountMinor: amountDue,
        currency: booking.currency,
        status: 'PENDING',
        checkoutUrl: intention.checkoutUrl,
      },
    });

    return { attemptId: attempt.id, checkoutUrl: intention.checkoutUrl, amountMinor: amountDue, currency: booking.currency };
  }

  /**
   * Authoritative signed Paymob webhook processor:
   * - Verifies HMAC-SHA512 signature before trusting anything
   * - Deduplicates by unique (provider, providerEventId)
   * - Never rolls a PAID booking backward on stale/out-of-order FAILED callbacks
   * - Handles late payment arriving AFTER hold expiration: atomically tries to reacquire seats;
   *   if capacity is gone, records OVERPAYMENT_EXCEPTION in immutable ledger, flags booking,
   *   creates RefundRequest + staff alert without silently overselling or dropping the payment!
   */
  async handlePaymobWebhook(payload: Record<string, unknown>, receivedHmac: string) {
    const cfg = await this.resolvePaymobConfig();
    const obj = (payload.obj ?? payload) as Record<string, unknown>;
    const providerEventId = String(obj.id ?? payload.id ?? '');
    if (!providerEventId) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Missing provider transaction ID');
    }

    const signatureValid = this.paymob.verifyWebhookHmac(cfg, payload, receivedHmac);
    if (!signatureValid) {
      await this.prisma.paymentWebhookEvent.create({
        data: {
          provider: 'PAYMOB',
          providerEventId: `invalid-hmac:${providerEventId}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
          signatureValid: false,
          payloadJson: payload as Prisma.InputJsonValue,
          processingStatus: 'FAILED',
          errorMessage: 'Invalid HMAC signature',
        },
      });
      throw new DomainError(ERROR_CODES.UNAUTHORIZED, 'Invalid webhook HMAC signature', HttpStatus.UNAUTHORIZED);
    }

    // Check duplicate webhook replay for verified signatures
    const existingEvent = await this.prisma.paymentWebhookEvent.findUnique({
      where: { provider_providerEventId: { provider: 'PAYMOB', providerEventId } },
    });
    if (existingEvent) {
      return { deduplicated: true, eventId: existingEvent.id, status: existingEvent.processingStatus };
    }

    const eventRecord = await this.prisma.paymentWebhookEvent.create({
      data: {
        provider: 'PAYMOB',
        providerEventId,
        signatureValid: true,
        payloadJson: payload as Prisma.InputJsonValue,
        processingStatus: 'RECEIVED',
        errorMessage: null,
      },
    });

    const order = (obj.order ?? {}) as Record<string, unknown>;
    const merchantOrderId = String(order.merchant_order_id ?? obj.special_reference ?? '');
    const success = obj.success === true || obj.success === 'true';
    const isRefunded = obj.is_refunded === true || obj.is_refunded === 'true';
    const amountMinor = Number(obj.amount_cents ?? 0);
    const currency = String(obj.currency ?? '').toUpperCase();

    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: {
        OR: [
          { externalOrderId: merchantOrderId },
          { externalIntentionId: merchantOrderId },
        ],
      },
    });

    if (!attempt) {
      await this.prisma.paymentWebhookEvent.update({
        where: { id: eventRecord.id },
        data: { processingStatus: 'IGNORED', errorMessage: 'No matching payment attempt', processedAt: new Date() },
      });
      return { ignored: true, reason: 'No matching payment attempt' };
    }

    const outcome = await runWithSerializableRetry(this.prisma, async (tx) => {
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: attempt.bookingId },
        include: { ledgerEntries: true },
      });

      // Prevent duplicate ledger settlement for the same providerEventId
      const existingLedger = await tx.paymentLedgerEntry.findFirst({
        where: { bookingId: booking.id, externalRef: `paymob:${providerEventId}` },
      });
      if (existingLedger) {
        return { action: 'DUPLICATE_SETTLEMENT_IGNORED' };
      }

      if (!success) {
        // Out-of-order FAILED callback must NEVER roll a PAID booking backward!
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: { status: attempt.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED' },
        });
        await this.recalculateBookingPaymentStatusInTx(tx, booking.id);
        await tx.bookingEvent.create({
          data: {
            bookingId: booking.id,
            actorType: 'WEBHOOK',
            eventType: 'PAYMENT_FAILED_CALLBACK',
            message: `Paymob transaction ${providerEventId} failed (existing paid status preserved if already paid)`,
          },
        });
        return { action: 'FAILED_RECORDED' };
      }

      if (isRefunded) {
        await tx.paymentLedgerEntry.create({
          data: {
            bookingId: booking.id,
            attemptId: attempt.id,
            type: 'REFUND',
            provider: 'PAYMOB',
            amountMinor,
            currency: currency || booking.currency,
            externalRef: `paymob:${providerEventId}`,
            reason: 'Provider refund webhook',
          },
        });
        await this.recalculateBookingPaymentStatusInTx(tx, booking.id);
        return { action: 'REFUND_RECORDED' };
      }

      // Successful payment callback
      if (currency && currency !== booking.currency) {
        throw new DomainError(ERROR_CODES.VALIDATION_ERROR, `Webhook currency ${currency} != booking currency ${booking.currency}`);
      }

      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: 'SUCCEEDED' },
      });

      const lockedMap = await lockDeparturesForUpdate(tx, [booking.departureId]);
      const dep = lockedMap.get(booking.departureId)!;

      // Case A: Booking already CONFIRMED -> just record capture
      if (booking.status === 'CONFIRMED') {
        await tx.paymentLedgerEntry.create({
          data: {
            bookingId: booking.id,
            attemptId: attempt.id,
            type: 'CAPTURE',
            provider: 'PAYMOB',
            amountMinor,
            currency: booking.currency,
            externalRef: `paymob:${providerEventId}`,
            reason: 'Paymob verified capture',
          },
        });
        await this.recalculateBookingPaymentStatusInTx(tx, booking.id);
        return { action: 'CAPTURED_ALREADY_CONFIRMED' };
      }

      // Case B: Booking HELD/REQUESTED with active hold -> convert heldSeats -> bookedSeats & confirm
      if (booking.allocationActive && (booking.status === 'HELD' || booking.status === 'REQUESTED')) {
        await tx.departure.update({
          where: { id: dep.id },
          data: {
            heldSeats: { decrement: booking.seatsAllocated },
            bookedSeats: { increment: booking.seatsAllocated },
          },
        });
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'CONFIRMED', holdExpiresAt: null, decisionDeadlineAt: null, version: { increment: 1 } },
        });
        await tx.paymentLedgerEntry.create({
          data: {
            bookingId: booking.id,
            attemptId: attempt.id,
            type: 'CAPTURE',
            provider: 'PAYMOB',
            amountMinor,
            currency: booking.currency,
            externalRef: `paymob:${providerEventId}`,
            reason: 'Paymob verified capture',
          },
        });
        await this.recalculateBookingPaymentStatusInTx(tx, booking.id);
        await tx.bookingEvent.create({
          data: {
            bookingId: booking.id,
            actorType: 'WEBHOOK',
            eventType: 'PAYMENT_CONFIRMED_BOOKING',
            message: `Verified Paymob payment ${providerEventId} confirmed booking`,
          },
        });
        return { action: 'CONFIRMED' };
      }

      // Case C: Late payment after hold EXPIRED or CANCELLED!
      // Try atomic seat reacquisition first; if sold out -> Paid-but-Unfulfilled exception + RefundRequest + alert!
      const rem = remainingSeats(dep);
      if (booking.status === 'EXPIRED' && dep.status === 'OPEN' && rem >= booking.seatsAllocated) {
        await tx.departure.update({
          where: { id: dep.id },
          data: { bookedSeats: { increment: booking.seatsAllocated } },
        });
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'CONFIRMED', allocationActive: true, holdExpiresAt: null, version: { increment: 1 } },
        });
        await tx.paymentLedgerEntry.create({
          data: {
            bookingId: booking.id,
            attemptId: attempt.id,
            type: 'CAPTURE',
            provider: 'PAYMOB',
            amountMinor,
            currency: booking.currency,
            externalRef: `paymob:${providerEventId}`,
            reason: 'Late Paymob capture — seats atomically reacquired',
          },
        });
        await this.recalculateBookingPaymentStatusInTx(tx, booking.id);
        await tx.bookingEvent.create({
          data: {
            bookingId: booking.id,
            actorType: 'WEBHOOK',
            eventType: 'LATE_PAYMENT_REACQUIRED',
            message: `Late Paymob payment ${providerEventId} arrived after expiry; seats atomically reacquired and booking confirmed`,
          },
        });
        return { action: 'LATE_PAYMENT_REACQUIRED_AND_CONFIRMED' };
      }

      // Capacity unavailable — DO NOT oversell, DO NOT discard money record!
      await tx.paymentLedgerEntry.create({
        data: {
          bookingId: booking.id,
          attemptId: attempt.id,
          type: 'OVERPAYMENT_EXCEPTION',
          provider: 'PAYMOB',
          amountMinor,
          currency: booking.currency,
          externalRef: `paymob:${providerEventId}`,
          reason: 'Paid-but-unfulfilled: payment arrived after expiry and capacity is no longer available',
        },
      });
      await tx.booking.update({
        where: { id: booking.id },
        data: { paidUnfulfilledFlag: true, version: { increment: 1 } },
      });
      const refundReq = await tx.refundRequest.create({
        data: {
          bookingId: booking.id,
          amountMinor,
          currency: booking.currency,
          reason: `Automatic refund queued: late Paymob payment (${providerEventId}) arrived after hold expiry with insufficient remaining capacity`,
          status: 'PENDING',
          requestedByType: 'SYSTEM',
        },
      });
      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          actorType: 'WEBHOOK',
          eventType: 'PAID_BUT_UNFULFILLED_EXCEPTION',
          message: `CRITICAL: Late payment ${amountMinor} ${booking.currency} captured without capacity; RefundRequest ${refundReq.id} queued for staff`,
        },
      });
      await enqueueOutboxJob(tx, {
        jobType: 'SEND_EMAIL',
        dedupeKey: `paid-unfulfilled:${booking.id}:${providerEventId}`,
        payload: {
          templateKey: 'staff_paid_unfulfilled_alert',
          toEmail: (await tx.siteSetting.findUnique({ where: { key: 'singleton' } }))?.contactEmail || getAppEnv().EMAIL_FROM,
          bookingId: booking.id,
          reference: booking.reference,
          amountMinor,
          currency: booking.currency,
          refundRequestId: refundReq.id,
        },
      });

      return { action: 'PAID_BUT_UNFULFILLED_REFUND_QUEUED', refundRequestId: refundReq.id };
    });

    await this.prisma.paymentWebhookEvent.update({
      where: { id: eventRecord.id },
      data: { processingStatus: 'PROCESSED', processedAt: new Date() },
    });

    return { ok: true, eventId: eventRecord.id, ...outcome };
  }

  /**
   * Process a full or partial refund (requires payments:refund permission).
   */
  async processRefund(
    body: {
      bookingId: string;
      refundRequestId?: string;
      amountMinor: number;
      reason: string;
      externalRefundRef?: string;
    },
    actor: { userId: string; role: string; requestId?: string },
  ) {
    if (!Number.isInteger(body.amountMinor) || body.amountMinor <= 0) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Refund amount must be a positive integer');
    }
    if (!body.reason || body.reason.trim().length < 4) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Refund reason is required');
    }

    return runWithSerializableRetry(this.prisma, async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: body.bookingId },
        include: { ledgerEntries: true },
      });
      if (!booking) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);

      const capturedMinor = booking.ledgerEntries
        .filter((e) => e.type === 'CAPTURE' || e.type === 'MANUAL_PAYMENT' || e.type === 'OVERPAYMENT_EXCEPTION')
        .reduce((s, e) => s + e.amountMinor, 0);
      const alreadyRefunded = booking.ledgerEntries
        .filter((e) => e.type === 'REFUND')
        .reduce((s, e) => s + e.amountMinor, 0);
      const maxRefundable = Math.max(0, capturedMinor - alreadyRefunded);

      if (body.amountMinor > maxRefundable) {
        throw new DomainError(
          ERROR_CODES.CONFLICT,
          `Refund amount (${body.amountMinor}) exceeds refundable collected balance (${maxRefundable})`,
          HttpStatus.CONFLICT,
        );
      }

      const ledger = await tx.paymentLedgerEntry.create({
        data: {
          bookingId: booking.id,
          type: 'REFUND',
          provider: booking.paymentChoice === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'PAY_LATER',
          amountMinor: body.amountMinor,
          currency: booking.currency,
          externalRef: body.externalRefundRef?.trim() || `REF-${Date.now().toString(36).toUpperCase()}`,
          reason: body.reason.trim(),
          recordedById: actor.userId,
        },
      });

      if (body.refundRequestId) {
        await tx.refundRequest.update({
          where: { id: body.refundRequestId },
          data: {
            status: 'PROCESSED',
            processedById: actor.userId,
            processedAt: new Date(),
            externalRefundRef: ledger.externalRef,
          },
        });
      }

      const state = await this.recalculateBookingPaymentStatusInTx(tx, booking.id);
      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          actorType: 'STAFF',
          actorId: actor.userId,
          eventType: 'REFUND_PROCESSED',
          message: `Processed refund of ${body.amountMinor} ${booking.currency}: ${body.reason.trim()}`,
        },
      });

      await this.audit.log({
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'payments.refund.process',
        targetType: 'Booking',
        targetId: booking.id,
        requestId: actor.requestId,
        reason: body.reason.trim(),
        after: { amountMinor: body.amountMinor, currency: booking.currency, nextPaymentStatus: state.paymentStatus },
      });

      return { ledger, ...state };
    });
  }

  async listAdminPaymentsDashboard() {
    const [proofs, ledger, webhooks, refunds, attempts, providerStatus] = await Promise.all([
      this.prisma.paymentProof.findMany({
        include: { booking: { select: { id: true, reference: true, leadName: true, grandTotalMinor: true, currency: true, status: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.paymentLedgerEntry.findMany({
        include: {
          booking: { select: { id: true, reference: true, leadName: true } },
          recordedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 150,
      }),
      this.prisma.paymentWebhookEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.refundRequest.findMany({
        include: { booking: { select: { id: true, reference: true, leadName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.paymentAttempt.findMany({
        include: { booking: { select: { id: true, reference: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.getProviderConfigStatus(),
    ]);

    return { proofs, ledger, webhooks, refunds, attempts, providerStatus };
  }
}
