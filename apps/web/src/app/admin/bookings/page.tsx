'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Download, Mail, QrCode, Search, X } from 'lucide-react';
import { formatMinorUnitsExact } from '@sharm/contracts';
import { NativeDialog, StatusBadge } from '@sharm/ui';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

interface BookingRow {
  id: string;
  reference: string;
  status: string;
  paymentStatus: string;
  leadName: string;
  leadEmail: string;
  leadPhone: string;
  seatsAllocated: number;
  currency: string;
  grandTotalMinor: number;
  collectedMinor: number;
  tour: { id: string; title: string };
  departure: { id: string; departureDate: string; startTime: string };
}

interface BookingDetail {
  id: string;
  reference: string;
  status: string;
  paymentStatus: string;
  paymentChoice: string;
  leadName: string;
  leadEmail: string;
  leadPhone: string;
  hotelName: string | null;
  specialRequests: string | null;
  seatsAllocated: number;
  currency: string;
  grandTotalMinor: number;
  dueLaterMinor: number;
  tour: { id: string; title: string };
  departure: { id: string; departureDate: string; startTime: string };
  notes: Array<{ id: string; body: string; createdAt: string; author: { fullName: string } | null }>;
  events: Array<{ id: string; actorType: string; eventType: string; message: string; createdAt: string }>;
  ledgerEntries: Array<{ id: string; type: string; amountMinor: number; currency: string; externalRef: string | null; reason: string; createdAt: string }>;
  paymentProofs: Array<{ id: string; status: string; submittedAmountMinor: number; submittedCurrency: string; transferReference: string; mediaAssetId: string }>;
}

