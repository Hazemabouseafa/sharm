'use client';

import React, { useEffect, useState } from 'react';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

interface AuditRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  actorRole: string | null;
  requestId: string | null;
  reason: string | null;
  createdAt: string;
  actor: { fullName: string; email: string } | null;
}

export default function AdminAuditLogPage() {
  const { adminFetch, toast } = useAdminAuth();
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    adminFetch<AuditRow[]>(`/admin/audit-logs${actionFilter ? `?action=${encodeURIComponent(actionFilter)}` : ''}`)
      .then(setLogs)
      .catch((err) => toast(err instanceof Error ? err.message : 'Unable to load audit logs', 'error'));
  }, [adminFetch, actionFilter, toast]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          placeholder="Filter by action (e.g. booking, cms, payments)..."
          className="min-h-[40px] w-80 rounded-xl border bg-white px-3 text-xs"
        />
        <p className="text-xs text-[#52606D]">Append-only security audit trail (sensitive secrets/tokens automatically redacted).</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#E5DFD2] bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <caption className="visually-hidden">Audit log entries</caption>
          <thead className="border-b border-[#E5DFD2] bg-[#FAF8F4] uppercase text-[#52606D]">
            <tr>
              <th scope="col" className="p-3">Timestamp (UTC)</th>
              <th scope="col" className="p-3">Actor</th>
              <th scope="col" className="p-3">Action</th>
              <th scope="col" className="p-3">Target</th>
              <th scope="col" className="p-3">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1EDE4]">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="p-3 whitespace-nowrap text-[#52606D]">{new Date(l.createdAt).toLocaleString()}</td>
                <td className="p-3">
                  <strong>{l.actor?.fullName || 'System'}</strong> ({l.actorRole || 'SYSTEM'})
                </td>
                <td className="p-3 font-mono font-bold text-[#0E7C78]">{l.action}</td>
                <td className="p-3 font-mono">{l.targetType} {l.targetId ? `#${l.targetId.slice(0, 10)}` : ''}</td>
                <td className="p-3 text-[#52606D]">{l.reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
