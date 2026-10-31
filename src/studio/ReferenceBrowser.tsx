'use client';
import { ExternalLink, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReferenceGame } from '@/lib/thumbnail/references';

function Choice({ game, selectedId, onPick }: { game: ReferenceGame; selectedId?: number; onPick: (game: ReferenceGame) => void }) {
  return (
    <article>
      <button className="reference-choice" aria-label={`Use ${game.name} as style inspiration`} aria-pressed={game.id === selectedId} onClick={() => onPick(game)}>
        <img src={game.imageUrl} loading="lazy" alt={`${game.name} thumbnail`} />
        <span>
          <b>{game.name}</b>
          <small>{game.genre === 'Search' ? 'From Roblox search' : game.genre}{game.id === selectedId ? ' · Selected' : ''}</small>
        </span>
      </button>
      <a href={game.sourceUrl} target="_blank" rel="noreferrer">View game <ExternalLink size={11} /></a>
    </article>
  );
}

export default function ReferenceBrowser({ games, loading, error, updatedAt, selectedId, onPick, onClose, onRetry, onUploadStyle }: {
  games: ReferenceGame[]; loading: boolean; error: string; updatedAt: string;
  selectedId?: number; onPick: (game: ReferenceGame) => void; onClose: () => void; onRetry: () => void;
  onUploadStyle: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('All');
  // The curated list is a starting point. Typing a name also searches every public game on Roblox.
  const [remote, setRemote] = useState<{ for: string; games: ReferenceGame[]; state: 'loading' | 'done' | 'error'; message?: string } | null>(null);
  useEffect(() => {
    const trigger = document.activeElement;
    const modal = dialog.current;
    modal?.showModal();
    search.current?.focus();
    return () => { modal?.close(); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus(); };
  }, []);
  const term = query.trim();
  useEffect(() => {
    if (term.length < 3) { setRemote(null); return; }
    const abort = new AbortController();
    setRemote({ for: term, games: [], state: 'loading' });
    const timer = setTimeout(() => {
      fetch(`/api/thumbnail/references?q=${encodeURIComponent(term)}`, { signal: abort.signal })
        .then(async (r) => {
          // The server can answer with an error page instead of JSON, for example while it is restarting.
          const body = await r.json().catch(() => null);
          if (!r.ok || !body || !Array.isArray(body.games)) throw new Error(body?.error || 'Roblox search is unavailable right now. Try again in a moment.');
          setRemote({ for: term, games: body.games, state: 'done' });
        })
        .catch((e) => { if (!abort.signal.aborted) setRemote({ for: term, games: [], state: 'error', message: e.message || 'Roblox search failed.' }); });
    }, 450);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [term]);

  const filtered = games.filter(g => (genre === 'All' || g.genre === genre) && g.name.toLowerCase().includes(term.toLowerCase()));
  const more = remote?.for === term ? remote.games.filter(g => !games.some(c => c.id === g.id)) : [];
  const searching = remote?.for === term && remote.state === 'loading';
  return <dialog ref={dialog} className="reference-browser" aria-labelledby="reference-browser-title" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <header><div><span className="tool-eyebrow">Style inspiration</span><h2 id="reference-browser-title">Game reference library</h2></div><button aria-label="Close reference library" onClick={onClose}><X size={20}/></button></header>
    <div className="reference-browser-intro">Real Roblox thumbnails. Borrow visual direction, keep your game&apos;s identity. Search for any game by name.</div>
    <div className="reference-filters"><label><Search size={16}/><input ref={search} placeholder="Search any Roblox game…" aria-label="Search Roblox games" value={query} onChange={e => setQuery(e.target.value)}/></label><select className="finput" aria-label="Filter curated games by genre" value={genre} onChange={e => setGenre(e.target.value)}>{['All', 'Obby', 'Simulator', 'Horror', 'Roleplay', 'Action', 'Building'].map(g => <option key={g} value={g}>{g}</option>)}</select></div>
    <div className="reference-results">
      {loading && !games.length ? <p role="status">Loading Roblox thumbnails…</p> : error && !games.length && !more.length && !searching ? <div role="alert"><p>{error}</p><button className="ebtn" onClick={onRetry}>Try again</button></div> : <>
        {filtered.length > 0 && <div className="reference-library-grid">{filtered.map(g => <Choice key={g.id} game={g} selectedId={selectedId} onPick={onPick}/>)}</div>}
        {term.length >= 3 && <>
          <h3 className="reference-more">From Roblox search</h3>
          {searching ? <p role="status">Searching Roblox for &ldquo;{term}&rdquo;…</p>
            : remote?.state === 'error' ? <p role="alert">{remote.message}</p>
            : more.length ? <div className="reference-library-grid">{more.map(g => <Choice key={g.id} game={g} selectedId={selectedId} onPick={onPick}/>)}</div>
            : <p>No other games found for &ldquo;{term}&rdquo;.</p>}
        </>}
        {!filtered.length && term.length < 3 && <p>{term ? 'Keep typing to search all of Roblox.' : 'No games in this genre.'}</p>}
      </>}
    </div>
    <footer><button className="ebtn" onClick={onUploadStyle}>Upload your own style instead</button><p>The list shown first is curated, not a CTR ranking. Search covers public Roblox games. Artwork belongs to its respective creators.</p>{updatedAt && <span>Images refreshed {new Date(updatedAt).toLocaleDateString()}.</span>}</footer>
  </dialog>;
}
