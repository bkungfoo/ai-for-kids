import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { currentUser, safetyLevelFor } from '../middleware/requireAuth.js';
import { guardText, permittedAtLevel } from '../safety/pipeline.js';
import { logger } from '../logger.js';
import {
  cloneVoice,
  deleteRemoteVoice,
  speakWithVoice,
  voicesConfigured,
} from '../providers/elevenVoices.js';
import {
  createVoice,
  deleteVoice,
  elevenIdShared,
  getVoice,
  keepVoice,
  listVoices,
  publishVoice,
  unpublishVoice,
  type Voice,
} from '../voices/voiceStore.js';
import { requireString, ValidationError } from './validate.js';

/**
 * The Voices feature: a kid records ~15s of speech, ElevenLabs clones it into
 * a voice id, and the kid can make it say (input-moderated!) words. Mirrors
 * the music maker's shape: private "My voices" shelf + shared library.
 */
export const voicesApiRouter = Router();

/** ≥15s of speech is required for a decent clone; this is the rough floor a
 * 15-second opus/webm recording can't realistically be smaller than. */
const MIN_AUDIO_BYTES = 50_000;
const MAX_AUDIO_BYTES = 8_000_000;

function publicVoice(v: Voice, req: Request) {
  return {
    id: v.id,
    name: v.name,
    status: v.status,
    mine: v.owner === currentUser(req),
    createdAt: v.createdAt,
  };
}

