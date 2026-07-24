import { Router, type Request, type Response } from 'express';
import { experimentalEligible, requirePageAuth } from '../middleware/requireAuth.js';
import { shell } from './pages.js';

/**
 * The analytics dashboard — an operator view for the PRIMARY (HarborHouse)
 * account only; every other account gets a 404 so the page's existence isn't
 * revealed. Data comes from /v1/analytics/summary; rendering is plain tables
 * and CSS bars (no chart library).
 */
export const dashboardRouter = Router();

dashboardRouter.get('/dashboard', requirePageAuth, (req: Request, res: Response) => {
  if (!experimentalEligible(req)) {
    res.status(404).type('html').send('<h2>Not found</h2>');
    return;
  }
  res.type('html').send(
    shell({
      title: 'Dashboard — Harbor House',
      back: true,
      body: `<div class="card">
        <h1>📊 Usage dashboard</h1>
        <p class="sub">How the kids are using Harbor House.
          <label>Window:
            <select id="days">
              <option value="7">7 days</option>
              <option value="14" selected>14 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
          </label>
          <span id="meta" class="meta"></span>
        </p>
        <div id="content">Loading…</div>
      </div>`,
      head: `<style>
        main { width: min(96vw, 1080px); }
        .meta { font-size: 12px; color: #5a7785; margin-left: 10px; }
        h2 { font-size: 17px; margin: 26px 0 8px; border-bottom: 2px solid #dceaf0; padding-bottom: 4px; }
        h2 .note { font-weight: 400; font-size: 12.5px; color: #5a7785; margin-left: 8px; }
        table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
        th, td { text-align: left; padding: 5px 10px; border-bottom: 1px solid #edf3f6; }
        th { font-size: 11.5px; text-transform: uppercase; letter-spacing: .4px; color: #4a6c7c; }
        td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
        .bar { display: inline-block; height: 10px; background: #2c6e8f; border-radius: 3px;
          vertical-align: middle; margin-right: 6px; }
        .statgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
        .stat { background: #f1f7fa; border: 1px solid #dceaf0; border-radius: 10px; padding: 10px 14px; }
        .stat .v { font-size: 22px; font-weight: 800; color: #102a36; }
        .stat .l { font-size: 12px; color: #5a7785; }
        .warn .v { color: #8a5a00; }
        .journey { font-size: 13.5px; padding: 4px 0; }
        .journey .count { color: #5a7785; font-size: 12px; margin-left: 6px; }
        select { font-size: 13px; padding: 3px 6px; }
      </style>`,
    }) + `<script>${dashboardJs()}</script>`,
  );
});

