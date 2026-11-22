'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { StatusBadge } from '@sharm/ui';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

interface InquiryRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  destinationSlug: string | null;
  message: string;
  status: 'NEW' | 'IN_PROGRESS' | 'REPLIED' | 'ARCHIVED';
  internalNotes: string;
  createdAt: string;
}

export default function AdminInquiriesPage() {
  const { adminFetch, hasPerm, toast } = useAdminAuth();
  const [items, setItems] = useState<InquiryRow[]>([]);

  const load = useCallback(async () => {
    const res = await adminFetch<InquiryRow[]>('/admin/inquiries');
    setItems(res);
  }, [adminFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(id: string, status: InquiryRow['status']) {
    try {
      await adminFetch(`/admin/inquiries/${id}`, { method: 'PATCH', body: { status } });
      toast('Inquiry updated.', 'success');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  }

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <div className="rounded-2xl border border-[#E5DFD2] bg-white p-10 text-center text-sm text-[#52606D]">
          No travel inquiries submitted yet. Inquiries submitted via /contact appear here immediately.
        </div>
      ) : (
        items.map((inq) => (
          <div key={inq.id} className="rounded-2xl border border-[#E5DFD2] bg-white p-5 shadow-xs space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-extrabold text-[#103D45]">{inq.fullName}</p>
                <p className="text-xs text-[#52606D]">
                  {inq.email} {inq.phone ? `· ${inq.phone}` : ''} {inq.destinationSlug ? `· Destination: ${inq.destinationSlug}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={inq.status} />
                {hasPerm('inquiries:write') && (
                  <select
                    aria-label={`Change status for ${inq.fullName}`}
                    value={inq.status}
                    onChange={(e) => void updateStatus(inq.id, e.target.value as InquiryRow['status'])}
                    className="rounded-lg border px-2 py-1 text-xs font-bold"
                  >
                    {['NEW', 'IN_PROGRESS', 'REPLIED', 'ARCHIVED'].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <p className="rounded-xl bg-[#FAF8F4] p-3.5 text-sm text-[#334155] whitespace-pre-line">{inq.message}</p>
            <p className="text-xs text-[#52606D]">Submitted {new Date(inq.createdAt).toLocaleString()}</p>
          </div>
        ))
      )}
    </div>
  );
}
