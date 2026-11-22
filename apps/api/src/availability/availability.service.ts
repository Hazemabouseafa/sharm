import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@sharm/database';
import {
  ERROR_CODES,
  cairoLocalToUtc,
  generateRecurringCairoDates,
  parsePlainDate,
} from '@sharm/contracts';
import { enqueueOutboxJob, lockDeparturesForUpdate, releaseBookingAllocationInTx, runWithSerializableRetry } from '@sharm/database';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { DomainError } from '../common/http-exception.filter';

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listDepartures(params: { tourId?: string; fromDate?: string; toDate?: string; status?: string }) {
    const where: Prisma.DepartureWhereInput = {};
    if (params.tourId) where.tourId = params.tourId;
    if (params.status && ['OPEN', 'CLOSED', 'CANCELLED'].includes(params.status)) {
      where.status = params.status as 'OPEN' | 'CLOSED' | 'CANCELLED';
    }
    if (params.fromDate || params.toDate) {
      where.departureDate = {
        ...(params.fromDate ? { gte: params.fromDate } : {}),
        ...(params.toDate ? { lte: params.toDate } : {}),
      };
    }

    const rows = await this.prisma.departure.findMany({
      where,
      include: {
        tour: { select: { id: true, title: true, slug: true, currency: true, pricingMode: true } },
        _count: { select: { bookings: true } },
      },
      orderBy: [{ departureDate: 'asc' }, { startTime: 'asc' }],
      take: 300,
    });

    return rows.map((d) => ({
      ...d,
      remainingSeats: Math.max(0, d.capacity - d.bookedSeats - d.heldSeats),
    }));
  }

  async listSchedulesAndBlackouts(tourId?: string) {
    const [schedules, blackouts] = await Promise.all([
      this.prisma.recurringSchedule.findMany({
        where: tourId ? { tourId } : undefined,
        include: { tour: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.blackoutDate.findMany({
        where: tourId ? { OR: [{ tourId }, { tourId: null }] } : undefined,
        include: { tour: { select: { id: true, title: true } } },
        orderBy: { date: 'asc' },
      }),
    ]);
    return { schedules, blackouts };
  }

  async createRecurringSchedule(
    data: {
      tourId: string;
      weekdays: number[];
      startTime: string;
      capacity: number;
      cutoffHours?: number;
      adultPriceOverrideMinor?: number | null;
      childPriceOverrideMinor?: number | null;
      privateGroupPriceOverrideMinor?: number | null;
      activeFromDate: string;
      activeToDate?: string | null;
    },
    actor: { userId: string; role: string; requestId?: string },
  ) {
    if (!data.weekdays.length || data.weekdays.some((d) => d < 1 || d > 7)) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Weekdays must contain ISO weekday numbers 1..7');
    }
    if (data.capacity <= 0) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Capacity must be positive');
    }
    parsePlainDate(data.activeFromDate);
    if (data.activeToDate) parsePlainDate(data.activeToDate);

    const schedule = await this.prisma.recurringSchedule.create({
      data: {
        tourId: data.tourId,
        weekdaysJson: data.weekdays,
        startTime: data.startTime,
        capacity: data.capacity,
        cutoffHours: data.cutoffHours ?? 12,
        adultPriceOverrideMinor: data.adultPriceOverrideMinor ?? null,
        childPriceOverrideMinor: data.childPriceOverrideMinor ?? null,
        privateGroupPriceOverrideMinor: data.privateGroupPriceOverrideMinor ?? null,
        activeFromDate: data.activeFromDate,
        activeToDate: data.activeToDate ?? null,
      },
    });

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'availability.schedule.create',
      targetType: 'RecurringSchedule',
      targetId: schedule.id,
      requestId: actor.requestId,
    });
    return schedule;
  }

  async generateDepartures(
    params: {
      tourId: string;
      fromDate: string;
      toDate: string;
      weekdays?: number[];
      startTime?: string;
      capacity?: number;
      cutoffHours?: number;
    },
    actor: { userId: string; role: string; requestId?: string },
  ) {
    const tour = await this.prisma.tour.findUnique({ where: { id: params.tourId } });
    if (!tour) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Tour not found', HttpStatus.NOT_FOUND);

    const blackouts = await this.prisma.blackoutDate.findMany({
      where: { OR: [{ tourId: params.tourId }, { tourId: null }] },
      select: { date: true },
    });
    const blackoutSet = new Set(blackouts.map((b) => b.date));

    const schedules = params.weekdays
      ? [
          {
            weekdaysJson: params.weekdays,
            startTime: params.startTime || '08:00',
            capacity: params.capacity ?? tour.defaultCapacity,
            cutoffHours: params.cutoffHours ?? tour.defaultCutoffHours,
            adultPriceOverrideMinor: null,
            childPriceOverrideMinor: null,
            privateGroupPriceOverrideMinor: null,
          },
        ]
      : await this.prisma.recurringSchedule.findMany({
          where: { tourId: params.tourId, isActive: true },
        });

    if (schedules.length === 0) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'No active recurring schedules found for this tour');
    }

    let createdCount = 0;
    let skippedExisting = 0;
    const dstWarnings: Array<{ date: string; startTime: string; resolvedOffset: string }> = [];

    for (const s of schedules) {
      const dates = generateRecurringCairoDates({
        fromDate: params.fromDate,
        toDate: params.toDate,
        weekdays: s.weekdaysJson as number[],
        blackoutDates: blackoutSet,
      });

      for (const dateStr of dates) {
        const { utcDate, offset, dstConflict } = cairoLocalToUtc(dateStr, s.startTime);
        if (dstConflict) {
          dstWarnings.push({ date: dateStr, startTime: s.startTime, resolvedOffset: offset });
        }

        const existing = await this.prisma.departure.findUnique({
          where: {
            tourId_departureDate_startTime: {
              tourId: params.tourId,
              departureDate: dateStr,
              startTime: s.startTime,
            },
          },
        });
        if (existing) {
          skippedExisting++;
          continue;
        }
        await this.prisma.departure.create({
          data: {
            tourId: params.tourId,
            departureDate: dateStr,
            startTime: s.startTime,
            startUtc: utcDate,
            timezone: 'Africa/Cairo',
            capacity: s.capacity,
            cutoffHours: s.cutoffHours,
            adultPriceOverrideMinor: s.adultPriceOverrideMinor,
            childPriceOverrideMinor: s.childPriceOverrideMinor,
            privateGroupPriceOverrideMinor: s.privateGroupPriceOverrideMinor,
          },
        });
        createdCount++;
      }
    }

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'availability.departures.generate',
      targetType: 'Tour',
      targetId: params.tourId,
      requestId: actor.requestId,
      after: { fromDate: params.fromDate, toDate: params.toDate, createdCount, skippedExisting },
    });

    return { createdCount, skippedExisting, dstWarnings };
  }

  async addBlackoutDate(
    data: { tourId?: string | null; date: string; reason?: string },
    actor: { userId: string; role: string; requestId?: string },
  ) {
    parsePlainDate(data.date);
    const created = await this.prisma.blackoutDate.create({
      data: {
        tourId: data.tourId ?? null,
        date: data.date,
        reason: data.reason || '',
      },
    });
    const affectedCount = await this.prisma.booking.count({
      where: {
        status: { in: ['REQUESTED', 'HELD', 'CONFIRMED'] },
        departure: {
          departureDate: data.date,
          ...(data.tourId ? { tourId: data.tourId } : {}),
        },
      },
    });
    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'availability.blackout.create',
      targetType: 'BlackoutDate',
      targetId: created.id,
      requestId: actor.requestId,
    });
    return { blackout: created, affectedActiveBookings: affectedCount };
  }

  async deleteBlackoutDate(id: string) {
    await this.prisma.blackoutDate.delete({ where: { id } });
    return { ok: true };
  }

  async updateDeparture(
    id: string,
    data: {
      capacity?: number;
      status?: 'OPEN' | 'CLOSED' | 'CANCELLED';
      cutoffHours?: number;
      adultPriceOverrideMinor?: number | null;
      childPriceOverrideMinor?: number | null;
      infantPriceOverrideMinor?: number | null;
      privateGroupPriceOverrideMinor?: number | null;
      pickupTimeNote?: string | null;
      cancellationReason?: string;
    },
    actor: { userId: string; role: string; requestId?: string },
  ) {
    return runWithSerializableRetry(this.prisma, async (tx) => {
      const lockedMap = await lockDeparturesForUpdate(tx, [id]);
      const dep = lockedMap.get(id);
      if (!dep) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Departure not found', HttpStatus.NOT_FOUND);

      const allocated = dep.bookedSeats + dep.heldSeats;
      if (data.capacity !== undefined) {
        if (!Number.isInteger(data.capacity) || data.capacity < 0) {
          throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Capacity must be a non-negative integer');
        }
        if (data.capacity < allocated) {
          throw new DomainError(
            ERROR_CODES.CONFLICT,
            `Cannot reduce capacity to ${data.capacity} because ${allocated} seats are already booked or held (${dep.bookedSeats} booked, ${dep.heldSeats} held).`,
            HttpStatus.CONFLICT,
          );
        }
      }

      const updated = await tx.departure.update({
        where: { id },
        data: {
          ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.cutoffHours !== undefined ? { cutoffHours: data.cutoffHours } : {}),
          ...(data.adultPriceOverrideMinor !== undefined ? { adultPriceOverrideMinor: data.adultPriceOverrideMinor } : {}),
          ...(data.childPriceOverrideMinor !== undefined ? { childPriceOverrideMinor: data.childPriceOverrideMinor } : {}),
          ...(data.infantPriceOverrideMinor !== undefined ? { infantPriceOverrideMinor: data.infantPriceOverrideMinor } : {}),
          ...(data.privateGroupPriceOverrideMinor !== undefined ? { privateGroupPriceOverrideMinor: data.privateGroupPriceOverrideMinor } : {}),
          ...(data.pickupTimeNote !== undefined ? { pickupTimeNote: data.pickupTimeNote } : {}),
          version: { increment: 1 },
        },
      });

      let affectedBookingsCancelled = 0;
      if (data.status === 'CANCELLED') {
        const affected = await tx.booking.findMany({
          where: {
            departureId: id,
            status: { in: ['REQUESTED', 'HELD', 'CONFIRMED'] },
          },
          include: { ledgerEntries: true },
        });
        for (const bk of affected) {
          await releaseBookingAllocationInTx(tx, bk);
          await tx.booking.update({
            where: { id: bk.id },
            data: {
              status: 'CANCELLED',
              cancelledAt: new Date(),
              cancellationReason: data.cancellationReason || 'Operator cancelled departure',
              version: { increment: 1 },
            },
          });
          await tx.bookingEvent.create({
            data: {
              bookingId: bk.id,
              actorType: 'STAFF',
              actorId: actor.userId,
              eventType: 'OPERATOR_DEPARTURE_CANCELLED',
              message: data.cancellationReason || 'Departure cancelled by operator',
            },
          });
          const capturedMinor = bk.ledgerEntries
            .filter((e) => e.type === 'CAPTURE' || e.type === 'MANUAL_PAYMENT')
            .reduce((s, e) => s + e.amountMinor, 0);
          const refundedMinor = bk.ledgerEntries
            .filter((e) => e.type === 'REFUND')
            .reduce((s, e) => s + e.amountMinor, 0);
          const refundable = Math.max(0, capturedMinor - refundedMinor);
          if (refundable > 0) {
            await tx.refundRequest.create({
              data: {
                bookingId: bk.id,
                amountMinor: refundable,
                currency: bk.currency,
                reason: 'Full refund due to operator departure cancellation',
                status: 'APPROVED',
                requestedByType: 'STAFF',
                requestedById: actor.userId,
              },
            });
          }
          await enqueueOutboxJob(tx, {
            jobType: 'SEND_EMAIL',
            dedupeKey: `dep-cancel:${id}:${bk.id}`,
            payload: {
              templateKey: 'booking_cancelled',
              toEmail: bk.leadEmail,
              bookingId: bk.id,
              reference: bk.reference,
              leadName: bk.leadName,
              reason: data.cancellationReason || 'Operator cancelled this departure; any collected payments qualify for full refund.',
            },
          });
          affectedBookingsCancelled++;
        }
      }

      await this.audit.log({
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'availability.departure.update',
        targetType: 'Departure',
        targetId: id,
        requestId: actor.requestId,
        before: { capacity: dep.capacity, status: dep.status },
        after: { capacity: updated.capacity, status: updated.status, affectedBookingsCancelled },
      });

      return { departure: updated, affectedBookingsCancelled };
    });
  }

  async bulkUpdateDepartures(
    body: {
      departureIds: string[];
      status?: 'OPEN' | 'CLOSED';
      capacity?: number;
      adultPriceOverrideMinor?: number | null;
    },
    actor: { userId: string; role: string; requestId?: string },
  ) {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of body.departureIds) {
      try {
        await this.updateDeparture(
          id,
          {
            status: body.status,
            capacity: body.capacity,
            adultPriceOverrideMinor: body.adultPriceOverrideMinor,
          },
          actor,
        );
        succeeded.push(id);
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : 'Update failed' });
      }
    }
    return { succeeded, failed };
  }
}
