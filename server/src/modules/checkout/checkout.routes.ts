import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { checkoutReviewRequestSchema } from './checkout.schema.js';
// Imported from the quote module/store settings as cart. routes does
import { calculateQuote } from '../quote/quote.service.js';
import { getStoreSettings } from '../store/store.service.js';

export const checkoutRouter = Router();

// Rate limiter matching quote endpoint to prevent price-scraping or abuse
const reviewRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: { error: 'Too many review requests, please try again shortly.' },
  standardHeaders: true,
  legacyHeaders: false,
});

checkoutRouter.use(reviewRateLimiter);

// Default delivery ZIP codes until store settings S2-46 merges
const FALLBACK_STORE_SETTINGS = {
  timeZone: 'America/Denver',
  openHour: 11,
  closeHour: 22,
  deliveryZipCodes: ['80202', '80203', '80204', '80205', '80206', '80211', '80212'],
  deliveryFeeCents: 399,
  taxRateBasisPoints: 825, // 8.25%
};

/**
 * Validates requested time in store timezone (Denver) to avoid Azure UTC mismatch
 */
function isWithinStoreHours(isoString: string, timeZone: string, openHour: number, closeHour: number): boolean {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return false;

  const formatter = new Intl. DateTimeFormat (' en-US ', {DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const hourPart = parts.find((p) => p.type === 'hour');
  const storeHour = hourPart ? parseInt(hourPart.value, 10) : date.getUTCHours();

  return storeHour >= openHour && storeHour < closeHour;
}

// Mounted at /api/checkout, so this route is POST /api/checkout/review
checkoutRouter.post('/review', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = checkoutReviewRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parseResult.error.issues) {
        fieldErrors[issue.path.join('.')] = issue.message;
      }
      return res.status(400).json({ success: false, errors: fieldErrors });
    }

    const data = parseResult.data;
    const errors: Record<string, string> = {};

    // Retrieve live store settings or fallback
    let settings = FALLBACK_STORE_SETTINGS;
    try {
      if (typeof getStoreSettings === 'function') {
        const liveSettings = await getStoreSettings();
        if (liveSettings) settings = { ...settings, ...liveSettings };
      }
    } catch {
      // Fallback kept gracefully until S2-46 merges
    }

    // 1. Timezone-aware store hours check
    const isOpen = isWithinStoreHours(
      data.requestedTime,
      settings.timeZone,
      settings.openHour,
      settings.closeHour
    );
    if (!isOpen) {
      errors['requestedTime'] = `Requested time is outside store operating hours (${settings.openHour}:00 - ${settings.closeHour}:00 ${settings.timeZone}).`;
    }

    // 2. US ZIP Code Delivery area check
    if (data.fulfillmentType === 'delivery' && data.deliveryAddress) {
      const zip = data.deliveryAddress.zipCode.slice(0, 5);
      if (!settings.deliveryZipCodes.includes(zip)) {
        errors['deliveryAddress.zipCode'] = `Delivery is unavailable for ZIP code ${zip}. Please choose pickup or enter an eligible delivery address.`;
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // 3. Server-side quote repricing using calculateQuote (ignores ANY client-supplied price)
    // All numbers in INTEGER CENTS as per Table 21
    const quote = await calculateQuote({
      items: data.items,
      fulfillmentType: data.fulfillmentType,
    });

    const subtotalCents = quote.subtotalCents;
    const deliveryFeeCents = data.fulfillmentType === 'delivery'? settings.deliveryFeeCents : 0;
    
    // Tax calculation following Table 21 integer math
    const taxableSubtotalCents = subtotalCents + deliveryFeeCents;
    const taxCents = Math.round((taxableSubtotalCents * settings.taxRateBasisPoints) / 10000);
    const totalCents = subtotalCents + deliveryFeeCents + taxCents + data.tipCents;

    return res.status(200).json({
      success: true,
      review: {
        fulfillmentType: data.fulfillmentType,
        requestedTime: data.requestedTime,
        customer: data.customer,
        deliveryAddress: data.deliveryAddress || null,
        items: quote.items, // Server-verified items and descriptions
        pricing: {
          subtotalCents,
          deliveryFeeCents,
          taxCents,
          tipCents: data.tipCents,
          totalCents,
          currency: 'USD',
        },
      },
    });
  } catch (err) {
    return next(err);
  }
});
