import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { serverApiGet } from '@/lib/api';
import { loadPublicCatalogContext, loadPublicGlobal, loadPublishedPage } from '@/lib/public-data';
import { SharedBlockRenderer, PublicTourSummary } from '@/components/cms/SharedBlockRenderer';
import { FaqAccordion } from '@/components/public/FaqAccordion';

export const dynamic = 'force-dynamic';

interface DestinationDetailResponse {
  destination: {
    id: string;
    slug: string;
    name: string;
    tagline: string;
    heroSubtitle: string;
    description: string;
    heroImageUrl: string;
    heroImageAlt: string;
    highlightsJson: string[];
    faqJson: Array<{ question: string; answer: string }>;
    seoTitle?: string | null;
    seoDescription?: string | null;
  };
  tours: PublicTourSummary[];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const data = await serverApiGet<DestinationDetailResponse>(`/public/destinations/${encodeURIComponent(slug)}`, {
      tags: ['destinations', `destination:${slug}`],
      revalidate: 300,
    });
    return {
      title: data.destination.seoTitle || `${data.destination.name} Tours & Excursions`,
      description: data.destination.seoDescription || data.destination.heroSubtitle,
      alternates: { canonical: `/destinations/${slug}` },
    };
  } catch {
    return { title: 'Destination Not Found' };
  }
}

export default async function DestinationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let data: DestinationDetailResponse;
  try {
    data = await serverApiGet<DestinationDetailResponse>(`/public/destinations/${encodeURIComponent(slug)}`, {
      tags: ['destinations', `destination:${slug}`],
      revalidate: 300,
    });
  } catch {
    notFound();
  }

  const [{ site }, catalog, pageRes] = await Promise.all([
    loadPublicGlobal(),
    loadPublicCatalogContext(),
    loadPublishedPage(`destinations/${slug}`).catch(() => ({ page: undefined })),
  ]);

  const dest = data.destination;
  const highlights = Array.isArray(dest.highlightsJson) ? dest.highlightsJson : [];
  const faqs = Array.isArray(dest.faqJson) ? dest.faqJson : [];
  const cmsBlocks = pageRes.page?.content.blocks ?? [];

  return (
    <div>
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="border-b border-[#E5DFD2] bg-white">
        <div className="mx-auto flex max-w-[1260px] items-center gap-2 px-4 py-3 text-xs font-semibold text-[#52606D] sm:px-6 lg:px-8">
          <Link href="/" className="hover:text-[#0E7C78]">Home</Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <Link href="/tours" className="hover:text-[#0E7C78]">Destinations</Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-[#103D45]" aria-current="page">{dest.name}</span>
        </div>
      </nav>

      {/* Editable Destination CMS Template or Reusable Default */}
      {cmsBlocks.length > 0 ? (
        <SharedBlockRenderer
          blocks={cmsBlocks}
          ctx={{
            destinations: catalog.destinations,
            categories: catalog.categories,
            tours: catalog.tours,
            site,
          }}
        />
      ) : (
        <SharedBlockRenderer
          blocks={[
            {
              id: `auto-hero-${dest.slug}`,
              type: 'Hero',
              hidden: false,
              locked: false,
              style: { backgroundToken: 'petrol', textAlign: 'left', containerWidth: 'full', paddingTopPx: 72, paddingBottomPx: 72, overlayOpacity: 45, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'editorial' },
              props: {
                headline: dest.name,
                subtitle: dest.tagline,
                imageUrl: dest.heroImageUrl,
                imageAlt: dest.heroImageAlt,
                focalPoint: { x: 50, y: 50 },
                primaryCtaLabel: 'Explore All Tours',
                primaryCtaHref: `/tours?destination=${dest.slug}`,
                compact: true,
              },
            },
            {
              id: `auto-tours-${dest.slug}`,
              type: 'TourGrid',
              hidden: false,
              locked: false,
              style: { backgroundToken: 'ivory', textAlign: 'center', containerWidth: 'default', paddingTopPx: 48, paddingBottomPx: 56, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
              props: {
                heading: `Explore ${dest.name} Tours`,
                subheading: dest.heroSubtitle,
                mode: 'DESTINATION',
                destinationSlug: dest.slug,
                limit: 12,
                columns: 2,
                showPrice: true,
              },
            },
          ]}
          ctx={{
            destinations: catalog.destinations,
            categories: catalog.categories,
            tours: catalog.tours,
            site,
          }}
        />
      )}

      {/* Destination Highlights & FAQ */}
      {(highlights.length > 0 || dest.description) && (
        <section id="highlights" className="bg-white py-12 border-t border-[#E5DFD2]">
          <div className="mx-auto max-w-[1260px] px-4 sm:px-6 lg:px-8 grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <h2 className="text-2xl font-extrabold text-[#103D45]">About {dest.name}</h2>
              <p className="mt-3 text-base leading-relaxed text-[#334155]">{dest.description}</p>
            </div>
            {highlights.length > 0 && (
              <div className="lg:col-span-5 rounded-2xl border border-[#E5DFD2] bg-[#FAF8F4] p-6">
                <h3 className="text-base font-extrabold text-[#103D45]">Top Highlights</h3>
                <ul className="mt-3 space-y-2.5 text-sm text-[#334155]">
                  {highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0E7C78]" aria-hidden="true" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {faqs.length > 0 && (
        <section className="py-12">
          <div className="mx-auto max-w-[960px] px-4 sm:px-6 lg:px-8">
            <h2 className="mb-6 text-2xl font-extrabold text-[#103D45]">{dest.name} Travel FAQs</h2>
            <FaqAccordion items={faqs} />
          </div>
        </section>
      )}
    </div>
  );
}
