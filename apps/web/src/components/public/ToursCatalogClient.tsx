'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Calendar, Clock, Filter, RotateCcw, Search } from 'lucide-react';
import { formatMinorUnits } from '@sharm/contracts';
import type { PublicDestinationSummary, PublicTourSummary } from '../cms/SharedBlockRenderer';

export interface ToursPageFilters {
  q?: string;
  destination?: string;
  category?: string;
  date?: string;
  duration?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  page?: number;
}

export function ToursCatalogClient({
  tours,
  pagination,
  destinations,
  categories,
  initialFilters,
}: {
  tours: Array<PublicTourSummary & { hasBookableAvailability?: boolean; nextAvailableDate?: string | null }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
  destinations: PublicDestinationSummary[];
  categories: Array<{ slug: string; name: string }>;
  initialFilters: ToursPageFilters;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialFilters.q || '');
  const [destination, setDestination] = useState(initialFilters.destination || '');
  const [category, setCategory] = useState(initialFilters.category || '');
  const [date, setDate] = useState(initialFilters.date || '');
  const [duration, setDuration] = useState(initialFilters.duration || '');
  const [minPrice, setMinPrice] = useState(initialFilters.minPrice || '');
  const [maxPrice, setMaxPrice] = useState(initialFilters.maxPrice || '');
  const [sort, setSort] = useState(initialFilters.sort || 'featured');

  const todayIso = new Date().toISOString().slice(0, 10);

  function applyFilters(next: Partial<ToursPageFilters> = {}, resetPage = true) {
    const merged: Record<string, string> = {
      q: next.q !== undefined ? next.q : q,
      destination: next.destination !== undefined ? next.destination : destination,
      category: next.category !== undefined ? next.category : category,
      date: next.date !== undefined ? next.date : date,
      duration: next.duration !== undefined ? next.duration : duration,
      minPrice: next.minPrice !== undefined ? next.minPrice : minPrice,
      maxPrice: next.maxPrice !== undefined ? next.maxPrice : maxPrice,
      sort: next.sort !== undefined ? next.sort : sort,
      page: resetPage ? '1' : String(next.page ?? pagination.page),
    };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v && !(k === 'page' && v === '1') && !(k === 'sort' && v === 'featured')) {
        params.set(k, v);
      }
    }
    const qs = params.toString();
    router.push(qs ? `/tours?${qs}` : '/tours');
  }

  function clearFilters() {
    setQ('');
    setDestination('');
    setCategory('');
    setDate('');
    setDuration('');
    setMinPrice('');
    setMaxPrice('');
    setSort('featured');
    router.push('/tours');
  }

  const hasActiveFilters = Boolean(q || destination || category || date || duration || minPrice || maxPrice);

  return (
    <div className="mx-auto max-w-[1260px] px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid gap-8 lg:grid-cols-12">
        {/* Sidebar Filters */}
        <aside className="lg:col-span-3">
          <search>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                applyFilters();
              }}
              aria-label="Filter tours"
              className="rounded-2xl border border-[#E5DFD2] bg-white shadow-sm overflow-hidden"
            >
              <div className="flex items-center justify-between bg-[#103D45] px-5 py-3.5 text-white">
                <span className="inline-flex items-center gap-2 text-sm font-bold">
                  <Filter className="h-4 w-4 text-[#C9A66B]" aria-hidden="true" />
                  Filter Tours
                </span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#E5BF78] hover:underline"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Reset
                  </button>
                )}
              </div>

              <div className="space-y-5 p-5">
                <div>
                  <label htmlFor="filter-q" className="block text-xs font-bold uppercase tracking-wider text-[#103D45]">
                    Keyword
                  </label>
                  <input
                    id="filter-q"
                    name="q"
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="e.g. Pyramids, White Island..."
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] px-3.5 py-2 text-sm text-[#103D45]"
                  />
                </div>

                <div>
                  <label htmlFor="filter-dest" className="block text-xs font-bold uppercase tracking-wider text-[#103D45]">
                    Destination
                  </label>
                  <select
                    id="filter-dest"
                    name="destination"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#103D45]"
                  >
                    <option value="">All destinations</option>
                    {destinations.map((d) => (
                      <option key={d.slug} value={d.slug}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="filter-cat" className="block text-xs font-bold uppercase tracking-wider text-[#103D45]">
                    Activity Category
                  </label>
                  <select
                    id="filter-cat"
                    name="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#103D45]"
                  >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="filter-date" className="block text-xs font-bold uppercase tracking-wider text-[#103D45]">
                    Available Date (Cairo Time)
                  </label>
                  <input
                    id="filter-date"
                    name="date"
                    type="date"
                    min={todayIso}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] px-3 py-2 text-sm text-[#103D45]"
                  />
                </div>

                <div>
                  <label htmlFor="filter-duration" className="block text-xs font-bold uppercase tracking-wider text-[#103D45]">
                    Duration
                  </label>
                  <select
                    id="filter-duration"
                    name="duration"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#103D45]"
                  >
                    <option value="">Any duration</option>
                    <option value="half-day">Half Day (up to 5 hrs)</option>
                    <option value="full-day">Full Day (6–12 hrs)</option>
                    <option value="2-days">2 Days</option>
                    <option value="3-plus-days">3 Days or More</option>
                  </select>
                </div>

                <fieldset>
                  <legend className="text-xs font-bold uppercase tracking-wider text-[#103D45]">
                    Price Range (USD)
                  </legend>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="filter-min" className="visually-hidden">Minimum price</label>
                      <input
                        id="filter-min"
                        name="minPrice"
                        type="number"
                        min={0}
                        placeholder="Min $"
                        value={minPrice}
                        onChange={(e) => setMinPrice(e.target.value)}
                        className="min-h-[44px] w-full rounded-xl border border-[#CBD5E1] px-3 py-2 text-sm text-[#103D45]"
                      />
                    </div>
                    <div>
                      <label htmlFor="filter-max" className="visually-hidden">Maximum price</label>
                      <input
                        id="filter-max"
                        name="maxPrice"
                        type="number"
                        min={0}
                        placeholder="Max $"
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value)}
                        className="min-h-[44px] w-full rounded-xl border border-[#CBD5E1] px-3 py-2 text-sm text-[#103D45]"
                      />
                    </div>
                  </div>
                </fieldset>

                <div>
                  <label htmlFor="filter-sort" className="block text-xs font-bold uppercase tracking-wider text-[#103D45]">
                    Sort By
                  </label>
                  <select
                    id="filter-sort"
                    name="sort"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#103D45]"
                  >
                    <option value="featured">Featured</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                    <option value="duration_asc">Duration: Shortest first</option>
                    <option value="duration_desc">Duration: Longest first</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-[#0E7C78] px-5 text-sm font-bold text-white shadow-xs transition hover:bg-[#103D45]"
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Apply Filters
                </button>
              </div>
            </form>
          </search>
        </aside>

        {/* Results Grid */}
        <div className="lg:col-span-9">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5DFD2] bg-white px-5 py-3.5">
            <p className="text-sm font-semibold text-[#103D45]" role="status">
              Showing <span className="font-extrabold">{tours.length}</span> of{' '}
              <span className="font-extrabold">{pagination.total}</span> bookable tour{pagination.total === 1 ? '' : 's'}
              {date ? ` with seats on ${date}` : ''}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm font-bold text-[#0E7C78] underline hover:text-[#103D45]"
              >
                Clear all filters
              </button>
            )}
          </div>

          {tours.length === 0 ? (
            <div className="rounded-2xl border border-[#E5DFD2] bg-white p-10 text-center shadow-xs">
              <h2 className="text-xl font-extrabold text-[#103D45]">No matching tours found</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#52606D]">
                {date
                  ? `No tours have open seats available on ${date} matching your current filters. Try another date or clear filters to browse all excursions.`
                  : 'Try adjusting your destination, activity category, or price range filters.'}
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#0E7C78] px-6 text-sm font-bold text-white hover:bg-[#103D45]"
              >
                Show All Tours
              </button>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {tours.map((tour) => (
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
                    <span className="absolute top-3 left-3 rounded-full bg-[#103D45]/90 px-3 py-1 text-xs font-bold text-white">
                      {tour.destination.name}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="text-lg font-extrabold text-[#103D45]">{tour.title}</h2>
                    {tour.shortDescription && (
                      <p className="mt-1.5 line-clamp-2 text-sm text-[#52606D]">{tour.shortDescription}</p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="inline-flex items-center gap-1.5 text-[#52606D]">
                        <Clock className="h-4 w-4 text-[#8A6828]" aria-hidden="true" />
                        {tour.durationLabel}
                      </span>
                      <span className="font-extrabold tabular-nums text-[#103D45]">
                        From {formatMinorUnits(tour.startingPriceMinor, tour.currency)}
                      </span>
                    </div>

                    {tour.nextAvailableDate && (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#0E7C78]">
                        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                        Next open departure: {tour.nextAvailableDate}
                      </p>
                    )}

                    <div className="mt-auto pt-4">
                      <Link
                        href={`/tours/${tour.slug}${date ? `?date=${encodeURIComponent(date)}` : ''}`}
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

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <nav aria-label="Tours pagination" className="mt-8 flex items-center justify-center gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => applyFilters({ page: pagination.page - 1 }, false)}
                className="min-h-[42px] rounded-full border border-[#D8D1C2] bg-white px-4 text-sm font-bold text-[#103D45] disabled:opacity-40"
              >
                &larr; Previous
              </button>
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-current={p === pagination.page ? 'page' : undefined}
                  onClick={() => applyFilters({ page: p }, false)}
                  className={`min-h-[42px] min-w-[42px] rounded-full px-3 text-sm font-bold ${
                    p === pagination.page
                      ? 'bg-[#0E7C78] text-white'
                      : 'border border-[#D8D1C2] bg-white text-[#103D45] hover:bg-[#FAF8F4]'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => applyFilters({ page: pagination.page + 1 }, false)}
                className="min-h-[42px] rounded-full border border-[#D8D1C2] bg-white px-4 text-sm font-bold text-[#103D45] disabled:opacity-40"
              >
                Next &rarr;
              </button>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
