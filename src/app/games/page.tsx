'use client';

import { Search } from 'lucide-react';
import { useState } from 'react';
import { GameRow } from '@/components/GameParts';
import { useOverview } from '@/components/useOverview';

/** Every busy game Bopzi tracks, most players first. */
export default function Games() {
  const data = useOverview();
  const [query, setQuery] = useState('');
  const all = data?.top ?? [];
  const shown = all.map((g, i) => ({ g, rank: i + 1 })).filter(({ g }) => g.name.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <main className="wrap">
      <div className="page-head">
        <div><h1>Games</h1><p>The busiest experiences at the last collection.</p></div>
        <label className="search"><Search size={16} aria-hidden="true" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search games" aria-label="Search games" /></label>
      </div>
      <div className="g-list">
        {shown.map(({ g, rank }) => <GameRow key={g.id} game={g} rank={rank} max={all[0]?.playing ?? 1} />)}
        {!shown.length && <p className="empty">{data ? 'No games match.' : 'Loading…'}</p>}
      </div>
    </main>
  );
}
