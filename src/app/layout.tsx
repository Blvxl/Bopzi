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
  title: { default: SITE_NAME, template: '%s · Bopzi' },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/apple-touch-icon.png' },
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
