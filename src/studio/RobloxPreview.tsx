'use client';

import { Crop, Download, Moon, Shuffle, Sparkles, Sun, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReferenceGame } from '@/lib/thumbnail/references';
import { canvasToBlob, downloadBlob, slug } from '@/lib/util';

/**
 * The thumbnail and icon as Roblox shows them. Sizes, spacing, colours and type sizes were measured on
 * roblox.com (the Charts tiles) and read from its stylesheet (the wide Home tiles), in both of its themes.
 * The typeface is Roblox's own and is not bundled: it shows when it is installed, otherwise the fallbacks
 * Roblox itself lists are used.
 */

type Tile = { key: string; name: string; wide: string | null; icon: string | null; rating: string; playing: string; mine?: boolean };

/** 110.9K, 1.2M: the way Roblox shortens player counts. */
function shortCount(n: number | undefined) {
  if (n === undefined) return '--';
  if (n < 1000) return String(n);
  const [value, unit] = n < 1_000_000 ? [n / 1000, 'K'] : n < 1_000_000_000 ? [n / 1_000_000, 'M'] : [n / 1_000_000_000, 'B'];
  return `${value >= 100 ? Math.round(value) : Math.round(value * 10) / 10}${unit}`;
}

// The two glyphs from Roblox's small icon sheet, each in its own 16 by 16 cell.
const Votes = () => (
  <svg className="rbx-ico" viewBox="0 32 16 16" aria-hidden="true">
    <path d="m13.203 38.812-1.988.008a1.29 1.29 0 0 0-1.115.975L8.568 46.14a1.305 1.305 0 0 0 1.185 1.609l1.932-.003c.853 0 1.588-.603 1.756-1.44l1.084-5.406a1.79 1.79 0 0 0-1.322-2.088m-5.897 7.094 1.532-6.345c.065-.271.179-.52.327-.743l-1.098-.005.818-4.444A2 2 0 0 0 6.918 32a.775.775 0 0 0-.752.589l-1.225 5.093c-.179.704-.516 1.151-1.152 1.151A1.79 1.79 0 0 0 2 40.623v5.343c0 .989.801 1.79 1.789 1.79l3.87-.006a2.28 2.28 0 0 1-.353-1.844" />
  </svg>
);
const Playing = () => (
  <svg className="rbx-ico" viewBox="0 48 16 16" aria-hidden="true">
    <path fillRule="evenodd" d="M14.85 62c0-2-1.71-3.84-3.16-5a5.9 5.9 0 0 0-1.74-1 3.05 3.05 0 0 0 2.18-2.92v-2a3 3 0 0 0-3.05-3H7a3.05 3.05 0 0 0-3 3.03v2a3 3 0 0 0 2.2 2.92 6.4 6.4 0 0 0-1.71.97C3 58.13 1.28 60 1.27 62v.14c0 .48 3.41 1.81 6.79 1.81s6.79-1.33 6.79-1.81zm-7 .42a.64.64 0 0 1-1-.51v-3.63a.64.64 0 0 1 1-.51L11 60.1z" />
  </svg>
);

const Stats = ({ tile }: { tile: Tile }) => (
  <div className="rbx-info">
    <Votes />
    <span>{tile.rating}</span>
    <Playing />
    <span>{tile.playing}</span>
  </div>
);

type Props = {
  name: string;
  /** Which page to open on. */
  start: 'home' | 'charts';
  /** The project's icon and the job that makes one. Both live in the studio, so closing this changes nothing. */
  icon: Blob | null;
  /** An address for that icon that stays valid while the studio is open. */
  iconUrl: string | null;
  onIcon: (icon: Blob | null) => void;
  generating: boolean;
  error: string;
  onGenerate: () => void;
  onCancel: () => void;
  games: ReferenceGame[];
  /** The canvas as it is now, at the given width. */
  snapshot: (width: number) => HTMLCanvasElement | null;
  /** Why an icon cannot be generated right now, or '' when it can. */
  blocked: string;
  notify: (message: string, tone?: 'ok' | 'warn') => void;
  onClose: () => void;
  /** An icon project: the canvas is the icon itself, so only the Charts page applies and there is nothing to generate or crop. */
  iconOnly?: boolean;
};

