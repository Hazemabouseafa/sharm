import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@sharm/database';
import {
  AgeBandRule,
  ERROR_CODES,
  TourFilterQuery,
  isPastBookingCutoff,
  todayInCairo,
  validateDisjointAgeBands,
} from '@sharm/contracts';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { DomainError } from '../common/http-exception.filter';
import { sanitizeEditorialHtml } from '../common/sanitize';
import { enqueueOutboxJob, extractTranslatableStrings } from '@sharm/database';

function computeStartingPriceMinor(tour: {
  pricingMode: string;
  privateGroupPriceMinor: number | null;
  ageBandsJson: unknown;
}): number {
  if (tour.pricingMode === 'PRIVATE_GROUP') {
    return tour.privateGroupPriceMinor ?? 0;
  }
  const bands = Array.isArray(tour.ageBandsJson) ? (tour.ageBandsJson as AgeBandRule[]) : [];
  const adult = bands.find((b) => b.code === 'ADULT');
  return adult?.priceMinor ?? 0;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listPublicDestinations() {
    const dests = await this.prisma.destination.findMany({
      where: { isVisible: true },
      orderBy: { displayOrder: 'asc' },
      include: {
        _count: { select: { tours: { where: { status: 'PUBLISHED' } } } },
      },
    });
    return dests.map((d) => ({
      id: d.id,
      slug: d.slug,
      name: d.name,
      tagline: d.tagline,
      heroSubtitle: d.heroSubtitle,
      description: d.description,
      heroImageUrl: d.heroImageUrl,
      heroImageAlt: d.heroImageAlt,
      displayOrder: d.displayOrder,
      publishedTourCount: d._count.tours,
    }));
  }

  async getPublicDestinationBySlug(slug: string) {
    const dest = await this.prisma.destination.findFirst({
      where: { slug, isVisible: true },
    });
    if (!dest) {
      throw new DomainError(ERROR_CODES.NOT_FOUND, 'Destination not found', HttpStatus.NOT_FOUND);
    }
    const tours = await this.listPublicTours({ destination: slug, sort: 'featured', page: 1, limit: 24 });
    return {
      destination: dest,
      tours: tours.items,
    };
  }

  async listPublicCategories() {
    return this.prisma.category.findMany({ orderBy: { displayOrder: 'asc' } });
  }

  async listPublicTours(query: TourFilterQuery) {
    const where: Prisma.TourWhereInput = { status: 'PUBLISHED' };
    if (query.destination) {
      where.destination = { slug: query.destination, isVisible: true };
    }
    if (query.category) {
      where.categories = { some: { category: { slug: query.category } } };
    }
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { shortDescription: { contains: query.q, mode: 'insensitive' } },
        { destination: { name: { contains: query.q, mode: 'insensitive' } } },
      ];
    }
    if (query.duration === 'half-day') {
      where.durationHours = { lte: 5 };
    } else if (query.duration === 'full-day') {
      where.durationHours = { gte: 6, lte: 12 };
    } else if (query.duration === '2-days') {
      where.durationHours = { gt: 12, lte: 48 };
    } else if (query.duration === '3-plus-days') {
      where.durationHours = { gt: 48 };
    }

    const todayStr = todayInCairo().toString();
    const allMatching = await this.prisma.tour.findMany({
      where,
      include: {
        destination: { select: { id: true, slug: true, name: true } },
        categories: { include: { category: { select: { slug: true, name: true } } } },
        departures: {
          where: {
            status: 'OPEN',
            departureDate: query.date ? query.date : { gte: todayStr },
          },
          orderBy: { departureDate: 'asc' },
        },
      },
      orderBy: [{ featured: 'desc' }, { displayOrder: 'asc' }, { title: 'asc' }],
    });

    const now = new Date();
    let enriched = allMatching
      .map((t) => {
        const bookableDepartures = t.departures.filter(
          (d) =>
            d.capacity - d.bookedSeats - d.heldSeats > 0 &&
            !isPastBookingCutoff({
              departureDate: d.departureDate,
              startTime: d.startTime,
              cutoffHours: d.cutoffHours,
              nowUtc: now,
              timeZone: d.timezone,
            }),
        );
        const startingPriceMinor = computeStartingPriceMinor(t);
        return {
          id: t.id,
          slug: t.slug,
          title: t.title,
          shortDescription: t.shortDescription,
          destination: t.destination,
          categories: t.categories.map((c) => c.category),
          durationLabel: t.durationLabel,
          durationHours: t.durationHours,
          pricingMode: t.pricingMode,
          currency: t.currency,
          startingPriceMinor,
          featured: t.featured,
          primaryImageUrl: t.primaryImageUrl,
          primaryImageAlt: t.primaryImageAlt,
          hasBookableAvailability: bookableDepartures.length > 0,
          nextAvailableDate: bookableDepartures[0]?.departureDate ?? null,
          availableSeatsOnRequestedDate: query.date
            ? bookableDepartures.reduce((sum, d) => sum + (d.capacity - d.bookedSeats - d.heldSeats), 0)
            : null,
        };
      })
      .filter((item) => {
        // Date filter uses REAL bookable departures, never text matching!
        if (query.date && !item.hasBookableAvailability) return false;
        if (query.minPrice !== undefined && item.startingPriceMinor < query.minPrice * 100) return false;
        if (query.maxPrice !== undefined && item.startingPriceMinor > query.maxPrice * 100) return false;
        return true;
      });

    if (query.sort === 'price_asc') {
      enriched.sort((a, b) => a.startingPriceMinor - b.startingPriceMinor);
    } else if (query.sort === 'price_desc') {
      enriched.sort((a, b) => b.startingPriceMinor - a.startingPriceMinor);
    } else if (query.sort === 'duration_asc') {
      enriched.sort((a, b) => a.durationHours - b.durationHours);
    } else if (query.sort === 'duration_desc') {
      enriched.sort((a, b) => b.durationHours - a.durationHours);
    }

    const total = enriched.length;
    const offset = (query.page - 1) * query.limit;
    const items = enriched.slice(offset, offset + query.limit);

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async getPublicTourBySlug(slug: string, allowDraftPreview = false) {
    const tour = await this.prisma.tour.findUnique({
      where: { slug },
      include: {
        destination: true,
        categories: { include: { category: true } },
        addons: { include: { addon: true } },
        pickupZones: { include: { pickupZone: true } },
        policy: { include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } },
        departures: {
          where: { departureDate: { gte: todayInCairo().toString() } },
          orderBy: [{ departureDate: 'asc' }, { startTime: 'asc' }],
          take: 90,
        },
      },
    });

    if (!tour || (!allowDraftPreview && tour.status !== 'PUBLISHED')) {
      throw new DomainError(ERROR_CODES.NOT_FOUND, 'Tour not found', HttpStatus.NOT_FOUND);
    }

    const now = new Date();
    const departures = tour.departures.map((d) => {
      const remainingSeats = Math.max(0, d.capacity - d.bookedSeats - d.heldSeats);
      const pastCutoff = isPastBookingCutoff({
        departureDate: d.departureDate,
        startTime: d.startTime,
        cutoffHours: d.cutoffHours,
        nowUtc: now,
        timeZone: d.timezone,
      });
      return {
        id: d.id,
        departureDate: d.departureDate,
        startTime: d.startTime,
        timezone: d.timezone,
        capacity: d.capacity,
        remainingSeats,
        status: d.status,
        bookable: d.status === 'OPEN' && remainingSeats > 0 && !pastCutoff,
        unavailableReason:
          d.status !== 'OPEN'
            ? 'Closed'
            : remainingSeats <= 0
              ? 'Sold out'
              : pastCutoff
                ? 'Booking cutoff passed'
                : null,
        adultPriceOverrideMinor: d.adultPriceOverrideMinor,
        childPriceOverrideMinor: d.childPriceOverrideMinor,
        infantPriceOverrideMinor: d.infantPriceOverrideMinor,
        privateGroupPriceOverrideMinor: d.privateGroupPriceOverrideMinor,
        pickupTimeNote: d.pickupTimeNote,
      };
    });

    const related = await this.prisma.tour.findMany({
      where: {
        status: 'PUBLISHED',
        destinationId: tour.destinationId,
        id: { not: tour.id },
      },
      take: 3,
      orderBy: [{ featured: 'desc' }, { displayOrder: 'asc' }],
      include: { destination: { select: { slug: true, name: true } } },
    });

    const activePolicyVersion = tour.policy?.versions[0] ?? null;
    const settings = await this.prisma.siteSetting.findUnique({ where: { key: 'singleton' } });

    return {
      tour: {
        id: tour.id,
        slug: tour.slug,
        status: tour.status,
        title: tour.title,
        destination: {
          id: tour.destination.id,
          slug: tour.destination.slug,
          name: tour.destination.name,
        },
        shortDescription: tour.shortDescription,
        descriptionHtml: tour.descriptionHtml,
        highlights: tour.highlightsJson,
        durationLabel: tour.durationLabel,
        durationHours: tour.durationHours,
        guideLanguages: tour.guideLanguagesJson,
        meetingPoint: tour.meetingPoint,
        minAge: tour.minAge,
        accessibilityInfo: tour.accessibilityInfo,
        itinerary: tour.itineraryJson,
        inclusions: tour.inclusionsJson,
        exclusions: tour.exclusionsJson,
        whatToBring: tour.whatToBringJson,
        faq: tour.faqJson,
        pricingMode: tour.pricingMode,
        currency: tour.currency,
        pricingVersion: tour.pricingVersion,
        startingPriceMinor: computeStartingPriceMinor(tour),
        privateGroupPriceMinor: tour.privateGroupPriceMinor,
        minAdults: tour.minAdults,
        minPartySize: tour.minPartySize,
        maxPartySize: tour.maxPartySize,
        ageBands: tour.ageBandsJson,
        taxIncluded: tour.taxIncluded,
        taxRateBps: tour.taxRateBps,
        serviceFeeIncluded: tour.serviceFeeIncluded,
        serviceFeeBps: tour.serviceFeeBps,
        depositEnabled: tour.depositEnabled,
        depositPercentBps: tour.depositPercentBps,
        instantConfirmPayLater: tour.instantConfirmPayLater,
        primaryImageUrl: tour.primaryImageUrl,
        primaryImageAlt: tour.primaryImageAlt,
        gallery: tour.galleryJson,
        categories: tour.categories.map((c) => c.category),
        addons: tour.addons.filter((a) => a.addon.isActive).map((a) => a.addon),
        pickupZones: tour.pickupZones.filter((p) => p.pickupZone.isActive).map((p) => p.pickupZone),
        policy: tour.policy
          ? {
              id: tour.policy.id,
              name: tour.policy.name,
              summary: tour.policy.summary,
              activeVersion: activePolicyVersion,
            }
          : null,
        seoTitle: tour.seoTitle,
        seoDescription: tour.seoDescription,
      },
      departures,
      relatedTours: related.map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        destination: r.destination,
        durationLabel: r.durationLabel,
        currency: r.currency,
        startingPriceMinor: computeStartingPriceMinor(r),
        primaryImageUrl: r.primaryImageUrl,
        primaryImageAlt: r.primaryImageAlt,
      })),
      paymentOptions: {
        payLaterEnabled: settings?.payLaterEnabled ?? true,
        bankTransferEnabled: settings?.bankTransferEnabled ?? false,
        onlineEnabled: Boolean(
          (settings?.paymobNonSecretConfigJson as { enabled?: boolean; sandboxVerified?: boolean } | null)?.enabled &&
            (settings?.paymobNonSecretConfigJson as { enabled?: boolean; sandboxVerified?: boolean } | null)?.sandboxVerified &&
            (process.env.PAYMOB_SECRET_KEY || settings?.encryptedPaymobSecretsJson),
        ),
        manualRequestHoldHours: settings?.manualRequestHoldHours ?? 24,
        onlineCheckoutHoldMinutes: settings?.onlineCheckoutHoldMinutes ?? 15,
      },
    };
  }

  // ==================== ADMIN TOURS ====================

  async listAdminTours(params: { q?: string; status?: string; destinationId?: string }) {
    const where: Prisma.TourWhereInput = {};
    if (params.status && ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(params.status)) {
      where.status = params.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    }
    if (params.destinationId) where.destinationId = params.destinationId;
    if (params.q) {
      where.OR = [
        { title: { contains: params.q, mode: 'insensitive' } },
        { slug: { contains: params.q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.tour.findMany({
      where,
      include: {
        destination: { select: { id: true, slug: true, name: true } },
        policy: { select: { id: true, name: true } },
        _count: { select: { departures: true, bookings: true } },
      },
      orderBy: [{ displayOrder: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  async getAdminTour(id: string) {
    const tour = await this.prisma.tour.findUnique({
      where: { id },
      include: {
        destination: true,
        policy: true,
        categories: true,
        addons: true,
        pickupZones: true,
        recurringSchedules: true,
        _count: { select: { departures: true, bookings: true } },
      },
    });
    if (!tour) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Tour not found', HttpStatus.NOT_FOUND);
    return tour;
  }

  async createTour(data: Record<string, unknown>, actor: { userId: string; role: string; requestId?: string }) {
    const slug = String(data.slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug || !data.title || !data.destinationId) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'slug, title, and destinationId are required');
    }

    const ageBands = (Array.isArray(data.ageBands) ? data.ageBands : [
      { code: 'ADULT', label: 'Adult (12+ yrs)', minAge: 12, maxAge: null, priceMinor: 5000, consumesSeat: true },
    ]) as AgeBandRule[];
    validateDisjointAgeBands(ageBands);

    const existing = await this.prisma.tour.findUnique({ where: { slug } });
    if (existing) {
      throw new DomainError(ERROR_CODES.CONFLICT, `Tour slug "${slug}" already exists`, HttpStatus.CONFLICT);
    }

    const settings = await this.prisma.siteSetting.findUnique({ where: { key: 'singleton' } });
    const tour = await this.prisma.tour.create({
      data: {
        slug,
        status: 'DRAFT',
        title: String(data.title).trim(),
        destinationId: String(data.destinationId),
        shortDescription: String(data.shortDescription || '').trim(),
        descriptionHtml: sanitizeEditorialHtml(String(data.descriptionHtml || '<p>Tour description pending owner review.</p>')),
        highlightsJson: (data.highlights ?? []) as Prisma.InputJsonValue,
        durationLabel: String(data.durationLabel || 'Full Day'),
        durationHours: Number(data.durationHours || 8),
        guideLanguagesJson: (data.guideLanguages ?? ['English']) as Prisma.InputJsonValue,
        meetingPoint: String(data.meetingPoint || ''),
        minAge: Number(data.minAge || 0),
        accessibilityInfo: String(data.accessibilityInfo || ''),
        itineraryJson: (data.itinerary ?? []) as Prisma.InputJsonValue,
        inclusionsJson: (data.inclusions ?? []) as Prisma.InputJsonValue,
        exclusionsJson: (data.exclusions ?? []) as Prisma.InputJsonValue,
        whatToBringJson: (data.whatToBring ?? []) as Prisma.InputJsonValue,
        faqJson: (data.faq ?? []) as Prisma.InputJsonValue,
        pricingMode: data.pricingMode === 'PRIVATE_GROUP' ? 'PRIVATE_GROUP' : 'PER_PERSON',
        currency: String(data.currency || settings?.baseCurrency || 'USD').toUpperCase(),
        privateGroupPriceMinor:
          data.privateGroupPriceMinor !== undefined && data.privateGroupPriceMinor !== null
            ? Number(data.privateGroupPriceMinor)
            : null,
        minAdults: Number(data.minAdults ?? 1),
        minPartySize: Number(data.minPartySize ?? 1),
        maxPartySize: Number(data.maxPartySize ?? 16),
        ageBandsJson: ageBands as unknown as Prisma.InputJsonValue,
        taxIncluded: data.taxIncluded !== undefined ? Boolean(data.taxIncluded) : true,
        taxRateBps: Number(data.taxRateBps ?? 0),
        serviceFeeIncluded: data.serviceFeeIncluded !== undefined ? Boolean(data.serviceFeeIncluded) : true,
        serviceFeeBps: Number(data.serviceFeeBps ?? 0),
        depositEnabled: Boolean(data.depositEnabled ?? false),
        depositPercentBps: Number(data.depositPercentBps ?? 0),
        instantConfirmPayLater: Boolean(data.instantConfirmPayLater ?? false),
        defaultCapacity: Number(data.defaultCapacity ?? 16),
        defaultCutoffHours: Number(data.defaultCutoffHours ?? 12),
        policyId: data.policyId ? String(data.policyId) : null,
        featured: Boolean(data.featured ?? false),
        displayOrder: Number(data.displayOrder ?? 100),
        primaryImageUrl: String(data.primaryImageUrl || '/media/sharm-ras-mohamed-white-island.webp'),
        primaryImageAlt: String(data.primaryImageAlt || `${String(data.title)} scenic photograph`),
        galleryJson: (data.gallery ?? []) as Prisma.InputJsonValue,
        seoTitle: data.seoTitle ? String(data.seoTitle) : null,
        seoDescription: data.seoDescription ? String(data.seoDescription) : null,
      },
    });

    if (Array.isArray(data.categoryIds)) {
      await this.prisma.tourCategory.createMany({
        data: (data.categoryIds as string[]).map((categoryId) => ({ tourId: tour.id, categoryId })),
        skipDuplicates: true,
      });
    }
    if (Array.isArray(data.addonIds)) {
      await this.prisma.tourAddon.createMany({
        data: (data.addonIds as string[]).map((addonId) => ({ tourId: tour.id, addonId })),
        skipDuplicates: true,
      });
    }
    if (Array.isArray(data.pickupZoneIds)) {
      await this.prisma.tourPickupZone.createMany({
        data: (data.pickupZoneIds as string[]).map((pickupZoneId) => ({ tourId: tour.id, pickupZoneId })),
        skipDuplicates: true,
      });
    }

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'tour.create',
      targetType: 'Tour',
      targetId: tour.id,
      requestId: actor.requestId,
      after: { slug: tour.slug, title: tour.title, status: tour.status },
    });

    const tourTexts = extractTranslatableStrings(tour);
    if (tourTexts.length > 0) {
      await enqueueOutboxJob(this.prisma, {
        jobType: 'PRETRANSLATE_CONTENT',
        dedupeKey: `pretranslate:tour:${tour.id}:v${tour.version}`,
        payload: { source: `tour:${tour.slug}`, texts: tourTexts },
      });
    }

    return tour;
  }

  async updateTour(
    id: string,
    data: Record<string, unknown>,
    actor: { userId: string; role: string; requestId?: string },
  ) {
    const existing = await this.prisma.tour.findUnique({ where: { id } });
    if (!existing) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Tour not found', HttpStatus.NOT_FOUND);

    if (data.version !== undefined && Number(data.version) !== existing.version) {
      throw new DomainError(
        ERROR_CODES.VERSION_CONFLICT,
        'This tour was updated by another editor. Reload before saving.',
        HttpStatus.CONFLICT,
      );
    }

    let pricingVersionBump = 0;
    if (data.ageBands !== undefined) {
      validateDisjointAgeBands(data.ageBands as AgeBandRule[]);
      pricingVersionBump = 1;
    }
    if (
      data.privateGroupPriceMinor !== undefined ||
      data.currency !== undefined ||
      data.taxRateBps !== undefined ||
      data.taxIncluded !== undefined ||
      data.serviceFeeBps !== undefined ||
      data.depositPercentBps !== undefined
    ) {
      pricingVersionBump = 1;
    }

    const oldSlug = existing.slug;
    const nextSlug =
      data.slug !== undefined
        ? String(data.slug).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '')
        : existing.slug;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.tour.update({
        where: { id },
        data: {
          ...(nextSlug !== existing.slug ? { slug: nextSlug } : {}),
          ...(data.title !== undefined ? { title: String(data.title).trim() } : {}),
          ...(data.destinationId !== undefined ? { destinationId: String(data.destinationId) } : {}),
          ...(data.shortDescription !== undefined ? { shortDescription: String(data.shortDescription).trim() } : {}),
          ...(data.descriptionHtml !== undefined ? { descriptionHtml: sanitizeEditorialHtml(String(data.descriptionHtml)) } : {}),
          ...(data.highlights !== undefined ? { highlightsJson: data.highlights as Prisma.InputJsonValue } : {}),
          ...(data.durationLabel !== undefined ? { durationLabel: String(data.durationLabel) } : {}),
          ...(data.durationHours !== undefined ? { durationHours: Number(data.durationHours) } : {}),
          ...(data.guideLanguages !== undefined ? { guideLanguagesJson: data.guideLanguages as Prisma.InputJsonValue } : {}),
          ...(data.meetingPoint !== undefined ? { meetingPoint: String(data.meetingPoint) } : {}),
          ...(data.minAge !== undefined ? { minAge: Number(data.minAge) } : {}),
          ...(data.accessibilityInfo !== undefined ? { accessibilityInfo: String(data.accessibilityInfo) } : {}),
          ...(data.itinerary !== undefined ? { itineraryJson: data.itinerary as Prisma.InputJsonValue } : {}),
          ...(data.inclusions !== undefined ? { inclusionsJson: data.inclusions as Prisma.InputJsonValue } : {}),
          ...(data.exclusions !== undefined ? { exclusionsJson: data.exclusions as Prisma.InputJsonValue } : {}),
          ...(data.whatToBring !== undefined ? { whatToBringJson: data.whatToBring as Prisma.InputJsonValue } : {}),
          ...(data.faq !== undefined ? { faqJson: data.faq as Prisma.InputJsonValue } : {}),
          ...(data.pricingMode !== undefined ? { pricingMode: data.pricingMode === 'PRIVATE_GROUP' ? 'PRIVATE_GROUP' : 'PER_PERSON' } : {}),
          ...(data.currency !== undefined ? { currency: String(data.currency).toUpperCase() } : {}),
          ...(data.privateGroupPriceMinor !== undefined ? { privateGroupPriceMinor: data.privateGroupPriceMinor === null ? null : Number(data.privateGroupPriceMinor) } : {}),
          ...(data.minAdults !== undefined ? { minAdults: Number(data.minAdults) } : {}),
          ...(data.minPartySize !== undefined ? { minPartySize: Number(data.minPartySize) } : {}),
          ...(data.maxPartySize !== undefined ? { maxPartySize: Number(data.maxPartySize) } : {}),
          ...(data.ageBands !== undefined ? { ageBandsJson: data.ageBands as Prisma.InputJsonValue } : {}),
          ...(data.taxIncluded !== undefined ? { taxIncluded: Boolean(data.taxIncluded) } : {}),
          ...(data.taxRateBps !== undefined ? { taxRateBps: Number(data.taxRateBps) } : {}),
          ...(data.serviceFeeIncluded !== undefined ? { serviceFeeIncluded: Boolean(data.serviceFeeIncluded) } : {}),
          ...(data.serviceFeeBps !== undefined ? { serviceFeeBps: Number(data.serviceFeeBps) } : {}),
          ...(data.depositEnabled !== undefined ? { depositEnabled: Boolean(data.depositEnabled) } : {}),
          ...(data.depositPercentBps !== undefined ? { depositPercentBps: Number(data.depositPercentBps) } : {}),
          ...(data.instantConfirmPayLater !== undefined ? { instantConfirmPayLater: Boolean(data.instantConfirmPayLater) } : {}),
          ...(data.defaultCapacity !== undefined ? { defaultCapacity: Number(data.defaultCapacity) } : {}),
          ...(data.defaultCutoffHours !== undefined ? { defaultCutoffHours: Number(data.defaultCutoffHours) } : {}),
          ...(data.policyId !== undefined ? { policyId: data.policyId ? String(data.policyId) : null } : {}),
          ...(data.featured !== undefined ? { featured: Boolean(data.featured) } : {}),
          ...(data.displayOrder !== undefined ? { displayOrder: Number(data.displayOrder) } : {}),
          ...(data.primaryImageUrl !== undefined ? { primaryImageUrl: String(data.primaryImageUrl) } : {}),
          ...(data.primaryImageAlt !== undefined ? { primaryImageAlt: String(data.primaryImageAlt) } : {}),
          ...(data.gallery !== undefined ? { galleryJson: data.gallery as Prisma.InputJsonValue } : {}),
          ...(data.seoTitle !== undefined ? { seoTitle: data.seoTitle ? String(data.seoTitle) : null } : {}),
          ...(data.seoDescription !== undefined ? { seoDescription: data.seoDescription ? String(data.seoDescription) : null } : {}),
          pricingVersion: { increment: pricingVersionBump },
          version: { increment: 1 },
        },
      });

      if (nextSlug !== oldSlug && existing.status === 'PUBLISHED') {
        await tx.slugRedirect.upsert({
          where: { fromPath: `/tours/${oldSlug}` },
          update: { toPath: `/tours/${nextSlug}` },
          create: { fromPath: `/tours/${oldSlug}`, toPath: `/tours/${nextSlug}`, statusCode: 301 },
        });
      }

      if (Array.isArray(data.categoryIds)) {
        await tx.tourCategory.deleteMany({ where: { tourId: id } });
        await tx.tourCategory.createMany({
          data: (data.categoryIds as string[]).map((categoryId) => ({ tourId: id, categoryId })),
          skipDuplicates: true,
        });
      }
      if (Array.isArray(data.addonIds)) {
        await tx.tourAddon.deleteMany({ where: { tourId: id } });
        await tx.tourAddon.createMany({
          data: (data.addonIds as string[]).map((addonId) => ({ tourId: id, addonId })),
          skipDuplicates: true,
        });
      }
      if (Array.isArray(data.pickupZoneIds)) {
        await tx.tourPickupZone.deleteMany({ where: { tourId: id } });
        await tx.tourPickupZone.createMany({
          data: (data.pickupZoneIds as string[]).map((pickupZoneId) => ({ tourId: id, pickupZoneId })),
          skipDuplicates: true,
        });
      }

      if (row.status === 'PUBLISHED') {
        await enqueueOutboxJob(tx, {
          jobType: 'TRIGGER_REVALIDATION',
          payload: { tags: ['tours', `tour:${row.slug}`], paths: ['/tours', `/tours/${row.slug}`, '/'] },
        });
      }
      const updatedTexts = extractTranslatableStrings(row);
      if (updatedTexts.length > 0) {
        await enqueueOutboxJob(tx, {
          jobType: 'PRETRANSLATE_CONTENT',
          dedupeKey: `pretranslate:tour:${row.id}:v${row.version}`,
          payload: { source: `tour:${row.slug}`, texts: updatedTexts },
        });
      }
      return row;
    });

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'tour.update',
      targetType: 'Tour',
      targetId: id,
      requestId: actor.requestId,
      before: { title: existing.title, slug: existing.slug, pricingVersion: existing.pricingVersion },
      after: { title: updated.title, slug: updated.slug, pricingVersion: updated.pricingVersion },
    });

    return updated;
  }

  async publishTour(id: string, actor: { userId: string; role: string; requestId?: string }) {
    const tour = await this.prisma.tour.findUnique({
      where: { id },
      include: {
        policy: { include: { versions: { take: 1 } } },
        departures: { where: { status: 'OPEN', departureDate: { gte: todayInCairo().toString() } }, take: 1 },
      },
    });
    if (!tour) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Tour not found', HttpStatus.NOT_FOUND);

    // Enforce publish readiness: required pricing, policy, and future availability!
    const missing: string[] = [];
    if (!tour.policy || tour.policy.versions.length === 0) missing.push('an active booking/cancellation policy');
    const startPrice = computeStartingPriceMinor(tour);
    if (startPrice <= 0) missing.push('valid positive pricing');
    if (tour.departures.length === 0) missing.push('at least one upcoming open departure');
    if (!tour.shortDescription.trim()) missing.push('a short description');

    if (missing.length > 0) {
      throw new DomainError(
        ERROR_CODES.VALIDATION_ERROR,
        `Cannot publish tour without ${missing.join(', ')}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.tour.update({
        where: { id },
        data: { status: 'PUBLISHED', version: { increment: 1 } },
      });
      await enqueueOutboxJob(tx, {
        jobType: 'TRIGGER_REVALIDATION',
        payload: { tags: ['tours', `tour:${row.slug}`], paths: ['/tours', `/tours/${row.slug}`, '/'] },
      });
      return row;
    });

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'tour.publish',
      targetType: 'Tour',
      targetId: id,
      requestId: actor.requestId,
    });

    return updated;
  }

  async archiveTour(id: string, actor: { userId: string; role: string; requestId?: string }) {
    const tour = await this.prisma.tour.findUnique({ where: { id } });
    if (!tour) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Tour not found', HttpStatus.NOT_FOUND);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.tour.update({
        where: { id },
        data: { status: 'ARCHIVED', featured: false, version: { increment: 1 } },
      });
      await enqueueOutboxJob(tx, {
        jobType: 'TRIGGER_REVALIDATION',
        payload: { tags: ['tours', `tour:${row.slug}`], paths: ['/tours', `/tours/${row.slug}`, '/'] },
      });
      return row;
    });

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'tour.archive',
      targetType: 'Tour',
      targetId: id,
      requestId: actor.requestId,
    });
    return updated;
  }

  async cloneTourAsDraft(id: string, actor: { userId: string; role: string; requestId?: string }) {
    const src = await this.prisma.tour.findUnique({
      where: { id },
      include: { categories: true, addons: true, pickupZones: true },
    });
    if (!src) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Tour not found', HttpStatus.NOT_FOUND);

    const cloneSlug = `${src.slug}-copy-${Date.now().toString(36)}`;
    const cloned = await this.prisma.tour.create({
      data: {
        slug: cloneSlug,
        status: 'DRAFT',
        title: `${src.title} (Copy)`,
        destinationId: src.destinationId,
        shortDescription: src.shortDescription,
        descriptionHtml: src.descriptionHtml,
        highlightsJson: src.highlightsJson as Prisma.InputJsonValue,
        durationLabel: src.durationLabel,
        durationHours: src.durationHours,
        guideLanguagesJson: src.guideLanguagesJson as Prisma.InputJsonValue,
        meetingPoint: src.meetingPoint,
        minAge: src.minAge,
        accessibilityInfo: src.accessibilityInfo,
        itineraryJson: src.itineraryJson as Prisma.InputJsonValue,
        inclusionsJson: src.inclusionsJson as Prisma.InputJsonValue,
        exclusionsJson: src.exclusionsJson as Prisma.InputJsonValue,
        whatToBringJson: src.whatToBringJson as Prisma.InputJsonValue,
        faqJson: src.faqJson as Prisma.InputJsonValue,
        pricingMode: src.pricingMode,
        currency: src.currency,
        privateGroupPriceMinor: src.privateGroupPriceMinor,
        minAdults: src.minAdults,
        minPartySize: src.minPartySize,
        maxPartySize: src.maxPartySize,
        ageBandsJson: src.ageBandsJson as Prisma.InputJsonValue,
        taxIncluded: src.taxIncluded,
        taxRateBps: src.taxRateBps,
        serviceFeeIncluded: src.serviceFeeIncluded,
        serviceFeeBps: src.serviceFeeBps,
        depositEnabled: src.depositEnabled,
        depositPercentBps: src.depositPercentBps,
        instantConfirmPayLater: src.instantConfirmPayLater,
        defaultCapacity: src.defaultCapacity,
        defaultCutoffHours: src.defaultCutoffHours,
        policyId: src.policyId,
        featured: false,
        displayOrder: src.displayOrder + 1,
        primaryImageUrl: src.primaryImageUrl,
        primaryImageAlt: src.primaryImageAlt,
        galleryJson: src.galleryJson as Prisma.InputJsonValue,
      },
    });

    await this.prisma.tourCategory.createMany({
      data: src.categories.map((c) => ({ tourId: cloned.id, categoryId: c.categoryId })),
      skipDuplicates: true,
    });
    await this.prisma.tourAddon.createMany({
      data: src.addons.map((a) => ({ tourId: cloned.id, addonId: a.addonId })),
      skipDuplicates: true,
    });
    await this.prisma.tourPickupZone.createMany({
      data: src.pickupZones.map((p) => ({ tourId: cloned.id, pickupZoneId: p.pickupZoneId })),
      skipDuplicates: true,
    });

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'tour.clone',
      targetType: 'Tour',
      targetId: cloned.id,
      requestId: actor.requestId,
      after: { clonedFromId: src.id, slug: cloned.slug },
    });
    return cloned;
  }

  // ==================== ADMIN DESTINATIONS ====================

  async listAdminDestinations() {
    return this.prisma.destination.findMany({
      orderBy: { displayOrder: 'asc' },
      include: { _count: { select: { tours: true, pickupZones: true } } },
    });
  }

  async createDestination(data: Record<string, unknown>, actor: { userId: string; role: string; requestId?: string }) {
    const slug = String(data.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    if (!slug || !data.name) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'slug and name are required');
    }
    const existing = await this.prisma.destination.findUnique({ where: { slug } });
    if (existing) throw new DomainError(ERROR_CODES.CONFLICT, 'Destination slug already exists', HttpStatus.CONFLICT);

    const created = await this.prisma.destination.create({
      data: {
        slug,
        name: String(data.name).trim(),
        tagline: String(data.tagline || 'Discover Egypt'),
        heroSubtitle: String(data.heroSubtitle || ''),
        description: String(data.description || ''),
        heroImageUrl: String(data.heroImageUrl || '/media/hero-red-sea-yacht.webp'),
        heroImageAlt: String(data.heroImageAlt || `${String(data.name)} coastal view`),
        highlightsJson: (data.highlights ?? []) as Prisma.InputJsonValue,
        faqJson: (data.faq ?? []) as Prisma.InputJsonValue,
        displayOrder: Number(data.displayOrder ?? 10),
        isVisible: data.isVisible !== undefined ? Boolean(data.isVisible) : true,
        seoTitle: data.seoTitle ? String(data.seoTitle) : null,
        seoDescription: data.seoDescription ? String(data.seoDescription) : null,
      },
    });
    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'destination.create',
      targetType: 'Destination',
      targetId: created.id,
      requestId: actor.requestId,
    });
    const destTexts = extractTranslatableStrings(created);
    if (destTexts.length > 0) {
      await enqueueOutboxJob(this.prisma, {
        jobType: 'PRETRANSLATE_CONTENT',
        dedupeKey: `pretranslate:dest:${created.id}:v${created.version}`,
        payload: { source: `destination:${created.slug}`, texts: destTexts },
      });
    }
    return created;
  }

  async updateDestination(id: string, data: Record<string, unknown>, actor: { userId: string; role: string; requestId?: string }) {
    const existing = await this.prisma.destination.findUnique({ where: { id } });
    if (!existing) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Destination not found', HttpStatus.NOT_FOUND);

    const updated = await this.prisma.destination.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: String(data.name).trim() } : {}),
        ...(data.tagline !== undefined ? { tagline: String(data.tagline) } : {}),
        ...(data.heroSubtitle !== undefined ? { heroSubtitle: String(data.heroSubtitle) } : {}),
        ...(data.description !== undefined ? { description: String(data.description) } : {}),
        ...(data.heroImageUrl !== undefined ? { heroImageUrl: String(data.heroImageUrl) } : {}),
        ...(data.heroImageAlt !== undefined ? { heroImageAlt: String(data.heroImageAlt) } : {}),
        ...(data.highlights !== undefined ? { highlightsJson: data.highlights as Prisma.InputJsonValue } : {}),
        ...(data.faq !== undefined ? { faqJson: data.faq as Prisma.InputJsonValue } : {}),
        ...(data.displayOrder !== undefined ? { displayOrder: Number(data.displayOrder) } : {}),
        ...(data.isVisible !== undefined ? { isVisible: Boolean(data.isVisible) } : {}),
        ...(data.seoTitle !== undefined ? { seoTitle: data.seoTitle ? String(data.seoTitle) : null } : {}),
        ...(data.seoDescription !== undefined ? { seoDescription: data.seoDescription ? String(data.seoDescription) : null } : {}),
        version: { increment: 1 },
      },
    });

    await enqueueOutboxJob(this.prisma, {
      jobType: 'TRIGGER_REVALIDATION',
      payload: { tags: ['destinations', `destination:${updated.slug}`], paths: ['/', `/destinations/${updated.slug}`] },
    });

    const updatedDestTexts = extractTranslatableStrings(updated);
    if (updatedDestTexts.length > 0) {
      await enqueueOutboxJob(this.prisma, {
        jobType: 'PRETRANSLATE_CONTENT',
        dedupeKey: `pretranslate:dest:${updated.id}:v${updated.version}`,
        payload: { source: `destination:${updated.slug}`, texts: updatedDestTexts },
      });
    }

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'destination.update',
      targetType: 'Destination',
      targetId: id,
      requestId: actor.requestId,
    });
    return updated;
  }

  async deleteDestination(id: string, actor: { userId: string; role: string; requestId?: string }) {
    const counts = await this.prisma.destination.findUnique({
      where: { id },
      include: { _count: { select: { tours: true, pickupZones: true } } },
    });
    if (!counts) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Destination not found', HttpStatus.NOT_FOUND);
    const protectedSlugs = ['cairo', 'sharm-el-sheikh', 'marsa-alam', 'hurghada', 'luxor-aswan'];
    if (protectedSlugs.includes(counts.slug)) {
      throw new DomainError(ERROR_CODES.RESOURCE_IN_USE, 'Core initial destinations cannot be deleted; toggle visibility instead.', HttpStatus.CONFLICT);
    }
    if (counts._count.tours > 0 || counts._count.pickupZones > 0) {
      throw new DomainError(ERROR_CODES.RESOURCE_IN_USE, 'Cannot delete destination referenced by tours or pickup zones', HttpStatus.CONFLICT);
    }
    await this.prisma.destination.delete({ where: { id } });
    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'destination.delete',
      targetType: 'Destination',
      targetId: id,
      requestId: actor.requestId,
    });
    return { ok: true };
  }

  // ==================== TAXONOMY: CATEGORIES, ADDONS, PICKUP ZONES, POLICIES ====================

  async listTaxonomy() {
    const [categories, addons, pickupZones, policies] = await Promise.all([
      this.prisma.category.findMany({ orderBy: { displayOrder: 'asc' }, include: { _count: { select: { tours: true } } } }),
      this.prisma.addon.findMany({ orderBy: { title: 'asc' }, include: { _count: { select: { tours: true } } } }),
      this.prisma.pickupZone.findMany({
        orderBy: [{ destination: { name: 'asc' } }, { name: 'asc' }],
        include: { destination: { select: { id: true, name: true, slug: true } }, _count: { select: { tours: true } } },
      }),
      this.prisma.policyDocument.findMany({
        orderBy: { name: 'asc' },
        include: {
          versions: { orderBy: { versionNumber: 'desc' }, take: 3 },
          _count: { select: { tours: true } },
        },
      }),
    ]);
    return { categories, addons, pickupZones, policies };
  }

  async createCategory(data: { slug: string; name: string; icon?: string; description?: string; displayOrder?: number }) {
    const slug = data.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    return this.prisma.category.create({
      data: { slug, name: data.name.trim(), icon: data.icon || 'compass', description: data.description || '', displayOrder: data.displayOrder ?? 10 },
    });
  }

  async deleteCategory(id: string) {
    const c = await this.prisma.category.findUnique({ where: { id }, include: { _count: { select: { tours: true } } } });
    if (!c) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Category not found', HttpStatus.NOT_FOUND);
    if (c._count.tours > 0) throw new DomainError(ERROR_CODES.RESOURCE_IN_USE, 'Category is in use by tours', HttpStatus.CONFLICT);
    await this.prisma.category.delete({ where: { id } });
    return { ok: true };
  }

  async createAddon(data: { code: string; title: string; description?: string; pricingBasis: 'PER_PERSON' | 'PER_BOOKING'; priceMinor: number; currency?: string; maxQuantity?: number }) {
    return this.prisma.addon.create({
      data: {
        code: data.code.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
        title: data.title.trim(),
        description: data.description || '',
        pricingBasis: data.pricingBasis,
        priceMinor: Math.max(0, Math.round(data.priceMinor)),
        currency: (data.currency || 'USD').toUpperCase(),
        maxQuantity: Math.max(1, data.maxQuantity ?? 1),
      },
    });
  }

  async updateAddon(id: string, data: Partial<{ title: string; description: string; priceMinor: number; maxQuantity: number; isActive: boolean }>) {
    return this.prisma.addon.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
    });
  }

  async deleteAddon(id: string) {
    const a = await this.prisma.addon.findUnique({ where: { id }, include: { _count: { select: { tours: true } } } });
    if (!a) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Add-on not found', HttpStatus.NOT_FOUND);
    if (a._count.tours > 0) throw new DomainError(ERROR_CODES.RESOURCE_IN_USE, 'Add-on is attached to tours; deactivate it instead', HttpStatus.CONFLICT);
    await this.prisma.addon.delete({ where: { id } });
    return { ok: true };
  }

  async createPickupZone(data: { destinationId: string; name: string; surchargeMinor?: number; pricingBasis?: 'PER_PERSON' | 'PER_BOOKING'; requiresHotelDetails?: boolean }) {
    return this.prisma.pickupZone.create({
      data: {
        destinationId: data.destinationId,
        name: data.name.trim(),
        surchargeMinor: Math.max(0, Math.round(data.surchargeMinor ?? 0)),
        pricingBasis: data.pricingBasis ?? 'PER_BOOKING',
        requiresHotelDetails: data.requiresHotelDetails ?? true,
      },
    });
  }

  async deletePickupZone(id: string) {
    const p = await this.prisma.pickupZone.findUnique({ where: { id }, include: { _count: { select: { tours: true } } } });
    if (!p) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Pickup zone not found', HttpStatus.NOT_FOUND);
    if (p._count.tours > 0) throw new DomainError(ERROR_CODES.RESOURCE_IN_USE, 'Pickup zone is attached to tours', HttpStatus.CONFLICT);
    await this.prisma.pickupZone.delete({ where: { id } });
    return { ok: true };
  }

  async createPolicy(data: {
    code: string;
    name: string;
    summary: string;
    bodyMarkdown: string;
    freeCancellationHours: number;
    partialRefundHours: number;
    partialRefundPercentBps: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.policyDocument.create({
        data: {
          code: data.code.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
          name: data.name.trim(),
          summary: data.summary.trim(),
          freeCancellationHours: data.freeCancellationHours,
          partialRefundHours: data.partialRefundHours,
          partialRefundPercentBps: data.partialRefundPercentBps,
        },
      });
      const version = await tx.policyVersion.create({
        data: {
          policyId: doc.id,
          versionNumber: 1,
          title: `${doc.name} (v1)`,
          bodyMarkdown: data.bodyMarkdown,
          freeCancellationHours: data.freeCancellationHours,
          partialRefundHours: data.partialRefundHours,
          partialRefundPercentBps: data.partialRefundPercentBps,
        },
      });
      return { policy: doc, version };
    });
  }

  async publishNewPolicyVersion(
    policyId: string,
    data: {
      summary?: string;
      bodyMarkdown: string;
      freeCancellationHours: number;
      partialRefundHours: number;
      partialRefundPercentBps: number;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.policyVersion.findFirst({
        where: { policyId },
        orderBy: { versionNumber: 'desc' },
      });
      const nextNum = (latest?.versionNumber ?? 0) + 1;
      const doc = await tx.policyDocument.update({
        where: { id: policyId },
        data: {
          ...(data.summary ? { summary: data.summary } : {}),
          freeCancellationHours: data.freeCancellationHours,
          partialRefundHours: data.partialRefundHours,
          partialRefundPercentBps: data.partialRefundPercentBps,
          version: { increment: 1 },
        },
      });
      const version = await tx.policyVersion.create({
        data: {
          policyId,
          versionNumber: nextNum,
          title: `${doc.name} (v${nextNum})`,
          bodyMarkdown: data.bodyMarkdown,
          freeCancellationHours: data.freeCancellationHours,
          partialRefundHours: data.partialRefundHours,
          partialRefundPercentBps: data.partialRefundPercentBps,
        },
      });
      return { policy: doc, version };
    });
  }
}
