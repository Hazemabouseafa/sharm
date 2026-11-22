'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { clientApi } from '@/lib/api';

export interface StaffProfile {
  id: string;
  email: string;
  username?: string | null;
  fullName: string;
  role: string;
  totpEnabled: boolean;
  permissions: string[];
  lastReauthAt?: string;
}

interface ToastItem {
  id: string;
  tone: 'success' | 'error' | 'info';
  message: string;
}

interface AdminAuthContextValue {
  user: StaffProfile | null;
  csrfToken: string;
  loading: boolean;
  refreshMe: () => Promise<StaffProfile | null>;
  logout: () => Promise<void>;
  hasPerm: (perm: string) => boolean;
  adminFetch: <T = unknown>(path: string, opts?: { method?: string; body?: unknown; formData?: FormData }) => Promise<T>;
  toast: (message: string, tone?: 'success' | 'error' | 'info') => void;
  toasts: ToastItem[];
  dismissToast: (id: string) => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StaffProfile | null>(null);
  const [csrfToken, setCsrfToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, tone: 'success' | 'error' | 'info' = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const res = await clientApi<{ user: StaffProfile; csrfToken: string }>('/admin/auth/me');
      setUser(res.user);
      setCsrfToken(res.csrfToken);
      return res.user;
    } catch {
      setUser(null);
      setCsrfToken('');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const adminFetch = useCallback(
    async <T = unknown,>(
      path: string,
      opts: { method?: string; body?: unknown; formData?: FormData } = {},
    ): Promise<T> => {
      return clientApi<T>(path, {
        ...opts,
        csrfToken,
      });
    },
    [csrfToken],
  );

  const logout = useCallback(async () => {
    try {
      await clientApi('/admin/auth/logout', { method: 'POST', csrfToken });
    } catch {
      // ignore
    }
    setUser(null);
    setCsrfToken('');
  }, [csrfToken]);

  const hasPerm = useCallback(
    (perm: string) => Boolean(user?.permissions?.includes(perm)),
    [user],
  );

  return (
    <AdminAuthContext.Provider
      value={{ user, csrfToken, loading, refreshMe, logout, hasPerm, adminFetch, toast, toasts, dismissToast }}
    >
      {children}
      {/* Single centralized polite toast announcer */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed right-4 bottom-4 z-50 flex max-w-md flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg ${
              t.tone === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-900'
                : t.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                  : 'border-[#E5DFD2] bg-white text-[#103D45]'
            }`}
          >
            <span>{t.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss notification"
              className="text-xs opacity-70 hover:opacity-100"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  return ctx;
}
