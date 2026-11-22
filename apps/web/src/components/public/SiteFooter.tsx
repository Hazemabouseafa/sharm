import React from 'react';
import Link from 'next/link';
import { Calendar, Mail, MessageCircle, Phone } from 'lucide-react';
import { GlobalContentDocument } from '@sharm/contracts';
import { BrandLogo } from '@sharm/ui';
import type { PublicSiteContext } from './SiteHeader';

export function SiteFooter({
  global,
  site,
}: {
  global: GlobalContentDocument;
  site: PublicSiteContext;
}) {
  const cleanPhone = site.demoMode ? site.contactPhone : (site.contactPhone || '').replace(/\s*\(demo\)\s*/gi, '').trim();
  const whatsappDigits = (site.whatsappNumber || '').replace(/\D/g, '');
  const whatsappHref = whatsappDigits
    ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent('Hello Sharm Pharaoh Travel, I would like assistance planning an excursion in Egypt.')}`
    : null;

  return (
    <footer className="bg-[#103D45] text-white">
      <div className="mx-auto max-w-[1320px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-4 space-y-4">
            <Link href="/" className="inline-block" aria-label="Sharm Pharaoh Travel Home">
              <BrandLogo variant="horizontal-inverse" size="md" />
            </Link>
            <p className="max-w-sm text-sm leading-relaxed text-white/80">
              {global.footer.tagline}
            </p>
            {site.demoMode && (
              <p className="inline-flex items-center rounded-md border border-[#C9A66B]/40 bg-[#C9A66B]/15 px-2.5 py-1 text-xs font-medium text-[#F3DFB8]">
                Demo Environment — Sample Tours &amp; Illustrative Pricing
              </p>
            )}
          </div>

          <div className="md:col-span-4">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#E3C68E]">Explore</h2>
            <nav aria-label="Footer destinations and pages" className="mt-4">
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                {global.footer.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-white/85 transition hover:text-[#E3C68E]">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="md:col-span-4 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#E3C68E]">Travel Support &amp; Policies</h2>
            <ul className="space-y-2 text-sm">
              {global.footer.legalLinks.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-white/85 transition hover:text-[#E3C68E]">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>

            {(site.contactEmail || cleanPhone || whatsappHref) && (
              <div className="space-y-2 border-t border-white/15 pt-4 text-sm">
                {site.contactEmail && (
                  <a href={`mailto:${site.contactEmail}`} className="flex items-center gap-2 text-white/90 hover:text-[#E3C68E]">
                    <Mail className="h-4 w-4 text-[#C9A66B]" aria-hidden="true" />
                    {site.contactEmail}
                  </a>
                )}
                {cleanPhone && (
                  <a href={`tel:${cleanPhone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 tabular-nums text-white/90 hover:text-[#E3C68E]">
                    <Phone className="h-4 w-4 text-[#C9A66B]" aria-hidden="true" />
                    {cleanPhone}
                  </a>
                )}
                {whatsappHref && (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-[#18A5A0] px-4 py-1.5 text-sm font-bold text-[#0A292F] hover:bg-[#E3C68E]"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    Chat on WhatsApp
                  </a>
                )}
              </div>
            )}

            <div className="pt-2">
              <Link
                href="/tours"
                className="inline-flex min-h-[42px] items-center gap-2 rounded-full bg-[#18A5A0] px-5 py-2 text-sm font-bold text-[#0A292F] transition hover:bg-[#E3C68E]"
              >
                <Calendar className="h-4 w-4" aria-hidden="true" />
                Book a Trip
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/15 pt-6 text-xs text-white/70 sm:flex-row">
          <p>&copy; {new Date().getUTCFullYear()} {site.companyName || 'Sharm Pharaoh Travel'}. All rights reserved.</p>
          <p>All departure schedules operate in Egypt local time (Africa/Cairo).</p>
        </div>
      </div>
    </footer>
  );
}
