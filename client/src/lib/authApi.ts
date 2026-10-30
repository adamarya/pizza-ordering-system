// Staff and manager sign-in (S2-03) against the session API from #18. The session lives in an
// HttpOnly cookie the page cannot read; the page only keeps the CSRF token the server returns.

export type Role = 'STAFF' | 'MANAGER';
export interface Session { user: { id: string; username: string; role: Role }; csrfToken: string }

export type SignInResult = { ok: true; session: Session } | { ok: false; message: string };

export async function signIn(username: string, password: string): Promise<SignInResult> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, session: json as Session };
  return { ok: false, message: json.error ?? 'Sign-in failed. Please try again.' };
}

/** The current session, or null when nobody is signed in. */
export async function currentSession(): Promise<Session | null> {
  const res = await fetch('/api/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Something went wrong. Please try again.');
  return res.json();
}

export async function signOut(session: Session): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': session.csrfToken } });
}

/** Only same-site paths are allowed as the page to return to, so a link cannot send someone elsewhere. */
export function safeNext(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')) return next;
  return '/manage/menu';
}
