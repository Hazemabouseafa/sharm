'use client';

import React, { useEffect, useState } from 'react';
import { CmsBlock, GlobalContentDocument, PageContentDocument } from '@sharm/contracts';
import { SiteHeader, PublicSiteContext } from './SiteHeader';
import { SiteFooter } from './SiteFooter';
import {
  PublicDestinationSummary,
  PublicTourSummary,
  SharedBlockRenderer,
} from '../cms/SharedBlockRenderer';
import { isTrustedSameOriginEvent } from '@/lib/origin-validation';

/**
 * Trusted same-origin Preview & Live Editor iframe surface.
 * Uses the EXACT SAME SharedBlockRenderer as public pages.
 * Validates all postMessage commands strictly via Origin API / exact same-origin + schema checks.
 */
export function PreviewFrameClient({
  initialPage,
  initialGlobal,
  site,
  destinations,
  categories,
  tours,
  embedded,
}: {
  initialPage: { slug: string; title: string; revisionNumber: number; status: string; content: PageContentDocument };
  initialGlobal: GlobalContentDocument;
  site: PublicSiteContext;
  destinations: PublicDestinationSummary[];
  categories: Array<{ slug: string; name: string }>;
  tours: PublicTourSummary[];
  embedded: boolean;
}) {
  const [blocks, setBlocks] = useState<CmsBlock[]>(initialPage.content.blocks);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  useEffect(() => {
    setBlocks(initialPage.content.blocks);
  }, [initialPage]);

  useEffect(() => {
    if (!embedded) return;
    const expectedOrigin = window.location.origin;

    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedSameOriginEvent(event, expectedOrigin)) return;
      if (event.source !== window.parent) return;
      const data = event.data as { type?: string; blocks?: CmsBlock[]; selectedBlockId?: string | null };
      if (!data || typeof data !== 'object') return;
      if (data.type === 'SPT_EDITOR_SYNC' && Array.isArray(data.blocks)) {
        setBlocks(data.blocks);
        if (data.selectedBlockId !== undefined) setSelectedBlockId(data.selectedBlockId);
      } else if (data.type === 'SPT_EDITOR_SELECT') {
        setSelectedBlockId(data.selectedBlockId ?? null);
      }
    };

    window.addEventListener('message', handleMessage);
    window.parent.postMessage({ type: 'SPT_PREVIEW_READY' }, expectedOrigin);
    return () => window.removeEventListener('message', handleMessage);
  }, [embedded]);

  function handleSelectBlock(blockId: string) {
    setSelectedBlockId(blockId);
    if (embedded && window.parent !== window) {
      window.parent.postMessage({ type: 'SPT_PREVIEW_BLOCK_SELECTED', blockId }, window.location.origin);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F5EF]">
      {!embedded && (
        <div className="bg-amber-900 px-4 py-2 text-center text-xs font-bold text-amber-50">
          AUTHORIZED DRAFT PREVIEW — Revision #{initialPage.revisionNumber} ({initialPage.status}) · Changes are NOT live to public visitors
        </div>
      )}
      <SiteHeader global={initialGlobal} site={site} />
      <main>
        <SharedBlockRenderer
          blocks={blocks}
          ctx={{
            destinations,
            categories,
            tours,
            site,
            editorMode: embedded,
            selectedBlockId,
            onSelectBlock: handleSelectBlock,
          }}
        />
      </main>
      <SiteFooter global={initialGlobal} site={site} />
    </div>
  );
}
