'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Download, UserX } from 'lucide-react';
import { NativeDialog } from '@sharm/ui';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

interface CustomerRow {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  anonymizedAt: string | null;
  _count: { bookings: number };
}

export default function AdminCustomersPage() {
  const { adminFetch, hasPerm, toast } = useAdminAuth();
  const [q, setQ] = useState('');
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [anonTarget, setAnonTarget] = useState<CustomerRow | null>(null);
  const [anonReason, setAnonReason] = useState('');

  const load = useCallback(async () => {
    const res = await adminFetch<CustomerRow[]>(`/admin/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    setCustomers(res);
  }, [adminFetch, q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleExport(id: string) {
    try {
      const data = await adminFetch(`/admin/customers/${id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `customer-export-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Customer data exported (staff notes excluded).', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed', 'error');
    }
  }

  async function handleAnonymize() {
    if (!anonTarget) return;
    try {
      await adminFetch(`/admin/customers/${anonTarget.id}/anonymize`, {
        method: 'POST',
        body: { reason: anonReason },
      });
      toast('Customer PII anonymized cleanly while preserving immutable financial totals.', 'success');
      setAnonTarget(null);
      setAnonReason('');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Anonymization failed', 'error');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guest name, email, phone..." className="min-h-[40px] w-72 rounded-xl border bg-white px-3 text-sm" />
          <button type="button" onClick={() => void load()} className="rounded-xl bg-[#103D45] px-4 text-xs font-bold text-white">Search</button>
        </div>
        <p className="text-xs text-[#52606D]">Guests are matched strictly by verified email (never merged on name alone).</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#E5DFD2] bg-white shadow-xs">
        <table className="w-full text-left text-sm">
          <caption className="visually-hidden">Customer contact records</caption>
          <thead className="border-b border-[#E5DFD2] bg-[#FAF8F4] text-xs uppercase text-[#52606D]">
            <tr>
              <th scope="col" className="p-3.5">Traveler</th>
              <th scope="col" className="p-3.5">Email</th>
              <th scope="col" className="p-3.5">Phone</th>
              <th scope="col" className="p-3.5">Bookings</th>
              <th scope="col" className="p-3.5 text-right">Privacy Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1EDE4]">
            {customers.map((c) => (
              <tr key={c.id}>
                <td className="p-3.5 font-bold text-[#103D45]">{c.fullName}</td>
                <td className="p-3.5 font-mono text-xs">{c.email}</td>
                <td className="p-3.5 text-xs text-[#52606D]">{c.phone || '—'}</td>
                <td className="p-3.5 text-xs font-bold">{c._count.bookings}</td>
                <td className="p-3.5 text-right">
                  <div className="inline-flex gap-2">
                    {hasPerm('customers:export') && (
                      <button type="button" onClick={() => handleExport(c.id)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold">
                        <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export
                      </button>
                    )}
                    {hasPerm('customers:anonymize') && !c.anonymizedAt && (
                      <button type="button" onClick={() => setAnonTarget(c)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-800">
                        <UserX className="h-3.5 w-3.5" aria-hidden="true" /> Anonymize
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NativeDialog
        open={Boolean(anonTarget)}
        onClose={() => setAnonTarget(null)}
        title="Anonymize Traveler PII?"
        description="Replaces personal identifiers with redacted placeholders while keeping immutable financial totals intact."
      >
        <div className="space-y-4">
          <textarea
            rows={3}
            required
            value={anonReason}
            onChange={(e) => setAnonReason(e.target.value)}
            placeholder="Audit reason (e.g. Guest erasure request ticket #123)"
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button type="button" autoFocus onClick={() => setAnonTarget(null)} className="min-h-[40px] rounded-full border px-4 text-xs font-bold">Cancel</button>
            <button type="button" onClick={handleAnonymize} className="min-h-[40px] rounded-full bg-rose-700 px-5 text-xs font-bold text-white">Anonymize PII</button>
          </div>
        </div>
      </NativeDialog>
    </div>
  );
}
