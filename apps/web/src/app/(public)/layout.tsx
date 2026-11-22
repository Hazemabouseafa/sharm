import React from 'react';
import { SiteHeader } from '@/components/public/SiteHeader';
import { SiteFooter } from '@/components/public/SiteFooter';
import { PublicLanguageProvider } from '@/components/public/PublicLanguageContext';
import { loadPublicGlobal } from '@/lib/public-data';

export const dynamic = 'force-dynamic';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const { global, site } = await loadPublicGlobal();

  return (
    <PublicLanguageProvider>
      <div className="flex min-h-screen flex-col bg-[#F7F5EF]">
        <SiteHeader global={global} site={site} />
        <main className="flex-1">{children}</main>
        <SiteFooter global={global} site={site} />
      </div>
    </PublicLanguageProvider>
  );
}
