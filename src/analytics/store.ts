import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../logger.js';

/**
 * Append-only usage log: one JSON line per event, one file per UTC day under
 * data/analytics/. Fire-and-forget writes (analytics must never slow a kid's
 * request down); the dashboard reads the last N days and aggregates in memory
 * — fine at family scale.
 */

export interface UsageEvent {
  /** ms epoch */
  t: number;
  user: string;
  universe: string;
  /** 'api' (a real request), 'ping' (client activity heartbeat) */
  kind: 'api' | 'ping';
  /** storybook | music | voices | code | images | site */
  activity: string;
  /** Specific GenAI tool / interaction id, when the event is one. */
  tool?: string;
  method?: string;
  /** Normalized path (ids → :id) — never raw content. */
  path?: string;
  status?: number;
  /** True when the safety pipeline rejected the request. */
  blocked?: boolean;
  categories?: string[];
  /** Short hash of the creative prompt (for change-detection; never raw text). */
  promptHash?: string;
  /** Book/page context for per-page patterns (regen streaks). */
  bookId?: string;
  pageIndex?: number;
  /** Automated traffic (job polls, status checks) — excluded from time-on-site. */
  auto?: boolean;
}

const DIR = path.resolve('data', 'analytics');

function fileForDay(t: number): string {
  return path.join(DIR, `events-${new Date(t).toISOString().slice(0, 10)}.jsonl`);
}

let dirReady = false;

export function appendEvent(evt: UsageEvent): void {
  void (async () => {
    try {
      if (!dirReady) {
        await mkdir(DIR, { recursive: true });
        dirReady = true;
      }
      await appendFile(fileForDay(evt.t), `${JSON.stringify(evt)}\n`, 'utf8');
    } catch (err) {
      logger.warn('analytics append failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}

/** All events from the last `days` UTC days (inclusive of today), time-sorted. */
export async function readEvents(days: number): Promise<UsageEvent[]> {
  let entries: string[];
  try {
    entries = await readdir(DIR);
  } catch {
    return [];
  }
  const cutoff = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const events: UsageEvent[] = [];
  for (const entry of entries) {
    const m = /^events-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(entry);
    if (!m || m[1]! < cutoff) continue;
    try {
      const lines = (await readFile(path.join(DIR, entry), 'utf8')).split('\n');
      for (const line of lines) {
        if (!line) continue;
        try {
          events.push(JSON.parse(line) as UsageEvent);
        } catch {
          /* skip torn line (e.g. crash mid-write) */
        }
      }
    } catch {
      /* unreadable file — skip */
    }
  }
  return events.sort((a, b) => a.t - b.t);
}
