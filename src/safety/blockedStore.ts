import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * File-backed audit store of generated images the safety pipeline BLOCKED
 * (output moderation or Vision SafeSearch). The child never sees these; they
 * exist solely so an operator can review what was stopped and why, in the
 * adult-only /review area. One JSON file per entry under data/blocked/,
 * newest-first by filename (ISO timestamp prefix), pruned to a cap.
 */

export interface BlockedImage {
  mimeType: string;
  dataBase64: string;
}

export interface BlockedEntry {
  id: string;
  createdAt: string;
  /** Which provider generated the blocked image(s). */
  provider: string;
  /** Which safety stage stopped it: output text moderation or SafeSearch. */
  stage: 'output' | 'image';
  severity: string;
  categories: string[];
  /** Internal moderation reason — operator-only, never shown to children. */
  reason: string;
  /** The prompt/context texts that produced the generation. */
  inputTexts: string[];
  /** Text the model returned alongside the image(s). */
  captions: string[];
  images: BlockedImage[];
}

const DATA_DIR = path.resolve('data', 'blocked');
const MAX_ENTRIES = 200;

export async function recordBlocked(
  entry: Omit<BlockedEntry, 'id' | 'createdAt'>,
): Promise<void> {
  const full: BlockedEntry = { id: randomUUID(), createdAt: new Date().toISOString(), ...entry };
  await mkdir(DATA_DIR, { recursive: true });
  // Timestamp-first filename so a plain sort is chronological.
  const file = path.join(DATA_DIR, `${full.createdAt.replace(/[:.]/g, '-')}-${full.id}.json`);
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(full), 'utf8');
  await rename(tmp, file);
  await prune();
}

/** Newest entries first, up to `limit`. */
export async function listBlocked(limit: number): Promise<BlockedEntry[]> {
  let files: string[];
  try {
    files = await readdir(DATA_DIR);
  } catch {
    return []; // directory not created yet — nothing blocked so far
  }
  const newest = files
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit);
  const out: BlockedEntry[] = [];
  for (const f of newest) {
    try {
      out.push(JSON.parse(await readFile(path.join(DATA_DIR, f), 'utf8')) as BlockedEntry);
    } catch {
      // unreadable entry — skip it rather than break the gallery
    }
  }
  return out;
}

/** Delete the oldest entries beyond the cap (blocked images are large). */
async function prune(): Promise<void> {
  const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith('.json')).sort();
  const excess = files.length - MAX_ENTRIES;
  for (let i = 0; i < excess; i++) {
    await unlink(path.join(DATA_DIR, files[i]!)).catch(() => {});
  }
}
