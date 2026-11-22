import { describe, expect, it } from 'vitest';
import {
  applyBasisPoints,
  assertMinorUnitsInteger,
  cairoLocalToUtc,
  canTransitionBookingStatus,
  canTransitionPaymentStatus,
  computePaymentStatusFromLedger,
  computeServerQuote,
  escapeCsvCell,
  formatMinorUnits,
  formatMinorUnitsExact,
  generateRecurringCairoDates,
  isPastBookingCutoff,
  roleHasPermission,
  validateDisjointAgeBands,
  validatePageBlocks,
  type TourPricingConfig,
} from '@sharm/contracts';

const basePerPersonTour: TourPricingConfig = {
  currency: 'USD',
  pricingMode: 'PER_PERSON',
  pricingVersion: 3,
  privateGroupPriceMinor: null,
  minAdults: 1,
  minPartySize: 1,
  maxPartySize: 12,
  ageBands: [
    {
      code: 'ADULT',
      label: 'Adult (12+)',
      minAge: 12,
      maxAge: 99,
      priceMinor: 8500,
      consumesSeat: true,
    },
    {
      code: 'CHILD',
      label: 'Child (4-11)',
      minAge: 4,
      maxAge: 11,
      priceMinor: 4500,
      consumesSeat: true,
    },
    {
      code: 'INFANT',
      label: 'Infant (0-3)',
      minAge: 0,
      maxAge: 3,
      priceMinor: 0,
      consumesSeat: false,
    },
  ],
  taxIncluded: false,
  taxRateBps: 1400, // 14%
  serviceFeeIncluded: false,
  serviceFeeBps: 500, // 5%
  depositEnabled: true,
  depositPercentBps: 3000, // 30%
};

describe('Money & CSV Security Primitives', () => {
  it('computes integer minor units and half-up basis points without floating point drift', () => {
    expect(assertMinorUnitsInteger(8550)).toBe(8550);
    expect(() => assertMinorUnitsInteger(19.99)).toThrow();
    expect(applyBasisPoints(10000, 1400)).toBe(1400);
    // Half-up rounding test: 333 * 500 / 10000 = 16.65 -> 17
    expect(applyBasisPoints(333, 500)).toBe(17);
    expect(formatMinorUnits(12500, 'USD')).toBe('$125');
    expect(formatMinorUnitsExact(12550, 'USD')).toBe('$125.50');
  });

  it('neutralizes CSV formula injection payloads', () => {
    expect(escapeCsvCell('=cmd|\' /C calc\'!A0')).toBe('\'=cmd|\' /C calc\'!A0');
    expect(escapeCsvCell('+SUM(A1:A2)')).toBe('\'+SUM(A1:A2)');
    expect(escapeCsvCell('-2+3')).toBe('\'-2+3');
    expect(escapeCsvCell('@IMPORTXML()')).toBe('\'@IMPORTXML()');
    expect(escapeCsvCell('Normal guest, Jr.')).toBe('"Normal guest, Jr."');
  });
});

