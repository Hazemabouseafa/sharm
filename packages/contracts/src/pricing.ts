import { applyBasisPoints, assertMinorUnitsInteger } from './money';

export type PricingMode = 'PER_PERSON' | 'PRIVATE_GROUP';
export type AddonPricingBasis = 'PER_PERSON' | 'PER_BOOKING';
export type DiscountType = 'FIXED' | 'PERCENT';

export interface AgeBandRule {
  code: 'ADULT' | 'CHILD' | 'INFANT';
  label: string;
  minAge: number;
  maxAge: number | null;
  priceMinor: number; // for PER_PERSON
  consumesSeat: boolean;
}

export interface TourPricingConfig {
  currency: string;
  pricingMode: PricingMode;
  pricingVersion: number;
  privateGroupPriceMinor: number | null;
  minAdults: number;
  minPartySize: number;
  maxPartySize: number;
  ageBands: AgeBandRule[];
  taxIncluded: boolean;
  taxRateBps: number; // e.g. 1400 = 14%
  serviceFeeIncluded: boolean;
  serviceFeeBps: number;
  depositEnabled: boolean;
  depositPercentBps: number; // e.g. 2500 = 25%, 10000 = 100%
}

export interface DeparturePricingOverride {
  adultPriceMinor?: number | null;
  childPriceMinor?: number | null;
  infantPriceMinor?: number | null;
  privateGroupPriceMinor?: number | null;
}

export interface AddonPricingRule {
  id: string;
  title: string;
  pricingBasis: AddonPricingBasis;
  priceMinor: number;
  maxQuantity: number;
  eligibleBands?: Array<'ADULT' | 'CHILD' | 'INFANT'>;
}

export interface PickupZoneRule {
  id: string;
  name: string;
  surchargeMinor: number;
  pricingBasis: AddonPricingBasis;
  requiresHotelDetails: boolean;
}

export interface PromotionRule {
  id: string;
  code: string;
  discountType: DiscountType;
  value: number; // minor units for FIXED, basis points (1000 = 10%) for PERCENT
  minOrderMinor: number;
}

export interface QuoteInput {
  tour: TourPricingConfig;
  departureOverride?: DeparturePricingOverride | null;
  travelers: {
    adults: number;
    children: number;
    infants: number;
  };
  selectedAddons: Array<{ addon: AddonPricingRule; quantity: number }>;
  pickupZone?: PickupZoneRule | null;
  promotion?: PromotionRule | null;
  paymentChoice: 'PAY_LATER' | 'BANK_TRANSFER' | 'ONLINE_FULL' | 'ONLINE_DEPOSIT';
}

export interface QuoteLineItem {
  kind: 'BASE' | 'ADDON' | 'PICKUP' | 'DISCOUNT' | 'TAX' | 'SERVICE_FEE';
  referenceId?: string;
  label: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
}

export interface ComputedQuote {
  currency: string;
  pricingMode: PricingMode;
  pricingVersion: number;
  seatsRequired: number;
  totalTravelers: number;
  baseSubtotalMinor: number;
  addonsSubtotalMinor: number;
  pickupSubtotalMinor: number;
  grossSubtotalMinor: number;
  discountMinor: number;
  taxableBaseMinor: number;
  taxMinor: number;
  serviceFeeMinor: number;
  grandTotalMinor: number;
  dueNowMinor: number;
  dueLaterMinor: number;
  lineItems: QuoteLineItem[];
}

/**
 * Validates that age bands are strictly disjoint and cover valid non-negative ages.
 */