export default function RobloxPreview({ name, start, icon, iconUrl, onIcon, generating: busy, error, onGenerate, onCancel, games, snapshot, blocked, notify, onClose, iconOnly = false }: Props) {
  const [tab, setTab] = useState<'home' | 'charts'>(iconOnly ? 'charts' : start);
  const [dark, setDark] = useState(true);
  const [turn, setTurn] = useState(0);
  const [thumb, setThumb] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const [cropAt, setCropAt] = useState(50);

  useEffect(() => {
    const canvas = snapshot(768);
    setThumb(canvas ? canvas.toDataURL('image/jpeg', 0.92) : null);
  }, [snapshot]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);


  // Real games around yours, in a different order each time Shuffle is pressed. Yours takes the second place.
  const tiles = useMemo(() => {
    const count = tab === 'home' ? 7 : 11;
    const start = games.length ? (turn * 5) % games.length : 0;
    const others: Tile[] = [...games.slice(start), ...games.slice(0, start)].slice(0, count).map((g) => ({
      key: String(g.id),
      name: g.name,
      wide: g.imageUrl,
      icon: g.iconUrl ?? null,
      rating: g.rating === undefined ? '--' : `${g.rating}%`,
      playing: shortCount(g.playing),
    }));
    const mine: Tile = { key: 'mine', name: name.trim() || 'Your game', wide: thumb, icon: iconOnly ? thumb : iconUrl, rating: '--', playing: '0', mine: true };
    return [...others.slice(0, 1), mine, ...others.slice(1)];
  }, [games, turn, tab, name, thumb, iconUrl, iconOnly]);

  const useCrop = async () => {
    const full = snapshot(1920);
    if (!full) return;
    const side = full.height;
    const out = document.createElement('canvas');
    out.width = 1024;
    out.height = 1024;
    out.getContext('2d')!.drawImage(full, ((full.width - side) * cropAt) / 100, 0, side, side, 0, 0, 1024, 1024);
    onIcon(await canvasToBlob(out, 'image/png'));
    setCropping(false);
  };
  const generate = () => {
    setCropping(false);
    onGenerate();
  };
  const download = async () => {
    if (!icon) return;
    const bitmap = await createImageBitmap(icon);
    const out = document.createElement('canvas');
    out.width = 512;
    out.height = 512;
    out.getContext('2d')!.drawImage(bitmap, 0, 0, 512, 512);
    bitmap.close();
    downloadBlob(await canvasToBlob(out, 'image/png'), `${slug(name)}-icon-512.png`);
    notify('Saved a 512 × 512 icon.');
  };
  const removeIcon = () => onIcon(null);

  return (
    <div className="rbx-overlay" role="dialog" aria-modal="true" aria-label="How it looks on Roblox" onClick={onClose}>
      <div className="rbx-shell" onClick={(e) => e.stopPropagation()}>
        <div className="rbx-bar">
          <div role="tablist" aria-label="Where on Roblox">
            {!iconOnly && (
              <button type="button" role="tab" aria-selected={tab === 'home'} onClick={() => setTab('home')}>
                Home <small>thumbnail</small>
              </button>
            )}
            <button type="button" role="tab" aria-selected={tab === 'charts'} onClick={() => setTab('charts')}>
              Charts <small>icon</small>
            </button>
          </div>
          <span />
          <button type="button" onClick={() => setTurn((v) => v + 1)} disabled={games.length < 2}>
            <Shuffle size={14} /> Other games
          </button>
          <button type="button" onClick={() => setDark((v) => !v)} aria-label={dark ? 'Show Roblox in its light theme' : 'Show Roblox in its dark theme'}>
            {dark ? <Sun size={14} /> : <Moon size={14} />} {dark ? 'Light' : 'Dark'}
          </button>
          <button type="button" className="rbx-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className={`rbx-page ${dark ? 'is-dark' : 'is-light'}`}>
          <h2>{tab === 'home' ? 'Recommended For You' : 'Top Trending'}</h2>
          {tab === 'home' ? (
            <div className="rbx-grid">
              {tiles.map((t) => (
                <div className="rbx-wide" key={t.key} data-mine={t.mine || undefined}>
                  <div className="rbx-wide-thumb">{t.wide && <img src={t.wide} alt="" draggable={false} />}</div>
                  <div className="rbx-wide-meta">
                    <div className="rbx-name" title={t.name}>
                      {t.name}
                    </div>
                    <Stats tile={t} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ul className="rbx-list">
              {tiles.map((t) => (
                <li className="rbx-card" key={t.key} data-mine={t.mine || undefined}>
                  <span className="rbx-card-thumb">
                    {t.mine && cropping && thumb ? (
                      <img src={thumb} alt="" draggable={false} style={{ objectFit: 'cover', objectPosition: `${cropAt}% 50%` }} />
                    ) : (
                      t.icon && <img src={t.icon} alt="" draggable={false} />
                    )}
                  </span>
                  <div className="rbx-card-name" title={t.name}>
                    {t.name}
                  </div>
                  <Stats tile={t} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rbx-foot">
          {tab === 'home' ? (
            <p>
              Yours is the second tile, at the size Roblox shows it on Home. The other games and their numbers are real and live. Your own rating and player count show as Roblox shows a game with no votes yet.
            </p>
          ) : iconOnly ? (
            <p>Yours is the second tile, at the 150 pixels Roblox uses on Charts. The other games and their numbers are real and live. If the subject is hard to make out here, make it bigger and drop any small text.</p>
          ) : (
            <>
              <div className="rbx-icon-tools">
                {cropping ? (
                  <>
                    <label>
                      Position
                      <input type="range" min={0} max={100} value={cropAt} onChange={(e) => setCropAt(Number(e.target.value))} />
                    </label>
                    <button type="button" className="is-go" onClick={() => void useCrop()}>
                      Use this crop
                    </button>
                    <button type="button" onClick={() => setCropping(false)}>
                      Cancel
                    </button>
                  </>
                ) : busy ? (
                  <>
                    <i className="spinner" />
                    <span>Generating the icon. This can take a minute or two. You can close this and keep working.</span>
                    <button type="button" onClick={onCancel}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className={icon ? '' : 'is-go'} disabled={!!blocked} title={blocked || undefined} onClick={generate}>
                      <Sparkles size={14} /> {icon ? 'Generate another' : 'Generate a matching icon'}
                    </button>
                    <button type="button" disabled={!thumb} onClick={() => setCropping(true)}>
                      <Crop size={14} /> Crop from the thumbnail
                    </button>
                    {icon && (
                      <>
                        <button type="button" className="is-go" onClick={() => void download()}>
                          <Download size={14} /> Download 512 × 512
                        </button>
                        <button type="button" onClick={removeIcon}>
                          Remove
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
              <p className={error ? 'is-error' : ''} role={error ? 'alert' : undefined}>
                {error ||
                  (blocked && !icon
                    ? blocked
                    : 'Yours is the second tile, at the 150 pixels Roblox uses on Charts. Generating an icon uses one image from your ChatGPT limit; cropping is free. Roblox advises designing the icon on its own, with one clear subject and no small text.')}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
