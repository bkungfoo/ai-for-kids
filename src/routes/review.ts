import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { verifyReviewPassword } from '../auth/credentials.js';
import { createSession, destroySession } from '../auth/sessions.js';
import { parseCookies } from '../auth/cookies.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { isOperator, requireOperatorApi } from '../middleware/requireAuth.js';
import { listBlocked } from '../safety/blockedStore.js';

/**
 * Adult-only operator review area. This is deliberately SEPARATE from the
 * child-facing app: it has its own password, its own cookie/session, and is
 * never linked from the kids UI. It can view content the gateway blocked, so
 * every generation surfaces the full stage-by-stage verdict (with reasons).
 *
 * The entire surface is disabled (404) unless REVIEW_PASSWORD is configured.
 */
export const reviewRouter = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.auth.cookieSecure,
  maxAge: config.review.sessionTtlMs,
  path: '/',
};

function reviewToken(req: Request): string | undefined {
  return parseCookies(req)[config.review.cookieName];
}

/** Short-circuit everything under /review when the area is disabled. */
reviewRouter.use(['/review', '/v1/review'], (_req, res, next) => {
  if (!config.review.enabled) {
    res.status(404).type('txt').send('Not found');
    return;
  }
  next();
});

// --- Review home: unlock screen or the review console ------------------------
reviewRouter.get('/review', (req: Request, res: Response) => {
  if (isOperator(req)) {
    res.type('html').send(reviewConsolePage());
    return;
  }
  res.type('html').send(unlockPage({ error: req.query.error === '1' }));
});

// --- Unlock (operator password) ---------------------------------------------
reviewRouter.post('/review/unlock', (req: Request, res: Response) => {
  const { password } = (req.body ?? {}) as Record<string, unknown>;
  if (!verifyReviewPassword(password)) {
    logger.warn('failed operator unlock attempt');
    res.redirect('/review?error=1');
    return;
  }
  const token = createSession('operator', 'operator', config.review.sessionTtlMs);
  res.cookie(config.review.cookieName, token, cookieOptions);
  logger.info('operator review session started');
  res.redirect('/review');
});

// --- Lock (sign out of the review area) -------------------------------------
reviewRouter.post('/review/logout', (req: Request, res: Response) => {
  destroySession(reviewToken(req));
  res.clearCookie(config.review.cookieName, { path: '/' });
  res.redirect('/review');
});

// --- Review API: the gallery of images the safety pipeline blocked -----------
// Read-only: it surfaces what children already tried and were refused, rather
// than letting the operator generate anything new. Entries are recorded by the
// guarded pipeline (see safety/blockedStore.ts).
reviewRouter.get(
  '/v1/review/blocked',
  requireOperatorApi,
  asyncHandler(async (req, res) => {
    const raw = Number.parseInt(String(req.query.limit ?? ''), 10);
    const limit = Number.isFinite(raw) ? Math.min(50, Math.max(1, raw)) : 20;
    const entries = await listBlocked(limit);
    // Audit trail: an operator viewed content the child app blocked.
    logger.warn('operator viewed blocked-image gallery', { count: entries.length });
    res.json({ ok: true, entries });
  }),
);

// --- HTML ------------------------------------------------------------------

