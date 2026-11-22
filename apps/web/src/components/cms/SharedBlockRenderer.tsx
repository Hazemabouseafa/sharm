'use client';

import React from 'react';
import Link from 'next/link';
import {
  Anchor,
  ArrowRight,
  Calendar,
  Clock,
  Compass,
  MapPin,
  Search,
  Shield,
  Sparkles,
  Sailboat,
} from 'lucide-react';
import { CmsBlock, formatMinorUnits } from '@sharm/contracts';
import { SECTION_BG_CLASSES } from '@sharm/ui';
import { FaqAccordion } from '../public/FaqAccordion';
import { SafeRichText } from '../public/SafeRichText';
import { ContactFormClient } from '../public/ContactFormClient';
import type { PublicSiteContext } from '../public/SiteHeader';

export interface PublicDestinationSummary {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  heroImageUrl: string;
  heroImageAlt: string;
  displayOrder: number;
  publishedTourCount?: number;
}

export interface PublicTourSummary {
  id: string;
  slug: string;
  title: string;
  shortDescription?: string;
  destination: { slug: string; name: string };
  categories?: Array<{ slug: string; name: string }>;
  durationLabel: string;
  currency: string;
  startingPriceMinor: number;
  featured?: boolean;
  primaryImageUrl: string;
  primaryImageAlt: string;
}

export interface SharedBlockRenderContext {
  destinations: PublicDestinationSummary[];
  categories: Array<{ slug: string; name: string }>;
  tours: PublicTourSummary[];
  site: PublicSiteContext;
  editorMode?: boolean;
  selectedBlockId?: string | null;
  onSelectBlock?: (blockId: string) => void;
}

function widthClass(w: string): string {
  switch (w) {
    case 'narrow':
      return 'max-w-[820px]';
    case 'wide':
      return 'max-w-[1400px]';
    case 'full':
      return 'max-w-none';
    default:
      return 'max-w-[1260px]';
  }
}

function visibilityClass(style: CmsBlock['style']): string {
  const parts: string[] = [];
  if (style.hideOnMobile) parts.push('hidden md:block');
  if (style.hideOnTablet) parts.push('md:hidden lg:block');
  if (style.hideOnDesktop) parts.push('lg:hidden');
  return parts.join(' ');
}

function BenefitIcon({ icon }: { icon: string }) {
  const cls = 'h-6 w-6 text-[#0E7C78]';
  switch (icon) {
    case 'shield':
      return <Shield className={cls} aria-hidden="true" />;
    case 'clock':
      return <Clock className={cls} aria-hidden="true" />;
    case 'sparkles':
      return <Sparkles className={cls} aria-hidden="true" />;
    case 'anchor':
      return <Anchor className={cls} aria-hidden="true" />;
    case 'map':
      return <MapPin className={cls} aria-hidden="true" />;
    default:
      return <Compass className={cls} aria-hidden="true" />;
  }
}

export function SharedBlockRenderer({
  blocks,
  ctx,
}: {
  blocks: CmsBlock[];
  ctx: SharedBlockRenderContext;
}) {
  const visibleBlocks = ctx.editorMode ? blocks : blocks.filter((b) => !b.hidden);

  return (
    <div>
      {visibleBlocks.map((block, index) => {
        const isFirstHero = index === 0 && (block.type === 'Hero' || block.type === 'VideoHero');
        const isSelected = ctx.editorMode && ctx.selectedBlockId === block.id;
        const bgCls = SECTION_BG_CLASSES[block.style.backgroundToken] ?? SECTION_BG_CLASSES.ivory;
        const visCls = ctx.editorMode ? '' : visibilityClass(block.style);

        const content = renderBlockInner(block, ctx, isFirstHero);

        if (ctx.editorMode) {
          return (
            <div
              key={block.id}
              data-cms-block-id={block.id}
              onClick={(e) => {
                e.stopPropagation();
                ctx.onSelectBlock?.(block.id);
              }}
              className={`group relative cursor-pointer transition-all ${
                block.hidden ? 'opacity-45' : ''
              } ${
                isSelected
                  ? 'ring-2 ring-[#18A5A0] ring-offset-0 z-10'
                  : 'hover:ring-2 hover:ring-[#C9A66B]/70'
              }`}
            >
              <div
                className={`pointer-events-none absolute top-2 left-2 z-20 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold tracking-wide shadow ${
                  isSelected
                    ? 'bg-[#18A5A0] text-white'
                    : 'bg-[#103D45]/90 text-white opacity-0 group-hover:opacity-100'
                }`}
              >
                <span>{block.label || block.type}</span>
                {block.hidden && <span className="text-amber-200">(Hidden)</span>}
              </div>
              <section className={`${bgCls}`}>{content}</section>
            </div>
          );
        }

        return (
          <section
            key={block.id}
            id={block.type === 'DestinationGrid' ? 'destinations' : block.id}
            className={`${bgCls} ${visCls}`}
          >
            {content}
          </section>
        );
      })}
    </div>
  );
}

