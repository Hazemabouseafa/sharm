import React from 'react';
import type { Metadata } from 'next';
import { SharedBlockRenderer } from '@/components/cms/SharedBlockRenderer';
import { loadPublicCatalogContext, loadPublicGlobal, loadPublishedPage } from '@/lib/public-data';

export const metadata: Metadata = {
  title: 'Contact & Plan Your Trip',
  description: 'Reach Sharm Pharaoh Travel advisors for custom Egypt itineraries, excursions, and group inquiries.',
  alternates: { canonical: '/contact' },
};

export default async function ContactPage() {
  const [{ site }, catalog, pageRes] = await Promise.all([
    loadPublicGlobal(),
    loadPublicCatalogContext(),
    loadPublishedPage('contact').catch(() => ({ page: undefined })),
  ]);

  const blocks = pageRes.page?.content.blocks ?? [];

  return (
    <SharedBlockRenderer
      blocks={blocks}
      ctx={{
        destinations: catalog.destinations,
        categories: catalog.categories,
        tours: catalog.tours,
        site,
      }}
    />
  );
}
