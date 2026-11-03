import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
// Where the published data files live, when the site is not reading a local database.
const data = (() => { try { return process.env.NEXT_PUBLIC_DATA_URL ? new URL(process.env.NEXT_PUBLIC_DATA_URL).origin : ''; } catch { return ''; } })();

/** What the browser may load: the site itself and Supabase (sign-in). Scripts need 'unsafe-inline' for Next's own page data. */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://*.rbxcdn.com",
  `connect-src 'self' ${supabase} ${data}${dev ? ' ws: wss:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: csp },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
};

export default nextConfig;
