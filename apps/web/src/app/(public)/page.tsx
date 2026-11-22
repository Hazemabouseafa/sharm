import React from 'react';
import type { Metadata } from 'next';
import { SharedBlockRenderer } from '@/components/cms/SharedBlockRenderer';
import { loadPublicCatalogContext, loadPublicGlobal, loadPublishedPage } from '@/lib/public-data';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const res = await loadPublishedPage('home');
    if (res.page?.content.seo) {
      return {
        title: res.page.content.seo.title,
        description: res.page.content.seo.description,
        alternates: { canonical: '/' },
      };
    }
  } catch {
    // fallback
  }
  return {
    title: 'Sharm Pharaoh Travel | Egypt Excursions & Red Sea Tours',
    alternates: { canonical: '/' },
  };
}

export default async function HomePage() {
  const [{ site }, catalog, pageRes] = await Promise.all([
    loadPublicGlobal(),
    loadPublicCatalogContext(),
    loadPublishedPage('home').catch(() => ({ page: undefined })),
  ]);

  const blocks = pageRes.page?.content.blocks ?? [];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TravelAgency',
    name: site.companyName || 'Sharm Pharaoh Travel',
    url: process.env.PUBLIC_SITE_URL || 'http://localhost:3000',
    ...(site.contactEmail ? { email: site.contactEmail } : {}),
    ...(site.contactPhone ? { telephone: site.contactPhone } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {blocks.length > 0 ? (
        <SharedBlockRenderer
          blocks={blocks}
          ctx={{
            destinations: catalog.destinations,
            categories: catalog.categories,
            tours: catalog.tours,
            site,
          }}
        />
      ) : (
        <div className="mx-auto max-w-[960px] px-4 py-20 text-center">
          <h1 id="main-content" tabIndex={-1} className="text-4xl font-extrabold text-[#103D45]">
            Egypt. Every journey tells a story.
          </h1>
          <p className="mt-3 text-base text-[#52606D]">
            Publish the Home page in Admin &rarr; Live Editor to customize your storefront sections.
          </p>
        </div>
      )}
    </>
  );
}
