'use client';

import { Check } from 'lucide-react';
import { useStudio } from './context';

/**
 * After "Arrange for me": the three arrangements and the wordings, on the bottom edge of the canvas while a choice
 * is being made. It sits over the canvas so the picture does not shrink to make room, and goes away on Done.
 */
export default function TakesBar() {
  const s = useStudio();
  const a = s.arranged;
  if (!a || s.generation) return null;
  const value = a.wordings.find((w) => w.text === a.wording)?.kind === 'value';
  return (
    <div className="takes" role="group" aria-label="Arrangements">
      <div className="takes-row">
        {a.takes.map((t, i) => (
          <button key={t.id} type="button" className="take" disabled={s.arranging || t.usable === false} aria-pressed={a.current === i} onClick={() => s.chooseTake(i)}>
            <img src={t.preview} alt="" draggable={false} />
            <span>
              {t.name}
              {t.readable && t.usable !== false ? (
                <i title="Preview passed placement and contrast checks">
                  <Check size={10} />
                </i>
              ) : (
                <em title="This preview needs adjustment">check</em>
              )}
            </span>
          </button>
        ))}
        <div className="takes-words">
          {a.wordings.map((w) => (
            <button key={w.text} type="button" disabled={s.arranging} aria-pressed={a.wording === w.text} onClick={() => s.setWording(w.text)}>
              {w.text}
            </button>
          ))}
          <button type="button" className="is-quiet" onClick={s.clearArranged}>
            Done
          </button>
        </div>
      </div>
      {a.feedback && <p className="takes-note" role="status">{a.feedback}</p>}
      {value && <p className="takes-note">Double-click the value to edit it.</p>}
    </div>
  );
}
