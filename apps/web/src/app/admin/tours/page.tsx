'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Archive, CheckCircle2, Copy, Edit, Plus } from 'lucide-react';
import { NativeDialog, StatusBadge } from '@sharm/ui';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

interface AdminTourRow {
  id: string;
  slug: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  pricingMode: 'PER_PERSON' | 'PRIVATE_GROUP';
  currency: string;
  durationLabel: string;
  featured: boolean;
  version: number;
  destination: { id: string; name: string; slug: string };
  policy: { id: string; name: string } | null;
  _count: { departures: number; bookings: number };
}

export default function AdminToursPage() {
  const { adminFetch, hasPerm, toast } = useAdminAuth();
  const [tours, setTours] = useState<AdminTourRow[]>([]);
  const [destinations, setDestinations] = useState<Array<{ id: string; name: string }>>([]);
  const [policies, setPolicies] = useState<Array<{ id: string; name: string }>>([]);
  const [q, setQ] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVersion, setEditVersion] = useState(1);

  const [form, setForm] = useState({
    title: '',
    slug: '',
    destinationId: '',
    shortDescription: '',
    durationLabel: 'Full Day',
    durationHours: 8,
    pricingMode: 'PER_PERSON' as 'PER_PERSON' | 'PRIVATE_GROUP',
    adultPriceUsd: '65',
    childPriceUsd: '35',
    privateGroupPriceUsd: '250',
    policyId: '',
    primaryImageUrl: '/media/sharm-ras-mohamed-white-island.webp',
    primaryImageAlt: 'Red Sea excursion view',
    featured: false,
    instantConfirmPayLater: false,
  });

  const load = useCallback(async () => {
    try {
      const [tRes, dRes, taxRes] = await Promise.all([
        adminFetch<AdminTourRow[]>(`/admin/tours${q ? `?q=${encodeURIComponent(q)}` : ''}`),
        adminFetch<Array<{ id: string; name: string }>>('/admin/destinations'),
        adminFetch<{ policies: Array<{ id: string; name: string }> }>('/admin/taxonomy'),
      ]);
      setTours(tRes);
      setDestinations(dRes);
      setPolicies(taxRes.policies);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load tours', 'error');
    }
  }, [adminFetch, q, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm({
      title: '',
      slug: '',
      destinationId: destinations[0]?.id || '',
      shortDescription: '',
      durationLabel: 'Full Day',
      durationHours: 8,
      pricingMode: 'PER_PERSON',
      adultPriceUsd: '65',
      childPriceUsd: '35',
      privateGroupPriceUsd: '250',
      policyId: policies[0]?.id || '',
      primaryImageUrl: '/media/sharm-ras-mohamed-white-island.webp',
      primaryImageAlt: 'Red Sea excursion view',
      featured: false,
      instantConfirmPayLater: false,
    });
    setModalOpen(true);
  }

  async function openEdit(id: string) {
    const t = await adminFetch<Record<string, unknown>>(`/admin/tours/${id}`);
    const bands = Array.isArray(t.ageBandsJson) ? (t.ageBandsJson as Array<{ code: string; priceMinor: number }>) : [];
    const adult = bands.find((b) => b.code === 'ADULT')?.priceMinor ?? 6000;
    const child = bands.find((b) => b.code === 'CHILD')?.priceMinor ?? 3500;
    setEditingId(id);
    setEditVersion(Number(t.version || 1));
    setForm({
      title: String(t.title || ''),
      slug: String(t.slug || ''),
      destinationId: String(t.destinationId || ''),
      shortDescription: String(t.shortDescription || ''),
      durationLabel: String(t.durationLabel || 'Full Day'),
      durationHours: Number(t.durationHours || 8),
      pricingMode: (t.pricingMode === 'PRIVATE_GROUP' ? 'PRIVATE_GROUP' : 'PER_PERSON'),
      adultPriceUsd: String(adult / 100),
      childPriceUsd: String(child / 100),
      privateGroupPriceUsd: String(Number(t.privateGroupPriceMinor || 25000) / 100),
      policyId: String(t.policyId || ''),
      primaryImageUrl: String(t.primaryImageUrl || '/media/sharm-ras-mohamed-white-island.webp'),
      primaryImageAlt: String(t.primaryImageAlt || ''),
      featured: Boolean(t.featured),
      instantConfirmPayLater: Boolean(t.instantConfirmPayLater),
    });
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      title: form.title,
      slug: form.slug || form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      destinationId: form.destinationId,
      shortDescription: form.shortDescription,
      durationLabel: form.durationLabel,
      durationHours: form.durationHours,
      pricingMode: form.pricingMode,
      privateGroupPriceMinor: form.pricingMode === 'PRIVATE_GROUP' ? Math.round(Number(form.privateGroupPriceUsd) * 100) : null,
      ageBands: [
        { code: 'ADULT', label: 'Adult (12+ yrs)', minAge: 12, maxAge: null, priceMinor: Math.round(Number(form.adultPriceUsd) * 100), consumesSeat: true },
        { code: 'CHILD', label: 'Child (4–11 yrs)', minAge: 4, maxAge: 11, priceMinor: Math.round(Number(form.childPriceUsd) * 100), consumesSeat: true },
        { code: 'INFANT', label: 'Infant (0–3 yrs)', minAge: 0, maxAge: 3, priceMinor: 0, consumesSeat: false },
      ],
      policyId: form.policyId || null,
      primaryImageUrl: form.primaryImageUrl,
      primaryImageAlt: form.primaryImageAlt || form.title,
      featured: form.featured,
      instantConfirmPayLater: form.instantConfirmPayLater,
      ...(editingId ? { version: editVersion } : {}),
    };

    try {
      if (editingId) {
        await adminFetch(`/admin/tours/${editingId}`, { method: 'PATCH', body: payload });
        toast('Tour updated and persisted.', 'success');
      } else {
        await adminFetch('/admin/tours', { method: 'POST', body: payload });
        toast('Draft tour created. Add departures in Availability before publishing.', 'success');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5DFD2] bg-white p-4">
        <div className="flex gap-2">
          <input
            type="search"
            aria-label="Search tours"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tours..."
            className="min-h-[40px] rounded-xl border border-[#CBD5E1] px-3 text-sm"
          />
          <button type="button" onClick={() => void load()} className="rounded-xl bg-[#103D45] px-4 text-xs font-bold text-white">
            Search
          </button>
        </div>
        {hasPerm('tours:write') && (
          <button type="button" onClick={openCreate} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-[#0E7C78] px-5 text-xs font-bold text-white hover:bg-[#103D45]">
            <Plus className="h-4 w-4" aria-hidden="true" /> Create Tour
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#E5DFD2] bg-white shadow-xs">
        <table className="w-full text-left text-sm">
          <caption className="visually-hidden">Tours catalog</caption>
          <thead className="border-b border-[#E5DFD2] bg-[#FAF8F4] text-xs uppercase text-[#52606D]">
            <tr>
              <th scope="col" className="p-3.5">Tour</th>
              <th scope="col" className="p-3.5">Destination</th>
              <th scope="col" className="p-3.5">Status</th>
              <th scope="col" className="p-3.5">Pricing</th>
              <th scope="col" className="p-3.5">Departures / Bookings</th>
              <th scope="col" className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1EDE4]">
            {tours.map((t) => (
              <tr key={t.id}>
                <td className="p-3.5">
                  <p className="font-bold text-[#103D45]">{t.title}</p>
                  <p className="font-mono text-xs text-[#52606D]">/tours/{t.slug}</p>
                </td>
                <td className="p-3.5 text-xs font-semibold">{t.destination.name}</td>
                <td className="p-3.5"><StatusBadge status={t.status} /></td>
                <td className="p-3.5 text-xs">{t.pricingMode.replace('_', ' ')} ({t.currency})</td>
                <td className="p-3.5 text-xs">{t._count.departures} slots · {t._count.bookings} bookings</td>
                <td className="p-3.5 text-right">
                  <div className="inline-flex flex-wrap justify-end gap-1.5">
                    {hasPerm('tours:write') && (
                      <button type="button" onClick={() => openEdit(t.id)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold">
                        <Edit className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                      </button>
                    )}
                    {hasPerm('tours:publish') && t.status !== 'PUBLISHED' && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await adminFetch(`/admin/tours/${t.id}/publish`, { method: 'POST' });
                            toast('Tour published live!', 'success');
                            await load();
                          } catch (err) {
                            toast(err instanceof Error ? err.message : 'Publish failed', 'error');
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-bold text-white"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Publish
                      </button>
                    )}
                    {hasPerm('tours:write') && (
                      <button
                        type="button"
                        onClick={async () => {
                          await adminFetch(`/admin/tours/${t.id}/clone`, { method: 'POST' });
                          toast('Cloned tour as DRAFT.', 'success');
                          await load();
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Clone
                      </button>
                    )}
                    {hasPerm('tours:archive') && t.status !== 'ARCHIVED' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await adminFetch(`/admin/tours/${t.id}/archive`, { method: 'POST' });
                          toast('Tour archived (historical bookings preserved).', 'success');
                          await load();
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900"
                      >
                        <Archive className="h-3.5 w-3.5" aria-hidden="true" /> Archive
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NativeDialog open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Tour' : 'Create New Draft Tour'} maxWidthClass="max-w-2xl">
        <form onSubmit={handleSave} className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="t-title" className="block text-xs font-bold">Title *</label>
              <input id="t-title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 min-h-[40px] w-full rounded-xl border px-3 text-xs" />
            </div>
            <div>
              <label htmlFor="t-slug" className="block text-xs font-bold">Slug *</label>
              <input id="t-slug" required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="sunset-snorkeling-tour" className="mt-1 min-h-[40px] w-full rounded-xl border px-3 font-mono text-xs" />
            </div>
            <div>
              <label htmlFor="t-dest" className="block text-xs font-bold">Destination *</label>
              <select id="t-dest" required value={form.destinationId} onChange={(e) => setForm({ ...form, destinationId: e.target.value })} className="mt-1 min-h-[40px] w-full rounded-xl border bg-white px-3 text-xs">
                {destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="t-policy" className="block text-xs font-bold">Cancellation Policy *</label>
              <select id="t-policy" value={form.policyId} onChange={(e) => setForm({ ...form, policyId: e.target.value })} className="mt-1 min-h-[40px] w-full rounded-xl border bg-white px-3 text-xs">
                <option value="">None (Draft only)</option>
                {policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="t-short" className="block text-xs font-bold">Short Description *</label>
            <textarea id="t-short" required rows={2} value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-xs" />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="t-mode" className="block text-xs font-bold">Pricing Mode</label>
              <select id="t-mode" value={form.pricingMode} onChange={(e) => setForm({ ...form, pricingMode: e.target.value as 'PER_PERSON' | 'PRIVATE_GROUP' })} className="mt-1 min-h-[40px] w-full rounded-xl border bg-white px-3 text-xs">
                <option value="PER_PERSON">Per Person</option>
                <option value="PRIVATE_GROUP">Private Group Fixed</option>
              </select>
            </div>
            {form.pricingMode === 'PER_PERSON' ? (
              <>
                <div>
                  <label htmlFor="t-adult" className="block text-xs font-bold">Adult Price (USD)</label>
                  <input id="t-adult" type="number" step="0.01" min="1" value={form.adultPriceUsd} onChange={(e) => setForm({ ...form, adultPriceUsd: e.target.value })} className="mt-1 min-h-[40px] w-full rounded-xl border px-3 text-xs" />
                </div>
                <div>
                  <label htmlFor="t-child" className="block text-xs font-bold">Child Price (USD)</label>
                  <input id="t-child" type="number" step="0.01" min="0" value={form.childPriceUsd} onChange={(e) => setForm({ ...form, childPriceUsd: e.target.value })} className="mt-1 min-h-[40px] w-full rounded-xl border px-3 text-xs" />
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="t-priv" className="block text-xs font-bold">Private Group Price (USD)</label>
                <input id="t-priv" type="number" step="0.01" min="1" value={form.privateGroupPriceUsd} onChange={(e) => setForm({ ...form, privateGroupPriceUsd: e.target.value })} className="mt-1 min-h-[40px] w-full rounded-xl border px-3 text-xs" />
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="t-img" className="block text-xs font-bold">Primary Image URL</label>
              <input id="t-img" value={form.primaryImageUrl} onChange={(e) => setForm({ ...form, primaryImageUrl: e.target.value })} className="mt-1 min-h-[40px] w-full rounded-xl border px-3 text-xs" />
            </div>
            <div>
              <label htmlFor="t-dur" className="block text-xs font-bold">Duration Label</label>
              <input id="t-dur" value={form.durationLabel} onChange={(e) => setForm({ ...form, durationLabel: e.target.value })} className="mt-1 min-h-[40px] w-full rounded-xl border px-3 text-xs" />
            </div>
          </div>

          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} className="h-4 w-4 accent-[#0E7C78]" />
              Featured on Homepage
            </label>
            <label className="flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" checked={form.instantConfirmPayLater} onChange={(e) => setForm({ ...form, instantConfirmPayLater: e.target.checked })} className="h-4 w-4 accent-[#0E7C78]" />
              Instant-Confirm Pay Later (when capacity permits)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="min-h-[40px] rounded-full border px-5 text-xs font-bold">Cancel</button>
            <button type="submit" className="min-h-[40px] rounded-full bg-[#0E7C78] px-6 text-xs font-bold text-white">Save Tour</button>
          </div>
        </form>
      </NativeDialog>
    </div>
  );
}
