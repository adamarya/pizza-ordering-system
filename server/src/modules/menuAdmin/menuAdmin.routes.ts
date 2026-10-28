import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { timingSafeEqual } from 'node:crypto';
import type { z } from 'zod';
import { getPrisma } from '../../db.js';
import { requireSession } from '../auth/auth.routes.js';
import { fieldErrors } from './menuAdmin.errors.js';
import * as schema from './menuAdmin.schema.js';
import * as menu from './menuAdmin.service.js';

// Menu maintenance API (S2-27, S2-28; PB-10), under /api/admin. Every route needs a signed-in
// session. Prices, text, structure, and retirement are for the manager; store staff may only list
// the menu and switch availability during a shift. Every change must carry the session's CSRF
// token in X-CSRF-Token.
//
// The two guards below are local on purpose: S2-05 (role checks on every staff endpoint) and S2-35
// (CSRF on every state-changing request) give the whole API shared versions, and these routes
// switch to them then.
export const menuAdminRouter = Router();

const adminLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and try again.' },
});

type Role = 'STAFF' | 'MANAGER';
const allow =
  (...roles: Role[]) =>
  (_req: Request, res: Response, next: NextFunction) =>
    roles.includes(res.locals.auth.user.role) ? next() : res.status(403).json({ error: 'You do not have access to this.' });

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function csrf(req: Request, res: Response, next: NextFunction) {
  const sent = req.get('X-CSRF-Token');
  if (!sent || !sameSecret(sent, res.locals.auth.csrfToken)) {
    return res.status(403).json({ error: 'The request could not be verified. Please reload the page.' });
  }
  next();
}

const manager = [requireSession, allow('MANAGER'), csrf];
const staffOrManager = [requireSession, allow('STAFF', 'MANAGER'), csrf];

/** Parses the body and the :id parameter, runs the change, and maps the outcome to a status. */
function handle<S extends z.ZodTypeAny>(
  bodySchema: S,
  run: (body: z.infer<S>, id: string | undefined) => Promise<unknown>,
  created = false,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      let id: string | undefined;
      if (req.params.id !== undefined) {
        const parsedId = schema.idParam.safeParse(req.params.id);
        if (!parsedId.success) return res.status(404).json({ error: 'Not found.' });
        id = parsedId.data;
      }
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Please check the highlighted details.', errors: fieldErrors(parsed.error) });
      }
      const result = await run(parsed.data, id);
      res.set('Cache-Control', 'no-store');
      return res.status(created ? 201 : 200).json(result);
    } catch (err) {
      if (err instanceof menu.NotFound) return res.status(404).json({ error: 'Not found.' });
      if (err instanceof menu.BadRequest) return res.status(400).json({ error: err.message });
      next(err);
    }
  };
}

menuAdminRouter.use('/admin', adminLimiter);

menuAdminRouter.get('/admin/menu', requireSession, allow('STAFF', 'MANAGER'), async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await menu.getAdminMenu(getPrisma()));
  } catch (err) {
    next(err);
  }
});

const p = getPrisma;
menuAdminRouter.post('/admin/categories', ...manager, handle(schema.categoryCreateSchema, (b) => menu.createCategory(p(), b), true));
menuAdminRouter.patch('/admin/categories/:id', ...manager, handle(schema.categoryUpdateSchema, (b, id) => menu.updateCategory(p(), id!, b)));
menuAdminRouter.post('/admin/items', ...manager, handle(schema.itemCreateSchema, (b) => menu.createItem(p(), b), true));
menuAdminRouter.patch('/admin/items/:id', ...manager, handle(schema.itemUpdateSchema, (b, id) => menu.updateItem(p(), id!, b)));
menuAdminRouter.post('/admin/items/:id/sizes', ...manager, handle(schema.sizeCreateSchema, (b, id) => menu.addSize(p(), id!, b), true));
menuAdminRouter.patch('/admin/sizes/:id', ...manager, handle(schema.sizeUpdateSchema, (b, id) => menu.updateSize(p(), id!, b)));
menuAdminRouter.post('/admin/crusts', ...manager, handle(schema.crustCreateSchema, (b) => menu.createCrust(p(), b), true));
menuAdminRouter.patch('/admin/crusts/:id', ...manager, handle(schema.crustUpdateSchema, (b, id) => menu.updateCrust(p(), id!, b)));
menuAdminRouter.post('/admin/toppings', ...manager, handle(schema.toppingCreateSchema, (b) => menu.createTopping(p(), b), true));
menuAdminRouter.patch('/admin/toppings/:id', ...manager, handle(schema.toppingUpdateSchema, (b, id) => menu.updateTopping(p(), id!, b)));
menuAdminRouter.patch('/admin/availability', ...staffOrManager, handle(schema.availabilitySchema, (b) => menu.setAvailability(p(), b)));
