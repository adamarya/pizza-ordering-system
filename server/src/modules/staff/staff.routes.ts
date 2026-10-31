import { Router } from 'express';
import { z } from 'zod';
import { getPrisma } from '../../db.js';
import { requireSession } from '../auth/auth.routes.js';
import { requireCsrf } from '../auth/requireCsrf.js';
import { requireRole } from '../auth/requireRole.js';
import { changeOrderStatus, listOpenOrders } from './staff.service.js';
import { KITCHEN_STATUSES } from './staff.transitions.js';

// Staff order queue (PB-09, S2-22) and status changes (S2-23). Signed-in staff and managers only:
// the session says who is asking, then requireRole checks the role on the server.
export const staffRouter = Router();

staffRouter.get('/staff/orders', requireSession, requireRole('STAFF', 'MANAGER'), async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ orders: await listOpenOrders(getPrisma()) });
  } catch (err) {
    next(err);
  }
});

const statusBody = z.object({ status: z.enum(KITCHEN_STATUSES) });
const MAX_ORDER_NUMBER = 2_147_483_647; // the largest value the database column holds

// Changing something needs the CSRF token as well as the session, so it comes after requireRole.
staffRouter.post(
  '/staff/orders/:orderNumber/status',
  requireSession,
  requireRole('STAFF', 'MANAGER'),
  requireCsrf,
  async (req, res, next) => {
    try {
      const orderNumber = Number(req.params.orderNumber);
      const body = statusBody.safeParse(req.body);
      if (!Number.isInteger(orderNumber) || orderNumber < 1 || orderNumber > MAX_ORDER_NUMBER || !body.success) {
        return res.status(400).json({ error: 'That status change is not valid.' });
      }

      // The history row records the signed-in account, for example "staff:alex".
      const { user } = res.locals.auth;
      const actor = `${String(user.role).toLowerCase()}:${user.username}`;
      const result = await changeOrderStatus(getPrisma(), orderNumber, body.data.status, actor);

      if (result.ok) return res.json({ order: result.order });
      if (result.reason === 'NOT_FOUND') return res.status(404).json({ error: 'Order not found.' });
      if (result.reason === 'CHANGED') {
        return res.status(409).json({ error: 'Someone else just changed this order. Reload the queue.' });
      }
      return res.status(409).json({ error: 'This order cannot move to that status.' });
    } catch (err) {
      next(err);
    }
  },
);
