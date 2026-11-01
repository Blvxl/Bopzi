import type { Metadata, Viewport } from 'next';
import AppSidebar from '@/components/AppSidebar';
import AuthGate from '@/components/AuthGate';
import { inter, sora } from '@/lib/fonts';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';
import './globals.css';
import './editor.css';
import './shell.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Bopzi · Roblox thumbnail maker', template: '%s · Bopzi' },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { title: 'Bopzi · Roblox thumbnail maker', description: SITE_DESCRIPTION, siteName: SITE_NAME, type: 'website' },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: 'black-translucent' },
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = { themeColor: '#111214' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${inter.variable}`}>
      <body>
        {/* One window: the sidebar switches between the tools, the page fills the rest. */}
        <AuthGate>
          <div className="app-shell">
            <AppSidebar />
            <div className="app-main">{children}</div>
          </div>
        </AuthGate>
      </body>
    </html>
  );
}
