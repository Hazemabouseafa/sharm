import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Globe,
  MapPin,
  Shield,
  Users,
  XCircle,
} from 'lucide-react';
import { formatMinorUnits } from '@sharm/contracts';
import { serverApiGet } from '@/lib/api';
import { loadPublicGlobal } from '@/lib/public-data';
import { FaqAccordion } from '@/components/public/FaqAccordion';
import { SafeRichText } from '@/components/public/SafeRichText';
import {
  TourAddonOption,
  TourDepartureOption,
  TourDetailBookingPanel,
  TourPickupOption,
} from '@/components/public/TourDetailBookingPanel';

interface TourDetailPayload {
  tour: {
    id: string;
    slug: string;
    title: string;
    destination: { slug: string; name: string };
    shortDescription: string;
    descriptionHtml: string;
    highlights: string[];
    durationLabel: string;
    durationHours: number;
    guideLanguages: string[];
    meetingPoint: string;
    minAge: number;
    accessibilityInfo: string;
    itinerary: Array<{ step: number; title: string; description: string }>;
    inclusions: string[];
    exclusions: string[];
    whatToBring: string[];
    faq: Array<{ question: string; answer: string }>;
    pricingMode: string;
    currency: string;
    startingPriceMinor: number;
    minAdults: number;
    maxPartySize: number;
    ageBands: Array<{ code: string; label: string; priceMinor: number; consumesSeat: boolean }>;
    primaryImageUrl: string;
    primaryImageAlt: string;
    gallery: Array<{ url: string; alt: string }>;
    addons: TourAddonOption[];
    pickupZones: TourPickupOption[];
    policy: {
      name: string;
      summary: string;
      activeVersion: { title: string; bodyMarkdown: string } | null;
    } | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
  };
  departures: TourDepartureOption[];
  relatedTours: Array<{
    id: string;
    slug: string;
    title: string;
    destination: { slug: string; name: string };
    durationLabel: string;
    currency: string;
    startingPriceMinor: number;
    primaryImageUrl: string;
    primaryImageAlt: string;
  }>;
  paymentOptions: { payLaterEnabled: boolean; bankTransferEnabled: boolean; onlineEnabled: boolean };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await serverApiGet<TourDetailPayload>(`/public/tours/${encodeURIComponent(slug)}`, {
      tags: ['tours', `tour:${slug}`],
      revalidate: 300,
    });
    return {
      title: res.tour.seoTitle || res.tour.title,
      description: res.tour.seoDescription || res.tour.shortDescription,
      alternates: { canonical: `/tours/${slug}` },
    };
  } catch {
    return { title: 'Tour Not Found' };
  }
}

