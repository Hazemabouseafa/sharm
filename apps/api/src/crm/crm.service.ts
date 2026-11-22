import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@sharm/database';
import { CreateInquiryDto, ERROR_CODES } from '@sharm/contracts';
import { enqueueOutboxJob } from '@sharm/database';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { RateLimitService } from '../common/rate-limit.service';
import { DomainError } from '../common/http-exception.filter';
import { sha256Hex } from '../common/crypto';

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async submitPublicInquiry(dto: CreateInquiryDto, ipAddress?: string) {
    const rl = this.rateLimit.check(`inquiry:${ipAddress ?? 'unknown'}`, 8, 15 * 60_000);
    if (!rl.allowed) {
      throw new DomainError(ERROR_CODES.RATE_LIMITED, 'Too many inquiry submissions. Please wait a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Silent honeypot trap: bots that fill the hidden "website" field get accepted without saving spam
    if (dto.website && dto.website.trim().length > 0) {
      return { id: 'ignored', status: 'RECEIVED' };
    }

    const inquiry = await this.prisma.$transaction(async (tx) => {
      const created = await tx.inquiry.create({
        data: {
          fullName: dto.fullName.trim(),
          email: dto.email.trim().toLowerCase(),
          phone: dto.phone?.trim() || null,
          destinationSlug: dto.destinationSlug?.trim() || null,
          message: dto.message.trim(),
          sourceIpHash: ipAddress ? sha256Hex(ipAddress) : null,
        },
      });

      const settings = await tx.siteSetting.findUnique({ where: { key: 'singleton' } });
      await enqueueOutboxJob(tx, {
        jobType: 'SEND_EMAIL',
        dedupeKey: `inquiry-guest:${created.id}`,
        payload: {
          templateKey: 'inquiry_received',
          toEmail: created.email,
          fullName: created.fullName,
          destinationSlug: created.destinationSlug,
          message: created.message,
        },
      });
      if (settings?.contactEmail) {
        await enqueueOutboxJob(tx, {
          jobType: 'SEND_EMAIL',
          dedupeKey: `inquiry-staff:${created.id}`,
          payload: {
            templateKey: 'inquiry_staff_alert',
            toEmail: settings.contactEmail,
            inquiryId: created.id,
            fullName: created.fullName,
            guestEmail: created.email,
            phone: created.phone,
            destinationSlug: created.destinationSlug,
            message: created.message,
          },
        });
      }
      return created;
    });

    return {
      id: inquiry.id,
      status: 'RECEIVED',
      message: 'Your inquiry has been saved and routed to our travel advisors.',
    };
  }

  async listInquiries(status?: string) {
    return this.prisma.inquiry.findMany({
      where: status && ['NEW', 'IN_PROGRESS', 'REPLIED', 'ARCHIVED'].includes(status)
        ? { status: status as 'NEW' }
        : undefined,
      include: { assignedStaff: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async updateInquiry(
    id: string,
    body: { status?: 'NEW' | 'IN_PROGRESS' | 'REPLIED' | 'ARCHIVED'; assignedStaffId?: string | null; internalNotes?: string },
    actor: { userId: string; role: string; requestId?: string },
  ) {
    const updated = await this.prisma.inquiry.update({
      where: { id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.assignedStaffId !== undefined ? { assignedStaffId: body.assignedStaffId } : {}),
        ...(body.internalNotes !== undefined ? { internalNotes: body.internalNotes } : {}),
      },
    });
    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'inquiry.update',
      targetType: 'Inquiry',
      targetId: id,
      requestId: actor.requestId,
      after: { status: updated.status },
    });
    return updated;
  }

  // ==================== CUSTOMERS ====================

  async listCustomers(q?: string) {
    const where: Prisma.CustomerWhereInput = q
      ? {
          OR: [
            { fullName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};

    const customers = await this.prisma.customer.findMany({
      where,
      include: {
        _count: { select: { bookings: true } },
        bookings: {
          select: { id: true, reference: true, status: true, currency: true, grandTotalMinor: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 150,
    });
    return customers;
  }

  async getCustomerDetail(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        bookings: {
          include: { tour: { select: { title: true } }, departure: { select: { departureDate: true } } },
          orderBy: { createdAt: 'desc' },
        },
        notes: {
          include: { author: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!customer) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Customer not found', HttpStatus.NOT_FOUND);
    return customer;
  }

  async addCustomerNote(customerId: string, body: string, actor: { userId: string; role: string }) {
    if (!body.trim()) throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Note text is required');
    return this.prisma.customerNote.create({
      data: { customerId, authorId: actor.userId, body: body.trim() },
      include: { author: { select: { id: true, fullName: true } } },
    });
  }

  async exportCustomerData(id: string, actor: { userId: string; role: string; requestId?: string }) {
    const detail = await this.getCustomerDetail(id);
    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'customer.data_export',
      targetType: 'Customer',
      targetId: id,
      requestId: actor.requestId,
    });
    // Exclude private staff notes from guest data portability export!
    return {
      exportedAt: new Date().toISOString(),
      customer: {
        id: detail.id,
        fullName: detail.fullName,
        email: detail.email,
        phone: detail.phone,
        nationality: detail.nationality,
      },
      bookings: detail.bookings.map((b) => ({
        reference: b.reference,
        status: b.status,
        paymentStatus: b.paymentStatus,
        tour: b.tour.title,
        departureDate: b.departure.departureDate,
        currency: b.currency,
        grandTotalMinor: b.grandTotalMinor,
        createdAt: b.createdAt,
      })),
    };
  }

  /**
   * Anonymizes traveler PII while strictly preserving immutable financial totals and booking history!
   */
  async anonymizeCustomer(id: string, reason: string, actor: { userId: string; role: string; requestId?: string }) {
    if (!reason || reason.trim().length < 4) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Reason is required for data anonymization');
    }
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Customer not found', HttpStatus.NOT_FOUND);

    const anonEmail = `anonymized-${id}@redacted.invalid`;
    await this.prisma.$transaction([
      this.prisma.customer.update({
        where: { id },
        data: {
          email: anonEmail,
          fullName: 'Anonymized Traveler',
          phone: '',
          nationality: null,
          anonymizedAt: new Date(),
        },
      }),
      this.prisma.booking.updateMany({
        where: { customerId: id },
        data: {
          leadName: 'Anonymized Traveler',
          leadEmail: anonEmail,
          leadPhone: 'REDACTED',
          nationality: null,
          hotelName: null,
          specialRequests: null,
        },
      }),
    ]);

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'customer.anonymize',
      targetType: 'Customer',
      targetId: id,
      requestId: actor.requestId,
      reason: reason.trim(),
    });
    return { ok: true, anonymizedEmail: anonEmail };
  }

  // ==================== PROMOTIONS ====================

  async listPromotions() {
    return this.prisma.promotion.findMany({
      include: { _count: { select: { redemptions: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPromotion(
    body: {
      code: string;
      title: string;
      discountType: 'FIXED' | 'PERCENT';
      value: number;
      currency?: string;
      minOrderMinor?: number;
      validFrom: string;
      validUntil: string;
      maxTotalUses?: number | null;
      maxUsesPerEmail?: number | null;
      eligibleTourIds?: string[];
    },
    actor: { userId: string; role: string; requestId?: string },
  ) {
    const code = body.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!code || code.length < 3) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Promotion code must be at least 3 alphanumeric characters');
    }
    if (body.discountType === 'PERCENT' && (body.value <= 0 || body.value > 10000)) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Percent discount must be 1..10000 basis points (0.01%..100%)');
    }

    const promo = await this.prisma.promotion.create({
      data: {
        code,
        title: body.title.trim(),
        discountType: body.discountType,
        value: Math.round(body.value),
        currency: (body.currency || 'USD').toUpperCase(),
        minOrderMinor: Math.max(0, Math.round(body.minOrderMinor ?? 0)),
        validFrom: new Date(body.validFrom),
        validUntil: new Date(body.validUntil),
        maxTotalUses: body.maxTotalUses ?? null,
        maxUsesPerEmail: body.maxUsesPerEmail ?? null,
        eligibleTourIdsJson: (body.eligibleTourIds ?? []) as Prisma.InputJsonValue,
      },
    });

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'promotion.create',
      targetType: 'Promotion',
      targetId: promo.id,
      requestId: actor.requestId,
      after: { code: promo.code, discountType: promo.discountType, value: promo.value },
    });
    return promo;
  }

  async updatePromotion(
    id: string,
    body: Partial<{
      title: string;
      isActive: boolean;
      validUntil: string;
      maxTotalUses: number | null;
      maxUsesPerEmail: number | null;
      minOrderMinor: number;
    }>,
    actor: { userId: string; role: string; requestId?: string },
  ) {
    const updated = await this.prisma.promotion.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.validUntil !== undefined ? { validUntil: new Date(body.validUntil) } : {}),
        ...(body.maxTotalUses !== undefined ? { maxTotalUses: body.maxTotalUses } : {}),
        ...(body.maxUsesPerEmail !== undefined ? { maxUsesPerEmail: body.maxUsesPerEmail } : {}),
        ...(body.minOrderMinor !== undefined ? { minOrderMinor: body.minOrderMinor } : {}),
        version: { increment: 1 },
      },
    });
    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'promotion.update',
      targetType: 'Promotion',
      targetId: id,
      requestId: actor.requestId,
    });
    return updated;
  }
}
