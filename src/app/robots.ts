import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// The marketing pages are public; the tool behind them is not for crawlers.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/studio', '/projects', '/account', '/video'] }, sitemap: `${SITE_URL}/sitemap.xml` };
}
