import Link from 'next/link';
import type { Metadata } from 'next';
import { HELP_TEXT, DONATE_URL } from '@/lib/site';
import AdSlot from '@/components/AdSlot';
import '../home.css';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Bopzi is free. Make Roblox thumbnails and icons in your browser with your own ChatGPT plan.',
  alternates: { canonical: '/pricing' },
};

export default function Pricing() {
  return <div className="home"><main>
    <section className="home-hero" aria-labelledby="pricing-title">
      <h1 id="pricing-title">Bopzi is <em>free.</em></h1>
      <p>Connect your own ChatGPT plan for AI images with a small helper that runs on your computer. Everything else in the editor, which runs in your browser, costs nothing.</p>
    </section>

    <section className="home-pricing" aria-label="Plan">
      <div className="home-price-card">
        <strong>Free</strong>
        <ul><li>Full thumbnail and icon editor in your browser</li><li>AI images use your own ChatGPT plan, through a small helper you run on your computer</li><li>Export your work any time</li></ul>
        <Link href="/studio">Get started</Link>
      </div>
      <p className="home-pricing-note">Questions? {HELP_TEXT}.</p>
    </section>

    <AdSlot />

    <footer className="home-footer"><div className="home-legal"><p>Bopzi is independent and not affiliated with or endorsed by Roblox Corporation or OpenAI. Roblox is a trademark of Roblox Corporation.</p></div><nav aria-label="Legal and privacy">{DONATE_URL && <a href={DONATE_URL} target="_blank" rel="noopener noreferrer" className="home-support">Support Bopzi</a>}<Link href="/">Home</Link><Link href="/license">Licensing</Link><Link href="/about">Privacy &amp; usage</Link></nav></footer>
  </main></div>;
}
