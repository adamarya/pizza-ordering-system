import type { NextFunction, Request, Response } from 'express';

export type Role = 'STAFF' | 'MANAGER';

// S2-05: the server decides who may use an endpoint from the signed-in account's role, never from
// anything the page says. Put it after requireSession, which sets res.locals.auth. If a route is
// mounted without requireSession, there is no account to check, so the request is refused.
export function requireRole(...roles: Role[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const role = res.locals.auth?.user?.role;
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ error: 'You do not have access to this.' });
    }
    next();
  };
}