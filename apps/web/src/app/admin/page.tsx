'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BookOpen, Calendar, CreditCard, Inbox, Percent } from 'lucide-react';
import { formatMinorUnitsExact } from '@sharm/contracts';
import { StatusBadge } from '@sharm/ui';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

interface OverviewPayload {
  demoMode: boolean;
  windowDays: number;
  timezone: string;
  metrics: {
    totalBookings: number;
    confirmedBookings: number;
    pendingRequests: number;
    cancelledBookings: number;
    occupancyPct: number;
    pendingProofs: number;
    newInquiries: number;
    failedJobs: number;
  };
  financialsByCurrency: Record<
    string,
    { collectedMinor: number; refundedMinor: number; netCollectedMinor: number; bookedValueMinor: number; outstandingMinor: number }
  >;
  dailySeries: Array<{ date: string; count: number }>;
  upcomingDepartures: Array<{
    id: string;
    tourTitle: string;
    imageUrl: string;
    departureDate: string;
    startTime: string;
    capacity: number;
    bookedSeats: number;
    heldSeats: number;
  }>;
  recentBookings: Array<{
    id: string;
    reference: string;
    leadName: string;
    tourTitle: string;
    departureDate: string;
    status: string;
    paymentStatus: string;
    currency: string;
    grandTotalMinor: number;
  }>;
}