export default function AdminBookingsPage() {
  const { adminFetch, hasPerm, toast } = useAdminAuth();
  const [items, setItems] = useState<BookingRow[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [noteText, setNoteText] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [declineTargetId, setDeclineTargetId] = useState<string | null>(null);
  const [manualAmt, setManualAmt] = useState('');
  const [manualRef, setManualRef] = useState('');
  const [manualReason, setManualReason] = useState('');

  const [qrOpen, setQrOpen] = useState(false);
  const [qrToken, setQrToken] = useState('');
  const [qrResult, setQrResult] = useState<string>('');

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (status) qs.set('status', status);
      const res = await adminFetch<{ items: BookingRow[] }>(`/admin/bookings?${qs.toString()}`);
      setItems(res.items);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to load bookings', 'error');
    } finally {
      setLoading(false);
    }
  }, [adminFetch, q, status, toast]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function openDetail(id: string) {
    try {
      const d = await adminFetch<BookingDetail>(`/admin/bookings/${id}`);
      setDetail(d);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to load booking detail', 'error');
    }
  }

  async function handleApprove(id: string) {
    try {
      await adminFetch(`/admin/bookings/${id}/approve`, { method: 'POST' });
      toast('Booking approved and seats confirmed.', 'success');
      await loadList();
      if (detail?.id === id) await openDetail(id);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Approval failed', 'error');
    }
  }

  async function handleDeclineConfirm() {
    if (!declineTargetId) return;
    try {
      await adminFetch(`/admin/bookings/${declineTargetId}/decline`, {
        method: 'POST',
        body: { reason: declineReason },
      });
      toast('Booking cancelled/declined and seats released.', 'success');
      setDeclineTargetId(null);
      setDeclineReason('');
      await loadList();
      if (detail?.id === declineTargetId) await openDetail(declineTargetId);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Action failed', 'error');
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!detail || !noteText.trim()) return;
    try {
      await adminFetch(`/admin/bookings/${detail.id}/notes`, { method: 'POST', body: { body: noteText } });
      setNoteText('');
      toast('Private staff note added.', 'success');
      await openDetail(detail.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add note', 'error');
    }
  }

  async function handleRecordManualPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    try {
      await adminFetch('/admin/payments/manual', {
        method: 'POST',
        body: {
          bookingId: detail.id,
          amountMinor: Math.round(Number(manualAmt) * 100),
          currency: detail.currency,
          provider: 'BANK_TRANSFER',
          externalRef: manualRef,
          reason: manualReason,
        },
      });
      toast('Manual payment recorded in immutable ledger.', 'success');
      setManualAmt('');
      setManualRef('');
      setManualReason('');
      await openDetail(detail.id);
      await loadList();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Payment recording failed', 'error');
    }
  }

  async function handleBulk(action: 'APPROVE' | 'DECLINE') {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    try {
      const res = await adminFetch<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }>('/admin/bookings/bulk', {
        method: 'POST',
        body: { bookingIds: ids, action, reason: action === 'DECLINE' ? 'Bulk declined by staff' : undefined },
      });
      toast(`Bulk ${action}: ${res.succeeded.length} succeeded, ${res.failed.length} failed.`, res.failed.length ? 'info' : 'success');
      setSelectedIds(new Set());
      await loadList();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Bulk action failed', 'error');
    }
  }

  async function handleQrCheckin(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await adminFetch<{ alreadyCheckedIn: boolean; reference: string; leadName: string; seatsAllocated: number }>(
        '/admin/bookings/checkin-qr',
        { method: 'POST', body: { token: qrToken } },
      );
      setQrResult(
        res.alreadyCheckedIn
          ? `Already checked in: ${res.reference} (${res.leadName}, ${res.seatsAllocated} seats)`
          : `Checked in successfully: ${res.reference} (${res.leadName}, ${res.seatsAllocated} seats)`,
      );
      setQrToken('');
    } catch (err) {
      setQrResult(`Error: ${err instanceof Error ? err.message : 'Invalid QR token'}`);
    }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5DFD2] bg-white p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void loadList();
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            type="search"
            aria-label="Search bookings"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ref, traveler name, email..."
            className="min-h-[40px] rounded-xl border border-[#CBD5E1] px-3 text-sm"
          />
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="min-h-[40px] rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm"
          >
            <option value="">All statuses</option>
            {['REQUESTED', 'HELD', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'COMPLETED', 'NO_SHOW'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button type="submit" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#103D45] px-4 text-xs font-bold text-white">
            <Search className="h-3.5 w-3.5" aria-hidden="true" /> Filter
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.size > 0 && hasPerm('bookings:approve') && (
            <>
              <button type="button" onClick={() => handleBulk('APPROVE')} className="min-h-[38px] rounded-xl bg-emerald-700 px-3 text-xs font-bold text-white">
                Approve ({selectedIds.size})
              </button>
              <button type="button" onClick={() => handleBulk('DECLINE')} className="min-h-[38px] rounded-xl bg-rose-700 px-3 text-xs font-bold text-white">
                Decline ({selectedIds.size})
              </button>
            </>
          )}
          {hasPerm('bookings:write') && (
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#CBD5E1] px-3.5 text-xs font-bold text-[#103D45]"
            >
              <QrCode className="h-4 w-4" aria-hidden="true" /> QR Check-In
            </button>
          )}
          {hasPerm('bookings:export') && (
            <a
              href="/api/v1/admin/bookings/export.csv"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#CBD5E1] px-3.5 text-xs font-bold text-[#103D45] hover:bg-[#FAF8F4]"
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
            </a>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-[#E5DFD2] bg-white shadow-xs">
        <table className="w-full text-left text-sm">
          <caption className="visually-hidden">Bookings management table</caption>
          <thead className="border-b border-[#E5DFD2] bg-[#FAF8F4] text-xs uppercase text-[#52606D]">
            <tr>
              <th scope="col" className="p-3.5 w-8">
                <span className="visually-hidden">Select</span>
              </th>
              <th scope="col" className="p-3.5">Reference</th>
              <th scope="col" className="p-3.5">Traveler</th>
              <th scope="col" className="p-3.5">Tour &amp; Departure</th>
              <th scope="col" className="p-3.5">Booking</th>
              <th scope="col" className="p-3.5">Payment</th>
              <th scope="col" className="p-3.5 text-right">Booked / Paid</th>
              <th scope="col" className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1EDE4]">
            {loading ? (
              <tr><td colSpan={8} className="p-8 text-center text-[#52606D]">Loading bookings...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-[#52606D]">No bookings match your current filter.</td></tr>
            ) : (
              items.map((b) => (
                <tr key={b.id} className="hover:bg-[#FAF8F4]/70">
                  <td className="p-3.5">
                    <input
                      type="checkbox"
                      aria-label={`Select booking ${b.reference}`}
                      checked={selectedIds.has(b.id)}
                      onChange={(e) => {
                        const next = new Set(selectedIds);
                        if (e.target.checked) next.add(b.id);
                        else next.delete(b.id);
                        setSelectedIds(next);
                      }}
                      className="h-4 w-4 accent-[#0E7C78]"
                    />
                  </td>
                  <td className="p-3.5 font-mono text-xs font-bold text-[#0E7C78]">
                    <button type="button" onClick={() => openDetail(b.id)} className="hover:underline">
                      {b.reference}
                    </button>
                  </td>
                  <td className="p-3.5">
                    <p className="font-bold text-[#103D45]">{b.leadName}</p>
                    <p className="text-xs text-[#52606D]">{b.leadEmail}</p>
                  </td>
                  <td className="p-3.5">
                    <p className="font-semibold text-[#103D45]">{b.tour.title}</p>
                    <p className="text-xs text-[#52606D]">
                      {b.departure.departureDate} · {b.departure.startTime} ({b.seatsAllocated} seats)
                    </p>
                  </td>
                  <td className="p-3.5"><StatusBadge status={b.status} /></td>
                  <td className="p-3.5"><StatusBadge status={b.paymentStatus} /></td>
                  <td className="p-3.5 text-right">
                    <p className="font-bold">{formatMinorUnitsExact(b.grandTotalMinor, b.currency)}</p>
                    <p className="text-xs text-[#52606D]">Paid: {formatMinorUnitsExact(b.collectedMinor, b.currency)}</p>
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {hasPerm('bookings:approve') && (b.status === 'REQUESTED' || b.status === 'EXPIRED') && (
                        <button
                          type="button"
                          onClick={() => handleApprove(b.id)}
                          aria-label={`Approve ${b.reference}`}
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-700 px-2.5 text-xs font-bold text-white hover:bg-emerald-800"
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" /> Approve
                        </button>
                      )}
                      {hasPerm('bookings:approve') && ['REQUESTED', 'HELD', 'CONFIRMED'].includes(b.status) && (
                        <button
                          type="button"
                          onClick={() => setDeclineTargetId(b.id)}
                          aria-label={`Cancel or decline ${b.reference}`}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2.5 text-xs font-bold text-rose-800"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" /> Cancel
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openDetail(b.id)}
                        className="inline-flex h-8 items-center rounded-lg border border-[#CBD5E1] px-2.5 text-xs font-bold text-[#103D45]"
                      >
                        Details
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Booking Detail Modal */}
      <NativeDialog
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `Booking ${detail.reference}` : 'Booking Details'}
        maxWidthClass="max-w-3xl"
      >
        {detail && (
          <div className="space-y-6 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <StatusBadge status={detail.status} />
                <StatusBadge status={detail.paymentStatus} />
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/api/v1/admin/bookings/${detail.id}/voucher.pdf`}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#103D45] px-4 text-xs font-bold text-white"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> Voucher PDF
                </a>
                {hasPerm('bookings:write') && (
                  <button
                    type="button"
                    onClick={async () => {
                      await adminFetch(`/admin/bookings/${detail.id}/resend`, { method: 'POST' });
                      toast('Notification email queued.', 'success');
                    }}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-[#CBD5E1] px-4 text-xs font-bold"
                  >
                    <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Resend Email
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-4 rounded-xl bg-[#FAF8F4] p-4 sm:grid-cols-2 text-xs">
              <div>
                <p className="font-bold text-[#103D45]">{detail.tour.title}</p>
                <p className="text-[#52606D]">{detail.departure.departureDate} · {detail.departure.startTime} ({detail.seatsAllocated} seats)</p>
                {detail.hotelName && <p className="mt-1">Hotel: <strong>{detail.hotelName}</strong></p>}
              </div>
              <div>
                <p className="font-bold text-[#103D45]">{detail.leadName}</p>
                <p className="text-[#52606D]">{detail.leadEmail} · {detail.leadPhone}</p>
                <p className="mt-1">Total: <strong>{formatMinorUnitsExact(detail.grandTotalMinor, detail.currency)}</strong></p>
              </div>
            </div>

            {hasPerm('payments:verify') && detail.dueLaterMinor > 0 && (
              <form onSubmit={handleRecordManualPayment} className="rounded-xl border border-[#E5DFD2] p-4 space-y-3">
                <h3 className="text-xs font-extrabold uppercase text-[#103D45]">Record Manual Payment</h3>
                <div className="grid gap-2 sm:grid-cols-3">
                  <input type="number" step="0.01" required placeholder={`Amount (${detail.currency})`} value={manualAmt} onChange={(e) => setManualAmt(e.target.value)} className="min-h-[40px] rounded-lg border px-3 text-xs" />
                  <input type="text" required placeholder="Bank / Receipt Ref" value={manualRef} onChange={(e) => setManualRef(e.target.value)} className="min-h-[40px] rounded-lg border px-3 text-xs" />
                  <input type="text" required placeholder="Audit Reason" value={manualReason} onChange={(e) => setManualReason(e.target.value)} className="min-h-[40px] rounded-lg border px-3 text-xs" />
                </div>
                <button type="submit" className="min-h-[36px] rounded-full bg-[#0E7C78] px-4 text-xs font-bold text-white">
                  Record Payment
                </button>
              </form>
            )}

            {/* Private Staff Notes */}
            <div className="space-y-2">
              <h3 className="text-xs font-extrabold uppercase text-[#103D45]">Private Staff Notes (Never Shown to Guests)</h3>
              {hasPerm('bookings:write') && (
                <form onSubmit={handleAddNote} className="flex gap-2">
                  <input type="text" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add internal note..." className="min-h-[40px] flex-1 rounded-lg border px-3 text-xs" />
                  <button type="submit" className="rounded-lg bg-[#103D45] px-4 text-xs font-bold text-white">Save</button>
                </form>
              )}
              <ul className="space-y-1.5 text-xs">
                {detail.notes.map((n) => (
                  <li key={n.id} className="rounded-lg bg-[#FAF8F4] px-3 py-2">
                    <span className="font-bold">{n.author?.fullName || 'Staff'}:</span> {n.body}
                  </li>
                ))}
              </ul>
            </div>

            {/* Event Timeline */}
            <div>
              <h3 className="text-xs font-extrabold uppercase text-[#103D45]">Audit &amp; Status Timeline</h3>
              <ul className="mt-2 space-y-1.5 text-xs">
                {detail.events.map((ev) => (
                  <li key={ev.id} className="flex justify-between gap-2 border-b border-[#F1EDE4] py-1.5">
                    <span><strong>{ev.eventType}</strong> — {ev.message}</span>
                    <span className="shrink-0 text-[#64748B]">{new Date(ev.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </NativeDialog>

      {/* Decline / Cancel Reason Modal */}
      <NativeDialog
        open={Boolean(declineTargetId)}
        onClose={() => setDeclineTargetId(null)}
        title="Cancel / Decline Booking"
        description="A reason is mandatory for audit logs and customer communication."
      >
        <div className="space-y-4">
          <textarea
            rows={3}
            required
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder="Reason for declining or cancelling..."
            className="w-full rounded-xl border border-[#CBD5E1] px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button type="button" autoFocus onClick={() => setDeclineTargetId(null)} className="min-h-[40px] rounded-full border px-4 text-xs font-bold">
              Keep Booking
            </button>
            <button type="button" onClick={handleDeclineConfirm} className="min-h-[40px] rounded-full bg-rose-700 px-5 text-xs font-bold text-white">
              Confirm Cancel
            </button>
          </div>
        </div>
      </NativeDialog>

      {/* QR Check-In Modal */}
      <NativeDialog open={qrOpen} onClose={() => setQrOpen(false)} title="Staff Voucher QR Check-In">
        <form onSubmit={handleQrCheckin} className="space-y-4">
          <p className="text-xs text-[#52606D]">
            Paste or scan the opaque check-in token from a confirmed guest voucher. Repeated scans are handled idempotently.
          </p>
          <input
            type="text"
            required
            value={qrToken}
            onChange={(e) => setQrToken(e.target.value)}
            placeholder="Scan or paste opaque QR check-in token"
            className="min-h-[44px] w-full rounded-xl border border-[#CBD5E1] px-3 font-mono text-sm"
          />
          {qrResult && <p role="status" className="rounded-xl bg-[#FAF8F4] p-3 text-xs font-bold text-[#103D45]">{qrResult}</p>}
          <button type="submit" className="min-h-[44px] w-full rounded-full bg-[#0E7C78] text-sm font-bold text-white">
            Validate &amp; Check In
          </button>
        </form>
      </NativeDialog>
    </div>
  );
}
