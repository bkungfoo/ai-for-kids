import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { verifyReviewPassword } from '../auth/credentials.js';
import { createSession, destroySession } from '../auth/sessions.js';
import { parseCookies } from '../auth/cookies.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { isOperator, requireOperatorApi } from '../middleware/requireAuth.js';
import { geminiProvider } from '../providers/gemini.js';
import { runReviewGeneration } from '../safety/guardedGeneration.js';
import { requireString, optionalString, ValidationError } from './validate.js';

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

// --- Review API: generate an image and return it WITH full verdicts ----------
reviewRouter.post(
  '/v1/review/images',
  requireOperatorApi,
  asyncHandler(async (req, res) => {
    const reqBody = {
      prompt: requireString(req.body, 'prompt', { maxLength: 2000 }),
      model: optionalString(req.body, 'model', { maxLength: 100 }),
    };
    const outcome = await runReviewGeneration(geminiProvider, reqBody);
    res.status(outcome.status).json(outcome.body);
  }),
);

// Local validation-error handler (mirrors the /v1 API router).
reviewRouter.use((err: unknown, _req: Request, res: Response, next: (e?: unknown) => void) => {
  if (err instanceof ValidationError) {
    res.status(400).json({ ok: false, error: err.message });
    return;
  }
  next(err);
});

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
  .banner { margin: 0 0 16px; padding: 12px 14px; border-radius: 10px; font-size: 14px; font-weight: 600; }
  .banner.blocked { color: #ffd0a8; background: #3a2410; border: 1px solid #6b451d; }
  .banner.allowed { color: #b7e6c2; background: #16301f; border: 1px solid #2c5b3a; }
  .stages { list-style: none; padding: 0; margin: 6px 0 0; }
  .stage { padding: 10px 12px; border-radius: 9px; margin-top: 8px; font-size: 13px;
    background: #0f1b24; border: 1px solid #243845; }
  .stage .head { display: flex; gap: 8px; align-items: center; font-weight: 700; text-transform: capitalize; }
  .tag { font-size: 11px; font-weight: 700; border-radius: 6px; padding: 2px 7px; }
  .tag.block { color: #ffb4b4; background: #3a1a1a; }
  .tag.ok { color: #b7e6c2; background: #16301f; }
  .stage .cats { color: #cbb39a; margin-top: 4px; }
  .stage .reason { color: #9fb3bf; margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
  #result img { margin-top: 16px; max-width: 100%; border-radius: 10px; display: block;
    border: 2px solid #6b451d; }
  .caption { margin-top: 10px; font-size: 13px; color: #9fb3bf; }
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
      <h1>Image review</h1>
      <p class="sub">Generates an image and shows it <strong>with every safety verdict</strong>,
        even when the child-facing app would block it. Blocked results are outlined in amber.</p>
      <form id="form">
        <label for="prompt">Prompt</label>
        <textarea id="prompt" rows="3" maxlength="2000" required
          placeholder="Describe the image to generate and review…"></textarea>
        <button class="primary" id="go" type="submit">Generate &amp; review</button>
      </form>
      <div id="status" class="status" role="status" aria-live="polite"></div>
      <div id="verdict"></div>
      <div id="result"></div>
    </div>
  </main>
  <script>${reviewClientJs()}</script>
</body></html>`;
}

function reviewClientJs(): string {
  return `
  const form = document.getElementById('form');
  const promptEl = document.getElementById('prompt');
  const go = document.getElementById('go');
  const statusEl = document.getElementById('status');
  const verdictEl = document.getElementById('verdict');
  const result = document.getElementById('result');

  function setStatus(text, cls) {
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
    statusEl.innerHTML = text;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  function renderStages(stages) {
    const items = stages.map(s => {
      const tag = s.allowed
        ? '<span class="tag ok">passed</span>'
        : '<span class="tag block">blocked</span>';
      const cats = (s.categories && s.categories.length)
        ? '<div class="cats">Categories: ' + esc(s.categories.join(', ')) + ' · severity: ' + esc(s.severity) + '</div>'
        : '';
      const reason = s.reason ? '<div class="reason">' + esc(s.reason) + '</div>' : '';
      return '<li class="stage"><div class="head">' + esc(s.stage) + ' ' + tag + '</div>' + cats + reason + '</li>';
    }).join('');
    return '<ul class="stages">' + items + '</ul>';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = promptEl.value.trim();
    if (!prompt) return;
    go.disabled = true;
    verdictEl.innerHTML = '';
    result.innerHTML = '';
    setStatus('<span class="spinner"></span>Generating and running safety checks…');

    try {
      const res = await fetch('/v1/review/images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) { setStatus('Session ended. <a class="link" href="/review">Unlock again</a>.', 'error'); return; }
      if (res.status === 404) { setStatus('Review area is disabled.', 'error'); return; }
      if (!res.ok || !data.ok) {
        setStatus(esc((data && data.error) || 'Generation failed (status ' + res.status + ').'), 'error');
        return;
      }

      setStatus('');
      const banner = data.blocked
        ? '<div class="banner blocked">⚠ This result WAS BLOCKED for the child-facing app. Shown here for operator review only.</div>'
        : '<div class="banner allowed">✓ This result passed all safety checks.</div>';
      verdictEl.innerHTML = banner + renderStages(data.stages || []);

      const images = (data.result && data.result.images) || [];
      const captions = (data.result && data.result.captions) || [];
      if (!images.length) {
        const note = document.createElement('p');
        note.className = 'caption';
        note.textContent = data.blocked
          ? 'No image to show (blocked before any image was generated).'
          : 'No image was returned.';
        result.appendChild(note);
      }
      for (const img of images) {
        const el = document.createElement('img');
        el.src = 'data:' + img.mimeType + ';base64,' + img.dataBase64;
        el.alt = prompt;
        result.appendChild(el);
      }
      if (captions.length) {
        const cap = document.createElement('p');
        cap.className = 'caption';
        cap.textContent = captions.join(' ');
        result.appendChild(cap);
      }
    } catch (err) {
      setStatus('Could not reach the server. Try again.', 'error');
    } finally {
      go.disabled = false;
    }
  });
  `;
}
