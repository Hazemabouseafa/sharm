'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Paintbrush, Plus, Save, UploadCloud } from 'lucide-react';
import { GlobalContentDocument } from '@sharm/contracts';
import { StatusBadge } from '@sharm/ui';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

interface CmsPageRow {
  id: string;
  slug: string;
  kind: string;
  title: string;
  isSystemProtected: boolean;
  publishedRevision: { revisionNumber: number; publishedAt: string } | null;
  currentDraft: { revisionNumber: number; version: number } | null;
}

export default function AdminContentPage() {
  const { adminFetch, hasPerm, toast } = useAdminAuth();
  const [pages, setPages] = useState<CmsPageRow[]>([]);
  const [globalDoc, setGlobalDoc] = useState<GlobalContentDocument | null>(null);
  const [globalVersion, setGlobalVersion] = useState(1);

  const [newTitle, setNewTitle] = useState('');
  const [newSlug, setNewSlug] = useState('');

  const load = useCallback(async () => {
    const [pList, gRow] = await Promise.all([
      adminFetch<CmsPageRow[]>('/admin/cms/pages'),
      adminFetch<{ draftJson: GlobalContentDocument; version: number }>('/admin/cms/global'),
    ]);
    setPages(pList);
    setGlobalDoc(gRow.draftJson);
    setGlobalVersion(gRow.version);
  }, [adminFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreatePage(e: React.FormEvent) {
    e.preventDefault();
    try {
      await adminFetch('/admin/cms/pages', { method: 'POST', body: { title: newTitle, slug: newSlug, kind: 'CUSTOM' } });
      setNewTitle('');
      setNewSlug('');
      toast('Custom CMS page created as draft. Open it in Live Editor to edit and publish.', 'success');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to create page', 'error');
    }
  }

  async function handleSaveGlobal(publishNow: boolean) {
    if (!globalDoc) return;
    try {
      const saved = await adminFetch<{ version: number }>('/admin/cms/global/draft', {
        method: 'PUT',
        body: { content: globalDoc, expectedVersion: globalVersion },
      });
      setGlobalVersion(saved.version);
      if (publishNow) {
        await adminFetch('/admin/cms/global/publish', { method: 'POST' });
        toast('Global header, footer, announcement bar & theme published live!', 'success');
      } else {
        toast('Global draft saved.', 'success');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to save global settings', 'error');
    }
  }

  return (
    <div className="space-y-6">
      {/* Pages Management */}
      <section className="rounded-2xl border border-[#E5DFD2] bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-[#103D45]">Website &amp; Legal Pages</h2>
            <p className="text-xs text-[#52606D]">Edit any public page visually in the Live Editor with drafts, preview, and instant publish/rollback.</p>
          </div>
          {hasPerm('cms:write') && (
            <form onSubmit={handleCreatePage} className="flex flex-wrap gap-2">
              <input required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="New page title" className="min-h-[38px] rounded-xl border px-3 text-xs" />
              <input required value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="custom-slug" className="min-h-[38px] rounded-xl border px-3 font-mono text-xs" />
              <button type="submit" className="inline-flex min-h-[38px] items-center gap-1 rounded-full bg-[#0E7C78] px-4 text-xs font-bold text-white">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New Page
              </button>
            </form>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="visually-hidden">CMS pages</caption>
            <thead className="border-b border-[#E5DFD2] text-xs uppercase text-[#52606D]">
              <tr>
                <th scope="col" className="py-2.5 pr-3">Page</th>
                <th scope="col" className="py-2.5 pr-3">Kind</th>
                <th scope="col" className="py-2.5 pr-3">Live Revision</th>
                <th scope="col" className="py-2.5 text-right">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1EDE4]">
              {pages.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 pr-3">
                    <p className="font-bold text-[#103D45]">{p.title}</p>
                    <p className="font-mono text-xs text-[#52606D]">{p.slug}</p>
                  </td>
                  <td className="py-3 pr-3 text-xs font-semibold">{p.kind}</td>
                  <td className="py-3 pr-3">
                    {p.publishedRevision ? (
                      <StatusBadge status="PUBLISHED" label={`Live #${p.publishedRevision.revisionNumber}`} />
                    ) : (
                      <StatusBadge status="DRAFT" label="Unpublished" />
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/admin/live-editor?pageId=${p.id}`}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-[#103D45] px-4 text-xs font-bold text-white hover:bg-[#0E7C78]"
                    >
                      <Paintbrush className="h-3.5 w-3.5" aria-hidden="true" /> Open in Live Editor
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Global Header, Footer, Announcement Bar & Theme */}
      {globalDoc && (
        <section className="rounded-2xl border border-[#E5DFD2] bg-white p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-[#103D45]">Global Header, Footer, Announcement Bar &amp; Theme</h2>
              <p className="text-xs text-[#52606D]">Changes stay in draft until you click Publish Global.</p>
            </div>
            <div className="flex gap-2">
              {hasPerm('cms:write') && (
                <button type="button" onClick={() => handleSaveGlobal(false)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-[#CBD5E1] px-4 text-xs font-bold">
                  <Save className="h-3.5 w-3.5" aria-hidden="true" /> Save Draft
                </button>
              )}
              {hasPerm('cms:publish') && (
                <button type="button" onClick={() => handleSaveGlobal(true)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-[#0E7C78] px-5 text-xs font-bold text-white">
                  <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" /> Publish Global
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-[#FAF8F4] p-4 space-y-3">
              <label className="flex items-center gap-2 text-xs font-bold text-[#103D45]">
                <input
                  type="checkbox"
                  checked={globalDoc.announcementBar.enabled}
                  onChange={(e) => setGlobalDoc({ ...globalDoc, announcementBar: { ...globalDoc.announcementBar, enabled: e.target.checked } })}
                  className="h-4 w-4 accent-[#0E7C78]"
                />
                Show Top Announcement Bar
              </label>
              <input
                type="text"
                aria-label="Announcement bar message"
                value={globalDoc.announcementBar.text}
                onChange={(e) => setGlobalDoc({ ...globalDoc, announcementBar: { ...globalDoc.announcementBar, text: e.target.value } })}
                placeholder="Seasonal announcement text..."
                className="min-h-[40px] w-full rounded-xl border bg-white px-3 text-xs"
              />
            </div>

            <div className="rounded-xl bg-[#FAF8F4] p-4 space-y-3">
              <p className="text-xs font-bold text-[#103D45]">Header CTA Button &amp; Footer Tagline</p>
              <input
                type="text"
                aria-label="Header CTA label"
                value={globalDoc.header.ctaLabel}
                onChange={(e) => setGlobalDoc({ ...globalDoc, header: { ...globalDoc.header, ctaLabel: e.target.value } })}
                className="min-h-[40px] w-full rounded-xl border bg-white px-3 text-xs"
              />
              <input
                type="text"
                aria-label="Footer tagline"
                value={globalDoc.footer.tagline}
                onChange={(e) => setGlobalDoc({ ...globalDoc, footer: { ...globalDoc.footer, tagline: e.target.value } })}
                className="min-h-[40px] w-full rounded-xl border bg-white px-3 text-xs"
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
