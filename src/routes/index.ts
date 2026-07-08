import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireApiAuth } from '../middleware/requireAuth.js';
import { claudeCodeProvider } from '../providers/claudeCode.js';
import { elevenLabsProvider } from '../providers/elevenlabs.js';
import { geminiProvider } from '../providers/gemini.js';
import { sunoProvider } from '../providers/suno.js';
import { runGuardedGeneration } from '../safety/guardedGeneration.js';
import { config } from '../config.js';
import { booksApiRouter, libraryApiRouter } from './books.js';
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
    providers: {
      suno: sunoProvider.isConfigured(),
      elevenlabs: elevenLabsProvider.isConfigured(),
      gemini: geminiProvider.isConfigured(),
      claudeCode: claudeCodeProvider.isConfigured(),
    },
  });
});

// All /v1 generation endpoints require a signed-in session.
router.use('/v1', requireApiAuth);

// --- Storybooks: create books, add illustrated pages -------------------------
router.use('/v1/books', booksApiRouter);
// Published books, browsable by everyone signed in.
router.use('/v1/library', libraryApiRouter);

// --- Music: Suno ------------------------------------------------------------
router.post(
  '/v1/music',
  asyncHandler(async (req, res) => {
    const reqBody = {
      prompt: requireString(req.body, 'prompt'),
      style: optionalString(req.body, 'style', { maxLength: 200 }),
      instrumental: optionalBoolean(req.body, 'instrumental'),
    };
    const outcome = await runGuardedGeneration(sunoProvider, reqBody);
    res.status(outcome.status).json(outcome.body);
  }),
);

// --- Voice: ElevenLabs ------------------------------------------------------
router.post(
  '/v1/voice',
  asyncHandler(async (req, res) => {
    const reqBody = {
      text: requireString(req.body, 'text'),
      voiceId: optionalString(req.body, 'voiceId', { maxLength: 100 }),
      modelId: optionalString(req.body, 'modelId', { maxLength: 100 }),
    };
    const outcome = await runGuardedGeneration(elevenLabsProvider, reqBody);
    res.status(outcome.status).json(outcome.body);
  }),
);

// --- Images: Gemini / Banana Pro --------------------------------------------
router.post(
  '/v1/images',
  asyncHandler(async (req, res) => {
    const reqBody = {
      prompt: requireString(req.body, 'prompt'),
      model: optionalString(req.body, 'model', { maxLength: 100 }),
    };
    const outcome = await runGuardedGeneration(geminiProvider, reqBody);
    res.status(outcome.status).json(outcome.body);
  }),
);

// --- Vibe coding: Claude Code -----------------------------------------------
router.post(
  '/v1/code',
  asyncHandler(async (req, res) => {
    const reqBody = { prompt: requireString(req.body, 'prompt', { maxLength: 8000 }) };
    const outcome = await runGuardedGeneration(claudeCodeProvider, reqBody);
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
