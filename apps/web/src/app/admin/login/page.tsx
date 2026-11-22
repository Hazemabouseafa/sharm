'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { BrandLogo } from '@sharm/ui';
import { clientApi } from '@/lib/api';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';
import { AdminLanguageToggle } from '@/components/admin/AdminLocaleContext';

export default function AdminLoginPage() {
  const router = useRouter();
  const { refreshMe } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [requires2fa, setRequires2fa] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await clientApi<{ requiresTwoFactor?: boolean; user?: unknown }>('/admin/auth/login', {
        method: 'POST',
        body: {
          email,
          password,
          ...(requires2fa && !useRecovery ? { totpCode } : {}),
          ...(requires2fa && useRecovery ? { recoveryCode } : {}),
        },
      });
      if (res.requiresTwoFactor) {
        setRequires2fa(true);
        return;
      }
      await refreshMe();
      router.replace('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await clientApi('/admin/auth/password-reset/request', {
        method: 'POST',
        body: { email },
      });
      setResetSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to request password reset');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#103D45] px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white p-8 shadow-2xl">
        <div className="mb-2 flex justify-end">
          <AdminLanguageToggle />
        </div>
        <div className="flex flex-col items-center text-center">
          <BrandLogo variant="stacked" size="md" />
          <h1 className="mt-5 text-2xl font-extrabold text-[#103D45]">
            {resetMode ? 'Reset Staff Password' : 'Staff Admin Sign In'}
          </h1>
          <p className="mt-1 text-xs text-[#52606D]">
            Authorized personnel only · HttpOnly server-side sessions
          </p>
        </div>

        {error && (
          <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
            {error}
          </div>
        )}

        {resetMode ? (
          resetSent ? (
            <div role="status" className="mt-6 space-y-4 text-center text-sm text-emerald-950">
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                If an active staff account matches that email, a time-limited password reset link has been queued.
              </p>
              <button type="button" onClick={() => { setResetMode(false); setResetSent(false); }} className="font-bold text-[#0E7C78] underline">
                Return to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleRequestReset} className="mt-6 space-y-4">
              <div>
                <label htmlFor="reset-email" className="block text-sm font-bold text-[#103D45]">Username or Staff Email</label>
                <input
                  id="reset-email"
                  type="text"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#CBD5E1] px-4 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[48px] w-full rounded-full bg-[#0E7C78] font-bold text-white hover:bg-[#103D45]"
              >
                {submitting ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button type="button" onClick={() => setResetMode(false)} className="w-full text-center text-xs font-semibold text-[#52606D] hover:underline">
                Back to sign in
              </button>
            </form>
          )
        ) : (
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label htmlFor="staff-email" className="block text-sm font-bold text-[#103D45]">Username or Email</label>
              <input
                id="staff-email"
                name="email"
                type="text"
                required
                autoComplete="username"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="owner"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#CBD5E1] px-4 text-sm text-[#103D45]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="staff-password" className="block text-sm font-bold text-[#103D45]">Password</label>
                <button
                  type="button"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0E7C78]"
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                id="staff-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#CBD5E1] px-4 text-sm text-[#103D45]"
              />
            </div>

            {requires2fa && (
              <div className="rounded-xl border border-[#C9A66B] bg-[#FAF8F4] p-4 space-y-3">
                <label htmlFor="staff-2fa" className="block text-sm font-bold text-[#103D45]">
                  {useRecovery ? 'Single-Use Recovery Code' : 'Authenticator 6-Digit Code'}
                </label>
                <input
                  id="staff-2fa"
                  type="text"
                  required
                  inputMode={useRecovery ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  value={useRecovery ? recoveryCode : totpCode}
                  onChange={(e) => (useRecovery ? setRecoveryCode(e.target.value) : setTotpCode(e.target.value))}
                  placeholder={useRecovery ? 'Enter recovery code' : '123456'}
                  className="min-h-[48px] w-full rounded-xl border border-[#CBD5E1] bg-white px-4 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setUseRecovery((v) => !v)}
                  className="text-xs font-semibold text-[#0E7C78] underline"
                >
                  {useRecovery ? 'Use authenticator app code instead' : 'Use a single-use recovery code'}
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#103D45] font-bold text-white transition hover:bg-[#0E7C78] disabled:opacity-60"
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
              {submitting ? 'Signing In...' : requires2fa ? 'Verify & Sign In' : 'Sign In'}
            </button>

            <div className="flex items-center justify-between pt-2 text-xs">
              <button type="button" onClick={() => setResetMode(true)} className="font-semibold text-[#0E7C78] hover:underline">
                Forgot password?
              </button>
              <Link href="/" className="font-semibold text-[#52606D] hover:underline">
                &larr; Return to website
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
