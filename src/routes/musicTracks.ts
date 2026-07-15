import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { currentUser } from '../middleware/requireAuth.js';
import { logger } from '../logger.js';
import {
  CHILD_SAFE_MUSIC_PREAMBLE,
  aiMusicConfigured,
  downloadAudio,
  pollMusicTask,
  submitMusicTask,
} from '../providers/aiMusic.js';
import { ProviderRequestError } from '../providers/types.js';
import { guardText } from '../safety/pipeline.js';
import { MOOD_PHRASES, STYLE_PHRASES } from '../music/options.js';
import {
  audioFileFor,
  createTrack,
  deleteTrack,
  getTrack,
  keepTrack,
  listTracks,
  publishTrack,
  unpublishTrack,
  type Track,
} from '../music/trackStore.js';
import { optionalBoolean, optionalString, ValidationError } from './validate.js';

/**
 * Kids' music maker API (mounted at /v1/music, behind the child session).
 *
 * Generation is asynchronous upstream (1–3 minutes), so it is asynchronous
 * here too: POST /v1/music moderates the child's words, submits the task and
 * returns a job id; the browser polls GET /v1/music/job/:id while the server
 * polls the provider in the background. When the song is ready, the title and
 * lyrics are output-moderated BEFORE the track is stored — a blocked song is
 * discarded and the child gets the usual gentle message.
 *
 * A finished track starts unsaved (kept=false): the child listens, then picks
 * "Save to My music" or "Publish to the library" (or walks away — unkept
 * tracks are pruned after a day).
 */
export const musicApiRouter = Router();

// --- async jobs (in-memory; a restart forgets in-flight generations) -----------

interface MusicJob {
  id: string;
  owner: string | undefined;
  state: 'working' | 'done' | 'blocked' | 'failed';
  /** Friendly message for blocked/failed states. */
  message?: string;
  /** The finished songs (Suno-style APIs return two takes per generation). */
  tracks?: Track[];
  createdAt: number;
}

const jobs = new Map<string, MusicJob>();
const JOB_TTL_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 8 * 60 * 1000;

function pruneJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}

