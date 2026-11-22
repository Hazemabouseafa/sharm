'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Calendar, CheckCircle2, Info, Tag } from 'lucide-react';
import { formatMinorUnitsExact } from '@sharm/contracts';
import { clientApi } from '@/lib/api';

export interface TourDepartureOption {
  id: string;
  departureDate: string;
  startTime: string;
  timezone: string;
  capacity: number;
  remainingSeats: number;
  status: string;
  bookable: boolean;
  unavailableReason: string | null;
}

export interface TourAddonOption {
  id: string;
  title: string;
  description: string;
  pricingBasis: 'PER_PERSON' | 'PER_BOOKING';
  priceMinor: number;
  currency: string;
  maxQuantity: number;
}

export interface TourPickupOption {
  id: string;
  name: string;
  surchargeMinor: number;
  pricingBasis: 'PER_PERSON' | 'PER_BOOKING';
  requiresHotelDetails: boolean;
}

interface ServerQuoteResponse {
  quoteId: string;
  expiresAt: string;
  remainingSeats: number;
  requiresHotelDetails: boolean;
  quote: {
    currency: string;
    pricingVersion: number;
    seatsRequired: number;
    grandTotalMinor: number;
    dueNowMinor: number;
    dueLaterMinor: number;
    discountMinor: number;
    lineItems: Array<{ kind: string; label: string; quantity: number; totalMinor: number }>;
  };
}

