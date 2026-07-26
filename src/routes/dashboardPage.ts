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
        <div class="viz" id="viz">
          <div class="viz-controls">
            <label>Metric:
              <select id="metric">
                <option value="genai" selected>GenAI invocations</option>
                <option value="events">User actions</option>
                <option value="engaged">Engaged minutes</option>
                <option value="blocked">Blocked requests</option>
                <option value="users">Active users</option>
              </select>
            </label>
            <label>Every:
              <select id="bucket">
                <option value="600">10 minutes</option>
                <option value="3600" selected>Hour</option>
                <option value="21600">6 hours</option>
                <option value="86400">Day</option>
              </select>
            </label>
          </div>
          <div id="chart"></div>
          <div class="legend" id="legend"></div>
          <details class="tableview"><summary>Show as a table</summary><div id="vtable"></div></details>
          <div class="tip" id="tip"></div>
        </div>
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

        /* --- line chart -------------------------------------------------- */
        /* Categorical slots from the validated reference palette, in fixed
           order (color follows the entity, never its rank). CVD-checked:
           worst adjacent ΔE 24.2. Two slots sit under 3:1 on white, so the
           relief rule applies — hence the always-on legend labels and the
           table view below the chart. */
        .viz { --surface-1: #ffffff; --text-primary: #102a36; --text-secondary: #5a7785;
          --grid: #e6eef2;
          --series-1: #2a78d6; --series-2: #1baf7a; --series-3: #eda100;
          --series-4: #008300; --series-5: #4a3aa7; --series-6: #e34948;
          --series-7: #e87ba4; --series-8: #eb6834;
          background: var(--surface-1); border: 1px solid #dceaf0; border-radius: 12px;
          padding: 14px 16px 8px; margin-top: 10px; position: relative; }
        .viz-controls { display: flex; gap: 14px; align-items: center; flex-wrap: wrap;
          margin-bottom: 6px; }
        .viz-controls label { font-size: 12.5px; font-weight: 600; color: #4a6c7c;
          display: flex; align-items: center; gap: 5px; }
        .viz svg { display: block; width: 100%; height: 300px; overflow: visible; }
        .viz .grid line { stroke: var(--grid); stroke-width: 1; }
        .viz .axis text { font-size: 10.5px; fill: var(--text-secondary); }
        .viz .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
        .viz .dot { stroke: var(--surface-1); stroke-width: 2; }
        .viz .hair { stroke: #9bb0bb; stroke-width: 1; stroke-dasharray: 3 3; }
        .legend { display: flex; gap: 14px; flex-wrap: wrap; margin: 8px 0 2px; }
        .legend .item { display: inline-flex; align-items: center; gap: 6px;
          font-size: 12.5px; color: var(--text-primary); }
        .legend .key { width: 16px; height: 2px; border-radius: 2px; display: inline-block; }
        .tip { position: absolute; pointer-events: none; background: #fff; border: 1px solid #cfdde5;
          border-radius: 8px; box-shadow: 0 6px 18px rgba(16,42,54,.16); padding: 8px 10px;
          font-size: 12px; min-width: 132px; opacity: 0; transition: opacity .08s; z-index: 3; }
        .tip .when { font-size: 11px; color: var(--text-secondary); margin-bottom: 4px; }
        .tip .row { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
        .tip .row .key { width: 12px; height: 2px; border-radius: 2px; }
        .tip .row .v { font-weight: 800; font-variant-numeric: tabular-nums; }
        .tip .row .n { color: var(--text-secondary); }
        .viz-empty { font-size: 13px; color: var(--text-secondary); padding: 40px 0; text-align: center; }
        details.tableview { margin-top: 6px; }
        details.tableview summary { font-size: 12.5px; color: #2c6e8f; cursor: pointer; font-weight: 700; }
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

  // ===================== line chart: metric over time ======================
  const SLOT_VAR = (i) => 'var(--series-' + ((i % 8) + 1) + ')';
  const METRIC_LABEL = {
    genai: 'GenAI invocations', events: 'User actions', engaged: 'Engaged minutes',
    blocked: 'Blocked requests', users: 'Active users',
  };
  let chartData = null;

  function fmtBucketTime(ms, bucketSec) {
    const d = new Date(ms);
    if (bucketSec >= 86400) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  // Pick a round TICK STEP (not just a round max) so the four gridline labels
  // are clean numbers — counts never read as 1.3 / 2.5 / 3.8.
  function niceMax(v) {
    const raw = Math.max(v, 1) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    let step = 10 * mag;
    for (const m of [1, 2, 2.5, 5]) { if (raw <= m * mag) { step = m * mag; break; } }
    if (step < 1 && Math.max(v, 1) >= 4) step = 1; // integer-ish data keeps integer ticks
    return step * 4;
  }

  function renderChart() {
    const host = document.getElementById('chart');
    const legend = document.getElementById('legend');
    const tip = document.getElementById('tip');
    if (!chartData || !chartData.series.length || chartData.buckets.length < 2) {
      host.innerHTML = '<div class="viz-empty">No activity in this window yet.</div>';
      legend.textContent = '';
      document.getElementById('vtable').textContent = '';
      return;
    }
    const { buckets, series, bucketSec } = chartData;
    const W = 900, H = 300, ML = 44, MR = 12, MT = 12, MB = 26;
    const iw = W - ML - MR, ih = H - MT - MB;
    const maxV = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
    const x = (i) => ML + (buckets.length === 1 ? iw / 2 : (i * iw) / (buckets.length - 1));
    const y = (v) => MT + ih - (v / maxV) * ih;

    const svgns = 'http://www.w3.org/2000/svg';
    const el = (n, attrs) => {
      const e = document.createElementNS(svgns, n);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    };
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': METRIC_LABEL[chartData.metric] + ' over time' });

    // recessive grid + y axis
    const grid = el('g', { class: 'grid' });
    const axis = el('g', { class: 'axis' });
    for (let g = 0; g <= 4; g++) {
      const v = (maxV / 4) * g, yy = y(v);
      grid.appendChild(el('line', { x1: ML, x2: W - MR, y1: yy, y2: yy }));
      const t = el('text', { x: ML - 8, y: yy + 3.5, 'text-anchor': 'end' });
      t.textContent = v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v * 10) / 10);
      axis.appendChild(t);
    }
    // x labels: about 6, always including the last bucket
    const step = Math.max(1, Math.round(buckets.length / 6));
    for (let i = 0; i < buckets.length; i += step) {
      const t = el('text', { x: x(i), y: H - 8, 'text-anchor': 'middle' });
      t.textContent = fmtBucketTime(buckets[i], bucketSec);
      axis.appendChild(t);
    }
    svg.appendChild(grid);
    svg.appendChild(axis);

    // one 2px path per series (+ visible dots when the series is sparse)
    series.forEach((sr) => {
      const d = sr.values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
      svg.appendChild(el('path', { class: 'line', d: d, stroke: SLOT_VAR(sr.slot) }));
      if (buckets.length <= 40) {
        sr.values.forEach((v, i) => {
          if (v > 0) svg.appendChild(el('circle', { class: 'dot', cx: x(i), cy: y(v), r: 4, fill: SLOT_VAR(sr.slot) }));
        });
      }
    });

    // crosshair: readers aim at a time, never at a 2px line
    const hair = el('line', { class: 'hair', y1: MT, y2: MT + ih, x1: -99, x2: -99 });
    svg.appendChild(hair);
    const focus = el('g', {});
    svg.appendChild(focus);
    const hit = el('rect', { x: ML, y: MT, width: iw, height: ih, fill: 'transparent' });
    svg.appendChild(hit);

    host.innerHTML = '';
    host.appendChild(svg);

    const move = (evt) => {
      const box = svg.getBoundingClientRect();
      const px = ((evt.clientX - box.left) / box.width) * W;
      let i = Math.round(((px - ML) / iw) * (buckets.length - 1));
      i = Math.max(0, Math.min(buckets.length - 1, i));
      hair.setAttribute('x1', x(i)); hair.setAttribute('x2', x(i));
      focus.innerHTML = '';
      series.forEach((sr) => {
        focus.appendChild(el('circle', { class: 'dot', cx: x(i), cy: y(sr.values[i]), r: 5, fill: SLOT_VAR(sr.slot) }));
      });
      // tooltip: value leads, series name follows; labels via textContent
      tip.innerHTML = '';
      const when = document.createElement('div');
      when.className = 'when';
      when.textContent = fmtBucketTime(buckets[i], bucketSec);
      tip.appendChild(when);
      series.forEach((sr) => {
        const row = document.createElement('div');
        row.className = 'row';
        const key = document.createElement('span');
        key.className = 'key';
        key.style.background = SLOT_VAR(sr.slot);
        const val = document.createElement('span');
        val.className = 'v';
        val.textContent = String(sr.values[i]);
        const nm = document.createElement('span');
        nm.className = 'n';
        nm.textContent = sr.name;
        row.appendChild(key); row.appendChild(val); row.appendChild(nm);
        tip.appendChild(row);
      });
      const hostBox = document.getElementById('viz').getBoundingClientRect();
      const leftPx = (x(i) / W) * box.width + (box.left - hostBox.left);
      tip.style.left = Math.min(hostBox.width - 150, Math.max(8, leftPx + 12)) + 'px';
      tip.style.top = (box.top - hostBox.top + 20) + 'px';
      tip.style.opacity = '1';
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerleave', () => {
      tip.style.opacity = '0';
      hair.setAttribute('x1', -99); hair.setAttribute('x2', -99);
      focus.innerHTML = '';
    });

    // legend: identity is never color-alone
    legend.innerHTML = '';
    series.forEach((sr) => {
      const item = document.createElement('span');
      item.className = 'item';
      const key = document.createElement('span');
      key.className = 'key';
      key.style.background = SLOT_VAR(sr.slot);
      const nm = document.createElement('span');
      nm.textContent = sr.name;
      item.appendChild(key); item.appendChild(nm);
      legend.appendChild(item);
    });

    // table view — the relief for the two low-contrast slots, and keyboard-reachable
    const tv = document.getElementById('vtable');
    tv.innerHTML = '';
    const tbl = document.createElement('table');
    const head = document.createElement('tr');
    ['when', ...series.map((s) => s.name)].forEach((h, i) => {
      const th = document.createElement('th');
      if (i) th.className = 'num';
      th.textContent = h;
      head.appendChild(th);
    });
    tbl.appendChild(head);
    buckets.forEach((b, i) => {
      if (!series.some((sr) => sr.values[i] > 0)) return; // skip empty buckets
      const tr = document.createElement('tr');
      const td0 = document.createElement('td');
      td0.textContent = fmtBucketTime(b, bucketSec);
      tr.appendChild(td0);
      series.forEach((sr) => {
        const td = document.createElement('td');
        td.className = 'num';
        td.textContent = String(sr.values[i]);
        tr.appendChild(td);
      });
      tbl.appendChild(tr);
    });
    tv.appendChild(tbl);
  }

  async function loadChart() {
    const days = document.getElementById('days').value;
    const bucket = document.getElementById('bucket').value;
    const metric = document.getElementById('metric').value;
    const viz = document.getElementById('viz');
    viz.style.opacity = '.55'; // refetch keeps the frame
    try {
      const res = await fetch('/v1/analytics/series?days=' + days + '&bucket=' + bucket + '&metric=' + metric);
      chartData = res.ok ? await res.json() : null;
      renderChart();
    } finally {
      viz.style.opacity = '1';
    }
  }
  document.getElementById('metric').addEventListener('change', loadChart);
  document.getElementById('bucket').addEventListener('change', loadChart);

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
  document.getElementById('days').addEventListener('change', () => { load(); loadChart(); });
  load();
  loadChart();
  `;
}