/** Poll the upstream task until it settles, then finish the job. */
function runJob(job: MusicJob, taskId: string, meta: {
  prompt: string;
  style?: string;
  mood?: string;
  instrumental: boolean;
}): void {
  void (async () => {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    try {
      for (;;) {
        if (Date.now() > deadline) {
          job.state = 'failed';
          job.message = 'The song took too long — please try again!';
          return;
        }
        await sleep(POLL_INTERVAL_MS);
        const status = await pollMusicTask(taskId);
        if (status.state === 'working') continue;
        if (status.state === 'failed') {
          job.state = 'failed';
          job.message = 'The music maker had trouble with that one — please try again!';
          logger.warn('music generation failed upstream', { taskId, error: status.error });
          return;
        }
        // Succeeded: the API returns up to two takes of the song. Each take is
        // output-moderated on its own (title + lyrics face the child) — one
        // bad take shouldn't sink its sibling.
        const tracks: Track[] = [];
        let blockedMessage = '';
        for (const clip of status.clips.slice(0, 2)) {
          const verdict = await guardText([clip.title, clip.lyrics], 'output');
          if (!verdict.allowed) {
            blockedMessage =
              verdict.childMessage || "Let's try a different idea — keep it friendly and safe!";
            logger.warn('music take blocked on output', { taskId, categories: verdict.categories });
            continue;
          }
          const audio = await downloadAudio(clip.audioUrl);
          tracks.push(
            await createTrack(
              {
                title: (clip.title || meta.prompt || 'My song').slice(0, 120),
                owner: job.owner,
                prompt: meta.prompt,
                ...(meta.style ? { style: meta.style } : {}),
                ...(meta.mood ? { mood: meta.mood } : {}),
                instrumental: meta.instrumental,
                ...(clip.lyrics && !meta.instrumental ? { lyrics: clip.lyrics.slice(0, 4000) } : {}),
                mimeType: audio.mimeType,
                ...(clip.durationSec ? { durationSec: clip.durationSec } : {}),
              },
              audio.bytes,
            ),
          );
        }
        if (!tracks.length) {
          job.state = 'blocked';
          job.message = blockedMessage || "Let's try a different idea — keep it friendly and safe!";
          return;
        }
        job.tracks = tracks;
        job.state = 'done';
        logger.info('music generated', { taskId, trackIds: tracks.map((t) => t.id) });
        return;
      }
    } catch (err) {
      job.state = 'failed';
      job.message = 'The music maker had trouble with that one — please try again!';
      logger.error('music job error', {
        taskId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --- generate ------------------------------------------------------------------

musicApiRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!aiMusicConfigured()) {
      res.status(501).json({ ok: false, error: 'The music maker is not configured yet' });
      return;
    }
    pruneJobs();
    // One generation at a time per account — a double-press must never queue
    // a second paid job while one is running.
    for (const other of jobs.values()) {
      if (other.owner === currentUser(req) && other.state === 'working') {
        res.status(409).json({ ok: false, error: 'Your last song is still being made — wait for it to finish!' });
        return;
      }
    }

    const prompt = optionalString(req.body, 'prompt', { maxLength: 500 })?.trim() ?? '';
    const styleId = optionalString(req.body, 'style', { maxLength: 20 });
    const moodId = optionalString(req.body, 'mood', { maxLength: 20 });
    const instrumental = optionalBoolean(req.body, 'instrumental') ?? false;
    const style = styleId ? STYLE_PHRASES[styleId] : undefined;
    const mood = moodId ? MOOD_PHRASES[moodId] : undefined;
    if (styleId && !style) throw new ValidationError('unknown "style"');
    if (moodId && !mood) throw new ValidationError('unknown "mood"');
    if (!prompt && !style && !mood) {
      throw new ValidationError('Pick a style or mood, or describe your song');
    }

    // The child's own words are the only free text — moderate them as input.
    if (prompt) {
      const verdict = await guardText([prompt], 'input');
      if (!verdict.allowed) {
        res.status(403).json({
          ok: false,
          blocked: true,
          stage: 'input',
          message: verdict.childMessage,
          verdict: { severity: verdict.severity, categories: verdict.categories },
        });
        return;
      }
    }

    // Child-safety preamble first, then the pickers and the child's words.
    const parts: string[] = [CHILD_SAFE_MUSIC_PREAMBLE];
    parts.push(instrumental ? 'An instrumental piece (no vocals).' : 'A song with sung lyrics.');
    if (mood) parts.push(`Mood: ${mood}.`);
    if (style) parts.push(`Style: ${style}.`);
    if (prompt) parts.push(`The song is about: ${prompt}`);
    const description = parts.join(' ');

    const taskId = await submitMusicTask(description, instrumental);
    const job: MusicJob = {
      id: randomUUID(),
      owner: currentUser(req),
      state: 'working',
      createdAt: Date.now(),
    };
    jobs.set(job.id, job);
    runJob(job, taskId, {
      prompt,
      ...(styleId ? { style: styleId } : {}),
      ...(moodId ? { mood: moodId } : {}),
      instrumental,
    });
    res.status(202).json({ ok: true, jobId: job.id });
  }),
);

musicApiRouter.get('/job/:id', (req: Request, res: Response) => {
  const job = jobs.get(req.params.id ?? '');
  if (!job || job.owner !== currentUser(req)) {
    res.status(404).json({ ok: false, error: 'Job not found' });
    return;
  }
  res.json({
    ok: true,
    state: job.state,
    ...(job.message ? { message: job.message } : {}),
    ...(job.tracks ? { tracks: job.tracks.map(publicTrack) } : {}),
  });
});

// --- shelves ---------------------------------------------------------------------

function publicTrack(t: Track) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    kept: t.kept,
    prompt: t.prompt,
    style: t.style,
    mood: t.mood,
    instrumental: t.instrumental,
    lyrics: t.lyrics,
    durationSec: t.durationSec,
    createdAt: t.createdAt,
  };
}

