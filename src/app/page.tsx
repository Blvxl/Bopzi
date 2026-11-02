import { Mark } from '@/components/Logo';
import { SITE_DESCRIPTION, SITE_TAGLINE } from '@/lib/site';

/** Placeholder while the new Bopzi is built: the collector and the first live pages come next. */
export default function Home() {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '2rem', textAlign: 'center' }}>
      <div style={{ maxWidth: 560 }}>
        <Mark size={56} className="text-ivory" />
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700, margin: '1.25rem 0 0.5rem' }}>{SITE_TAGLINE}</h1>
        <p style={{ color: 'var(--color-ivory-dim)', lineHeight: 1.6 }}>{SITE_DESCRIPTION}</p>
        <p style={{ marginTop: '1.5rem', color: 'var(--color-signal)', fontWeight: 600 }}>Being rebuilt. Back soon.</p>
      </div>
    </main>
  );
}
