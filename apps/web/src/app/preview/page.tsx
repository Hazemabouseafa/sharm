import React from 'react';
import type { Metadata } from 'next';
import { GlobalContentDocument, PageContentDocument } from '@sharm/contracts';
import { serverApiGet } from '@/lib/api';
import { loadPublicCatalogContext, loadPublicGlobal } from '@/lib/public-data';
import { PreviewFrameClient } from '@/components/public/PreviewFrameClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Authorized Draft Preview',
  robots: { index: false, follow: false },
};

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const token = typeof sp.token === 'string' ? sp.token : '';
  const embedded = sp.embedded === '1';

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F5EF] p-8 text-center">
        <div className="max-w-md rounded-2xl border border-[#E5DFD2] bg-white p-8 shadow-sm">
          <h1 className="text-xl font-extrabold text-[#103D45]">Preview Authorization Required</h1>
          <p className="mt-2 text-sm text-[#52606D]">
            Draft previews require a valid signed preview token issued to an authorized staff editor.
          </p>
        </div>
      </div>
    );
  }

  let previewRes: {
    page: { slug: string; title: string; revisionNumber: number; status: string; content: PageContentDocument };
    global: GlobalContentDocument | null;
  };
  try {
    previewRes = await serverApiGet(`/public/cms/preview?token=${encodeURIComponent(token)}`, { noStore: true });
  } catch (err) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F5EF] p-8 text-center">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-extrabold text-rose-900">Invalid or Expired Preview Link</h1>
          <p className="mt-2 text-sm text-[#52606D]">
            {err instanceof Error ? err.message : 'This draft preview link cannot be verified.'}
          </p>
        </div>
      </div>
    );
  }

  const [globalCtx, catalog] = await Promise.all([loadPublicGlobal(), loadPublicCatalogContext()]);

  return (
    <PreviewFrameClient
      initialPage={previewRes.page}
      initialGlobal={previewRes.global ?? globalCtx.global}
      site={globalCtx.site}
      destinations={catalog.destinations}
      categories={catalog.categories}
      tours={catalog.tours}
      embedded={embedded}
    />
  );
}
