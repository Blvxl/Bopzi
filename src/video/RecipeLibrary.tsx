'use client';
import { useState } from 'react';
import { ArrowRight, Gem, Gift, Megaphone, Target, TrendingUp } from 'lucide-react';
import { RECIPES, type RecipeOptions } from './recipes';
const icons = { robux: Gift, kills: Target, drop: Gem, update: Megaphone, upgrade: TrendingUp };
const defaults: Record<string, RecipeOptions> = { robux: { title: 'REWARD UNLOCKED', amount: 10000, color: '#ffd84d', duration: 3, impact: true }, kills: { title: 'ON A STREAK', amount: 5, color: '#ff7654', duration: 3, impact: true }, drop: { title: 'STARFALL BLADE', rarity: 'LEGENDARY', subtitle: 'NEW ITEM UNLOCKED', color: '#b49aff', duration: 3, impact: true }, update: { title: 'UPDATE IS LIVE', subtitle: 'NEW CONTENT. NEW CHALLENGES.', color: '#7cd9bf', duration: 5, impact: true }, upgrade: { duration: 3, color: '#ffd84d' } };
export default function RecipeLibrary({ disabled, onPreview }: { disabled: boolean; onPreview: (id: string, options: RecipeOptions) => void }) {
  const [id, setId] = useState('robux'), [options, setOptions] = useState<RecipeOptions>(defaults.robux);
  const recipe = RECIPES.find(r => r.id === id)!;
  const update = (patch: RecipeOptions) => setOptions(o => ({ ...o, ...patch }));
  return <div className="ve-pack-library"><p className="ve-pack-eyebrow">Roblox editing packs</p><h3>Make the moment yours.</h3><p className="tool-note">Editable titles, counters and camera effects. Preview before adding.</p>
    <div className="ve-pack-grid">{RECIPES.map(r => { const Icon = icons[r.id]; return <button type="button" key={r.id} aria-label={'Choose ' + r.name} aria-pressed={id === r.id} onClick={() => { setId(r.id); setOptions(defaults[r.id]); }}><div className={'ve-pack-art is-' + r.id}><Icon size={22}/><b>{r.id === 'robux' ? '10,000' : r.id === 'kills' ? '5 KILLS' : r.id === 'drop' ? 'LEGENDARY' : r.id === 'update' ? 'IT’S LIVE' : 'LEVEL UP'}</b></div><strong>{r.name}</strong></button>; })}</div>
    <fieldset disabled={disabled} className="ve-pack-customize"><legend>Customise {recipe.name.toLowerCase()}</legend><p>{recipe.hint}</p>
      {id !== 'upgrade' && <label className="ve-field">{id === 'drop' ? 'Item name' : 'Headline'}<input className="finput" aria-label="Pack headline" maxLength={80} value={options.title ?? ''} onChange={e => update({ title: e.target.value })}/></label>}
      {(id === 'robux' || id === 'kills') && <label className="ve-field">{id === 'kills' ? 'Final kill count' : 'Robux amount'}<input className="finput" type="number" min={0} max={1e9} step={1} value={options.amount ?? 0} onChange={e => update({ amount: Math.min(1e9, Math.max(0, Number(e.target.value))) })}/></label>}
      {id === 'drop' && <label className="ve-field">Rarity<select className="finput" value={options.rarity} onChange={e => update({ rarity: e.target.value })}>{['RARE', 'EPIC', 'LEGENDARY', 'MYTHIC', 'SECRET'].map(r => <option key={r}>{r}</option>)}</select></label>}
      {(id === 'drop' || id === 'update') && <label className="ve-field">Supporting text<input className="finput" aria-label="Pack supporting text" maxLength={80} value={options.subtitle ?? ''} onChange={e => update({ subtitle: e.target.value })}/></label>}
      <div className="ve-field-pair"><label className="ve-field">Accent<input type="color" className="finput" value={options.color} onChange={e => update({ color: e.target.value })}/></label><label className="ve-field">Duration<input className="finput" aria-label="Pack duration" type="number" min={.5} max={10} step={.5} value={options.duration} onChange={e => update({ duration: Math.min(10, Math.max(.5, Number(e.target.value))) })}/></label></div>
      {id !== 'upgrade' && <label className="ve-checkbox"><input type="checkbox" checked={options.impact ?? true} onChange={e => update({ impact: e.target.checked })}/>Add a subtle flash and punch zoom</label>}
      <button type="button" className="ebtn go w-full" onClick={() => onPreview(id, options)}>Preview pack<ArrowRight size={15}/></button>
    </fieldset><p className="tool-note">Added at the playhead, shortened to fit available footage. Every layer stays selectable and editable.</p>
  </div>;
}
