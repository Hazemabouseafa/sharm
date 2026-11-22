'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { StatusBadge } from '@sharm/ui';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

interface HealthPayload {
  status: string;
  timestamp: string;
  services: {
    database: { ok: boolean };
    publicStorage: { ok: boolean };
    privateStorage: { ok: boolean };
    smtp: { host: string; port: number; configuredAuth: boolean };
  };
  queue: {
    counts: Record<string, number>;
    recentFailedJobs: Array<{ id: string; jobType: string; status: string; attempts: number; lastError: string | null }>;
  };
  recentEmails: Array<{ id: string; toEmail: string; templateKey: string; subject: string; status: string; createdAt: string }>;
  warnings: string[];
}

export default function AdminHealthPage() {
  const { adminFetch, hasPerm, toast } = useAdminAuth();
  const [data, setData] = useState<HealthPayload | null>(null);

  const load = useCallback(async () => {
    setData(await adminFetch<HealthPayload>('/admin/health'));
  }, [adminFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <p className="text-sm text-[#52606D]">Checking system health...</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#E5DFD2] bg-white p-5">
          <p className="text-xs font-bold uppercase text-[#52606D]">PostgreSQL</p>
          <div className="mt-2"><StatusBadge status={data.services.database.ok ? 'PUBLISHED' : 'FAILED'} label={data.services.database.ok ? 'Connected' : 'Unreachable'} /></div>
        </div>
        <div className="rounded-2xl border border-[#E5DFD2] bg-white p-5">
          <p className="text-xs font-bold uppercase text-[#52606D]">Public Storage</p>
          <div className="mt-2"><StatusBadge status={data.services.publicStorage.ok ? 'PUBLISHED' : 'FAILED'} label={data.services.publicStorage.ok ? 'Writable' : 'Error'} /></div>
        </div>
        <div className="rounded-2xl border border-[#E5DFD2] bg-white p-5">
          <p className="text-xs font-bold uppercase text-[#52606D]">Private Proofs Storage</p>
          <div className="mt-2"><StatusBadge status={data.services.privateStorage.ok ? 'PUBLISHED' : 'FAILED'} label={data.services.privateStorage.ok ? 'Writable' : 'Error'} /></div>
        </div>
        <div className="rounded-2xl border border-[#E5DFD2] bg-white p-5">
          <p className="text-xs font-bold uppercase text-[#52606D]">SMTP Transport</p>
          <p className="mt-2 font-mono text-xs font-bold">{data.services.smtp.host}:{data.services.smtp.port}</p>
        </div>
      </div>

      {data.warnings.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-xs text-amber-950 space-y-1.5">
          <h2 className="font-extrabold">Configuration Warnings</h2>
          <ul className="list-disc pl-5 space-y-1">
            {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-[#E5DFD2] bg-white p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-extrabold text-[#103D45]">Durable PostgreSQL Outbox Queue</h2>
          <div className="flex gap-2 text-xs font-bold">
            {Object.entries(data.queue.counts).map(([k, v]) => (
              <span key={k} className="rounded-full bg-[#FAF8F4] px-3 py-1 border border-[#E5DFD2]">
                {k}: {v}
              </span>
            ))}
          </div>
        </div>
        {data.queue.recentFailedJobs.length === 0 ? (
          <p className="text-xs text-[#52606D]">No failed or dead-letter jobs.</p>
        ) : (
          <ul className="space-y-2 text-xs">
            {data.queue.recentFailedJobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 p-3 text-rose-950">
                <span><strong>{j.jobType}</strong> ({j.status}, attempts: {j.attempts}) — {j.lastError}</span>
                {hasPerm('health:retry') && (
                  <button
                    type="button"
                    onClick={async () => {
                      await adminFetch(`/admin/health/jobs/${j.id}/retry`, { method: 'POST' });
                      toast('Job requeued safely.', 'success');
                      await load();
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#103D45] px-3 py-1 font-bold text-white"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-[#E5DFD2] bg-white p-5 space-y-3">
        <h2 className="text-base font-extrabold text-[#103D45]">Recent Email Deliveries</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="visually-hidden">Recent email delivery attempts</caption>
            <thead className="border-b border-[#E5DFD2] uppercase text-[#52606D]">
              <tr>
                <th scope="col" className="py-2 pr-3">Time</th>
                <th scope="col" className="py-2 pr-3">Recipient</th>
                <th scope="col" className="py-2 pr-3">Subject</th>
                <th scope="col" className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1EDE4]">
              {data.recentEmails.map((em) => (
                <tr key={em.id}>
                  <td className="py-2 pr-3 text-[#52606D]">{new Date(em.createdAt).toLocaleString()}</td>
                  <td className="py-2 pr-3 font-mono">{em.toEmail}</td>
                  <td className="py-2 pr-3 font-semibold">{em.subject}</td>
                  <td className="py-2"><StatusBadge status={em.status === 'SENT' ? 'PUBLISHED' : em.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