function renderBlockInner(block: CmsBlock, ctx: SharedBlockRenderContext, isLcpHero: boolean) {
  const padStyle = {
    paddingTop: `${block.style.paddingTopPx}px`,
    paddingBottom: `${block.style.paddingBottomPx}px`,
  };
  const containerCls = `mx-auto px-4 sm:px-6 lg:px-8 ${widthClass(block.style.containerWidth)}`;

  switch (block.type) {
    case 'Hero': {
      const p = block.props;
      const overlayAlpha = Math.max(0.15, Math.min(0.88, block.style.overlayOpacity / 100));
      return (
        <div
          className={`relative overflow-hidden ${p.compact ? 'min-h-[300px] sm:min-h-[360px]' : 'min-h-[480px] sm:min-h-[560px]'} flex items-center`}
          style={padStyle}
        >
          <img
            src={p.imageUrl}
            alt={p.imageAlt}
            fetchPriority={isLcpHero ? 'high' : undefined}
            loading={isLcpHero ? undefined : 'lazy'}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: `${p.focalPoint.x}% ${p.focalPoint.y}%` }}
          />
          {/* Protective neutral slate scrims: full-height readability on mobile, left-open reveal on desktop */}
          <div
            className="absolute inset-0 md:hidden"
            style={{
              background: `linear-gradient(180deg, rgba(11,17,23,${Math.min(0.75, overlayAlpha * 0.85).toFixed(2)}) 0%, rgba(11,17,23,${Math.min(0.84, overlayAlpha * 1.12).toFixed(2)}) 52%, rgba(11,17,23,${Math.min(0.92, overlayAlpha + 0.22).toFixed(2)}) 100%)`,
            }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 hidden md:block"
            style={{
              background: `linear-gradient(90deg, rgba(11,17,23,${(overlayAlpha * 0.25).toFixed(2)}) 0%, rgba(11,17,23,${(overlayAlpha * 0.86).toFixed(2)}) 52%, rgba(11,17,23,${Math.min(0.92, overlayAlpha + 0.22).toFixed(2)}) 100%)`,
            }}
            aria-hidden="true"
          />
          <div className="relative z-10 mx-auto w-full max-w-[1260px] px-4 sm:px-6 lg:px-8">
            <div className="ms-auto max-w-xl text-start text-white">
              {p.eyebrow && (
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#E3C68E]">
                  {p.eyebrow}
                </p>
              )}
              <h1
                id={isLcpHero ? 'main-content' : undefined}
                tabIndex={isLcpHero ? -1 : undefined}
                className={`${
                  block.style.fontScale === 'editorial'
                    ? 'text-4xl sm:text-5xl lg:text-[56px]'
                    : 'text-3xl sm:text-4xl lg:text-5xl'
                } text-balance font-extrabold leading-[1.08] tracking-tight`}
              >
                {p.headlineAccent && (
                  <span className="block text-[#F0CA82]">{p.headlineAccent}</span>
                )}
                <span>{p.headline}</span>
              </h1>
              {p.subtitle && (
                <div className="mt-4 flex items-center gap-3">
                  <span className="hidden h-px w-8 shrink-0 bg-[#C9A66B] sm:block" aria-hidden="true" />
                  <p className="text-pretty text-base leading-relaxed text-white/95 sm:text-lg">
                    {p.subtitle}
                  </p>
                </div>
              )}
              {(p.primaryCtaLabel || p.secondaryCtaLabel) && (
                <div className="mt-7 flex flex-wrap items-center gap-3.5">
                  {p.secondaryCtaLabel && p.secondaryCtaHref && (
                    <Link
                      href={p.secondaryCtaHref}
                      className="inline-flex min-h-[46px] items-center gap-2 rounded-full border border-white/75 bg-[#0B1117]/55 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-white hover:text-[#103D45]"
                    >
                      <span>{p.secondaryCtaLabel}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  )}
                  {p.primaryCtaLabel && p.primaryCtaHref && (
                    <Link
                      href={p.primaryCtaHref}
                      className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-[#18A5A0] px-6 py-2.5 text-sm font-extrabold text-[#071F24] shadow-md transition hover:bg-[#F0CA82]"
                    >
                      <span>{p.primaryCtaLabel}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    case 'SearchBar': {
      const p = block.props;
      const todayIso = new Date().toISOString().slice(0, 10);
      return (
        <div className={`${containerCls} ${p.floatingOverlap ? 'relative z-20 -mt-10' : ''}`} style={padStyle}>
          <search>
            <form
              action="/tours"
              method="GET"
              className="flex flex-col gap-3 rounded-2xl border border-[#E5DFD2] bg-white p-3.5 shadow-lg sm:grid sm:grid-cols-2 lg:flex lg:flex-row lg:items-center lg:gap-2 lg:p-4"
            >
              <div className="flex flex-1 items-center gap-3 px-3 py-1.5">
                <MapPin className="h-5 w-5 shrink-0 text-[#0E7C78]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <label htmlFor="hero-search-dest" className="block text-xs font-bold text-[#103D45]">
                    {p.destinationLabel}
                  </label>
                  <select
                    id="hero-search-dest"
                    name="destination"
                    className="mt-0.5 w-full bg-transparent text-sm text-[#334155] focus:outline-none"
                  >
                    <option value="">All destinations</option>
                    {ctx.destinations.map((d) => (
                      <option key={d.slug} value={d.slug}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <span className="hidden h-9 w-px shrink-0 bg-[#E5DFD2] lg:block" aria-hidden="true" />

              <div className="flex flex-1 items-center gap-3 px-3 py-1.5">
                <Sailboat className="h-5 w-5 shrink-0 text-[#0E7C78]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <label htmlFor="hero-search-cat" className="block text-xs font-bold text-[#103D45]">
                    {p.tourTypeLabel}
                  </label>
                  <select
                    id="hero-search-cat"
                    name="category"
                    className="mt-0.5 w-full bg-transparent text-sm text-[#334155] focus:outline-none"
                  >
                    <option value="">All tour types</option>
                    {ctx.categories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <span className="hidden h-9 w-px shrink-0 bg-[#E5DFD2] lg:block" aria-hidden="true" />

              <div className="flex flex-1 items-center gap-3 px-3 py-1.5">
                <Calendar className="h-5 w-5 shrink-0 text-[#0E7C78]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <label htmlFor="hero-search-date" className="block text-xs font-bold text-[#103D45]">
                    {p.dateLabel}
                  </label>
                  <input
                    id="hero-search-date"
                    name="date"
                    type="date"
                    min={todayIso}
                    className="mt-0.5 w-full bg-transparent text-sm tabular-nums text-[#334155] focus:outline-none"
                  />
                </div>
              </div>

              <div className="sm:col-span-2 lg:w-56 lg:shrink-0">
                <button
                  type="submit"
                  className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-[#0E7C78] px-5 font-bold text-white shadow-xs transition hover:bg-[#103D45]"
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  <span>{p.submitLabel}</span>
                </button>
              </div>
            </form>
          </search>
        </div>
      );
    }

    case 'DestinationGrid': {
      const p = block.props;
      const ordered = [...ctx.destinations];
      if (p.orderSlugs && p.orderSlugs.length > 0) {
        const orderMap = new Map(p.orderSlugs.map((s, i) => [s, i]));
        ordered.sort((a, b) => (orderMap.get(a.slug) ?? 99) - (orderMap.get(b.slug) ?? 99));
      }
      const gridCols =
        p.columns === 5
          ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
          : p.columns === 4
            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
            : p.columns === 3
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
              : 'grid-cols-1 sm:grid-cols-2';

      return (
        <div className={containerCls} style={padStyle}>
          <div className="mb-8 flex items-center justify-center gap-4 text-center">
            <span className="hidden h-px w-16 bg-[#C9A66B] sm:block" aria-hidden="true" />
            <h2 className="text-2xl font-extrabold tracking-tight text-[#103D45] sm:text-3xl">
              {p.heading}
            </h2>
            <span className="hidden h-px w-16 bg-[#C9A66B] sm:block" aria-hidden="true" />
          </div>
          {p.subheading && (
            <p className="mx-auto -mt-4 mb-8 max-w-2xl text-pretty text-center text-sm text-[#52606D]">{p.subheading}</p>
          )}
          <div className={`grid gap-4 ${gridCols}`}>
            {ordered.map((dest) => (
              <Link
                key={dest.slug}
                href={`/destinations/${dest.slug}`}
                className="group relative flex aspect-[4/5] items-end overflow-hidden rounded-2xl bg-[#103D45] shadow-md transition hover:-translate-y-1 hover:shadow-xl"
              >
                <img
                  src={dest.heroImageUrl}
                  alt={dest.heroImageAlt}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(to top, rgba(11, 17, 23, 0.88) 0%, rgba(11, 17, 23, 0.28) 46%, rgba(11, 17, 23, 0.04) 100%)',
                  }}
                  aria-hidden="true"
                />
                <div className="relative z-10 flex w-full items-center gap-2.5 p-4 text-white">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#C9A66B] text-[#103D45] transition group-hover:bg-[#18A5A0] group-hover:text-white">
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-lg font-extrabold leading-tight">{dest.name}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      );
    }

    case 'TourGrid': {
      const p = block.props;
      let list = [...ctx.tours];
      if (p.mode === 'FEATURED') {
        const feat = list.filter((t) => t.featured);
        list = feat.length > 0 ? feat : list;
      } else if (p.mode === 'DESTINATION' && p.destinationSlug) {
        list = list.filter((t) => t.destination.slug === p.destinationSlug);
      } else if (p.mode === 'CATEGORY' && p.categorySlug) {
        list = list.filter((t) => t.categories?.some((c) => c.slug === p.categorySlug));
      } else if (p.mode === 'CURATED' && p.curatedTourSlugs?.length) {
        const map = new Map(list.map((t) => [t.slug, t]));
        list = p.curatedTourSlugs.map((s) => map.get(s)).filter((t): t is PublicTourSummary => Boolean(t));
      }
      list = list.slice(0, p.limit);

      const colsCls =
        p.columns === 4
          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          : p.columns === 2
            ? 'grid-cols-1 md:grid-cols-2'
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

      return (
        <div className={containerCls} style={padStyle}>
          <div className="mb-8 flex items-center justify-center gap-4 text-center">
            <span className="hidden h-px w-16 bg-[#C9A66B] sm:block" aria-hidden="true" />
            <h2 className="text-2xl font-extrabold tracking-tight text-[#103D45] sm:text-3xl">
              {p.heading}
            </h2>
            <span className="hidden h-px w-16 bg-[#C9A66B] sm:block" aria-hidden="true" />
          </div>
          {p.subheading && (
            <p className="mx-auto -mt-4 mb-8 max-w-2xl text-center text-sm text-[#52606D]">{p.subheading}</p>
          )}
          {list.length === 0 ? (
            <div className="rounded-2xl border border-[#E5DFD2] bg-white p-8 text-center text-sm text-[#52606D]">
              No published tours currently match this selection.
            </div>
          ) : (
            <div className={`grid gap-6 ${colsCls}`}>
              {list.map((tour) => (
                <article
                  key={tour.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-[#E5DFD2] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-[#103D45]">
                    <img
                      src={tour.primaryImageUrl}
                      alt={tour.primaryImageAlt}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <span className="absolute top-3 left-3 rounded-full bg-[#103D45]/90 px-3 py-1 text-xs font-bold text-white backdrop-blur-xs">
                      {tour.destination.name}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-lg font-extrabold text-[#103D45]">{tour.title}</h3>
                    <div className="mt-2 flex items-center justify-between gap-2 text-sm text-[#52606D]">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-[#8A6828]" aria-hidden="true" />
                        {tour.durationLabel}
                      </span>
                      {p.showPrice && tour.startingPriceMinor > 0 && (
                        <span className="font-extrabold tabular-nums text-[#103D45]">
                          From {formatMinorUnits(tour.startingPriceMinor, tour.currency)}
                        </span>
                      )}
                    </div>
                    <div className="mt-auto pt-5">
                      <Link
                        href={`/tours/${tour.slug}`}
                        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-[#C9A66B] bg-[#FAF8F4] px-4 text-sm font-bold text-[#103D45] transition hover:bg-[#103D45] hover:text-white"
                      >
                        <span>View Details</span>
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      );
    }

    case 'CallToAction': {
      const p = block.props;
      return (
        <div className={containerCls} style={padStyle}>
          <div className="grid overflow-hidden rounded-2xl border border-[#E5DFD2] bg-white shadow-sm md:grid-cols-12">
            <div className="relative min-h-[240px] md:col-span-7">
              <img
                src={p.imageUrl}
                alt={p.imageAlt}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              <div
                className="pointer-events-none absolute inset-y-0 right-0 hidden w-10 bg-gradient-to-l from-white to-transparent md:block"
                aria-hidden="true"
              />
            </div>
            <div className="flex flex-col justify-center p-7 md:col-span-5 md:p-9">
              <span className="mb-4 block h-1 w-12 rounded-full bg-[#C9A66B]" aria-hidden="true" />
              <h2 className="text-balance text-2xl font-extrabold leading-tight text-[#103D45] sm:text-3xl">
                {p.heading}
              </h2>
              <p className="mt-3 text-pretty text-sm leading-relaxed text-[#334155] sm:text-base">{p.body}</p>
              <div className="mt-6">
                <Link
                  href={p.ctaHref}
                  className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-[#0E7C78] px-6 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-[#103D45]"
                >
                  <span>{p.ctaLabel}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      );
    }

    case 'RichText': {
      const p = block.props;
      return (
        <div className={containerCls} style={padStyle}>
          {p.heading && (
            <h1 id="main-content" tabIndex={-1} className="mb-6 text-3xl font-extrabold text-[#103D45]">
              {p.heading}
            </h1>
          )}
          <SafeRichText html={p.bodyHtml} />
        </div>
      );
    }

    case 'ImageText': {
      const p = block.props;
      return (
        <div className={containerCls} style={padStyle}>
          <div className="grid items-center gap-8 md:grid-cols-2">
            <div className={p.imagePosition === 'right' ? 'md:order-2' : ''}>
              <img
                src={p.imageUrl}
                alt={p.imageAlt}
                loading="lazy"
                className="aspect-[16/10] w-full rounded-2xl object-cover shadow-md"
                style={{ objectPosition: `${p.focalPoint.x}% ${p.focalPoint.y}%` }}
              />
            </div>
            <div className={p.imagePosition === 'right' ? 'md:order-1' : ''}>
              <h2 className="text-2xl font-extrabold text-[#103D45] sm:text-3xl">{p.heading}</h2>
              <p className="mt-3 text-base leading-relaxed text-[#334155]">{p.body}</p>
              {p.ctaLabel && p.ctaHref && (
                <div className="mt-6">
                  <Link
                    href={p.ctaHref}
                    className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-[#0E7C78] px-6 font-bold text-white hover:bg-[#103D45]"
                  >
                    {p.ctaLabel}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    case 'ImageGallery': {
      const p = block.props;
      return (
        <div className={containerCls} style={padStyle}>
          {p.heading && <h2 className="mb-6 text-center text-2xl font-extrabold text-[#103D45]">{p.heading}</h2>}
          <div className={`grid gap-4 ${p.columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : p.columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
            {p.items.map((item, idx) => (
              <figure key={`${item.imageUrl}-${idx}`} className="overflow-hidden rounded-2xl border border-[#E5DFD2] bg-white">
                <img src={item.imageUrl} alt={item.alt} loading="lazy" className="aspect-[16/10] w-full object-cover" />
                {item.caption && <figcaption className="px-4 py-2.5 text-xs font-semibold text-[#52606D]">{item.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </div>
      );
    }

    case 'VideoHero': {
      const p = block.props;
      return (
        <div className="relative flex min-h-[420px] items-center overflow-hidden" style={padStyle}>
          {p.videoUrl ? (
            <video
              autoPlay
              muted
              loop
              playsInline
              poster={p.posterUrl}
              className="absolute inset-0 h-full w-full object-cover"
              aria-label={p.posterAlt}
            >
              <source src={p.videoUrl} type="video/mp4" />
            </video>
          ) : (
            <img
              src={p.posterUrl}
              alt={p.posterAlt}
              fetchPriority={isLcpHero ? 'high' : undefined}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-[#103D45]/60" aria-hidden="true" />
          <div className="relative z-10 mx-auto max-w-[1260px] px-6 text-white">
            <h1 className="max-w-2xl text-4xl font-extrabold sm:text-5xl">{p.headline}</h1>
            {p.subtitle && <p className="mt-3 max-w-xl text-base text-white/90">{p.subtitle}</p>}
            {p.ctaLabel && p.ctaHref && (
              <Link
                href={p.ctaHref}
                className="mt-6 inline-flex min-h-[46px] items-center gap-2 rounded-full bg-[#18A5A0] px-6 font-bold text-[#0A292F]"
              >
                {p.ctaLabel}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      );
    }

    case 'Benefits': {
      const p = block.props;
      return (
        <div className={containerCls} style={padStyle}>
          <h2 className="mb-8 text-center text-2xl font-extrabold text-[#103D45] sm:text-3xl">{p.heading}</h2>
          <div className={`grid gap-6 ${p.columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : p.columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
            {p.items.map((item, idx) => (
              <div key={`${item.title}-${idx}`} className="rounded-2xl border border-[#E5DFD2] bg-[#FAF8F4] p-6 text-left">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-xs">
                  <BenefitIcon icon={item.icon} />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#103D45]">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#52606D]">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'FAQ': {
      const p = block.props;
      return (
        <div className={containerCls} style={padStyle}>
          {p.bannerImageUrl && (
            <div className="mb-8 grid overflow-hidden rounded-2xl border border-[#E5DFD2] bg-white md:grid-cols-12">
              <div className="h-36 md:col-span-5 md:h-auto">
                <img
                  src={p.bannerImageUrl}
                  alt={p.bannerImageAlt || 'Egypt travel'}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex flex-col justify-center p-6 md:col-span-7">
                <span className="mb-3 block h-1 w-10 rounded-full bg-[#C9A66B]" aria-hidden="true" />
                <h2 className="text-2xl font-extrabold text-[#103D45]">{p.heading}</h2>
                {p.subheading && <p className="mt-1 text-sm text-[#52606D]">{p.subheading}</p>}
              </div>
            </div>
          )}
          {!p.bannerImageUrl && (
            <div className="mb-6">
              <h2 className="text-2xl font-extrabold text-[#103D45]">{p.heading}</h2>
              {p.subheading && <p className="mt-1 text-sm text-[#52606D]">{p.subheading}</p>}
            </div>
          )}
          <FaqAccordion items={p.items} />
        </div>
      );
    }

    case 'ContactForm': {
      const p = block.props;
      return (
        <div className={containerCls} style={padStyle}>
          <ContactFormClient
            heading={p.heading}
            subheading={p.subheading}
            sideHeading={p.sideHeading}
            sideBody={p.sideBody}
            destinations={ctx.destinations}
            site={ctx.site}
          />
        </div>
      );
    }

    case 'SpacerDivider': {
      return (
        <div className={containerCls} style={{ height: `${block.props.heightPx}px` }}>
          {block.props.showLine && (
            <div className="flex h-full items-center">
              <hr className="w-full border-[#E5DFD2]" />
            </div>
          )}
        </div>
      );
    }
  }
}
