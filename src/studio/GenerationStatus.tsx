'use client';
import { Check, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useStudio } from './context';
import GenerationDots from './GenerationDots';

const TITLES = {
  preparing: 'Preparing your references',
  generating: 'Creating your thumbnail',
  placing: 'Placing it on the canvas',
  ready: 'Your thumbnail is ready',
  failed: 'That one did not work',
};
const STAGES = ['Reading your idea', 'Drawing', 'Finishing'];
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// What this browser has actually seen: how long the last few images took. Used to say what to expect.
const TIMES = 'bopzi:gen-times';
const readTimes = (): number[] => {
  try { const v = JSON.parse(localStorage.getItem(TIMES) ?? '[]'); return Array.isArray(v) ? v.filter((n) => Number.isFinite(n)).slice(-5) : []; } catch { return []; }
};
const saveTime = (seconds: number) => {
  try { localStorage.setItem(TIMES, JSON.stringify([...readTimes(), Math.min(600, Math.max(5, Math.round(seconds)))].slice(-5))); } catch { /* the estimate just stays general */ }
};
const typicalOf = (times: number[]) => (times.length < 2 ? 0 : [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]);

// Real habits of thumbnails that read well, shown one at a time while the image is made.
const TIPS = [
  'Check your thumbnail at a small size. Most players see it tiny.',
  'Two or three big words beat a sentence.',
  'Leave the bottom edge clear. Roblox puts a label there.',
  'One clear subject beats a busy scene.',
  'Bright, high-contrast colours stand out in a row of thumbnails.',
  'Nothing to click while you wait. Keep the helper window open.',
];

type Props = {
  /** The artboard's box inside the canvas area, so the wait happens where the image will land. */
  frame: { left: number; top: number; width: number; height: number };
  /** Not enough room under the artboard: sit the status row inside its bottom edge instead. */
  inset: boolean;
  /** There is already artwork on the canvas, so dim it beneath the dotted field. */
  hasArt: boolean;
};

/**
 * The generation wait: a warm sweep across a stationary dot grid and one quiet status row.
 * The rest of the studio stays visible. When the image arrives the veil fades and reveals it.
 */
export default function GenerationStatus({ frame, inset, hasArt }: Props) {
  const { generation, setGeneration, isIcon } = useStudio();
  const [elapsed, setElapsed] = useState(0);
  const [typical] = useState(() => typicalOf(readTimes()));
  const title = useRef<string | null>(null);

  useEffect(() => {
    if (!generation) return;
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - generation.startedAt) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [generation?.startedAt]);

  // The tab says how it is going, so you can work in another tab and still see when it is done.
  const phaseNow = generation?.phase;
  useEffect(() => {
    if (!phaseNow) return;
    if (title.current === null) title.current = document.title;
    const working = phaseNow === 'preparing' || phaseNow === 'generating' || phaseNow === 'placing';
    document.title = working ? `${clock(elapsed)} · Making your image` : phaseNow === 'ready' ? 'Ready · Bopzi' : phaseNow === 'failed' ? 'Did not work · Bopzi' : title.current;
  }, [phaseNow, elapsed]);
  useEffect(() => () => { if (title.current !== null) document.title = title.current; }, []);
  useEffect(() => {
    if (generation?.phase === 'ready') saveTime((Date.now() - generation.startedAt) / 1000);
  }, [generation?.phase, generation?.startedAt]);

  useEffect(() => {
    if (generation?.phase !== 'ready') return;
    // Long enough for the reveal to settle and the confirmation to be read.
    const timer = setTimeout(() => setGeneration(null), 1800);
    return () => clearTimeout(timer);
  }, [generation?.phase, generation?.startedAt, setGeneration]);

  if (!generation) return null;
  const { phase } = generation;
  // The list of required things that follows the scene is for the image model, not for reading.
  const scene = generation.scene?.split(/\s*MUST SHOW:/i)[0].trim();
  const working = phase === 'preparing' || phase === 'generating' || phase === 'placing';
  // The model says what it understood a few seconds in; quiet requests still move on after a moment.
  const stage = phase === 'placing' ? 2 : phase === 'generating' && (scene || elapsed >= 12) ? 1 : 0;
  // An expectation makes a wait feel shorter than a bare timer. Only claim what this browser has actually seen.
  const hint =
    phase === 'failed'
      ? (generation.message ?? 'Try again in a moment.')
      : phase === 'ready'
        ? 'Check it at small size, then refine or download.'
        : typical
          ? (elapsed > typical * 1.6 ? 'Taking longer than usual. Still working.' : `Usually about ${clock(typical)} for you.`)
          : elapsed > 90
            ? 'Still working. Some images take longer.'
            : 'This can take a minute or two.';

  return (
    <>
      {phase !== 'failed' && (
        <div className={`gen-veil ${hasArt ? 'has-art' : ''} ${phase === 'ready' ? 'is-done' : ''}`} style={frame} aria-hidden="true">
          <GenerationDots running={working} />
        </div>
      )}
      {phase === 'generating' && scene && (
        <p className="gen-scene" role="status" style={{ left: frame.left + 14, bottom: `calc(100% - ${frame.top + frame.height - (inset ? 66 : 14)}px)`, maxWidth: Math.max(160, Math.min(560, frame.width - 28)) }}>
          <b>Making this</b>
          {scene}
        </p>
      )}
      <div
        className={`gen-status ${inset ? 'is-inset' : ''}`}
        style={inset ? { left: frame.left, top: frame.top + frame.height - 58, width: frame.width } : { left: frame.left, top: frame.top + frame.height + 8, width: frame.width }}
      >
        <div className={`gen-line ${working ? '' : 'is-still'}`} role={working ? 'progressbar' : undefined} aria-label={working ? 'Thumbnail generation in progress' : undefined}>
        </div>
        <div className="gen-row">
          {phase === 'ready' && <Check size={15} className="gen-ok" aria-hidden="true" />}
          {phase === 'failed' && <TriangleAlert size={15} className="gen-bad" aria-hidden="true" />}
          {working && <ol className="gen-stages" role="status" aria-live="polite">
            {STAGES.map((label, i) => <li key={label} aria-current={i === stage ? 'step' : undefined} className={i < stage ? 'is-past' : undefined}>{label}</li>)}
          </ol>}
          {!working && <p role="status" aria-live="polite">
            <b>{isIcon ? TITLES[phase].replace('thumbnail', 'icon') : TITLES[phase]}</b>
            <span>{hint}</span>
          </p>}
          {working && <time aria-label={`${elapsed} seconds elapsed`}>{clock(elapsed)}</time>}
          {(phase === 'preparing' || phase === 'generating') && generation.cancel && (
            <button type="button" onClick={generation.cancel}>
              Cancel
            </button>
          )}
          {phase === 'failed' && (
            <>
              {generation.retry && (
                <button type="button" onClick={generation.retry}>
                  Try again
                </button>
              )}
              <button type="button" className="is-quiet" onClick={() => setGeneration(null)}>
                Dismiss
              </button>
            </>
          )}
        </div>
        {working && (
          <p className="gen-sub" role="status">
            <span>{hint}</span>
            <span className="gen-tip" key={Math.floor(elapsed / 9) % TIPS.length}>{TIPS[Math.floor(elapsed / 9) % TIPS.length]}</span>
          </p>
        )}
      </div>
    </>
  );
}
