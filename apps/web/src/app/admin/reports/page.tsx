'use client';

import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { formatMinorUnitsExact } from '@sharm/contracts';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

interface ReportPayload {
  definitions: Record<string, string>;
  byCurrency: Record<
    string,
    { bookedValueMinor: number; cashCollectedMinor: number; refundedMinor: number; netCollectedMinor: number; outstandingMinor: number }
  >;
  tourPerformance: Array<{ tourTitle: string; destination: string; bookings: number; seats: number; currency: string; bookedValueMinor: number }>;
  departureOccupancy: Array<{ id: string; tourTitle: string; departureDate: string; startTime: string; capacity: number; bookedSeats: number; heldSeats: number; occupancyPct: number }>;
}

export default function AdminReportsPage() {
  const { adminFetch, hasPerm, toast } = useAdminAuth();
  const [data, setData] = useState<ReportPayload | null>(null);

  useEffect(() => {
    adminFetch<ReportPayload>('/admin/reports')
      .then(setData)
      .catch((err) => toast(err instanceof Error ? err.message : 'Unable to load reports', 'error'));
  }, [adminFetch, toast]);

  if (!data) return <p className="text-sm text-[#52606D]">Loading financial and operational reports...</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5DFD2] bg-white p-5">
        <div>
          <h2 className="text-lg font-extrabold text-[#103D45]">Financial &amp; Occupancy Reports</h2>
          <p className="text-xs text-[#52606D]">{data.definitions.timezone}</p>
        </div>
        {hasPerm('reports:export') && (
          <a
            href="/api/v1/admin/reports/export.csv"
            className="inline-flex min-h-[42px] items-center gap-2 rounded-full bg-[#103D45] px-5 text-xs font-bold text-white hover:bg-[#0E7C78]"
          >
            <Download className="h-4 w-4" aria-hidden="true" /> Export CSV (Formula-Injection Safe)
          </a>
        )}
      </div>

      {/* Multi-currency separated financial breakdown */}
      <div className="grid gap-4 sm:grid-cols-2">
        {Object.entries(data.byCurrency).length === 0 ? (
          <div className="rounded-2xl border border-[#E5DFD2] bg-white p-6 text-sm text-[#52606D]">
            No financial activity recorded yet (all balances $0.00).
          </div>
        ) : (
          Object.entries(data.byCurrency).map(([currency, stats]) => (
            <div key={currency} className="rounded-2xl border border-[#E5DFD2] bg-white p-6 space-y-2 text-sm">
              <h3 className="text-base font-extrabold text-[#103D45]">Currency: {currency}</h3>
              <div className="flex justify-between"><span>Booked Value (Active Reservations):</span><strong>{formatMinorUnitsExact(stats.bookedValueMinor, currency)}</strong></div>
              <div className="flex justify-between"><span>Cash Collected (Verified Ledger):</span><strong className="text-emerald-800">{formatMinorUnitsExact(stats.cashCollectedMinor, currency)}</strong></div>
              <div className="flex justify-between"><span>Refunded:</span><strong className="text-rose-800">{formatMinorUnitsExact(stats.refundedMinor, currency)}</strong></div>
              <div className="flex justify-between border-t pt-2"><span>Net Collected Revenue:</span><strong className="text-[#103D45]">{formatMinorUnitsExact(stats.netCollectedMinor, currency)}</strong></div>
              <div className="flex justify-between"><span>Outstanding Uncollected Balance:</span><strong>{formatMinorUnitsExact(stats.outstandingMinor, currency)}</strong></div>
            </div>
          ))
        )}
      </div>

      {/* Tour Performance */}
      <section className="rounded-2xl border border-[#E5DFD2] bg-white p-6">
        <h3 className="mb-4 text-base font-extrabold text-[#103D45]">Tour &amp; Destination Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="visually-hidden">Tour performance report</caption>
            <thead className="border-b border-[#E5DFD2] text-xs uppercase text-[#52606D]">
              <tr>
                <th scope="col" className="py-2 pr-3">Tour</th>
                <th scope="col" className="py-2 pr-3">Destination</th>
                <th scope="col" className="py-2 pr-3">Bookings</th>
                <th scope="col" className="py-2 pr-3">Seats</th>
                <th scope="col" className="py-2 text-right">Booked Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1EDE4]">
              {data.tourPerformance.map((row, idx) => (
                <tr key={idx}>
                  <td className="py-2.5 pr-3 font-bold text-[#103D45]">{row.tourTitle}</td>
                  <td className="py-2.5 pr-3 text-xs text-[#52606D]">{row.destination}</td>
                  <td className="py-2.5 pr-3">{row.bookings}</td>
                  <td className="py-2.5 pr-3">{row.seats}</td>
                  <td className="py-2.5 text-right font-bold">{formatMinorUnitsExact(row.bookedValueMinor, row.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
