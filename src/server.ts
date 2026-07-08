import express, { type Express } from 'express';
import { concurrencyLimiter } from './middleware/concurrency.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { pagesRouter } from './routes/pages.js';
import { reviewRouter } from './routes/review.js';
import { router } from './routes/index.js';

export function createServer(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false })); // login form posts

  // Bound concurrent in-flight requests (supports many simultaneous clients
  // while shedding load past the configured ceiling).
  app.use(concurrencyLimiter);

  // Login page, login/logout handlers.
  app.use(authRouter);
  // Adult-only operator review area (/review, /v1/review/*). Mounted BEFORE the
  // child API so its /v1/review/* routes aren't caught by the child-auth guard.
  app.use(reviewRouter);
  // Authenticated browser pages (landing hub + per-tool pages).
  app.use(pagesRouter);
  // JSON generation API (/v1/*) and health.
  app.use(router);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
