'use client';
import { Ellipsis, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

type ToolItem = { id: string; label: string; icon: LucideIcon };
const PRIMARY = ['media', 'audio', 'text', 'effects'];
export default function VideoToolbar({ tools, active, onSelect }: { tools: ToolItem[]; active: string | null; onSelect: (id: string | null) => void }) {
  const [more, setMore] = useState(false), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), menuId = useId();
  const secondary = tools.filter(t => !PRIMARY.includes(t.id));
  useEffect(() => {
    if (!more) return;
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setMore(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setMore(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [more]);
  const select = (id: string) => { setMore(false); onSelect(active === id ? null : id); };
  return <div className="ve-tool-positioner" ref={root}>
    <nav className="tool-rail ve-tool-rail" aria-label="Video tools">
      {PRIMARY.map(id => { const item = tools.find(t => t.id === id)!; return <button type="button" key={id} aria-label={item.label} aria-pressed={active === id} onClick={() => select(id)}><item.icon size={19} aria-hidden/><span className="ve-tool-label">{item.label}</span></button>; })}
      <button type="button" ref={trigger} aria-label="More tools" aria-haspopup="menu" aria-expanded={more} aria-controls={more ? menuId : undefined} className={secondary.some(t => t.id === active) ? 'has-active-tool' : ''} onClick={() => setMore(v => !v)} onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setMore(true); requestAnimationFrame(() => menu.current?.querySelector<HTMLButtonElement>('button')?.focus()); } }}><Ellipsis size={20} aria-hidden/><span className="ve-tool-label">More</span></button>
    </nav>
    {more && <div className="ve-more-tools" ref={menu} id={menuId} role="menu" aria-label="More video tools" onKeyDown={e => {
      const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? []), index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length; buttons[next]?.focus(); }
      if (e.key === 'Tab') setMore(false);
    }}><p>More tools</p>{secondary.map(item => <button type="button" role="menuitemradio" aria-checked={active === item.id} key={item.id} onClick={() => { select(item.id); trigger.current?.focus(); }}><item.icon size={17} aria-hidden/><span>{item.label === 'Styles' ? 'Templates' : item.label}</span></button>)}</div>}
  </div>;
}
