'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BrandLogo } from '@sharm/ui';
import { clientApi } from '@/lib/api';

function ResetPasswordInner() {
  const sp = useSearchParams();
  const token = sp.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await clientApi('/admin/auth/password-reset/confirm', {
        method: 'POST',
        body: { token, newPassword },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#103D45] px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex flex-col items-center">
          <BrandLogo variant="stacked" size="sm" />
          <h1 className="mt-4 text-xl font-extrabold text-[#103D45]">Choose a New Staff Password</h1>
        </div>
        {error && <div role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-900">{error}</div>}
        {done ? (
          <div className="mt-6 space-y-4 text-center text-sm">
            <p className="rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-950">
              Your password has been updated and all prior sessions were revoked.
            </p>
            <Link href="/admin/login" className="inline-flex min-h-[44px] items-center rounded-full bg-[#103D45] px-6 font-bold text-white">
              Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="new-pwd" className="block text-sm font-bold text-[#103D45]">New Password</label>
              <span id="pwd-hint" className="text-xs text-[#52606D]">Minimum 12 characters.</span>
              <input
                id="new-pwd"
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
                aria-describedby="pwd-hint"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#CBD5E1] px-4 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !token}
              className="min-h-[48px] w-full rounded-full bg-[#0E7C78] font-bold text-white disabled:opacity-50"
            >
              {submitting ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AdminResetPasswordPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-white">Loading...</div>}>
      <ResetPasswordInner />
    </Suspense>
  );
}
