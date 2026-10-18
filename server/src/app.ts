import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getPrisma } from './db.js';
import { apiRouter } from './modules/index.js';

const version = process.env.npm_package_version ?? '0.1.0';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Azure App Service sits behind one front-end proxy; trust it so rate limits see the client address.
  app.set('trust proxy', 1);
  app.use(helmet());
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

  // Generic error response; detail stays in the server log.
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  };
  app.use(onError);

  return app;
}
