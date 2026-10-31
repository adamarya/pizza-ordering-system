import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getPrisma } from '../../db.js';
import { getStoreSettings, loadCatalogForQuote, toRates } from '../catalog/catalog.repository.js';
import { calculateQuote } from '../cart/pricing.js';
import { checkoutValidateRequestSchema } from './checkout.schema.js';
import { CHECKOUT_SETTINGS, isWithinStoreHours } from './checkout.settings.js';

// POST /api/checkout/validate (Table 25; S2-07, S2-08, S2-09, S2-10). Written by Emmanuella
// Ahinkrah. Checks the fulfillment time, delivery address, and contact details on the server, and
// reprices the cart from the catalog. Prices sent by the browser are never accepted: unknown fields
// are rejected, and every amount comes from calculateQuote (Table 21). The review screen shows the
// returned quote, and its totalCents is what the customer confirms when the order is placed (S2-14).
export const checkoutRouter = Router();

const validateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many checkout attempts. Please wait a moment and try again.' },
});

checkoutRouter.post('/checkout/validate', validateLimiter, async (req, res, next) => {
  try {
    const parsed = checkoutValidateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[issue.path.join('.')] ??= issue.message;
      return res.status(400).json({ error: 'Please check the highlighted details.', errors });
    }
    const data = parsed.data;
    const errors: Record<string, string> = {};

    // Requested time: inside store hours and at least the lead time ahead. Empty means as soon as
    // possible, which needs the store to be open now.
    const now = new Date();
    const when = data.requestedTime ? new Date(data.requestedTime) : now;
    if (data.requestedTime && when.getTime() < now.getTime() + CHECKOUT_SETTINGS.leadMinutes * 60_000) {
      errors.requestedTime = `Please choose a time at least ${CHECKOUT_SETTINGS.leadMinutes} minutes from now.`;
    } else if (!isWithinStoreHours(when)) {
      errors.requestedTime = 'That time is outside our hours (11:00 AM to 10:00 PM).';
    }

    if (data.fulfillment === 'DELIVERY' && data.deliveryAddress) {
      const zip = data.deliveryAddress.zipCode.slice(0, 5);
      if (!(CHECKOUT_SETTINGS.deliveryZipCodes as readonly string[]).includes(zip)) {
        errors['deliveryAddress.zipCode'] = `We don't deliver to ${zip} yet. Pickup is available.`;
      }
    }
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Please check the highlighted details.', errors });
    }

    const prisma = getPrisma();
    const store = await getStoreSettings(prisma);
    if (!store) return res.status(503).json({ error: 'The menu is not set up yet.' });
    const catalog = await loadCatalogForQuote(prisma, data.lines.map((l) => l.menuItemId));
    const quote = calculateQuote(data, catalog, toRates(store));
    if (quote.hasErrors) {
      return res.status(409).json({ error: 'Some items in your cart changed. Please review your cart.', quote });
    }

    res.set('Cache-Control', 'no-store');
    return res.json({
      review: {
        fulfillment: data.fulfillment,
        requestedTime: data.requestedTime ?? null,
        customer: data.customer,
        deliveryAddress: data.fulfillment === 'DELIVERY' ? data.deliveryAddress : null,
        quote,
      },
    });
  } catch (err) {
    next(err);
  }
});
