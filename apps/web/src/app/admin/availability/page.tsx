'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, Plus, Trash2 } from 'lucide-react';
import { StatusBadge } from '@sharm/ui';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

interface DepartureItem {
  id: string;
  tourId: string;
  departureDate: string;
  startTime: string;
  capacity: number;
  bookedSeats: number;
  heldSeats: number;
  remainingSeats: number;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  cutoffHours: number;
  adultPriceOverrideMinor: number | null;
  tour: { id: string; title: string; currency: string };
}

export default function AdminAvailabilityPage() {
  const { adminFetch, hasPerm, toast } = useAdminAuth();
  const [tours, setTours] = useState<Array<{ id: string; title: string }>>([]);
  const [tourId, setTourId] = useState('');
  const [departures, setDepartures] = useState<DepartureItem[]>([]);
  const [blackouts, setBlackouts] = useState<Array<{ id: string; date: string; reason: string; tour: { title: string } | null }>>([]);

  // Generator inputs
  const [genFrom, setGenFrom] = useState(new Date(Date.now() + 86400_000).toISOString().slice(0, 10));
  const [genTo, setGenTo] = useState(new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10));
  const [genTime, setGenTime] = useState('08:00');
  const [genCap, setGenCap] = useState(16);

  // Blackout input
  const [blackoutDate, setBlackoutDate] = useState('');
  const [blackoutReason, setBlackoutReason] = useState('');

  // Inline edits
  const [capEdits, setCapEdits] = useState<Record<string, number>>({});

  const loadAll = useCallback(async () => {
    try {
      const [tList, dList, sb] = await Promise.all([
        adminFetch<Array<{ id: string; title: string }>>('/admin/tours'),
        adminFetch<DepartureItem[]>(`/admin/availability/departures${tourId ? `?tourId=${tourId}` : ''}`),
        adminFetch<{ blackouts: Array<{ id: string; date: string; reason: string; tour: { title: string } | null }> }>(
          `/admin/availability/schedules${tourId ? `?tourId=${tourId}` : ''}`,
        ),
      ]);
      setTours(tList);
      setDepartures(dList);
      setBlackouts(sb.blackouts);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to load availability', 'error');
    }
  }, [adminFetch, tourId, toast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const targetTour = tourId || tours[0]?.id;
    if (!targetTour) return;
    try {
      const res = await adminFetch<{ createdCount: number; skippedExisting: number }>('/admin/availability/generate', {
        method: 'POST',
        body: {
          tourId: targetTour,
          fromDate: genFrom,
          toDate: genTo,
          weekdays: [1, 2, 3, 4, 5, 6, 7],
          startTime: genTime,
          capacity: genCap,
        },
      });
      toast(`Generated ${res.createdCount} new departures (${res.skippedExisting} existing kept).`, 'success');
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to generate departures', 'error');
    }
  }

  async function handleUpdateDeparture(dep: DepartureItem, patch: { capacity?: number; status?: 'OPEN' | 'CLOSED' }) {
    try {
      await adminFetch(`/admin/availability/departures/${dep.id}`, {
        method: 'PATCH',
        body: patch,
      });
      toast('Departure updated.', 'success');
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update rejected', 'error');
    }
  }

  async function handleAddBlackout(e: React.FormEvent) {
    e.preventDefault();
    if (!blackoutDate) return;
    try {
      const res = await adminFetch<{ affectedActiveBookings: number }>('/admin/availability/blackouts', {
        method: 'POST',
        body: { tourId: tourId || null, date: blackoutDate, reason: blackoutReason },
      });
      toast(
        `Blackout added.${res.affectedActiveBookings > 0 ? ` Warning: ${res.affectedActiveBookings} active booking(s) exist on this date.` : ''}`,
        'success',
      );
      setBlackoutDate('');
      setBlackoutReason('');
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add blackout', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Generate Rolling Departures */}
        {hasPerm('availability:write') && (
          <form onSubmit={handleGenerate} className="lg:col-span-7 rounded-2xl border border-[#E5DFD2] bg-white p-5 space-y-4">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-[#103D45]">
              <Calendar className="h-4 w-4 text-[#0E7C78]" aria-hidden="true" />
              Generate Rolling Departures (Africa/Cairo DST-Aware)
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label htmlFor="av-tour" className="block text-xs font-bold text-[#103D45]">Tour</label>
                <select id="av-tour" value={tourId} onChange={(e) => setTourId(e.target.value)} className="mt-1 min-h-[40px] w-full rounded-xl border bg-white px-3 text-xs">
                  <option value="">All tours (filter) / First tour for generator</option>
                  {tours.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="av-from" className="block text-xs font-bold text-[#103D45]">From</label>
                <input id="av-from" type="date" value={genFrom} onChange={(e) => setGenFrom(e.target.value)} className="mt-1 min-h-[40px] w-full rounded-xl border px-2.5 text-xs" />
              </div>
              <div>
                <label htmlFor="av-to" className="block text-xs font-bold text-[#103D45]">To</label>
                <input id="av-to" type="date" value={genTo} onChange={(e) => setGenTo(e.target.value)} className="mt-1 min-h-[40px] w-full rounded-xl border px-2.5 text-xs" />
              </div>
              <div>
                <label htmlFor="av-time" className="block text-xs font-bold text-[#103D45]">Start Time</label>
                <input id="av-time" type="time" value={genTime} onChange={(e) => setGenTime(e.target.value)} className="mt-1 min-h-[40px] w-full rounded-xl border px-2.5 text-xs" />
              </div>
              <div>
                <label htmlFor="av-cap" className="block text-xs font-bold text-[#103D45]">Capacity</label>
                <input id="av-cap" type="number" min={1} max={200} value={genCap} onChange={(e) => setGenCap(Number(e.target.value))} className="mt-1 min-h-[40px] w-full rounded-xl border px-2.5 text-xs" />
              </div>
              <div className="sm:col-span-2 flex items-end">
                <button type="submit" className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-full bg-[#0E7C78] px-4 text-xs font-bold text-white hover:bg-[#103D45]">
                  <Plus className="h-4 w-4" aria-hidden="true" /> Generate Departures
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Blackout Dates */}
        <div className="lg:col-span-5 rounded-2xl border border-[#E5DFD2] bg-white p-5 space-y-3">
          <h2 className="text-base font-extrabold text-[#103D45]">Blackout Dates</h2>
          {hasPerm('availability:write') && (
            <form onSubmit={handleAddBlackout} className="flex flex-wrap gap-2">
              <input type="date" required value={blackoutDate} onChange={(e) => setBlackoutDate(e.target.value)} className="min-h-[38px] rounded-xl border px-2.5 text-xs" />
              <input type="text" placeholder="Reason" value={blackoutReason} onChange={(e) => setBlackoutReason(e.target.value)} className="min-h-[38px] flex-1 rounded-xl border px-2.5 text-xs" />
              <button type="submit" className="min-h-[38px] rounded-xl bg-[#103D45] px-3 text-xs font-bold text-white">Block</button>
            </form>
          )}
          <ul className="max-h-36 overflow-y-auto space-y-1.5 text-xs">
            {blackouts.slice(0, 12).map((b) => (
              <li key={b.id} className="flex items-center justify-between rounded-lg bg-[#FAF8F4] px-3 py-1.5">
                <span><strong>{b.date}</strong> · {b.tour?.title || 'Global'} — {b.reason || 'Blocked'}</span>
                {hasPerm('availability:write') && (
                  <button
                    type="button"
                    aria-label={`Remove blackout ${b.date}`}
                    onClick={async () => {
                      await adminFetch(`/admin/availability/blackouts/${b.id}`, { method: 'DELETE' });
                      await loadAll();
                    }}
                    className="text-rose-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Departures Allocation Table */}
      <div className="overflow-x-auto rounded-2xl border border-[#E5DFD2] bg-white shadow-xs">
        <table className="w-full text-left text-sm">
          <caption className="visually-hidden">Departures and seat allocations</caption>
          <thead className="border-b border-[#E5DFD2] bg-[#FAF8F4] text-xs uppercase text-[#52606D]">
            <tr>
              <th scope="col" className="p-3.5">Date (Cairo)</th>
              <th scope="col" className="p-3.5">Tour</th>
              <th scope="col" className="p-3.5">Status</th>
              <th scope="col" className="p-3.5">Booked / Held / Left</th>
              <th scope="col" className="p-3.5">Capacity</th>
              <th scope="col" className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1EDE4]">
            {departures.slice(0, 60).map((d) => (
              <tr key={d.id}>
                <td className="p-3.5 font-mono text-xs font-bold">{d.departureDate} {d.startTime}</td>
                <td className="p-3.5 font-semibold text-[#103D45]">{d.tour.title}</td>
                <td className="p-3.5"><StatusBadge status={d.status} /></td>
                <td className="p-3.5 text-xs">
                  <span className="font-bold text-emerald-800">{d.bookedSeats} booked</span> ·{' '}
                  <span className="font-bold text-amber-800">{d.heldSeats} held</span> ·{' '}
                  <span className="font-bold text-[#103D45]">{d.remainingSeats} free</span>
                </td>
                <td className="p-3.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      aria-label={`Capacity for ${d.tour.title} on ${d.departureDate}`}
                      value={capEdits[d.id] ?? d.capacity}
                      onChange={(e) => setCapEdits((prev) => ({ ...prev, [d.id]: Number(e.target.value) }))}
                      className="w-16 rounded-lg border border-[#CBD5E1] px-2 py-1 text-xs"
                    />
                    {hasPerm('availability:write') && (
                      <button
                        type="button"
                        onClick={() => handleUpdateDeparture(d, { capacity: capEdits[d.id] ?? d.capacity })}
                        className="rounded-lg bg-[#103D45] px-2.5 py-1 text-xs font-bold text-white"
                      >
                        Save
                      </button>
                    )}
                  </div>
                </td>
                <td className="p-3.5 text-right">
                  {hasPerm('availability:write') && d.status !== 'CANCELLED' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateDeparture(d, { status: d.status === 'OPEN' ? 'CLOSED' : 'OPEN' })}
                      className="rounded-lg border border-[#CBD5E1] px-3 py-1 text-xs font-bold text-[#103D45]"
                    >
                      {d.status === 'OPEN' ? 'Close' : 'Reopen'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