export function validateDisjointAgeBands(bands: AgeBandRule[]): void {
  const sorted = [...bands].sort((a, b) => a.minAge - b.minAge);
  for (let i = 0; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr.minAge < 0) {
      throw new Error(`Age band ${curr.code} minAge cannot be negative`);
    }
    if (curr.maxAge !== null && curr.maxAge < curr.minAge) {
      throw new Error(`Age band ${curr.code} maxAge (${curr.maxAge}) < minAge (${curr.minAge})`);
    }
    assertMinorUnitsInteger(curr.priceMinor, `${curr.code}.priceMinor`);
    if (curr.priceMinor < 0) {
      throw new Error(`Age band ${curr.code} price cannot be negative`);
    }
    if (i > 0) {
      const prev = sorted[i - 1];
      if (prev.maxAge === null || prev.maxAge >= curr.minAge) {
        throw new Error(
          `Age bands ${prev.code} and ${curr.code} overlap (${prev.minAge}-${prev.maxAge ?? '+'} vs ${curr.minAge}-${curr.maxAge ?? '+'})`,
        );
      }
    }
  }
}

/**
 * Pure server-side pricing engine.
 * Rounding & calculation order:
 * 1. Base price (per-person age bands or private group fixed price)
 * 2. Add-ons (PER_PERSON multiplies by eligible travelers; PER_BOOKING multiplies by quantity)
 * 3. Pickup surcharge (PER_PERSON by seated travelers or PER_BOOKING once)
 * 4. Gross subtotal = Base + Add-ons + Pickup
 * 5. Promotion discount (FIXED minor units or PERCENT basis points via half-up rounding, capped at Gross subtotal)
 * 6. Taxable base = Gross subtotal - Discount
 * 7. Excluded Service Fee (if not included) and Excluded Tax (if not included), each half-up rounded on Taxable base
 * 8. Grand total = Taxable base + Excluded Service Fee + Excluded Tax
 * 9. Due now / Due later split according to paymentChoice and depositPercentBps
 */
