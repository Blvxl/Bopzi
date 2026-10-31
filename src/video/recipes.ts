import { duration, newTitle, uid, type Timeline, type Title } from './model';
import { newEffect, type CounterEffect } from './motion';
export const RECIPES = [{ id: 'robux', name: 'Robux reveal', hint: 'A reward count that lands on your number.' }, { id: 'kills', name: 'Kill streak', hint: 'A clean streak counter above the action.' }, { id: 'drop', name: 'Rare drop', hint: 'Your item. Your rarity. A big reveal.' }, { id: 'update', name: 'Update announcement', hint: 'Announce what is new and invite players in.' }, { id: 'upgrade', name: 'Before / after upgrade', hint: 'Two timed labels and a level-up count.' }] as const;
export type RecipeOptions = { amount?: number; title?: string; subtitle?: string; rarity?: string; color?: string; duration?: number; impact?: boolean };
export function applyRecipe(t: Timeline, recipe: string, at: number, options: RecipeOptions = {}) {
  if (!RECIPES.some(r => r.id === recipe)) throw new Error('Choose a Roblox pack.');
  const length = duration(t), start = Math.max(0, Math.min(at, length - .2)), span = Math.min(Math.max(.2, options.duration ?? 3), length - start);
  if (span < .2) return t;
  const color = /^#[0-9a-f]{6}$/i.test(options.color ?? '') ? options.color! : '#ffd84d';
  const amount = Math.max(0, Math.min(1e9, Math.round(options.amount ?? (recipe === 'kills' ? 5 : 10000))));
  const headline = (options.title ?? (recipe === 'robux' ? 'REWARD UNLOCKED' : recipe === 'drop' ? 'STARFALL BLADE' : 'UPDATE IS LIVE')).slice(0, 80);
  const counter: CounterEffect = { ...newEffect('counter', start, uid()) as CounterEffect, duration: span, countDuration: Math.min(1.4, span * .65), entrance: 'none', bounce: false, from: 0, to: amount, prefix: '', suffix: ' ROBUX', font: 'luckiest', size: .105, x: .5, y: .5, color, easing: 'smoother' };
  const label = { ...newTitle(start, headline), duration: span, animation: 'pop' as const, font: 'montserrat', size: .04, y: .33 };
  let titles: Title[] = [label], effects = [counter] as Timeline['effects'];
  if (recipe === 'kills') { counter.prefix = ''; counter.suffix = ' KILLS'; counter.size = .06; counter.x = .78; counter.y = .18; counter.easing = 'linear'; counter.step = 1; titles = [{ ...label, text: options.title?.slice(0, 80) || 'ON A STREAK', x: .78, y: .09, size: .028, color }]; }
  if (recipe === 'drop') { titles = [{ ...label, text: ((options.rarity || 'LEGENDARY') + ' DROP').slice(0, 80), color, y: .32 }, { ...newTitle(start, headline), duration: span, color: '#ffffff', y: .5, size: .085, animation: 'pop' }, { ...label, text: options.subtitle?.slice(0, 80) || 'NEW ITEM UNLOCKED', y: .66, size: .025 }]; effects = []; }
  if (recipe === 'update') { titles = [{ ...newTitle(start, headline), duration: span, y: .35, color, size: .09, animation: 'pop' }, { ...label, text: options.subtitle?.slice(0, 80) || 'NEW CONTENT. NEW CHALLENGES.', start: start + span * .15, duration: span * .85, y: .53, size: .035 }, { ...label, text: 'PLAY NOW', start: start + span * .5, duration: span * .5, y: .7, size: .045, color }]; effects = []; }
  if (recipe === 'upgrade') { const half = span / 2; titles = [{ ...label, text: 'BEFORE', duration: half }, { ...newTitle(start + half, 'AFTER'), duration: half, y: .32, animation: 'pop' }]; counter.from = 1; counter.to = 50; counter.prefix = 'LEVEL '; counter.suffix = ''; counter.start = start + half; counter.duration = half; counter.countDuration = half * .7; }
  if (recipe !== 'upgrade' && options.impact !== false && span >= .5) effects.push({ id: uid(), kind: 'flash', start: start + span * .1, duration: Math.min(.18, span * .25), color }, { id: uid(), kind: 'zoom', mode: 'punch', start: start + span * .1, duration: Math.min(.55, span * .5), amount: 1.1, x: .5, y: .5, easing: 'sineInOut' });
  titles = titles.map(title => ({ ...title, id: uid() }));
  const name = RECIPES.find(r => r.id === recipe)!.name;
  return { ...t, titles: [...t.titles, ...titles], effects: [...t.effects, ...effects], layerSettings: { ...t.layerSettings, ...Object.fromEntries([...titles, ...effects].map(item => [item.id, { name: `${name} · ${'text' in item ? item.text : item.kind === 'counter' ? 'Counter' : item.kind === 'zoom' ? 'Punch zoom' : 'Reveal flash'}` }])) } };
}
