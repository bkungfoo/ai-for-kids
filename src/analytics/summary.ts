import { readEvents, type UsageEvent } from './store.js';

/**
 * Aggregates the raw usage log into the dashboard's answers.
 *
 * IDLE LIMIT: 3 minutes. Within a session, a gap between two activity signals
 * (API calls or client heartbeats) of up to 3 minutes counts as engaged time —
 * a child reading a page, listening to narration, or thinking easily pauses
 * that long. A longer silence ends the session: the child is presumed to have
 * wandered off, and the gap does not count toward time on site. Configurable
 * via ANALYTICS_IDLE_SEC.
 */
export const IDLE_LIMIT_MS =
  Math.max(30, Number(process.env.ANALYTICS_IDLE_SEC ?? '180') || 180) * 1000;

/** Credit for the tail of a session / single-event sessions (one heartbeat). */
const TAIL_CREDIT_MS = 30 * 1000;
/** Regens on the same page separated by ≤ this belong to one streak. */
const STREAK_GAP_MS = 30 * 60 * 1000;

interface Session {
  user: string;
  start: number;
  end: number;
  durationMs: number;
  /** ms attributed to each activity within the session. */
  perActivity: Record<string, number>;
  /** Collapsed macro journey, e.g. ["storybook","voices","storybook"]. */
  journey: string[];
  /** Collapsed storybook tool micro-journey for this session. */
  storyTools: string[];
  events: UsageEvent[];
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    mean: sorted.length ? sum / sorted.length : 0,
    median: percentile(sorted, 0.5),
    p10: percentile(sorted, 0.1),
    p90: percentile(sorted, 0.9),
    total: sum,
  };
}

function buildSessions(events: UsageEvent[]): Session[] {
  const byUser = new Map<string, UsageEvent[]>();
  for (const e of events) {
    if (e.auto) continue; // polls are not presence
    (byUser.get(e.user) ?? byUser.set(e.user, []).get(e.user)!).push(e);
  }
  const sessions: Session[] = [];
  for (const [user, evts] of byUser) {
    let current: UsageEvent[] = [];
    const flush = () => {
      if (!current.length) return;
      const perActivity: Record<string, number> = {};
      let duration = 0;
      for (let i = 0; i < current.length; i++) {
        const credit =
          i < current.length - 1 ? current[i + 1]!.t - current[i]!.t : TAIL_CREDIT_MS;
        duration += credit;
        const act = current[i]!.activity;
        perActivity[act] = (perActivity[act] ?? 0) + credit;
      }
      const journey: string[] = [];
      for (const e of current) {
        if (e.activity !== 'site' && journey.at(-1) !== e.activity) journey.push(e.activity);
      }
      const storyTools: string[] = [];
      for (const e of current) {
        if (e.activity === 'storybook' && e.tool && storyTools.at(-1) !== e.tool) {
          storyTools.push(e.tool);
        }
      }
      sessions.push({
        user,
        start: current[0]!.t,
        end: current.at(-1)!.t,
        durationMs: duration,
        perActivity,
        journey,
        storyTools,
        events: current,
      });
      current = [];
    };
    for (const e of evts) {
      if (current.length && e.t - current.at(-1)!.t > IDLE_LIMIT_MS) flush();
      current.push(e);
    }
    flush();
  }
  return sessions.sort((a, b) => a.start - b.start);
}

function topPatterns(seqs: string[][], max = 10): Array<{ pattern: string; count: number }> {
  const counts = new Map<string, number>();
  for (const seq of seqs) {
    if (seq.length < 2) continue;
    const key = seq.slice(0, 8).join(' → ');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([pattern, count]) => ({ pattern, count }));
}

