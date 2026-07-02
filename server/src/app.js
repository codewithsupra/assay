import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import v1 from './routes/v1/index.js';
import * as reports from './controllers/reports.controller.js';
import { errorHandler, notFound } from './middleware/error.js';
import { env } from './config/env.js';

export function createApp() {
  const app = express();

  app.use(helmet());
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

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
