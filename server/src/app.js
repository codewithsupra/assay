import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import v1 from './routes/v1/index.js';
import * as reports from './controllers/reports.controller.js';
import { errorHandler, notFound } from './middleware/error.js';
import { env } from './config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, '../../client/dist');

export function createApp() {
  const app = express();

  app.use(
    helmet({
      // Google Fonts + the SPA's own bundle need a slightly looser CSP than
      // helmet's locked-down default; everything else stays same-origin.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
        },
      },
    })
  );
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));
  if (env.NODE_ENV !== 'test') app.use(morgan('tiny'));

  // Global rate limit as a blanket floor; auth routes tighten it further.
  app.use(rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true }));

  app.get('/health', (req, res) => res.json({ ok: true, service: 'assay', ts: Date.now() }));

  app.use('/api/v1', v1);

  // Public report surface (no auth): page, raw signed JSON, and README badge.
  // Specific suffixes first so they aren't swallowed by the page route.
  app.get('/r/:publicId.json', reports.publicReportJson);
  app.get('/r/:publicId/badge.svg', reports.reportBadge);
  app.get('/r/:publicId', reports.publicReportPage);

  // Serve the built SPA if present (production/Docker). In local dev the
  // client runs on its own Vite server instead, so this is a no-op then.
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get('*', (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
