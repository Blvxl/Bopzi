'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import type { ListResult, ListRow } from '@/lib/lists';
import { PUBLISHED, published } from '@/lib/source';

const compact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
const pct = (c: number) => `${c >= 0 ? '+' : ''}${Math.abs(c) >= 10 ? Math.round(c * 100).toLocaleString('en-US') : (c * 100).toFixed(1)}%`;

function Row({ row, rank, max }: { row: ListRow; rank: number; max: number }) {
  return (
    <div className="l-row">
      <span className="g-rank">{rank}</span>
      {row.icon ? <img className="g-icon" src={row.icon} alt="" width={40} height={40} loading="lazy" /> : <span className="g-icon g-initial" style={{ width: 40, height: 40 }}>{row.name.charAt(0).toUpperCase()}</span>}
      <div className="g-name"><strong title={row.name}>{row.name}</strong>{row.sub && <span>{row.sub}</span>}</div>
      <div className="g-bar" aria-hidden="true">{max > 0 && row.value > 0 && <i style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }} />}</div>
      <b className="g-num">{row.valueText ?? compact(row.value)}</b>
      <span className={`l-change${row.change == null ? ' none' : row.change < 0 ? ' down' : ''}`}>{row.change == null ? '' : pct(row.change)}</span>
    </div>
  );
}

/** One list: ranked rows, how they changed, and a note saying how the numbers were made. */
export default function ListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [list, setList] = useState<ListResult | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => fetch(PUBLISHED ? published(`lists/${slug}.json`, 60_000) : `/api/lists/${slug}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (!active) return; if (j.error) setError(j.error); else { setList(j); setError(''); } }).catch(() => active && setError('Could not load the list.'));
    void load();
    const t = setInterval(load, 60_000);
    return () => { active = false; clearInterval(t); };
  }, [slug]);
  const max = Math.max(0, ...(list?.rows.map((r) => r.value) ?? []));
  return (
    <main className="wrap">
      <Link href="/lists" className="back">← Lists</Link>
      <div className="page-head"><div><h1>{list?.title ?? '…'}</h1>{list && <p>{list.note}</p>}</div></div>
      {list?.windowHours != null && list.windowHours > 0 && <p className="l-window">Growth is measured over the last {list.windowHours < 1.5 ? 'hour' : `${list.windowHours} hours`}, as far back as Bopzi's history goes.</p>}
      <div className="g-list">
        <div className="l-head"><span /><span /><span>{list ? '' : ''}</span><span /><b>{list?.valueLabel ?? ''}</b><span>Change</span></div>
        {list?.rows.map((r, i) => <Row key={r.key} row={r} rank={i + 1} max={max} />)}
        {list && !list.rows.length && <p className="empty">Nothing here yet. This list fills in as the collector runs.</p>}
        {!list && !error && <p className="empty">Loading…</p>}
        {error && <p className="empty" role="status">{error}</p>}
      </div>
    </main>
  );
}
