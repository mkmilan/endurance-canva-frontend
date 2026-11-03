'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.js';
import { creatorRequest, signedOutCreator, attemptAllowance } from '../lib/creator.js';

export default function CreatorAccess() {
  const [creator, setCreator] = useState(signedOutCreator);
  const [state, setState] = useState('loading');
  const [setupToken, setSetupToken] = useState('');
  const [email, setEmail] = useState('');
  const [action, setAction] = useState('');
  const [notice, setNotice] = useState(null);
  const mounted = useRef(false);
  const statusRequest = useRef(0);
  const isSetup = Boolean(setupToken && creator.auth.setupAvailable);
  const allowance = attemptAllowance(creator.ai?.limits);

  async function refresh(signal) {
    const requestId = ++statusRequest.current;
    try {
      const result = await creatorRequest('/api/creator', { signal });
      if (mounted.current && requestId === statusRequest.current) { setCreator(result); setState('ready'); }
      return result;
    } catch (error) {
      if (mounted.current && requestId === statusRequest.current && error.name !== 'AbortError') {
        setState('offline'); setCreator(signedOutCreator);
      }
      return null;
    }
  }

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    if (fragment.has('setup')) {
      const token = fragment.get('setup') || '';
      // Keep the one-time token only in memory, never in history, storage, or HTML.
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
      if (token && token.length <= 1024) setSetupToken(token);
      else setNotice({ kind: 'error', text: 'This setup link is not valid. Open the complete private setup link.' });
    }
    refresh(controller.signal);
    return () => { mounted.current = false; controller.abort(); };
  }, []);

  async function submitAccount(event) {
    event.preventDefault();
    if (action) return;
    const fields = new FormData(event.currentTarget);
    const address = String(fields.get('email') || '').trim();
    const password = String(fields.get('password') || '');
    const setup = isSetup;
    setAction(setup ? 'setup' : 'sign-in'); setNotice(null);
    try {
      if (setup) {
        await creatorRequest('/api/creator/setup', { body: { token: setupToken, name: String(fields.get('name') || '').trim(), email: address, password } });
        setSetupToken(''); setEmail(address);
        setNotice({ kind: 'success', text: 'Your creator account is ready. Sign in to continue.' });
      } else {
        await creatorRequest('/api/auth/sign-in/email', { body: { email: address, password } });
        setNotice({ kind: 'success', text: 'You’re signed in. Return to the studio when you’re ready.' });
      }
      await refresh();
    } catch (error) {
      setNotice({ kind: 'error', text: error.name === 'TimeoutError' ? 'Creator access took too long. Please try again.' : error.message });
      if (error.code === 'SETUP_UNAVAILABLE') { setSetupToken(''); await refresh(); }
    } finally { if (mounted.current) setAction(''); }
  }

  async function signOut() {
    if (action) return;
    setAction('sign-out'); setNotice(null);
    try {
      await creatorRequest('/api/auth/sign-out', { body: {} });
      setEmail(''); setCreator(signedOutCreator);
      setNotice({ kind: 'success', text: 'Signed out. The guided demo is still available.' });
      await refresh();
    } catch (error) { setNotice({ kind: 'error', text: error.message }); }
    finally { if (mounted.current) setAction(''); }
  }

  async function changePassword(event) {
    event.preventDefault();
    if (action) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setAction('password'); setNotice(null);
    try {
      await creatorRequest('/api/auth/change-password', { body: {
        currentPassword: String(fields.get('currentPassword') || ''), newPassword: String(fields.get('newPassword') || ''), revokeOtherSessions: true,
      } });
      form.reset();
      setNotice({ kind: 'success', text: 'Password changed. Your other sessions have been signed out.' });
      await refresh();
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
      if (error.status === 401) await refresh();
    } finally { if (mounted.current) setAction(''); }
  }

  return <div className="creator-app">
    <header className="studio-header">
      <a className="brand" href="/" aria-label="Endurance Canvas home"><span className="brand-mark"><svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path d="M7 24V13m9 11V7m9 17v-8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg></span><span>Endurance <strong>Canvas</strong></span></a>
      <a className="button secondary creator-back" href="/">Back to studio<Icon name="arrowRight" size={16}/></a>
    </header>
    <main className="creator-main">
      <div className="creator-intro"><span className="eyebrow">A SPACE FOR YOUR IDEAS</span><h1>{creator.auth.signedIn ? 'Welcome back.' : isSetup ? 'Make it your studio.' : 'Creator access.'}</h1><p>{creator.auth.signedIn ? 'Your creator account is ready for the next explanation.' : 'A simple, private account for creating with live AI. The guided demo is open to everyone.'}</p></div>
      <section className="creator-card" aria-label="Creator account">
        {notice && <div className={`creator-notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}><Icon name={notice.kind === 'error' ? 'info' : 'check'} size={18}/><span>{notice.text}</span></div>}
        {state === 'loading' ? <div className="creator-empty" role="status"><span className="small-icon"><Icon name="user"/></span><h2>Opening creator access…</h2><p>The lesson service may need a moment to wake up.</p></div>
          : state === 'offline' ? <div className="creator-empty"><span className="small-icon"><Icon name="info"/></span><h2>Let’s try that again.</h2><p>Creator access is waking up or unavailable. Your saved lessons are still on this browser.</p><button className="button secondary" onClick={() => { setState('loading'); refresh(); }}>Retry connection</button></div>
          : !creator.auth.configured ? <div className="creator-empty"><span className="small-icon"><Icon name="sparkles"/></span><h2>Keep exploring.</h2><p>Creator access is not connected on this address yet. You can still use the guided demo, edit your canvas, and save lessons on this device.</p><a className="button primary" href="/">Open the guided demo<Icon name="arrowRight" size={16}/></a></div>
          : creator.auth.signedIn ? <>
            <div className="creator-identity"><span className="creator-avatar"><Icon name="user" size={25}/></span><div><span className="eyebrow">SIGNED IN AS CREATOR</span><h2>{creator.auth.user?.name || 'Your account'}</h2><p>{creator.auth.user?.email}</p></div><button className="button ghost" onClick={signOut} disabled={Boolean(action)}>{action === 'sign-out' ? 'Signing out…' : 'Sign out'}</button></div>
            <div className={`creator-ai-status ${creator.ai.available ? 'available' : ''}`}><Icon name="sparkles" size={20}/><div><h3>{creator.ai.available ? allowance.exhausted ? 'Your AI allowance is used for now.' : 'Live AI is ready.' : 'The AI connection is not configured yet.'}</h3><p>{creator.ai.available ? allowance.description || 'Choose Live AI in the studio when you want an AI-generated draft.' : 'Your account is ready. Keep building with the guided demo while the AI connection is set up.'}</p></div></div>
            <a className="button primary creator-continue" href="/">Continue to studio<Icon name="arrowRight" size={16}/></a>
            <div className="creator-password"><h3>Change your password</h3><p>Use your current password to choose a new one.</p><form onSubmit={changePassword}><fieldset className="creator-form-fields" disabled={Boolean(action)}><label className="field">Current password<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128}/></label><label className="field">New password<input name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby="password-help"/></label><p id="password-help" className="creator-field-help">At least 12 characters. A few memorable words work well.</p><button className="button secondary" type="submit">{action === 'password' ? 'Updating password…' : 'Update password'}</button></fieldset></form></div>
          </> : creator.auth.setupAvailable && !setupToken ? <div className="creator-empty"><span className="small-icon"><Icon name="user"/></span><h2>Your studio is almost ready.</h2><p>Open your private setup link to create the first creator account. The guided demo is ready to explore now.</p><a className="button primary" href="/">Open the guided demo<Icon name="arrowRight" size={16}/></a></div>
          : <>
            <div className="creator-form-heading"><h2>{isSetup ? 'Create your account' : 'Sign in to your studio'}</h2><p>{isSetup ? 'Choose the name, email and password you’ll use to sign in.' : 'Use your creator email and password.'}</p></div>
            {setupToken && !creator.auth.setupAvailable && <p className="creator-field-help">This setup link is no longer available. Sign in with your existing creator account.</p>}
            <form key={isSetup ? 'setup' : 'sign-in'} onSubmit={submitAccount}><fieldset className="creator-form-fields" disabled={Boolean(action)}>
              {isSetup && <label className="field">Name<input name="name" autoComplete="name" required maxLength={80}/></label>}
              <label className="field">Email<input name="email" type="email" autoComplete="username" defaultValue={email} required maxLength={254} autoCapitalize="none" spellCheck={false}/></label>
              <label className="field">Password<input name="password" type="password" autoComplete={isSetup ? 'new-password' : 'current-password'} required minLength={12} maxLength={128} aria-describedby={isSetup ? 'setup-password-help' : undefined}/></label>
              {isSetup && <p className="creator-field-help" id="setup-password-help">At least 12 characters. A few memorable words work well.</p>}
              <button className="button primary creator-submit" type="submit">{action ? isSetup ? 'Creating your account…' : 'Signing in…' : isSetup ? 'Create creator account' : 'Sign in'}<Icon name="arrowRight" size={16}/></button>
            </fieldset></form>
          </>}
      </section>
      <p className="creator-local-note"><Icon name="folder" size={16}/>Your lessons stay on this browser. Creator access unlocks AI generation.</p>
    </main>
  </div>;
}
