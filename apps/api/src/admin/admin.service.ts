import fs from 'fs';
import path from 'path';
import { HttpStatus, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma } from '@sharm/database';
import {
  ERROR_CODES,
  STAFF_ROLES,
  StaffRole,
  escapeCsvCell,
  todayInCairo,
} from '@sharm/contracts';
import { expireOverdueBookings } from '@sharm/database';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { DomainError } from '../common/http-exception.filter';
import { getAppEnv } from '../common/env';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getOverview(days = 30) {
    const windowDays = Math.min(365, Math.max(1, days));
    const since = new Date(Date.now() - windowDays * 86400_000);
    const todayStr = todayInCairo().toString();

    const [bookings, ledger, upcomingDeps, pendingProofs, newInquiries, failedJobs] = await Promise.all([
      this.prisma.booking.findMany({
        where: { createdAt: { gte: since } },
        include: { tour: { select: { title: true } }, departure: { select: { departureDate: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.paymentLedgerEntry.findMany({
        where: { createdAt: { gte: since } },
      }),
      this.prisma.departure.findMany({
        where: { departureDate: { gte: todayStr }, status: 'OPEN' },
        include: { tour: { select: { id: true, title: true, primaryImageUrl: true } } },
        orderBy: [{ departureDate: 'asc' }, { startTime: 'asc' }],
        take: 10,
      }),
      this.prisma.paymentProof.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.inquiry.count({ where: { status: 'NEW' } }),
      this.prisma.outboxJob.count({ where: { status: { in: ['FAILED', 'DEAD'] } } }),
    ]);

    // Strictly separate currencies (never sum USD + EUR blindly)
    const revenueByCurrency: Record<string, { collectedMinor: number; refundedMinor: number; netCollectedMinor: number; bookedValueMinor: number; outstandingMinor: number }> = {};
    const ensureCurr = (c: string) => {
      if (!revenueByCurrency[c]) {
        revenueByCurrency[c] = { collectedMinor: 0, refundedMinor: 0, netCollectedMinor: 0, bookedValueMinor: 0, outstandingMinor: 0 };
      }
      return revenueByCurrency[c];
    };

    for (const b of bookings) {
      if (['CONFIRMED', 'COMPLETED', 'REQUESTED', 'HELD'].includes(b.status)) {
        ensureCurr(b.currency).bookedValueMinor += b.grandTotalMinor;
        ensureCurr(b.currency).outstandingMinor += b.dueLaterMinor;
      }
    }
    for (const e of ledger) {
      const bucket = ensureCurr(e.currency);
      if (e.type === 'CAPTURE' || e.type === 'MANUAL_PAYMENT' || e.type === 'OVERPAYMENT_EXCEPTION') {
        bucket.collectedMinor += e.amountMinor;
      } else if (e.type === 'REFUND') {
        bucket.refundedMinor += e.amountMinor;
      }
      bucket.netCollectedMinor = bucket.collectedMinor - bucket.refundedMinor;
    }

    // Real daily bookings series for the last 7 days (zeros on empty DB!)
    const dailySeries: Array<{ date: string; count: number }> = [];
    const todayPlain = todayInCairo();
    for (let i = 6; i >= 0; i--) {
      const dStr = todayPlain.subtract({ days: i }).toString();
      const count = bookings.filter((b) => b.createdAt.toISOString().slice(0, 10) === dStr).length;
      dailySeries.push({ date: dStr, count });
    }

    const totalCapacity = upcomingDeps.reduce((s, d) => s + d.capacity, 0);
    const totalAllocated = upcomingDeps.reduce((s, d) => s + d.bookedSeats + d.heldSeats, 0);
    const occupancyPct = totalCapacity > 0 ? Math.round((totalAllocated / totalCapacity) * 100) : 0;

    return {
      demoMode: getAppEnv().DEMO_MODE === 'true',
      windowDays,
      timezone: 'Africa/Cairo',
      metrics: {
        totalBookings: bookings.length,
        confirmedBookings: bookings.filter((b) => b.status === 'CONFIRMED' || b.status === 'COMPLETED').length,
        pendingRequests: bookings.filter((b) => b.status === 'REQUESTED').length,
        cancelledBookings: bookings.filter((b) => b.status === 'CANCELLED').length,
        occupancyPct,
        pendingProofs,
        newInquiries,
        failedJobs,
      },
      financialsByCurrency: revenueByCurrency,
      dailySeries,
      upcomingDepartures: upcomingDeps.map((d) => ({
        id: d.id,
        tourTitle: d.tour.title,
        imageUrl: d.tour.primaryImageUrl,
        departureDate: d.departureDate,
        startTime: d.startTime,
        capacity: d.capacity,
        bookedSeats: d.bookedSeats,
        heldSeats: d.heldSeats,
      })),
      recentBookings: bookings.slice(0, 8).map((b) => ({
        id: b.id,
        reference: b.reference,
        leadName: b.leadName,
        tourTitle: b.tour.title,
        departureDate: b.departure.departureDate,
        status: b.status,
        paymentStatus: b.paymentStatus,
        currency: b.currency,
        grandTotalMinor: b.grandTotalMinor,
      })),
    };
  }

  async getReports(params: { fromDate?: string; toDate?: string }) {
    const from = params.fromDate ? new Date(`${params.fromDate}T00:00:00Z`) : new Date(Date.now() - 90 * 86400_000);
    const to = params.toDate ? new Date(`${params.toDate}T23:59:59Z`) : new Date();

    const [bookings, ledger, departures] = await Promise.all([
      this.prisma.booking.findMany({
        where: { createdAt: { gte: from, lte: to } },
        include: {
          tour: { select: { id: true, title: true, destination: { select: { name: true, slug: true } } } },
        },
      }),
      this.prisma.paymentLedgerEntry.findMany({
        where: { createdAt: { gte: from, lte: to } },
      }),
      this.prisma.departure.findMany({
        where: {
          departureDate: {
            ...(params.fromDate ? { gte: params.fromDate } : {}),
            ...(params.toDate ? { lte: params.toDate } : {}),
          },
        },
        include: { tour: { select: { title: true } } },
        orderBy: { departureDate: 'asc' },
        take: 100,
      }),
    ]);

    const byCurrency: Record<string, { bookedValueMinor: number; cashCollectedMinor: number; refundedMinor: number; netCollectedMinor: number; outstandingMinor: number }> = {};
    const getC = (c: string) => {
      if (!byCurrency[c]) {
        byCurrency[c] = { bookedValueMinor: 0, cashCollectedMinor: 0, refundedMinor: 0, netCollectedMinor: 0, outstandingMinor: 0 };
      }
      return byCurrency[c];
    };

    const byTour: Record<string, { tourTitle: string; destination: string; bookings: number; seats: number; currency: string; bookedValueMinor: number }> = {};
    for (const b of bookings) {
      if (!['CANCELLED', 'EXPIRED'].includes(b.status)) {
        getC(b.currency).bookedValueMinor += b.grandTotalMinor;
        getC(b.currency).outstandingMinor += b.dueLaterMinor;
        const k = `${b.tourId}:${b.currency}`;
        if (!byTour[k]) {
          byTour[k] = { tourTitle: b.tour.title, destination: b.tour.destination.name, bookings: 0, seats: 0, currency: b.currency, bookedValueMinor: 0 };
        }
        byTour[k].bookings += 1;
        byTour[k].seats += b.seatsAllocated;
        byTour[k].bookedValueMinor += b.grandTotalMinor;
      }
    }

    for (const e of ledger) {
      const bucket = getC(e.currency);
      if (e.type === 'CAPTURE' || e.type === 'MANUAL_PAYMENT' || e.type === 'OVERPAYMENT_EXCEPTION') {
        bucket.cashCollectedMinor += e.amountMinor;
      } else if (e.type === 'REFUND') {
        bucket.refundedMinor += e.amountMinor;
      }
      bucket.netCollectedMinor = bucket.cashCollectedMinor - bucket.refundedMinor;
    }

    return {
      definitions: {
        timezone: 'Africa/Cairo (operational dates); UTC for financial ledger timestamps',
        bookedValue: 'Total value of active non-cancelled/non-expired bookings (separate from cash received).',
        cashCollected: 'Verified payments recorded in the immutable PaymentLedgerEntry table.',
        outstanding: 'Uncollected balance due on active bookings.',
      },
      period: { from: from.toISOString(), to: to.toISOString() },
      byCurrency,
      tourPerformance: Object.values(byTour).sort((a, b) => b.bookedValueMinor - a.bookedValueMinor),
      departureOccupancy: departures.map((d) => ({
        id: d.id,
        tourTitle: d.tour.title,
        departureDate: d.departureDate,
        startTime: d.startTime,
        capacity: d.capacity,
        bookedSeats: d.bookedSeats,
        heldSeats: d.heldSeats,
        occupancyPct: d.capacity > 0 ? Math.round(((d.bookedSeats + d.heldSeats) / d.capacity) * 100) : 0,
      })),
    };
  }

  async exportReportCsv(params: { fromDate?: string; toDate?: string }): Promise<string> {
    const rep = await this.getReports(params);
    const header = ['Tour', 'Destination', 'Bookings', 'Seats', 'Currency', 'Booked Value (Minor)'];
    const rows = rep.tourPerformance.map((r) =>
      [r.tourTitle, r.destination, r.bookings, r.seats, r.currency, r.bookedValueMinor]
        .map(escapeCsvCell)
        .join(','),
    );
    return [header.map(escapeCsvCell).join(','), ...rows].join('\r\n');
  }

  // ==================== TEAM & ROLE MANAGEMENT ====================

  async listTeam() {
    return this.prisma.staffUser.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
        suspendedAt: true,
        totpEnabledAt: true,
        lastLoginAt: true,
        createdAt: true,
        _count: { select: { sessions: { where: { revokedAt: null } } } },
      },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    });
  }

  async createStaffMember(
    body: { email: string; username?: string; fullName: string; role: StaffRole; password: string },
    actor: { userId: string; role: string; requestId?: string },
  ) {
    if (!STAFF_ROLES.includes(body.role)) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Invalid staff role');
    }
    if (body.password.length < 12) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Initial staff password must be at least 12 characters');
    }
    const email = body.email.trim().toLowerCase();
    const username = body.username?.trim().toLowerCase() || null;
    const existing = await this.prisma.staffUser.findUnique({ where: { email } });
    if (existing) throw new DomainError(ERROR_CODES.CONFLICT, 'Staff email already exists', HttpStatus.CONFLICT);
    if (username) {
      const existingUsername = await this.prisma.staffUser.findUnique({ where: { username } });
      if (existingUsername) throw new DomainError(ERROR_CODES.CONFLICT, 'Staff username already exists', HttpStatus.CONFLICT);
    }

    const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });
    const created = await this.prisma.staffUser.create({
      data: { email, username, fullName: body.fullName.trim(), role: body.role, passwordHash },
      select: { id: true, email: true, username: true, fullName: true, role: true, isActive: true, createdAt: true },
    });

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'team.user.create',
      targetType: 'StaffUser',
      targetId: created.id,
      requestId: actor.requestId,
      after: { email: created.email, username: created.username, role: created.role },
    });
    return created;
  }

  async updateStaffMember(
    id: string,
    body: { role?: StaffRole; suspend?: boolean; fullName?: string },
    actor: { userId: string; role: string; requestId?: string },
  ) {
    const target = await this.prisma.staffUser.findUnique({ where: { id } });
    if (!target) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Staff member not found', HttpStatus.NOT_FOUND);

    // Protect the last active OWNER from demotion or suspension!
    const wouldLoseOwner =
      target.role === 'OWNER' &&
      ((body.role && body.role !== 'OWNER') || body.suspend === true);

    if (wouldLoseOwner) {
      const activeOwners = await this.prisma.staffUser.count({
        where: { role: 'OWNER', isActive: true, suspendedAt: null },
      });
      if (activeOwners <= 1) {
        throw new DomainError(
          ERROR_CODES.CONFLICT,
          'Cannot demote or suspend the last active Owner account',
          HttpStatus.CONFLICT,
        );
      }
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.staffUser.update({
        where: { id },
        data: {
          ...(body.fullName ? { fullName: body.fullName.trim() } : {}),
          ...(body.role ? { role: body.role } : {}),
          ...(body.suspend === true ? { suspendedAt: now, isActive: false } : {}),
          ...(body.suspend === false ? { suspendedAt: null, isActive: true } : {}),
          version: { increment: 1 },
        },
        select: { id: true, email: true, fullName: true, role: true, isActive: true, suspendedAt: true },
      });

      // Revoke ALL active sessions immediately upon suspension or role downgrade
      if (body.suspend === true || (body.role && body.role !== target.role)) {
        await tx.staffSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      return user;
    });

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'team.user.update',
      targetType: 'StaffUser',
      targetId: id,
      requestId: actor.requestId,
      before: { role: target.role, isActive: target.isActive, suspendedAt: target.suspendedAt },
      after: { role: updated.role, isActive: updated.isActive, suspendedAt: updated.suspendedAt },
    });
    return updated;
  }

  async revokeUserSessions(id: string, actor: { userId: string; role: string; requestId?: string }) {
    const res = await this.prisma.staffSession.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'team.sessions.revoke',
      targetType: 'StaffUser',
      targetId: id,
      requestId: actor.requestId,
      after: { revokedCount: res.count },
    });
    return { revokedCount: res.count };
  }

  // ==================== SETTINGS ====================

  async getSettings() {
    const s = await this.prisma.siteSetting.findUniqueOrThrow({ where: { key: 'singleton' } });
    // Strip raw encryptedPaymobSecretsJson from general settings response
    const { encryptedPaymobSecretsJson: _hidden, ...safe } = s;
    return { ...safe, hasEncryptedPaymobSecrets: Boolean(_hidden) };
  }

  async updateSettings(body: Record<string, unknown>, actor: { userId: string; role: string; requestId?: string }) {
    const existing = await this.prisma.siteSetting.findUniqueOrThrow({ where: { key: 'singleton' } });

    if (body.baseCurrency && String(body.baseCurrency).toUpperCase() !== existing.baseCurrency) {
      const bookingCount = await this.prisma.booking.count();
      if (bookingCount > 0 && !body.acknowledgeCurrencyVersionedChange) {
        throw new DomainError(
          ERROR_CODES.CONFLICT,
          'Existing historical bookings retain their original currency. Pass acknowledgeCurrencyVersionedChange=true to update default currency for future tours.',
          HttpStatus.CONFLICT,
        );
      }
    }

    const updated = await this.prisma.siteSetting.update({
      where: { key: 'singleton' },
      data: {
        ...(body.companyName !== undefined ? { companyName: String(body.companyName).trim() } : {}),
        ...(body.legalName !== undefined ? { legalName: String(body.legalName).trim() } : {}),
        ...(body.baseCurrency !== undefined ? { baseCurrency: String(body.baseCurrency).toUpperCase().slice(0, 3) } : {}),
        ...(body.timezone !== undefined ? { timezone: String(body.timezone) } : {}),
        ...(body.contactEmail !== undefined ? { contactEmail: String(body.contactEmail).trim() } : {}),
        ...(body.contactPhone !== undefined ? { contactPhone: String(body.contactPhone).trim() } : {}),
        ...(body.whatsappNumber !== undefined ? { whatsappNumber: String(body.whatsappNumber).trim() } : {}),
        ...(body.addressText !== undefined ? { addressText: String(body.addressText).trim() } : {}),
        ...(body.mapEmbedUrl !== undefined ? { mapEmbedUrl: String(body.mapEmbedUrl).trim() } : {}),
        ...(body.socialsJson !== undefined ? { socialsJson: body.socialsJson as Prisma.InputJsonValue } : {}),
        ...(body.payLaterEnabled !== undefined ? { payLaterEnabled: Boolean(body.payLaterEnabled) } : {}),
        ...(body.bankTransferEnabled !== undefined ? { bankTransferEnabled: Boolean(body.bankTransferEnabled) } : {}),
        ...(body.bankDetailsJson !== undefined ? { bankDetailsJson: body.bankDetailsJson as Prisma.InputJsonValue } : {}),
        ...(body.manualRequestHoldHours !== undefined ? { manualRequestHoldHours: Math.max(1, Math.min(168, Number(body.manualRequestHoldHours))) } : {}),
        ...(body.onlineCheckoutHoldMinutes !== undefined ? { onlineCheckoutHoldMinutes: Math.max(5, Math.min(60, Number(body.onlineCheckoutHoldMinutes))) } : {}),
        ...(body.defaultTaxIncluded !== undefined ? { defaultTaxIncluded: Boolean(body.defaultTaxIncluded) } : {}),
        ...(body.defaultTaxRateBps !== undefined ? { defaultTaxRateBps: Math.max(0, Math.min(5000, Number(body.defaultTaxRateBps))) } : {}),
        ...(body.maintenanceBannerEnabled !== undefined ? { maintenanceBannerEnabled: Boolean(body.maintenanceBannerEnabled) } : {}),
        ...(body.maintenanceBannerText !== undefined ? { maintenanceBannerText: String(body.maintenanceBannerText).trim() } : {}),
        ...(body.retentionConfigJson !== undefined ? { retentionConfigJson: body.retentionConfigJson as Prisma.InputJsonValue } : {}),
        ...(body.emailTemplatesJson !== undefined ? { emailTemplatesJson: body.emailTemplatesJson as Prisma.InputJsonValue } : {}),
        ...(body.seoDefaultsJson !== undefined ? { seoDefaultsJson: body.seoDefaultsJson as Prisma.InputJsonValue } : {}),
        version: { increment: 1 },
      },
    });

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'settings.update',
      targetType: 'SiteSetting',
      targetId: updated.id,
      requestId: actor.requestId,
      before: { baseCurrency: existing.baseCurrency, payLaterEnabled: existing.payLaterEnabled, bankTransferEnabled: existing.bankTransferEnabled },
      after: { baseCurrency: updated.baseCurrency, payLaterEnabled: updated.payLaterEnabled, bankTransferEnabled: updated.bankTransferEnabled },
    });

    const { encryptedPaymobSecretsJson: _hidden, ...safe } = updated;
    return safe;
  }

  // ==================== AUDIT LOG & SYSTEM HEALTH ====================

  async listAuditLogs(params: { action?: string; targetType?: string; limit?: number }) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(params.action ? { action: { contains: params.action, mode: 'insensitive' } } : {}),
        ...(params.targetType ? { targetType: params.targetType } : {}),
      },
      include: { actor: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, Math.max(10, params.limit ?? 100)),
    });
  }

  async getSystemHealth() {
    const env = getAppEnv();
    let dbOk = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }

    const checkWritable = (dir: string) => {
      try {
        const resolved = path.resolve(process.cwd(), dir);
        fs.mkdirSync(resolved, { recursive: true });
        fs.accessSync(resolved, fs.constants.W_OK);
        return true;
      } catch {
        return false;
      }
    };

    const [jobCounts, recentFailedJobs, recentEmails, settings] = await Promise.all([
      this.prisma.outboxJob.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.outboxJob.findMany({
        where: { status: { in: ['FAILED', 'DEAD'] } },
        orderBy: { updatedAt: 'desc' },
        take: 25,
      }),
      this.prisma.emailDelivery.findMany({ orderBy: { createdAt: 'desc' }, take: 25 }),
      this.prisma.siteSetting.findUnique({ where: { key: 'singleton' } }),
    ]);

    const warnings: string[] = [];
    if (env.DEMO_MODE === 'true') warnings.push('DEMO_MODE is enabled (disable before production launch)');
    if (!settings?.contactEmail) warnings.push('Business contact email is not yet configured in Settings');
    if (env.SMTP_HOST === '127.0.0.1') warnings.push('SMTP points to local capture server (configure real production SMTP before go-live)');

    return {
      status: dbOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: { ok: dbOk },
        publicStorage: { ok: checkWritable(env.STORAGE_PUBLIC_DIR) },
        privateStorage: { ok: checkWritable(env.STORAGE_PRIVATE_DIR) },
        smtp: { host: env.SMTP_HOST, port: env.SMTP_PORT, configuredAuth: Boolean(env.SMTP_USER) },
      },
      queue: {
        counts: Object.fromEntries(jobCounts.map((g) => [g.status, g._count._all])),
        recentFailedJobs,
      },
      recentEmails,
      warnings,
    };
  }

  async retryOutboxJob(jobId: string, actor: { userId: string; role: string; requestId?: string }) {
    const job = await this.prisma.outboxJob.update({
      where: { id: jobId },
      data: { status: 'PENDING', runAfterUtc: new Date(), leasedUntilUtc: null, attempts: 0, lastError: null },
    });
    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'health.job.retry',
      targetType: 'OutboxJob',
      targetId: jobId,
      requestId: actor.requestId,
    });
    return job;
  }

  async runExpirySweepNow() {
    return expireOverdueBookings(this.prisma, new Date());
  }
}
