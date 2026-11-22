'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  Copy,
  Eye,
  EyeOff,
  History,
  Monitor,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
  UploadCloud,
} from 'lucide-react';
import {
  BRAND_COLOR_TOKENS,
  CMS_BLOCK_DEFAULTS,
  CmsBlock,
  CmsBlockType,
  PageContentDocument,
} from '@sharm/contracts';
import { NativeDialog, StatusBadge } from '@sharm/ui';
import { useAdminAuth } from './AdminAuthContext';
import {
  PublicDestinationSummary,
  PublicTourSummary,
  SharedBlockRenderer,
} from '../cms/SharedBlockRenderer';
import { clientApi } from '@/lib/api';

interface CmsPageSummary {
  id: string;
  slug: string;
  title: string;
  kind: string;
}

interface CmsRevisionItem {
  id: string;
  revisionNumber: number;
  status: string;
  notes: string;
  version: number;
  publishedAt: string | null;
  updatedAt: string;
  contentJson: PageContentDocument;
}

interface CmsPageDetail {
  id: string;
  slug: string;
  title: string;
  kind: string;
  publishedRevisionId: string | null;
  currentDraftId: string | null;
  publishedRevision: CmsRevisionItem | null;
  currentDraft: CmsRevisionItem | null;
  revisions: CmsRevisionItem[];
  publishSchedules: Array<{ id: string; scheduledForUtc: string; status: string; revisionId: string }>;
}

const ALL_BLOCK_TYPES: CmsBlockType[] = [
  'Hero',
  'SearchBar',
  'DestinationGrid',
  'TourGrid',
  'RichText',
  'ImageText',
  'ImageGallery',
  'VideoHero',
  'Benefits',
  'FAQ',
  'CallToAction',
  'ContactForm',
  'SpacerDivider',
];

