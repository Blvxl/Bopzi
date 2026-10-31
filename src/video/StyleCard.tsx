'use client';
import { RotateCcw, X } from 'lucide-react';
import { EDITOR_FONTS } from '@/lib/fonts';
import { CAPTION_PRESETS } from './model';
import { EMPTY_STYLE, STYLE_LIMIT, hasStyle, type StyleProfile } from './ai-style';

const ANIMATIONS: [StyleProfile['titleAnimation'], string][] = [['pop', 'Pop'], ['fade', 'Fade'], ['slide', 'Slide'], ['bounce', 'Bounce'], ['typewriter', 'Typewriter'], ['glitch', 'Glitch'], ['shake', 'Shake']];

function Segments<T extends string>({ label, value, options, onChange }: { label: string; value: T | ''; options: [T, string][]; onChange: (value: T | '') => void }) {
  return <div className="ve-style-seg" role="radiogroup" aria-label={label}>
    <button type="button" role="radio" aria-checked={!value} onClick={() => onChange('')}>Auto</button>
    {options.map(([id, text]) => <button type="button" role="radio" key={id} aria-checked={value === id} onClick={() => onChange(id)}>{text}</button>)}
  </div>;
}

function Colour({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (value: string) => void }) {
  return <span className="ve-style-colour">
    <input type="color" aria-label={label} value={value || fallback} onChange={e => onChange(e.target.value)}/>
    <span>{value ? value.toUpperCase() : 'Auto'}</span>
    {value && <button type="button" aria-label={`Set ${label.toLowerCase()} back to auto`} onClick={() => onChange('')}><X size={12}/></button>}
  </span>;
}

/** The house style every AI edit follows: concrete fields, with a live sample of the title look. */
export default function StyleCard({ profile, onChange }: { profile: StyleProfile; onChange: (profile: StyleProfile) => void }) {
  const set = <K extends keyof StyleProfile>(key: K, value: StyleProfile[K]) => onChange({ ...profile, [key]: value });
  const font = EDITOR_FONTS.find(f => f.key === profile.titleFont);
  const captionBase = CAPTION_PRESETS.find(p => p.id === profile.captions)?.style.font ?? 'montserrat';
  const captionFont = EDITOR_FONTS.find(f => f.key === (profile.captionFont || profile.titleFont || captionBase));
  return <section className="ve-style-card" aria-label="Your style">
    <header>
      <div><span className="tool-eyebrow">Your style</span><p>Every AI edit follows this. Auto lets Bopzi decide.</p></div>
      {hasStyle(profile) && <button type="button" className="ve-style-reset" onClick={() => onChange({ ...EMPTY_STYLE })}><RotateCcw size={13}/>Reset</button>}
    </header>
    <div className="ve-style-sample" aria-hidden="true">
      <span className="ve-style-sample-title" style={{ fontFamily: font?.family, fontWeight: font?.weight, color: profile.titleColor || '#ffffff' }}>LET&apos;S <em style={{ color: profile.accentColor || '#ffd84d' }}>GO</em></span>
      <span className="ve-style-sample-caption" style={{ fontFamily: captionFont?.family, fontWeight: captionFont?.weight }}>How many followers do you have?</span>
    </div>
    <div className="ve-style-grid">
      <label>Captions<select className="finput" value={profile.captions} onChange={e => set('captions', e.target.value as StyleProfile['captions'])}><option value="">Auto</option>{CAPTION_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      <label>Caption font<select className="finput" value={profile.captionFont} onChange={e => set('captionFont', e.target.value)}><option value="">Auto</option>{EDITOR_FONTS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
      <label>Title font<select className="finput" value={profile.titleFont} onChange={e => set('titleFont', e.target.value)}><option value="">Auto</option>{EDITOR_FONTS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
      <label>Title animation<select className="finput" value={profile.titleAnimation} onChange={e => set('titleAnimation', e.target.value as StyleProfile['titleAnimation'])}><option value="">Auto</option>{ANIMATIONS.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>
      <div className="ve-style-colours"><span>Colours</span><div><Colour label="Title colour" value={profile.titleColor} fallback="#ffffff" onChange={v => set('titleColor', v)}/><Colour label="Accent colour" value={profile.accentColor} fallback="#ffd84d" onChange={v => set('accentColor', v)}/></div></div>
    </div>
    <div className="ve-style-row"><span>Energy</span><Segments label="Energy" value={profile.energy} options={[['calm', 'Calm'], ['balanced', 'Balanced'], ['hype', 'Hype']]} onChange={v => set('energy', v)}/></div>
    <div className="ve-style-row"><span>Sound effects</span><Segments label="Sound effects" value={profile.sounds} options={[['off', 'Off'], ['some', 'Some'], ['lots', 'Lots']]} onChange={v => set('sounds', v)}/></div>
    <label className="ve-style-notes">Notes<textarea className="finput" rows={2} maxLength={STYLE_LIMIT} placeholder="Logo bottom right, never shake the camera, end on a cliffhanger" value={profile.notes} onChange={e => set('notes', e.target.value)}/></label>
  </section>;
}
