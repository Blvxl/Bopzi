// One-off: builds feed events for the time before the collector started recording them, from the player counts it already saved.
// Milestones, updates, surges, crashes and update impact. A "new high" needs a known best, a comeback needs a day of quiet,
// and a forecast looks ahead, so those only start once the collector is running. Run it once; running it again adds nothing.
//   node collector/backfill-events.mjs
import { DatabaseSync } from 'node:sqlite';
import { openSqlite } from './store-sqlite.mjs';

const MILESTONES = [1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
const store = openSqlite(); // makes sure the tables exist
const db = new DatabaseSync('data/bopzi.sqlite', { readOnly: true });

const rows = db.prepare(`SELECT universe_id, ts, playing, updated,
    LAG(playing) OVER w AS prev, LAG(updated) OVER w AS prev_updated, LAG(playing, 2) OVER w AS prev2, LAG(ts, 2) OVER w AS ts2
  FROM snapshots WINDOW w AS (PARTITION BY universe_id ORDER BY ts)`).all();

const events = [];
const lastSurge = new Map();
const lastCrash = new Map();
for (const r of rows) {
  if (r.prev2 != null && r.ts2 && r.prev2 > 0) {
    const minutes = Math.round((new Date(r.ts) - new Date(r.ts2)) / 6e4), gain = r.playing - r.prev2, share = gain / r.prev2;
    if (minutes >= 7 && minutes <= 13) {
      const recent = lastSurge.get(r.universe_id);
      if ((!recent || new Date(r.ts) - recent > 30 * 6e4) && ((gain >= 500 && share >= 0.12) || (gain >= 5000 && share >= 0.03))) {
        lastSurge.set(r.universe_id, new Date(r.ts));
        events.push({ ts: r.ts, universe_id: r.universe_id, kind: 'surge', value: gain, prev: r.prev2, detail: String(minutes), key: `s:${r.ts}` });
      }
      const crashed = lastCrash.get(r.universe_id);
      if (r.prev2 >= 3000 && -gain >= 1500 && -share >= 0.35 && r.prev != null && r.prev <= r.prev2 * 0.65 && (!crashed || new Date(r.ts) - crashed > 60 * 6e4)) {
        lastCrash.set(r.universe_id, new Date(r.ts));
        events.push({ ts: r.ts, universe_id: r.universe_id, kind: 'crash', value: Math.round(-share * 100), prev: r.prev2, detail: String(minutes), key: `x:${r.ts}` });
      }
    }
  }
  if (r.prev == null) continue;
  const hit = MILESTONES.filter((t) => r.prev < t && r.playing >= t).pop();
  if (hit) events.push({ ts: r.ts, universe_id: r.universe_id, kind: 'milestone', value: hit, prev: r.prev, detail: null, key: `m:${hit}:${r.ts.slice(0, 10)}` });
  if (r.updated && r.prev_updated && r.updated !== r.prev_updated && r.playing >= 500) {
    events.push({ ts: r.ts, universe_id: r.universe_id, kind: 'update', value: r.playing, prev: null, detail: r.updated, key: `u:${r.updated}` });
  }
}

// What each update did: players just before it against about 45 minutes later (a count between 30 and 75 minutes after).
const before = db.prepare('SELECT playing FROM snapshots WHERE universe_id = ? AND ts <= ? ORDER BY ts DESC LIMIT 1');
const after = db.prepare('SELECT playing FROM snapshots WHERE universe_id = ? AND ts >= ? AND ts <= ? ORDER BY ABS(julianday(ts) - julianday(?)) LIMIT 1');
for (const u of events.filter((e) => e.kind === 'update')) {
  const at = new Date(u.detail).getTime();
  const was = before.get(u.universe_id, u.detail)?.playing;
  const now = after.get(u.universe_id, new Date(at + 30 * 6e4).toISOString(), new Date(at + 75 * 6e4).toISOString(), new Date(at + 45 * 6e4).toISOString())?.playing;
  if (!was || now == null) continue;
  const gain = now - was, share = gain / was;
  if ((gain >= 500 && share >= 0.2) || (gain <= -3000 && share <= -0.4)) {
    events.push({ ts: new Date(at + 45 * 6e4).toISOString(), universe_id: u.universe_id, kind: 'impact', value: gain, prev: was, detail: String(Math.round(share * 100)), key: `ui:${u.detail}` });
  }
}

await store.save({ events });
const count = (k) => events.filter((e) => e.kind === k).length;
console.log(`Backfilled ${events.length} events from ${rows.length} saved player counts (${count('milestone')} milestones, ${count('update')} updates, ${count('surge')} surges, ${count('crash')} crashes, ${count('impact')} update impacts).`);