export async function buildSummary(days: number) {
  const events = await readEvents(days);
  const apiEvents = events.filter((e) => e.kind === 'api');
  const sessions = buildSessions(events);

  // 1) Time on site --------------------------------------------------------------
  const sessionDurations = sessions.map((s) => s.durationMs / 1000);
  const perUserTotals = new Map<string, { totalSec: number; sessions: number }>();
  for (const s of sessions) {
    const u = perUserTotals.get(s.user) ?? { totalSec: 0, sessions: 0 };
    u.totalSec += s.durationMs / 1000;
    u.sessions += 1;
    perUserTotals.set(s.user, u);
  }

  // 2) Time per activity ---------------------------------------------------------
  const activityTime: Record<string, number> = {};
  for (const s of sessions) {
    for (const [act, ms] of Object.entries(s.perActivity)) {
      activityTime[act] = (activityTime[act] ?? 0) + ms / 1000;
    }
  }
  const perUserActivity: Record<string, Record<string, number>> = {};
  for (const s of sessions) {
    const row = (perUserActivity[s.user] ??= {});
    for (const [act, ms] of Object.entries(s.perActivity)) row[act] = (row[act] ?? 0) + ms / 1000;
  }

  // 3) GenAI tool counts (per tool, plus per-day series) ---------------------------
  const toolCounts: Record<string, number> = {};
  const toolByDay: Record<string, Record<string, number>> = {};
  for (const e of apiEvents) {
    if (!e.tool) continue;
    toolCounts[e.tool] = (toolCounts[e.tool] ?? 0) + 1;
    const day = new Date(e.t).toISOString().slice(0, 10);
    (toolByDay[day] ??= {})[e.tool] = (toolByDay[day]![e.tool] ?? 0) + 1;
  }

  // 4) Regeneration patterns (image regens per book+page) --------------------------
  const regenKeyed = new Map<string, UsageEvent[]>();
  for (const e of apiEvents) {
    if (e.tool !== 'image-regen' || e.blocked) continue;
    const key = `${e.user}|${e.bookId}|${e.pageIndex}`;
    (regenKeyed.get(key) ?? regenKeyed.set(key, []).get(key)!).push(e);
  }
  const streaks: Array<{ user: string; length: number; promptChanges: number }> = [];
  for (const [key, evts] of regenKeyed) {
    evts.sort((a, b) => a.t - b.t);
    let run: UsageEvent[] = [];
    const flush = () => {
      if (run.length >= 2) {
        let changes = 0;
        for (let i = 1; i < run.length; i++) {
          if (run[i]!.promptHash !== run[i - 1]!.promptHash) changes += 1;
        }
        streaks.push({ user: key.split('|')[0]!, length: run.length, promptChanges: changes });
      }
      run = [];
    };
    for (const e of evts) {
      if (run.length && e.t - run.at(-1)!.t > STREAK_GAP_MS) flush();
      run.push(e);
    }
    flush();
  }
  const totalRegens = [...regenKeyed.values()].reduce((a, v) => a + v.length, 0);
  const streakRegens = streaks.reduce((a, s) => a + s.length, 0);
  const streakChanges = streaks.reduce((a, s) => a + s.promptChanges, 0);

  // 5) Safety rejections, sliced by surface ---------------------------------------
  const surfaces: Record<
    string,
    { requests: number; blocked: number; byCategory: Record<string, number> }
  > = {};
  for (const e of apiEvents) {
    if (!e.method || e.method === 'GET' || e.auto) continue;
    const surface = e.tool ?? `${e.activity}-other`;
    const row = (surfaces[surface] ??= { requests: 0, blocked: 0, byCategory: {} });
    row.requests += 1;
    if (e.blocked) {
      row.blocked += 1;
      for (const c of e.categories ?? ['(uncategorized)']) {
        row.byCategory[c] = (row.byCategory[c] ?? 0) + 1;
      }
    }
  }

  // 6) Journeys -------------------------------------------------------------------
  const macroJourneys = topPatterns(sessions.map((s) => s.journey));
  const storyJourneys = topPatterns(sessions.map((s) => s.storyTools));

  // 7) Experience signals ----------------------------------------------------------
  const blockedEvents = apiEvents.filter((e) => e.blocked);
  let retried = 0;
  let abandoned = 0;
  for (const b of blockedEvents) {
    const later = apiEvents.filter((e) => e.user === b.user && e.t > b.t && e.t - b.t < 5 * 60 * 1000 && !e.auto);
    if (later.some((e) => e.tool === b.tool)) retried += 1;
    else if (!later.length) abandoned += 1;
  }
  const count = (tool: string) => apiEvents.filter((e) => e.tool === tool && !e.blocked).length;
  const signals = {
    idleLimitSec: IDLE_LIMIT_MS / 1000,
    bounceSessions: sessions.filter((s) => s.durationMs < 60 * 1000).length,
    totalSessions: sessions.length,
    blockedTotal: blockedEvents.length,
    blockedThenRetriedSameTool: retried,
    blockedThenLeftWithin5Min: abandoned,
    narrationTakesRequested: count('narration-retake'),
    narrationTakesAccepted: count('narration-accept'),
    bgMusicJobs: count('bg-music-gen'),
    bgMusicAccepted: count('bg-music-accept'),
    publishes: count('publish'),
    bookDeletes: count('book-delete'),
    activeUsers: perUserTotals.size,
  };

  return {
    generatedAt: new Date().toISOString(),
    days,
    idleLimitSec: IDLE_LIMIT_MS / 1000,
    timeOnSite: {
      sessionStats: stats(sessionDurations),
      perUser: [...perUserTotals.entries()]
        .map(([user, v]) => ({ user, ...v }))
        .sort((a, b) => b.totalSec - a.totalSec),
    },
    activityTime: {
      total: activityTime,
      perUser: perUserActivity,
    },
    tools: { counts: toolCounts, byDay: toolByDay },
    regen: {
      totalImageRegens: totalRegens,
      streaks: streaks.sort((a, b) => b.length - a.length).slice(0, 10),
      streakCount: streaks.length,
      avgStreakLength: streaks.length ? streakRegens / streaks.length : 0,
      promptChangeRate: streakRegens > streaks.length
        ? streakChanges / (streakRegens - streaks.length)
        : 0,
    },
    safety: surfaces,
    journeys: { acrossFeatures: macroJourneys, withinStorybook: storyJourneys },
    signals,
  };
}