const SHELL_STYLE = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #0f1b24; color: #e8eef2;
  }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 22px; border-bottom: 1px solid #21323d;
  }
  header .title { font-weight: 700; font-size: 16px; letter-spacing: .3px; }
  .pill { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px;
    color: #ffd7a8; background: #4a2f13; border: 1px solid #6b451d; border-radius: 999px; padding: 3px 10px; }
  main { width: min(94vw, 820px); margin: 26px auto 64px; }
  .card { background: #14232e; border: 1px solid #21323d; border-radius: 14px; padding: 26px; }
  h1 { margin: 0 0 6px; font-size: 20px; }
  .sub { margin: 0 0 20px; color: #8fa6b3; font-size: 14px; }
  label { display: block; font-size: 13px; font-weight: 600; margin: 12px 0 6px; }
  textarea, input[type=password] {
    width: 100%; padding: 11px 13px; font-size: 15px; font-family: inherit;
    color: #e8eef2; background: #0f1b24; border: 1px solid #2b3f4c; border-radius: 10px; outline: none;
  }
  textarea:focus, input:focus { border-color: #4f9bd0; box-shadow: 0 0 0 3px rgba(79,155,208,.22); }
  button.primary { margin-top: 16px; padding: 11px 18px; font-size: 15px; font-weight: 600;
    color: #06121a; background: #6bb6e6; border: none; border-radius: 10px; cursor: pointer; }
  button.primary:hover { background: #57a6da; }
  button.primary:disabled { background: #3c5666; color: #7f97a5; cursor: progress; }
  .link { color: #9cc7e6; text-decoration: none; font-size: 13px; font-weight: 600; }
  .link:hover { text-decoration: underline; }
  .err { margin: 0 0 10px; padding: 10px 12px; font-size: 13px; color: #ffb4b4;
    background: #3a1a1a; border: 1px solid #5c2626; border-radius: 9px; }
`;

function unlockPage({ error = false }: { error?: boolean }): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Operator review — Harbor House</title>
<style>${SHELL_STYLE}
  body { display: grid; place-items: center; }
  .card { width: min(92vw, 380px); }
</style></head>
<body>
  <main class="card">
    <div class="pill">Operator only</div>
    <h1 style="margin-top:14px">Review console</h1>
    <p class="sub">This area can display content the child-safety filter blocked.
      Adults only. Enter the operator password to continue.</p>
    ${error ? '<p class="err" role="alert">Incorrect operator password.</p>' : ''}
    <form method="post" action="/review/unlock" autocomplete="off">
      <label for="password">Operator password</label>
      <input id="password" name="password" type="password" required autofocus />
      <button class="primary" type="submit" style="width:100%">Unlock</button>
    </form>
  </main>
</body></html>`;
}

function reviewConsolePage(): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Operator review — Harbor House</title>
<style>${SHELL_STYLE}
  .entry { margin-top: 16px; padding: 16px; border-radius: 12px;
    background: #0f1b24; border: 1px solid #6b451d; }
  .entry .head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    font-size: 13px; color: #9fb3bf; }
  .tag { font-size: 11px; font-weight: 700; border-radius: 6px; padding: 2px 7px; }
  .tag.block { color: #ffb4b4; background: #3a1a1a; }
  .tag.stage { color: #ffd0a8; background: #3a2410; }
  .entry .cats { color: #cbb39a; margin-top: 8px; font-size: 13px; }
  .entry .label { margin-top: 10px; font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .5px; color: #6f8694; }
  .entry .text { color: #c9d6de; font-size: 13px; margin-top: 3px;
    white-space: pre-wrap; word-break: break-word; }
  .entry .reason { color: #9fb3bf; }
  .entry img { margin-top: 12px; max-width: 100%; border-radius: 10px; display: block;
    border: 2px solid #6b451d; }
  .status { margin-top: 16px; font-size: 14px; min-height: 20px; color: #9fb3bf; }
  .status.error { color: #ffb4b4; }
  .spinner { display: inline-block; width: 15px; height: 15px; vertical-align: -3px; margin-right: 8px;
    border: 3px solid #2b3f4c; border-top-color: #6bb6e6; border-radius: 50%; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style></head>
<body>
  <header>
    <span class="title">⚓ Harbor House · Review</span>
    <span style="display:flex;gap:14px;align-items:center">
      <span class="pill">Operator</span>
      <form method="post" action="/review/logout"><button class="link" style="background:none;border:none;cursor:pointer" type="submit">Lock</button></form>
    </span>
  </header>
  <main>
    <div class="card">
      <h1>Blocked pictures</h1>
      <p class="sub">Pictures the safety filters <strong>stopped before they reached a child</strong>,
        with the prompt that caused them and the internal verdict. Newest first.</p>
      <button class="primary" id="refresh" type="button">↻ Refresh</button>
      <div id="status" class="status" role="status" aria-live="polite"></div>
      <div id="list"></div>
    </div>
  </main>
  <script>${reviewClientJs()}</script>
</body></html>`;
}

function reviewClientJs(): string {
  return `
  const refresh = document.getElementById('refresh');
  const statusEl = document.getElementById('status');
  const list = document.getElementById('list');

  function setStatus(text, cls) {
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
    statusEl.innerHTML = text;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  function section(label, text, extraCls) {
    return '<div class="label">' + esc(label) + '</div>' +
      '<div class="text' + (extraCls ? ' ' + extraCls : '') + '">' + esc(text) + '</div>';
  }

  function renderEntry(e) {
    const card = document.createElement('div');
    card.className = 'entry';
    const when = new Date(e.createdAt).toLocaleString();
    let html =
      '<div class="head">' +
        '<span class="tag block">blocked</span>' +
        '<span class="tag stage">' + esc(e.stage === 'image' ? 'SafeSearch' : 'output moderation') + '</span>' +
        '<span>' + esc(when) + '</span>' +
        '<span>· ' + esc(e.provider) + '</span>' +
        '<span>· severity: ' + esc(e.severity) + '</span>' +
      '</div>';
    if (e.categories && e.categories.length) {
      html += '<div class="cats">Categories: ' + esc(e.categories.join(', ')) + '</div>';
    }
    if (e.inputTexts && e.inputTexts.length) {
      html += section('Prompt / context', e.inputTexts.join('\\n\\n'));
    }
    if (e.captions && e.captions.length) {
      html += section('Model captions', e.captions.join(' '));
    }
    if (e.reason) {
      html += section('Why it was blocked', e.reason, 'reason');
    }
    card.innerHTML = html;
    for (const img of e.images || []) {
      const el = document.createElement('img');
      el.src = 'data:' + img.mimeType + ';base64,' + img.dataBase64;
      el.alt = 'blocked image';
      el.loading = 'lazy';
      card.appendChild(el);
    }
    return card;
  }

  async function load() {
    refresh.disabled = true;
    setStatus('<span class="spinner"></span>Loading blocked pictures…');
    list.innerHTML = '';
    try {
      const res = await fetch('/v1/review/blocked');
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { setStatus('Session ended. <a class="link" href="/review">Unlock again</a>.', 'error'); return; }
      if (!res.ok || !data.ok) { setStatus('Could not load (status ' + res.status + ').', 'error'); return; }
      if (!data.entries.length) {
        setStatus('No blocked pictures so far — nothing has been stopped by the image safety checks. ✓');
        return;
      }
      setStatus('Showing ' + data.entries.length + ' most recent blocked picture(s).');
      for (const e of data.entries) list.appendChild(renderEntry(e));
    } catch {
      setStatus('Could not reach the server. Try again.', 'error');
    } finally {
      refresh.disabled = false;
    }
  }

  refresh.addEventListener('click', load);
  load();
  `;
}
