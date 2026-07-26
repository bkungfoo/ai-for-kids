import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { currentUniverse, currentUser, experimentalEligible, experimentalState, requireApiAuth, requireHarborUniverse, safetyLevelFor, setExperimental } from '../middleware/requireAuth.js';
import { analyticsMiddleware } from '../analytics/middleware.js';
import { appendEvent } from '../analytics/store.js';
import { activityForPage } from '../analytics/classify.js';
import { buildSummary, buildSeries, type SeriesMetric } from '../analytics/summary.js';
import { claudeCodeProvider } from '../providers/claudeCode.js';
import { elevenLabsProvider } from '../providers/elevenlabs.js';
import { geminiProvider } from '../providers/gemini.js';
import { geminiTtsProvider } from '../providers/geminiTts.js';
import { replicateProvider } from '../providers/replicate.js';
import { storyImageProvider } from '../providers/imageProvider.js';
import { aiMusicConfigured } from '../providers/aiMusic.js';
import { runGuardedGeneration } from '../safety/guardedGeneration.js';
import { config } from '../config.js';
import { booksApiRouter, libraryApiRouter } from './books.js';
import { musicApiRouter } from './musicTracks.js';
import { voicesApiRouter } from './voices.js';
import {
  optionalBoolean,
  optionalString,
  requireString,
  ValidationError,
} from './validate.js';

export const router = Router();

// --- Health / readiness -----------------------------------------------------
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    moderation: { model: config.moderation.model, failClosed: config.moderation.failClosed },
    storyImage: config.storyImage.provider,
    providers: {
      aiMusic: aiMusicConfigured(),
      elevenlabs: elevenLabsProvider.isConfigured(),
      gemini: geminiProvider.isConfigured(),
      replicate: replicateProvider.isConfigured(),
      claudeCode: claudeCodeProvider.isConfigured(),
      geminiTts: geminiTtsProvider.isConfigured(),
    },
  });
});

// All /v1 generation endpoints require a signed-in session.
router.use('/v1', requireApiAuth);
// Usage logging for the analytics dashboard (after auth, before features).
router.use('/v1', analyticsMiddleware);

// --- Analytics ---------------------------------------------------------------
// Heartbeat: pages ping every 30s WHILE the user is actively interacting
// (input events + tab visible), so reading time counts toward time-on-site
// without any API traffic. See summary.ts for the idle-limit semantics.
router.post('/v1/analytics/ping', (req: Request, res: Response) => {
  const page = (req.body as { path?: unknown } | undefined)?.path;
  appendEvent({
    t: Date.now(),
    user: currentUser(req)!,
    universe: currentUniverse(req) ?? 'harborhouse',
    kind: 'ping',
    activity: activityForPage(typeof page === 'string' ? page : '/'),
  });
  res.json({ ok: true });
});

// Time series for the dashboard's line chart: ONE measure, split into
// same-unit series (never two y-scales), bucketed at the requested window.
router.get(
  '/v1/analytics/series',
  asyncHandler(async (req, res) => {
    if (!experimentalEligible(req)) {
      res.status(404).json({ ok: false, error: 'Not found' });
      return;
    }
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
    const bucket = Math.min(86400, Math.max(600, Number(req.query.bucket) || 3600));
    const allowed = ['events', 'genai', 'engaged', 'blocked', 'users'];
    const metric = (allowed.includes(String(req.query.metric)) ? req.query.metric : 'genai') as SeriesMetric;
    res.json({ ok: true, ...(await buildSeries(days, bucket, metric)) });
  }),
);

// The dashboard's data — strictly the primary (HarborHouse) account.
router.get(
  '/v1/analytics/summary',
  asyncHandler(async (req, res) => {
    if (!experimentalEligible(req)) {
      res.status(404).json({ ok: false, error: 'Not found' });
      return;
    }
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
    res.json({ ok: true, summary: await buildSummary(days) });
  }),
);

// --- Experimental features (session-scoped) ----------------------------------
// The landing page asks the PRIMARY account whether to enable experimental
// features (storybook background music) for this login; everyone else is
// always off and never sees the dialog. GET feeds the client bootstrap.
router.get('/v1/experimental', (req: Request, res: Response) => {
  res.json({ ok: true, ...experimentalState(req), universe: currentUniverse(req) ?? 'harborhouse' });
});
router.post('/v1/experimental', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { enabled?: unknown; safetyLevel?: unknown };
  setExperimental(req, body.enabled === true, body.safetyLevel);
  res.json({ ok: true, ...experimentalState(req) });
});

// --- Storybooks: create books, add illustrated pages -------------------------
router.use('/v1/books', booksApiRouter);
// Published books, browsable by everyone signed in.
router.use('/v1/library', libraryApiRouter);

// --- Music maker: AIMusicAPI song generation + My music / library -------------
// Harbor House universe only — public-universe accounts are storybooks-only.
router.use('/v1/music', requireHarborUniverse, musicApiRouter);

// --- Voices: kid voice cloning (record -> clone -> speak) ---------------------
// Harbor House universe only.
router.use('/v1/voices', requireHarborUniverse, voicesApiRouter);

// --- Voice: ElevenLabs ------------------------------------------------------
router.post(
  '/v1/voice',
  requireHarborUniverse,
  asyncHandler(async (req, res) => {
    const reqBody = {
      text: requireString(req.body, 'text'),
      voiceId: optionalString(req.body, 'voiceId', { maxLength: 100 }),
      modelId: optionalString(req.body, 'modelId', { maxLength: 100 }),
    };
    const outcome = await runGuardedGeneration(elevenLabsProvider, reqBody, { safetyLevel: safetyLevelFor(req) });
    res.status(outcome.status).json(outcome.body);
  }),
);

// --- Images: Nano Banana Pro (Replicate) / Nano Banana 2 (Gemini) ------------
router.post(
  '/v1/images',
  asyncHandler(async (req, res) => {
    const reqBody = {
      prompt: requireString(req.body, 'prompt'),
      model: optionalString(req.body, 'model', { maxLength: 100 }),
    };
    const outcome = await runGuardedGeneration(storyImageProvider(), reqBody, { safetyLevel: safetyLevelFor(req) });
    res.status(outcome.status).json(outcome.body);
  }),
);

// --- Vibe coding: Claude Code -----------------------------------------------
router.post(
  '/v1/code',
  requireHarborUniverse,
  asyncHandler(async (req, res) => {
    const reqBody = { prompt: requireString(req.body, 'prompt', { maxLength: 8000 }) };
    const outcome = await runGuardedGeneration(claudeCodeProvider, reqBody, { safetyLevel: safetyLevelFor(req) });
    res.status(outcome.status).json(outcome.body);
  }),
);

// Surface validation errors as 400s (registered on this router so it stays local).
router.use((err: unknown, _req: Request, res: Response, next: (e?: unknown) => void) => {
  if (err instanceof ValidationError) {
    res.status(400).json({ ok: false, error: err.message });
    return;
  }
  next(err);
});
