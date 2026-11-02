import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Pages are public; the API is not for crawlers.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/'] }, sitemap: `${SITE_URL}/sitemap.xml` };
}
