import { Router } from 'express';
import { z } from 'zod';
import { getPrisma } from '../../db.js';

export const storeRouter = Router();

function publicProfile(store: {
  name: string;
  description: string;
  streetAddress: string;
  phone: string;
  email: string;
  openingHours: unknown;
}) {
  const parsedHours = z.record(z.string()).safeParse(store.openingHours);
  return {
    name: store.name,
    description: store.description,
    streetAddress: store.streetAddress,
    phone: store.phone,
    email: store.email,
    openingHours: parsedHours.success ? parsedHours.data : {},
  };
}

// Public, read-only store profile. Values are maintained through seed data for now.
// Manager editing will be connected after staff authentication and role checks are merged.
storeRouter.get('/store', async (_req, res, next) => {
  try {
    const store = await getPrisma().storeSettings.findFirst();
    if (!store) return res.status(503).json({ error: 'Store profile is not configured yet.' });
    res.setHeader('Cache-Control', 'no-cache');
    res.json(publicProfile(store));
  } catch (err) {
    next(err);
  }
});
