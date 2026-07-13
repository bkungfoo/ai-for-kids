import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * File-backed store for generated music. Metadata is one JSON file per track
 * under data/music/; the audio itself is a sibling mp3 under data/music/audio/
 * (audio is megabytes — it does not belong inside JSON).
 *
 * A freshly generated track starts with kept=false: the child listens first
 * and then chooses "Save to My music" or "Publish". Unkept tracks older than a
 * day are pruned whenever the shelf is listed.
 */

export interface Track {
  id: string;
  title: string;
  /** The account that generated it — its private "My music" shelf. */
  owner?: string;
  /** 'draft' lives on the owner's shelf; 'published' also appears in the library. */
  status: 'draft' | 'published';
  /** False until the child chooses to save (or publish) it. */
  kept: boolean;
  /** What was asked for (the child's words + pickers), for display. */
  prompt: string;
  style?: string;
  mood?: string;
  instrumental: boolean;
  /** Lyrics the model wrote (moderated on output). Empty for instrumentals. */
  lyrics?: string;
  mimeType: string;
  durationSec?: number;
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = path.resolve('data', 'music');
const AUDIO_DIR = path.join(DATA_DIR, 'audio');
const UNKEPT_TTL_MS = 24 * 60 * 60 * 1000;

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function fileFor(id: string): string | null {
  if (!ID_RE.test(id)) return null;
  return path.join(DATA_DIR, `${id}.json`);
}

export function audioFileFor(id: string): string | null {
  if (!ID_RE.test(id)) return null;
  return path.join(AUDIO_DIR, `${id}.mp3`);
}

async function save(track: Track): Promise<void> {
  const file = fileFor(track.id);
  if (!file) throw new Error(`invalid track id: ${track.id}`);
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(track, null, 2), 'utf8');
  await rename(tmp, file);
}

export async function createTrack(
  meta: Omit<Track, 'id' | 'status' | 'kept' | 'createdAt' | 'updatedAt'>,
  audio: Buffer,
): Promise<Track> {
  const now = new Date().toISOString();
  const track: Track = {
    ...meta,
    id: randomUUID(),
    status: 'draft',
    kept: false,
    createdAt: now,
    updatedAt: now,
  };
  await mkdir(AUDIO_DIR, { recursive: true });
  await writeFile(audioFileFor(track.id)!, audio);
  await save(track);
  return track;
}

export async function getTrack(id: string): Promise<Track | undefined> {
  const file = fileFor(id);
  if (!file) return undefined;
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Track;
  } catch {
    return undefined;
  }
}

export async function listTracks(): Promise<Track[]> {
  let entries: string[];
  try {
    entries = await readdir(DATA_DIR);
  } catch {
    return [];
  }
  const tracks: Track[] = [];
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const track = await getTrack(entry.slice(0, -'.json'.length));
    if (!track) continue;
    // Prune listen-and-walked-away tracks the child never saved.
    if (!track.kept && now - Date.parse(track.createdAt) > UNKEPT_TTL_MS) {
      await deleteTrack(track.id);
      continue;
    }
    tracks.push(track);
  }
  return tracks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** "Save to My music". */
export async function keepTrack(id: string): Promise<Track | undefined> {
  const track = await getTrack(id);
  if (!track) return undefined;
  track.kept = true;
  track.updatedAt = new Date().toISOString();
  await save(track);
  return track;
}

/** Publish to the shared music library (implies keeping it). */
export async function publishTrack(id: string): Promise<Track | undefined> {
  const track = await getTrack(id);
  if (!track) return undefined;
  track.kept = true;
  track.status = 'published';
  track.updatedAt = new Date().toISOString();
  await save(track);
  return track;
}

/** Pull a published track back to the private shelf. */
export async function unpublishTrack(id: string): Promise<Track | undefined> {
  const track = await getTrack(id);
  if (!track) return undefined;
  track.status = 'draft';
  track.updatedAt = new Date().toISOString();
  await save(track);
  return track;
}

export async function deleteTrack(id: string): Promise<boolean> {
  const file = fileFor(id);
  const audio = audioFileFor(id);
  if (!file || !audio) return false;
  try {
    await unlink(file);
  } catch {
    return false;
  }
  await unlink(audio).catch(() => {});
  return true;
}
