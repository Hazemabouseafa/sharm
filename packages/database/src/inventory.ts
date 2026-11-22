import { Prisma } from '@prisma/client';

export interface LockedDepartureRow {
  id: string;
  tourId: string;
  departureDate: string;
  startTime: string;
  startUtc: Date;
  capacity: number;
  bookedSeats: number;
  heldSeats: number;
  status: string;
  cutoffHours: number;
  adultPriceOverrideMinor: number | null;
  childPriceOverrideMinor: number | null;
  infantPriceOverrideMinor: number | null;
  privateGroupPriceOverrideMinor: number | null;
}

export interface LockedPromotionRow {
  id: string;
  code: string;
  discountType: string;
  value: number;
  currency: string;
  minOrderMinor: number;
  validFrom: Date;
  validUntil: Date;
  maxTotalUses: number | null;
  usedCount: number;
  maxUsesPerEmail: number | null;
  isActive: boolean;
}

/**
 * Locks a Departure row using PostgreSQL SELECT ... FOR UPDATE.
 * Always lock departures in ascending ID order when locking multiple departures (e.g. reschedule)
 * to guarantee deadlock-free consistent lock ordering.
 */
export async function lockDeparturesForUpdate(
  tx: Prisma.TransactionClient,
  departureIds: string[],
): Promise<Map<string, LockedDepartureRow>> {
  const uniqueSorted = [...new Set(departureIds)].sort();
  const rows = await tx.$queryRaw<LockedDepartureRow[]>`
    SELECT
      id,
      "tourId",
      "departureDate",
      "startTime",
      "startUtc",
      capacity,
      "bookedSeats",
      "heldSeats",
      status::text as status,
      "cutoffHours",
      "adultPriceOverrideMinor",
      "childPriceOverrideMinor",
      "infantPriceOverrideMinor",
      "privateGroupPriceOverrideMinor"
    FROM "Departure"
    WHERE id = ANY(${uniqueSorted}::text[])
    ORDER BY id ASC
    FOR UPDATE
  `;
  const map = new Map<string, LockedDepartureRow>();
  for (const r of rows) map.set(r.id, r);
  return map;
}

export async function lockPromotionForUpdate(
  tx: Prisma.TransactionClient,
  promotionId: string,
): Promise<LockedPromotionRow | null> {
  const rows = await tx.$queryRaw<LockedPromotionRow[]>`
    SELECT
      id,
      code,
      "discountType"::text as "discountType",
      value,
      currency,
      "minOrderMinor",
      "validFrom",
      "validUntil",
      "maxTotalUses",
      "usedCount",
      "maxUsesPerEmail",
      "isActive"
    FROM "Promotion"
    WHERE id = ${promotionId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

export function remainingSeats(dep: Pick<LockedDepartureRow, 'capacity' | 'bookedSeats' | 'heldSeats'>): number {
  return dep.capacity - dep.bookedSeats - dep.heldSeats;
}

/**
 * Releases held or booked allocation for a single booking idempotently (checks allocationActive).
 * Must be called inside a transaction where the departure row is locked FOR UPDATE.
 */
export async function releaseBookingAllocationInTx(
  tx: Prisma.TransactionClient,
  booking: {
    id: string;
    departureId: string;
    status: string;
    seatsAllocated: number;
    allocationActive: boolean;
    promotionId: string | null;
  },
): Promise<boolean> {
  if (!booking.allocationActive) return false;

  const isConfirmedSeat = booking.status === 'CONFIRMED' || booking.status === 'COMPLETED' || booking.status === 'NO_SHOW';
  if (isConfirmedSeat) {
    await tx.departure.update({
      where: { id: booking.departureId },
      data: { bookedSeats: { decrement: booking.seatsAllocated } },
    });
  } else {
    await tx.departure.update({
      where: { id: booking.departureId },
      data: { heldSeats: { decrement: booking.seatsAllocated } },
    });
  }

  await tx.booking.update({
    where: { id: booking.id },
    data: { allocationActive: false },
  });

  if (booking.promotionId) {
    const redemption = await tx.promotionRedemption.findUnique({
      where: { bookingId: booking.id },
    });
    if (redemption && redemption.status !== 'RELEASED') {
      await tx.promotionRedemption.update({
        where: { id: redemption.id },
        data: { status: 'RELEASED' },
      });
      await tx.$executeRaw`
        UPDATE "Promotion"
        SET "usedCount" = GREATEST(0, "usedCount" - 1)
        WHERE id = ${booking.promotionId}
      `;
    }
  }

  return true;
}

/**
 * Runs a Prisma transaction with bounded retry on serialization/deadlock errors (40001 / 40P01).
 */
export async function runWithSerializableRetry<T>(
  client: { $transaction: <R>(fn: (tx: Prisma.TransactionClient) => Promise<R>, opts?: { isolationLevel?: Prisma.TransactionIsolationLevel; maxWait?: number; timeout?: number }) => Promise<R> },
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await client.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10000,
        timeout: 15000,
      });
    } catch (err: unknown) {
      lastErr = err;
      const code = (err as { code?: string; meta?: { code?: string } })?.code || (err as { meta?: { code?: string } })?.meta?.code;
      const msg = err instanceof Error ? err.message : '';
      const isRetryable = code === 'P2034' || code === '40001' || code === '40P01' || msg.includes('deadlock') || msg.includes('could not serialize');
      if (!isRetryable || attempt === maxAttempts) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 25 * attempt + Math.floor(Math.random() * 25)));
    }
  }
  throw lastErr;
}
