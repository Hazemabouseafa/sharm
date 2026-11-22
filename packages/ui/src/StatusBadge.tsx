import React from 'react';

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const styles: Record<string, string> = {
    CONFIRMED: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    PAID: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    PUBLISHED: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    OPEN: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    VERIFIED: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    COMPLETED: 'bg-teal-50 text-teal-900 border-teal-200',
    REQUESTED: 'bg-amber-50 text-amber-900 border-amber-200',
    HELD: 'bg-amber-50 text-amber-900 border-amber-200',
    PENDING: 'bg-amber-50 text-amber-900 border-amber-200',
    PENDING_REVIEW: 'bg-amber-50 text-amber-900 border-amber-200',
    PARTIALLY_PAID: 'bg-sky-50 text-sky-900 border-sky-200',
    DRAFT: 'bg-slate-100 text-slate-800 border-slate-200',
    UNPAID: 'bg-slate-100 text-slate-800 border-slate-200',
    CANCELLED: 'bg-rose-50 text-rose-900 border-rose-200',
    EXPIRED: 'bg-rose-50 text-rose-900 border-rose-200',
    FAILED: 'bg-rose-50 text-rose-900 border-rose-200',
    REJECTED: 'bg-rose-50 text-rose-900 border-rose-200',
    CLOSED: 'bg-slate-200 text-slate-800 border-slate-300',
    ARCHIVED: 'bg-slate-200 text-slate-700 border-slate-300',
    REFUNDED: 'bg-purple-50 text-purple-900 border-purple-200',
    PARTIALLY_REFUNDED: 'bg-purple-50 text-purple-900 border-purple-200',
  };

  const cls = styles[status] ?? 'bg-slate-100 text-slate-800 border-slate-200';
  const text = label || status.replace(/_/g, ' ');

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {text}
    </span>
  );
}
