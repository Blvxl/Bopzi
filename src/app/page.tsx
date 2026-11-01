import Link from 'next/link';
import type { Metadata } from 'next';
import { DONATE_URL, SITE_DESCRIPTION, SITE_URL } from '@/lib/site';
import AdSlot from '@/components/AdSlot';
import './home.css';
import HomeShowcase from './HomeShowcase';

export const metadata: Metadata = {
  title: { absolute: 'Bopzi · Roblox thumbnail maker' },
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
};

// Tells search engines what Bopzi is. The text is fixed, and "<" is escaped so it can never close the tag.
const STRUCTURED = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Bopzi',
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: 'DesignApplication',
  operatingSystem: 'Any (web browser)',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
}).replace(/</g, String.fromCharCode(92) + 'u003c');

const FAQ = [
  { q: 'Do I install anything?', a: 'The editor runs in your browser, nothing to install. AI images currently use a small helper that runs on your computer and connects your own ChatGPT plan.' },
  { q: 'What do I need?', a: 'A Bopzi account. For AI images, connect your own ChatGPT plan.' },
  { q: 'What does it cost?', a: 'Bopzi is free. AI images count against your own ChatGPT plan.' },
  { q: 'Can I use it without AI?', a: 'Yes. A blank canvas, your own screenshots and every manual tool work without generating anything.' },
  { q: 'Where do my projects go?', a: 'They stay in this browser. Prompts and reference images are sent to OpenAI only when you generate. Export anything you want to keep.' },
];

export default function Home() {
  return <div className="home"><main>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: STRUCTURED }} />
    <HomeShowcase />

    <section className="home-faq" aria-labelledby="faq-title">
      <h2 id="faq-title">Good to know.</h2>
      <div>{FAQ.map(f => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
    </section>

    <AdSlot />

    <footer className="home-footer"><div className="home-legal"><p>Bopzi is independent and not affiliated with or endorsed by Roblox Corporation or OpenAI. Roblox is a trademark of Roblox Corporation.</p><p>Use only content you have the rights or permission to use.</p></div><nav aria-label="Legal and privacy">{DONATE_URL && <a href={DONATE_URL} target="_blank" rel="noopener noreferrer" className="home-support">Support Bopzi</a>}<Link href="/pricing">Pricing</Link><Link href="/license">Licensing</Link><Link href="/about">Privacy &amp; usage</Link></nav></footer>
  </main></div>;
}
