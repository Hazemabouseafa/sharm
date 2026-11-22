'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LiveEditorWorkbench } from '@/components/admin/LiveEditorWorkbench';

function LiveEditorInner() {
  const sp = useSearchParams();
  return <LiveEditorWorkbench initialPageId={sp.get('pageId') || undefined} />;
}

export default function AdminLiveEditorPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[#52606D]">Loading Live Editor...</div>}>
      <LiveEditorInner />
    </Suspense>
  );
}