function dashboardJs(): string {
  return `
  const fmtDur = (sec) => {
    if (sec < 90) return Math.round(sec) + 's';
    if (sec < 5400) return (sec / 60).toFixed(1) + 'm';
    return (sec / 3600).toFixed(1) + 'h';
  };
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const pct = (n, d) => d ? Math.round(100 * n / d) + '%' : '—';

  function statCards(items) {
    return '<div class="statgrid">' + items.map(([l, v, warn]) =>
      '<div class="stat' + (warn ? ' warn' : '') + '"><div class="v">' + v + '</div><div class="l">' + esc(l) + '</div></div>'
    ).join('') + '</div>';
  }
  function table(headers, rows) {
    return '<table><tr>' + headers.map((h, i) => '<th' + (i ? ' class="num"' : '') + '>' + esc(h) + '</th>').join('') +
      '</tr>' + rows.map((r) => '<tr>' + r.map((c, i) => '<td' + (i ? ' class="num"' : '') + '>' + c + '</td>').join('') + '</tr>').join('') + '</table>';
  }
  function bar(v, max, label) {
    const w = max ? Math.max(2, Math.round(140 * v / max)) : 2;
    return '<span class="bar" style="width:' + w + 'px"></span>' + label;
  }

  async function load() {
    const days = document.getElementById('days').value;
    const content = document.getElementById('content');
    content.textContent = 'Loading…';
    const res = await fetch('/v1/analytics/summary?days=' + days);
    if (!res.ok) { content.textContent = 'Could not load analytics.'; return; }
    const s = (await res.json()).summary;
    document.getElementById('meta').textContent =
      'idle limit ' + s.idleLimitSec + 's · generated ' + new Date(s.generatedAt).toLocaleString();
    let h = '';

    // 1) time on site
    const st = s.timeOnSite.sessionStats;
    h += '<h2>⏱️ Time on site <span class="note">sessions end after ' + s.idleLimitSec + 's of silence</span></h2>';
    h += statCards([
      ['sessions', st.count], ['total time', fmtDur(st.total)], ['mean session', fmtDur(st.mean)],
      ['median session', fmtDur(st.median)], ['p10', fmtDur(st.p10)], ['p90', fmtDur(st.p90)],
    ]);
    const maxU = Math.max(1, ...s.timeOnSite.perUser.map((u) => u.totalSec));
    h += '<h2>👤 Per user</h2>' + table(['user', 'sessions', 'total time'],
      s.timeOnSite.perUser.map((u) => [esc(u.user), u.sessions, bar(u.totalSec, maxU, fmtDur(u.totalSec))]));

    // 2) activity time
    const at = Object.entries(s.activityTime.total).sort((a, b) => b[1] - a[1]);
    const maxA = Math.max(1, ...at.map(([, v]) => v));
    h += '<h2>🧭 Time per activity</h2>' + table(['activity', 'time'],
      at.map(([a, v]) => [esc(a), bar(v, maxA, fmtDur(v))]));

    // 3) tool counts
    const tc = Object.entries(s.tools.counts).sort((a, b) => b[1] - a[1]);
    const maxT = Math.max(1, ...tc.map(([, v]) => v));
    h += '<h2>🤖 GenAI tool invocations</h2>' + table(['tool', 'count'],
      tc.map(([t, v]) => [esc(t), bar(v, maxT, v)]));

    // 4) regen patterns
    h += '<h2>🔁 Image regeneration patterns <span class="note">streak = repeated regens of the same page</span></h2>';
    h += statCards([
      ['image regens', s.regen.totalImageRegens],
      ['regen streaks (≥2)', s.regen.streakCount],
      ['avg streak length', s.regen.avgStreakLength.toFixed(1)],
      ['prompt changed between regens', Math.round(100 * s.regen.promptChangeRate) + '%'],
    ]);
    if (s.regen.streaks.length) {
      h += table(['user', 'streak length', 'prompt changes'],
        s.regen.streaks.map((r) => [esc(r.user), r.length, r.promptChanges]));
    }

    // 5) safety
    const surf = Object.entries(s.safety).sort((a, b) => b[1].blocked - a[1].blocked || b[1].requests - a[1].requests);
    h += '<h2>🛡️ Safety filter outcomes</h2>' + table(
      ['surface', 'requests', 'blocked', 'block rate', 'top categories'],
      surf.map(([name, v]) => [esc(name), v.requests, v.blocked, pct(v.blocked, v.requests),
        '<td style="text-align:left">' + esc(Object.entries(v.byCategory).sort((a,b)=>b[1]-a[1]).map(([c,n]) => c + '×' + n).join(', ') || '—') + '</td>']).map((r) => r.slice(0, 4).concat(r[4])));

    // 6) journeys
    h += '<h2>🗺️ Top user journeys <span class="note">across features, per session</span></h2>';
    h += s.journeys.acrossFeatures.map((j) => '<div class="journey">' + esc(j.pattern) + '<span class="count">×' + j.count + '</span></div>').join('') || '<div class="journey">—</div>';
    h += '<h2>📖 Within storybook <span class="note">tool order inside sessions</span></h2>';
    h += s.journeys.withinStorybook.map((j) => '<div class="journey">' + esc(j.pattern) + '<span class="count">×' + j.count + '</span></div>').join('') || '<div class="journey">—</div>';

    // 7) experience signals
    const g = s.signals;
    h += '<h2>💡 Experience signals</h2>';
    h += statCards([
      ['active users', g.activeUsers],
      ['bounce sessions (<60s)', g.bounceSessions + ' / ' + g.totalSessions],
      ['requests blocked', g.blockedTotal, g.blockedTotal > 0],
      ['blocked → retried same tool', pct(g.blockedThenRetriedSameTool, g.blockedTotal)],
      ['blocked → left within 5 min', pct(g.blockedThenLeftWithin5Min, g.blockedTotal), g.blockedThenLeftWithin5Min > 0],
      ['narration takes accepted', g.narrationTakesAccepted + ' / ' + g.narrationTakesRequested],
      ['bg music accepted', g.bgMusicAccepted + ' / ' + g.bgMusicJobs],
      ['books published', g.publishes],
      ['books deleted', g.bookDeletes],
    ]);

    content.innerHTML = h;
  }
  document.getElementById('days').addEventListener('change', load);
  load();
  `;
}
