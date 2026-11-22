'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Edit, Plus, Trash2 } from 'lucide-react';
import { NativeDialog, StatusBadge } from '@sharm/ui';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

interface DestRow {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  heroSubtitle: string;
  description: string;
  heroImageUrl: string;
  heroImageAlt: string;
  displayOrder: number;
  isVisible: boolean;
  _count: { tours: number; pickupZones: number };
}

export default function AdminDestinationsPage() {
  const { adminFetch, hasPerm, toast } = useAdminAuth();
  const [list, setList] = useState<DestRow[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DestRow | null>(null);
  const [form, setForm] = useState({
    slug: '',
    name: '',
    tagline: '',
    heroSubtitle: '',
    description: '',
    heroImageUrl: '/media/hero-red-sea-yacht.webp',
    heroImageAlt: 'Egypt destination view',
    displayOrder: 6,
    isVisible: true,
  });

  const load = useCallback(async () => {
    const res = await adminFetch<DestRow[]>('/admin/destinations');
    setList(res);
  }, [adminFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setEditing(null);
    setForm({
      slug: '',
      name: '',
      tagline: '',
      heroSubtitle: '',
      description: '',
      heroImageUrl: '/media/hero-red-sea-yacht.webp',
      heroImageAlt: '',
      displayOrder: list.length + 1,
      isVisible: true,
    });
    setOpen(true);
  }

  function openEdit(d: DestRow) {
    setEditing(d);
    setForm({
      slug: d.slug,
      name: d.name,
      tagline: d.tagline,
      heroSubtitle: d.heroSubtitle,
      description: d.description,
      heroImageUrl: d.heroImageUrl,
      heroImageAlt: d.heroImageAlt,
      displayOrder: d.displayOrder,
      isVisible: d.isVisible,
    });
    setOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editing) {
        await adminFetch(`/admin/destinations/${editing.id}`, { method: 'PATCH', body: form });
        toast('Destination updated.', 'success');
      } else {
        await adminFetch('/admin/destinations', { method: 'POST', body: form });
        toast('New destination created (available immediately at /destinations/' + form.slug + ').', 'success');
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#52606D]">Manage the 5 core Egypt destinations or add new ones without code changes.</p>
        {hasPerm('destinations:write') && (
          <button type="button" onClick={openNew} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-[#0E7C78] px-5 text-xs font-bold text-white">
            <Plus className="h-4 w-4" aria-hidden="true" /> Add Destination
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((d) => (
          <div key={d.id} className="overflow-hidden rounded-2xl border border-[#E5DFD2] bg-white shadow-xs">
            <img src={d.heroImageUrl} alt={d.heroImageAlt} className="aspect-[16/9] w-full object-cover" />
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-extrabold text-[#103D45]">{d.name}</h2>
                <StatusBadge status={d.isVisible ? 'PUBLISHED' : 'DRAFT'} label={d.isVisible ? 'Visible' : 'Hidden'} />
              </div>
              <p className="font-mono text-xs text-[#0E7C78]">/destinations/{d.slug}</p>
              <p className="text-xs text-[#52606D]">{d.tagline}</p>
              <p className="text-xs font-semibold text-[#52606D]">Order #{d.displayOrder} · {d._count.tours} tours</p>
              {hasPerm('destinations:write') && (
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => openEdit(d)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border py-2 text-xs font-bold">
                    <Edit className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await adminFetch(`/admin/destinations/${d.id}`, { method: 'DELETE' });
                        toast('Destination deleted.', 'success');
                        await load();
                      } catch (err) {
                        toast(err instanceof Error ? err.message : 'Cannot delete', 'error');
                      }
                    }}
                    aria-label={`Delete ${d.name}`}
                    className="rounded-xl border border-rose-200 px-3 py-2 text-rose-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <NativeDialog open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${editing.name}` : 'New Destination'}>
        <form onSubmit={handleSave} className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="d-name" className="block text-xs font-bold">Name *</label>
              <input id="d-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 min-h-[40px] w-full rounded-xl border px-3 text-xs" />
            </div>
            <div>
              <label htmlFor="d-slug" className="block text-xs font-bold">Slug *</label>
              <input id="d-slug" required disabled={Boolean(editing)} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="mt-1 min-h-[40px] w-full rounded-xl border px-3 font-mono text-xs disabled:bg-slate-100" />
            </div>
          </div>
          <div>
            <label htmlFor="d-tag" className="block text-xs font-bold">Tagline</label>
            <input id="d-tag" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} className="mt-1 min-h-[40px] w-full rounded-xl border px-3 text-xs" />
          </div>
          <div>
            <label htmlFor="d-desc" className="block text-xs font-bold">Description</label>
            <textarea id="d-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-xs" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="d-img" className="block text-xs font-bold">Hero Image URL</label>
              <input id="d-img" value={form.heroImageUrl} onChange={(e) => setForm({ ...form, heroImageUrl: e.target.value })} className="mt-1 min-h-[40px] w-full rounded-xl border px-3 text-xs" />
            </div>
            <div>
              <label htmlFor="d-order" className="block text-xs font-bold">Display Order</label>
              <input id="d-order" type="number" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })} className="mt-1 min-h-[40px] w-full rounded-xl border px-3 text-xs" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold">
            <input type="checkbox" checked={form.isVisible} onChange={(e) => setForm({ ...form, isVisible: e.target.checked })} className="h-4 w-4 accent-[#0E7C78]" />
            Visible on public website
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="min-h-[40px] rounded-full border px-4 text-xs font-bold">Cancel</button>
            <button type="submit" className="min-h-[40px] rounded-full bg-[#0E7C78] px-5 text-xs font-bold text-white">Save</button>
          </div>
        </form>
      </NativeDialog>
    </div>
  );
}
