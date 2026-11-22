'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { formatMinorUnitsExact } from '@sharm/contracts';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

interface TaxonomyPayload {
  categories: Array<{ id: string; slug: string; name: string; _count: { tours: number } }>;
  addons: Array<{ id: string; code: string; title: string; pricingBasis: string; priceMinor: number; currency: string; _count: { tours: number } }>;
  pickupZones: Array<{ id: string; name: string; surchargeMinor: number; currency: string; destination: { name: string }; _count: { tours: number } }>;
  policies: Array<{ id: string; code: string; name: string; summary: string; freeCancellationHours: number; _count: { tours: number }; versions: Array<{ versionNumber: number }> }>;
}

export default function AdminTaxonomyPage() {
  const { adminFetch, hasPerm, toast } = useAdminAuth();
  const [data, setData] = useState<TaxonomyPayload | null>(null);
  const [destinations, setDestinations] = useState<Array<{ id: string; name: string }>>([]);

  const [catName, setCatName] = useState('');
  const [addonTitle, setAddonTitle] = useState('');
  const [addonPrice, setAddonPrice] = useState('20');
  const [pzDest, setPzDest] = useState('');
  const [pzName, setPzName] = useState('');
  const [pzSurcharge, setPzSurcharge] = useState('0');
  const [polName, setPolName] = useState('');
  const [polFreeHrs, setPolFreeHrs] = useState('24');

  const load = useCallback(async () => {
    const [tax, dests] = await Promise.all([
      adminFetch<TaxonomyPayload>('/admin/taxonomy'),
      adminFetch<Array<{ id: string; name: string }>>('/admin/destinations'),
    ]);
    setData(tax);
    setDestinations(dests);
    if (!pzDest && dests[0]) setPzDest(dests[0].id);
  }, [adminFetch, pzDest]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <p className="text-sm text-[#52606D]">Loading taxonomy...</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Categories */}
      <section className="rounded-2xl border border-[#E5DFD2] bg-white p-5 space-y-4">
        <h2 className="text-base font-extrabold text-[#103D45]">Activity Categories</h2>
        {hasPerm('taxonomy:write') && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await adminFetch('/admin/taxonomy/categories', {
                  method: 'POST',
                  body: { name: catName, slug: catName.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
                });
                setCatName('');
                toast('Category created.', 'success');
                await load();
              } catch (err) {
                toast(err instanceof Error ? err.message : 'Failed', 'error');
              }
            }}
            className="flex gap-2"
          >
            <input required value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="New category name" className="min-h-[38px] flex-1 rounded-xl border px-3 text-xs" />
            <button type="submit" className="rounded-xl bg-[#0E7C78] px-4 text-xs font-bold text-white">Add</button>
          </form>
        )}
        <ul className="space-y-2 text-xs">
          {data.categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-xl bg-[#FAF8F4] px-3 py-2">
              <span><strong>{c.name}</strong> ({c._count.tours} tours)</span>
              {hasPerm('taxonomy:write') && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await adminFetch(`/admin/taxonomy/categories/${c.id}`, { method: 'DELETE' });
                      toast('Category deleted.', 'success');
                      await load();
                    } catch (err) {
                      toast(err instanceof Error ? err.message : 'In use', 'error');
                    }
                  }}
                  aria-label={`Delete category ${c.name}`}
                  className="text-rose-700"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Add-ons */}
      <section className="rounded-2xl border border-[#E5DFD2] bg-white p-5 space-y-4">
        <h2 className="text-base font-extrabold text-[#103D45]">Reusable Tour Add-Ons</h2>
        {hasPerm('taxonomy:write') && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await adminFetch('/admin/taxonomy/addons', {
                  method: 'POST',
                  body: {
                    code: addonTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    title: addonTitle,
                    pricingBasis: 'PER_BOOKING',
                    priceMinor: Math.round(Number(addonPrice) * 100),
                  },
                });
                setAddonTitle('');
                toast('Add-on created.', 'success');
                await load();
              } catch (err) {
                toast(err instanceof Error ? err.message : 'Failed', 'error');
              }
            }}
            className="flex gap-2"
          >
            <input required value={addonTitle} onChange={(e) => setAddonTitle(e.target.value)} placeholder="Add-on title" className="min-h-[38px] flex-1 rounded-xl border px-3 text-xs" />
            <input required type="number" step="0.01" value={addonPrice} onChange={(e) => setAddonPrice(e.target.value)} className="w-20 rounded-xl border px-2 text-xs" />
            <button type="submit" className="rounded-xl bg-[#0E7C78] px-4 text-xs font-bold text-white">Add</button>
          </form>
        )}
        <ul className="space-y-2 text-xs">
          {data.addons.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-xl bg-[#FAF8F4] px-3 py-2">
              <span><strong>{a.title}</strong> · {formatMinorUnitsExact(a.priceMinor, a.currency)} ({a.pricingBasis}) · {a._count.tours} tours</span>
              {hasPerm('taxonomy:write') && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await adminFetch(`/admin/taxonomy/addons/${a.id}`, { method: 'DELETE' });
                      toast('Add-on deleted.', 'success');
                      await load();
                    } catch (err) {
                      toast(err instanceof Error ? err.message : 'In use', 'error');
                    }
                  }}
                  aria-label={`Delete add-on ${a.title}`}
                  className="text-rose-700"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Pickup Zones */}
      <section className="rounded-2xl border border-[#E5DFD2] bg-white p-5 space-y-4">
        <h2 className="text-base font-extrabold text-[#103D45]">Pickup Zones</h2>
        {hasPerm('taxonomy:write') && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await adminFetch('/admin/taxonomy/pickup-zones', {
                  method: 'POST',
                  body: { destinationId: pzDest, name: pzName, surchargeMinor: Math.round(Number(pzSurcharge) * 100) },
                });
                setPzName('');
                toast('Pickup zone created.', 'success');
                await load();
              } catch (err) {
                toast(err instanceof Error ? err.message : 'Failed', 'error');
              }
            }}
            className="flex flex-wrap gap-2"
          >
            <select value={pzDest} onChange={(e) => setPzDest(e.target.value)} className="min-h-[38px] rounded-xl border bg-white px-2 text-xs">
              {destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <input required value={pzName} onChange={(e) => setPzName(e.target.value)} placeholder="Zone name" className="min-h-[38px] flex-1 rounded-xl border px-3 text-xs" />
            <input type="number" step="0.01" value={pzSurcharge} onChange={(e) => setPzSurcharge(e.target.value)} className="w-20 rounded-xl border px-2 text-xs" />
            <button type="submit" className="rounded-xl bg-[#0E7C78] px-4 text-xs font-bold text-white">Add</button>
          </form>
        )}
        <ul className="max-h-60 overflow-y-auto space-y-1.5 text-xs">
          {data.pickupZones.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl bg-[#FAF8F4] px-3 py-2">
              <span><strong>{p.destination.name}</strong>: {p.name} ({formatMinorUnitsExact(p.surchargeMinor, p.currency)})</span>
              {hasPerm('taxonomy:write') && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await adminFetch(`/admin/taxonomy/pickup-zones/${p.id}`, { method: 'DELETE' });
                      await load();
                    } catch (err) {
                      toast(err instanceof Error ? err.message : 'In use', 'error');
                    }
                  }}
                  aria-label={`Delete pickup zone ${p.name}`}
                  className="text-rose-700"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Reusable Cancellation Policies */}
      <section className="rounded-2xl border border-[#E5DFD2] bg-white p-5 space-y-4">
        <h2 className="text-base font-extrabold text-[#103D45]">Reusable Booking &amp; Cancellation Policies</h2>
        {hasPerm('taxonomy:write') && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await adminFetch('/admin/taxonomy/policies', {
                  method: 'POST',
                  body: {
                    code: polName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    name: polName,
                    summary: `Free cancellation up to ${polFreeHrs} hours prior to Africa/Cairo departure.`,
                    bodyMarkdown: `Free cancellation up to ${polFreeHrs} hours before departure in Africa/Cairo timezone.`,
                    freeCancellationHours: Number(polFreeHrs),
                    partialRefundHours: Math.floor(Number(polFreeHrs) / 2),
                    partialRefundPercentBps: 5000,
                  },
                });
                setPolName('');
                toast('Reusable policy created with immutable v1.', 'success');
                await load();
              } catch (err) {
                toast(err instanceof Error ? err.message : 'Failed', 'error');
              }
            }}
            className="flex gap-2"
          >
            <input required value={polName} onChange={(e) => setPolName(e.target.value)} placeholder="Policy title" className="min-h-[38px] flex-1 rounded-xl border px-3 text-xs" />
            <input type="number" min={0} value={polFreeHrs} onChange={(e) => setPolFreeHrs(e.target.value)} className="w-20 rounded-xl border px-2 text-xs" title="Free cancel hours" />
            <button type="submit" className="rounded-xl bg-[#0E7C78] px-4 text-xs font-bold text-white">Add</button>
          </form>
        )}
        <ul className="space-y-2 text-xs">
          {data.policies.map((p) => (
            <li key={p.id} className="rounded-xl bg-[#FAF8F4] p-3">
              <div className="flex justify-between font-bold text-[#103D45]">
                <span>{p.name}</span>
                <span>v{p.versions[0]?.versionNumber ?? 1} · {p._count.tours} tours</span>
              </div>
              <p className="mt-1 text-[#52606D]">{p.summary}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
