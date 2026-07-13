import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireApiAuth } from '../middleware/requireAuth.js';
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

// --- Storybooks: create books, add illustrated pages -------------------------
router.use('/v1/books', booksApiRouter);
// Published books, browsable by everyone signed in.
router.use('/v1/library', libraryApiRouter);

// --- Music maker: AIMusicAPI song generation + My music / library -------------
router.use('/v1/music', musicApiRouter);

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

// --- Images: Nano Banana Pro (Replicate) / Nano Banana 2 (Gemini) ------------
router.post(
  '/v1/images',
  asyncHandler(async (req, res) => {
    const reqBody = {
      prompt: requireString(req.body, 'prompt'),
      model: optionalString(req.body, 'model', { maxLength: 100 }),
    };
    const outcome = await runGuardedGeneration(storyImageProvider(), reqBody);
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
