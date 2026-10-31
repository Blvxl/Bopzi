import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Bundle the local production server with the Windows desktop app.
  output: 'standalone',
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
      { key: 'Referrer-Policy', value: 'no-referrer' },
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
