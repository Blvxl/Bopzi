import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dbPath } from '@/lib/data';
import { eventsAfter, lastEventId } from '@/lib/pulse';
import type { TotalRow } from '@/lib/series';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHECK_MS = 2_000;
const BEAT_MS = 15_000;

/**
 * A live connection (Server-Sent Events). The page connects once and every new total and every new feed event is pushed
 * the moment the collector saves it, instead of the page asking again every half minute and swapping everything at once.
 * `?since=<ts>&event=<id>` says what the page already has, so nothing is missed or sent twice across a reconnect.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const file = dbPath();
  if (!existsSync(file)) return new Response('No collection yet.', { status: 404 });

  const enc = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let beat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => { if (!closed) controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); };
      const stop = () => { if (closed) return; closed = true; clearTimeout(timer); clearInterval(beat); try { controller.close(); } catch { /* already closed */ } };
      req.signal.addEventListener('abort', stop);

      let sinceTs = url.searchParams.get('since') ?? '';
      let sinceEvent = Number(url.searchParams.get('event')) || -1;

      const check = async () => {
        if (closed) return;
        let db: DatabaseSync | undefined;
        try {
          db = new DatabaseSync(file, { readOnly: true });
          if (sinceEvent < 0) sinceEvent = lastEventId(db); // a page that did not say what it has starts from now
          const hasAdded = (db.prepare('PRAGMA table_info(totals)').all() as { name: string }[]).some((c) => c.name === 'added');
          if (!sinceTs) sinceTs = (db.prepare('SELECT MAX(ts) AS t FROM totals').get() as { t: string | null }).t ?? '';
          const rows = db.prepare(hasAdded ? 'SELECT ts, players, games, added FROM totals WHERE ts > ? ORDER BY ts' : 'SELECT ts, players, games, NULL AS added FROM totals WHERE ts > ? ORDER BY ts').all(sinceTs) as TotalRow[];
          for (const r of rows) { send('live', r); sinceTs = r.ts; }
          const events = await eventsAfter(db, sinceEvent);
          if (events.length) { send('pulse', events); sinceEvent = Math.max(...events.map((e) => e.id)); }
        } catch { /* the next check tries again */ } finally { db?.close(); }
        if (!closed) timer = setTimeout(check, CHECK_MS);
      };

      send('hello', { every: CHECK_MS });
      void check();
      // A comment line every few seconds keeps proxies from closing a quiet connection.
      beat = setInterval(() => { if (!closed) controller.enqueue(enc.encode(': beat\n\n')); }, BEAT_MS);
    },
    cancel() { closed = true; clearTimeout(timer); clearInterval(beat); },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
