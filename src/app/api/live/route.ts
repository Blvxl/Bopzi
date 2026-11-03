import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dbPath } from '@/lib/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const file = dbPath();
  if (!existsSync(file)) return Response.json({ events: [] }, { headers: { 'Cache-Control': 'no-store' } });
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = db.prepare(`WITH ordered AS (
      SELECT s.universe_id,s.ts,s.playing,g.name,g.creator_name,
        LAG(s.playing) OVER (PARTITION BY s.universe_id ORDER BY s.ts) AS prior,
        MAX(s.playing) OVER (PARTITION BY s.universe_id ORDER BY s.ts ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS old_peak
      FROM snapshots s JOIN games g ON g.universe_id=s.universe_id
    ) SELECT * FROM ordered WHERE prior IS NOT NULL AND ts >= ? ORDER BY ts DESC`)
      .all(new Date(Date.now()-24*60*60*1000).toISOString()) as {universe_id:number;ts:string;playing:number;name:string;creator_name:string|null;prior:number;old_peak:number|null}[];
    const events: {id:string;ts:string;name:string;creator:string|null;playing:number;icon:string|null;kind:'milestone'|'surge'|'high';value:number;change?:number}[]=[];
    const seen=new Set<string>();
    for(const r of rows){
      const kinds: {kind:'milestone'|'surge'|'high';value:number;change?:number}[]=[];
      for(const m of [5000,10000,25000,50000,100000,250000,500000,1000000]) if(r.prior<m&&r.playing>=m) kinds.push({kind:'milestone',value:m});
      if(r.prior>=500&&r.playing-r.prior>=1000&&r.playing/r.prior>=1.35) kinds.push({kind:'surge',value:r.playing,change:r.playing-r.prior});
      if(r.old_peak!==null&&r.playing>r.old_peak&&r.playing>=5000&&r.playing-r.old_peak>=500) kinds.push({kind:'high',value:r.playing});
      for(const e of kinds){const key=`${r.universe_id}:${e.kind}:${Math.floor(new Date(r.ts).getTime()/600000)}`;if(seen.has(key))continue;seen.add(key);events.push({id:key,ts:r.ts,name:r.name,creator:r.creator_name,playing:r.playing,icon:null,...e});}
    }
    const selected=events.slice(0,40);const ids=[...new Set(selected.map(e=>e.id.split(':')[0]))];
    for(let i=0;i<ids.length;i+=50){try{const res=await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${ids.slice(i,i+50).join(',')}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`);if(res.ok){const data=await res.json() as {data?:{targetId:number;imageUrl?:string}[]};for(const icon of data.data??[])for(const e of selected)if(Number(e.id.split(':')[0])===icon.targetId)e.icon=icon.imageUrl??null;}}catch{}}
    return Response.json({events:selected},{headers:{'Cache-Control':'no-store'}});
  } finally { db.close(); }
}
