import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Local settings live in server/.env (copied from .env.example). Whether the API runs from src
// in development or from dist in production, that file is one folder up. On Azure the values come
// from the web app's environment variables instead, and no .env file exists.
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

// An unset value and an empty one (`KEY=` in .env.example) both mean "not configured".
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema.optional());

// All settings come from the environment (S1-07). Nothing secret is written in code.
// Stripe keys (PB-07, S2-12): this project runs in a Stripe sandbox only, so live keys are refused
// outright. A restricted key (rk_test_) with only the PaymentIntents permissions it needs is
// preferred to a full secret key (sk_test_).
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  STRIPE_SECRET_KEY: optional(z.string().regex(/^(rk|sk)_test_\w+$/, 'must be a test-mode restricted or secret key')),
  STRIPE_PUBLISHABLE_KEY: optional(z.string().regex(/^pk_test_\w+$/, 'must be a test-mode publishable key')),
  STRIPE_WEBHOOK_SECRET: optional(z.string().regex(/^whsec_\w+$/, 'must be a webhook signing secret')),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration. See .env.example.');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
