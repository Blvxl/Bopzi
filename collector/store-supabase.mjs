// The real database: Supabase Postgres, written with the service-role key (a server secret, never a NEXT_PUBLIC_ setting).
import { createClient } from '@supabase/supabase-js';

export function openSupabase(url, serviceKey) {
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const put = async (table, rows, onConflict) => {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  };
  // Supabase returns at most 1000 rows a request, so long lists are read a page at a time.
  const pages = async (build, limit = Infinity) => {
    const out = [];
    while (out.length < limit) {
      const { data, error } = await build().range(out.length, Math.min(out.length + 999, limit - 1));
      if (error) throw new Error(`games: ${error.message}`);
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  };
  return {
    kind: 'supabase',
    /** Games seen recently, with the player count last seen. A game that has been empty for a day is left out. */
    async trackedGames(sinceIso, emptyAfterIso, limit) {
      const rows = await pages(() => db.from('games').select('universe_id, playing, first_seen, updated, genre_l1, peak').gte('last_seen', sinceIso).or(`playing.is.null,playing.gt.0,last_seen.gte.${emptyAfterIso}`).order('last_seen', { ascending: false }), limit);
      return rows.map((r) => ({ id: r.universe_id, playing: r.playing, firstSeen: r.first_seen, updated: r.updated, genre: r.genre_l1, peak: r.peak }));
    },
    async searchedSince(iso) { return (await pages(() => db.from('searches').select('query').gte('ts', iso).order('query'))).map((r) => r.query); },
    async markSearched(rows) { await put('searches', rows, 'query'); },
    // Supabase has no random order, so a random stretch of the games table is read instead.
    async sampleTerms(n) {
      const { count } = await db.from('games').select('universe_id', { count: 'exact', head: true });
      const from = Math.floor(Math.random() * Math.max(1, (count ?? 0) - n));
      const { data, error } = await db.from('games').select('name, creator_name').order('universe_id').range(from, from + n - 1);
      if (error) throw new Error('games: ' + error.message);
      return { creators: [...new Set(data.map((r) => r.creator_name).filter(Boolean))], names: data.map((r) => r.name) };
    },
    async knownIds() { return (await pages(() => db.from('games').select('universe_id').order('universe_id'))).map((r) => r.universe_id); },
    async staleGroups(olderThanIso, limit) {
      const checked = new Map((await pages(() => db.from('creators').select('creator_id, checked').eq('type', 'Group').order('creator_id'))).map((r) => [r.creator_id, r.checked]));
      const rows = await pages(() => db.from('games').select('creator_id, playing').eq('creator_type', 'Group').order('playing', { ascending: false, nullsFirst: false }), 5000);
      const out = [];
      for (const r of rows) if (r.creator_id && !out.includes(r.creator_id) && !((checked.get(r.creator_id) ?? '') >= olderThanIso)) { out.push(r.creator_id); if (out.length >= limit) break; }
      return out;
    },
    async playersBetween(fromIso, toIso) {
      return pages(() => db.from('snapshots').select('universe_id, playing, ts').gte('ts', fromIso).lte('ts', toIso).order('ts'));
    },
    async updatesBetween(fromIso, toIso) {
      return pages(() => db.from('game_updates').select('universe_id, updated_at').gte('seen_at', fromIso).lte('seen_at', toIso).order('updated_at'));
    },
    async playerAt(id, iso) {
      const { data, error } = await db.from('snapshots').select('playing').eq('universe_id', id).lte('ts', iso).order('ts', { ascending: false }).limit(1);
      if (error) throw new Error(`snapshots: ${error.message}`);
      return data[0]?.playing ?? null;
    },
    async quietBefore(fromIso, toIso) {
      const top = new Map();
      for (const r of await pages(() => db.from('snapshots').select('universe_id, playing').gte('ts', fromIso).lte('ts', toIso).order('ts'))) {
        const t = top.get(r.universe_id) ?? { universe_id: r.universe_id, top: 0, n: 0 };
        t.top = Math.max(t.top, r.playing); t.n++; top.set(r.universe_id, t);
      }
      return [...top.values()];
    },
    async recentEvents(sinceIso) {
      const { data, error } = await db.from('events').select('universe_id, kind').gte('ts', sinceIso);
      if (error) throw new Error(`events: ${error.message}`);
      return data;
    },
    async lastTotalTs() {
      const { data, error } = await db.from('totals').select('ts').order('ts', { ascending: false }).limit(1);
      if (error) throw new Error(`totals: ${error.message}`);
      return data[0]?.ts ?? '';
    },
    async lastSnapshotTs() {
      const { data, error } = await db.from('snapshots').select('ts').order('ts', { ascending: false }).limit(1);
      if (error) throw new Error(`snapshots: ${error.message}`);
      return data[0]?.ts ?? '';
    },
    async save({ games = [], snapshots = [], charts = [], totals = [], updates = [], genres = [], creators = [], events = [] }) {
      // first_seen is never sent, so the column default sets it on insert and an update leaves it alone.
      // A game with nobody in it is sent without last_seen, so it keeps its old one and ages out of the tracked set.
      await put('games', games.filter((g) => g.playing > 0), 'universe_id');
      await put('games', games.filter((g) => !(g.playing > 0)).map(({ last_seen, ...g }) => g), 'universe_id');
      await put('snapshots', snapshots, 'universe_id,ts');
      await put('chart_entries', charts, 'ts,sort_id,rank');
      await put('totals', totals, 'ts');
      await put('game_updates', updates, 'universe_id,updated_at');
      await put('genre_totals', genres, 'ts,genre');
      await put('creators', creators, 'creator_id,type');
      // Events are announced once: a repeat of the same universe_id and key is ignored.
      for (let i = 0; i < events.length; i += 500) {
        const { error } = await db.from('events').upsert(events.slice(i, i + 500), { onConflict: 'universe_id,key', ignoreDuplicates: true });
        if (error) throw new Error(`events: ${error.message}`);
      }
    },
  };
}
