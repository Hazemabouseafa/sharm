import { PrismaClient } from '@prisma/client';
import { lockDeparturesForUpdate, releaseBookingAllocationInTx, runWithSerializableRetry } from './inventory';
import { enqueueOutboxJob } from './outbox';

export interface ExpiryRunResult {
  expiredHoldIds: string[];
  expiredRequestIds: string[];
}

/**
 * Finds and atomically expires overdue HELD bookings (holdExpiresAt <= now)
 * and overdue REQUESTED bookings (decisionDeadlineAt <= now).
 * Shared by API and Worker so inventory release rules live in one place.
 */
export async function expireOverdueBookings(
  client: PrismaClient,
  now: Date = new Date(),
  batchSize = 50,
): Promise<ExpiryRunResult> {
  const candidates = await client.booking.findMany({
    where: {
      allocationActive: true,
      OR: [
        { status: 'HELD', holdExpiresAt: { lte: now } },
        { status: 'REQUESTED', decisionDeadlineAt: { lte: now } },
      ],
    },
    select: { id: true, status: true },
    take: batchSize,
    orderBy: { createdAt: 'asc' },
  });

  const expiredHoldIds: string[] = [];
  const expiredRequestIds: string[] = [];

  for (const candidate of candidates) {
    const expired = await runWithSerializableRetry(client, async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: candidate.id } });
      if (!booking || !booking.allocationActive) return null;

      const isExpiredHold =
        booking.status === 'HELD' &&
        booking.holdExpiresAt !== null &&
        booking.holdExpiresAt.getTime() <= now.getTime();
      const isExpiredRequest =
        booking.status === 'REQUESTED' &&
        booking.decisionDeadlineAt !== null &&
        booking.decisionDeadlineAt.getTime() <= now.getTime();

      if (!isExpiredHold && !isExpiredRequest) return null;

      await lockDeparturesForUpdate(tx, [booking.departureId]);
      await releaseBookingAllocationInTx(tx, booking);

      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: 'EXPIRED',
          version: { increment: 1 },
        },
      });

      const reason = isExpiredHold
        ? 'Online checkout hold expired without payment'
        : 'Manual booking request expired past review deadline';

      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          actorType: 'SYSTEM',
          eventType: 'BOOKING_EXPIRED',
          message: reason,
          metadataJson: { previousStatus: booking.status },
        },
      });

      await enqueueOutboxJob(tx, {
        jobType: 'SEND_EMAIL',
        dedupeKey: `booking-expired:${booking.id}`,
        payload: {
          templateKey: 'booking_expired',
          toEmail: booking.leadEmail,
          bookingId: booking.id,
          reference: booking.reference,
          leadName: booking.leadName,
          reason,
        },
      });

      return isExpiredHold ? 'HELD' : 'REQUESTED';
    });

    if (expired === 'HELD') expiredHoldIds.push(candidate.id);
    if (expired === 'REQUESTED') expiredRequestIds.push(candidate.id);
  }

  return { expiredHoldIds, expiredRequestIds };
}

export interface ScheduledPublishResult {
  publishedPageSlugs: string[];
  failedScheduleIds: string[];
}

/**
 * Executes due CMS scheduled publications atomically and enqueues Next.js cache revalidation.
 */
export async function executeDueCmsPublishSchedules(
  client: PrismaClient,
  now: Date = new Date(),
): Promise<ScheduledPublishResult> {
  const dueSchedules = await client.cmsPublishSchedule.findMany({
    where: {
      status: 'PENDING',
      scheduledForUtc: { lte: now },
    },
    include: { page: true, revision: true },
    orderBy: { scheduledForUtc: 'asc' },
    take: 20,
  });

  const publishedPageSlugs: string[] = [];
  const failedScheduleIds: string[] = [];

  for (const sched of dueSchedules) {
    try {
      await client.$transaction(async (tx) => {
        const fresh = await tx.cmsPublishSchedule.findUnique({ where: { id: sched.id } });
        if (!fresh || fresh.status !== 'PENDING') return;

        await tx.cmsRevision.update({
          where: { id: sched.revisionId },
          data: {
            status: 'PUBLISHED',
            publishedAt: now,
            publishedById: sched.createdById,
          },
        });

        await tx.cmsPage.update({
          where: { id: sched.pageId },
          data: {
            publishedRevisionId: sched.revisionId,
            version: { increment: 1 },
          },
        });

        await tx.cmsPublishSchedule.update({
          where: { id: sched.id },
          data: {
            status: 'PUBLISHED',
            executedAt: now,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: sched.createdById,
            actorRole: 'SYSTEM_SCHEDULER',
            action: 'cms.page.scheduled_publish',
            targetType: 'CmsPage',
            targetId: sched.pageId,
            reason: `Scheduled publication executed for revision ${sched.revision.revisionNumber}`,
            afterRedactedJson: {
              slug: sched.page.slug,
              publishedRevisionId: sched.revisionId,
            },
          },
        });

        await enqueueOutboxJob(tx, {
          jobType: 'TRIGGER_REVALIDATION',
          dedupeKey: `revalidate:${sched.page.slug}:${sched.revisionId}:${sched.id}`,
          payload: {
            tags: ['cms:global', `cms:page:${sched.page.slug}`],
            paths: [sched.page.slug === 'home' ? '/' : `/${sched.page.slug}`],
          },
        });
      });

      publishedPageSlugs.push(sched.page.slug);
    } catch (err) {
      failedScheduleIds.push(sched.id);
      await client.cmsPublishSchedule.update({
        where: { id: sched.id },
        data: {
          status: 'FAILED',
          errorMessage: err instanceof Error ? err.message.slice(0, 500) : 'Unknown publish failure',
        },
      });
    }
  }

  return { publishedPageSlugs, failedScheduleIds };
}
