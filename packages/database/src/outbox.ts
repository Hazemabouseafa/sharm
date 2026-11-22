import { OutboxJob, Prisma, PrismaClient } from '@prisma/client';

export type OutboxJobType =
  | 'SEND_EMAIL'
  | 'EXPIRE_HOLDS'
  | 'PUBLISH_SCHEDULED_CMS'
  | 'PROCESS_MEDIA_DERIVATIVES'
  | 'TRIGGER_REVALIDATION'
  | 'PRETRANSLATE_CONTENT';

export interface EnqueueJobInput {
  jobType: OutboxJobType;
  payload: Record<string, unknown>;
  dedupeKey?: string;
  runAfterUtc?: Date;
  maxAttempts?: number;
}

/**
 * Enqueues a durable PostgreSQL outbox job inside an existing transaction or directly.
 * If dedupeKey already exists, safely skips duplicate creation (idempotent outbox).
 */
export async function enqueueOutboxJob(
  db: PrismaClient | Prisma.TransactionClient,
  input: EnqueueJobInput,
): Promise<OutboxJob | null> {
  if (input.dedupeKey) {
    const existing = await db.outboxJob.findUnique({
      where: { dedupeKey: input.dedupeKey },
    });
    if (existing) return existing;
  }

  try {
    return await db.outboxJob.create({
      data: {
        jobType: input.jobType,
        dedupeKey: input.dedupeKey ?? null,
        payloadJson: input.payload as Prisma.InputJsonValue,
        runAfterUtc: input.runAfterUtc ?? new Date(),
        maxAttempts: input.maxAttempts ?? 5,
      },
    });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === 'P2002' && input.dedupeKey) {
      return db.outboxJob.findUnique({ where: { dedupeKey: input.dedupeKey } });
    }
    throw err;
  }
}

/**
 * Atomically leases up to `limit` due jobs using FOR UPDATE SKIP LOCKED.
 * Also reclaims stale LEASED jobs whose lease expired (e.g. after worker crash/restart).
 */
export async function leaseOutboxJobs(
  client: PrismaClient,
  workerId: string,
  limit = 2,
  leaseSeconds = 60,
): Promise<OutboxJob[]> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + leaseSeconds * 1000);

  return client.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "OutboxJob"
      WHERE (
        status IN ('PENDING', 'FAILED') AND "runAfterUtc" <= (${now} AT TIME ZONE 'UTC')
      ) OR (
        status = 'LEASED' AND "leasedUntilUtc" <= (${now} AT TIME ZONE 'UTC')
      )
      ORDER BY "runAfterUtc" ASC, "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    await tx.outboxJob.updateMany({
      where: { id: { in: ids } },
      data: {
        status: 'LEASED',
        leasedBy: workerId,
        leasedUntilUtc: leaseUntil,
        attempts: { increment: 1 },
      },
    });
    return tx.outboxJob.findMany({ where: { id: { in: ids } } });
  });
}

export async function completeOutboxJob(client: PrismaClient, jobId: string): Promise<void> {
  await client.outboxJob.update({
    where: { id: jobId },
    data: {
      status: 'COMPLETED',
      leasedUntilUtc: null,
      lastError: null,
    },
  });
}

export async function failOutboxJob(
  client: PrismaClient,
  job: Pick<OutboxJob, 'id' | 'attempts' | 'maxAttempts'>,
  errorMessage: string,
): Promise<void> {
  const isDead = job.attempts >= job.maxAttempts;
  const backoffSeconds = Math.min(900, 15 * 2 ** Math.max(0, job.attempts - 1));
  await client.outboxJob.update({
    where: { id: job.id },
    data: {
      status: isDead ? 'DEAD' : 'FAILED',
      leasedUntilUtc: null,
      lastError: errorMessage.slice(0, 1500),
      runAfterUtc: isDead ? new Date() : new Date(Date.now() + backoffSeconds * 1000),
    },
  });
}