/** Release expired ElevenLabs slots surfaced by the store's TTL pruning. */
function releaseExpired(expired: Voice[]): void {
  for (const voice of expired) {
    void elevenIdShared(voice.id, voice.elevenVoiceId).then((shared) => {
      if (shared) return; // a clone still references the remote voice
      return deleteRemoteVoice(voice.elevenVoiceId);
    }).catch((err) => {
      logger.warn('failed to delete expired remote voice', {
        voiceId: voice.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

// Clone a new voice from a recording (base64 JSON keeps the body parser happy;
// a 15-60s opus recording is well under the 4 MB limit).
voicesApiRouter.post(
  '/clone',
  asyncHandler(async (req, res) => {
    if (!voicesConfigured()) {
      res.status(501).json({ ok: false, error: 'The voice maker is not configured yet' });
      return;
    }
    const name = requireString(req.body, 'name', { maxLength: 40 }).trim();
    const audioBase64 = requireString(req.body, 'audioBase64', { maxLength: 11_000_000 });
    const mimeType = requireString(req.body, 'mimeType', { maxLength: 60 });
    if (!name) throw new ValidationError('Give your voice a name first');
    if (!/^audio\//.test(mimeType)) throw new ValidationError('Not an audio recording');

    let audio: Buffer;
    try {
      audio = Buffer.from(audioBase64, 'base64');
    } catch {
      throw new ValidationError('Bad audio data');
    }
    if (audio.length < MIN_AUDIO_BYTES) {
      res.status(422).json({ ok: false, error: 'That recording is too short — talk for at least 15 seconds!' });
      return;
    }
    if (audio.length > MAX_AUDIO_BYTES) {
      throw new ValidationError('That recording is too long');
    }

    // The kid-typed voice name is free text — moderate it as input.
    const verdict = await guardText([name], 'input');
    if (!permittedAtLevel(verdict, safetyLevelFor(req))) {
      res.status(403).json({
        ok: false,
        blocked: true,
        stage: 'input',
        message: verdict.childMessage,
        verdict: { severity: verdict.severity, categories: verdict.categories },
      });
      return;
    }

    const elevenVoiceId = await cloneVoice(name, audio, mimeType);
    const voice = await createVoice({ name, owner: currentUser(req), elevenVoiceId });
    logger.info('voice cloned', { voiceId: voice.id, owner: voice.owner });
    res.json({ ok: true, voice: publicVoice(voice, req) });
  }),
);

// Make a voice speak. Owners can test their drafts; published voices are open
// to everyone signed in. The text is the risky surface — always moderated.
voicesApiRouter.post(
  '/:id/speak',
  asyncHandler(async (req, res) => {
    const voice = await getVoice(req.params.id ?? '');
    if (!voice || (voice.owner !== currentUser(req) && voice.status !== 'published')) {
      res.status(404).json({ ok: false, error: 'Voice not found' });
      return;
    }
    const text = requireString(req.body, 'text', { maxLength: 300 }).trim();
    if (!text) throw new ValidationError('Type some words to say first');

    const verdict = await guardText([text], 'input');
    if (!permittedAtLevel(verdict, safetyLevelFor(req))) {
      res.status(403).json({
        ok: false,
        blocked: true,
        stage: 'input',
        message: verdict.childMessage,
        verdict: { severity: verdict.severity, categories: verdict.categories },
      });
      return;
    }

    const audio = await speakWithVoice(voice.elevenVoiceId, text);
    res.set('content-type', audio.mimeType);
    res.set('content-length', String(audio.bytes.length));
    res.send(audio.bytes);
  }),
);

// My voices (kept ones only — unkept drafts live inside the maker page flow).
voicesApiRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { voices, expired } = await listVoices();
    releaseExpired(expired);
    const mine = voices.filter((v) => v.owner === currentUser(req) && v.kept);
    res.json({ ok: true, voices: mine.map((v) => publicVoice(v, req)) });
  }),
);

// The shared library: everyone's published voices.
voicesApiRouter.get(
  '/library',
  asyncHandler(async (req, res) => {
    const { voices, expired } = await listVoices();
    releaseExpired(expired);
    const published = voices.filter((v) => v.status === 'published');
    res.json({ ok: true, voices: published.map((v) => publicVoice(v, req)) });
  }),
);

function ownedVoice(req: Request, res: Response, voice: Voice | undefined): voice is Voice {
  if (!voice || voice.owner !== currentUser(req)) {
    res.status(404).json({ ok: false, error: 'Voice not found' });
    return false;
  }
  return true;
}

// Save a copy of a library voice (or one of your own) to My voices: a new
// record pointing at the same remote ElevenLabs voice. The remote slot is
// reference-counted at delete time, so either copy outliving the other is fine.
voicesApiRouter.post(
  '/:id/clone',
  asyncHandler(async (req, res) => {
    const src = await getVoice(req.params.id ?? '');
    if (!src || (src.owner !== currentUser(req) && src.status !== 'published')) {
      res.status(404).json({ ok: false, error: 'Voice not found' });
      return;
    }
    const copy = await createVoice({
      name: src.name,
      owner: currentUser(req),
      elevenVoiceId: src.elevenVoiceId,
    });
    await keepVoice(copy.id); // it lands straight on the kid's shelf, unpublished
    copy.kept = true;
    logger.info('voice cloned', { from: src.id, to: copy.id, owner: copy.owner });
    res.json({ ok: true, voice: publicVoice(copy, req) });
  }),
);

voicesApiRouter.post(
  '/:id/save',
  asyncHandler(async (req, res) => {
    const voice = await getVoice(req.params.id ?? '');
    if (!ownedVoice(req, res, voice)) return;
    const updated = await keepVoice(voice.id);
    res.json({ ok: true, voice: publicVoice(updated!, req) });
  }),
);

voicesApiRouter.post(
  '/:id/publish',
  asyncHandler(async (req, res) => {
    const voice = await getVoice(req.params.id ?? '');
    if (!ownedVoice(req, res, voice)) return;
    const updated = await publishVoice(voice.id);
    res.json({ ok: true, voice: publicVoice(updated!, req) });
  }),
);

voicesApiRouter.post(
  '/:id/unpublish',
  asyncHandler(async (req, res) => {
    const voice = await getVoice(req.params.id ?? '');
    if (!ownedVoice(req, res, voice)) return;
    const updated = await unpublishVoice(voice.id);
    res.json({ ok: true, voice: publicVoice(updated!, req) });
  }),
);

// Delete: remove our record AND release the ElevenLabs voice slot.
voicesApiRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const voice = await getVoice(req.params.id ?? '');
    if (!ownedVoice(req, res, voice)) return;
    await deleteVoice(voice.id);
    if (await elevenIdShared(voice.id, voice.elevenVoiceId)) {
      res.json({ ok: true });
      return; // another copy still uses the remote voice — keep it
    }
    deleteRemoteVoice(voice.elevenVoiceId).catch((err) => {
      logger.warn('failed to delete remote voice', {
        voiceId: voice.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    res.json({ ok: true });
  }),
);
