'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { LANDING_SOUND_KEY, landingSoundOn, playLandingTick } from './AiTargets';

type Model = { id: string; name: string; description: string; efforts: string[] };
type Choice = { model?: string; effort?: string };

const KEY = 'bopzi-ai-model';
/** What edits use until someone picks otherwise: fast, and careful enough with the footage index. */
const DEFAULT_MODEL = 'gpt-6-luna', DEFAULT_EFFORT = 'medium';
const EFFORTS = [{ id: 'low', label: 'Low', hint: 'Fastest' }, { id: 'medium', label: 'Medium', hint: 'Balanced' }, { id: 'high', label: 'High', hint: 'Most careful, slowest' }];

/** The model and thinking level picked for AI edits on this device; sent with every edit and frame check. */
export function aiModelChoice(): Choice {
  try { const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return { model: typeof saved.model === 'string' ? saved.model : DEFAULT_MODEL, effort: typeof saved.effort === 'string' ? saved.effort : DEFAULT_EFFORT }; } catch { return { model: DEFAULT_MODEL, effort: DEFAULT_EFFORT }; }
}

/** Picks which of the person's Codex models plans their edits, and how long it thinks. */
export default function ModelPicker({ disabled }: { disabled?: boolean }) {
  const [models, setModels] = useState<Model[]>([]);
  const [choice, setChoice] = useState<Choice>({ model: DEFAULT_MODEL, effort: DEFAULT_EFFORT });
  const [open, setOpen] = useState(false), [tick, setTick] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setChoice(aiModelChoice()); setTick(landingSoundOn());
    fetch('/api/video/models', { headers: { 'x-bopzi-local': '1' } }).then(r => r.ok ? r.json() : null).then(body => { if (Array.isArray(body?.models)) setModels(body.models); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  if (!models.length) return null;
  const model = models.find(m => m.id === choice.model) ?? models[0];
  const effort = model.efforts.includes(choice.effort ?? '') ? choice.effort! : model.efforts.includes(DEFAULT_EFFORT) ? DEFAULT_EFFORT : 'low';
  const pick = (next: Choice) => {
    const value = { model: next.model ?? model.id, effort: next.effort ?? effort };
    setChoice(value);
    try { localStorage.setItem(KEY, JSON.stringify(value)); } catch {}
  };
  return <div className="ve-model" ref={root}>
    <button type="button" className="ve-model-trigger" aria-haspopup="dialog" aria-expanded={open} disabled={disabled} title="Choose the AI model" onClick={() => setOpen(v => !v)}>
      <span>{model.name}</span><small>{EFFORTS.find(e => e.id === effort)?.label}</small><ChevronDown size={13}/>
    </button>
    {open && <div className="ve-model-menu" role="dialog" aria-label="AI model">
      <div className="ve-model-list" role="radiogroup" aria-label="Model">
        {models.map(m => <button type="button" role="radio" aria-checked={m.id === model.id} key={m.id} onClick={() => pick({ model: m.id, effort: m.efforts.includes(effort) ? effort : 'low' })}>
          <span><b>{m.name}</b>{m.description && <small>{m.description}</small>}</span>{m.id === model.id && <Check size={14}/>}
        </button>)}
      </div>
      <div className="ve-model-effort">
        <span>Thinking</span>
        <div role="radiogroup" aria-label="Thinking">{EFFORTS.filter(e => model.efforts.includes(e.id)).map(e => <button type="button" role="radio" aria-checked={e.id === effort} title={e.hint} key={e.id} onClick={() => pick({ effort: e.id })}>{e.label}</button>)}</div>
      </div>
      <label className="ve-model-sound"><span>Sound when an edit lands</span><input type="checkbox" role="switch" checked={tick} onChange={e => { const on = e.target.checked; setTick(on); try { localStorage.setItem(LANDING_SOUND_KEY, on ? '1' : '0'); } catch {} if (on) playLandingTick(); }}/></label>
    </div>}
  </div>;
}
