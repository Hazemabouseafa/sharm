'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  ShieldCheck,
} from 'lucide-react';
import { formatMinorUnitsExact } from '@sharm/contracts';
import { StatusBadge } from '@sharm/ui';
import { clientApi } from '@/lib/api';

interface QuotePayload {
  quoteId: string;
  expiresAt: string;
  tourTitle: string;
  departureDate: string;
  startTime: string;
  timezone: string;
  remainingSeats: number;
  requiresHotelDetails: boolean;
  policy: {
    versionId: string;
    title: string;
    bodyMarkdown: string;
    freeCancellationHours: number;
    partialRefundHours: number;
    partialRefundPercentBps: number;
  };
  quote: {
    currency: string;
    pricingVersion: number;
    seatsRequired: number;
    grandTotalMinor: number;
    dueNowMinor: number;
    dueLaterMinor: number;
    lineItems: Array<{ kind: string; label: string; quantity: number; totalMinor: number }>;
  };
}

interface BookingResult {
  bookingId: string;
  reference: string;
  status: string;
  statusLabel: string;
  paymentStatus: string;
  paymentChoice: string;
  currency: string;
  grandTotalMinor: number;
  dueNowMinor: number;
  dueLaterMinor: number;
  seatsAllocated: number;
  holdExpiresAt: string | null;
  decisionDeadlineAt: string | null;
  manageExchangeToken: string;
  bankDetails: Record<string, string> | null;
  snapshot: {
    tourTitle: string;
    departureDate: string;
    startTime: string;
    timezone: string;
  };
}