// "My music" — the signed-in account's kept tracks.
musicApiRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const tracks = (await listTracks()).filter((t) => t.owner === user && t.kept);
    res.json({ ok: true, tracks: tracks.map(publicTrack) });
  }),
);

// The shared music library — everyone's published tracks.
musicApiRouter.get(
  '/library',
  asyncHandler(async (_req, res) => {
    const tracks = (await listTracks()).filter((t) => t.status === 'published');
    res.json({ ok: true, tracks: tracks.map(publicTrack) });
  }),
);

// --- per-track ---------------------------------------------------------------------

/** Owner always; anyone signed in for published tracks. */
async function readableTrack(req: Request): Promise<Track | undefined> {
  const track = await getTrack(req.params.id ?? '');
  if (!track) return undefined;
  if (track.owner === currentUser(req) || track.status === 'published') return track;
  return undefined;
}

musicApiRouter.get(
  '/:id/audio',
  asyncHandler(async (req, res) => {
    const track = await readableTrack(req);
    const file = track ? audioFileFor(track.id) : null;
    if (!track || !file) {
      res.status(404).json({ ok: false, error: 'Track not found' });
      return;
    }
    try {
      const info = await stat(file);
      res.set('content-type', track.mimeType);
      res.set('content-length', String(info.size));
      res.set('cache-control', 'private, max-age=3600');
      createReadStream(file).pipe(res);
    } catch {
      res.status(404).json({ ok: false, error: 'Audio not found' });
    }
  }),
);

/** Owner-only mutations. */
async function ownedTrack(req: Request, res: Response): Promise<Track | undefined> {
  const track = await getTrack(req.params.id ?? '');
  const user = currentUser(req);
  if (!track || !user || track.owner !== user) {
    res.status(404).json({ ok: false, error: 'Track not found' });
    return undefined;
  }
  return track;
}

musicApiRouter.post(
  '/:id/keep',
  asyncHandler(async (req, res) => {
    const track = await ownedTrack(req, res);
    if (!track) return;
    const updated = await keepTrack(track.id);
    res.json({ ok: true, track: publicTrack(updated!) });
  }),
);

musicApiRouter.post(
  '/:id/publish',
  asyncHandler(async (req, res) => {
    const track = await ownedTrack(req, res);
    if (!track) return;
    const updated = await publishTrack(track.id);
    res.json({ ok: true, track: publicTrack(updated!) });
  }),
);

musicApiRouter.post(
  '/:id/unpublish',
  asyncHandler(async (req, res) => {
    const track = await ownedTrack(req, res);
    if (!track) return;
    if (track.status !== 'published') {
      res.status(409).json({ ok: false, error: 'This song is not in the library' });
      return;
    }
    const updated = await unpublishTrack(track.id);
    res.json({ ok: true, track: publicTrack(updated!) });
  }),
);

musicApiRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const track = await ownedTrack(req, res);
    if (!track) return;
    await deleteTrack(track.id);
    res.json({ ok: true });
  }),
);

// Surface validation errors as 400s, and upstream failures (e.g. a rejected
// API key at submit time) as friendly 502s instead of a bare 500.
musicApiRouter.use((err: unknown, _req: Request, res: Response, next: (e?: unknown) => void) => {
  if (err instanceof ValidationError) {
    res.status(400).json({ ok: false, error: err.message });
    return;
  }
  if (err instanceof ProviderRequestError) {
    logger.error('music provider error', { message: err.message });
    res.status(502).json({ ok: false, error: 'The music maker had trouble — please try again!' });
    return;
  }
  next(err);
});