describe('Pricing Engine (PER_PERSON & PRIVATE_GROUP)', () => {
  it('calculates PER_PERSON quote with disjoint age bands, add-ons, pickup, promo, tax, and deposit', () => {
    const quote = computeServerQuote({
      tour: basePerPersonTour,
      travelers: {
        adults: 2,
        children: 1,
        infants: 1,
      },
      selectedAddons: [
        {
          addon: {
            id: 'photo',
            title: 'Underwater Photo Pack',
            pricingBasis: 'PER_BOOKING',
            priceMinor: 2500,
            maxQuantity: 2,
          },
          quantity: 1,
        },
        {
          addon: {
            id: 'wetsuit',
            title: 'Wetsuit Rental',
            pricingBasis: 'PER_PERSON',
            priceMinor: 1000,
            maxQuantity: 4,
            eligibleBands: ['ADULT', 'CHILD'],
          },
          quantity: 3,
        },
      ],
      pickupZone: {
        id: 'nabq',
        name: 'Nabq Bay',
        surchargeMinor: 500,
        pricingBasis: 'PER_PERSON',
        requiresHotelDetails: true,
      },
      promotion: {
        id: 'promo-10',
        code: 'REDSEA10',
        discountType: 'PERCENT',
        value: 1000, // 10%
        minOrderMinor: 10000,
      },
      paymentChoice: 'ONLINE_DEPOSIT',
    });

    // Seats required: 2 adults + 1 child (infant consumesSeat = false) => 3 seats, 4 totalTravelers
    expect(quote.seatsRequired).toBe(3);
    expect(quote.totalTravelers).toBe(4);
    // Base: 2 * 8500 + 1 * 4500 + 1 * 0 = 21500
    expect(quote.baseSubtotalMinor).toBe(21500);
    // Add-ons: photo (2500) + wetsuit (1000 * 3 = 3000) = 5500
    expect(quote.addonsSubtotalMinor).toBe(5500);
    // Pickup: nabq PER_PERSON (500 * 3 seated = 1500)
    expect(quote.pickupSubtotalMinor).toBe(1500);
    // Gross subtotal: 21500 + 5500 + 1500 = 28500
    expect(quote.grossSubtotalMinor).toBe(28500);
    // 10% discount = 2850
    expect(quote.discountMinor).toBe(2850);
    // Taxable base: 28500 - 2850 = 25650
    expect(quote.taxableBaseMinor).toBe(25650);
    // Service fee 5% of 25650 = 1283
    expect(quote.serviceFeeMinor).toBe(1283);
    // Tax 14% of 25650 = 3591
    expect(quote.taxMinor).toBe(3591);
    // Grand total: 25650 + 1283 + 3591 = 30524
    expect(quote.grandTotalMinor).toBe(30524);
    // Deposit 30% of 30524 = 9157 due now, 21367 due later
    expect(quote.dueNowMinor).toBe(9157);
    expect(quote.dueLaterMinor).toBe(21367);
  });

  it('counts infant seat when infant band is configured with consumesSeat=true', () => {
    const tourWithInfantSeat: TourPricingConfig = {
      ...basePerPersonTour,
      ageBands: basePerPersonTour.ageBands.map((b) =>
        b.code === 'INFANT' ? { ...b, consumesSeat: true } : b,
      ),
    };
    const quote = computeServerQuote({
      tour: tourWithInfantSeat,
      travelers: { adults: 1, children: 0, infants: 1 },
      selectedAddons: [],
      paymentChoice: 'PAY_LATER',
    });
    expect(quote.seatsRequired).toBe(2);
    expect(quote.dueNowMinor).toBe(0);
    expect(quote.dueLaterMinor).toBe(quote.grandTotalMinor);
  });

  it('rejects child/infant booking without an accompanying adult', () => {
    expect(() =>
      computeServerQuote({
        tour: basePerPersonTour,
        travelers: { adults: 0, children: 2, infants: 0 },
        selectedAddons: [],
        paymentChoice: 'ONLINE_FULL',
      }),
    ).toThrow(/At least 1 adult/i);
  });

  it('detects overlapping age bands', () => {
    expect(() =>
      validateDisjointAgeBands([
        {
          code: 'ADULT',
          label: 'Adult',
          minAge: 10,
          maxAge: 99,
          priceMinor: 5000,
          consumesSeat: true,
        },
        {
          code: 'CHILD',
          label: 'Child',
          minAge: 5,
          maxAge: 12,
          priceMinor: 2500,
          consumesSeat: true,
        },
      ]),
    ).toThrow(/overlap/i);
  });

  it('calculates PRIVATE_GROUP pricing with fixed private group price and seated traveler allocation', () => {
    const privateTour: TourPricingConfig = {
      ...basePerPersonTour,
      pricingMode: 'PRIVATE_GROUP',
      privateGroupPriceMinor: 42000,
      maxPartySize: 8,
      taxIncluded: true,
      serviceFeeIncluded: true,
    };

    const quote = computeServerQuote({
      tour: privateTour,
      travelers: { adults: 4, children: 2, infants: 1 },
      selectedAddons: [],
      paymentChoice: 'ONLINE_FULL',
    });

    expect(quote.baseSubtotalMinor).toBe(42000);
    // 4 adults + 2 children consume seats, 1 infant consumesSeat = false => 6 seats
    expect(quote.seatsRequired).toBe(6);
    expect(quote.taxMinor).toBe(0);
    expect(quote.serviceFeeMinor).toBe(0);
    expect(quote.grandTotalMinor).toBe(42000);
    expect(quote.dueNowMinor).toBe(42000);
  });
});

