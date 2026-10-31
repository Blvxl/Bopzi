'use client';

import { ImagePlus, Mountain, PersonStanding, ShieldCheck, Type } from 'lucide-react';
import { useRef } from 'react';
import { ACCEPT_ATTR } from '@/lib/assets';
import { fontOf } from '@/lib/fonts';
import type { ImageRole } from '@/lib/types';
import { useStudio } from './context';
import { Section } from './controls';
import { LIGHT_PRESETS, TEXT_PRESETS } from './factory';

export default function BuildPanel() {
  const s = useStudio();
  const inputRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<ImageRole>('image');

  const pick = (role: ImageRole) => {
    roleRef.current = role;
    inputRef.current?.click();
  };

  return (
    <>
      <Section title="Images">
        <button type="button" className="add-card" onClick={() => pick('character')}>
          <PersonStanding size={18} />
          <span>
            <b>Character or game asset</b>
            <small>
              Transparent PNG. Added as a protected original <ShieldCheck size={11} className="inline align-[-1px] text-warn" />
            </small>
          </span>
        </button>
        <button type="button" className="add-card" onClick={() => pick('background')}>
          <Mountain size={18} />
          <span>
            <b>Background</b>
            <small>Fills the canvas and sits behind everything else.</small>
          </span>
        </button>
        <button type="button" className="add-card" onClick={() => pick('image')}>
          <ImagePlus size={18} />
          <span>
            <b>Other image</b>
            <small>Logos, effects, props, badges.</small>
          </span>
        </button>
        <p className="text-xs leading-relaxed text-ui-dim">PNG, JPG or WebP. You can also drop files on the canvas or paste from the clipboard.</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          hidden
          onChange={(e) => {
            s.addFiles(Array.from(e.target.files ?? []), roleRef.current);
            e.target.value = '';
          }}
        />
      </Section>

      <Section title="Text">
        <button type="button" className="ebtn w-full" onClick={() => s.addText()}>
          <Type size={15} /> Add text
        </button>
        <div className="grid grid-cols-2 gap-2">
          {TEXT_PRESETS.map((p) => {
            const font = fontOf(p.props.font ?? 'luckiest');
            const stroke = p.props.strokeWidth ? p.props.stroke ?? '#111111' : null;
            return (
              <button
                key={p.id}
                type="button"
                className="preset-card"
                title={`Add "${p.sample}" in the ${p.label} style`}
                onClick={() => s.addText(p)}
              >
                <span
                  style={{
                    fontFamily: font.family,
                    fontWeight: font.weight,
                    color: p.props.fill,
                    textShadow: [
                      stroke ? `-1.5px -1.5px 0 ${stroke}, 1.5px -1.5px 0 ${stroke}, -1.5px 1.5px 0 ${stroke}, 1.5px 1.5px 0 ${stroke}` : '',
                      p.props.glow?.enabled ? `0 0 10px ${p.props.glow.color}` : '',
                    ]
                      .filter(Boolean)
                      .join(', '),
                  }}
                >
                  {p.sample}
                </span>
                <small>{p.label}</small>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Light">
        <div className="grid grid-cols-2 gap-2">
          {LIGHT_PRESETS.map((p) => (
            <button key={p.id} type="button" className="preset-card" title={p.hint} onClick={() => s.addLight(p)}>
              <i
                className="h-8 w-full rounded"
                style={{
                  background:
                    p.color === '#000000'
                      ? 'radial-gradient(closest-side, #000, #2b2b2b)'
                      : `radial-gradient(closest-side, ${p.color}, transparent), #151515`,
                }}
              />
              <small>{p.label}</small>
            </button>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-ui-dim">Soft light layers you can tint, stretch and stack to tie a character into its background.</p>
      </Section>
    </>
  );
}