export function TourDetailBookingPanel({
  tour,
  departures,
  initialDate,
  paymentOptions,
  demoMode,
}: {
  tour: {
    id: string;
    slug: string;
    title: string;
    pricingMode: string;
    currency: string;
    startingPriceMinor: number;
    minAdults: number;
    maxPartySize: number;
    ageBands: Array<{ code: string; label: string; priceMinor: number; consumesSeat: boolean }>;
    addons: TourAddonOption[];
    pickupZones: TourPickupOption[];
  };
  departures: TourDepartureOption[];
  initialDate?: string;
  paymentOptions: { payLaterEnabled: boolean; bankTransferEnabled: boolean; onlineEnabled: boolean };
  demoMode: boolean;
}) {
  const router = useRouter();
  const firstBookable =
    departures.find((d) => d.bookable && (!initialDate || d.departureDate === initialDate)) ??
    departures.find((d) => d.bookable);

  const [departureId, setDepartureId] = useState(firstBookable?.id || '');
  const [adults, setAdults] = useState(Math.max(tour.minAdults, 2));
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [selectedAddons, setSelectedAddons] = useState<Record<string, number>>({});
  const [pickupZoneId, setPickupZoneId] = useState(tour.pickupZones[0]?.id || '');
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState('');
  const [quoteData, setQuoteData] = useState<ServerQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [loadingQuote, setLoadingQuote] = useState(false);

  const hasChildBand = tour.ageBands.some((b) => b.code === 'CHILD');
  const hasInfantBand = tour.ageBands.some((b) => b.code === 'INFANT');
  const defaultChoice = paymentOptions.payLaterEnabled
    ? 'PAY_LATER'
    : paymentOptions.bankTransferEnabled
      ? 'BANK_TRANSFER'
      : 'PAY_LATER';

  useEffect(() => {
    if (!departureId) {
      setQuoteData(null);
      return;
    }
    let cancelled = false;
    async function fetchQuote() {
      setLoadingQuote(true);
      setQuoteError('');
      try {
        const addons = Object.entries(selectedAddons)
          .filter(([, q]) => q > 0)
          .map(([addonId, quantity]) => ({ addonId, quantity }));
        const res = await clientApi<ServerQuoteResponse>('/public/quotes', {
          method: 'POST',
          body: {
            tourId: tour.id,
            departureId,
            adults,
            children,
            infants,
            addons,
            pickupZoneId: pickupZoneId || null,
            promoCode: appliedPromo || null,
            paymentChoice: defaultChoice,
          },
        });
        if (!cancelled) setQuoteData(res);
      } catch (err) {
        if (!cancelled) {
          setQuoteData(null);
          setQuoteError(err instanceof Error ? err.message : 'Unable to calculate quote');
        }
      } finally {
        if (!cancelled) setLoadingQuote(false);
      }
    }
    const timer = setTimeout(fetchQuote, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tour.id, departureId, adults, children, infants, selectedAddons, pickupZoneId, appliedPromo, defaultChoice]);

  function handleContinueToCheckout() {
    if (!quoteData) return;
    const params = new URLSearchParams({
      tourSlug: tour.slug,
      departureId,
      adults: String(adults),
      children: String(children),
      infants: String(infants),
      ...(pickupZoneId ? { pickupZoneId } : {}),
      ...(appliedPromo ? { promoCode: appliedPromo } : {}),
    });
    const addonsList = Object.entries(selectedAddons)
      .filter(([, q]) => q > 0)
      .map(([id, q]) => `${id}:${q}`)
      .join(',');
    if (addonsList) params.set('addons', addonsList);
    router.push(`/checkout?${params.toString()}`);
  }

  return (
    <aside
      aria-label="Book this tour"
      className="rounded-2xl border border-[#E5DFD2] bg-white p-6 shadow-md lg:sticky lg:top-24"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[#EFEAE0] pb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-[#0E7C78]" aria-hidden="true" />
          <h2 className="text-lg font-extrabold text-[#103D45]">Book This Tour</h2>
        </div>
        <span className="text-right">
          <span className="block text-xs text-[#52606D]">From</span>
          <span className="text-xl font-extrabold tabular-nums text-[#103D45]">
            {formatMinorUnitsExact(tour.startingPriceMinor, tour.currency)}
          </span>
        </span>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="book-departure" className="block text-xs font-bold uppercase tracking-wider text-[#103D45]">
            Date &amp; Departure (Africa/Cairo)
          </label>
          <select
            id="book-departure"
            value={departureId}
            onChange={(e) => setDepartureId(e.target.value)}
            className="mt-1.5 min-h-[46px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#103D45]"
          >
            {departures.length === 0 && <option value="">No upcoming departures scheduled</option>}
            {departures.map((d) => (
              <option key={d.id} value={d.id} disabled={!d.bookable}>
                {d.departureDate} · {d.startTime}{' '}
                {d.bookable ? `(${d.remainingSeats} seats left)` : `— ${d.unavailableReason || 'Unavailable'}`}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="book-adults" className="block text-xs font-bold uppercase tracking-wider text-[#103D45]">
              Adults
            </label>
            <select
              id="book-adults"
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value))}
              className="mt-1.5 min-h-[46px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#103D45]"
            >
              {Array.from({ length: Math.min(16, tour.maxPartySize) }, (_, i) => i + tour.minAdults).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {hasChildBand && (
            <div>
              <label htmlFor="book-children" className="block text-xs font-bold uppercase tracking-wider text-[#103D45]">
                Children
              </label>
              <select
                id="book-children"
                value={children}
                onChange={(e) => setChildren(Number(e.target.value))}
                className="mt-1.5 min-h-[46px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#103D45]"
              >
                {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {hasInfantBand && (
          <div>
            <label htmlFor="book-infants" className="block text-xs font-bold uppercase tracking-wider text-[#103D45]">
              Infants (0–3 yrs)
            </label>
            <select
              id="book-infants"
              value={infants}
              onChange={(e) => setInfants(Number(e.target.value))}
              className="mt-1.5 min-h-[46px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#103D45]"
            >
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}

        {tour.pickupZones.length > 0 && (
          <div>
            <label htmlFor="book-pickup" className="block text-xs font-bold uppercase tracking-wider text-[#103D45]">
              Pickup Zone
            </label>
            <select
              id="book-pickup"
              value={pickupZoneId}
              onChange={(e) => setPickupZoneId(e.target.value)}
              className="mt-1.5 min-h-[46px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#103D45]"
            >
              {tour.pickupZones.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.surchargeMinor > 0 ? `(+${formatMinorUnitsExact(p.surchargeMinor, tour.currency)})` : '(Included)'}
                </option>
              ))}
            </select>
          </div>
        )}

        {tour.addons.length > 0 && (
          <fieldset>
            <legend className="text-xs font-bold uppercase tracking-wider text-[#103D45]">
              Optional Add-ons
            </legend>
            <div className="mt-2 divide-y divide-[#EFEAE0] rounded-xl bg-[#FAF8F4] px-3.5">
              {tour.addons.map((addon) => {
                const checked = (selectedAddons[addon.id] ?? 0) > 0;
                return (
                  <div
                    key={addon.id}
                    className="flex items-start justify-between gap-3 py-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        id={`addon-${addon.id}`}
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setSelectedAddons((prev) => ({
                            ...prev,
                            [addon.id]: e.target.checked ? (addon.pricingBasis === 'PER_PERSON' ? adults + children : 1) : 0,
                          }))
                        }
                        className="mt-0.5 h-5 w-5 rounded border-[#94A3B8] accent-[#0E7C78]"
                      />
                      <label htmlFor={`addon-${addon.id}`} className="text-xs font-semibold text-[#103D45] cursor-pointer">
                        {addon.title}
                        <span className="block font-normal text-[#52606D]">
                          {addon.pricingBasis === 'PER_PERSON' ? 'Per person' : 'Per booking'}
                        </span>
                      </label>
                    </div>
                    <span className="shrink-0 text-xs font-extrabold tabular-nums text-[#103D45]">
                      +{formatMinorUnitsExact(addon.priceMinor, addon.currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          </fieldset>
        )}

        {/* Promo code */}
        <div>
          <label htmlFor="book-promo" className="block text-xs font-bold uppercase tracking-wider text-[#103D45]">
            Promo Code (Optional)
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="book-promo"
              type="text"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              placeholder="e.g. WELCOME10"
              className="min-h-[44px] flex-1 rounded-xl border border-[#CBD5E1] px-3 text-sm uppercase text-[#103D45]"
            />
            <button
              type="button"
              onClick={() => setAppliedPromo(promoCode.trim())}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-[#103D45] px-3.5 text-xs font-bold text-[#103D45] hover:bg-[#103D45] hover:text-white"
            >
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              Apply
            </button>
          </div>
        </div>

        {/* Live Server-Computed Quote Breakdown */}
        <div aria-live="polite" className="rounded-xl bg-[#FAF8F4] p-4">
          {loadingQuote && <p className="text-xs font-medium text-[#52606D]">Calculating live server quote...</p>}
          {quoteError && <p role="alert" className="text-xs font-semibold text-rose-800">{quoteError}</p>}
          {quoteData && !loadingQuote && (
            <div className="space-y-1.5 text-sm">
              {quoteData.quote.lineItems.map((li, i) => (
                <div key={`${li.label}-${i}`} className="flex items-center justify-between gap-2 text-xs text-[#334155]">
                  <span>{li.label}</span>
                  <span className={`tabular-nums ${li.totalMinor < 0 ? 'font-bold text-emerald-700' : 'font-semibold'}`}>
                    {formatMinorUnitsExact(li.totalMinor, quoteData.quote.currency)}
                  </span>
                </div>
              ))}
              <div className="mt-2 flex items-center justify-between border-t border-[#E5DFD2] pt-2 text-base font-extrabold text-[#103D45]">
                <span>Total</span>
                <span className="tabular-nums">{formatMinorUnitsExact(quoteData.quote.grandTotalMinor, quoteData.quote.currency)}</span>
              </div>
              <p className="text-xs font-medium tabular-nums text-[#52606D]">
                Seats allocated: {quoteData.quote.seatsRequired} · {quoteData.remainingSeats} remaining
              </p>
            </div>
          )}
        </div>

        {demoMode && (
          <p className="inline-flex items-center gap-1.5 rounded-lg bg-[#FDF6E7] px-3 py-1.5 text-xs font-medium text-[#8A5A10]">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Demo pricing — confirm final rates before live launch
          </p>
        )}

        <button
          type="button"
          disabled={!quoteData || loadingQuote}
          onClick={handleContinueToCheckout}
          className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-full bg-[#0E7C78] px-6 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#103D45] disabled:opacity-50"
        >
          <span>Continue to Booking</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>

        <p className="flex items-center justify-center gap-1.5 text-xs text-[#52606D]">
          <CheckCircle2 className="h-3.5 w-3.5 text-[#0E7C78]" aria-hidden="true" />
          No account required · Transparent pricing upfront
        </p>
      </div>
    </aside>
  );
}
