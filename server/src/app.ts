import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getPrisma } from './db.js';
import { apiRouter } from './modules/index.js';
import { handleWebhook, webhookRawBody } from './modules/payments/payments.routes.js';

const version = process.env.npm_package_version ?? '0.1.0';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Azure App Service sits behind one front-end proxy; trust it so rate limits see the client address.
  app.set('trust proxy', 1);
  // helmet's defaults plus the Stripe origins the hosted card fields need (PB-07, PB-12): Stripe.js
  // loads from js.stripe.com, the card fields are frames served by Stripe, and the browser talks to
  // api.stripe.com directly, so card data never touches this server.
  const stripe = 'https://*.stripe.com';
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          scriptSrc: ["'self'", stripe],
          frameSrc: ["'self'", stripe],
          connectSrc: ["'self'", stripe],
          imgSrc: ["'self'", 'data:', stripe],
        },
      },
    }),
  );
  // The payment webhook needs the raw body for its signature check, so it is mounted before the
  // JSON parser.
  app.post('/api/payments/webhook', webhookRawBody, handleWebhook);
  app.use(express.json({ limit: '100kb' }));

  // Pipeline smoke test (PB-01, Table 22). Returns build version and database reachability only.
  app.get('/health', async (_req, res) => {
    let database = 'up';
    try {
      await getPrisma().$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    res.status(database === 'up' ? 200 : 503).json({ status: database === 'up' ? 'ok' : 'degraded', version, database });
  });

  app.use('/api', apiRouter);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // In production the API also serves the built client, so one command runs the whole application.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(here, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  // Error responses. A request the body parser rejects (malformed JSON, a body over the limit)
  // is the client's mistake, so it gets its own 4xx status and a plain message. Anything else is a
  // generic 500. Either way the response never carries the error's detail, which stays in the
  // server log (PB-12).
  const clientErrors: Record<string, [number, string]> = {
    'entity.parse.failed': [400, 'The request could not be read. Please try again.'],
    'entity.too.large': [413, 'The request is too large.'],
    'encoding.unsupported': [415, 'The request could not be read. Please try again.'],
  };
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const known = typeof err?.type === 'string' ? clientErrors[err.type] : undefined;
    if (known) return res.status(known[0]).json({ error: known[1] });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  };
  app.use(onError);

  return app;
}
