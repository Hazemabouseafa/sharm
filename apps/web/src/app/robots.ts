import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const isStaging = process.env.NODE_ENV !== 'production' || process.env.DEMO_MODE === 'true';

  if (isStaging) {
    return {
      rules: { userAgent: '*', disallow: '/' },
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/checkout', '/booking', '/preview', '/api'],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
