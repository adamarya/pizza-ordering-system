import { Router } from 'express';
import { getPrisma } from '../../db.js';
import { requireSession } from '../auth/auth.routes.js';
import { requireRole } from '../auth/requireRole.js';
import { listOpenOrders } from './staff.service.js';

// Staff order queue (PB-09, S2-22). Signed-in staff and managers only: the session says who is
// asking, then requireRole checks the role on the server.
export const staffRouter = Router();

staffRouter.get('/staff/orders', requireSession, requireRole('STAFF', 'MANAGER'), async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ orders: await listOpenOrders(getPrisma()) });
  } catch (err) {
    next(err);
  }
});