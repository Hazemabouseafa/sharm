import { GlobalContentDocument, PageContentDocument } from '@sharm/contracts';
import { serverApiGet } from './api';
import type { PublicSiteContext } from '@/components/public/SiteHeader';
import type { PublicDestinationSummary, PublicTourSummary } from '@/components/cms/SharedBlockRenderer';

export interface PublicGlobalPayload {
  global: GlobalContentDocument;
  publishedRevisionNumber: number;
  site: PublicSiteContext;
}

const FALLBACK_GLOBAL: GlobalContentDocument = {
  schemaVersion: 1,
  announcementBar: { enabled: false, text: '' },
  header: {
    navLinks: [
      { label: 'Home', href: '/' },
      { label: 'Tours', href: '/tours' },
      { label: 'Cairo', href: '/destinations/cairo' },
      { label: 'Sharm El Sheikh', href: '/destinations/sharm-el-sheikh' },
      { label: 'Marsa Alam', href: '/destinations/marsa-alam' },
      { label: 'Hurghada', href: '/destinations/hurghada' },
      { label: 'Luxor & Aswan', href: '/destinations/luxor-aswan' },
      { label: 'Contact', href: '/contact' },
    ],
    ctaLabel: 'Book a Trip',
    ctaHref: '/tours',
  },
  footer: {
    tagline: 'From the wonders of the Red Sea to the timeless beauty of the Pharaohs.',
    links: [
      { label: 'Home', href: '/' },
      { label: 'Tours', href: '/tours' },
      { label: 'Cairo', href: '/destinations/cairo' },
      { label: 'Sharm El Sheikh', href: '/destinations/sharm-el-sheikh' },
      { label: 'Marsa Alam', href: '/destinations/marsa-alam' },
      { label: 'Hurghada', href: '/destinations/hurghada' },
      { label: 'Luxor & Aswan', href: '/destinations/luxor-aswan' },
      { label: 'Contact', href: '/contact' },
    ],
    legalLinks: [
      { label: 'About Us', href: '/p/about' },
      { label: 'Privacy Policy', href: '/p/privacy' },
      { label: 'Terms of Service', href: '/p/terms' },
      { label: 'Booking & Cancellation Policy', href: '/p/booking-policy' },
      { label: 'Manage Booking', href: '/booking/manage' },
    ],
  },
  theme: {
    petrolHex: '#103D45',
    turquoiseHex: '#18A5A0',
    goldHex: '#C9A66B',
    ivoryHex: '#F7F5EF',
    fontPreset: 'manrope',
  },
};

const FALLBACK_SITE: PublicSiteContext = {
  companyName: 'Sharm Pharaoh Travel',
  contactEmail: '',
  contactPhone: '',
  whatsappNumber: '',
  addressText: '',
  mapEmbedUrl: '',
  socials: {},
  maintenanceBannerEnabled: false,
  maintenanceBannerText: '',
  demoMode: false,
};

export async function loadPublicGlobal(): Promise<PublicGlobalPayload> {
  try {
    const res = await serverApiGet<{ global: GlobalContentDocument | null; publishedRevisionNumber: number; site: PublicSiteContext }>(
      '/public/cms/global',
      { tags: ['cms:global'], revalidate: 300 },
    );
    return {
      global: res.global ?? FALLBACK_GLOBAL,
      publishedRevisionNumber: res.publishedRevisionNumber ?? 1,
      site: res.site ?? FALLBACK_SITE,
    };
  } catch {
    return { global: FALLBACK_GLOBAL, publishedRevisionNumber: 1, site: FALLBACK_SITE };
  }
}

export async function loadPublishedPage(slug: string) {
  return serverApiGet<{
    redirect?: { toPath: string; statusCode: number };
    page?: {
      id: string;
      slug: string;
      kind: string;
      title: string;
      publishedRevisionId: string;
      revisionNumber: number;
      content: PageContentDocument;
    };
  }>(`/public/cms/page?slug=${encodeURIComponent(slug)}`, {
    tags: ['cms:global', `cms:page:${slug}`],
    revalidate: 300,
  });
}

export async function loadPublicCatalogContext() {
  const [destinations, categories, toursRes] = await Promise.all([
    serverApiGet<PublicDestinationSummary[]>('/public/destinations', { tags: ['destinations'], revalidate: 300 }).catch(() => []),
    serverApiGet<Array<{ slug: string; name: string }>>('/public/categories', { tags: ['tours'], revalidate: 300 }).catch(() => []),
    serverApiGet<{ items: PublicTourSummary[] }>('/public/tours?limit=48', { tags: ['tours'], revalidate: 300 }).catch(() => ({ items: [] })),
  ]);
  return { destinations, categories, tours: toursRes.items };
}
