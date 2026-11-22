import type { MetadataRoute } from 'next';
import { serverApiGet } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  try {
    const entries = await serverApiGet<Array<{ path: string; lastModified: string }>>('/public/cms/sitemap', {
      noStore: true,
    });
    return entries.map((e) => ({
      url: `${base}${e.path}`,
      lastModified: new Date(e.lastModified),
    }));
  } catch {
    return [
      { url: `${base}/`, lastModified: new Date() },
      { url: `${base}/tours`, lastModified: new Date() },
      { url: `${base}/contact`, lastModified: new Date() },
    ];
  }
}
