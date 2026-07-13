import express, { type Express } from 'express';
import { config } from './config.js';
import { concurrencyLimiter } from './middleware/concurrency.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { musicPagesRouter } from './routes/musicPages.js';
import { pagesRouter } from './routes/pages.js';
import { reviewRouter } from './routes/review.js';
import { router } from './routes/index.js';

export function createServer(): Express {
  const app = express();

  // Behind a TLS-terminating reverse proxy (Caddy): trust the first hop so
  // req.ip / req.protocol reflect the real client, not the proxy.
  if (config.http.trustProxy) app.set('trust proxy', 1);

  app.disable('x-powered-by');
  // 4mb accommodates a page's hand-drawn overlay PNG posted from the canvas;
  // ordinary requests are tiny.
  app.use(express.json({ limit: '4mb' }));
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
  // Music maker page. Mounted after pagesRouter, which holds the
  // requirePageAuth guard for /music.
  app.use(musicPagesRouter);
  // JSON generation API (/v1/*) and health.
  app.use(router);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
