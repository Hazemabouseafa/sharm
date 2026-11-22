'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { formatMinorUnitsExact } from '@sharm/contracts';
import { StatusBadge } from '@sharm/ui';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

interface PromoRow {
  id: string;
  code: string;
  title: string;
  discountType: 'FIXED' | 'PERCENT';
  value: number;
  currency: string;
  minOrderMinor: number;
  maxTotalUses: number | null;
  usedCount: number;
  maxUsesPerEmail: number | null;
  validUntil: string;
  isActive: boolean;
}

export default function AdminPromotionsPage() {
  const { adminFetch, hasPerm, toast } = useAdminAuth();
  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [valueInput, setValueInput] = useState('10');
  const [maxTotalUses, setMaxTotalUses] = useState('50');

  const load = useCallback(async () => {
    setPromos(await adminFetch<PromoRow[]>('/admin/promotions'));
  }, [adminFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const value = discountType === 'PERCENT' ? Math.round(Number(valueInput) * 100) : Math.round(Number(valueInput) * 100);
      await adminFetch('/admin/promotions', {
        method: 'POST',
        body: {
          code,
          title,
          discountType,
          value,
          minOrderMinor: 0,
          validFrom: new Date().toISOString(),
          validUntil: new Date(Date.now() + 90 * 86400_000).toISOString(),
          maxTotalUses: maxTotalUses ? Number(maxTotalUses) : null,
        },
      });
      setCode('');
      setTitle('');
      toast('Promotion created.', 'success');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to create promotion', 'error');
    }
  }

  return (
    <div className="space-y-6">
      {hasPerm('promotions:write') && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-[#E5DFD2] bg-white p-5 space-y-3">
          <h2 className="text-base font-extrabold text-[#103D45]">Create Promotion Code (Non-Stacking, Concurrency-Safe)</h2>
          <div className="grid gap-3 sm:grid-cols-5">
            <input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE (e.g. SINAI15)" className="min-h-[40px] rounded-xl border px-3 font-mono text-xs uppercase" />
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Description" className="min-h-[40px] rounded-xl border px-3 text-xs" />
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value as 'PERCENT' | 'FIXED')} className="min-h-[40px] rounded-xl border bg-white px-3 text-xs">
              <option value="PERCENT">Percent (%)</option>
              <option value="FIXED">Fixed (USD)</option>
            </select>
            <input required type="number" step="0.5" min="1" value={valueInput} onChange={(e) => setValueInput(e.target.value)} placeholder="Value" className="min-h-[40px] rounded-xl border px-3 text-xs" />
            <div className="flex gap-2">
              <input type="number" min="1" value={maxTotalUses} onChange={(e) => setMaxTotalUses(e.target.value)} placeholder="Max uses" className="min-h-[40px] w-20 rounded-xl border px-2 text-xs" />
              <button type="submit" className="min-h-[40px] flex-1 rounded-full bg-[#0E7C78] px-4 text-xs font-bold text-white">Create</button>
            </div>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[#E5DFD2] bg-white shadow-xs">
        <table className="w-full text-left text-sm">
          <caption className="visually-hidden">Promotions list</caption>
          <thead className="border-b border-[#E5DFD2] bg-[#FAF8F4] text-xs uppercase text-[#52606D]">
            <tr>
              <th scope="col" className="p-3.5">Code</th>
              <th scope="col" className="p-3.5">Title</th>
              <th scope="col" className="p-3.5">Discount</th>
              <th scope="col" className="p-3.5">Usage</th>
              <th scope="col" className="p-3.5">Status</th>
              <th scope="col" className="p-3.5 text-right">Toggle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1EDE4]">
            {promos.map((p) => (
              <tr key={p.id}>
                <td className="p-3.5 font-mono text-xs font-extrabold text-[#0E7C78]">{p.code}</td>
                <td className="p-3.5 text-xs font-semibold">{p.title}</td>
                <td className="p-3.5 text-xs font-bold">
                  {p.discountType === 'PERCENT' ? `${(p.value / 100).toFixed(0)}%` : formatMinorUnitsExact(p.value, p.currency)}
                </td>
                <td className="p-3.5 text-xs">{p.usedCount} / {p.maxTotalUses ?? '∞'}</td>
                <td className="p-3.5"><StatusBadge status={p.isActive ? 'PUBLISHED' : 'CLOSED'} label={p.isActive ? 'Active' : 'Paused'} /></td>
                <td className="p-3.5 text-right">
                  {hasPerm('promotions:write') && (
                    <button
                      type="button"
                      onClick={async () => {
                        await adminFetch(`/admin/promotions/${p.id}`, { method: 'PATCH', body: { isActive: !p.isActive } });
                        await load();
                      }}
                      className="rounded-lg border px-3 py-1 text-xs font-bold"
                    >
                      {p.isActive ? 'Pause' : 'Activate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
