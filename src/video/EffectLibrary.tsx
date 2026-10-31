'use client';
import { ArrowUpRight, Bookmark, CircleDot, Crosshair, EyeOff, Gauge, Hash, Sparkles, Waves, X } from 'lucide-react';
import { type Effect } from './motion';
import { type EffectPreset } from './presets';
const effects = [
  { kind: 'counter', name: 'Count up', description: 'Robux, scores and big numbers.', tag: 'Text', icon: Hash },
  { kind: 'zoom', name: 'Camera zoom', description: 'Punch in or ease in and stay.', tag: 'Camera', icon: Crosshair },
  { kind: 'shake', name: 'Impact shake', description: 'Give a hit a little weight.', tag: 'Camera', icon: Waves },
  { kind: 'flash', name: 'Reveal flash', description: 'A quick burst of light.', tag: 'Light', icon: Sparkles },
  { kind: 'highlight', name: 'Highlight', description: 'Circle or box something in colour.', tag: 'Focus', icon: CircleDot },
  { kind: 'blur', name: 'Blur area', description: 'Hide a username, chat or face.', tag: 'Privacy', icon: EyeOff },
  { kind: 'bar', name: 'Progress bar', description: 'XP, health or loading that fills up.', tag: 'Shape', icon: Gauge },
] as const;
export default function EffectLibrary({ disabled, onAdd, presets = [], onAddPreset, onDeletePreset }: { disabled: boolean; onAdd: (kind: Effect['kind']) => void; presets?: EffectPreset[]; onAddPreset?: (preset: EffectPreset) => void; onDeletePreset?: (id: string) => void }) {
  return <div className="ve-effect-library"><div className="ve-panel-intro"><span>Motion and impact</span><h3>Make the moment land.</h3><p>Choose an effect. Fine-tune it on the video.</p></div>
    {presets.length > 0 && <div className="ve-presets"><span className="ve-presets-title">My presets</span>{presets.map(p => <div key={p.id} className="ve-preset"><button type="button" disabled={disabled} onClick={() => onAddPreset?.(p)} title={`Add ${p.name} at the playhead`}><Bookmark size={12}/><span>{p.name}</span></button><button type="button" className="ve-preset-remove" aria-label={`Delete preset ${p.name}`} onClick={() => onDeletePreset?.(p.id)}><X size={12}/></button></div>)}</div>}<div className="ve-effect-cards">{effects.map(e => <button type="button" key={e.kind} disabled={disabled} onClick={() => onAdd(e.kind)} aria-label={`Add ${e.name.toLowerCase()}`} className={`ve-effect-card is-${e.kind}`}><div className="ve-effect-art" aria-hidden>{e.kind === 'counter' ? <b>10,000<span>ROBUX</span></b> : e.kind === 'zoom' ? <><i className="ve-demo-frame"/><i className="ve-demo-target"/></> : e.kind === 'shake' ? <i className="ve-demo-shake"/> : e.kind === 'highlight' ? <i className="ve-demo-highlight"/> : e.kind === 'blur' ? <i className="ve-demo-blur"/> : e.kind === 'bar' ? <i className="ve-demo-bar"/> : <i className="ve-demo-flash"/>}<span className="ve-effect-add"><ArrowUpRight size={15}/></span></div><div className="ve-effect-card-copy"><span className="ve-effect-tag"><e.icon size={11}/>{e.tag}</span><strong>{e.name}</strong><small>{e.description}</small></div></button>)}</div><div className="ve-panel-hint"><Sparkles size={14}/><span>Or describe it: “ease into the player, then hold.”</span></div></div>;
}
