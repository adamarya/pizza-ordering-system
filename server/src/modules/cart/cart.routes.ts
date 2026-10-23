import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getPrisma } from '../../db.js';
import { getStoreSettings, loadCatalogForQuote, toRates } from '../catalog/catalog.repository.js';
import { calculateQuote } from './pricing.js';
import { quoteRequestSchema } from './quote.schema.js';

// POST /api/cart/quote (PB-04, PB-05). The browser never computes money: it posts the cart lines
// and displays the quote this endpoint returns. Prices always come from the current catalog, so
// a stale or edited price in the browser cannot change what the customer is charged.
export const cartRouter = Router();

// Public endpoint, so it is rate limited per client address (Table 22): 120 quotes a minute is
// far above what a person editing a cart produces, and well below what a script would send.
const quoteLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many pricing requests. Please wait a moment and try again.' },
});

cartRouter.post('/cart/quote', quoteLimiter, async (req, res, next) => {
  try {
    const parsed = quoteRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'The cart could not be read.',
        fields: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const prisma = getPrisma();
    const store = await getStoreSettings(prisma);
    if (!store) return res.status(503).json({ error: 'The menu is not set up yet.' });
    const catalog = await loadCatalogForQuote(prisma, parsed.data.lines.map((l) => l.menuItemId));
    res.json(calculateQuote(parsed.data, catalog, toRates(store)));
  } catch (err) {
    next(err);
  }
});