export default function AdminOverviewPage() {
  const { adminFetch } = useAdminAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    adminFetch<OverviewPayload>(`/admin/overview?days=${days}`)
      .then((res) => {
        setData(res);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load overview'))
      .finally(() => setLoading(false));
  }, [adminFetch, days]);

  if (loading) return <p className="text-sm text-[#52606D]">Loading live operational metrics...</p>;
  if (error || !data) return <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-900">{error || 'Unavailable'}</p>;

  const currencies = Object.entries(data.financialsByCurrency);
  const primaryCurr = currencies[0];
  const maxDayCount = Math.max(1, ...data.dailySeries.map((d) => d.count));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-extrabold text-[#103D45]">Operations Overview</h2>
          {data.demoMode && (
            <span className="rounded-full border border-[#C9A66B] bg-[#FDF6E7] px-3 py-0.5 text-xs font-bold text-[#8A5A10]">
              Demo data
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="ov-days" className="text-xs font-bold text-[#52606D]">Window:</label>
          <select
            id="ov-days"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="min-h-[38px] rounded-xl border border-[#CBD5E1] bg-white px-3 text-xs font-bold text-[#103D45]"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* KPI Cards (real DB totals — zeros when empty!) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-[#E5DFD2] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#52606D]">Bookings ({days}d)</span>
            <BookOpen className="h-5 w-5 text-[#8A6828]" aria-hidden="true" />
          </div>
          <p className="mt-2 text-3xl font-extrabold tabular-nums text-[#103D45]">{data.metrics.totalBookings}</p>
          <p className="mt-1 text-xs tabular-nums text-[#52606D]">
            {data.metrics.confirmedBookings} confirmed · {data.metrics.cancelledBookings} cancelled
          </p>
        </div>

        <div className="rounded-2xl border border-[#E5DFD2] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#52606D]">Collected Revenue</span>
            <CreditCard className="h-5 w-5 text-[#0E7C78]" aria-hidden="true" />
          </div>
          <p className="mt-2 text-3xl font-extrabold tabular-nums text-[#103D45]">
            {primaryCurr ? formatMinorUnitsExact(primaryCurr[1].netCollectedMinor, primaryCurr[0]) : '$0.00'}
          </p>
          <p className="mt-1 text-xs tabular-nums text-[#52606D]">
            Booked value: {primaryCurr ? formatMinorUnitsExact(primaryCurr[1].bookedValueMinor, primaryCurr[0]) : '$0.00'}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E5DFD2] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#52606D]">Pending Requests</span>
            <Inbox className="h-5 w-5 text-amber-700" aria-hidden="true" />
          </div>
          <p className="mt-2 text-3xl font-extrabold tabular-nums text-[#103D45]">{data.metrics.pendingRequests}</p>
          <p className="mt-1 text-xs tabular-nums text-[#52606D]">
            {data.metrics.pendingProofs} transfer proofs awaiting review
          </p>
        </div>

        <div className="rounded-2xl border border-[#E5DFD2] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#52606D]">Upcoming Occupancy</span>
            <Percent className="h-5 w-5 text-[#0E7C78]" aria-hidden="true" />
          </div>
          <p className="mt-2 text-3xl font-extrabold tabular-nums text-[#103D45]">{data.metrics.occupancyPct}%</p>
          <p className="mt-1 text-xs text-[#52606D]">Across next 10 open departures</p>
        </div>
      </div>

      {/* 7-Day Real Activity Chart + Upcoming Departures */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="lg:col-span-6 rounded-2xl border border-[#E5DFD2] bg-white p-6 shadow-xs">
          <h3 className="text-base font-extrabold text-[#103D45]">Daily Bookings (Last 7 Days · Cairo)</h3>
          <div className="mt-6 flex h-44 items-end justify-between gap-3">
            {data.dailySeries.map((pt) => {
              const heightPct = Math.max(6, Math.round((pt.count / maxDayCount) * 100));
              return (
                <div key={pt.date} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-xs font-bold text-[#103D45]">{pt.count}</span>
                  <div className="flex h-32 w-full items-end">
                    <div
                      className="w-full rounded-t-lg bg-[#18A5A0] transition-all"
                      style={{ height: `${pt.count === 0 ? 4 : heightPct}%` }}
                      title={`${pt.date}: ${pt.count} bookings`}
                    />
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-[#52606D]">{pt.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="lg:col-span-6 rounded-2xl border border-[#E5DFD2] bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-[#103D45]">Upcoming Departures</h3>
            <Link href="/admin/availability" className="text-xs font-bold text-[#0E7C78] hover:underline">
              Manage Availability &rarr;
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {data.upcomingDepartures.length === 0 ? (
              <p className="text-sm text-[#52606D]">No upcoming open departures.</p>
            ) : (
              data.upcomingDepartures.slice(0, 5).map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#EFEAE0] bg-[#FAF8F4] p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <img src={d.imageUrl} alt="" className="h-10 w-14 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#103D45]">{d.tourTitle}</p>
                      <p className="text-xs text-[#52606D]">
                        <Calendar className="mr-1 inline h-3 w-3" aria-hidden="true" />
                        {d.departureDate} · {d.startTime}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-extrabold text-[#103D45]">
                    {d.bookedSeats + d.heldSeats}/{d.capacity}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Recent Bookings + Operations Alerts */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="lg:col-span-8 rounded-2xl border border-[#E5DFD2] bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-extrabold text-[#103D45]">Recent Bookings</h3>
            <Link href="/admin/bookings" className="text-xs font-bold text-[#0E7C78] hover:underline">
              View All Bookings &rarr;
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="visually-hidden">Recent bookings table</caption>
              <thead className="border-b border-[#E5DFD2] text-xs uppercase text-[#52606D]">
                <tr>
                  <th scope="col" className="pb-2.5 pr-3">Reference</th>
                  <th scope="col" className="pb-2.5 pr-3">Traveler</th>
                  <th scope="col" className="pb-2.5 pr-3">Tour</th>
                  <th scope="col" className="pb-2.5 pr-3">Status</th>
                  <th scope="col" className="pb-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1EDE4]">
                {data.recentBookings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-sm text-[#52606D]">No bookings recorded yet.</td>
                  </tr>
                ) : (
                  data.recentBookings.map((b) => (
                    <tr key={b.id}>
                      <td className="py-3 pr-3 font-mono text-xs font-bold text-[#0E7C78]">
                        <Link href={`/admin/bookings?selected=${b.id}`} className="hover:underline">{b.reference}</Link>
                      </td>
                      <td className="py-3 pr-3 font-semibold">{b.leadName}</td>
                      <td className="py-3 pr-3 text-xs text-[#52606D]">{b.tourTitle}</td>
                      <td className="py-3 pr-3"><StatusBadge status={b.status} /></td>
                      <td className="py-3 text-right font-bold">{formatMinorUnitsExact(b.grandTotalMinor, b.currency)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lg:col-span-4 rounded-2xl border border-[#E5DFD2] bg-white p-6 shadow-xs">
          <h3 className="flex items-center gap-2 text-base font-extrabold text-[#103D45]">
            <AlertTriangle className="h-4 w-4 text-[#8A6828]" aria-hidden="true" />
            Operations Alerts
          </h3>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <span>{data.metrics.pendingRequests} booking request(s) need review</span>
              <Link href="/admin/bookings?status=REQUESTED" className="font-bold text-[#0E7C78] hover:underline">Review</Link>
            </li>
            <li className="flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
              <span>{data.metrics.pendingProofs} transfer proof(s) awaiting review</span>
              <Link href="/admin/payments" className="font-bold text-[#0E7C78] hover:underline">Verify</Link>
            </li>
            <li className="flex items-center justify-between rounded-xl border border-[#E5DFD2] bg-[#FAF8F4] px-4 py-3">
              <span>{data.metrics.newInquiries} new travel inquiries</span>
              <Link href="/admin/inquiries" className="font-bold text-[#0E7C78] hover:underline">Open</Link>
            </li>
            {data.metrics.failedJobs > 0 && (
              <li className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900">
                <span>{data.metrics.failedJobs} failed background job(s)</span>
                <Link href="/admin/health" className="font-bold underline">Inspect</Link>
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