describe('Africa/Cairo DST-Aware Date & Cutoff Logic', () => {
  it('computes UTC timestamps accurately across Egypt Summer Time (EEST UTC+3) and Standard Time (EET UTC+2)', () => {
    // January is EET (UTC+2): 08:00 local -> 06:00 UTC
    const winter = cairoLocalToUtc('2026-01-15', '08:00');
    expect(winter.utcDate.toISOString()).toBe('2026-01-15T06:00:00.000Z');
    expect(winter.offset).toBe('+02:00');

    // July is EEST (UTC+3): 08:00 local -> 05:00 UTC
    const summer = cairoLocalToUtc('2026-07-15', '08:00');
    expect(summer.utcDate.toISOString()).toBe('2026-07-15T05:00:00.000Z');
    expect(summer.offset).toBe('+03:00');

    expect(
      isPastBookingCutoff({
        departureDate: '2026-07-15',
        startTime: '08:00',
        cutoffHours: 12,
        nowUtc: new Date('2026-07-14T16:59:59.000Z'),
      }),
    ).toBe(false);

    expect(
      isPastBookingCutoff({
        departureDate: '2026-07-15',
        startTime: '08:00',
        cutoffHours: 12,
        nowUtc: new Date('2026-07-14T17:00:00.000Z'),
      }),
    ).toBe(true);
  });

  it('generates recurring PlainDate schedules without timezone drift and respects blackout dates', () => {
    const dates = generateRecurringCairoDates({
      fromDate: '2026-05-01', // Friday (ISO 5)
      toDate: '2026-05-07',
      weekdays: [5, 7], // Friday and Sunday
      blackoutDates: ['2026-05-03'],
    });
    expect(dates).toEqual(['2026-05-01']);
  });
});

describe('State Machines, Ledger Status, RBAC & CMS Block Validation', () => {
  it('enforces valid BookingStatus and PaymentStatus transitions and blocks illegal ones', () => {
    expect(canTransitionBookingStatus('REQUESTED', 'CONFIRMED')).toBe(true);
    expect(canTransitionBookingStatus('HELD', 'EXPIRED')).toBe(true);
    expect(canTransitionBookingStatus('EXPIRED', 'CONFIRMED')).toBe(true); // late-payment reacquisition path
    expect(canTransitionBookingStatus('COMPLETED', 'CANCELLED')).toBe(false);

    expect(canTransitionPaymentStatus('UNPAID', 'PENDING')).toBe(true);
    expect(canTransitionPaymentStatus('PENDING', 'PAID')).toBe(true);
    expect(canTransitionPaymentStatus('REFUNDED', 'PAID')).toBe(false);
  });

  it('computes authoritative payment status from immutable ledger sums without rolling PAID backward on out-of-order FAILED', () => {
    expect(
      computePaymentStatusFromLedger({
        totalMinor: 20000,
        capturedMinor: 20000,
        refundedMinor: 0,
        hasPendingAttempt: false,
        hasFailedAttempt: true,
      }),
    ).toBe('PAID');

    expect(
      computePaymentStatusFromLedger({
        totalMinor: 20000,
        capturedMinor: 20000,
        refundedMinor: 5000,
        hasPendingAttempt: false,
        hasFailedAttempt: false,
      }),
    ).toBe('PARTIALLY_REFUNDED');
  });

  it('enforces server-side RBAC permissions across roles', () => {
    expect(roleHasPermission('CONTENT_EDITOR', 'cms:publish')).toBe(true);
    expect(roleHasPermission('CONTENT_EDITOR', 'payments:proofs:read')).toBe(false);
    expect(roleHasPermission('CONTENT_EDITOR', 'payments:refund')).toBe(false);
    expect(roleHasPermission('FINANCE', 'payments:proofs:read')).toBe(true);
    expect(roleHasPermission('FINANCE', 'payments:refund')).toBe(true);
    expect(roleHasPermission('FINANCE', 'cms:publish')).toBe(false);
    expect(roleHasPermission('RESERVATIONS_AGENT', 'bookings:approve')).toBe(true);
    expect(roleHasPermission('RESERVATIONS_AGENT', 'team:manage')).toBe(false);
  });

  it('rejects javascript: and data: XSS URLs in CMS block schemas', () => {
    expect(() =>
      validatePageBlocks([
        {
          id: 'blk_12345',
          type: 'cta_banner',
          visible: true,
          props: {
            eyebrow: 'Offer',
            heading: 'Book Now',
            body: 'Safe body',
            primaryCtaLabel: 'Click',
            primaryCtaHref: 'javascript:alert(1)',
          },
        },
      ]),
    ).toThrow();
  });
});
