'use client';
import { useEffect, useRef, useState } from 'react';
import { gatherContext, renderFrame } from './ai-context';
import { EVAL_CASES, type EvalResult } from './eval-cases';
import { footageText } from './footage-text';
import { aiModelChoice } from './ModelPicker';
import type { Media, SavedProject } from './model';
import { getMedia, listVideoProjects, restoreMedia } from './storage';
import { knownIndex, understand, type FootageIndex } from './understand';

type Row = { id: string; pass: boolean; why: string; summary: string; secs: number };
type Run = { at: number; project: string; model: string; rows: Row[] };
const RUNS_KEY = 'bopzi-ai-eval-runs';
const loadRuns = (): Run[] => { try { return JSON.parse(localStorage.getItem(RUNS_KEY) ?? '[]'); } catch { return []; } };

/**
 * Runs the thirty everyday requests (eval-cases.ts) against one of your projects, exactly as the editor would send
 * them, without changing the project. Each run is kept on this device so the score can be compared after a change.
 */
export default function EvalRunner() {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState(false), [withIndex, setWithIndex] = useState(true);
  const stop = useRef(false);
  useEffect(() => {
    setRuns(loadRuns());
    void listVideoProjects().then(list => { const sorted = list.sort((a, b) => b.updatedAt - a.updatedAt); setProjects(sorted); setProjectId(sorted.find(p => p.timeline.clips.length)?.id ?? ''); });
  }, []);

  const run = async () => {
    const project = projects.find(p => p.id === projectId); if (!project) return;
    setBusy(true); setRows([]); stop.current = false;
    try {
      const assets: Media[] = (await getMedia(project.id)).map(restoreMedia);
      const video = assets.find(a => a.kind === 'video' && project.timeline.clips.some(c => c.assetId === a.id));
      let index: FootageIndex | null = video ? (await knownIndex(video)) ?? null : null;
      if (withIndex && video && !index?.complete) index = await understand(video, p => setStatus(`Understanding footage first: ${p.stage} ${Math.round(p.percent)}%`), aiModelChoice());
      setStatus('Gathering what the AI sees…');
      const library = assets.filter(a => !project.timeline.removedMediaIds?.includes(a.id));
      const seen = await gatherContext(library, []);
      const footage = withIndex ? await footageText(library, seen.legend) : '';
      const previewFrame = await renderFrame(project.timeline, assets, Math.min(1, project.timeline.clips.length ? 1 : 0), 768).catch(() => undefined);
      const choice = aiModelChoice();
      const base = { timeline: project.timeline, selected: null, scope: 'project', playhead: 1, previewFrame, assets: library.map(({ blob: _b, url: _u, proxyBlob: _pb, proxyUrl: _pu, ...a }) => a), history: [], ...seen, footage, speech: [], ...choice };
      const out: Row[] = [];
      for (const [i, c] of EVAL_CASES.entries()) {
        if (stop.current) break;
        setStatus(`${i + 1}/${EVAL_CASES.length}: ${c.prompt}`);
        const started = Date.now();
        let result: EvalResult;
        try {
          const response = await fetch('/api/video/edit', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bopzi-local': '1' }, body: JSON.stringify({ ...base, instruction: c.prompt }) });
          result = await response.json();
        } catch (e) { result = { error: e instanceof Error ? e.message : 'Request failed' }; }
        // A check that cannot read the reply (no clips left, say) counts as a fail, not as the end of the run.
        let verdict: { pass: boolean; why: string };
        try { verdict = result.error ? { pass: false, why: result.error } : c.check(result, { base: project.timeline, index }); }
        catch (e) { verdict = { pass: false, why: `Unexpected reply (${e instanceof Error ? e.message : 'check failed'})` }; }
        out.push({ id: c.id, ...verdict, summary: result.question ? `Asked: ${result.question}` : result.summary ?? '', secs: (Date.now() - started) / 1000 });
        setRows([...out]);
      }
      const finished: Run = { at: Date.now(), project: project.timeline.name, model: `${choice.model ?? 'default'} · ${choice.effort ?? 'low'}${withIndex ? '' : ' · no index'}`, rows: out };
      const kept = [finished, ...loadRuns()].slice(0, 8);
      try { localStorage.setItem(RUNS_KEY, JSON.stringify(kept)); } catch {}
      setRuns(kept); setStatus(stop.current ? 'Stopped.' : 'Done.');
    } catch (e) { setStatus(e instanceof Error ? e.message : 'The eval could not run.'); }
    finally { setBusy(false); }
  };

  const score = (r: Row[]) => `${r.filter(x => x.pass).length}/${r.length}`;
  const previous = runs.find(r => r.rows.length === EVAL_CASES.length && r !== runs[0]) ?? runs[1];
  return <main className="ve-eval">
    <header>
      <div><h1>Video AI eval</h1><p>Thirty everyday requests, sent exactly as the editor sends them. Your project is never changed.</p></div>
      <div className="ve-eval-controls">
        <select value={projectId} disabled={busy} onChange={e => setProjectId(e.target.value)} aria-label="Project">{projects.map(p => <option key={p.id} value={p.id}>{p.timeline.name} · {p.timeline.clips.length} clip{p.timeline.clips.length === 1 ? '' : 's'}</option>)}</select>
        <label className="ve-eval-toggle"><input type="checkbox" checked={withIndex} disabled={busy} onChange={e => setWithIndex(e.target.checked)}/>Footage index</label>
        {busy ? <button type="button" onClick={() => { stop.current = true; }}>Stop</button> : <button type="button" className="is-primary" disabled={!projectId} onClick={() => void run()}>Run all {EVAL_CASES.length}</button>}
      </div>
    </header>
    {status && <p className="ve-eval-status" role="status">{status}</p>}
    {rows.length > 0 && <p className="ve-eval-score">Score <b>{score(rows)}</b>{previous && <> · last run {score(previous.rows)} ({previous.model})</>}</p>}
    {(['Basics', 'Finding content', 'Reframing', 'Audio & text'] as const).map(group => {
      const cases = EVAL_CASES.filter(c => c.group === group), done = rows.filter(r => cases.some(c => c.id === r.id));
      return <section key={group}>
        <h2>{group}{done.length > 0 && <span>{score(done)}</span>}</h2>
        <ul>{cases.map(c => { const r = rows.find(x => x.id === c.id), was = previous?.rows.find(x => x.id === c.id); return <li key={c.id} className={r ? (r.pass ? 'is-pass' : 'is-fail') : ''}>
          <span className="ve-eval-mark">{r ? (r.pass ? '✓' : '✕') : '·'}</span>
          <div><b>{c.prompt}</b>{r && <small>{r.why}</small>}{r?.summary && <em>{r.summary}</em>}</div>
          <span className="ve-eval-meta">{r ? `${r.secs.toFixed(1)}s` : ''}{was && r && was.pass !== r.pass ? (r.pass ? ' ↑ fixed' : ' ↓ broke') : ''}</span>
        </li>; })}</ul>
      </section>;
    })}
  </main>;
}
