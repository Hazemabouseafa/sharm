import React from 'react';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { SharedBlockRenderer } from '@/components/cms/SharedBlockRenderer';
import { loadPublicCatalogContext, loadPublicGlobal, loadPublishedPage } from '@/lib/public-data';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await loadPublishedPage(slug);
    if (res.page) {
      return {
        title: res.page.content.seo.title,
        description: res.page.content.seo.description,
        robots: res.page.content.seo.noIndex ? { index: false, follow: false } : undefined,
        alternates: { canonical: `/p/${slug}` },
      };
    }
  } catch {
    // not found
  }
  return { title: 'Page Not Found' };
}

export default async function CustomCmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let res;
  try {
    res = await loadPublishedPage(slug);
  } catch {
    notFound();
  }

  if (res.redirect) {
    permanentRedirect(res.redirect.toPath);
  }
  if (!res.page) {
    notFound();
  }

  const [{ site }, catalog] = await Promise.all([
    loadPublicGlobal(),
    loadPublicCatalogContext(),
  ]);

  return (
    <SharedBlockRenderer
      blocks={res.page.content.blocks}
      ctx={{
        destinations: catalog.destinations,
        categories: catalog.categories,
        tours: catalog.tours,
        site,
      }}
    />
  );
}
