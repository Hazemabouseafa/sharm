import React from 'react';
import type { Metadata } from 'next';
import { serverApiGet } from '@/lib/api';
import { loadPublicCatalogContext, loadPublicGlobal, loadPublishedPage } from '@/lib/public-data';
import { SharedBlockRenderer, PublicTourSummary } from '@/components/cms/SharedBlockRenderer';
import { ToursCatalogClient } from '@/components/public/ToursCatalogClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Egypt Tours & Excursions',
  description: 'Filter live Egypt tours across Cairo, Sharm El Sheikh, Marsa Alam, Hurghada, and Luxor & Aswan by date, category, duration, and price.',
  alternates: { canonical: '/tours' },
};

export default async function ToursPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === 'string' ? sp[k] : undefined);

  const filters = {
    q: pick('q'),
    destination: pick('destination'),
    category: pick('category'),
    date: pick('date'),
    duration: pick('duration'),
    minPrice: pick('minPrice'),
    maxPrice: pick('maxPrice'),
    sort: pick('sort') || 'featured',
    page: pick('page') ? Number(pick('page')) : 1,
  };

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  qs.set('limit', '12');

  const [{ site }, catalog, pageRes, filteredRes] = await Promise.all([
    loadPublicGlobal(),
    loadPublicCatalogContext(),
    loadPublishedPage('tours').catch(() => ({ page: undefined })),
    serverApiGet<{
      items: Array<PublicTourSummary & { hasBookableAvailability?: boolean; nextAvailableDate?: string | null }>;
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/public/tours?${qs.toString()}`, { noStore: true }).catch(() => ({
      items: [],
      pagination: { page: 1, limit: 12, total: 0, totalPages: 1 },
    })),
  ]);

  const heroBlocks = pageRes.page?.content.blocks ?? [];

  return (
    <>
      {heroBlocks.length > 0 && (
        <SharedBlockRenderer
          blocks={heroBlocks}
          ctx={{
            destinations: catalog.destinations,
            categories: catalog.categories,
            tours: catalog.tours,
            site,
          }}
        />
      )}
      <ToursCatalogClient
        tours={filteredRes.items}
        pagination={filteredRes.pagination}
        destinations={catalog.destinations}
        categories={catalog.categories}
        initialFilters={filters}
      />
    </>
  );
}