export function computeServerQuote(input: QuoteInput): ComputedQuote {
  const { tour, departureOverride, travelers, selectedAddons, pickupZone, promotion, paymentChoice } = input;

  validateDisjointAgeBands(tour.ageBands);

  for (const [k, v] of Object.entries(travelers)) {
    if (!Number.isInteger(v) || v < 0) {
      throw new Error(`Traveler count ${k} must be a non-negative integer`);
    }
  }

  const totalTravelers = travelers.adults + travelers.children + travelers.infants;
  if (travelers.adults < tour.minAdults) {
    throw new Error(`At least ${tour.minAdults} adult(s) required for this tour`);
  }
  if (totalTravelers < tour.minPartySize) {
    throw new Error(`Minimum party size is ${tour.minPartySize}`);
  }
  if (totalTravelers > tour.maxPartySize) {
    throw new Error(`Maximum party size is ${tour.maxPartySize}`);
  }

  const bandMap = new Map<AgeBandRule['code'], AgeBandRule>();
  for (const b of tour.ageBands) bandMap.set(b.code, b);

  const adultBand = bandMap.get('ADULT');
  const childBand = bandMap.get('CHILD');
  const infantBand = bandMap.get('INFANT');

  if (!adultBand) {
    throw new Error('Tour pricing configuration is missing ADULT age band');
  }
  if (travelers.children > 0 && !childBand) {
    throw new Error('Children are not permitted on this tour');
  }
  if (travelers.infants > 0 && !infantBand) {
    throw new Error('Infants are not permitted on this tour');
  }

  const seatsRequired =
    (adultBand.consumesSeat ? travelers.adults : 0) +
    (childBand?.consumesSeat ? travelers.children : 0) +
    (infantBand?.consumesSeat ? travelers.infants : 0);

  if (seatsRequired <= 0) {
    throw new Error('Booking must allocate at least one seat');
  }

  const lineItems: QuoteLineItem[] = [];
  let baseSubtotalMinor = 0;

  if (tour.pricingMode === 'PRIVATE_GROUP') {
    const unitPrice =
      departureOverride?.privateGroupPriceMinor ?? tour.privateGroupPriceMinor;
    if (unitPrice === null || unitPrice === undefined) {
      throw new Error('Private group price is not configured');
    }
    assertMinorUnitsInteger(unitPrice, 'privateGroupPriceMinor');
    baseSubtotalMinor = unitPrice;
    lineItems.push({
      kind: 'BASE',
      label: `Private group (up to ${tour.maxPartySize} guests)`,
      quantity: 1,
      unitPriceMinor: unitPrice,
      totalMinor: unitPrice,
    });
  } else {
    const adultUnit = departureOverride?.adultPriceMinor ?? adultBand.priceMinor;
    const childUnit = departureOverride?.childPriceMinor ?? childBand?.priceMinor ?? 0;
    const infantUnit = departureOverride?.infantPriceMinor ?? infantBand?.priceMinor ?? 0;

    if (travelers.adults > 0) {
      const total = adultUnit * travelers.adults;
      baseSubtotalMinor += total;
      lineItems.push({
        kind: 'BASE',
        label: `${adultBand.label} (${travelers.adults})`,
        quantity: travelers.adults,
        unitPriceMinor: adultUnit,
        totalMinor: total,
      });
    }
    if (travelers.children > 0 && childBand) {
      const total = childUnit * travelers.children;
      baseSubtotalMinor += total;
      lineItems.push({
        kind: 'BASE',
        label: `${childBand.label} (${travelers.children})`,
        quantity: travelers.children,
        unitPriceMinor: childUnit,
        totalMinor: total,
      });
    }
    if (travelers.infants > 0 && infantBand) {
      const total = infantUnit * travelers.infants;
      baseSubtotalMinor += total;
      lineItems.push({
        kind: 'BASE',
        label: `${infantBand.label} (${travelers.infants})`,
        quantity: travelers.infants,
        unitPriceMinor: infantUnit,
        totalMinor: total,
      });
    }
  }

  // Add-ons
  let addonsSubtotalMinor = 0;
  for (const { addon, quantity } of selectedAddons) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`Invalid add-on quantity for ${addon.title}`);
    }
    if (quantity > addon.maxQuantity) {
      throw new Error(`Add-on "${addon.title}" exceeds maximum quantity (${addon.maxQuantity})`);
    }
    assertMinorUnitsInteger(addon.priceMinor, `addon:${addon.id}`);

    let effectiveQty = quantity;
    if (addon.pricingBasis === 'PER_PERSON') {
      const eligible = addon.eligibleBands ?? ['ADULT', 'CHILD'];
      const eligibleCount =
        (eligible.includes('ADULT') ? travelers.adults : 0) +
        (eligible.includes('CHILD') ? travelers.children : 0) +
        (eligible.includes('INFANT') ? travelers.infants : 0);
      if (eligibleCount === 0) {
        throw new Error(`No travelers are eligible for add-on "${addon.title}"`);
      }
      effectiveQty = Math.min(quantity, eligibleCount * addon.maxQuantity);
    }

    const total = addon.priceMinor * effectiveQty;
    addonsSubtotalMinor += total;
    lineItems.push({
      kind: 'ADDON',
      referenceId: addon.id,
      label: addon.title,
      quantity: effectiveQty,
      unitPriceMinor: addon.priceMinor,
      totalMinor: total,
    });
  }

  // Pickup surcharge
  let pickupSubtotalMinor = 0;
  if (pickupZone && pickupZone.surchargeMinor > 0) {
    assertMinorUnitsInteger(pickupZone.surchargeMinor, 'pickupZone.surchargeMinor');
    const qty = pickupZone.pricingBasis === 'PER_PERSON' ? seatsRequired : 1;
    pickupSubtotalMinor = pickupZone.surchargeMinor * qty;
    lineItems.push({
      kind: 'PICKUP',
      referenceId: pickupZone.id,
      label: `Pickup surcharge (${pickupZone.name})`,
      quantity: qty,
      unitPriceMinor: pickupZone.surchargeMinor,
      totalMinor: pickupSubtotalMinor,
    });
  }

  const grossSubtotalMinor = baseSubtotalMinor + addonsSubtotalMinor + pickupSubtotalMinor;

  // Promotion discount (non-stacking single promo)
  let discountMinor = 0;
  if (promotion) {
    if (grossSubtotalMinor < promotion.minOrderMinor) {
      throw new Error(`Minimum order not met for promotion ${promotion.code}`);
    }
    if (promotion.discountType === 'FIXED') {
      discountMinor = Math.min(grossSubtotalMinor, Math.max(0, promotion.value));
    } else {
      discountMinor = Math.min(grossSubtotalMinor, applyBasisPoints(grossSubtotalMinor, promotion.value));
    }
    if (discountMinor > 0) {
      lineItems.push({
        kind: 'DISCOUNT',
        referenceId: promotion.id,
        label: `Promo (${promotion.code})`,
        quantity: 1,
        unitPriceMinor: -discountMinor,
        totalMinor: -discountMinor,
      });
    }
  }

  const taxableBaseMinor = Math.max(0, grossSubtotalMinor - discountMinor);

  const serviceFeeMinor =
    !tour.serviceFeeIncluded && tour.serviceFeeBps > 0
      ? applyBasisPoints(taxableBaseMinor, tour.serviceFeeBps)
      : 0;
  if (serviceFeeMinor > 0) {
    lineItems.push({
      kind: 'SERVICE_FEE',
      label: `Service fee (${(tour.serviceFeeBps / 100).toFixed(2).replace(/\.00$/, '')}%)`,
      quantity: 1,
      unitPriceMinor: serviceFeeMinor,
      totalMinor: serviceFeeMinor,
    });
  }

  const taxMinor =
    !tour.taxIncluded && tour.taxRateBps > 0
      ? applyBasisPoints(taxableBaseMinor, tour.taxRateBps)
      : 0;
  if (taxMinor > 0) {
    lineItems.push({
      kind: 'TAX',
      label: `Taxes (${(tour.taxRateBps / 100).toFixed(2).replace(/\.00$/, '')}%)`,
      quantity: 1,
      unitPriceMinor: taxMinor,
      totalMinor: taxMinor,
    });
  }

  const grandTotalMinor = taxableBaseMinor + serviceFeeMinor + taxMinor;

  let dueNowMinor = 0;
  let dueLaterMinor = grandTotalMinor;
  if (paymentChoice === 'ONLINE_FULL') {
    dueNowMinor = grandTotalMinor;
    dueLaterMinor = 0;
  } else if (paymentChoice === 'ONLINE_DEPOSIT') {
    if (!tour.depositEnabled || tour.depositPercentBps <= 0) {
      throw new Error('Deposit payment is not enabled for this tour');
    }
    dueNowMinor = applyBasisPoints(grandTotalMinor, tour.depositPercentBps);
    dueLaterMinor = grandTotalMinor - dueNowMinor;
  } else if (paymentChoice === 'BANK_TRANSFER') {
    dueNowMinor = tour.depositEnabled && tour.depositPercentBps > 0
      ? applyBasisPoints(grandTotalMinor, tour.depositPercentBps)
      : grandTotalMinor;
    dueLaterMinor = grandTotalMinor - dueNowMinor;
  } else {
    // PAY_LATER
    dueNowMinor = 0;
    dueLaterMinor = grandTotalMinor;
  }

  return {
    currency: tour.currency,
    pricingMode: tour.pricingMode,
    pricingVersion: tour.pricingVersion,
    seatsRequired,
    totalTravelers,
    baseSubtotalMinor,
    addonsSubtotalMinor,
    pickupSubtotalMinor,
    grossSubtotalMinor,
    discountMinor,
    taxableBaseMinor,
    taxMinor,
    serviceFeeMinor,
    grandTotalMinor,
    dueNowMinor,
    dueLaterMinor,
    lineItems,
  };
}
