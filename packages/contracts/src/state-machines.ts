export const BOOKING_STATUSES = [
  'REQUESTED',
  'HELD',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
  'COMPLETED',
  'NO_SHOW',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'UNPAID',
  'PENDING',
  'PARTIALLY_PAID',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'FAILED',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ALLOWED_BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  REQUESTED: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
  HELD: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['CANCELLED', 'COMPLETED', 'NO_SHOW'],
  CANCELLED: [],
  EXPIRED: ['CONFIRMED', 'CANCELLED'], // CONFIRMED only when atomically reacquiring available seats (e.g. staff/late-payment reacquisition)
  COMPLETED: [],
  NO_SHOW: [],
};

export const ALLOWED_PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  UNPAID: ['PENDING', 'PARTIALLY_PAID', 'PAID', 'FAILED'],
  PENDING: ['PARTIALLY_PAID', 'PAID', 'FAILED', 'UNPAID'],
  PARTIALLY_PAID: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  PAID: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  PARTIALLY_REFUNDED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  REFUNDED: [],
  FAILED: ['PENDING', 'PARTIALLY_PAID', 'PAID'],
};

export function canTransitionBookingStatus(from: BookingStatus, to: BookingStatus): boolean {
  if (from === to) return false;
  return ALLOWED_BOOKING_TRANSITIONS[from].includes(to);
}

export function canTransitionPaymentStatus(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) return false;
  return ALLOWED_PAYMENT_TRANSITIONS[from].includes(to);
}

/**
 * Computes authoritative payment status from immutable payment/refund ledger sums.
 * Never rolls a paid order backward due to a stale/failed webhook.
 */
export function computePaymentStatusFromLedger(params: {
  totalMinor: number;
  capturedMinor: number;
  refundedMinor: number;
  hasPendingAttempt: boolean;
  hasFailedAttempt: boolean;
}): PaymentStatus {
  const { totalMinor, capturedMinor, refundedMinor, hasPendingAttempt, hasFailedAttempt } = params;
  if (capturedMinor > 0) {
    if (refundedMinor >= capturedMinor) return 'REFUNDED';
    if (refundedMinor > 0) return 'PARTIALLY_REFUNDED';
    if (capturedMinor >= totalMinor && totalMinor > 0) return 'PAID';
    return 'PARTIALLY_PAID';
  }
  if (hasPendingAttempt) return 'PENDING';
  if (hasFailedAttempt) return 'FAILED';
  return 'UNPAID';
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  REQUESTED: 'Booking request received — awaiting confirmation',
  HELD: 'Temporarily held — awaiting payment',
  CONFIRMED: 'Booking confirmed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  COMPLETED: 'Completed',
  NO_SHOW: 'No-show',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: 'Unpaid (Pay Later)',
  PENDING: 'Payment pending verification',
  PARTIALLY_PAID: 'Deposit paid',
  PAID: 'Paid in full',
  PARTIALLY_REFUNDED: 'Partially refunded',
  REFUNDED: 'Refunded',
  FAILED: 'Payment failed',
};
