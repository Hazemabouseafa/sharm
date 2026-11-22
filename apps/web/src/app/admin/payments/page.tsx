'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, Shield, X } from 'lucide-react';
import { formatMinorUnitsExact } from '@sharm/contracts';
import { StatusBadge } from '@sharm/ui';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

interface PaymentsDashboard {
  proofs: Array<{
    id: string;
    bookingId: string;
    mediaAssetId: string;
    submittedAmountMinor: number;
    submittedCurrency: string;
    transferReference: string;
    status: string;
    createdAt: string;
    booking: { reference: string; leadName: string; grandTotalMinor: number; currency: string; status: string };
  }>;
  ledger: Array<{
    id: string;
    type: string;
    provider: string;
    amountMinor: number;
    currency: string;
    externalRef: string | null;
    reason: string;
    createdAt: string;
    booking: { reference: string; leadName: string };
  }>;
  refunds: Array<{
    id: string;
    bookingId: string;
    amountMinor: number;
    currency: string;
    reason: string;
    status: string;
    booking: { reference: string; leadName: string };
  }>;
  webhooks: Array<{ id: string; provider: string; providerEventId: string; signatureValid: boolean; processingStatus: string; createdAt: string }>;
  providerStatus: {
    provider: string;
    health: { status: string; label: string; missingFields: string[] };
    enabled: boolean;
    sandboxVerified: boolean;
    currency: string;
    integrationId: string;
    callbackUrl: string;
    secretKeyMasked: string;
    publicKeyMasked: string;
    hmacSecretMasked: string;
  };
}

