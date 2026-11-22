'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, Menu } from 'lucide-react';
import { GlobalContentDocument } from '@sharm/contracts';
import { BrandLogo, MobileNavDrawer } from '@sharm/ui';
import { LanguageSwitcher } from './LanguageSwitcher';

export interface PublicSiteContext {
  companyName: string;
  contactEmail: string;
  contactPhone: string;
  whatsappNumber: string;
  addressText: string;
  mapEmbedUrl: string;
  socials: Record<string, string>;
  maintenanceBannerEnabled: boolean;
  maintenanceBannerText: string;
  demoMode: boolean;
}

export function SiteHeader({
  global,
  site,
}: {
  global: GlobalContentDocument;
  site: PublicSiteContext;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#E5DFD2] bg-[#F7F5EF]/95 backdrop-blur-md">
      <a
        href="#main-content"
        className="visually-hidden fixed top-3 left-3 z-50 rounded-lg bg-[#103D45] px-4 py-2 text-sm font-semibold text-white shadow-lg"
      >
        Skip to main content
      </a>

      {site.maintenanceBannerEnabled && site.maintenanceBannerText && (
        <div className="bg-amber-900 px-4 py-2 text-center text-xs font-medium text-amber-50">
          {site.maintenanceBannerText}
        </div>
      )}

      {global.announcementBar?.enabled && global.announcementBar.text && (
        <div className="bg-[#103D45] px-4 py-2 text-center text-xs font-medium text-white">
          {global.announcementBar.href ? (
            <Link href={global.announcementBar.href} className="underline decoration-[#C9A66B] underline-offset-2 hover:text-[#E3C68E]">
              {global.announcementBar.text}
            </Link>
          ) : (
            <span>{global.announcementBar.text}</span>
          )}
        </div>
      )}

      <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="shrink-0 rounded-lg py-0.5" aria-label="Sharm Pharaoh Travel Home">
          <BrandLogo variant="horizontal" size="md" />
        </Link>

        <nav aria-label="Primary" className="hidden xl:flex items-center gap-5">
          <ul className="flex items-center gap-5">
            {global.header.navLinks.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`relative whitespace-nowrap py-2 text-[14px] font-semibold transition-colors ${
                      active
                        ? 'text-[#103D45] after:absolute after:inset-x-0 after:bottom-0 after:h-[2.5px] after:rounded-full after:bg-[#C9A66B]'
                        : 'text-[#334155] hover:text-[#0E7C78]'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Compact tablet nav (1024px–1279px) preventing any clipped links */}
        <nav aria-label="Primary compact" className="hidden lg:flex xl:hidden items-center gap-3.5">
          <ul className="flex items-center gap-3.5">
            {global.header.navLinks.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`relative whitespace-nowrap py-1.5 text-[12.5px] font-semibold transition-colors ${
                      active
                        ? 'text-[#103D45] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[#C9A66B]'
                        : 'text-[#334155] hover:text-[#0E7C78]'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <LanguageSwitcher variant="header" />

          <Link
            href={global.header.ctaHref || '/tours'}
            className="hidden sm:inline-flex min-h-[42px] items-center gap-2 rounded-full bg-[#0E7C78] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#103D45]"
          >
            <Calendar className="h-4 w-4" aria-hidden="true" />
            <span className="whitespace-nowrap">{global.header.ctaLabel || 'Book a Trip'}</span>
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#D8D1C2] bg-white text-[#103D45] hover:bg-[#EFEAE0] lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <MobileNavDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} title="Sharm Pharaoh Travel">
        <div className="mb-5">
          <BrandLogo variant="horizontal-inverse" size="sm" />
        </div>
        <LanguageSwitcher variant="drawer" />
        <ul className="space-y-1.5">
          {global.header.navLinks.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[48px] items-center rounded-xl px-4 text-base font-semibold transition ${
                    active ? 'bg-[#18A5A0] text-white' : 'text-white/90 hover:bg-white/10'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 border-t border-white/15 pt-5">
          <Link
            href={global.header.ctaHref || '/tours'}
            onClick={() => setMobileOpen(false)}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#C9A66B] px-5 font-bold text-[#103D45]"
          >
            <Calendar className="h-4 w-4" aria-hidden="true" />
            {global.header.ctaLabel || 'Book a Trip'}
          </Link>
          <Link
            href="/booking/manage"
            onClick={() => setMobileOpen(false)}
            className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-full border border-white/30 px-4 text-sm font-semibold text-white hover:bg-white/10"
          >
            Manage My Booking
          </Link>
        </div>
      </MobileNavDrawer>
    </header>
  );
}
