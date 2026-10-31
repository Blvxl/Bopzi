import type { MetadataRoute } from 'next';

// A personal tool: nothing here is for a crawler.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
