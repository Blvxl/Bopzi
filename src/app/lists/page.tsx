import Link from 'next/link';
import { LISTS } from '@/lib/lists';

export const metadata = { title: 'Lists' };

/** Every list Bopzi builds from what it collects. */
export default function Lists() {
  return (
    <main className="wrap">
      <div className="page-head"><div><h1>Lists</h1><p>What is rising, what is trending and who is earning, all from Bopzi's own collected data.</p></div></div>
      <div className="lists-grid">
        {LISTS.map((l) => (
          <Link key={l.slug} href={`/lists/${l.slug}`} className="list-card">
            <strong>{l.title}</strong>
            <span>{l.blurb}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