export function CheckoutClient() {
  const searchParams = useSearchParams();
  const tourSlug = searchParams.get('tourSlug') || '';
  const departureId = searchParams.get('departureId') || '';
  const adults = Number(searchParams.get('adults') || 2);
  const children = Number(searchParams.get('children') || 0);
  const infants = Number(searchParams.get('infants') || 0);
  const pickupZoneId = searchParams.get('pickupZoneId') || null;
  const promoCode = searchParams.get('promoCode') || null;
  const addonsRaw = searchParams.get('addons') || '';

  const addons = useMemo(
    () =>
      addonsRaw
        .split(',')
        .filter(Boolean)
        .map((pair) => {
          const [addonId, qty] = pair.split(':');
          return { addonId, quantity: Math.max(1, Number(qty || 1)) };
        }),
    [addonsRaw],
  );

  const [tourInfo, setTourInfo] = useState<{
    id: string;
    title: string;
    primaryImageUrl: string;
    primaryImageAlt: string;
    paymentOptions: { payLaterEnabled: boolean; bankTransferEnabled: boolean; onlineEnabled: boolean; manualRequestHoldHours: number };
  } | null>(null);
  const [paymentChoice, setPaymentChoice] = useState<'PAY_LATER' | 'BANK_TRANSFER' | 'ONLINE_FULL'>('PAY_LATER');
  const [quote, setQuote] = useState<QuotePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Guest form fields
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [nationality, setNationality] = useState('');
  const [hotelName, setHotelName] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState<BookingResult | null>(null);

  // Scoped idempotency key per quote submission attempt so double-clicks/retries never duplicate bookings!
  const idempotencyKeyRef = useRef<string>('');

  async function refreshQuote(tourId: string, choice: 'PAY_LATER' | 'BANK_TRANSFER' | 'ONLINE_FULL') {
    const q = await clientApi<QuotePayload>('/public/quotes', {
      method: 'POST',
      body: {
        tourId,
        departureId,
        adults,
        children,
        infants,
        addons,
        pickupZoneId,
        promoCode,
        paymentChoice: choice,
      },
    });
    setQuote(q);
    idempotencyKeyRef.current = `web-${q.quoteId}-${crypto.randomUUID().slice(0, 8)}`;
  }

  useEffect(() => {
    if (!tourSlug || !departureId) {
      setLoadError('Missing tour or departure selection. Please choose a tour first.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function init() {
      setLoading(true);
      setLoadError('');
      try {
        const res = await clientApi<{
          tour: { id: string; title: string; primaryImageUrl: string; primaryImageAlt: string };
          paymentOptions: { payLaterEnabled: boolean; bankTransferEnabled: boolean; onlineEnabled: boolean; manualRequestHoldHours: number };
        }>(`/public/tours/${encodeURIComponent(tourSlug)}`);
        if (cancelled) return;
        setTourInfo({ ...res.tour, paymentOptions: res.paymentOptions });
        const initialChoice: 'PAY_LATER' | 'BANK_TRANSFER' = res.paymentOptions.payLaterEnabled
          ? 'PAY_LATER'
          : 'BANK_TRANSFER';
        setPaymentChoice(initialChoice);
        await refreshQuote(res.tour.id, initialChoice);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Unable to load checkout quote.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [tourSlug, departureId]);

  async function handlePaymentChoiceChange(next: 'PAY_LATER' | 'BANK_TRANSFER' | 'ONLINE_FULL') {
    setPaymentChoice(next);
    if (tourInfo) {
      try {
        await refreshQuote(tourInfo.id, next);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Could not update quote');
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!quote || !tourInfo) return;
    setSubmitError('');
    setSubmitting(true);
    try {
      const created = await clientApi<BookingResult>('/public/bookings', {
        method: 'POST',
        idempotencyKey: idempotencyKeyRef.current,
        body: {
          quoteId: quote.quoteId,
          expectedGrandTotalMinor: quote.quote.grandTotalMinor,
          expectedCurrency: quote.quote.currency,
          expectedPricingVersion: quote.quote.pricingVersion,
          leadName,
          leadEmail,
          leadPhone,
          nationality: nationality || undefined,
          hotelName: hotelName || undefined,
          specialRequests: specialRequests || undefined,
          acceptedPolicyVersionId: quote.policy.versionId,
          acceptedPolicyAtClient: acceptedPolicy,
          paymentChoice,
        },
      });
      setResult(created);
    } catch (err) {
      const eObj = err as Error & { code?: string };
      if (eObj.code === 'QUOTE_EXPIRED' || eObj.code === 'QUOTE_CHANGED') {
        setSubmitError(`${eObj.message} We have refreshed your quote below — please review and submit again.`);
        await refreshQuote(tourInfo.id, paymentChoice);
      } else {
        setSubmitError(eObj.message || 'Booking submission failed. Please review your details and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1160px] px-4 py-16 text-center text-sm text-[#52606D]">
        Preparing your live server-verified booking quote...
      </div>
    );
  }

  if (loadError || !quote || !tourInfo) {
    return (
      <div className="mx-auto max-w-[680px] px-4 py-16 text-center">
        <div className="rounded-2xl border border-[#E5DFD2] bg-white p-8 shadow-sm">
          <AlertCircle className="mx-auto h-10 w-10 text-amber-700" aria-hidden="true" />
          <h1 id="main-content" tabIndex={-1} className="mt-4 text-2xl font-extrabold text-[#103D45]">
            Unable to Start Checkout
          </h1>
          <p className="mt-2 text-sm text-[#52606D]">{loadError || 'Invalid booking selection.'}</p>
          <Link
            href="/tours"
            className="mt-6 inline-flex min-h-[46px] items-center gap-2 rounded-full bg-[#0E7C78] px-6 text-sm font-bold text-white"
          >
            Browse Available Tours
          </Link>
        </div>
      </div>
    );
  }

  // Post-submission honest persistent state (ONLY shown after real backend persistence!)
  if (result) {
    const isConfirmed = result.status === 'CONFIRMED';
    return (
      <div className="mx-auto max-w-[820px] px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-[#E5DFD2] bg-white p-7 shadow-md sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EFEAE0] pb-6">
            <div className="flex items-center gap-3.5">
              <span className={`inline-flex h-12 w-12 items-center justify-center rounded-full ${isConfirmed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
              </span>
              <div>
                <h1 id="main-content" tabIndex={-1} className="text-2xl font-extrabold text-[#103D45]">
                  {isConfirmed ? 'Booking Confirmed' : 'Booking Request Received'}
                </h1>
                <p className="text-sm font-medium text-[#52606D]">{result.statusLabel}</p>
              </div>
            </div>
            <StatusBadge status={result.status} />
          </div>

          <div className="mt-6 grid gap-4 rounded-xl bg-[#FAF8F4] p-5 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#52606D]">Booking Reference</p>
              <p className="mt-1 font-mono text-lg font-extrabold text-[#103D45]" data-testid="booking-reference">
                {result.reference}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#52606D]">Tour &amp; Departure</p>
              <p className="mt-1 font-bold text-[#103D45]">{result.snapshot.tourTitle}</p>
              <p className="text-xs text-[#52606D]">
                {result.snapshot.departureDate} at {result.snapshot.startTime} ({result.snapshot.timezone})
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#52606D]">Grand Total</p>
              <p className="mt-1 text-base font-extrabold text-[#103D45]">
                {formatMinorUnitsExact(result.grandTotalMinor, result.currency)}
              </p>
              <p className="text-xs text-[#52606D]">
                Due now: {formatMinorUnitsExact(result.dueNowMinor, result.currency)} · Due later:{' '}
                {formatMinorUnitsExact(result.dueLaterMinor, result.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#52606D]">Payment Status</p>
              <div className="mt-1">
                <StatusBadge status={result.paymentStatus} />
              </div>
              {result.decisionDeadlineAt && (
                <p className="mt-1 text-xs text-[#52606D]">
                  Seat hold review deadline: {new Date(result.decisionDeadlineAt).toLocaleString('en-GB', { timeZone: 'Africa/Cairo' })} (Cairo)
                </p>
              )}
            </div>
          </div>

          {!isConfirmed && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <strong>Important:</strong> Your reservation is currently awaiting confirmation by our operations team. We have queued your summary email with your private booking access link.
            </div>
          )}

          {result.bankDetails && (
            <div className="mt-5 rounded-xl border border-[#CBD5E1] bg-slate-50 p-5 text-sm">
              <h2 className="font-bold text-[#103D45]">Manual Bank Transfer Instructions</h2>
              <dl className="mt-2 grid gap-1.5 sm:grid-cols-2 text-xs text-[#334155]">
                {Object.entries(result.bankDetails).map(([k, v]) => (
                  <div key={k}>
                    <dt className="font-semibold capitalize text-[#52606D]">{k.replace(/([A-Z])/g, ' $1')}</dt>
                    <dd className="font-mono text-[#103D45]">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-[#52606D]">
                Upload your transfer proof inside Manage Booking below — uploading proof marks your transfer pending review until staff verify receipt.
              </p>
            </div>
          )}

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={`/booking/manage?token=${encodeURIComponent(result.manageExchangeToken)}`}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-[#0E7C78] px-6 text-sm font-bold text-white hover:bg-[#103D45]"
            >
              Open Secure Booking Management &amp; Summary PDF
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/tours"
              className="inline-flex min-h-[48px] items-center rounded-full border border-[#CBD5E1] px-5 text-sm font-bold text-[#103D45] hover:bg-[#FAF8F4]"
            >
              Browse More Tours
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 text-center">
        <h1 id="main-content" tabIndex={-1} className="text-3xl font-extrabold text-[#103D45]">
          Complete your booking request
        </h1>
        <nav aria-label="Checkout progress" className="mt-4 flex items-center justify-center gap-6 text-xs font-bold">
          <span className="inline-flex items-center gap-1.5 text-[#0E7C78]">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> 1. Trip Selected
          </span>
          <span aria-current="step" className="inline-flex items-center gap-1.5 text-[#103D45] underline decoration-[#C9A66B] decoration-2 underline-offset-4">
            2. Your Details &amp; Policy
          </span>
          <span className="text-[#64748B]">3. Confirmation &amp; Access</span>
        </nav>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-6 rounded-2xl border border-[#E5DFD2] bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-extrabold text-[#103D45]">Lead Traveler Details</h2>

          {submitError && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">
              {submitError}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="ck-name" className="block text-sm font-bold text-[#103D45]">
                Full Name <span className="text-rose-700" aria-hidden="true">*</span>
              </label>
              <input
                id="ck-name"
                name="leadName"
                type="text"
                required
                minLength={2}
                autoComplete="name"
                value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                placeholder="Jane Traveler"
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#CBD5E1] px-4 py-2.5 text-[#103D45]"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ck-email" className="block text-sm font-bold text-[#103D45]">
                  Email Address <span className="text-rose-700" aria-hidden="true">*</span>
                </label>
                <input
                  id="ck-email"
                  name="leadEmail"
                  type="email"
                  required
                  autoComplete="email"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#CBD5E1] px-4 py-2.5 text-[#103D45]"
                />
              </div>

              <div>
                <label htmlFor="ck-phone" className="block text-sm font-bold text-[#103D45]">
                  Phone / WhatsApp <span className="text-rose-700" aria-hidden="true">*</span>
                </label>
                <input
                  id="ck-phone"
                  name="leadPhone"
                  type="tel"
                  required
                  minLength={6}
                  autoComplete="tel"
                  value={leadPhone}
                  onChange={(e) => setLeadPhone(e.target.value)}
                  placeholder="+44 7700 900123"
                  className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#CBD5E1] px-4 py-2.5 text-[#103D45]"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ck-hotel" className="block text-sm font-bold text-[#103D45]">
                  Hotel / Pickup Location {quote.requiresHotelDetails && <span className="text-rose-700" aria-hidden="true">*</span>}
                </label>
                <input
                  id="ck-hotel"
                  name="hotelName"
                  type="text"
                  required={quote.requiresHotelDetails}
                  value={hotelName}
                  onChange={(e) => setHotelName(e.target.value)}
                  placeholder="e.g. Savoy Sharm El Sheikh"
                  className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#CBD5E1] px-4 py-2.5 text-[#103D45]"
                />
              </div>

              <div>
                <label htmlFor="ck-nat" className="block text-sm font-bold text-[#103D45]">
                  Nationality <span className="font-normal text-[#52606D]">(Optional)</span>
                </label>
                <input
                  id="ck-nat"
                  name="nationality"
                  type="text"
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  placeholder="Optional"
                  className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#CBD5E1] px-4 py-2.5 text-[#103D45]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="ck-req" className="block text-sm font-bold text-[#103D45]">
                Special Requests <span className="font-normal text-[#52606D]">(Optional)</span>
              </label>
              <textarea
                id="ck-req"
                name="specialRequests"
                rows={3}
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                placeholder="Dietary preferences, accessibility notes, or child seat requests. Please do not enter passport or payment card numbers."
                className="mt-1.5 w-full rounded-xl border border-[#CBD5E1] px-4 py-2.5 text-[#103D45]"
              />
            </div>
          </div>

          <fieldset className="border-t border-[#EFEAE0] pt-5">
            <legend className="text-base font-extrabold text-[#103D45]">Payment Choice</legend>
            <div className="mt-3 space-y-3">
              {tourInfo.paymentOptions.payLaterEnabled && (
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${paymentChoice === 'PAY_LATER' ? 'border-[#0E7C78] bg-[#EFFAF9]' : 'border-[#CBD5E1]'}`}>
                  <input
                    type="radio"
                    name="paymentChoice"
                    value="PAY_LATER"
                    checked={paymentChoice === 'PAY_LATER'}
                    onChange={() => void handlePaymentChoiceChange('PAY_LATER')}
                    className="mt-1 h-4 w-4 accent-[#0E7C78]"
                  />
                  <div>
                    <span className="inline-flex items-center gap-1.5 font-bold text-[#103D45]">
                      <Calendar className="h-4 w-4 text-[#0E7C78]" aria-hidden="true" />
                      Pay Later (Booking Request)
                    </span>
                    <p className="mt-0.5 text-xs text-[#52606D]">
                      Reserve seats for {tourInfo.paymentOptions.manualRequestHoldHours} hours while our team confirms availability. Pay according to the tour policy.
                    </p>
                  </div>
                </label>
              )}

              {tourInfo.paymentOptions.bankTransferEnabled && (
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${paymentChoice === 'BANK_TRANSFER' ? 'border-[#0E7C78] bg-[#EFFAF9]' : 'border-[#CBD5E1]'}`}>
                  <input
                    type="radio"
                    name="paymentChoice"
                    value="BANK_TRANSFER"
                    checked={paymentChoice === 'BANK_TRANSFER'}
                    onChange={() => void handlePaymentChoiceChange('BANK_TRANSFER')}
                    className="mt-1 h-4 w-4 accent-[#0E7C78]"
                  />
                  <div>
                    <span className="inline-flex items-center gap-1.5 font-bold text-[#103D45]">
                      <Building2 className="h-4 w-4 text-[#0E7C78]" aria-hidden="true" />
                      Manual Bank Transfer
                    </span>
                    <p className="mt-0.5 text-xs text-[#52606D]">
                      Receive bank transfer instructions immediately after submission and upload your transfer proof for staff verification.
                    </p>
                  </div>
                </label>
              )}

              {tourInfo.paymentOptions.onlineEnabled && (
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${paymentChoice === 'ONLINE_FULL' ? 'border-[#0E7C78] bg-[#EFFAF9]' : 'border-[#CBD5E1]'}`}>
                  <input
                    type="radio"
                    name="paymentChoice"
                    value="ONLINE_FULL"
                    checked={paymentChoice === 'ONLINE_FULL'}
                    onChange={() => void handlePaymentChoiceChange('ONLINE_FULL')}
                    className="mt-1 h-4 w-4 accent-[#0E7C78]"
                  />
                  <div>
                    <span className="inline-flex items-center gap-1.5 font-bold text-[#103D45]">
                      <CreditCard className="h-4 w-4 text-[#0E7C78]" aria-hidden="true" />
                      Online Card Payment (Hosted Paymob Checkout)
                    </span>
                    <p className="mt-0.5 text-xs text-[#52606D]">
                      Redirects to Paymob hosted checkout. Card details are never handled by our servers.
                    </p>
                  </div>
                </label>
              )}
            </div>
          </fieldset>

          {/* Exact accepted policy version snapshot */}
          <div className="rounded-xl bg-[#FAF8F4] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#103D45]">{quote.policy.title}</p>
            <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-[#52606D]">
              {quote.policy.bodyMarkdown}
            </p>
            <div className="mt-3 flex items-start gap-2.5">
              <input
                id="ck-policy"
                type="checkbox"
                required
                checked={acceptedPolicy}
                onChange={(e) => setAcceptedPolicy(e.target.checked)}
                className="mt-0.5 h-5 w-5 rounded border-[#94A3B8] accent-[#0E7C78]"
              />
              <label htmlFor="ck-policy" className="text-sm font-semibold text-[#103D45]">
                I accept this exact version of the booking and cancellation policy. <span className="text-rose-700" aria-hidden="true">*</span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#103D45] px-6 text-base font-extrabold text-white shadow-sm transition hover:bg-[#0E7C78] disabled:opacity-60"
          >
            <span>{submitting ? 'Submitting Booking Request...' : 'Submit Booking Request'}</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>

          <p className="flex items-center gap-2 rounded-xl bg-[#FDF6E7] px-4 py-2.5 text-xs font-medium text-[#8A5A10]">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            Your booking is confirmed only after availability is verified according to the tour’s confirmation rules.
          </p>
        </form>

        {/* Order Summary */}
        <aside className="lg:col-span-5">
          <div className="sticky top-24 rounded-2xl border border-[#E5DFD2] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-extrabold text-[#103D45]">Order Summary</h2>
            <img
              src={tourInfo.primaryImageUrl}
              alt={tourInfo.primaryImageAlt}
              className="mt-4 aspect-[16/9] w-full rounded-xl object-cover"
            />
            <h3 className="mt-4 text-lg font-extrabold text-[#103D45]">{quote.tourTitle}</h3>
            <p className="mt-1 text-sm text-[#52606D]">
              {quote.departureDate} · {quote.startTime} ({quote.timezone})
            </p>
            <p className="text-xs text-[#52606D]">
              Travelers: {adults} adult{adults === 1 ? '' : 's'}
              {children > 0 ? `, ${children} child${children === 1 ? '' : 'ren'}` : ''}
              {infants > 0 ? `, ${infants} infant${infants === 1 ? '' : 's'}` : ''}
            </p>

            <div className="mt-5 space-y-2 border-t border-[#EFEAE0] pt-4 text-sm">
              {quote.quote.lineItems.map((li, i) => (
                <div key={`${li.label}-${i}`} className="flex items-center justify-between gap-2 text-[#334155]">
                  <span>{li.label}</span>
                  <span className={li.totalMinor < 0 ? 'font-bold text-emerald-700' : 'font-semibold'}>
                    {formatMinorUnitsExact(li.totalMinor, quote.quote.currency)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl bg-[#FAF8F4] p-4">
              <div className="flex items-center justify-between text-lg font-extrabold text-[#103D45]">
                <span>Total</span>
                <span className="tabular-nums">{formatMinorUnitsExact(quote.quote.grandTotalMinor, quote.quote.currency)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-[#52606D]">
                <span>Due now</span>
                <span className="font-bold tabular-nums text-[#103D45]">{formatMinorUnitsExact(quote.quote.dueNowMinor, quote.quote.currency)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-[#52606D]">
                <span>Due later</span>
                <span className="font-bold tabular-nums text-[#103D45]">{formatMinorUnitsExact(quote.quote.dueLaterMinor, quote.quote.currency)}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