export default async function TourDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const initialDate = typeof sp.date === 'string' ? sp.date : undefined;

  let data: TourDetailPayload;
  try {
    data = await serverApiGet<TourDetailPayload>(`/public/tours/${encodeURIComponent(slug)}`, {
      noStore: true, // Always reflect exact live seat availability on tour page!
    });
  } catch {
    notFound();
  }

  const { site } = await loadPublicGlobal();
  const { tour, departures, relatedTours, paymentOptions } = data;
  const gallery = tour.gallery?.length
    ? tour.gallery
    : [{ url: tour.primaryImageUrl, alt: tour.primaryImageAlt }];

  // Validated structured data strictly for real facts present (NO invented AggregateRating!)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: tour.title,
    description: tour.shortDescription,
    touristType: 'Excursion',
    provider: { '@type': 'TravelAgency', name: site.companyName || 'Sharm Pharaoh Travel' },
    offers: {
      '@type': 'Offer',
      priceCurrency: tour.currency,
      price: (tour.startingPriceMinor / 100).toFixed(2),
      availability: departures.some((d) => d.bookable)
        ? 'https://schema.org/InStock'
        : 'https://schema.org/SoldOut',
    },
  };

  return (
    <div className="pb-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="border-b border-[#E5DFD2] bg-white">
        <div className="mx-auto flex max-w-[1260px] flex-wrap items-center gap-2 px-4 py-3 text-xs font-semibold text-[#52606D] sm:px-6 lg:px-8">
          <Link href="/" className="hover:text-[#0E7C78]">Home</Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <Link href={`/destinations/${tour.destination.slug}`} className="hover:text-[#0E7C78]">
            {tour.destination.name}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-[#103D45]" aria-current="page">{tour.title}</span>
        </div>
      </nav>

      <div className="mx-auto max-w-[1260px] px-4 pt-8 sm:px-6 lg:px-8">
        {/* Title & Photo Gallery */}
        <div className="text-center">
          <h1 id="main-content" tabIndex={-1} className="text-3xl font-extrabold text-[#103D45] sm:text-4xl">
            {tour.title}
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-[#52606D] sm:text-base">
            {tour.shortDescription}
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-12">
          <div className={gallery.length > 1 ? 'sm:col-span-8' : 'sm:col-span-12'}>
            <img
              src={gallery[0].url}
              alt={gallery[0].alt}
              fetchPriority="high"
              className="aspect-[16/10] w-full rounded-2xl object-cover shadow-md"
            />
          </div>
          {gallery.length > 1 && (
            <div className="grid gap-3 sm:col-span-4">
              {gallery.slice(1, 3).map((img, i) => (
                <img
                  key={`${img.url}-${i}`}
                  src={img.url}
                  alt={img.alt}
                  loading="lazy"
                  className="aspect-[16/10] h-full w-full rounded-2xl object-cover shadow-sm"
                />
              ))}
            </div>
          )}
        </div>

        {/* Key Fact Strip */}
        <div className="mt-6 grid gap-4 rounded-2xl border border-[#E5DFD2] bg-white p-5 shadow-xs sm:grid-cols-4 text-sm">
          <div className="flex items-center gap-2.5">
            <Clock className="h-5 w-5 text-[#8A6828]" aria-hidden="true" />
            <div>
              <span className="block text-xs font-bold uppercase tracking-wide text-[#52606D]">Duration</span>
              <span className="font-bold text-[#103D45]">{tour.durationLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <MapPin className="h-5 w-5 text-[#0E7C78]" aria-hidden="true" />
            <div>
              <span className="block text-xs font-bold uppercase tracking-wide text-[#52606D]">Destination</span>
              <span className="font-bold text-[#103D45]">{tour.destination.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Globe className="h-5 w-5 text-[#0E7C78]" aria-hidden="true" />
            <div>
              <span className="block text-xs font-bold uppercase tracking-wide text-[#52606D]">Guide Languages</span>
              <span className="font-bold text-[#103D45]">{tour.guideLanguages.join(', ')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Users className="h-5 w-5 text-[#0E7C78]" aria-hidden="true" />
            <div>
              <span className="block text-xs font-bold uppercase tracking-wide text-[#52606D]">Group / Min Age</span>
              <span className="font-bold tabular-nums text-[#103D45]">
                Up to {tour.maxPartySize} · {tour.minAge > 0 ? `${tour.minAge}+ yrs` : 'All ages'}
              </span>
            </div>
          </div>
        </div>

        {/* Main Detail + Sticky Booking Panel */}
        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7 space-y-8">
            <section className="rounded-2xl border border-[#E5DFD2] bg-white p-6 sm:p-7">
              <h2 className="text-xl font-extrabold text-[#103D45]">Overview</h2>
              <SafeRichText html={tour.descriptionHtml} className="mt-3" />
              {tour.meetingPoint && (
                <p className="mt-4 rounded-xl bg-[#FAF8F4] px-4 py-3 text-sm text-[#334155]">
                  <strong>Meeting Point / Pickup:</strong> {tour.meetingPoint}
                </p>
              )}
              {tour.accessibilityInfo && (
                <p className="mt-3 text-xs text-[#52606D]">
                  <strong>Accessibility &amp; Logistics:</strong> {tour.accessibilityInfo}
                </p>
              )}
            </section>

            {tour.itinerary?.length > 0 && (
              <section className="rounded-2xl border border-[#E5DFD2] bg-white p-6 sm:p-7">
                <h2 className="text-xl font-extrabold text-[#103D45]">Itinerary</h2>
                <ol className="mt-4 space-y-5">
                  {tour.itinerary.map((item) => (
                    <li key={item.step} className="flex gap-4">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#C9A66B] text-sm font-extrabold text-[#103D45]">
                        {item.step}
                      </span>
                      <div>
                        <h3 className="font-bold text-[#103D45]">{item.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-[#52606D]">{item.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section className="grid gap-6 rounded-2xl border border-[#E5DFD2] bg-white p-6 sm:grid-cols-2 sm:p-7">
              <div>
                <h2 className="text-lg font-extrabold text-[#103D45]">Inclusions</h2>
                <ul className="mt-3 space-y-2 text-sm text-[#334155]">
                  {tour.inclusions.map((inc, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0E7C78]" aria-hidden="true" />
                      <span>{inc}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-[#103D45]">Exclusions</h2>
                <ul className="mt-3 space-y-2 text-sm text-[#334155]">
                  {tour.exclusions.map((exc, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" aria-hidden="true" />
                      <span>{exc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {tour.whatToBring?.length > 0 && (
              <section className="rounded-2xl border border-[#E5DFD2] bg-white p-6 sm:p-7">
                <h2 className="text-lg font-extrabold text-[#103D45]">What to Bring</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {tour.whatToBring.map((item, i) => (
                    <li key={i} className="rounded-full border border-[#E5DFD2] bg-[#FAF8F4] px-3.5 py-1.5 text-xs font-semibold text-[#103D45]">
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {tour.policy && (
              <section className="rounded-2xl border border-[#E5DFD2] bg-white p-6 sm:p-7">
                <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#103D45]">
                  <Shield className="h-5 w-5 text-[#0E7C78]" aria-hidden="true" />
                  Cancellation &amp; Booking Terms
                </h2>
                <p className="mt-2 text-sm font-semibold text-[#103D45]">{tour.policy.name}</p>
                <p className="mt-1 text-sm text-[#52606D]">{tour.policy.summary}</p>
              </section>
            )}

            {tour.faq?.length > 0 && (
              <section>
                <h2 className="mb-4 text-xl font-extrabold text-[#103D45]">Tour FAQs</h2>
                <FaqAccordion items={tour.faq} />
              </section>
            )}
          </div>

          <div className="lg:col-span-5">
            <TourDetailBookingPanel
              tour={tour}
              departures={departures}
              initialDate={initialDate}
              paymentOptions={paymentOptions}
              demoMode={site.demoMode}
            />
          </div>
        </div>

        {/* Related Tours */}
        {relatedTours.length > 0 && (
          <section className="mt-14 border-t border-[#E5DFD2] pt-10">
            <h2 className="text-2xl font-extrabold text-[#103D45]">More in {tour.destination.name}</h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {relatedTours.map((rt) => (
                <article key={rt.id} className="flex flex-col overflow-hidden rounded-2xl border border-[#E5DFD2] bg-white shadow-xs">
                  <img src={rt.primaryImageUrl} alt={rt.primaryImageAlt} loading="lazy" className="aspect-[16/10] w-full object-cover" />
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-base font-extrabold text-[#103D45]">{rt.title}</h3>
                    <p className="mt-1 text-xs text-[#52606D]">
                      {rt.durationLabel} · From {formatMinorUnits(rt.startingPriceMinor, rt.currency)}
                    </p>
                    <Link
                      href={`/tours/${rt.slug}`}
                      className="mt-4 inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-full border border-[#C9A66B] bg-[#FAF8F4] text-xs font-bold text-[#103D45] hover:bg-[#103D45] hover:text-white"
                    >
                      View Details <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
