'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  BarChart3,
  BookOpen,
  Calendar,
  Compass,
  CreditCard,
  FileText,
  FolderTree,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Paintbrush,
  Search,
  Settings,
  ShieldCheck,
  Tag,
  Users,
  UserCog,
} from 'lucide-react';
import { BrandLogo, MobileNavDrawer } from '@sharm/ui';
import { useAdminAuth } from './AdminAuthContext';
import { AdminLanguageToggle } from './AdminLocaleContext';

interface NavEntry {
  href: string;
  label: string;
  perm: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ADMIN_NAV: NavEntry[] = [
  { href: '/admin', label: 'Overview', perm: 'overview:read', icon: LayoutDashboard },
  { href: '/admin/bookings', label: 'Bookings', perm: 'bookings:read', icon: BookOpen },
  { href: '/admin/availability', label: 'Availability', perm: 'availability:read', icon: Calendar },
  { href: '/admin/tours', label: 'Tours', perm: 'tours:read', icon: Compass },
  { href: '/admin/destinations', label: 'Destinations', perm: 'destinations:read', icon: MapPin },
  { href: '/admin/taxonomy', label: 'Categories & Policies', perm: 'taxonomy:read', icon: FolderTree },
  { href: '/admin/content', label: 'Pages & Menus', perm: 'cms:read', icon: FileText },
  { href: '/admin/live-editor', label: 'Live Editor', perm: 'cms:read', icon: Paintbrush },
  { href: '/admin/media', label: 'Media', perm: 'media:read', icon: ImageIcon },
  { href: '/admin/customers', label: 'Customers', perm: 'customers:read', icon: Users },
  { href: '/admin/inquiries', label: 'Inquiries', perm: 'inquiries:read', icon: Inbox },
  { href: '/admin/promotions', label: 'Promotions', perm: 'promotions:read', icon: Tag },
  { href: '/admin/payments', label: 'Payments', perm: 'payments:read', icon: CreditCard },
  { href: '/admin/reports', label: 'Reports', perm: 'reports:read', icon: BarChart3 },
  { href: '/admin/team', label: 'Team & 2FA', perm: 'team:read', icon: UserCog },
  { href: '/admin/settings', label: 'Settings', perm: 'settings:read', icon: Settings },
  { href: '/admin/audit-log', label: 'Audit Log', perm: 'audit:read', icon: ShieldCheck },
  { href: '/admin/health', label: 'System Health', perm: 'health:read', icon: Activity },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, hasPerm, logout } = useAdminAuth();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  const isAuthPage = pathname === '/admin/login' || pathname === '/admin/reset-password';

  useEffect(() => {
    if (!loading && !user && !isAuthPage) {
      router.replace('/admin/login');
    }
  }, [loading, user, isAuthPage, router]);

  if (isAuthPage) {
    return <>{children}</>;
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F5EF] text-sm font-semibold text-[#103D45]">
        Verifying staff session...
      </div>
    );
  }

  const visibleNav = ADMIN_NAV.filter((item) => hasPerm(item.perm));
  const currentTitle = visibleNav.find((n) => (n.href === '/admin' ? pathname === '/admin' : pathname.startsWith(n.href)))?.label ?? 'Admin';
  const isFullWidthEditor = pathname.startsWith('/admin/live-editor');

  const navList = (onPick?: () => void) => (
    <ul className="space-y-1">
      {visibleNav.map((item) => {
        const Icon = item.icon;
        const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onPick}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-[42px] items-center gap-3 rounded-xl px-3.5 text-sm font-semibold transition ${
                active
                  ? 'bg-[#18A5A0] text-[#0A292F] shadow-xs'
                  : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  function handleQuickSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!globalSearch.trim()) return;
    router.push(`/admin/bookings?q=${encodeURIComponent(globalSearch.trim())}`);
  }

  return (
    <div className="flex min-h-screen bg-[#F7F5EF] text-[#103D45]">
      {/* Desktop Deep Petrol Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col bg-[#103D45] text-white">
        <div className="border-b border-white/10 px-4 py-4">
          <Link href="/admin" aria-label="Sharm Pharaoh Admin Home">
            <BrandLogo variant="horizontal-inverse" size="sm" />
          </Link>
        </div>
        <nav aria-label="Admin sections" className="flex-1 overflow-y-auto px-3 py-4">
          {navList()}
        </nav>
        <div className="border-t border-white/10 p-4 text-xs">
          <p className="font-bold text-white truncate">{user.fullName}</p>
          <p className="text-[#E3C68E]">{user.role.replace(/_/g, ' ')}</p>
          <div className="mt-3 flex items-center gap-2">
            <Link href="/" className="flex-1 rounded-lg border border-white/25 py-1.5 text-center font-semibold text-white hover:bg-white/10">
              View Site
            </Link>
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.push('/admin/login');
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 font-semibold text-white hover:bg-rose-700"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-[#E5DFD2] bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenu(true)}
              aria-label="Open admin menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#D8D1C2] lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#52606D]">
                Admin / {currentTitle}
              </p>
              <h1 className="text-lg font-extrabold text-[#103D45]">{currentTitle}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <form onSubmit={handleQuickSearch} className="hidden sm:flex items-center rounded-full border border-[#CBD5E1] bg-[#FAF8F4] px-3 py-1">
              <Search className="h-4 w-4 text-[#52606D]" aria-hidden="true" />
              <label htmlFor="admin-global-search" className="visually-hidden">Search bookings</label>
              <input
                id="admin-global-search"
                type="search"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search booking ref, guest..."
                className="w-48 bg-transparent px-2 text-xs text-[#103D45] focus:outline-none"
              />
            </form>
            <AdminLanguageToggle />
            <span className="rounded-full bg-[#EFFAF9] border border-[#18A5A0]/40 px-3 py-1 text-xs font-bold text-[#103D45]">
              {user.role.replace(/_/g, ' ')}
            </span>
          </div>
        </header>

        <main className={isFullWidthEditor ? 'flex-1 overflow-hidden' : 'flex-1 p-4 sm:p-6 lg:p-8'}>
          {children}
        </main>
      </div>

      <MobileNavDrawer open={mobileMenu} onClose={() => setMobileMenu(false)} title="Admin Menu">
        {navList(() => setMobileMenu(false))}
      </MobileNavDrawer>
    </div>
  );
}