export function LiveEditorWorkbench({ initialPageId }: { initialPageId?: string }) {
  const { adminFetch, hasPerm, toast } = useAdminAuth();

  const [pages, setPages] = useState<CmsPageSummary[]>([]);
  const [pageId, setPageId] = useState(initialPageId || '');
  const [pageDetail, setPageDetail] = useState<CmsPageDetail | null>(null);
  const [doc, setDoc] = useState<PageContentDocument | null>(null);
  const [draftVersion, setDraftVersion] = useState(1);

  // Undo / Redo stacks
  const [past, setPast] = useState<PageContentDocument[]>([]);
  const [future, setFuture] = useState<PageContentDocument[]>([]);

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'section' | 'seo'>('section');
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error' | 'conflict'>('saved');
  const [saveErrorMsg, setSaveErrorMsg] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Catalog + Media picker context for live preview
  const [destinations, setDestinations] = useState<PublicDestinationSummary[]>([]);
  const [categories, setCategories] = useState<Array<{ slug: string; name: string }>>([]);
  const [tours, setTours] = useState<PublicTourSummary[]>([]);
  const [mediaAssets, setMediaAssets] = useState<Array<{ id: string; publicUrl: string; altText: string; originalFilename: string }>>([]);

  // Dialog states
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [conflictInfo, setConflictInfo] = useState<{
    serverDraftVersion: number;
    serverContent: PageContentDocument;
  } | null>(null);
  const [publishing, setPublishing] = useState(false);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDocRef = useRef<PageContentDocument | null>(null);
  const latestVersionRef = useRef<number>(1);
  latestDocRef.current = doc;
  latestVersionRef.current = draftVersion;

  // Warn before navigating away with unsaved edits
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveState === 'dirty' || saveState === 'saving' || saveState === 'error') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saveState]);

  // Initial load: pages + live catalog data + media library
  useEffect(() => {
    async function boot() {
      try {
        const [pagesRes, dests, cats, toursRes, media] = await Promise.all([
          adminFetch<CmsPageSummary[]>('/admin/cms/pages'),
          clientApi<PublicDestinationSummary[]>('/public/destinations'),
          clientApi<Array<{ slug: string; name: string }>>('/public/categories'),
          clientApi<{ items: PublicTourSummary[] }>('/public/tours?limit=48'),
          adminFetch<Array<{ id: string; publicUrl: string; altText: string; originalFilename: string }>>('/admin/media').catch(() => []),
        ]);
        setPages(pagesRes);
        setDestinations(dests);
        setCategories(cats);
        setTours(toursRes.items);
        setMediaAssets(media);

        if (!initialPageId) {
          const home = pagesRes.find((p) => p.slug === 'home') ?? pagesRes[0];
          if (home) setPageId(home.id);
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Failed to load Live Editor data', 'error');
      }
    }
    void boot();
  }, [adminFetch, initialPageId, toast]);

  const loadPage = useCallback(
    async (id: string) => {
      if (!id) return;
      try {
        const detail = await adminFetch<CmsPageDetail>(`/admin/cms/pages/${id}`);
        setPageDetail(detail);
        const content = detail.currentDraft?.contentJson ?? detail.publishedRevision?.contentJson ?? null;
        setDoc(content);
        setDraftVersion(detail.currentDraft?.version ?? 1);
        setPast([]);
        setFuture([]);
        setSelectedBlockId(content?.blocks[0]?.id ?? null);
        setSaveState('saved');
        setSaveErrorMsg('');
        setConflictInfo(null);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Failed to load page draft', 'error');
      }
    },
    [adminFetch, toast],
  );

  useEffect(() => {
    if (pageId) void loadPage(pageId);
  }, [pageId, loadPage]);

  const persistDraft = useCallback(
    async (contentToSave: PageContentDocument, expectedVer: number, duplicateOnConflict = false) => {
      if (!pageId || !hasPerm('cms:write')) return;
      setSaveState('saving');
      setSaveErrorMsg('');
      try {
        const res = await adminFetch<{ draft: CmsRevisionItem; duplicatedFromConflict?: boolean }>(
          `/admin/cms/pages/${pageId}/draft`,
          {
            method: 'PUT',
            body: {
              content: contentToSave,
              expectedDraftVersion: expectedVer,
              duplicateOnConflict,
            },
          },
        );
        setDraftVersion(res.draft.version);
        setSaveState('saved');
        setConflictInfo(null);
        if (res.duplicatedFromConflict) {
          toast('Saved your changes as a new duplicate draft without overwriting the other editor.', 'success');
          await loadPage(pageId);
        }
      } catch (err) {
        const eObj = err as Error & { code?: string; details?: { serverDraftVersion?: number; serverContent?: PageContentDocument } };
        if (eObj.code === 'VERSION_CONFLICT' && eObj.details?.serverContent) {
          setSaveState('conflict');
          setConflictInfo({
            serverDraftVersion: eObj.details.serverDraftVersion ?? expectedVer + 1,
            serverContent: eObj.details.serverContent,
          });
        } else {
          setSaveState('error');
          setSaveErrorMsg(eObj.message || 'Autosave failed');
        }
      }
    },
    [adminFetch, hasPerm, loadPage, pageId, toast],
  );

  // Apply an edit cleanly with undo history + debounced DB autosave
  const applyDocChange = useCallback(
    (updater: (prev: PageContentDocument) => PageContentDocument) => {
      setDoc((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        setPast((p) => [...p.slice(-39), prev]);
        setFuture([]);
        setSaveState('dirty');
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
        autosaveTimer.current = setTimeout(() => {
          if (latestDocRef.current) {
            void persistDraft(latestDocRef.current, latestVersionRef.current, false);
          }
        }, 900);
        return next;
      });
    },
    [persistDraft],
  );

  function handleUndo() {
    if (past.length === 0 || !doc) return;
    const prev = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [doc, ...f.slice(0, 39)]);
    setDoc(prev);
    setSaveState('dirty');
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void persistDraft(prev, latestVersionRef.current, false);
    }, 600);
  }

  function handleRedo() {
    if (future.length === 0 || !doc) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [...p.slice(-39), doc]);
    setDoc(next);
    setSaveState('dirty');
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void persistDraft(next, latestVersionRef.current, false);
    }, 600);
  }

  function moveBlock(index: number, delta: number) {
    applyDocChange((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.blocks.length) return prev;
      const copy = [...prev.blocks];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return { ...prev, blocks: copy };
    });
  }

  function addBlock(type: CmsBlockType) {
    const newBlock = CMS_BLOCK_DEFAULTS[type]();
    applyDocChange((prev) => ({
      ...prev,
      blocks: [...prev.blocks, newBlock],
    }));
    setSelectedBlockId(newBlock.id);
    setAddSectionOpen(false);
  }

  function duplicateBlock(block: CmsBlock) {
    const clone: CmsBlock = {
      ...JSON.parse(JSON.stringify(block)),
      id: `${block.type.toLowerCase()}-${Date.now().toString(36)}`,
      locked: false,
      label: `${block.label || block.type} (Copy)`,
    };
    applyDocChange((prev) => {
      const idx = prev.blocks.findIndex((b) => b.id === block.id);
      const copy = [...prev.blocks];
      copy.splice(idx + 1, 0, clone);
      return { ...prev, blocks: copy };
    });
    setSelectedBlockId(clone.id);
  }

  function deleteBlock(block: CmsBlock) {
    if (block.locked) {
      toast('This required transactional section cannot be removed.', 'error');
      return;
    }
    applyDocChange((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== block.id),
    }));
    if (selectedBlockId === block.id) setSelectedBlockId(null);
  }

  function updateSelectedBlock(updater: (block: CmsBlock) => CmsBlock) {
    if (!selectedBlockId) return;
    applyDocChange((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === selectedBlockId ? updater(b) : b)),
    }));
  }

  async function handleManualSave() {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    if (!doc) return;
    await persistDraft(doc, draftVersion, false);
  }

  async function handleOpenPreview() {
    if (!pageId) return;
    if (saveState === 'dirty' && doc) {
      await persistDraft(doc, draftVersion, false);
    }
    try {
      const res = await adminFetch<{ previewPath: string }>(`/admin/cms/pages/${pageId}/preview-link`, {
        method: 'POST',
        body: {},
      });
      window.open(res.previewPath, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to generate preview link', 'error');
    }
  }

  async function handlePublish() {
    if (!pageId || !doc) return;
    setPublishing(true);
    try {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      if (saveState === 'dirty') {
        await persistDraft(doc, draftVersion, false);
      }
      await adminFetch(`/admin/cms/pages/${pageId}/publish`, {
        method: 'POST',
        body: { notes: 'Published via Live Editor' },
      });
      toast('Published live! Public website cache invalidated immediately.', 'success');
      await loadPage(pageId);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Publish failed', 'error');
    } finally {
      setPublishing(false);
    }
  }

  async function handleRollback(revisionId: string) {
    if (!pageId) return;
    try {
      await adminFetch(`/admin/cms/pages/${pageId}/rollback`, {
        method: 'POST',
        body: { revisionId },
      });
      toast('Rolled back live page to chosen revision and refreshed caches.', 'success');
      setHistoryOpen(false);
      await loadPage(pageId);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Rollback failed', 'error');
    }
  }

  async function handleSchedulePublish(e: React.FormEvent) {
    e.preventDefault();
    if (!pageId || !scheduleDateTime) return;
    try {
      if (saveState === 'dirty' && doc) await persistDraft(doc, draftVersion, false);
      await adminFetch(`/admin/cms/pages/${pageId}/schedule`, {
        method: 'POST',
        body: { scheduledForUtc: new Date(scheduleDateTime).toISOString(), timezone: 'Africa/Cairo' },
      });
      toast('Publication scheduled cleanly for background worker execution.', 'success');
      setScheduleOpen(false);
      await loadPage(pageId);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Scheduling failed', 'error');
    }
  }

  const selectedBlock = doc?.blocks.find((b) => b.id === selectedBlockId) ?? null;

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col bg-[#F1EDE4]">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DED8CA] bg-white px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <label htmlFor="editor-page-select" className="visually-hidden">Select page to edit</label>
          <select
            id="editor-page-select"
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            className="min-h-[38px] rounded-xl border border-[#CBD5E1] bg-[#FAF8F4] px-3 text-sm font-bold text-[#103D45]"
          >
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                Live Editor / {p.title} ({p.slug})
              </option>
            ))}
          </select>

          <span
            data-testid="editor-save-status"
            role="status"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
              saveState === 'saved'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : saveState === 'saving'
                  ? 'bg-sky-50 text-sky-900 border border-sky-200'
                  : saveState === 'dirty'
                    ? 'bg-amber-50 text-amber-900 border border-amber-200'
                    : 'bg-rose-50 text-rose-900 border border-rose-300'
            }`}
          >
            {saveState === 'saved' && <><Check className="h-3.5 w-3.5" aria-hidden="true" /> Saved (v{draftVersion})</>}
            {saveState === 'saving' && 'Saving draft...'}
            {saveState === 'dirty' && 'Unsaved changes...'}
            {saveState === 'error' && `Save failed: ${saveErrorMsg}`}
            {saveState === 'conflict' && 'Edit conflict detected!'}
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleUndo}
              disabled={past.length === 0}
              aria-label="Undo"
              title="Undo"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-[#103D45] disabled:opacity-40"
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={future.length === 0}
              aria-label="Redo"
              title="Redo"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-[#103D45] disabled:opacity-40"
            >
              <Redo2 className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleManualSave}
              disabled={!hasPerm('cms:write')}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-xs font-bold text-[#103D45] hover:bg-[#FAF8F4]"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              Save Draft
            </button>
          </div>
        </div>

        {/* Viewport Switcher */}
        <div role="group" aria-label="Preview viewport" className="flex items-center rounded-xl border border-[#CBD5E1] bg-[#FAF8F4] p-1">
          {(
            [
              { id: 'desktop', label: 'Desktop', icon: Monitor },
              { id: 'tablet', label: 'Tablet', icon: Tablet },
              { id: 'mobile', label: 'Mobile', icon: Smartphone },
            ] as const
          ).map((vp) => {
            const Icon = vp.icon;
            return (
              <button
                key={vp.id}
                type="button"
                aria-pressed={viewport === vp.id}
                onClick={() => setViewport(vp.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  viewport === vp.id ? 'bg-[#103D45] text-white' : 'text-[#334155] hover:text-[#103D45]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{vp.label}</span>
              </button>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#CBD5E1] bg-white px-3 text-xs font-bold text-[#103D45] hover:bg-[#FAF8F4]"
          >
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            History
          </button>
          {hasPerm('cms:schedule') && (
            <button
              type="button"
              onClick={() => setScheduleOpen(true)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#CBD5E1] bg-white px-3 text-xs font-bold text-[#103D45] hover:bg-[#FAF8F4]"
            >
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              Schedule
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenPreview}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-xs font-bold text-[#103D45] hover:bg-[#FAF8F4]"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Preview
          </button>
          {hasPerm('cms:publish') && (
            <button
              type="button"
              disabled={publishing}
              onClick={handlePublish}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0E7C78] px-4 text-xs font-extrabold text-white shadow-xs hover:bg-[#103D45] disabled:opacity-50"
            >
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              {publishing ? 'Publishing...' : 'Publish'}
            </button>
          )}
        </div>
      </div>

      {/* 3-Pane Live Editor Workbench */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
        {/* LEFT PANE: Sections / Layers */}
        <aside aria-label="Page sections" className="lg:col-span-2 flex flex-col border-e border-[#DED8CA] bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#EFEAE0] px-3.5 py-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#103D45]">Sections</h2>
            {hasPerm('cms:write') && (
              <button
                type="button"
                onClick={() => setAddSectionOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-[#EFFAF9] px-2.5 py-1 text-xs font-bold text-[#0E7C78] hover:bg-[#18A5A0] hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
            {doc?.blocks.map((block, idx) => {
              const selected = block.id === selectedBlockId;
              return (
                <div
                  key={block.id}
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIdx !== null && dragIdx !== idx) {
                      moveBlock(dragIdx, idx - dragIdx);
                    }
                    setDragIdx(null);
                  }}
                  className={`rounded-xl border p-2.5 transition ${
                    selected
                      ? 'border-[#18A5A0] bg-[#EFFAF9]'
                      : 'border-[#E5DFD2] bg-[#FAF8F4] hover:border-[#C9A66B]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBlockId(block.id);
                      setInspectorTab('section');
                    }}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <span className="truncate text-xs font-bold text-[#103D45]">
                      {block.label || block.type}
                    </span>
                    <span className="text-xs font-semibold uppercase text-[#52606D]">{block.type}</span>
                  </button>

                  <div className="mt-2 flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveBlock(idx, -1)}
                        aria-label={`Move ${block.label || block.type} up`}
                        className="rounded border border-[#D8D1C2] bg-white p-1 text-[#103D45] disabled:opacity-30"
                      >
                        <ArrowUp className="h-3 w-3" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === doc.blocks.length - 1}
                        onClick={() => moveBlock(idx, 1)}
                        aria-label={`Move ${block.label || block.type} down`}
                        className="rounded border border-[#D8D1C2] bg-white p-1 text-[#103D45] disabled:opacity-30"
                      >
                        <ArrowDown className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          applyDocChange((prev) => ({
                            ...prev,
                            blocks: prev.blocks.map((b) => (b.id === block.id ? { ...b, hidden: !b.hidden } : b)),
                          }))
                        }
                        aria-label={block.hidden ? `Show ${block.label || block.type}` : `Hide ${block.label || block.type}`}
                        className="rounded border border-[#D8D1C2] bg-white p-1 text-[#52606D]"
                      >
                        {block.hidden ? <EyeOff className="h-3 w-3" aria-hidden="true" /> : <Eye className="h-3 w-3" aria-hidden="true" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateBlock(block)}
                        aria-label={`Duplicate ${block.label || block.type}`}
                        className="rounded border border-[#D8D1C2] bg-white p-1 text-[#52606D]"
                      >
                        <Copy className="h-3 w-3" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={block.locked}
                        onClick={() => deleteBlock(block)}
                        aria-label={`Delete ${block.label || block.type}`}
                        title={block.locked ? 'Required transactional section cannot be deleted' : 'Delete section'}
                        className="rounded border border-[#D8D1C2] bg-white p-1 text-rose-700 disabled:opacity-30"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-[#EFEAE0] bg-[#FAF8F4] px-3 py-2 text-xs font-semibold text-[#52606D]">
            Draft rev #{pageDetail?.currentDraft?.revisionNumber ?? 1} · Published rev #{pageDetail?.publishedRevision?.revisionNumber ?? '—'}
          </div>
        </aside>

        {/* CENTER PANE: Live Interactive Preview Canvas (Exact SharedBlockRenderer!) */}
        <section aria-label="Interactive page preview" className="lg:col-span-7 overflow-auto bg-[#E5DFD2]/60 p-4">
          <div
            data-testid="live-editor-canvas"
            data-no-admin-translate="true"
            dir="ltr"
            className="mx-auto min-h-full overflow-hidden rounded-2xl border border-[#D8D1C2] bg-[#F7F5EF] shadow-lg transition-all duration-200"
            style={{
              width: viewport === 'mobile' ? '390px' : viewport === 'tablet' ? '768px' : '100%',
            }}
          >
            {doc ? (
              <SharedBlockRenderer
                blocks={doc.blocks}
                ctx={{
                  destinations,
                  categories,
                  tours,
                  site: {
                    companyName: 'Sharm Pharaoh Travel',
                    contactEmail: '',
                    contactPhone: '',
                    whatsappNumber: '',
                    addressText: '',
                    mapEmbedUrl: '',
                    socials: {},
                    maintenanceBannerEnabled: false,
                    maintenanceBannerText: '',
                    demoMode: false,
                  },
                  editorMode: true,
                  selectedBlockId,
                  onSelectBlock: (id) => {
                    setSelectedBlockId(id);
                    setInspectorTab('section');
                  },
                }}
              />
            ) : (
              <div className="p-16 text-center text-sm text-[#52606D]">Loading page canvas...</div>
            )}
          </div>
        </section>

        {/* RIGHT PANE: Contextual Block & SEO Inspector */}
        <aside aria-label="Section inspector" className="lg:col-span-3 flex flex-col border-s border-[#DED8CA] bg-white overflow-hidden">
          <div className="flex border-b border-[#EFEAE0]">
            <button
              type="button"
              onClick={() => setInspectorTab('section')}
              className={`flex-1 py-3 text-xs font-extrabold uppercase tracking-wider ${
                inspectorTab === 'section' ? 'border-b-2 border-[#0E7C78] text-[#103D45]' : 'text-[#52606D]'
              }`}
            >
              Section Settings
            </button>
            <button
              type="button"
              onClick={() => setInspectorTab('seo')}
              className={`flex-1 py-3 text-xs font-extrabold uppercase tracking-wider ${
                inspectorTab === 'seo' ? 'border-b-2 border-[#0E7C78] text-[#103D45]' : 'text-[#52606D]'
              }`}
            >
              Page SEO
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
            {inspectorTab === 'seo' && doc && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="seo-title" className="block text-xs font-bold text-[#103D45]">SEO Title</label>
                  <input
                    id="seo-title"
                    type="text"
                    value={doc.seo.title}
                    onChange={(e) => applyDocChange((prev) => ({ ...prev, seo: { ...prev.seo, title: e.target.value } }))}
                    className="mt-1 min-h-[42px] w-full rounded-xl border border-[#CBD5E1] px-3 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="seo-desc" className="block text-xs font-bold text-[#103D45]">Meta Description</label>
                  <textarea
                    id="seo-desc"
                    rows={3}
                    value={doc.seo.description}
                    onChange={(e) => applyDocChange((prev) => ({ ...prev, seo: { ...prev.seo, description: e.target.value } }))}
                    className="mt-1 w-full rounded-xl border border-[#CBD5E1] px-3 py-2 text-xs"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-[#103D45]">
                  <input
                    type="checkbox"
                    checked={doc.seo.noIndex}
                    onChange={(e) => applyDocChange((prev) => ({ ...prev, seo: { ...prev.seo, noIndex: e.target.checked } }))}
                    className="h-4 w-4 accent-[#0E7C78]"
                  />
                  Exclude from search engines (noindex)
                </label>
              </div>
            )}

            {inspectorTab === 'section' && !selectedBlock && (
              <p className="text-xs text-[#52606D]">Click any section in the preview or left layer list to inspect and edit its settings.</p>
            )}

            {inspectorTab === 'section' && selectedBlock && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="blk-label" className="block text-xs font-bold text-[#103D45]">Section Label</label>
                  <input
                    id="blk-label"
                    type="text"
                    value={selectedBlock.label || ''}
                    onChange={(e) => updateSelectedBlock((b) => ({ ...b, label: e.target.value }))}
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-[#CBD5E1] px-3 text-xs"
                  />
                </div>

                {/* Typed Per-Block Property Controls */}
                {selectedBlock.type === 'Hero' && (
                  <>
                    <div>
                      <label htmlFor="hero-accent" className="block text-xs font-bold text-[#103D45]">Accent Word (Gold)</label>
                      <input
                        id="hero-accent"
                        type="text"
                        value={selectedBlock.props.headlineAccent || ''}
                        onChange={(e) =>
                          updateSelectedBlock((b) =>
                            b.type === 'Hero' ? { ...b, props: { ...b.props, headlineAccent: e.target.value } } : b,
                          )
                        }
                        className="mt-1 min-h-[40px] w-full rounded-xl border border-[#CBD5E1] px-3 text-xs"
                      />
                    </div>
                    <div>
                      <label htmlFor="hero-headline" className="block text-xs font-bold text-[#103D45]">Headline</label>
                      <input
                        id="hero-headline"
                        type="text"
                        value={selectedBlock.props.headline}
                        onChange={(e) =>
                          updateSelectedBlock((b) =>
                            b.type === 'Hero' ? { ...b, props: { ...b.props, headline: e.target.value } } : b,
                          )
                        }
                        className="mt-1 min-h-[40px] w-full rounded-xl border border-[#CBD5E1] px-3 text-xs"
                      />
                    </div>
                    <div>
                      <label htmlFor="hero-subtitle" className="block text-xs font-bold text-[#103D45]">Subtitle</label>
                      <textarea
                        id="hero-subtitle"
                        rows={2}
                        value={selectedBlock.props.subtitle}
                        onChange={(e) =>
                          updateSelectedBlock((b) =>
                            b.type === 'Hero' ? { ...b, props: { ...b.props, subtitle: e.target.value } } : b,
                          )
                        }
                        className="mt-1 w-full rounded-xl border border-[#CBD5E1] px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label htmlFor="hero-img" className="block text-xs font-bold text-[#103D45]">Background Image URL</label>
                      <input
                        id="hero-img"
                        type="text"
                        value={selectedBlock.props.imageUrl}
                        onChange={(e) =>
                          updateSelectedBlock((b) =>
                            b.type === 'Hero' ? { ...b, props: { ...b.props, imageUrl: e.target.value } } : b,
                          )
                        }
                        className="mt-1 min-h-[40px] w-full rounded-xl border border-[#CBD5E1] px-3 text-xs"
                      />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[
                          '/media/hero-red-sea-yacht.webp',
                          '/media/cairo-pyramids-sphinx.webp',
                          '/media/sharm-ras-mohamed-white-island.webp',
                          '/media/marsa-abu-dabbab-turtle.webp',
                          '/media/luxor-karnak-temples.webp',
                          ...mediaAssets.slice(0, 6).map((m) => m.publicUrl),
                        ].map((url) => (
                          <button
                            key={url}
                            type="button"
                            onClick={() =>
                              updateSelectedBlock((b) =>
                                b.type === 'Hero' ? { ...b, props: { ...b.props, imageUrl: url } } : b,
                              )
                            }
                            className="h-9 w-14 overflow-hidden rounded border border-[#CBD5E1] hover:ring-2 hover:ring-[#18A5A0]"
                            title={`Use ${url}`}
                          >
                            <img src={url} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor="hero-cta-lbl" className="block text-xs font-bold text-[#103D45]">Primary CTA Label</label>
                        <input
                          id="hero-cta-lbl"
                          type="text"
                          value={selectedBlock.props.primaryCtaLabel || ''}
                          onChange={(e) =>
                            updateSelectedBlock((b) =>
                              b.type === 'Hero' ? { ...b, props: { ...b.props, primaryCtaLabel: e.target.value } } : b,
                            )
                          }
                          className="mt-1 min-h-[38px] w-full rounded-xl border border-[#CBD5E1] px-2.5 text-xs"
                        />
                      </div>
                      <div>
                        <label htmlFor="hero-cta-href" className="block text-xs font-bold text-[#103D45]">Primary CTA Target</label>
                        <input
                          id="hero-cta-href"
                          type="text"
                          value={selectedBlock.props.primaryCtaHref || ''}
                          onChange={(e) =>
                            updateSelectedBlock((b) =>
                              b.type === 'Hero' ? { ...b, props: { ...b.props, primaryCtaHref: e.target.value } } : b,
                            )
                          }
                          className="mt-1 min-h-[38px] w-full rounded-xl border border-[#CBD5E1] px-2.5 text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="hero-overlay" className="block text-xs font-bold text-[#103D45]">
                        Overlay Opacity ({selectedBlock.style.overlayOpacity}%)
                      </label>
                      <input
                        id="hero-overlay"
                        type="range"
                        min={15}
                        max={85}
                        value={selectedBlock.style.overlayOpacity}
                        onChange={(e) =>
                          updateSelectedBlock((b) => ({
                            ...b,
                            style: { ...b.style, overlayOpacity: Number(e.target.value) },
                          }))
                        }
                        className="mt-1 w-full accent-[#0E7C78]"
                      />
                    </div>
                  </>
                )}

                {selectedBlock.type === 'DestinationGrid' && (
                  <>
                    <div>
                      <label htmlFor="dg-head" className="block text-xs font-bold text-[#103D45]">Heading</label>
                      <input
                        id="dg-head"
                        type="text"
                        value={selectedBlock.props.heading}
                        onChange={(e) =>
                          updateSelectedBlock((b) =>
                            b.type === 'DestinationGrid' ? { ...b, props: { ...b.props, heading: e.target.value } } : b,
                          )
                        }
                        className="mt-1 min-h-[40px] w-full rounded-xl border border-[#CBD5E1] px-3 text-xs"
                      />
                    </div>
                    <div>
                      <label htmlFor="dg-cols" className="block text-xs font-bold text-[#103D45]">Grid Columns</label>
                      <select
                        id="dg-cols"
                        value={selectedBlock.props.columns}
                        onChange={(e) =>
                          updateSelectedBlock((b) =>
                            b.type === 'DestinationGrid' ? { ...b, props: { ...b.props, columns: Number(e.target.value) } } : b,
                          )
                        }
                        className="mt-1 min-h-[40px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3 text-xs"
                      >
                        {[2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>{n} columns</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#103D45]">Destination Card Order</p>
                      <div className="mt-1.5 space-y-1">
                        {(selectedBlock.props.orderSlugs?.length
                          ? selectedBlock.props.orderSlugs
                          : destinations.map((d) => d.slug)
                        ).map((slug, idx, arr) => (
                          <div key={slug} className="flex items-center justify-between rounded-lg border border-[#E5DFD2] bg-[#FAF8F4] px-2.5 py-1.5 text-xs">
                            <span className="font-semibold">{destinations.find((d) => d.slug === slug)?.name ?? slug}</span>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => {
                                  const next = [...arr];
                                  [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                  updateSelectedBlock((b) =>
                                    b.type === 'DestinationGrid' ? { ...b, props: { ...b.props, orderSlugs: next } } : b,
                                  );
                                }}
                                aria-label={`Move ${slug} earlier`}
                                className="rounded border bg-white p-1 disabled:opacity-30"
                              >
                                <ArrowUp className="h-3 w-3" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === arr.length - 1}
                                onClick={() => {
                                  const next = [...arr];
                                  [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                                  updateSelectedBlock((b) =>
                                    b.type === 'DestinationGrid' ? { ...b, props: { ...b.props, orderSlugs: next } } : b,
                                  );
                                }}
                                aria-label={`Move ${slug} later`}
                                className="rounded border bg-white p-1 disabled:opacity-30"
                              >
                                <ArrowDown className="h-3 w-3" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {selectedBlock.type === 'TourGrid' && (
                  <>
                    <div>
                      <label htmlFor="tg-head" className="block text-xs font-bold text-[#103D45]">Heading</label>
                      <input
                        id="tg-head"
                        type="text"
                        value={selectedBlock.props.heading}
                        onChange={(e) =>
                          updateSelectedBlock((b) =>
                            b.type === 'TourGrid' ? { ...b, props: { ...b.props, heading: e.target.value } } : b,
                          )
                        }
                        className="mt-1 min-h-[40px] w-full rounded-xl border border-[#CBD5E1] px-3 text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor="tg-mode" className="block text-xs font-bold text-[#103D45]">Query Binding</label>
                        <select
                          id="tg-mode"
                          value={selectedBlock.props.mode}
                          onChange={(e) =>
                            updateSelectedBlock((b) =>
                              b.type === 'TourGrid'
                                ? { ...b, props: { ...b.props, mode: e.target.value as 'FEATURED' | 'DESTINATION' | 'CATEGORY' | 'CURATED' } }
                                : b,
                            )
                          }
                          className="mt-1 min-h-[38px] w-full rounded-xl border border-[#CBD5E1] bg-white px-2 text-xs"
                        >
                          <option value="FEATURED">Featured Tours</option>
                          <option value="DESTINATION">By Destination</option>
                          <option value="CATEGORY">By Category</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="tg-limit" className="block text-xs font-bold text-[#103D45]">Max Cards</label>
                        <input
                          id="tg-limit"
                          type="number"
                          min={1}
                          max={12}
                          value={selectedBlock.props.limit}
                          onChange={(e) =>
                            updateSelectedBlock((b) =>
                              b.type === 'TourGrid' ? { ...b, props: { ...b.props, limit: Number(e.target.value) } } : b,
                            )
                          }
                          className="mt-1 min-h-[38px] w-full rounded-xl border border-[#CBD5E1] px-2 text-xs"
                        />
                      </div>
                    </div>
                  </>
                )}

                {selectedBlock.type === 'CallToAction' && (
                  <>
                    <div>
                      <label htmlFor="cta-h" className="block text-xs font-bold text-[#103D45]">Heading</label>
                      <input
                        id="cta-h"
                        type="text"
                        value={selectedBlock.props.heading}
                        onChange={(e) =>
                          updateSelectedBlock((b) =>
                            b.type === 'CallToAction' ? { ...b, props: { ...b.props, heading: e.target.value } } : b,
                          )
                        }
                        className="mt-1 min-h-[40px] w-full rounded-xl border border-[#CBD5E1] px-3 text-xs"
                      />
                    </div>
                    <div>
                      <label htmlFor="cta-b" className="block text-xs font-bold text-[#103D45]">Body Copy</label>
                      <textarea
                        id="cta-b"
                        rows={3}
                        value={selectedBlock.props.body}
                        onChange={(e) =>
                          updateSelectedBlock((b) =>
                            b.type === 'CallToAction' ? { ...b, props: { ...b.props, body: e.target.value } } : b,
                          )
                        }
                        className="mt-1 w-full rounded-xl border border-[#CBD5E1] px-3 py-2 text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor="cta-l" className="block text-xs font-bold text-[#103D45]">CTA Label</label>
                        <input
                          id="cta-l"
                          type="text"
                          value={selectedBlock.props.ctaLabel}
                          onChange={(e) =>
                            updateSelectedBlock((b) =>
                              b.type === 'CallToAction' ? { ...b, props: { ...b.props, ctaLabel: e.target.value } } : b,
                            )
                          }
                          className="mt-1 min-h-[38px] w-full rounded-xl border border-[#CBD5E1] px-2.5 text-xs"
                        />
                      </div>
                      <div>
                        <label htmlFor="cta-t" className="block text-xs font-bold text-[#103D45]">CTA Href</label>
                        <input
                          id="cta-t"
                          type="text"
                          value={selectedBlock.props.ctaHref}
                          onChange={(e) =>
                            updateSelectedBlock((b) =>
                              b.type === 'CallToAction' ? { ...b, props: { ...b.props, ctaHref: e.target.value } } : b,
                            )
                          }
                          className="mt-1 min-h-[38px] w-full rounded-xl border border-[#CBD5E1] px-2.5 text-xs"
                        />
                      </div>
                    </div>
                  </>
                )}

                {selectedBlock.type === 'RichText' && (
                  <>
                    <div>
                      <label htmlFor="rt-h" className="block text-xs font-bold text-[#103D45]">Heading</label>
                      <input
                        id="rt-h"
                        type="text"
                        value={selectedBlock.props.heading || ''}
                        onChange={(e) =>
                          updateSelectedBlock((b) =>
                            b.type === 'RichText' ? { ...b, props: { ...b.props, heading: e.target.value } } : b,
                          )
                        }
                        className="mt-1 min-h-[40px] w-full rounded-xl border border-[#CBD5E1] px-3 text-xs"
                      />
                    </div>
                    <div>
                      <label htmlFor="rt-body" className="block text-xs font-bold text-[#103D45]">Sanitized HTML Content</label>
                      <textarea
                        id="rt-body"
                        rows={7}
                        value={selectedBlock.props.bodyHtml}
                        onChange={(e) =>
                          updateSelectedBlock((b) =>
                            b.type === 'RichText' ? { ...b, props: { ...b.props, bodyHtml: e.target.value } } : b,
                          )
                        }
                        className="mt-1 w-full rounded-xl border border-[#CBD5E1] px-3 py-2 font-mono text-xs"
                      />
                    </div>
                  </>
                )}

                {/* Shared Style & Spacing Controls (Bounded Validated Tokens) */}
                <div className="border-t border-[#EFEAE0] pt-4 space-y-3">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#52606D]">Style &amp; Spacing</p>
                  <div>
                    <label htmlFor="blk-bg" className="block text-xs font-bold text-[#103D45]">Surface Token</label>
                    <select
                      id="blk-bg"
                      value={selectedBlock.style.backgroundToken}
                      onChange={(e) =>
                        updateSelectedBlock((b) => ({
                          ...b,
                          style: { ...b.style, backgroundToken: e.target.value as (typeof BRAND_COLOR_TOKENS)[number] },
                        }))
                      }
                      className="mt-1 min-h-[38px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3 text-xs capitalize"
                    >
                      {BRAND_COLOR_TOKENS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="blk-pt" className="block text-xs font-bold text-[#103D45]">Top Padding (px)</label>
                      <input
                        id="blk-pt"
                        type="number"
                        min={0}
                        max={160}
                        value={selectedBlock.style.paddingTopPx}
                        onChange={(e) =>
                          updateSelectedBlock((b) => ({
                            ...b,
                            style: { ...b.style, paddingTopPx: Math.min(160, Math.max(0, Number(e.target.value))) },
                          }))
                        }
                        className="mt-1 min-h-[38px] w-full rounded-xl border border-[#CBD5E1] px-2.5 text-xs"
                      />
                    </div>
                    <div>
                      <label htmlFor="blk-pb" className="block text-xs font-bold text-[#103D45]">Bottom Padding (px)</label>
                      <input
                        id="blk-pb"
                        type="number"
                        min={0}
                        max={160}
                        value={selectedBlock.style.paddingBottomPx}
                        onChange={(e) =>
                          updateSelectedBlock((b) => ({
                            ...b,
                            style: { ...b.style, paddingBottomPx: Math.min(160, Math.max(0, Number(e.target.value))) },
                          }))
                        }
                        className="mt-1 min-h-[38px] w-full rounded-xl border border-[#CBD5E1] px-2.5 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Add Section Modal */}
      <NativeDialog open={addSectionOpen} onClose={() => setAddSectionOpen(false)} title="Add a Section Block">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {ALL_BLOCK_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => addBlock(type)}
              className="rounded-xl border border-[#E5DFD2] bg-[#FAF8F4] px-4 py-3 text-left transition hover:border-[#0E7C78] hover:bg-[#EFFAF9]"
            >
              <span className="block text-sm font-bold text-[#103D45]">{type}</span>
              <span className="text-xs text-[#52606D]">Validated schema block</span>
            </button>
          ))}
        </div>
      </NativeDialog>

      {/* Revision History & Rollback Modal */}
      <NativeDialog open={historyOpen} onClose={() => setHistoryOpen(false)} title="Revision History & Rollback" maxWidthClass="max-w-2xl">
        <div className="space-y-3">
          {pageDetail?.revisions.map((rev) => {
            const isLive = rev.id === pageDetail.publishedRevisionId;
            return (
              <div key={rev.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E5DFD2] bg-[#FAF8F4] p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#103D45]">Revision #{rev.revisionNumber}</span>
                    <StatusBadge status={isLive ? 'PUBLISHED' : rev.status} label={isLive ? 'LIVE NOW' : rev.status} />
                  </div>
                  <p className="mt-1 text-xs text-[#52606D]">{rev.notes || 'Saved revision'}</p>
                  <p className="text-xs text-[#52606D]">{new Date(rev.updatedAt).toLocaleString()}</p>
                </div>
                {!isLive && hasPerm('cms:publish') && (
                  <button
                    type="button"
                    onClick={() => handleRollback(rev.id)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-[#103D45] px-4 text-xs font-bold text-[#103D45] hover:bg-[#103D45] hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Rollback Live to #{rev.revisionNumber}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </NativeDialog>

      {/* Scheduled Publish Modal */}
      <NativeDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} title="Schedule Page Publication">
        <form onSubmit={handleSchedulePublish} className="space-y-4">
          <p className="text-xs text-[#52606D]">
            The durable PostgreSQL worker will automatically validate and publish the current draft at the scheduled timestamp.
          </p>
          <div>
            <label htmlFor="sched-dt" className="block text-xs font-bold text-[#103D45]">Publish Date &amp; Time</label>
            <input
              id="sched-dt"
              type="datetime-local"
              required
              value={scheduleDateTime}
              onChange={(e) => setScheduleDateTime(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] px-3 text-sm"
            />
          </div>
          {pageDetail?.publishSchedules && pageDetail.publishSchedules.length > 0 && (
            <div className="rounded-xl bg-[#FAF8F4] p-3 text-xs space-y-1">
              <p className="font-bold text-[#103D45]">Scheduled Publications</p>
              {pageDetail.publishSchedules.map((s) => (
                <div key={s.id} className="flex justify-between">
                  <span>{new Date(s.scheduledForUtc).toLocaleString()}</span>
                  <StatusBadge status={s.status} />
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setScheduleOpen(false)} className="min-h-[40px] rounded-full border px-4 text-xs font-bold">
              Cancel
            </button>
            <button type="submit" className="min-h-[40px] rounded-full bg-[#0E7C78] px-5 text-xs font-bold text-white">
              Schedule Publish
            </button>
          </div>
        </form>
      </NativeDialog>

      {/* Concurrent Edit Conflict Recovery Modal */}
      <NativeDialog
        open={Boolean(conflictInfo)}
        onClose={() => setConflictInfo(null)}
        closedBy="none"
        title="Concurrent Edit Conflict Detected"
        description="Another editor updated this draft while you were editing. Your local changes were NOT silently overwritten."
      >
        <div className="space-y-4 text-sm">
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <p className="font-bold">Version mismatch: your base was v{draftVersion}, server is now v{conflictInfo?.serverDraftVersion}.</p>
              <p className="mt-1">Choose whether to discard local edits and reload the server version, or preserve your work in a separate duplicate draft revision.</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              autoFocus
              onClick={() => void loadPage(pageId)}
              className="min-h-[42px] rounded-full border border-[#CBD5E1] px-4 text-xs font-bold text-[#103D45]"
            >
              Reload Server Version
            </button>
            <button
              type="button"
              onClick={() => doc && void persistDraft(doc, draftVersion, true)}
              className="min-h-[42px] rounded-full bg-[#0E7C78] px-5 text-xs font-bold text-white"
            >
              Save My Work as Duplicate Draft
            </button>
          </div>
        </div>
      </NativeDialog>
    </div>
  );
}
