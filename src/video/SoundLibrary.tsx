'use client';
import { Pause, Play, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { findSound, ownSounds, SOUND_CATEGORIES, SOUNDS, soundUrl, type OwnSound, type Sound, type SoundCategory } from './sounds';
import '@/app/video/sounds.css';

/** Fetches a built-in sound as a File, ready for importMedia. */
export async function soundFile(sound: Sound): Promise<File> {
  const response = await fetch(`/sounds/${sound.file}`);
  if (!response.ok) throw new Error(`“${sound.label}” could not be loaded.`);
  return new File([await response.blob()], `${sound.label}.mp3`, { type: 'audio/mpeg' });
}

/** Picks the sound an effect, title or cut makes (built-in or the creator's own), with a button to hear it. */
export function SoundSelect({ label = 'Sound', value, onChange, disabled }: { label?: string; value: string | undefined; onChange: (sound: string | undefined) => void; disabled?: boolean }) {
  const play = () => { const s = findSound(value); if (s) { const el = new Audio(soundUrl(s)); el.volume = .8; void el.play().catch(() => {}); } };
  const mine = ownSounds().filter(s => s.kind === 'sfx');
  return <div className="ve-sound-select"><label className="ve-field">{label}<select className="finput" value={value ?? ''} disabled={disabled} onChange={e => onChange(e.target.value || undefined)}>
    <option value="">No sound</option>
    {mine.length > 0 && <optgroup label="Your sounds">{mine.map(s => <option key={s.id} value={s.id}>{s.label}{s.main ? ' (main)' : ''}</option>)}</optgroup>}
    {SOUND_CATEGORIES.map(c => <optgroup key={c.id} label={c.label}>{SOUNDS.filter(s => s.category === c.id).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>)}
  </select></label><button type="button" className="ve-sfx-play" aria-label="Hear this sound" disabled={!value} onClick={play}><Play size={13}/></button></div>;
}

type Filter = SoundCategory | 'all' | 'yours' | 'music';
type Row = { key: string; label: string; detail: string; url: string; main?: boolean; add: () => void };

/**
 * The creator's own pack first ("Your sounds", "Your music"), then the built-in CC0 effects. Preview with the play
 * button, add one at the playhead with the plus.
 */
export default function SoundLibrary({ query = '', disabled = false, packRoot, onAdd, onAddOwn }: { query?: string; disabled?: boolean; /** Where the pack lives, to say so when it is empty. */ packRoot?: string | null; onAdd: (sound: Sound) => void; onAddOwn: (sound: OwnSound) => void }) {
  const [filter, setFilter] = useState<Filter>('all'), [previewing, setPreviewing] = useState<string | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => player.current?.pause(), []);
  const preview = (row: Row) => {
    player.current?.pause();
    if (previewing === row.key) { setPreviewing(null); return; }
    const el = new Audio(row.url); el.volume = .8; el.onended = () => setPreviewing(p => p === row.key ? null : p);
    player.current = el; setPreviewing(row.key); void el.play().catch(() => setPreviewing(null));
  };
  const q = query.trim().toLowerCase(), match = (text: string) => !q || text.toLowerCase().includes(q);
  const time = (s: number) => s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${s.toFixed(1)}s`;
  // Main sounds first: they are the pack's defaults.
  const own = (kind: OwnSound['kind']) => ownSounds().filter(s => s.kind === kind && match(`${s.label} ${kind === 'sfx' ? 'your sounds meme' : 'your music'}`)).sort((a, b) => Number(!!b.main) - Number(!!a.main))
    .map((s): Row => ({ key: s.id, label: s.label, detail: time(s.duration), url: soundUrl({ file: s.file, own: true }), main: s.main, add: () => onAddOwn(s) }));
  const builtIn = (category: Filter) => SOUNDS.filter(s => (category === 'all' || s.category === category) && match(`${s.label} ${s.category} ${s.tags.join(' ')}`))
    .map((s): Row => ({ key: s.id, label: s.label, detail: `${SOUND_CATEGORIES.find(c => c.id === s.category)!.label} · ${time(s.duration)}`, url: soundUrl({ file: s.file, own: false }), add: () => onAdd(s) }));
  const sections: [string, Row[]][] = filter === 'yours' ? [['Your sounds', own('sfx')]] : filter === 'music' ? [['Your music', own('music')]]
    : filter === 'all' ? [['Your sounds', own('sfx')], ['Your music', own('music')], ['Sound effects', builtIn('all')]] : [['Sound effects', builtIn(filter)]];
  const hasPack = ownSounds().length > 0;
  const filters: [Filter, string][] = [['all', 'All'], ...(hasPack ? [['yours', 'Your sounds'], ['music', 'Your music']] as [Filter, string][] : []), ...SOUND_CATEGORIES.map(c => [c.id, c.label] as [Filter, string])];
  const shown = sections.filter(([, rows]) => rows.length);
  return <>
    <div className="ve-sfx-cats" role="group" aria-label="Sound categories">{filters.map(([id, label]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div>
    {shown.map(([title, rows]) => <section key={title} className="ve-sfx-section">
      <div className="ve-sfx-head"><h3>{title}</h3><small>{rows.length} {title === 'Your music' ? rows.length === 1 ? 'track' : 'tracks' : rows.length === 1 ? 'sound' : 'sounds'}</small></div>
      <div className="ve-sfx-list">{rows.map(r => <div key={r.key} className={`ve-sfx${previewing === r.key ? ' is-playing' : ''}`}>
        <button type="button" className="ve-sfx-play" aria-label={`${previewing === r.key ? 'Stop' : 'Play'} ${r.label}`} onClick={() => preview(r)}>{previewing === r.key ? <Pause size={13}/> : <Play size={13}/>}</button>
        <span><b title={r.label}>{r.label}{r.main && <i className="ve-sfx-main">Main</i>}</b><small>{r.detail}</small></span>
        <button type="button" disabled={disabled} aria-label={`Add ${r.label} at the playhead`} title="Add at the playhead" onClick={r.add}><Plus size={15}/></button>
      </div>)}</div>
    </section>)}
    {!shown.length && <p className="tool-note">{q ? `No sounds match “${query}”.` : 'Nothing here yet.'}</p>}
    <p className="tool-note">{hasPack ? 'Your sounds and music are your own files in ' : 'Add your own sounds and music by putting files in '}<code>{packRoot ?? '~/.bopzi/sounds'}</code>{hasPack ? '; check the rights before you publish with them. ' : ' (sfx and music folders). '}Built-in effects are public domain (CC0).</p>
  </>;
}
