'use client';

import { ImagePlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type ScreenshotAction = 'polish' | 'restyle' | 'area';

export default function ImproveScreenshot({ onImport, onClose }: { onImport: (file: File, action: ScreenshotAction, instruction: string) => Promise<void>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [action, setAction] = useState<ScreenshotAction>('polish');
  const [instruction, setInstruction] = useState('Give this screenshot a clean illustrated Roblox thumbnail look. Preserve the same characters, objects, camera angle and actual gameplay. Improve lighting and subject separation. No added text or logos.');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  useEffect(() => { if (!file) return; const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
  const choose = (picked?: File) => {
    if (!picked) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(picked.type) || picked.size > 12_000_000) { setError('Choose a PNG, JPG or WebP screenshot under 12 MB.'); return; }
    setError(''); setFile(picked);
  };
  return <dialog ref={dialog} className="studio-dialog screenshot-dialog" aria-labelledby="screenshot-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <header><div><h2 id="screenshot-title">Improve a screenshot</h2><p>Start with the real game. Keep the original and build a better thumbnail.</p></div><button className="dialog-icon" type="button" aria-label="Close screenshot improvement" disabled={busy} onClick={onClose}><X size={18}/></button></header>
    <div className="screenshot-body">
      <label className="screenshot-upload" onDragOver={e => { if (!busy) e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (!busy) choose(e.dataTransfer.files[0]); }}>
        {url ? <img src={url} alt="Your original screenshot"/> : <span><ImagePlus size={28}/>Choose or drop a screenshot</span>}
        <input hidden type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { choose(e.target.files?.[0]); e.target.value = ''; }}/>
      </label>
      <p className="screenshot-crop-note">Thumbnails use a centred 16:9 crop. Your original file is saved untouched.</p>
      <fieldset className="screenshot-options"><legend>What would you like to do?</legend>
        {([
          ['polish', 'Polish', 'Gentle contrast and colour improvement. Runs locally, without AI.'],
          ['restyle', 'Restyle with AI', 'Prepare a change request using your screenshot as the source.'],
          ['area', 'Change an area', 'Open the screenshot, mark a region, then describe the change.'],
        ] as const).map(([value, label, text]) => <label key={value}><input type="radio" name="screenshot-action" value={value} checked={action === value} disabled={busy} onChange={() => setAction(value)}/><span><b>{label}</b><small>{text}</small></span></label>)}
      </fieldset>
      {action === 'restyle' && <label className="screenshot-instruction">Restyling instruction<textarea className="finput" rows={3} maxLength={600} disabled={busy} value={instruction} onChange={e => setInstruction(e.target.value)}/></label>}
      <p className="screenshot-crop-note">AI options open in the studio for review. Press Apply when you are ready to generate.</p>
      {error && <p className="dialog-message is-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="dialog-button is-primary" disabled={busy || !file || (action === 'restyle' && instruction.trim().length < 4)} onClick={async () => { if (!file) return; setBusy(true); setError(''); try { await onImport(file, action, instruction.trim()); onClose(); } catch (e) { setError(e instanceof Error ? e.message : 'The screenshot could not be opened.'); } finally { setBusy(false); } }}>{busy ? 'Opening…' : action === 'polish' ? 'Polish & open' : 'Open in studio'}</button></div>
    </div>
  </dialog>;
}
