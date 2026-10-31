'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Clapperboard, ExternalLink, Loader2, Palette, Paperclip, Search, Square, X } from 'lucide-react';
import { cleanStyleProfile, hasStyle, type StyleProfile, type YouTubeStyleReference } from './ai-style';
import { FONT_KEYS } from './model';
import { aiModelChoice } from './ModelPicker';
import StyleCard from './StyleCard';
import type { ComposerTarget } from './ai-composer';
import ModelPicker from './ModelPicker';
import { mediaPaths } from './media-source';

export default function AiComposer({ command, target, effectKind, busy, disabled, status, completionSignal, onCommand, onSubmit, onCancel, onClearTarget, onUpload, onPick, onPaths, question, onChoice, onDismissQuestion, styleReference, onStyleReference, styleProfile, onStyleProfile }: {
  command: string; target?: ComposerTarget; effectKind?: string; busy: boolean; disabled: boolean; status: string; completionSignal: number;
  onCommand: (text: string) => void; onSubmit: () => void; onCancel: () => void; onClearTarget: () => void; onUpload: (files: File[]) => void; /** Opens the file picker. */ onPick: () => void; /** File paths pasted as text (Explorer's "Copy as path"). */ onPaths: (paths: string[]) => void;
  question: { question: string; choices: string[] } | null; onChoice: (choice: string) => void; onDismissQuestion: () => void;
  styleReference: YouTubeStyleReference | null; onStyleReference: (reference: YouTubeStyleReference | null) => void;
  styleProfile: StyleProfile; onStyleProfile: (profile: StyleProfile) => void;
}) {
  const [styling, setStyling] = useState(false);
  const [referenceQuery, setReferenceQuery] = useState('');
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [referenceError, setReferenceError] = useState('');
  const styleDialog = useRef<HTMLDialogElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  // The prompt clears on submit, so keep the request to echo it while Bopzi works.
  const [pending, setPending] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [justCompleted, setJustCompleted] = useState(false);
  const lastCompletionSignal = useRef(0);
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const started = Date.now(), timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    if (!completionSignal || busy || completionSignal <= lastCompletionSignal.current) return;
    lastCompletionSignal.current = completionSignal;
    setJustCompleted(true);
    const timer = setTimeout(() => setJustCompleted(false), 1000);
    return () => clearTimeout(timer);
  }, [completionSignal, busy]);
  useEffect(() => { if (busy) setJustCompleted(false); }, [busy]);
  useEffect(() => {
    const dialog = styleDialog.current;
    if (!dialog) return;
    if (styling && !dialog.open) { dialog.showModal(); referenceInput.current?.focus(); }
    else if (!styling && dialog.open) dialog.close();
  }, [styling]);
  const isYouTubeLink = (() => {
    try {
      const url = new URL(referenceQuery.trim());
      if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(url.hostname.toLowerCase())) return false;
      return url.hostname.toLowerCase().endsWith('youtu.be') ? url.pathname.length > 1 : !!url.searchParams.get('v') || /^\/(shorts|live|embed)\/[^/]+/.test(url.pathname);
    } catch { return false; }
  })();
  const addYouTubeReference = async () => {
    setReferenceBusy(true); setReferenceError('');
    try {
      const response = await fetch('/api/video/style-reference', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bopzi-local': '1' }, body: JSON.stringify({ url: referenceQuery.trim(), ...aiModelChoice() }) });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.reference) throw new Error(body?.error || 'Could not add that YouTube video.');
      onStyleReference(body.reference as YouTubeStyleReference); setReferenceQuery('');
      // The reference fills in the style card; notes the user already wrote are kept.
      if (body.profile) { const suggested = cleanStyleProfile(body.profile, FONT_KEYS); onStyleProfile({ ...suggested, notes: styleProfile.notes.trim() || suggested.notes }); }
    } catch (error) { setReferenceError(error instanceof Error ? error.message : 'Could not add that YouTube video.'); }
    finally { setReferenceBusy(false); }
  };
  const searchYouTube = () => { const term = referenceQuery.trim(); if (term) window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(term)}`, '_blank', 'noopener,noreferrer'); };
  const canCancel = !/Preparing your preview|Applying your edit/i.test(status);
  return <div className="ve-ai-composer">
    <dialog ref={styleDialog} className="ve-style-reference-dialog" aria-labelledby="ve-style-reference-title" onCancel={e => { e.preventDefault(); setStyling(false); }} onClick={e => { if (e.target === e.currentTarget) setStyling(false); }}>
      <header><div><span className="tool-eyebrow">Style inspiration</span><h2 id="ve-style-reference-title">Choose a video reference</h2></div><button type="button" aria-label="Close style reference" onClick={() => setStyling(false)}><X size={19}/></button></header>
      <p className="ve-style-reference-intro">Find a YouTube video with the look you want. Bopzi reads its look and fills in your style below. Every AI edit follows it.</p>
      <div className="ve-ai-reference-picker">
        {styleReference ? <div className="ve-ai-reference-card"><img src={styleReference.thumbnail} alt=""/><div className="ve-ai-reference-meta"><span className="ve-ai-reference-eyebrow">Current reference</span><strong>{styleReference.title}</strong><span>{styleReference.author} · YouTube</span></div><a href={styleReference.url} target="_blank" rel="noreferrer" aria-label="Open reference on YouTube" title="Open on YouTube"><ExternalLink size={15}/></a><button type="button" aria-label="Remove YouTube style reference" title="Remove reference" onClick={() => onStyleReference(null)}><X size={15}/></button></div>
          : <><div className="ve-ai-reference-search"><label><Clapperboard size={16}/><input ref={referenceInput} aria-label="Paste a YouTube video link or search" placeholder="Paste a YouTube video URL…" value={referenceQuery} onChange={e => { setReferenceQuery(e.target.value); setReferenceError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (isYouTubeLink) void addYouTubeReference(); else searchYouTube(); } }}/></label><button type="button" className="ve-ai-search-youtube" disabled={!referenceQuery.trim()} onClick={searchYouTube}><Search size={14}/><span>Find on YouTube</span></button><button type="button" className="ve-ai-add-reference" disabled={!isYouTubeLink || referenceBusy} onClick={() => void addYouTubeReference()}>{referenceBusy ? <><Loader2 size={13} className="ve-spin"/>Reading its style…</> : 'Add reference'}</button></div>{referenceError && <small className="ve-ai-reference-error" role="alert">{referenceError}</small>}</>}
      </div>
      <StyleCard profile={styleProfile} onChange={onStyleProfile}/>
      <footer className="ve-style-reference-footer"><span>How to add a video</span><p>Search opens YouTube in a new tab. Copy the video link and paste it above.</p></footer>
    </dialog>
    {question && <section className="ve-ai-card" aria-label="Bopzi has a question">
      <p className="ve-ai-summary">{question.question}</p>
      <footer className="ve-ai-card-foot"><span className="ve-ai-choices">{question.choices.map(c => <button type="button" key={c} disabled={busy || disabled} onClick={() => { setPending(c); onChoice(c); }}>{c}</button>)}</span>
        <button type="button" className="ve-ai-quiet" onClick={onDismissQuestion}>Never mind</button></footer></section>}
    <div className="ve-ai-prompt-wrap">
    <form className={`ve-ai-form${justCompleted ? ' is-complete' : ''}`} aria-label="AI editing prompt" aria-busy={busy} onSubmit={e => { e.preventDefault(); setPending(command.trim()); onSubmit(); }}>
      {busy && <div className="ve-ai-working">
        <span className="ve-ai-orb" aria-hidden="true"/>
        <div className="ve-ai-work-copy"><strong role="status" aria-live="polite">{status || 'Bopzi is planning your edit…'}</strong>{elapsed >= 30 ? <span>Taking longer than usual. You can stop and try a shorter request.</span> : pending && <span>“{pending}”</span>}</div>
        <time aria-live="off" aria-label={`${elapsed} seconds`}>{elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`}</time>
      </div>}
      <div className="ve-ai-input" hidden={busy}>{!command && <kbd className="ve-ai-slash" title="Press / to type an edit">/</kbd>}<textarea ref={input} id="composer-input" aria-label="Describe a video edit" maxLength={1500} rows={1} placeholder={status || (target ? 'Describe what to change…' : 'Describe the edit you want to see…')} disabled={disabled} value={command} onChange={e => onCommand(e.target.value)} onPaste={e => { const files = Array.from(e.clipboardData.files); if (files.length) { e.preventDefault(); onUpload(files); return; } const paths = mediaPaths(e.clipboardData.getData('text')); if (paths.length) { e.preventDefault(); onPaths(paths); } }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}/></div>
      <div className="ve-ai-toolbar">
        <div className="ve-ai-tools">
          <button className="ve-ai-media" type="button" title="Add media or paste a file" aria-label="Add media" disabled={disabled} onClick={onPick}><Paperclip size={17}/><span>Media</span></button>
          <button className="ve-ai-manual" type="button" title="Set a YouTube style reference" aria-label="Your editing style" aria-pressed={styling} onClick={() => setStyling(v => !v)}><Palette size={16}/><span>Style</span>{hasStyle(styleProfile) && <i className="ve-ai-style-on" aria-label="(on)"/>}</button>
          {target && <span className="ve-ai-target" title={target.kind === 'clips' ? 'AI will use this clip as context.' : 'AI edits target this selected element.'}><i aria-hidden="true"/><span>{target.kind === 'clips' ? '1 clip' : `${effectKind === 'counter' ? 'Counter' : target.kind === 'titles' ? 'Title' : target.kind === 'captions' ? 'Caption' : 'Layer'} · ${target.label}`}</span><button type="button" aria-label="Clear AI selection" disabled={disabled} onClick={onClearTarget}><X size={12}/></button></span>}
          {!busy && status && <span className="ve-ai-progress" role="status">{status}</span>}
        </div>
        <ModelPicker disabled={busy}/>
        {busy ? <button className="ve-ai-send is-cancel" type="button" aria-label="Stop AI edit" title={canCancel ? 'Stop' : 'Preparing preview'} disabled={!canCancel} onClick={onCancel}><Square size={12} fill="currentColor"/><span>Stop</span><kbd className="ve-ai-kbd">Esc</kbd></button> : <button className="ve-ai-send" type="submit" disabled={disabled || !command.trim()} aria-label="Preview edit" title="Preview edit"><ArrowUp size={21}/></button>}
      </div>
    </form>
    </div>
  </div>;
}
