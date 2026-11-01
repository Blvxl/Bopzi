'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { HELP_TEXT } from '@/lib/site';
import { Lockup } from './Logo';
import './auth.css';

/** Set to 1 once Google is switched on in Supabase; until then the button would only fail. */
const GOOGLE_SIGNIN = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === '1';

/** Free accounts: e-mail and password, or Google. Supabase keeps the passwords; Bopzi never sees them stored. */
export default function AccountForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const next = () => `${location.origin}/auth/callback?next=${encodeURIComponent(location.pathname.startsWith('/studio') ? '/studio' : '/projects')}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const auth = supabaseBrowser().auth;
    if (mode === 'reset') {
      const { error } = await auth.resetPasswordForEmail(email.trim(), { redirectTo: next() });
      setMessage(error ? 'Could not send the e-mail. Try again in a minute.' : 'If that address has an account, a reset link is on its way.');
    } else if (mode === 'up') {
      const { data, error } = await auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: next() } });
      if (error) setMessage(error.message);
      else if (data.session) onDone();
      else setMessage('Check your e-mail to confirm your account, then log in.');
    } else {
      const { error } = await auth.signInWithPassword({ email: email.trim(), password });
      if (error) setMessage('That e-mail and password did not match.');
      else onDone();
    }
    setBusy(false);
  };
  const google = async () => {
    const { error } = await supabaseBrowser().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: next() } });
    if (error) setMessage('Google sign-in is not available right now.');
  };

  const title = mode === 'up' ? 'Create your free account' : mode === 'reset' ? 'Reset your password' : 'Log in to Bopzi';
  return (
    <form className="auth-card" aria-labelledby="auth-title" onSubmit={(e) => void submit(e)}>
      <Lockup size={34} bg="#191816" className="auth-brand" />
      <h1 id="auth-title">{title}</h1>
      <p>{mode === 'up' ? 'Bopzi is free. No card needed.' : mode === 'reset' ? 'We will e-mail you a link.' : 'Welcome back.'}</p>
      <label>E-mail<input type="email" required autoFocus autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      {mode !== 'reset' && <label>Password<input type="password" required minLength={8} maxLength={128} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
      <button type="submit" className="auth-go" disabled={busy || !email.trim() || (mode !== 'reset' && password.length < 8)}>{busy ? 'One moment' : mode === 'up' ? 'Create account' : mode === 'reset' ? 'Send link' : 'Log in'}</button>
      {mode !== 'reset' && GOOGLE_SIGNIN && <button type="button" className="auth-alt" onClick={() => void google()}>Continue with Google</button>}
      {message && <p className="auth-error" role="status">{message}</p>}
      <p className="auth-switch">
        {mode === 'in' && <><button type="button" onClick={() => { setMode('up'); setMessage(''); }}>Create an account</button><button type="button" onClick={() => { setMode('reset'); setMessage(''); }}>Forgot password?</button></>}
        {mode !== 'in' && <button type="button" onClick={() => { setMode('in'); setMessage(''); }}>Back to log in</button>}
      </p>
      <p className="auth-help">Need help? {HELP_TEXT}.</p>
    </form>
  );
}