export default function AdminPaymentsPage() {
  const { adminFetch, hasPerm, toast } = useAdminAuth();
  const [data, setData] = useState<PaymentsDashboard | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await adminFetch<PaymentsDashboard>('/admin/payments'));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to load payments', 'error');
    }
  }, [adminFetch, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <p className="text-sm text-[#52606D]">Loading payments &amp; ledger...</p>;

  return (
    <div className="space-y-6">
      {/* Online Gateway Health Status (Honest "Not configured" until real credentials verified!) */}
      <section className="rounded-2xl border border-[#E5DFD2] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-[#103D45]">
              <Shield className="h-4 w-4 text-[#0E7C78]" aria-hidden="true" />
              Paymob Online Gateway Status
            </h2>
            <p className="mt-1 text-xs text-[#52606D]">
              Callback URL: <code className="font-mono">{data.providerStatus.callbackUrl}</code> · Currency: {data.providerStatus.currency}
            </p>
          </div>
          <StatusBadge
            status={data.providerStatus.health.status === 'READY' ? 'PUBLISHED' : 'DRAFT'}
            label={data.providerStatus.health.label}
          />
        </div>
        {data.providerStatus.health.missingFields.length > 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-950">
            <strong>Online payment hidden from checkout</strong> — missing configuration: {data.providerStatus.health.missingFields.join(', ')}. Configure credentials via deployment secrets or Owner Settings after sandbox verification.
          </p>
        )}
      </section>

      {/* Bank Transfer Proofs Queue */}
      <section className="rounded-2xl border border-[#E5DFD2] bg-white p-5 space-y-3">
        <h2 className="text-base font-extrabold text-[#103D45]">Manual Transfer Proofs ({data.proofs.length})</h2>
        {data.proofs.length === 0 ? (
          <p className="text-xs text-[#52606D]">No manual transfer proofs uploaded yet.</p>
        ) : (
          <div className="space-y-2.5">
            {data.proofs.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#EFEAE0] bg-[#FAF8F4] p-4 text-xs">
                <div>
                  <p className="font-bold text-[#103D45]">
                    {p.booking.reference} · {p.booking.leadName} · Ref: <span className="font-mono">{p.transferReference}</span>
                  </p>
                  <p className="text-[#52606D]">
                    Submitted: <strong>{formatMinorUnitsExact(p.submittedAmountMinor, p.submittedCurrency)}</strong> (Booking total: {formatMinorUnitsExact(p.booking.grandTotalMinor, p.booking.currency)})
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={p.status} />
                  {hasPerm('payments:proofs:read') && (
                    <a
                      href={`/api/v1/admin/media/${p.mediaAssetId}/private`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 font-bold text-[#103D45]"
                    >
                      View File <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                  {p.status === 'PENDING_REVIEW' && hasPerm('payments:verify') && (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await adminFetch(`/admin/payments/proofs/${p.id}/review`, {
                              method: 'POST',
                              body: {
                                decision: 'VERIFY',
                                verifiedAmountMinor: p.submittedAmountMinor,
                                verifiedCurrency: p.submittedCurrency,
                                confirmBookingIfEligible: true,
                                reviewNote: 'Verified against bank transfer receipt',
                              },
                            });
                            toast('Transfer verified and recorded in immutable ledger.', 'success');
                            await load();
                          } catch (err) {
                            toast(err instanceof Error ? err.message : 'Verification failed', 'error');
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 font-bold text-white"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" /> Verify &amp; Record
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await adminFetch(`/admin/payments/proofs/${p.id}/review`, {
                            method: 'POST',
                            body: { decision: 'REJECT', reviewNote: 'Receipt could not be verified' },
                          });
                          toast('Proof rejected.', 'info');
                          await load();
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-rose-700 px-3 py-1.5 font-bold text-white"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" /> Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pending Refunds Queue */}
      <section className="rounded-2xl border border-[#E5DFD2] bg-white p-5 space-y-3">
        <h2 className="text-base font-extrabold text-[#103D45]">Refund Requests ({data.refunds.length})</h2>
        {data.refunds.length === 0 ? (
          <p className="text-xs text-[#52606D]">No refund requests.</p>
        ) : (
          <div className="space-y-2">
            {data.refunds.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#FAF8F4] p-3.5 text-xs">
                <div>
                  <p className="font-bold text-[#103D45]">{r.booking.reference} · {formatMinorUnitsExact(r.amountMinor, r.currency)}</p>
                  <p className="text-[#52606D]">{r.reason}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  {hasPerm('payments:refund') && ['PENDING', 'APPROVED'].includes(r.status) && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await adminFetch('/admin/payments/refunds', {
                            method: 'POST',
                            body: { bookingId: r.bookingId, refundRequestId: r.id, amountMinor: r.amountMinor, reason: r.reason },
                          });
                          toast('Refund processed and recorded in immutable ledger.', 'success');
                          await load();
                        } catch (err) {
                          toast(err instanceof Error ? err.message : 'Refund failed', 'error');
                        }
                      }}
                      className="rounded-lg bg-[#103D45] px-3 py-1.5 font-bold text-white"
                    >
                      Process Refund
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Immutable Ledger */}
      <section className="rounded-2xl border border-[#E5DFD2] bg-white p-5">
        <h2 className="mb-3 text-base font-extrabold text-[#103D45]">Immutable Payment &amp; Refund Ledger</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="visually-hidden">Immutable financial ledger</caption>
            <thead className="border-b border-[#E5DFD2] uppercase text-[#52606D]">
              <tr>
                <th scope="col" className="py-2 pr-3">Date (UTC)</th>
                <th scope="col" className="py-2 pr-3">Booking</th>
                <th scope="col" className="py-2 pr-3">Type</th>
                <th scope="col" className="py-2 pr-3">Provider / Ref</th>
                <th scope="col" className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1EDE4]">
              {data.ledger.map((e) => (
                <tr key={e.id}>
                  <td className="py-2.5 pr-3 text-[#52606D]">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="py-2.5 pr-3 font-mono font-bold text-[#0E7C78]">{e.booking.reference}</td>
                  <td className="py-2.5 pr-3"><StatusBadge status={e.type === 'REFUND' ? 'REFUNDED' : 'PAID'} label={e.type} /></td>
                  <td className="py-2.5 pr-3">{e.provider} · {e.externalRef || '—'}</td>
                  <td className="py-2.5 text-right font-bold">{formatMinorUnitsExact(e.amountMinor, e.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
