import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// A page that changes something must send back the CSRF token it was given at sign-in, which
// another website cannot know. Use it after requireSession, which puts the real token in res.locals.
export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  const sent = req.get('X-CSRF-Token');
  if (!sent || !sameSecret(sent, res.locals.auth.csrfToken)) {
    return res.status(403).json({ error: 'The request could not be verified. Please reload the page.' });
  }
  next();
}
