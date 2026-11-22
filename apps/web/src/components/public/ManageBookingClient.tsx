'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Calendar, Download, KeyRound, RefreshCw, Upload, XCircle } from 'lucide-react';
import { formatMinorUnitsExact } from '@sharm/contracts';
import { NativeDialog, StatusBadge } from '@sharm/ui';
import { clientApi } from '@/lib/api';

interface GuestBookingData {
  id: string;
  reference: string;
  status: string;
  statusLabel: string;
  paymentStatus: string;
  paymentChoice: string;
  seatsAllocated: number;
  currency: string;
  grandTotalMinor: number;
  collectedMinor: number;
  refundedMinor: number;
  outstandingMinor: number;
  holdExpiresAt: string | null;
  decisionDeadlineAt: string | null;
  leadName: string;
  leadEmail: string;
  leadPhone: string;
  hotelName: string | null;
  snapshot: {
    tourTitle: string;
    departureDate: string;
    startTime: string;
    timezone: string;
    policyTitle?: string;
    lineItems?: Array<{ label: string; quantity: number; totalMinor: number }>;
  };
  bankDetails: Record<string, string> | null;
  paymentProofs: Array<{
    id: string;
    submittedAmountMinor: number;
    submittedCurrency: string;
    transferReference: string;
    status: string;
    reviewNote: string | null;
    createdAt: string;
  }>;
  refundRequests: Array<{ id: string; amountMinor: number; currency: string; status: string; reason: string }>;
  rescheduleOptions: Array<{ id: string; departureDate: string; startTime: string; remainingSeats: number }>;
}

