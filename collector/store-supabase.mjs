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
  return {
    kind: 'supabase',
    async trackedIds(sinceIso, limit) {
      const { data, error } = await db.from('games').select('universe_id').gte('last_seen', sinceIso).order('last_seen', { ascending: false }).limit(limit);
      if (error) throw new Error(`games: ${error.message}`);
      return data.map((r) => r.universe_id);
    },
    async save({ games, snapshots, charts }) {
      // first_seen is never sent, so the column default sets it on insert and an update leaves it alone.
      await put('games', games, 'universe_id');
      await put('snapshots', snapshots, 'universe_id,ts');
      await put('chart_entries', charts, 'ts,sort_id,rank');
    },
  };
}
