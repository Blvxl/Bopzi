import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ads = 'https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.adtrafficquality.google';

/**
 * What the browser may load. Scripts need 'unsafe-inline' for Next's own page data; everything else is pinned to
 * the sites Bopzi really uses: Supabase (sign-in), the helper on the visitor's computer, Hugging Face and jsDelivr
 * (the background remover's model and runtime), and Google (ads, only if they are switched on).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net ${ads}${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  // data: and blob: are the page's own pictures turned into files; neither can reach another website.
  `connect-src 'self' data: blob: http://127.0.0.1:47615 http://localhost:47615 ${supabase} https://huggingface.co https://*.huggingface.co https://*.hf.co https://cdn.jsdelivr.net ${ads}${dev ? ' ws: wss:' : ''}`,
  "worker-src 'self' blob:",
  `frame-src ${ads}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  // Bundle the local production server with the Windows desktop app. The website host sets BOPZI_WEB and runs `next start`.
  output: process.env.BOPZI_WEB ? undefined : 'standalone',
  // These workspace folders are not used by the running app. Excluding them keeps the desktop package lean.
  outputFileTracingExcludes: {
    '/*': ['./artifacts/**/*', './assets/**/*', './backups/**/*', './build/**/*', './docs/**/*', './release/**/*', './reports/**/*', './research_notes/**/*', './src/**/*', './tests/**/*'],
  },
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
  async redirects() {
    return [
      { source: '/video/:path*', destination: '/', permanent: false },
      { source: '/projects/video', destination: '/projects', permanent: false },
    ];
  },
};

export default nextConfig;