export function ManageBookingClient() {
  const searchParams = useSearchParams();
  const urlToken = searchParams.get('token');

  const [booking, setBooking] = useState<GuestBookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Recovery form (reference alone never exposes a booking!)
  const [recRef, setRecRef] = useState('');
  const [recEmail, setRecEmail] = useState('');
  const [recSent, setRecSent] = useState(false);

  // Proof upload
  const [transferRef, setTransferRef] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Reschedule & Cancel dialogs
  const [newDepartureId, setNewDepartureId] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  async function loadCurrent() {
    try {
      const data = await clientApi<GuestBookingData>('/public/booking-access/current');
      setBooking(data);
      setTransferAmount(String((data.outstandingMinor || data.grandTotalMinor) / 100));
      setError('');
    } catch {
      setBooking(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      if (urlToken) {
        try {
          await clientApi('/public/booking-access/exchange', {
            method: 'POST',
            body: { token: urlToken },
          });
          // Clean token from URL immediately so it never leaks into referrers/analytics!
          window.history.replaceState({}, '', '/booking/manage');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'This booking access link is invalid or expired.');
          setLoading(false);
          return;
        }
      }
      await loadCurrent();
    }
    void init();
  }, [urlToken]);

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await clientApi('/public/booking-access/recover', {
        method: 'POST',
        body: { reference: recRef, email: recEmail },
      });
      setRecSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process recovery request.');
    }
  }

  async function handleProofUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!booking || !proofFile) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', proofFile);
      fd.append('submittedAmountMinor', String(Math.round(Number(transferAmount) * 100)));
      fd.append('submittedCurrency', booking.currency);
      fd.append('transferReference', transferRef);
      await clientApi('/public/booking-access/payment-proofs', { method: 'POST', formData: fd });
      setNotice('Transfer proof uploaded securely. Status is Pending Review until verified by our finance team.');
      setTransferRef('');
      setProofFile(null);
      await loadCurrent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Proof upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleReschedule() {
    if (!newDepartureId) return;
    setError('');
    try {
      await clientApi('/public/booking-access/reschedule', {
        method: 'POST',
        body: { newDepartureId, acceptPriceDifference: false },
      });
      setNotice('Your departure date has been updated cleanly.');
      setNewDepartureId('');
      await loadCurrent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reschedule booking');
    }
  }

  async function handleCancel() {
    setError('');
    try {
      const res = await clientApi<{ policyTier: string; eligibleRefundMinor: number }>('/public/booking-access/cancel', {
        method: 'POST',
        body: { reason: cancelReason || 'Cancelled by guest' },
      });
      setCancelOpen(false);
      setNotice(
        `Booking cancelled under ${res.policyTier.replace(/_/g, ' ')} rules.` +
          (res.eligibleRefundMinor > 0
            ? ` Refund request queued for ${formatMinorUnitsExact(res.eligibleRefundMinor, booking?.currency || 'USD')}.`
            : ''),
      );
      await loadCurrent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to cancel booking');
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-[780px] px-4 py-16 text-center text-sm text-[#52606D]">Verifying secure booking session...</div>;
  }

  if (!booking) {
    return (
      <div className="mx-auto max-w-[540px] px-4 py-14">
        <div className="rounded-2xl border border-[#E5DFD2] bg-white p-8 shadow-sm">
          <KeyRound className="h-9 w-9 text-[#0E7C78]" aria-hidden="true" />
          <h1 id="main-content" tabIndex={-1} className="mt-4 text-2xl font-extrabold text-[#103D45]">
            Access Your Booking Securely
          </h1>
          <p className="mt-2 text-sm text-[#52606D]">
            For your privacy, a booking reference number alone never exposes traveler details. Enter your reference and lead email to receive a fresh private access link.
          </p>

          {error && (
            <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-900">
              {error}
            </div>
          )}

          {recSent ? (
            <div role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              If a booking matches that reference and email address, a secure access link has been queued for delivery.
            </div>
          ) : (
            <form onSubmit={handleRecover} className="mt-5 space-y-4">
              <div>
                <label htmlFor="rec-ref" className="block text-sm font-bold text-[#103D45]">
                  Booking Reference
                </label>
                <input
                  id="rec-ref"
                  type="text"
                  required
                  value={recRef}
                  onChange={(e) => setRecRef(e.target.value.toUpperCase())}
                  placeholder="SPT-2026-XXXXXX"
                  className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#CBD5E1] px-4 font-mono text-sm uppercase text-[#103D45]"
                />
              </div>
              <div>
                <label htmlFor="rec-email" className="block text-sm font-bold text-[#103D45]">
                  Lead Traveler Email
                </label>
                <input
                  id="rec-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={recEmail}
                  onChange={(e) => setRecEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#CBD5E1] px-4 text-sm text-[#103D45]"
                />
              </div>
              <button
                type="submit"
                className="min-h-[48px] w-full rounded-full bg-[#0E7C78] font-bold text-white hover:bg-[#103D45]"
              >
                Send Booking Access Link
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  const canModify = ['REQUESTED', 'HELD', 'CONFIRMED'].includes(booking.status);

  return (
    <div className="mx-auto max-w-[960px] px-4 py-10 sm:px-6 space-y-6">
      <div className="rounded-2xl border border-[#E5DFD2] bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#EFEAE0] pb-5">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-wider text-[#0E7C78]">
              Reference {booking.reference}
            </p>
            <h1 id="main-content" tabIndex={-1} className="mt-1 text-2xl font-extrabold text-[#103D45]">
              {booking.snapshot.tourTitle}
            </h1>
            <p className="mt-1 text-sm text-[#52606D]">{booking.statusLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={booking.status} />
            <StatusBadge status={booking.paymentStatus} />
          </div>
        </div>

        {notice && (
          <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-950">
            {notice}
          </div>
        )}
        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-900">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-3 text-sm">
          <div className="rounded-xl bg-[#FAF8F4] p-4">
            <p className="text-xs font-bold uppercase text-[#52606D]">Departure (Cairo Time)</p>
            <p className="mt-1 font-bold text-[#103D45]">{booking.snapshot.departureDate}</p>
            <p className="text-xs text-[#52606D]">{booking.snapshot.startTime} ({booking.snapshot.timezone})</p>
          </div>
          <div className="rounded-xl bg-[#FAF8F4] p-4">
            <p className="text-xs font-bold uppercase text-[#52606D]">Lead Traveler</p>
            <p className="mt-1 font-bold text-[#103D45]">{booking.leadName}</p>
            <p className="text-xs text-[#52606D]">{booking.seatsAllocated} seat(s)</p>
          </div>
          <div className="rounded-xl bg-[#FAF8F4] p-4">
            <p className="text-xs font-bold uppercase text-[#52606D]">Financial Summary</p>
            <p className="mt-1 font-extrabold text-[#103D45]">
              Total: {formatMinorUnitsExact(booking.grandTotalMinor, booking.currency)}
            </p>
            <p className="text-xs text-[#52606D]">
              Collected: {formatMinorUnitsExact(booking.collectedMinor, booking.currency)} · Balance:{' '}
              {formatMinorUnitsExact(booking.outstandingMinor, booking.currency)}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/api/v1/public/booking-access/voucher.pdf"
            className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-[#103D45] px-5 text-sm font-bold text-white hover:bg-[#0E7C78]"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {booking.status === 'CONFIRMED' ? 'Download Official PDF Voucher' : 'Download Request Summary PDF'}
          </a>
          {canModify && (
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-full border border-rose-300 bg-rose-50 px-5 text-sm font-bold text-rose-900 hover:bg-rose-100"
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
              Cancel Booking
            </button>
          )}
        </div>
      </div>

      {/* Manual Bank Transfer Proof Upload (shown when bank transfer configured & outstanding balance remains) */}
      {canModify && booking.outstandingMinor > 0 && booking.bankDetails && (
        <div className="rounded-2xl border border-[#E5DFD2] bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#103D45]">
            <Upload className="h-5 w-5 text-[#0E7C78]" aria-hidden="true" />
            Upload Bank Transfer Proof
          </h2>
          <p className="mt-1 text-xs text-[#52606D]">
            Uploading a receipt never marks your booking paid automatically. Our finance team verifies each transfer against bank settlement records.
          </p>
          <form onSubmit={handleProofUpload} className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="proof-ref" className="block text-xs font-bold text-[#103D45]">Transfer Reference</label>
              <input
                id="proof-ref"
                type="text"
                required
                value={transferRef}
                onChange={(e) => setTransferRef(e.target.value)}
                placeholder="Bank receipt #"
                className="mt-1 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="proof-amt" className="block text-xs font-bold text-[#103D45]">Amount ({booking.currency})</label>
              <input
                id="proof-amt"
                type="number"
                step="0.01"
                min="1"
                required
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="proof-file" className="block text-xs font-bold text-[#103D45]">Receipt (JPG, PNG, WebP, PDF)</label>
              <input
                id="proof-file"
                type="file"
                required
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-xs text-[#334155]"
              />
            </div>
            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={uploading}
                className="min-h-[44px] rounded-full bg-[#0E7C78] px-6 text-sm font-bold text-white hover:bg-[#103D45] disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Submit Transfer Proof for Verification'}
              </button>
            </div>
          </form>

          {booking.paymentProofs.length > 0 && (
            <div className="mt-5 border-t border-[#EFEAE0] pt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#52606D]">Submitted Proofs</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {booking.paymentProofs.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FAF8F4] px-4 py-2.5">
                    <span>
                      Ref <strong>{p.transferReference}</strong> · {formatMinorUnitsExact(p.submittedAmountMinor, p.submittedCurrency)}
                    </span>
                    <StatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Reschedule Section */}
      {canModify && booking.rescheduleOptions.length > 0 && (
        <div className="rounded-2xl border border-[#E5DFD2] bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#103D45]">
            <RefreshCw className="h-5 w-5 text-[#0E7C78]" aria-hidden="true" />
            Reschedule Departure
          </h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[260px] flex-1">
              <label htmlFor="resched-dep" className="block text-xs font-bold text-[#103D45]">
                Choose New Available Departure
              </label>
              <select
                id="resched-dep"
                value={newDepartureId}
                onChange={(e) => setNewDepartureId(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm"
              >
                <option value="">Select another date...</option>
                {booking.rescheduleOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.departureDate} at {d.startTime} ({d.remainingSeats} seats available)
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={!newDepartureId}
              onClick={handleReschedule}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-[#0E7C78] px-5 text-sm font-bold text-white hover:bg-[#103D45] disabled:opacity-40"
            >
              <Calendar className="h-4 w-4" aria-hidden="true" />
              Confirm Reschedule
            </button>
          </div>
        </div>
      )}

      <NativeDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this booking?"
        description="Cancellation applies the exact policy version accepted when your booking was created and releases your seats immediately."
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="cancel-reason" className="block text-sm font-bold text-[#103D45]">
              Reason (Optional)
            </label>
            <textarea
              id="cancel-reason"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#CBD5E1] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              autoFocus
              onClick={() => setCancelOpen(false)}
              className="min-h-[44px] rounded-full border border-[#CBD5E1] px-5 text-sm font-bold text-[#103D45]"
            >
              Keep Booking
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="min-h-[44px] rounded-full bg-rose-700 px-5 text-sm font-bold text-white hover:bg-rose-800"
            >
              Confirm Cancellation
            </button>
          </div>
        </div>
      </NativeDialog>
    </div>
  );
}
