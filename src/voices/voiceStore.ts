import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * File-backed store for cloned kid voices — one JSON file per voice under
 * data/voices/. The heavy asset (the actual voice model) lives at ElevenLabs,
 * referenced by `elevenVoiceId`; we only keep metadata.
 *
 * A freshly cloned voice starts with kept=false: the child tests it first and
 * then chooses "Save to my voices" or "Publish to library". Unkept voices are
 * pruned after a day — the caller must ALSO delete the remote ElevenLabs voice
 * (account voice slots are a scarce resource), so pruning surfaces the ids.
 */

export interface Voice {
  id: string;
  /** Kid-chosen display name (input-moderated). */
  name: string;
  /** The account that made it — its private "My voices" shelf. */
  owner?: string;
  /** 'draft' lives on the owner's shelf; 'published' also appears in the library. */
  status: 'draft' | 'published';
  /** False until the child chooses to save (or publish) it. */
  kept: boolean;
  /** ElevenLabs voice id backing this entry. */
  elevenVoiceId: string;
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = path.resolve('data', 'voices');
const UNKEPT_TTL_MS = 24 * 60 * 60 * 1000;

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function fileFor(id: string): string | null {
  if (!ID_RE.test(id)) return null;
  return path.join(DATA_DIR, `${id}.json`);
}

async function save(voice: Voice): Promise<void> {
  const file = fileFor(voice.id);
  if (!file) throw new Error(`invalid voice id: ${voice.id}`);
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(voice, null, 2), 'utf8');
  await rename(tmp, file);
}

export async function createVoice(meta: {
  name: string;
  owner?: string;
  elevenVoiceId: string;
}): Promise<Voice> {
  const now = new Date().toISOString();
  const voice: Voice = {
    ...meta,
    id: randomUUID(),
    status: 'draft',
    kept: false,
    createdAt: now,
    updatedAt: now,
  };
  await save(voice);
  return voice;
}

export async function getVoice(id: string): Promise<Voice | undefined> {
  const file = fileFor(id);
  if (!file) return undefined;
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Voice;
  } catch {
    return undefined;
  }
}

/**
 * All voices, newest first. Voices the child tested but never kept expire
 * after a day: they are removed from the store and RETURNED via `expired` so
 * the caller can release the ElevenLabs slot too.
 */
export async function listVoices(): Promise<{ voices: Voice[]; expired: Voice[] }> {
  let entries: string[];
  try {
    entries = await readdir(DATA_DIR);
  } catch {
    return { voices: [], expired: [] };
  }
  const voices: Voice[] = [];
  const expired: Voice[] = [];
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const voice = await getVoice(entry.slice(0, -'.json'.length));
    if (!voice) continue;
    if (!voice.kept && now - Date.parse(voice.createdAt) > UNKEPT_TTL_MS) {
      await deleteVoice(voice.id);
      expired.push(voice);
      continue;
    }
    voices.push(voice);
  }
  return { voices: voices.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), expired };
}

/** "Save to my voices". */
export async function keepVoice(id: string): Promise<Voice | undefined> {
  const voice = await getVoice(id);
  if (!voice) return undefined;
  voice.kept = true;
  voice.updatedAt = new Date().toISOString();
  await save(voice);
  return voice;
}

/** Publish to the shared voice library (implies keeping it). */
export async function publishVoice(id: string): Promise<Voice | undefined> {
  const voice = await getVoice(id);
  if (!voice) return undefined;
  voice.kept = true;
  voice.status = 'published';
  voice.updatedAt = new Date().toISOString();
  await save(voice);
  return voice;
}

/** Pull a published voice back to the private shelf. */
export async function unpublishVoice(id: string): Promise<Voice | undefined> {
  const voice = await getVoice(id);
  if (!voice) return undefined;
  voice.status = 'draft';
  voice.updatedAt = new Date().toISOString();
  await save(voice);
  return voice;
}

export async function deleteVoice(id: string): Promise<boolean> {
  const file = fileFor(id);
  if (!file) return false;
  try {
    await unlink(file);
  } catch {
    return false;
  }
  return true;
}

/** True when another stored voice still points at the same ElevenLabs voice —
 * cloned library voices share the remote model, so the remote slot must only
 * be released when the LAST reference goes. */
export async function elevenIdShared(excludeId: string, elevenVoiceId: string): Promise<boolean> {
  const { voices } = await listVoices();
  return voices.some((v) => v.id !== excludeId && v.elevenVoiceId === elevenVoiceId);
}
