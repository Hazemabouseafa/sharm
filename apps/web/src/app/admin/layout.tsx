import React from 'react';
import type { Metadata } from 'next';
import { AdminAuthProvider } from '@/components/admin/AdminAuthContext';
import { AdminLocaleProvider } from '@/components/admin/AdminLocaleContext';
import { AdminShell } from '@/components/admin/AdminShell';

export const metadata: Metadata = {
  title: 'Admin Dashboard | Sharm Pharaoh Travel',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminLocaleProvider>
      <AdminAuthProvider>
        <AdminShell>{children}</AdminShell>
      </AdminAuthProvider>
    </AdminLocaleProvider>
  );
}
