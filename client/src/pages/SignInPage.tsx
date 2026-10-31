import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { currentSession, safeNext, signIn, signOut, type Session } from '../lib/authApi';
import './SignInPage.css';

// Staff and manager sign-in (S2-03, PB-11) for the session API in #18. Customers never need an
// account. The password goes only to POST /api/auth/login; the session is an HttpOnly cookie, so
// this page never holds it. Every failed sign-in gets the same message, so the page does not say
// which usernames exist.
export function SignInPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    currentSession()
      .then(setSession)
      .catch(() => setSession(null));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!username.trim() || !password) {
      setMessage('Enter your username and password.');
      return;
    }
    setBusy(true);
    try {
      const result = await signIn(username.trim(), password);
      if (result.ok) {
        setPassword('');
        navigate(next, { replace: true });
      } else {
        setMessage(result.message);
        setPassword('');
      }
    } catch {
      setMessage('We could not reach the restaurant. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (!session) return;
    setBusy(true);
    try {
      await signOut(session);
    } finally {
      setSession(null);
      setBusy(false);
    }
  }

  if (session === undefined) return <section className="page sign-in"><h1>Staff sign-in</h1><p>Loading…</p></section>;

  if (session) {
    return (
      <section className="page sign-in">
        <h1>Staff sign-in</h1>
        <div className="card">
          <p>
            You are signed in as <strong>{session.user.username}</strong> ({session.user.role === 'MANAGER' ? 'manager' : 'staff'}).
          </p>
          <p>
            <Link to="/manage/menu">Manage the menu</Link>
          </p>
          <button type="button" className="button-secondary" onClick={leave} disabled={busy}>
            Sign out
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="page sign-in">
      <h1>Staff sign-in</h1>
      <p className="muted">For restaurant staff and the manager. Customers can order without an account.</p>
      <form className="card sign-in-form" onSubmit={submit} noValidate>
        {message && (
          <p role="alert" className="error-text">
            {message}
          </p>
        )}
        <label htmlFor="sign-in-username">Username</label>
        <input id="sign-in-username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <label htmlFor="sign-in-password">Password</label>
        <input
          id="sign-in-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="button" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </section>
  );
}