// --- Time series ----------------------------------------------------------------
// One measure at a time, split into same-unit series (never two y-scales).

export type SeriesMetric = 'events' | 'genai' | 'engaged' | 'blocked' | 'users';

export async function buildSeries(days: number, bucketSec: number, metric: SeriesMetric) {
  const events = await readEvents(days);
  const bucketMs = Math.max(60, bucketSec) * 1000;
  const now = Date.now();
  const from = now - days * 24 * 60 * 60 * 1000;
  const startBucket = Math.floor(from / bucketMs) * bucketMs;
  const endBucket = Math.floor(now / bucketMs) * bucketMs;

  const buckets: number[] = [];
  for (let t = startBucket; t <= endBucket; t += bucketMs) buckets.push(t);
  const index = new Map(buckets.map((t, i) => [t, i]));
  const bucketOf = (t: number) => index.get(Math.floor(t / bucketMs) * bucketMs);

  const series = new Map<string, number[]>();
  const row = (name: string) => {
    let r = series.get(name);
    if (!r) series.set(name, (r = new Array(buckets.length).fill(0)));
    return r;
  };

  if (metric === 'users') {
    // Distinct users per bucket — a set per bucket, then sizes.
    const sets = buckets.map(() => new Set<string>());
    for (const e of events) {
      if (e.auto) continue;
      const i = bucketOf(e.t);
      if (i !== undefined) sets[i]!.add(e.user);
    }
    series.set('active users', sets.map((s) => s.size));
  } else if (metric === 'engaged') {
    // Engaged minutes, credited the same way sessions are (idle-limit capped).
    for (const s of buildSessions(events)) {
      for (let i = 0; i < s.events.length; i++) {
        const e = s.events[i]!;
        const creditMs = Math.min(
          i < s.events.length - 1 ? s.events[i + 1]!.t - e.t : TAIL_CREDIT_MS,
          IDLE_LIMIT_MS,
        );
        const bi = bucketOf(e.t);
        if (bi !== undefined) row(e.activity)[bi]! += creditMs / 60000;
      }
    }
  } else {
    for (const e of events) {
      if (e.kind !== 'api') continue;
      if (metric === 'genai' && !e.tool) continue;
      if (metric === 'blocked' && !e.blocked) continue;
      if (metric === 'events' && e.auto) continue;
      const i = bucketOf(e.t);
      if (i !== undefined) row(e.activity)[i]! += 1;
    }
  }

  // Fixed series order = fixed color slots (color follows the entity, not rank).
  const ORDER = ['storybook', 'music', 'voices', 'site', 'code', 'images', 'active users'];
  const named = [...series.entries()]
    .filter(([, vals]) => vals.some((v) => v > 0))
    .sort((a, b) => {
      const ai = ORDER.indexOf(a[0]);
      const bi = ORDER.indexOf(b[0]);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    })
    .map(([name, values]) => ({
      name,
      slot: Math.max(0, ORDER.indexOf(name)),
      values: values.map((v) => Math.round(v * 100) / 100),
    }));

  return { bucketSec: bucketMs / 1000, buckets, metric, series: named };
}
