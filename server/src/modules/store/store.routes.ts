import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getPrisma } from '../../db.js';

export const storeRouter = Router();

const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const profileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  streetAddress: z.string().trim().min(1).max(300),
  phone: z.string().trim().min(3).max(40),
  email: z.union([z.string().trim().email().max(254), z.literal('')]),
  openingHours: z.object({
    monday: z.string().trim().max(100),
    tuesday: z.string().trim().max(100),
    wednesday: z.string().trim().max(100),
    thursday: z.string().trim().max(100),
    friday: z.string().trim().max(100),
    saturday: z.string().trim().max(100),
    sunday: z.string().trim().max(100),
  }).strict(),
}).strict();

function publicProfile(store: {
  name: string; description: string; streetAddress: string; phone: string; email: string; openingHours: unknown;
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

function managerTokenMatches(candidate: string | undefined) {
  const expected = process.env.MANAGER_SETTINGS_TOKEN;
  if (!expected || !candidate) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(candidate);
  return a.length === b.length && timingSafeEqual(a, b);
}

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

storeRouter.put('/store/settings', async (req, res, next) => {
  try {
    if (!process.env.MANAGER_SETTINGS_TOKEN) {
      return res.status(503).json({ error: 'Manager editing is disabled until MANAGER_SETTINGS_TOKEN is configured.' });
    }
    const authorization = req.header('authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!managerTokenMatches(token)) return res.status(401).json({ error: 'Manager authorization is required.' });

    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Please correct the store profile fields.',
        fields: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }
    const prisma = getPrisma();
    const current = await prisma.storeSettings.findFirst();
    if (!current) return res.status(503).json({ error: 'Store settings have not been seeded.' });
    const updated = await prisma.storeSettings.update({
      where: { id: current.id },
      data: parsed.data,
    });
    res.json(publicProfile(updated));
  } catch (err) {
    next(err);
  }
});
