import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { requirePageAuth } from '../middleware/requireAuth.js';
import { availableEngines, ENGINE_NAMES, illustratorName } from '../providers/imageProvider.js';
import { MUSIC_BG_BRIGHT } from './wallpapers.js';

/**
 * Authenticated browser pages: the landing hub and one page per creative tool.
 * All generation still happens through the moderated `/v1/*` JSON API; these
 * pages are just the kid-facing UI that calls it.
 */
export const pagesRouter = Router();

// Every page here requires a signed-in session. (Exact GET paths only —
// `use('/')` would mount at root and swallow /health and the /v1 API too.)
for (const path of ['/', '/images', '/books', '/library', '/music', '/voice', '/code']) {
  pagesRouter.get(path, requirePageAuth);
}
pagesRouter.get('/books/:id', requirePageAuth);

interface Feature {
  href: string;
  icon: string;
  title: string;
  blurb: string;
  ready: boolean;
}

const FEATURES: Feature[] = [
  { href: '/books', icon: '📖', title: 'Storybooks', blurb: 'Read, write, and use AI to illustrate storybooks', ready: true },
  { href: '/music', icon: '🎵', title: 'Music', blurb: 'Make a song with AI', ready: true },
  { href: '/voice', icon: '🎙️', title: 'Voices', blurb: 'Make a voice that sounds like you', ready: true },
  { href: '/code', icon: '💻', title: 'Coding', blurb: 'Build something with code', ready: false },
];

// A light, hand-drawn-feeling library wallpaper (rows of book spines on
// shelves) as a self-contained inline SVG tile — no external assets.
const LIBRARY_BG_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='240' viewBox='0 0 300 240'>` +
  `<rect width='300' height='240' fill='#f4ecdc'/>` +
  `<g opacity='.30'>` +
  `<rect x='12' y='34' width='15' height='64' rx='2' fill='#c7a97e'/>` +
  `<rect x='30' y='42' width='13' height='56' rx='2' fill='#a9bfa4'/>` +
  `<rect x='46' y='30' width='16' height='68' rx='2' fill='#cf9c93'/>` +
  `<rect x='65' y='44' width='12' height='54' rx='2' fill='#9fb4cc'/>` +
  `<rect x='80' y='36' width='15' height='62' rx='2' fill='#d6bd8e'/>` +
  `<rect x='103' y='46' width='13' height='52' rx='2' fill='#b9a3c4' transform='rotate(-9 109 98)'/>` +
  `<rect x='122' y='38' width='14' height='60' rx='2' fill='#98b5ab'/>` +
  `<rect x='139' y='32' width='16' height='66' rx='2' fill='#c9b7a0'/>` +
  `<rect x='158' y='44' width='12' height='54' rx='2' fill='#cf9c93'/>` +
  `<rect x='173' y='36' width='15' height='62' rx='2' fill='#9fb4cc'/>` +
  `<rect x='191' y='42' width='13' height='56' rx='2' fill='#c7a97e'/>` +
  `<rect x='207' y='30' width='16' height='68' rx='2' fill='#a9bfa4'/>` +
  `<rect x='226' y='44' width='12' height='54' rx='2' fill='#d6bd8e'/>` +
  `<rect x='241' y='38' width='14' height='60' rx='2' fill='#b9a3c4'/>` +
  `<rect x='258' y='34' width='15' height='64' rx='2' fill='#98b5ab'/>` +
  `<rect x='276' y='44' width='13' height='54' rx='2' fill='#cf9c93'/>` +
  `<rect x='0' y='98' width='300' height='8' fill='#c2a87e'/>` +
  `</g>` +
  `<g opacity='.30'>` +
  `<rect x='6' y='162' width='14' height='56' rx='2' fill='#9fb4cc'/>` +
  `<rect x='23' y='152' width='16' height='66' rx='2' fill='#d6bd8e'/>` +
  `<rect x='42' y='164' width='12' height='54' rx='2' fill='#c7a97e'/>` +
  `<rect x='57' y='156' width='15' height='62' rx='2' fill='#98b5ab'/>` +
  `<rect x='75' y='150' width='16' height='68' rx='2' fill='#b9a3c4'/>` +
  `<rect x='94' y='162' width='13' height='56' rx='2' fill='#cf9c93'/>` +
  `<rect x='112' y='166' width='12' height='52' rx='2' fill='#a9bfa4' transform='rotate(8 118 218)'/>` +
  `<rect x='131' y='154' width='15' height='64' rx='2' fill='#c9b7a0'/>` +
  `<rect x='149' y='158' width='14' height='60' rx='2' fill='#9fb4cc'/>` +
  `<rect x='166' y='150' width='16' height='68' rx='2' fill='#c7a97e'/>` +
  `<rect x='185' y='164' width='12' height='54' rx='2' fill='#cf9c93'/>` +
  `<rect x='200' y='156' width='15' height='62' rx='2' fill='#a9bfa4'/>` +
  `<rect x='218' y='152' width='13' height='66' rx='2' fill='#d6bd8e'/>` +
  `<rect x='234' y='162' width='14' height='56' rx='2' fill='#b9a3c4'/>` +
  `<rect x='251' y='154' width='16' height='64' rx='2' fill='#98b5ab'/>` +
  `<rect x='270' y='160' width='13' height='58' rx='2' fill='#c9b7a0'/>` +
  `<rect x='0' y='218' width='300' height='8' fill='#c2a87e'/>` +
  `</g></svg>`;

/** Override block that swaps the blue gradient for the light library wallpaper. */
const LIBRARY_MODE_CSS = `<style>
  body { background: #f4ecdc url("data:image/svg+xml,${encodeURIComponent(LIBRARY_BG_SVG)}") repeat; color: #3d2f1e; }
  header { color: #5a4632; }
  .back, .signout { color: #5a4632; }
  .signout { border-color: rgba(90,70,50,.45); }
  .signout:hover { background: rgba(90,70,50,.08); }
</style>`;

/** Shared page shell: Harbor House styling + header with sign-out. */
export function shell(opts: {
  title: string;
  /** true = "← Home"; or a custom destination for the top-left link. */
  back?: boolean | { href: string; label: string };
  body: string;
  head?: string;
  /** Storybook mode: light library wallpaper instead of the blue gradient. */
  library?: boolean;
}): string {
  const back =
    typeof opts.back === 'object'
      ? `<a class="back" href="${opts.back.href}">← ${opts.back.label}</a>`
      : opts.back
        ? '<a class="back" href="/">← Home</a>'
        : '<span class="back-spacer"></span>';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${opts.title}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(160deg, #1e3a5f 0%, #2c6e8f 60%, #3d9bb5 100%);
      color: #102a36;
    }
    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 22px; color: #fff;
    }
    header .title { font-weight: 700; font-size: 18px; display: flex; gap: 8px; align-items: center; }
    .back, .signout { color: #fff; text-decoration: none; font-size: 14px; font-weight: 600; opacity: .92; }
    .back:hover, .signout:hover { opacity: 1; text-decoration: underline; }
    .back-spacer { width: 60px; }
    .signout { background: none; border: 1px solid rgba(255,255,255,.55); border-radius: 8px;
      padding: 7px 12px; cursor: pointer; }
    .signout:hover { background: rgba(255,255,255,.12); text-decoration: none; }
    main { width: min(92vw, 760px); margin: 8px auto 48px; }
    .card { background: #fff; border-radius: 16px; padding: 28px;
      box-shadow: 0 18px 40px rgba(16, 42, 54, 0.30); }
    h1 { margin: 0 0 6px; font-size: 24px; }
    .sub { margin: 0 0 22px; color: #5a7785; font-size: 15px; }
  </style>
  ${opts.library ? LIBRARY_MODE_CSS : ''}
  ${opts.head ?? ''}
</head>
<body>
  <header>
    ${back}
    <span class="title">⚓ Harbor House</span>
    <form method="post" action="/logout"><button class="signout" type="submit">Sign out</button></form>
  </header>
  <main>${opts.body}</main>
</body>
</html>`;
}

// --- Landing hub: one button per feature -------------------------------------
pagesRouter.get('/', (_req: Request, res: Response) => {
  const tiles = FEATURES.map(
    (f) => `
    <a class="tile${f.ready ? '' : ' soon'}${f.href === '/books' ? ' storybooks' : ''}${f.href === '/music' ? ' musictile' : ''}" href="${f.href}">
      <span class="tile-icon" aria-hidden="true">${f.icon}</span>
      <span class="tile-title">${f.title}</span>
      <span class="tile-blurb">${f.blurb}</span>
      ${f.ready ? '' : '<span class="badge">Coming soon</span>'}
    </a>`,
  ).join('');

  res.type('html').send(
    shell({
      title: 'Harbor House',
      body: `<div class="card">
        <h1>What do you want to create?</h1>
        <p class="sub">Pick a tool to get started. Everything you make is kept friendly and safe.</p>
        <div class="grid">${tiles}</div>
      </div>`,
      head: `<style>
        .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        @media (max-width: 520px) { .grid { grid-template-columns: 1fr; } }
        .tile { position: relative; display: flex; flex-direction: column; gap: 4px;
          padding: 22px; border-radius: 14px; text-decoration: none; color: #102a36;
          background: #f1f7fa; border: 1px solid #dceaf0; transition: transform .08s, box-shadow .12s; }
        .tile:hover { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(16,42,54,.16); }
        .tile-icon { font-size: 34px; }
        .tile-title { font-weight: 700; font-size: 18px; }
        .tile-blurb { font-size: 14px; color: #5a7785; }
        .tile.soon { opacity: .72; }
        /* Storybooks tile: a very light library-bookshelf wallpaper behind the text. */
        .tile.storybooks {
          background:
            linear-gradient(rgba(255,255,255,.62), rgba(255,255,255,.62)),
            url("data:image/svg+xml,${encodeURIComponent(LIBRARY_BG_SVG)}") repeat;
          background-size: auto, 200px;
          border-color: #e7dcc4;
        }
        /* Music tile: the sunny staff-and-notes wallpaper behind the text. */
        .tile.musictile {
          background:
            linear-gradient(rgba(255,255,255,.58), rgba(255,255,255,.58)),
            url("data:image/svg+xml,${encodeURIComponent(MUSIC_BG_BRIGHT)}") repeat;
          background-size: auto, 220px;
          border-color: #cfe4ef;
        }
        .badge { position: absolute; top: 12px; right: 12px; font-size: 11px; font-weight: 700;
          color: #2c6e8f; background: #dcebf1; border-radius: 999px; padding: 3px 9px; }
        /* Experimental-features opt-in (primary account only, once per login) */
        .exp-backdrop { position: fixed; inset: 0; background: rgba(16,42,54,.55);
          z-index: 80; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .exp-modal { background: #fff; border-radius: 14px; width: min(92vw, 420px);
          padding: 22px 24px; box-shadow: 0 24px 60px rgba(0,0,0,.4); }
        .exp-modal h3 { margin: 0 0 14px; font-size: 18px; color: #102a36; }
        .exp-modal label { display: flex; align-items: center; gap: 10px; font-size: 15px;
          color: #102a36; cursor: pointer; }
        .exp-modal input { width: 18px; height: 18px; accent-color: #2c6e8f; cursor: pointer; }
        .exp-modal .cta { margin-top: 18px; width: 100%; }
      </style>`,
    }) +
      `<script>
      // Primary-account opt-in: shown once per login session. Other accounts
      // never see it (the server reports eligible:false for them).
      (async () => {
        try {
          const res = await fetch('/v1/experimental');
          const data = await res.json();
          if (!res.ok || !data.ok || !data.eligible || data.prompted) return;
          const backdrop = document.createElement('div');
          backdrop.className = 'exp-backdrop';
          const modal = document.createElement('div');
          modal.className = 'exp-modal';
          const h = document.createElement('h3');
          h.textContent = 'Welcome back!';
          const label = document.createElement('label');
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.checked = false;
          label.appendChild(box);
          label.appendChild(document.createTextNode('Allow experimental features'));
          // Moderation strictness for this session (kept per-login; kids'
          // accounts never see this dialog and always run the strictest).
          const lvlLabel = document.createElement('label');
          lvlLabel.style.cssText = 'display:block;margin-top:14px;font-size:13px;font-weight:700;color:#4a6c7c;';
          lvlLabel.textContent = 'Safety level';
          const lvl = document.createElement('select');
          lvl.style.cssText = 'display:block;width:100%;margin-top:6px;padding:9px 11px;font-size:14px;' +
            'font-family:inherit;border:1px solid #c9dbe4;border-radius:10px;background:#fff;color:#102a36;';
          for (const v of ['BLOCK_LOW_AND_ABOVE', 'BLOCK_MEDIUM_AND_ABOVE', 'BLOCK_ONLY_HIGH', 'BLOCK_NONE']) {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v + (v === 'BLOCK_LOW_AND_ABOVE' ? ' (default)' : '');
            lvl.appendChild(opt);
          }
          const go = document.createElement('button');
          go.type = 'button';
          go.className = 'cta';
          go.textContent = 'Continue';
          go.addEventListener('click', async () => {
            go.disabled = true;
            try {
              await fetch('/v1/experimental', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ enabled: box.checked, safetyLevel: lvl.value }),
              });
            } catch {}
            backdrop.remove();
          });
          modal.appendChild(h);
          modal.appendChild(label);
          modal.appendChild(lvlLabel);
          modal.appendChild(lvl);
          modal.appendChild(go);
          backdrop.appendChild(modal);
          document.body.appendChild(backdrop);
        } catch {}
      })();
      </script>`,
  );
});

// --- Storybooks ---------------------------------------------------------------
// The old single-image tool grew into a picture-book maker; keep the old URL.
pagesRouter.get('/images', (_req: Request, res: Response) => res.redirect('/books'));

/** Friendly error text shared by the storybook pages' client scripts. */
const CLIENT_HELPERS_JS = `
  // Safety blocks (bad words / unsafe ideas) surface in a popup the child
  // can't miss, instead of the status line below the book. Self-contained
  // inline styles so every storybook page can show it, above any open dialog.
  // The moderator's category ids, in words a child understands.
  const SAFETY_REASONS = {
    violence: '🥊 Fighting or violence',
    weapons: '⚔️ Weapons',
    sexual: '🔞 Grown-up content',
    self_harm: '🩹 Getting hurt',
    harassment: '😠 Being unkind to someone',
    hate: '💔 Mean or hateful words',
    dangerous_acts: '⚡ Dangerous things to copy',
    drugs: '🚭 Drugs, alcohol, or smoking',
    pii: '🔒 Personal information',
    profanity: '🤐 Bad words',
    illegal: '🚫 Against the rules or the law',
    age_inappropriate: '👻 Too scary or grown-up',
    jailbreak: '🎭 Trying to trick the safety rules',
    other: '🚧 Not right for kids',
  };
  function showSafetyDialog(message, categories) {
    const old = document.getElementById('safety-dialog');
    if (old) old.remove();
    const backdrop = document.createElement('div');
    backdrop.id = 'safety-dialog';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(30,22,10,.55);' +
      'z-index:120;display:flex;align-items:center;justify-content:center;padding:20px;';
    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fdf9f0;border-radius:14px;width:min(92vw,420px);' +
      'padding:22px 24px;box-shadow:0 24px 60px rgba(0,0,0,.45);text-align:center;';
    const icon = document.createElement('div');
    icon.style.cssText = 'font-size:40px;';
    icon.textContent = '⚠️';
    const h = document.createElement('h3');
    h.style.cssText = 'margin:8px 0 10px;font-size:18px;color:#5a4632;';
    h.textContent = 'Hold on a moment!';
    const p = document.createElement('p');
    p.style.cssText = 'margin:0 0 14px;font-size:15px;line-height:1.55;color:#3d2f1e;';
    p.textContent = message; // moderator text — always plain text, never HTML
    // Why it was blocked: the moderator's categories, in kid words.
    const reasons = (categories || [])
      .map((c) => SAFETY_REASONS[c] || String(c).replace(/_/g, ' '))
      .filter((v, i, a) => a.indexOf(v) === i);
    let reasonBox = null;
    if (reasons.length) {
      reasonBox = document.createElement('div');
      reasonBox.style.cssText = 'margin:0 0 18px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;';
      const why = document.createElement('span');
      why.style.cssText = 'font-size:13px;font-weight:800;color:#6b5d43;align-self:center;';
      why.textContent = 'Why?';
      reasonBox.appendChild(why);
      for (const r of reasons) {
        const chip = document.createElement('span');
        chip.style.cssText = 'font-size:13px;font-weight:700;color:#8a5a00;background:#f6ecd2;' +
          'border:1px solid #e0c98a;border-radius:999px;padding:4px 11px;';
        chip.textContent = r;
        reasonBox.appendChild(chip);
      }
    }
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = 'OK';
    ok.style.cssText = 'padding:10px 34px;font-size:15px;font-weight:700;color:#fff;' +
      'background:#2c6e8f;border:none;border-radius:10px;cursor:pointer;';
    ok.addEventListener('click', () => backdrop.remove());
    modal.appendChild(icon);
    modal.appendChild(h);
    modal.appendChild(p);
    if (reasonBox) modal.appendChild(reasonBox);
    modal.appendChild(ok);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    ok.focus();
  }
  function friendlyError(res, data) {
    if (data && data.code === 'credits_exhausted') {
      return { text: '🪫 ' + (data.error || 'The AI credits have run out — ask a grown-up to top up the account.'), cls: 'error' };
    }
    if (res.status === 403 && data && data.blocked) {
      // A real safety block: the popup carries the warning (and WHY it was
      // blocked, from the moderator's categories); nothing below the book.
      showSafetyDialog(
        data.message || "Let's try a different idea — keep it friendly and safe!",
        data.verdict && data.verdict.categories,
      );
      return { text: '', cls: '' };
    }
    if (res.status === 401) return { text: 'Your session ended. <a href="/login">Sign in again</a>.', cls: 'error' };
    if (res.status === 409 && data && data.error) return { text: data.error, cls: 'blocked' };
    if (res.status === 501) return { text: "The picture tool isn't set up yet. Ask a grown-up to add the image key.", cls: 'error' };
    if (res.status === 503) return { text: 'Lots of people are creating right now — please try again in a moment.', cls: 'error' };
    return { text: 'Something went wrong. Please try again.', cls: 'error' };
  }
`;

// Shared styles for the storybook pages.
const BOOK_STYLES = `<style>
  input[type=text], textarea { width: 100%; padding: 12px 14px; font-size: 15px; font-family: inherit;
    border: 1px solid #c4d3da; border-radius: 11px; outline: none; }
  textarea { resize: vertical; }
  input[type=text]:focus, textarea:focus { border-color: #2c6e8f; box-shadow: 0 0 0 3px rgba(44,110,143,.18); }
  button.cta { padding: 12px 18px; font-size: 15px; font-weight: 600;
    color: #fff; background: #2c6e8f; border: none; border-radius: 10px; cursor: pointer; }
  button.cta:hover { background: #245d79; }
  button.cta:disabled { background: #9bb6c2; cursor: progress; }
  .status { margin-top: 14px; font-size: 14px; min-height: 20px; }
  .status.error { color: #8a1c1c; }
  .status.blocked { color: #8a5a00; }
  .linkbtn { background: none; border: none; color: #2c6e8f; font-size: 13px; font-weight: 700;
    cursor: pointer; padding: 4px 2px; text-decoration: underline; }
  .linkbtn:hover { color: #245d79; }
  .spinner { display: inline-block; width: 16px; height: 16px; vertical-align: -3px;
    margin-right: 8px; border: 3px solid #c4d3da; border-top-color: #2c6e8f;
    border-radius: 50%; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>`;

/** Grid + tile styles shared by the shelf and the library. */
const SHELF_STYLES = `<style>
  .shelf { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 22px; }
  @media (max-width: 620px) { .shelf { grid-template-columns: repeat(2, 1fr); } }
  .book-tile { position: relative; display: flex; flex-direction: column; text-decoration: none;
    color: #102a36; background: #f1f7fa; border: 1px solid #dceaf0; border-radius: 12px;
    overflow: hidden; transition: transform .08s, box-shadow .12s; }
  .book-tile:hover { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(16,42,54,.16); }
  .book-cover { aspect-ratio: 1; width: 100%; object-fit: cover; background: #dcebf1; }
  .book-cover.placeholder { display: grid; place-items: center; font-size: 42px; }
  .book-meta { padding: 10px 12px 12px; }
  .book-title { font-weight: 700; font-size: 15px; line-height: 1.25; }
  .book-by { font-size: 12px; color: #5a7785; margin-top: 2px; font-style: italic; }
  .book-pages { font-size: 12px; color: #5a7785; margin-top: 2px; }
  .pubbadge { display: inline-block; margin-top: 6px; font-size: 11px; font-weight: 700;
    color: #2c6e8f; background: #dcebf1; border-radius: 999px; padding: 2px 8px; }
  .book-del { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; border: none;
    border-radius: 50%; background: rgba(16,42,54,.55); color: #fff; font-size: 14px; cursor: pointer;
    line-height: 1; display: grid; place-items: center; }
  .book-del:hover { background: rgba(138,28,28,.85); }
  .empty { margin-top: 22px; color: #5a7785; font-size: 14px; }
  .field-label { display: block; font-size: 13px; font-weight: 600; margin: 14px 0 6px; }
  .field-label:first-of-type { margin-top: 0; }
</style>`;

/** Client-side "written by A, B and C" formatter, shared by shelf/library/reader. */
const AUTHORS_JS = `
  function authorsLine(authors) {
    const a = (authors || []).filter(Boolean);
    if (!a.length) return '';
    if (a.length === 1) return a[0];
    return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  }
`;

/** Landing-style option tiles, reused by the storybooks hub. */
const OPTION_TILE_CSS = `<style>
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  @media (max-width: 620px) { .grid { grid-template-columns: 1fr; } }
  .tile { display: flex; flex-direction: column; gap: 4px;
    padding: 22px; border-radius: 14px; text-decoration: none; color: #102a36;
    background: #f1f7fa; border: 1px solid #dceaf0; transition: transform .08s, box-shadow .12s; }
  .tile:hover { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(16,42,54,.16); }
  .tile-icon { font-size: 34px; }
  .tile-title { font-weight: 700; font-size: 18px; }
  .tile-blurb { font-size: 14px; color: #5a7785; }
</style>`;

// --- Storybooks hub: start / my books / library ---------------------------------
pagesRouter.get('/books', (_req: Request, res: Response) => {
  res.type('html').send(
    shell({
      title: 'Storybooks — Harbor House',
      back: true,
      library: true,
      body: `<div class="card">
        <h1>📖 Storybooks</h1>
        <p class="sub">Read, write, and use AI to illustrate storybooks.</p>
        <div class="grid">
          <a class="tile" href="/books/new">
            <span class="tile-icon" aria-hidden="true">✨</span>
            <span class="tile-title">Start a new book</span>
            <span class="tile-blurb">Name your story and paint its cover</span>
          </a>
          <a class="tile" href="/books/mine">
            <span class="tile-icon" aria-hidden="true">📖</span>
            <span class="tile-title">My storybooks</span>
            <span class="tile-blurb">Keep writing, or read your saved books</span>
          </a>
          <a class="tile" href="/library">
            <span class="tile-icon" aria-hidden="true">📚</span>
            <span class="tile-title">Browse the library</span>
            <span class="tile-blurb">Read books our authors have published</span>
          </a>
        </div>
      </div>`,
      head: OPTION_TILE_CSS,
    }),
  );
});

/**
 * Radio tiles for choosing which engine paints the book's pictures. Only the
 * engines that are configured are offered; when there is no real choice (zero
 * or one engine available) the picker — label and all — is omitted and the
 * default engine applies.
 */
function enginePickerHtml(): string {
  const engines = availableEngines();
  if (engines.length < 2) return '';
  const def = engines.includes(config.storyImage.provider)
    ? config.storyImage.provider
    : engines[0]!;
  const DETAILS: Record<string, { icon: string; blurb: string }> = {
    replicate: { icon: '🍌✨', blurb: 'Extra-fancy pictures' },
    gemini: { icon: '🍌', blurb: 'Quick pictures' },
  };
  const tiles = engines
    .map((value) => `
    <label class="engine">
      <input type="radio" name="engine" value="${value}" ${value === def ? 'checked' : ''} />
      <span class="engine-body">
        <span class="engine-icon" aria-hidden="true">${DETAILS[value]!.icon}</span>
        <span class="engine-title">${ENGINE_NAMES[value].replace('Google ', '')}</span>
        <span class="engine-blurb">${DETAILS[value]!.blurb}</span>
      </span>
    </label>`)
    .join('');
  return `<label class="field-label">Who should paint the pictures?</label>
  <div class="engine-pick" role="radiogroup" aria-label="Who should paint the pictures?">
    ${tiles}
  </div>`;
}

const ENGINE_PICKER_CSS = `<style>
  .engine-pick { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 520px) { .engine-pick { grid-template-columns: 1fr; } }
  .engine { display: block; cursor: pointer; }
  .engine input { position: absolute; opacity: 0; }
  .engine-body { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px;
    border: 2px solid #c4d3da; border-radius: 11px; background: #f8fbfc; }
  .engine input:checked + .engine-body { border-color: #2c6e8f; background: #eaf4f8;
    box-shadow: 0 0 0 3px rgba(44,110,143,.15); }
  .engine input:focus-visible + .engine-body { outline: 2px solid #2c6e8f; outline-offset: 2px; }
  .engine-icon { font-size: 22px; }
  .engine-title { font-weight: 700; font-size: 15px; }
  .engine-blurb { font-size: 13px; color: #5a7785; }
</style>`;

// --- Start a new book -------------------------------------------------------------
pagesRouter.get('/books/new', (_req: Request, res: Response) => {
  res.type('html').send(
    shell({
      title: 'New book — Harbor House',
      back: { href: '/books', label: 'Storybooks' },
      library: true,
      body: `<div class="card">
        <h1>✨ Start a new book</h1>
        <p class="sub">Give your story a name, describe its cover, and say who wrote it.</p>
        <form id="new-book">
          <label class="field-label" for="title">What is your story called?</label>
          <input id="title" type="text" maxlength="80" required placeholder="The Turtle Who Loved Hats…" />
          <label class="field-label" for="coverprompt">What should the cover picture look like? <span style="font-weight:400;color:#5a7785">(the title words will be painted into it)</span></label>
          <input id="coverprompt" type="text" maxlength="1000" placeholder="A little turtle in a big red hat, waving from a sunny beach" />
          ${enginePickerHtml()}
          <label class="field-label">Who wrote it?</label>
          <div id="authors"><input class="author" type="text" maxlength="40" placeholder="Author name" /></div>
          <button type="button" class="linkbtn" id="addauthor">+ Add another author</button>
          <div><button class="cta" id="create" type="submit" style="margin-top:12px">✨ Make my book</button></div>
        </form>
        <div id="status" class="status" role="status" aria-live="polite"></div>
      </div>`,
      head: BOOK_STYLES + SHELF_STYLES + ENGINE_PICKER_CSS,
    }) + `<script>${CLIENT_HELPERS_JS}${newBookClientJs()}</script>`,
  );
});

// --- My storybooks: the owner's shelf ----------------------------------------------
pagesRouter.get('/books/mine', (_req: Request, res: Response) => {
  res.type('html').send(
    shell({
      title: 'My storybooks — Harbor House',
      back: { href: '/books', label: 'Storybooks' },
      library: true,
      body: `<div class="card">
        <h1>📖 My storybooks</h1>
        <p class="sub">Open a book to keep writing or read it again — or
          <a href="/books/new">✨ start a new one</a>.</p>
        <div id="shelf" class="shelf"></div>
      </div>`,
      head: BOOK_STYLES + SHELF_STYLES,
    }) + `<script>${AUTHORS_JS}${BOOK_TILE_JS}${myBooksClientJs()}</script>`,
  );
});

/** Renders one shelf/library tile. Shared between the two pages. */
const BOOK_TILE_JS = `
  function bookTile(b, opts) {
    const tile = document.createElement('a');
    tile.className = 'book-tile';
    // Remember where the reader was opened from, so its "←" can return there.
    tile.href = '/books/' + b.id + (opts && opts.from ? '?from=' + opts.from : '');
    if (b.cover) {
      const img = document.createElement('img');
      img.className = 'book-cover';
      img.src = 'data:' + b.cover.mimeType + ';base64,' + b.cover.dataBase64;
      img.alt = b.title;
      tile.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'book-cover placeholder';
      ph.textContent = '📖';
      tile.appendChild(ph);
    }
    const meta = document.createElement('div');
    meta.className = 'book-meta';
    const t = document.createElement('div');
    t.className = 'book-title';
    t.textContent = b.title;
    meta.appendChild(t);
    const by = authorsLine(b.authors);
    if (by) {
      const byEl = document.createElement('div');
      byEl.className = 'book-by';
      byEl.textContent = 'by ' + by;
      meta.appendChild(byEl);
    }
    const pc = document.createElement('div');
    pc.className = 'book-pages';
    pc.textContent = b.pageCount === 1 ? '1 page' : b.pageCount + ' pages';
    meta.appendChild(pc);
    if (opts && opts.showPublished && b.status === 'published') {
      const badge = document.createElement('span');
      badge.className = 'pubbadge';
      badge.textContent = '📚 In the library';
      meta.appendChild(badge);
    }
    tile.appendChild(meta);
    return tile;
  }
`;

function newBookClientJs(): string {
  return `
  const form = document.getElementById('new-book');
  const titleEl = document.getElementById('title');
  const coverEl = document.getElementById('coverprompt');
  const authorsBox = document.getElementById('authors');
  const create = document.getElementById('create');
  const statusEl = document.getElementById('status');

  function setStatus(text, cls) {
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
    statusEl.innerHTML = text;
  }

  // Up to 6 author inputs.
  document.getElementById('addauthor').addEventListener('click', () => {
    if (authorsBox.querySelectorAll('.author').length >= 6) return;
    const input = document.createElement('input');
    input.className = 'author';
    input.type = 'text';
    input.maxLength = 40;
    input.placeholder = 'Another author';
    input.style.marginTop = '8px';
    authorsBox.appendChild(input);
    input.focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = titleEl.value.trim();
    if (!title) return;
    const coverPrompt = coverEl.value.trim();
    const authors = Array.from(authorsBox.querySelectorAll('.author'))
      .map((i) => i.value.trim()).filter(Boolean);
    const engineEl = form.querySelector('input[name="engine"]:checked');
    const imageEngine = engineEl ? engineEl.value : undefined;
    create.disabled = true;
    setStatus('<span class="spinner"></span>Making your book and painting the cover…');
    try {
      const res = await fetch('/v1/books', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: title, coverPrompt: coverPrompt || undefined, authors: authors, imageEngine: imageEngine }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        location.href = '/books/' + data.book.id;
        return;
      }
      const f = friendlyError(res, data);
      setStatus(f.text, f.cls);
    } catch {
      setStatus('Could not reach the server. Check your connection and try again.', 'error');
    } finally {
      create.disabled = false;
    }
  });
  `;
}

function myBooksClientJs(): string {
  return `
  const shelf = document.getElementById('shelf');

  async function loadShelf() {
    try {
      const res = await fetch('/v1/books');
      const data = await res.json();
      if (!data.ok) return;
      shelf.innerHTML = '';
      if (!data.books.length) {
        const p = document.createElement('p');
        p.className = 'empty';
        p.textContent = 'No books yet — write your first one!';
        shelf.appendChild(p);
        return;
      }
      for (const b of data.books) {
        const tile = bookTile(b, { showPublished: true, from: 'mine' });
        const del = document.createElement('button');
        del.className = 'book-del';
        del.type = 'button';
        del.title = 'Delete this book';
        del.textContent = '✕';
        del.addEventListener('click', async (e) => {
          e.preventDefault(); e.stopPropagation();
          if (!confirm('Delete "' + b.title + '"? This cannot be undone.')) return;
          await fetch('/v1/books/' + b.id, { method: 'DELETE' });
          loadShelf();
        });
        tile.appendChild(del);
        shelf.appendChild(tile);
      }
    } catch {}
  }

  loadShelf();
  `;
}

// --- The library: browse and read published books --------------------------------
pagesRouter.get('/library', (_req: Request, res: Response) => {
  res.type('html').send(
    shell({
      title: 'Library — Harbor House',
      back: { href: '/books', label: 'Storybooks' },
      library: true,
      body: `<div class="card">
        <h1>📚 The library</h1>
        <p class="sub">Storybooks published by our authors. Pick one to read!
          Want to write your own? Head to <a href="/books">📖 My storybooks</a>.</p>
        <div id="shelf" class="shelf"></div>
      </div>`,
      head: BOOK_STYLES + SHELF_STYLES,
    }) + `<script>${AUTHORS_JS}${BOOK_TILE_JS}${libraryClientJs()}</script>`,
  );
});

function libraryClientJs(): string {
  return `
  const shelf = document.getElementById('shelf');
  (async () => {
    try {
      const res = await fetch('/v1/library');
      const data = await res.json();
      if (!data.ok) return;
      if (!data.books.length) {
        const p = document.createElement('p');
        p.className = 'empty';
        p.textContent = 'The library is empty — be the first to publish a book!';
        shelf.appendChild(p);
        return;
      }
      for (const b of data.books) shelf.appendChild(bookTile(b, { from: 'library' }));
    } catch {}
  })();
  `;
}

// --- Book reader: open-book spread, words left / picture right ------------------
pagesRouter.get('/books/:id', (req: Request, res: Response) => {
  const id = req.params.id ?? '';
  // The top-left "←" returns to wherever the reader came from: the shelf and
  // the library link here with ?from=mine / ?from=library. With no marker
  // (e.g. straight after creating a book) it falls back to the Storybooks hub.
  const back =
    req.query.from === 'library'
      ? { href: '/library', label: 'Library' }
      : req.query.from === 'mine'
        ? { href: '/books/mine', label: 'My storybooks' }
        : { href: '/books', label: 'Storybooks' };
  // The page shell is static; the client fetches the book JSON by id.
  res.type('html').send(
    shell({
      title: 'My book — Harbor House',
      back,
      library: true,
      body: `<div id="book-root" data-book-id="${encodeURIComponent(id)}">
        <div class="book-wrap">
          <div class="book" id="book">
            <div class="page page-left" id="page-left"></div>
            <div class="spine" id="spine"></div>
            <div class="page page-right" id="page-right"></div>
          </div>
        </div>
        <nav class="booknav">
          <button class="navbtn" id="prev" type="button">‹ Back</button>
          <span class="navlabel" id="navlabel"></span>
          <button class="navbtn" id="next" type="button">Next ›</button>
        </nav>
        <div class="bookactions" id="bookactions" hidden></div>
        <div id="status" class="status" role="status" aria-live="polite" style="text-align:center"></div>
      </div>`,
      head:
        BOOK_STYLES +
        `<style>
        main { width: min(96vw, 980px); }
        .book-wrap { perspective: 1600px; }
        .book { display: flex; background: #fdf9f0; border-radius: 12px; min-height: 440px;
          box-shadow: 0 24px 50px rgba(16,42,54,.35); overflow: hidden; }
        .page { flex: 1 1 0; min-width: 0; padding: 28px; display: flex; flex-direction: column; }
        .page-left { background: linear-gradient(90deg, #fdf9f0 92%, #efe7d8 100%); }
        .page-right { background: linear-gradient(270deg, #fdf9f0 92%, #efe7d8 100%); }
        .spine { width: 3px; background: #d8cdb8; }
        .page h2.book-title { font-size: 30px; margin: auto 0; text-align: center; line-height: 1.25;
          font-family: Georgia, 'Times New Roman', serif; }
        .byline { text-align: center; color: #8a7d63; font-size: 14px; margin-top: 10px; }
        .story-text { font-family: Georgia, 'Times New Roman', serif; font-size: 18px; line-height: 1.7;
          white-space: pre-wrap; word-break: break-word; margin: auto 0; }
        .pagenum { margin-top: 14px; text-align: center; color: #b3a789; font-size: 12px; }
        .page-right img { max-width: 100%; max-height: 420px; object-fit: contain; margin: auto;
          border-radius: 8px; }
        .page-pic { position: relative; display: inline-block; line-height: 0; margin: auto; max-width: 100%; }
        .no-image { margin: auto; color: #b3a789; font-size: 14px; text-align: center; }
        .booknav { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; }
        .navbtn { padding: 10px 16px; font-size: 14px; font-weight: 700; color: #5a4632;
          background: rgba(90,70,50,.08); border: 1px solid rgba(90,70,50,.4);
          border-radius: 10px; cursor: pointer; }
        .navbtn:hover:not(:disabled) { background: rgba(90,70,50,.16); }
        .navbtn:disabled { opacity: .35; cursor: default; }
        .navlabel { color: #5a4632; font-size: 14px; font-weight: 600; }
        .status { color: #5a4632; }
        .status.blocked { color: #8a5a00; }
        .status.error { color: #8a1c1c; }
        /* Closed book: only the front cover shows, square like a single fold.
           The square is enforced with a padding-bottom box (not aspect-ratio /
           flex sizing), so it holds on mobile portrait layouts too. */
        .book.closed { max-width: 460px; margin: 0 auto; min-height: 0; }
        .book.closed .page-left, .book.closed .spine { display: none; }
        .book.closed .page-right { padding: 0; background: #fdf9f0; position: relative; min-height: 0; }
        .book.closed .page-right::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0;
          width: 14px; background: linear-gradient(90deg, rgba(90,70,50,.35), rgba(90,70,50,0)); z-index: 1; }
        .cover-square { position: relative; width: 100%; height: 0; padding-bottom: 100%; flex: none; }
        .cover-square img { position: absolute; inset: 0; width: 100%; height: 100%;
          max-height: none; object-fit: contain; border-radius: 0; margin: 0; }
        .cover-fallback { position: relative; width: 100%; height: 0; padding-bottom: 100%; flex: none; }
        .cover-fallback .book-title { position: absolute; inset: 0; display: grid;
          place-items: center; padding: 30px; text-align: center; margin: 0; }
        /* Title page ("written by" / "illustrated by") */
        .titlepage-heading { font-family: Georgia, 'Times New Roman', serif; font-style: italic;
          color: #8a7d63; font-size: 16px; text-align: center; margin: auto 0 10px; }
        .titlepage-names { font-family: Georgia, 'Times New Roman', serif; font-size: 20px;
          text-align: center; line-height: 1.8; margin: 0 0 auto; }
        .titlepage-form { margin: 0 0 auto; }
        .titlepage-form input { display: block; margin: 8px auto 0; max-width: 260px; text-align: center;
          background: transparent; border: 1px dashed #cbbfa4;
          font-family: Georgia, 'Times New Roman', serif; font-size: 17px; }
        .titlepage-form .linkbtn { display: block; margin: 8px auto 0; }
        .titlepage-form .cta { display: block; margin: 12px auto 0; padding: 8px 14px; font-size: 13px; }
        /* Save / publish */
        .bookactions { display: flex; gap: 12px; justify-content: center; margin-top: 14px; }
        .cta.publish { background: #7a5aa0; }
        .cta.publish:hover { background: #684b8a; }
        .cta.publish:disabled { background: #b3a3c9; }
        .cta.cancel { background: #8a8a8a; }
        .cta.cancel:hover { background: #737373; }
        .cta.cancel:disabled { background: #bdbdbd; }
        .pubnote { text-align: center; color: #5a4632; font-size: 13px; font-weight: 600; margin-top: 12px; }
        /* Repaint-the-picture controls under a page's image. The toggle pill
           is centered like every other button row; an opened form goes back
           to left-aligned text. */
        .regen { margin-top: 10px; text-align: center; }
        .regen form { text-align: left; flex-direction: column; gap: 8px; height: auto; }
        .regen input[type=text] { background: transparent; border: 1px dashed #cbbfa4; font-size: 14px; }
        .regen .cta { padding: 9px 14px; font-size: 14px; margin-top: 8px; }
        /* Read-aloud */
        .readrow { display: flex; gap: 10px; align-items: center; justify-content: center; margin-top: 10px; }
        .readbtn { font-size: 13px; font-weight: 700; padding: 6px 12px; border-radius: 999px;
          border: 1px solid #cbbfa4; background: #fdf9f0; color: #5a4632; cursor: pointer; }
        .readbtn:hover { background: #f2e9d6; }
        .readbtn.reading { background: #8a5a00; border-color: #8a5a00; color: #fff; }
        .w.said { background: #ffe9a8; border-radius: 4px; }
        /* On the closed cover all the buttons share one paper strip below the
           art; the rows inside keep the standard .readrow spacing, so button
           gaps match every other page. */
        .book.closed .page-right .cover-actions { padding: 2px 16px 14px; position: relative; z-index: 2; }
        /* Fairy dust */
        .page { position: relative; }
        .dust-overlay { position: absolute; inset: 0; pointer-events: none; overflow: hidden;
          z-index: 5; opacity: 1; transition: opacity .6s; }
        .dust-overlay.fading { opacity: 0; }
        .wand { position: absolute; font-size: 36px; z-index: 6; left: -12%; top: 12%;
          filter: drop-shadow(0 0 8px rgba(255,255,255,.95));
          animation: wandsweep 1.7s ease-in-out forwards; }
        @keyframes wandsweep {
          0%   { left: -12%; top: 10%; transform: rotate(-35deg); }
          30%  { left: 22%;  top: 30%; transform: rotate(10deg); }
          55%  { left: 52%;  top: 10%; transform: rotate(-15deg); }
          80%  { left: 78%;  top: 32%; transform: rotate(12deg); }
          100% { left: 100%; top: 16%; transform: rotate(-25deg); }
        }
        .wandtrail { position: absolute; left: 4%; right: 4%; top: 26%; height: 7px;
          border-radius: 999px; filter: blur(2px); opacity: 0; transform-origin: left center;
          background: linear-gradient(90deg,#e23b3b,#f39a12,#f7d21a,#3aa657,#2c6e8f,#7a5aa0);
          animation: trailgrow 1.7s ease-in-out forwards, trailfade 1.4s ease .9s forwards; }
        @keyframes trailgrow { from { transform: scaleX(0); opacity: .85; } to { transform: scaleX(1); opacity: .85; } }
        @keyframes trailfade { to { opacity: 0; } }
        .dust { position: absolute; font-size: 14px; opacity: 0;
          animation: twinkle var(--d, 1.6s) ease-in-out var(--dl, 0s) infinite;
          text-shadow: 0 0 6px currentColor; }
        @keyframes twinkle {
          0%   { opacity: 0; transform: scale(.3) rotate(0deg); }
          30%  { opacity: 1; transform: scale(1.2) rotate(25deg); }
          65%  { opacity: .75; transform: scale(.9) rotate(-10deg) translateY(3px); }
          100% { opacity: 0; transform: scale(.25) rotate(10deg) translateY(10px); }
        }
        .story-text.revealed, .page textarea.revealed { animation: dustreveal 1s ease; }
        @keyframes dustreveal {
          from { opacity: 0; text-shadow: 0 0 16px rgba(255,215,90,.95); }
          to   { opacity: 1; text-shadow: none; }
        }
        .sprinkle-note { font-size: 11.5px; color: #8a7d63; text-align: center;
          margin-top: 2px; font-style: italic; }
        .readbtn.sprinkle { background: linear-gradient(90deg,#fde8e8,#fdf3e0,#fdfae0,#e8f6ec,#e6f0f6,#efe8f6);
          border-color: #c9a9e0; }
        .readbtn.sprinkle:hover { filter: brightness(.97); }
        .readbtn.sprinkle:disabled { opacity: .55; cursor: progress; }
        .readbtn.suggest { align-self: flex-start; margin: 0 0 8px; background: #fdf6e0; border-color: #d9c37a; }
        .readbtn.suggest:disabled { opacity: .55; cursor: progress; }
        .readbtn.theend { background: #fdf0dc; border-color: #d9a37a; }
        .readbtn.theend:disabled { opacity: .55; cursor: progress; }
        /* Multi-row image-prompt box: tall enough to read a whole suggestion */
        .page textarea.prompt { flex: 0 0 auto; min-height: 108px; font-size: 14.5px;
          line-height: 1.5; font-family: inherit; background: transparent;
          border: 1px dashed #cbbfa4; }
        /* Fairy Godmother */
        .readbtn.godmother-btn { background: #f6e8fb; border-color: #c9a9e0; }
        .readbtn.godmother-btn:disabled { opacity: .55; cursor: progress; }
        .godmother { position: absolute; font-size: 34px; z-index: 6;
          filter: drop-shadow(0 0 8px rgba(255,214,110,.95));
          transition: left .55s ease-in-out, top .55s ease-in-out; }
        .gm-suggest { flex: 0 0 auto; margin-top: 10px; border: 1px solid #d9c37a;
          background: #fdf9f0; border-radius: 10px; padding: 10px 12px; }
        .gm-title { font-size: 12.5px; font-weight: 800; color: #8a5a00; }
        .gm-opt { display: block; width: 100%; text-align: left; margin-top: 7px;
          padding: 8px 11px; border: 1px solid #cbbfa4; border-radius: 8px; background: #fff;
          cursor: pointer; font-family: Georgia, 'Times New Roman', serif; font-size: 14.5px;
          line-height: 1.45; color: #3d2f1e; }
        .gm-opt:hover { background: #f6e8fb; border-color: #a06bc9; }
        /* Accepted sentence: rainbow sparkle text that solidifies into ink */
        .magic-overlay { position: relative; flex: 1; min-height: 220px;
          font-family: Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.6;
          white-space: pre-wrap; word-break: break-word; padding: 3px; }
        .magic-new { background: linear-gradient(90deg,#e23b3b,#f39a12,#d9b514,#3aa657,#2c6e8f,#7a5aa0,#e23b3b);
          background-size: 300% 100%; -webkit-background-clip: text; background-clip: text;
          color: transparent; animation: gmshimmer 1.5s linear infinite;
          filter: drop-shadow(0 0 6px rgba(255,214,110,.6)); }
        @keyframes gmshimmer { from { background-position: 0% 0; } to { background-position: 300% 0; } }
        .magic-done { color: inherit; background: none; filter: none;
          transition: color .5s ease; }
        .page input.revealed { animation: dustreveal 1s ease; }
        /* Background music (edit mode) */
        .readbtn.music-btn { background: #e6f2ec; border-color: #7ab89a; }
        /* When a page's music finishes, its Review button glows gold to draw
           the child back to it — especially after they've wandered to another
           page while it composed. */
        .readbtn.music-btn.music-review-shine {
          border-color: #e6a817; color: #7a4e00;
          animation: musicshine 1.4s ease-in-out infinite; }
        @keyframes musicshine {
          0%, 100% { box-shadow: 0 0 0 0 rgba(230,168,23,0); background: #eef7f1; }
          50% { box-shadow: 0 0 15px 4px rgba(230,168,23,.8); background: #fff2ce; } }
        @media (prefers-reduced-motion: reduce) {
          .readbtn.music-btn.music-review-shine { animation: none;
            box-shadow: 0 0 12px 3px rgba(230,168,23,.75); background: #fff2ce; } }
        .musicstack { display: flex; flex-direction: column; }
        .musicstack .readrow { margin-top: 8px; }
        .readbtn.remove-music { background: #fbecec; border-color: #d9938e; color: #8a1c1c; }
        /* The compose dialog floats in front of the book */
        .music-backdrop { position: fixed; inset: 0; background: rgba(30,22,10,.55);
          z-index: 60; display: flex; align-items: center; justify-content: center;
          padding: 20px; }
        .music-modal { background: #fdf9f0; border-radius: 14px; width: min(94vw, 540px);
          max-height: 84vh; overflow-y: auto; padding: 20px 22px;
          box-shadow: 0 24px 60px rgba(0,0,0,.45); }
        .music-modal h3 { margin: 0 0 12px; font-size: 18px; color: #5a4632; }
        .music-panel label { display: block; font-size: 13px; font-weight: 700; color: #6b5d43;
          margin-bottom: 6px; }
        .music-panel textarea { width: 100%; min-height: 76px; font-family: inherit; font-size: 14px;
          line-height: 1.45; border: 1px dashed #cbbfa4; background: transparent; border-radius: 8px;
          padding: 8px 10px; resize: vertical; }
        .music-working { display: flex; align-items: center; gap: 8px; margin-top: 10px;
          font-size: 14px; font-weight: 600; color: #2c6e8f; }
        .music-working .notes-anim { font-size: 20px; display: inline-block;
          animation: bob 1s ease-in-out infinite alternate; }
        /* While composing, the line stands where the music buttons were —
           centered like every other row on the page. */
        .musicstack .music-working { justify-content: center; font-size: 13px; }
        /* Narrator voice picker + per-page retakes */
        .readbtn.voice-btn { background: #efe9f7; border-color: #a58bc9; }
        .voicepick { max-height: 46vh; overflow-y: auto; }
        .voiceopt { display: flex; align-items: center; gap: 8px; padding: 7px 4px;
          font-size: 14.5px; cursor: pointer; border-radius: 8px; }
        .voiceopt:hover { background: #f3ecfb; }
        .voiceopt input { width: 16px; height: 16px; accent-color: #7a5aa0; }
        .voicegroup { font-size: 12px; font-weight: 800; color: #6b5d43;
          text-transform: uppercase; letter-spacing: .5px; margin: 12px 0 2px; }
        .voicehint { font-size: 13.5px; color: #6b5d43; margin-top: 10px; }
        /* "Getting the voices ready" dialog: the count of pages recorded so far. */
        .narr-progress { margin-top: 10px; text-align: center; font-size: 13px;
          font-weight: 700; color: #6b5d43; }
        @keyframes bob { from { transform: translateY(2px) rotate(-8deg); } to { transform: translateY(-4px) rotate(8deg); } }
        .music-cand { border: 1px solid #e0d6bd; background: #fdf9f0; border-radius: 10px;
          padding: 10px 12px; margin-top: 8px; display: flex; flex-direction: column; }
        .music-cand .mc-title { font-weight: 800; font-size: 13px; color: #8a5a00; }
        /* Custom player: a bold blue play/pause button (white symbol, matching
           the "Pick this song" button) so the control stands out and children
           don't miss it. Native <audio> controls can't be recolored reliably. */
        .mc-player { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
        .mc-play { flex: 0 0 auto; width: 42px; height: 42px; border: none; border-radius: 50%;
          background: #2c6e8f; cursor: pointer; padding: 0; display: flex;
          align-items: center; justify-content: center; }
        .mc-play:hover { background: #245d79; }
        .mc-play:disabled { background: #9bb6c2; cursor: progress; }
        .mc-play .ic-play { width: 0; height: 0; border-style: solid;
          border-width: 8px 0 8px 14px; border-color: transparent transparent transparent #fff;
          margin-left: 3px; }
        .mc-play .ic-pause { display: none; align-items: center; gap: 5px; }
        .mc-play .ic-pause::before, .mc-play .ic-pause::after {
          content: ''; width: 5px; height: 16px; background: #fff; border-radius: 1px; }
        .mc-play.playing .ic-play { display: none; }
        .mc-play.playing .ic-pause { display: flex; }
        .mc-track { flex: 1; height: 7px; background: #e0d6bd; border-radius: 4px;
          position: relative; cursor: pointer; }
        .mc-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0;
          background: #2c6e8f; border-radius: 4px; }
        .mc-time { flex: 0 0 auto; min-width: 34px; text-align: right; font-size: 12px;
          color: #6b5d43; font-variant-numeric: tabular-nums; }
        /* "Pick this song" sits on the RIGHT, clear of the play button on the
           left, so it's not fumbled while previewing a take. */
        .music-cand .cta { align-self: flex-end; padding: 8px 12px; font-size: 13px; margin-top: 8px; }
        .music-actions { display: flex; gap: 12px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
        .music-actions .cta { padding: 9px 14px; font-size: 14px; }
        /* Engine checkboxes in the compose dialog (A/B the music makers). */
        .music-engines { display: flex; gap: 14px; flex-wrap: wrap; margin: 2px 0 4px;
          font-size: 13.5px; color: #3d2f1e; }
        .music-engine { display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
          font-weight: 600; }
        .music-engine input { width: 16px; height: 16px; accent-color: #2c6e8f; cursor: pointer; }
        .music-engine:has(input:disabled) { opacity: .5; cursor: not-allowed; }
        /* Page tools (edit mode) */
        .pagetools { display: flex; flex-wrap: wrap; gap: 4px 10px; justify-content: center;
          margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e0d6bd; }
        .pagetools .linkbtn { font-size: 12px; }
        .pagetools .linkbtn:disabled { opacity: .35; cursor: default; text-decoration: none; }
        .pagetools .danger { color: #8a1c1c; }
        /* The End page */
        .the-end-art { margin: auto; font-size: 56px; text-align: center; letter-spacing: 8px; }
        /* Add-a-page form lives ON the book pages */
        .page form { display: flex; flex-direction: column; height: 100%; }
        .page label { font-size: 13px; font-weight: 700; color: #6b5d43; margin-bottom: 6px; }
        .page textarea { flex: 1; min-height: 220px; background: transparent; border: 1px dashed #cbbfa4;
          font-family: Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.6; }
        .page input[type=text] { background: transparent; border: 1px dashed #cbbfa4; }
        @media (max-width: 820px) {
          .book { flex-direction: column; }
          .spine { width: auto; height: 3px; }
          /* Stacked pages keep a square-ish page shape (like .cover-square),
             while still growing when a form needs more room. */
          .page { min-height: min(92vw, 440px); }
          /* Comfortable tap targets for small fingers. */
          .pagetools .linkbtn { font-size: 13px; padding: 8px 6px; }
          /* The closed cover's only height source is the .cover-square
             padding-bottom box. In the column layout, flex: 1 1 0 makes the
             page's HEIGHT basis zero and mobile Safari collapses it to
             nothing (clipped by the book's overflow: hidden) — size the
             cover page by its content instead. */
          .book.closed .page-right { flex: none; }
        }
      </style>`,
    }) + `<script>${CLIENT_HELPERS_JS}${AUTHORS_JS}${readerClientJs()}</script>`,
  );
});

function readerClientJs(): string {
  return `
  // Per-engine display names; books without a stored choice show the default.
  const ILLUSTRATORS = ${JSON.stringify(ENGINE_NAMES)};
  const DEFAULT_ILLUSTRATOR = ${JSON.stringify(illustratorName())};
  const bookId = document.getElementById('book-root').dataset.bookId;
  const bookEl = document.getElementById('book');
  const left = document.getElementById('page-left');
  const right = document.getElementById('page-right');
  const prev = document.getElementById('prev');
  const next = document.getElementById('next');
  const navlabel = document.getElementById('navlabel');
  const statusEl = document.getElementById('status');

  let book = null;
  let mine = false; // signed-in account owns this book (server-computed)
  // Experimental features (background music) for THIS login session. Off by
  // default: no music buttons render and attached music stays silent, so the
  // feature is invisible unless the session opted in at login.
  let expFeatures = false;
  // Spread 0 = cover; spreads 1..N = story pages; spread N+1 = "add a page"
  // (the add spread disappears once the book has a "The End" page).
  let spread = 0;

  // Draft of the in-progress "new page" — survives flipping back through the
  // book (kept in memory AND localStorage, so even a refresh keeps it).
  const draftKey = 'csai-draft-' + bookId;
  let draft = { text: '', imagePrompt: '' };
  try { Object.assign(draft, JSON.parse(localStorage.getItem(draftKey) || '{}')); } catch {}
  function saveDraft() { try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch {} }
  function clearDraft() {
    draft = { text: '', imagePrompt: '' };
    try { localStorage.removeItem(draftKey); } catch {}
  }

  function finished() {
    return book.pages.length > 0 && !!book.pages[book.pages.length - 1].isEnd;
  }
  // A finished book opens as a pure READER (no edit controls); the owner can
  // reopen it with the "Edit this book" button. An unfinished draft is still
  // mid-creation, so it stays editable straight away. Published books never are.
  let editMode = false;
  // True when editing was entered via "Edit this book" (a server-side snapshot
  // exists) — only then can "Cancel" restore the book to how it was.
  let editSession = false;
  function editable() { return book.status !== 'published' && editMode; }
  // When set, the "new page" form INSERTS at this page index instead of
  // appending (reached via "Insert new page before/after" in the page tools).
  // insertReturn remembers the spread to go back to if the insert is cancelled.
  let insertAt = null;
  let insertReturn = 2;

  // Spread 0 = closed front cover; 1 = title page; 2..n+1 = story pages;
  // n+2 = "add a page" (drafts that aren't finished — or any draft while a
  // mid-book insert is underway, since inserting works even in finished books).
  function lastSpread() {
    return book.pages.length + 1 + (editable() && (!finished() || insertAt !== null) ? 1 : 0);
  }

  function setStatus(text, cls) {
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
    statusEl.innerHTML = text;
  }

  function imgEl(image, alt) {
    const img = document.createElement('img');
    img.src = 'data:' + image.mimeType + ';base64,' + image.dataBase64;
    img.alt = alt;
    return img;
  }

  function noImage(text) {
    const d = document.createElement('div');
    d.className = 'no-image';
    d.textContent = text;
    return d;
  }

  // ===== Read aloud ==========================================================
  // Each page gets a "Read to me" button. High-quality narration comes from the
  // server (generated once through the moderated pipeline, then cached on the
  // page); when that isn't set up (501) we fall back to the browser's built-in
  // voice, which also gives word-by-word highlighting. The cover offers "Read
  // this book to me", which reads on and flips the pages by itself.
  let reading = null;      // { btn, btnLabel, audio?, utter?, restore? }
  let readAllMode = false; // auto-advance through the whole book
  let advancing = false;   // suppress stopReading() during an auto page flip
  let curReadBtn = null;   // the current spread's read button (for read-all)
  let curReadStart = null; // starts reading the current spread (set in render)
  // Read-all pacing without background music: a beat on the finished page
  // (soak in the art), then the flip, then a smaller beat before the next
  // page's words begin.
  const PRE_FLIP_PAUSE_MS = 2000;
  const POST_FLIP_PAUSE_MS = 1000;
  let pageTurnTimer = null;
  function clearPageTurnPause() {
    if (pageTurnTimer) { clearTimeout(pageTurnTimer); pageTurnTimer = null; }
  }
  // After a page's narration finishes in read-all: experimental sessions pace
  // page turns with the music fade; everyone else gets the quiet 2s+1s beats.
  function scheduleReadAllAdvance(fade) {
    if (expFeatures) {
      fade.wait(() => { if (readAllMode) advanceReadAll(); });
      return;
    }
    fade.wait(() => {
      if (!readAllMode) return;
      clearPageTurnPause();
      pageTurnTimer = setTimeout(() => {
        pageTurnTimer = null;
        if (readAllMode) advanceReadAll(POST_FLIP_PAUSE_MS);
      }, PRE_FLIP_PAUSE_MS);
    });
  }

  function stopReading() {
    readAllMode = false;
    clearPageTurnPause(); // waiting out the between-pages beat? cancel it
    clearNarrationDelay(); // vocals scheduled but not started yet? cancel them
    haltPlayback();
    stopAllBg(); // manual stop silences the music (and any fade) immediately
  }
  function haltPlayback() {
    if (!reading) return;
    const r = reading;
    reading = null; // first, so cancel-triggered onend callbacks see it
    if (r.audio) { try { r.audio.pause(); } catch {} }
    if (r.utter && window.speechSynthesis) { try { speechSynthesis.cancel(); } catch {} }
    if (r.restore) r.restore();
    if (r.btn) { r.btn.classList.remove('reading'); r.btn.textContent = r.btnLabel; }
  }

  // Per-page background music: plays softly (looped) UNDER the narration.
  // When narration ends NATURALLY the music lingers ~5s, fading to silence
  // (read-all waits for the fade before flipping). Manual stops and page
  // flips silence everything immediately.
  const BG_VOLUME = 0.22; // the words stay on top
  const BG_FADE_MS = 3500;      // fade out over 0–3.5s after the vocals end
  const BG_LEAD_IN_MS = 1000;   // music starts 1s before the vocals
  let bgMusic = null;   // playing under the current narration
  let fadingBg = null;  // { audio, timer } — post-narration fade in progress
  let narrationDelay = null; // pending lead-in timer before the vocals start
  function clearNarrationDelay() {
    if (narrationDelay) { clearTimeout(narrationDelay); narrationDelay = null; }
  }

  function startBgMusic(url) {
    stopAllBg();
    if (!url) return;
    bgMusic = new Audio(url);
    bgMusic.loop = true;
    bgMusic.volume = BG_VOLUME;
    bgMusic.play().catch(() => {});
  }
  function stopAllBg() {
    if (fadingBg) {
      clearInterval(fadingBg.timer);
      try { fadingBg.audio.pause(); } catch {}
      fadingBg = null;
    }
    if (bgMusic) {
      try { bgMusic.pause(); } catch {}
      bgMusic = null;
    }
  }

  /**
   * Called when a page's narration finishes on its own: the music plays on,
   * ramping down to silence over 0–BG_FADE_MS. Returns a handle whose
   * wait(cb) fires once the fade is over — immediately when there is nothing
   * to fade — so read-all can hold the page flip for it.
   */
  function beginBgFade() {
    if (!bgMusic) return { wait(cb) { if (cb) cb(); } };
    const audio = bgMusic;
    bgMusic = null; // out of startBgMusic's way; the fade owns it now
    const startVol = audio.volume;
    const steps = 25;
    let step = 0;
    let finished = false;
    const waiting = [];
    const timer = setInterval(() => {
      step++;
      if (step >= steps) {
        clearInterval(timer);
        try { audio.pause(); } catch {}
        if (fadingBg && fadingBg.audio === audio) fadingBg = null;
        finished = true;
        while (waiting.length) waiting.shift()();
      } else {
        audio.volume = Math.max(0, startVol * (1 - step / steps));
      }
    }, BG_FADE_MS / steps);
    fadingBg = { audio: audio, timer: timer };
    return { wait(cb) { if (!cb) return; if (finished) cb(); else waiting.push(cb); } };
  }

  function pickVoice() {
    if (!window.speechSynthesis) return null;
    const vs = speechSynthesis.getVoices();
    let best = null;
    for (const v of vs) {
      if (!/^en/i.test(v.lang)) continue;
      if (/Google US English|Samantha|Zira|Aria/i.test(v.name)) return v;
      if (!best) best = v;
    }
    return best;
  }
  if (window.speechSynthesis) speechSynthesis.getVoices(); // warm the voice list

  // Browser voice with word-by-word highlighting inside el (when given).
  function speakText(text, el, onDone) {
    if (!window.speechSynthesis) {
      setStatus('This device has no reading voice — sorry!', 'error');
      if (onDone) onDone();
      return null;
    }
    let restore = null;
    let spans = null;
    let offsets = null;
    if (el) {
      const orig = el.textContent;
      const parts = text.split(/(\\s+)/);
      el.textContent = '';
      spans = []; offsets = [];
      let pos = 0;
      for (const part of parts) {
        if (part === '') { continue; }
        if (/^\\s+$/.test(part)) {
          el.appendChild(document.createTextNode(part));
        } else {
          const s = document.createElement('span');
          s.className = 'w';
          s.textContent = part;
          el.appendChild(s);
          spans.push(s);
          offsets.push(pos);
        }
        pos += part.length;
      }
      restore = () => { el.textContent = orig; };
    }
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 0.95;
    u.pitch = 1.05;
    u.onboundary = (e) => {
      if (!spans) return;
      let idx = -1;
      for (let i = 0; i < offsets.length; i++) { if (offsets[i] <= e.charIndex) idx = i; else break; }
      for (let j = 0; j < spans.length; j++) spans[j].classList.toggle('said', j === idx);
    };
    const done = () => { if (restore) restore(); if (onDone) onDone(); };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    return { utter: u, restore: restore };
  }

  function playAudio(narration, onDone) {
    const audio = new Audio('data:' + narration.mimeType + ';base64,' + narration.dataBase64);
    audio.onended = () => { if (onDone) onDone(); };
    audio.onerror = () => { if (onDone) onDone(); };
    audio.play().catch(() => { if (onDone) onDone(); });
    return audio;
  }

  // Read one page: cached audio -> server narration -> browser voice.
  async function narratePage(pageIndex, page, el, btn, btnLabel, onDone) {
    if (page.narration) {
      reading = { btn: btn, btnLabel: btnLabel, audio: playAudio(page.narration, onDone) };
      return;
    }
    try {
      const res = await fetch('/v1/books/' + bookId + '/pages/' + pageIndex + '/narration', {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        page.narration = data.narration; // cache client-side too
        reading = { btn: btn, btnLabel: btnLabel, audio: playAudio(data.narration, onDone) };
        return;
      }
    } catch {}
    // No narrator service — the browser reads it (with word highlighting).
    const r = speakText(page.text, el, onDone);
    if (r) reading = { btn: btn, btnLabel: btnLabel, utter: r.utter, restore: r.restore };
  }

  /** The "🔊 Read to me" row for a page. el = the text element to highlight. */
  function readRow(pageIndex, page, el) {
    const row = document.createElement('div');
    row.className = 'readrow';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'readbtn';
    const label = '🔊 Read to me';
    btn.textContent = label;
    row.appendChild(btn);
    curReadBtn = btn;
    curReadStart = () => start();
    function start() {
      clearNarrationDelay();
      haltPlayback();
      btn.classList.add('reading');
      btn.textContent = '⏹ Stop reading';
      const musicUrl = expFeatures && page.music
        ? '/v1/books/' + bookId + '/pages/' + pageIndex + '/music-audio'
        : null;
      startBgMusic(musicUrl); // this page's background music (if any)
      const speak = () => narratePage(pageIndex, page, el, btn, label, () => {
        // Narration finished on its own: the music fades out over 3.5s. In
        // read-all, the page flip waits for the fade to finish.
        const fade = beginBgFade();
        if (reading && reading.btn === btn) haltPlayback();
        if (readAllMode) scheduleReadAllAdvance(fade);
      });
      if (musicUrl) {
        // Let the music set the scene for a second before the vocals begin.
        narrationDelay = setTimeout(() => { narrationDelay = null; speak(); }, BG_LEAD_IN_MS);
      } else {
        speak();
      }
    }
    btn.addEventListener('click', () => {
      // Stop works even during the 1s music lead-in (vocals not started yet).
      if (narrationDelay || (reading && reading.btn === btn)) {
        stopReading();
        btn.classList.remove('reading');
        btn.textContent = label;
        return;
      }
      readAllMode = false; // a single-page read cancels any read-all run
      start();
    });
    return row;
  }

  // After a page finishes in read-all: flip forward and read the next spread.
  // postDelayMs (non-experimental pacing) holds the fresh page quietly for a
  // beat before its words begin; skipped spreads carry the delay forward so
  // the pause lands on the page that actually gets read.
  function advanceReadAll(postDelayMs) {
    if (!readAllMode || !book) return;
    const lastPageSpread = book.pages.length + 1;
    if (spread >= lastPageSpread) { readAllMode = false; return; }
    advancing = true;
    spread++;
    render();
    advancing = false;
    if (spread === 1) { advanceReadAll(postDelayMs); return; } // skip the title page
    if (!curReadStart) { advanceReadAll(postDelayMs); return; } // nothing readable here — keep going
    if (postDelayMs) {
      clearPageTurnPause();
      pageTurnTimer = setTimeout(() => {
        pageTurnTimer = null;
        if (readAllMode && curReadStart) curReadStart();
      }, postDelayMs);
      return;
    }
    curReadStart();
  }

  /** Cover button: read the whole book, flipping pages automatically. */
  function readAllControls() {
    const row = document.createElement('div');
    row.className = 'readrow';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'readbtn';
    const label = '🔊 Read this book to me';
    btn.textContent = label;
    row.appendChild(btn);
    btn.addEventListener('click', async () => {
      if (reading && reading.btn === btn) { stopReading(); return; }
      haltPlayback();
      stopAllBg(); // a fresh read-all starts silent (no leftover fade)
      if (!book.pages.length) { setStatus('This book has no pages to read yet!', 'blocked'); return; }
      readAllMode = true;
      btn.classList.add('reading');
      btn.textContent = '⏹ Stop reading';
      // The cover's background music (if any) plays under the intro, starting
      // 1s before the vocals, and fades out before the first page turn — same
      // rules as story pages.
      const musicStartedAt = expFeatures && book.coverMusic ? Date.now() : 0;
      startBgMusic(expFeatures && book.coverMusic ? '/v1/books/' + bookId + '/cover/music-audio' : null);
      const afterLeadIn = (cb) => {
        if (!musicStartedAt) { cb(); return; }
        const wait = Math.max(0, BG_LEAD_IN_MS - (Date.now() - musicStartedAt));
        if (!wait) { cb(); return; }
        narrationDelay = setTimeout(() => {
          narrationDelay = null;
          if (readAllMode) cb();
        }, wait);
      };
      const onDone = () => {
        const fade = beginBgFade();
        if (reading && reading.btn === btn) haltPlayback();
        if (readAllMode) scheduleReadAllAdvance(fade);
      };
      // The narrator voice reads the cover intro too: cached audio -> server
      // narration -> browser voice only as the last resort.
      if (book.introNarration) {
        afterLeadIn(() => {
          reading = { btn: btn, btnLabel: label, audio: playAudio(book.introNarration, onDone) };
        });
        return;
      }
      try {
        const res = await fetch('/v1/books/' + bookId + '/intro-narration', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          book.introNarration = data.narration; // cache client-side too
          if (!readAllMode) return; // stopped while we were fetching
          afterLeadIn(() => {
            reading = { btn: btn, btnLabel: label, audio: playAudio(data.narration, onDone) };
          });
          return;
        }
      } catch {}
      if (!readAllMode) return; // stopped while we were fetching
      afterLeadIn(() => {
        const by = authorsLine(book.authors);
        const intro = book.title + (by ? '. Written by ' + by + '.' : '.');
        const r = speakText(intro, null, onDone);
        if (r) reading = { btn: btn, btnLabel: label, utter: r.utter, restore: r.restore };
        else readAllMode = false;
      });
    });
    return row;
  }

  // ===== Fairy dust ==========================================================
  // A rainbow wand sweeps the writing page, sparkly dust twinkles while the AI
  // polishes the words (grammar + flow, kid-readable), the dust vanishes and
  // the new text shimmers in. The child's ORIGINAL words are kept on the page
  // (sourceText) so sprinkling again re-polishes the original — until they
  // hand-edit the words, which becomes the new original.
  let sprinkling = false;

  const DUST_COLORS = ['#e23b3b', '#f39a12', '#d9b514', '#3aa657', '#2c6e8f', '#7a5aa0'];
  const DUST_CHARS = ['✦', '✧', '✨', '⭐', '✶'];

  function startDust(container, opts) {
    const ov = document.createElement('div');
    ov.className = 'dust-overlay';
    if (!opts || opts.wand !== false) {
      const trail = document.createElement('div');
      trail.className = 'wandtrail';
      ov.appendChild(trail);
      const wand = document.createElement('span');
      wand.className = 'wand';
      wand.textContent = '🪄';
      ov.appendChild(wand);
    }
    container.appendChild(ov);

    function spawn(count) {
      for (let i = 0; i < count; i++) {
        const s = document.createElement('span');
        s.className = 'dust';
        s.textContent = DUST_CHARS[Math.floor(Math.random() * DUST_CHARS.length)];
        s.style.left = (3 + Math.random() * 92) + '%';
        s.style.top = (4 + Math.random() * 84) + '%';
        s.style.color = DUST_COLORS[Math.floor(Math.random() * DUST_COLORS.length)];
        s.style.setProperty('--d', (1.1 + Math.random() * 1.2).toFixed(2) + 's');
        s.style.setProperty('--dl', (Math.random() * 0.8).toFixed(2) + 's');
        ov.appendChild(s);
        setTimeout(() => s.remove(), 3200);
      }
    }
    spawn(28);
    // Keep the dust twinkling while the fairies work (i.e. while we wait).
    const iv = setInterval(() => spawn(9), 650);

    return {
      finish(cb) {
        clearInterval(iv);
        ov.classList.add('fading');
        setTimeout(() => { ov.remove(); if (cb) cb(); }, 650);
      },
    };
  }

  // Sprinkle fairy dust on an open words editor (new page OR edit-text). The
  // background-state rules live on st: the first sprinkle saves the child's
  // words (st.setBackground), re-sprinkles polish those, and typing clears the
  // background (the editor wires that on input). Nothing persists until the
  // caller's own save/paint action.
  async function sprinkleEditor(btn, ta, st, editIndex) {
    const source = (st.getBackground() || ta.value).trim();
    if (!source) { setStatus('Write your story words first — then sprinkle! ✍️', 'blocked'); return; }
    if (sprinkling) return;
    sprinkling = true;
    stopReading();
    btn.disabled = true;
    const dust = startDust(left);
    setStatus('🪄 Sprinkling fairy dust on your words…');
    const started = Date.now();

    function settle(apply) {
      // Let the wand finish its sweep before the dust can vanish.
      const wait = Math.max(0, 1900 - (Date.now() - started));
      setTimeout(() => { dust.finish(apply); sprinkling = false; btn.disabled = false; }, wait);
    }

    try {
      const body = { text: source };
      if (editIndex !== undefined) body.editIndex = editIndex;
      const res = await fetch('/v1/books/' + bookId + '/sprinkle-draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        settle(() => {
          if (!st.getBackground()) st.setBackground(source);
          ta.value = data.result.text;
          st.onTextSet(ta.value);
          ta.classList.add('revealed');
          setTimeout(() => ta.classList.remove('revealed'), 1100);
          setStatus('✨ Ta-da! Sprinkle again for a different fix — or keep typing to make it yours.');
        });
      } else {
        settle(() => {
          const f = friendlyError(res, data);
          setStatus(f.text, f.cls);
        });
      }
    } catch {
      settle(() => setStatus('Could not reach the server. Check your connection and try again.', 'error'));
    }
  }

  /**
   * The shared left-page words editor — used by BOTH the new-page form and
   * "Edit text" on a saved page. A label, the story textarea, and the helper
   * row (🪄 Sprinkle fairy dust + 🧚 Ask Fairy Godmother). st carries the
   * fairy-dust background state (the draft for a new page; ephemeral for an
   * edit). Pass editIndex when editing a saved page (context excludes it) or
   * insertAt for a new page.
   */
  function buildWordsEditor(opts) {
    const st = opts.st;
    const form = document.createElement('form');
    const label = document.createElement('label');
    label.textContent = opts.label;
    form.appendChild(label);
    const ta = document.createElement('textarea');
    ta.maxLength = 2000;
    ta.required = true;
    ta.value = opts.initialText || '';
    if (opts.placeholder) ta.placeholder = opts.placeholder;
    ta.addEventListener('input', () => {
      // Typing makes the typed words the new fairy-dust background state.
      st.clearBackground();
      st.onTextSet(ta.value);
    });
    form.appendChild(ta);

    const row = document.createElement('div');
    row.className = 'readrow';
    const dustBtn = document.createElement('button');
    dustBtn.type = 'button';
    dustBtn.className = 'readbtn sprinkle';
    dustBtn.textContent = '🪄 Sprinkle fairy dust';
    dustBtn.title = 'Magically fix the grammar and make the words flow';
    dustBtn.addEventListener('click', () => sprinkleEditor(dustBtn, ta, st, opts.editIndex));
    row.appendChild(dustBtn);
    const gmBtn = document.createElement('button');
    gmBtn.type = 'button';
    gmBtn.className = 'readbtn godmother-btn';
    gmBtn.textContent = '🧚 Ask Fairy Godmother';
    gmBtn.title = 'She fixes your words and suggests what could happen next';
    gmBtn.addEventListener('click', () =>
      askGodmother(gmBtn, ta,
        opts.editIndex !== undefined ? { editIndex: opts.editIndex } : { insertAt: opts.insertAt },
        left,
        {
          onPolished: (prev, polished) => {
            if (!st.getBackground()) st.setBackground(prev);
            st.onTextSet(polished);
          },
          onChanged: (full) => {
            st.clearBackground(); // accepted words become the new background
            st.onTextSet(full);
          },
        }));
    row.appendChild(gmBtn);
    form.appendChild(row);

    return { form: form, ta: ta, row: row };
  }

  // ===== Fairy Godmother =====================================================
  // She flies out of her button, sprinkles dust (polishing whatever the child
  // has written), then offers 3 sentences the story could continue with. One
  // click accepts a sentence (it solidifies from rainbow sparkles into ink);
  // cancel rejects all three. She can always be asked again.

  function flyGodmother(btn, container) {
    const c = container.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const fairy = document.createElement('span');
    fairy.className = 'godmother';
    fairy.textContent = '🧚';
    fairy.style.left = (b.left - c.left + b.width / 2 - 17) + 'px';
    fairy.style.top = (b.top - c.top - 12) + 'px';
    container.appendChild(fairy);
    const W = Math.max(c.width, 300);
    const spots = [[W * 0.15, 46], [W * 0.6, 100], [W * 0.3, 180], [W * 0.75, 70]];
    let k = 0;
    const hop = () => {
      fairy.style.left = spots[k % spots.length][0] + 'px';
      fairy.style.top = spots[k % spots.length][1] + 'px';
      k++;
    };
    setTimeout(hop, 30); // first hop right away
    const iv = setInterval(hop, 620);
    return { remove() { clearInterval(iv); fairy.remove(); } };
  }

  /**
   * Ask the Fairy Godmother. ta = the textarea being written; position is
   * either {editIndex} (editing a saved page) or {insertAt} (new page).
   * onPolished(prev, text) / onChanged(fullText) let the new-page form keep
   * its draft (and fairy-dust background state) in sync.
   */
  async function askGodmother(btn, ta, position, container, hooks) {
    if (sprinkling) return;
    sprinkling = true;
    stopReading();
    btn.disabled = true;
    const prev = ta.value.trim();
    const dust = startDust(container, { wand: false });
    const fairy = flyGodmother(btn, container);
    setStatus('🧚 The Fairy Godmother is on her way…');
    const started = Date.now();

    function settle(apply) {
      const wait = Math.max(0, 2100 - (Date.now() - started));
      setTimeout(() => {
        fairy.remove();
        dust.finish(apply);
        sprinkling = false;
        btn.disabled = false;
      }, wait);
    }

    try {
      const body = { text: prev };
      if (position.editIndex !== undefined) body.editIndex = position.editIndex;
      else body.insertAt = position.insertAt;
      const res = await fetch('/v1/books/' + bookId + '/godmother', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        settle(() => {
          const r = data.result;
          if (prev && r.text) {
            ta.value = r.text;
            if (hooks && hooks.onPolished) hooks.onPolished(prev, r.text);
            ta.classList.add('revealed');
            setTimeout(() => ta.classList.remove('revealed'), 1100);
          }
          showGmSuggestions(ta, r.suggestions || [], hooks);
          setStatus('🧚 Pick a sentence you like — or say “no thanks”!');
        });
      } else {
        settle(() => {
          const f = friendlyError(res, data);
          setStatus(f.text, f.cls);
        });
      }
    } catch {
      settle(() => setStatus('Could not reach the server. Check your connection and try again.', 'error'));
    }
  }

  function showGmSuggestions(ta, suggestions, hooks) {
    const old = document.getElementById('gm-suggest');
    if (old) old.remove();
    if (!suggestions.length) { setStatus('🧚 She is out of ideas right now — try again!', 'blocked'); return; }
    const panel = document.createElement('div');
    panel.id = 'gm-suggest';
    panel.className = 'gm-suggest';
    const title = document.createElement('div');
    title.className = 'gm-title';
    title.textContent = '🧚 How could the story keep going?';
    panel.appendChild(title);
    for (const s of suggestions) {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'gm-opt';
      opt.textContent = s;
      opt.addEventListener('click', () => {
        panel.remove();
        acceptSentence(ta, s, hooks);
      });
      panel.appendChild(opt);
    }
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'linkbtn gm-cancel';
    no.textContent = '✕ No thanks';
    no.addEventListener('click', () => { panel.remove(); setStatus(''); });
    panel.appendChild(no);
    ta.parentNode.insertBefore(panel, ta.nextSibling);
  }

  function acceptSentence(ta, sentence, hooks) {
    const existing = ta.value.replace(/\s+$/, '');
    const sep = existing ? ' ' : '';
    const full = existing + sep + sentence;
    ta.value = full;
    if (hooks && hooks.onChanged) hooks.onChanged(full);
    // The accepted sentence fades in as rainbow sparkle-text, then solidifies.
    const ov = document.createElement('div');
    ov.className = 'magic-overlay';
    ov.appendChild(document.createTextNode(existing + sep));
    const span = document.createElement('span');
    span.className = 'magic-new';
    span.textContent = sentence;
    ov.appendChild(span);
    for (let i = 0; i < 10; i++) {
      const d = document.createElement('span');
      d.className = 'dust';
      d.textContent = DUST_CHARS[Math.floor(Math.random() * DUST_CHARS.length)];
      d.style.left = (10 + Math.random() * 80) + '%';
      d.style.top = (10 + Math.random() * 80) + '%';
      d.style.color = DUST_COLORS[Math.floor(Math.random() * DUST_COLORS.length)];
      d.style.setProperty('--d', (1 + Math.random()).toFixed(2) + 's');
      d.style.setProperty('--dl', (Math.random() * 0.5).toFixed(2) + 's');
      ov.appendChild(d);
    }
    ta.style.display = 'none';
    ta.parentNode.insertBefore(ov, ta);
    setTimeout(() => { span.className = 'magic-done'; }, 1500);
    setTimeout(() => { ov.remove(); ta.style.display = ''; ta.focus(); }, 2200);
    setStatus('✨ Lovely choice! Keep writing — or ask her again.');
  }


  // Every page's action buttons are placed through this one cluster, so
  // vertical spacing between rows comes from the same shared rules on every
  // page (cover included). Falsy rows are skipped.
  function actionCluster(rows, extraClass) {
    const box = document.createElement('div');
    box.className = 'actions' + (extraClass ? ' ' + extraClass : '');
    for (const r of rows) if (r) box.appendChild(r);
    return box;
  }

  function render() {
    if (!advancing) stopReading();
    curReadBtn = null;
    curReadStart = null;
    const n = book.pages.length;
    left.innerHTML = '';
    right.innerHTML = '';
    bookEl.classList.toggle('closed', spread === 0);
    prev.disabled = spread === 0;
    next.disabled = spread === lastSpread();

    if (spread === 0) {
      // Closed book: only the front cover shows. The title words are painted
      // into the cover artwork itself.
      navlabel.textContent = 'Front cover';
      if (book.cover) {
        const sq = document.createElement('div');
        sq.className = 'cover-square';
        sq.appendChild(imgEl(book.cover, book.title));
        right.appendChild(sq);
      } else {
        const fb = document.createElement('div');
        fb.className = 'cover-fallback';
        const h = document.createElement('h2');
        h.className = 'book-title';
        h.textContent = book.title;
        fb.appendChild(h);
        right.appendChild(fb);
      }
      right.appendChild(actionCluster([
        readAllControls(),
        // Whole-book narrator picker: above the music buttons, creator only.
        mine && book.status !== 'published' ? narratorVoiceControls() : null,
        editable() ? coverRegenControls() : null,
        expFeatures && editable() ? musicControls('cover', null) : null,
      ], 'cover-actions'));
    } else if (spread === 1) {
      renderTitlePage();
    } else if (spread <= n + 1) {
      const p = book.pages[spread - 2];
      if (p.isEnd) {
        navlabel.textContent = 'The End';
        const h = document.createElement('h2');
        h.className = 'book-title';
        h.textContent = p.text;
        left.appendChild(h);
        const art = document.createElement('div');
        art.className = 'the-end-art';
        art.textContent = '✨🎉✨';
        right.appendChild(art);
        left.appendChild(actionCluster([
          readRow(spread - 2, p, h),
          editable() ? endPageControls() : null,
        ]));
        return;
      }
      navlabel.textContent = 'Page ' + (spread - 1) + ' of ' + n;
      const t = document.createElement('div');
      t.className = 'story-text';
      t.textContent = p.text;
      left.appendChild(t);
      const num = document.createElement('div');
      num.className = 'pagenum';
      num.textContent = String(spread - 1);
      left.appendChild(num);
      left.appendChild(actionCluster([
        readRow(spread - 2, p, t),
        editable() ? wordsEditControls(spread - 2, p, t) : null,
        // Redo this page's read-aloud — always ABOVE the music buttons (which
        // only exist for experimental sessions; otherwise this takes their spot).
        editable() && p.text && !p.isEnd ? narrationControls(spread - 2) : null,
        // Background music, once the page has words and picture.
        expFeatures && editable() && p.text && p.image ? musicControls('page', spread - 2) : null,
        editable() ? pageToolsControls(spread - 2) : null,
      ]));
      if (p.image) {
        const picWrap = document.createElement('div');
        picWrap.className = 'page-pic';
        const ai = imgEl(p.image, p.imagePrompt);
        ai.className = 'ai-pic';
        picWrap.appendChild(ai);
        right.appendChild(picWrap);
      } else {
        right.appendChild(noImage('No picture on this page'));
      }
      if (editable()) right.appendChild(regenControls(spread - 2, p));
    } else {
      renderAddPage();
    }
  }

  // Title page: "written by" (editable while a draft) / "illustrated by".
  function renderTitlePage() {
    navlabel.textContent = 'Title page';
    const wh = document.createElement('div');
    wh.className = 'titlepage-heading';
    wh.textContent = 'written by';
    left.appendChild(wh);

    if (editable()) {
      const form = document.createElement('form');
      form.className = 'titlepage-form';
      const inputs = [];
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'linkbtn';
      addBtn.textContent = '+ Add another author';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'submit';
      saveBtn.className = 'cta';
      saveBtn.textContent = '✍️ Save the names';
      form.appendChild(addBtn);
      form.appendChild(saveBtn);
      function addInput(v) {
        if (inputs.length >= 6) return null;
        const i = document.createElement('input');
        i.type = 'text';
        i.maxLength = 40;
        i.placeholder = 'Author name';
        i.value = v || '';
        form.insertBefore(i, addBtn);
        inputs.push(i);
        return i;
      }
      (book.authors && book.authors.length ? book.authors : ['']).forEach((a) => addInput(a));
      addBtn.addEventListener('click', () => { const i = addInput(''); if (i) i.focus(); });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const authors = inputs.map((i) => i.value.trim()).filter(Boolean);
        saveBtn.disabled = true;
        setStatus('<span class="spinner"></span>Saving the names…');
        try {
          const res = await fetch('/v1/books/' + bookId + '/authors', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ authors: authors }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) {
            book = data.book;
            setStatus('Names saved! ✍️');
            render();
            return;
          }
          const f = friendlyError(res, data);
          setStatus(f.text, f.cls);
          saveBtn.disabled = false;
        } catch {
          setStatus('Could not reach the server. Check your connection and try again.', 'error');
          saveBtn.disabled = false;
        }
      });
      left.appendChild(form);
    } else {
      const names = document.createElement('div');
      names.className = 'titlepage-names';
      names.style.whiteSpace = 'pre-line';
      const a = (book.authors || []).filter(Boolean);
      names.textContent = a.length ? a.join('\\n') : 'me';
      left.appendChild(names);
    }

    const ih = document.createElement('div');
    ih.className = 'titlepage-heading';
    ih.textContent = 'illustrated by';
    right.appendChild(ih);
    const iname = document.createElement('div');
    iname.className = 'titlepage-names';
    iname.textContent = ILLUSTRATORS[book.imageEngine] || DEFAULT_ILLUSTRATOR;
    right.appendChild(iname);
  }

  // "Change the cover": re-enter a prompt and repaint the front cover
  // (the title words are painted back into the new artwork).
  function coverRegenControls() {
    const wrap = document.createElement('div');
    wrap.className = 'regen cover-regen';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'readbtn';
    toggle.textContent = '🖌️ Change the cover';
    wrap.appendChild(toggle);

    toggle.addEventListener('click', () => {
      // A dialog in front of the book — the cover stays put behind it.
      const dlg = openTaskDialog('🖌️ Change the cover');
      const form = document.createElement('form');
      const label = document.createElement('label');
      label.textContent = 'What should the new cover look like?';
      const ta = document.createElement('textarea');
      ta.className = 'prompt';
      ta.rows = 4;
      ta.maxLength = 1000;
      ta.required = true;
      ta.value = book.coverPrompt || '';
      const btn = document.createElement('button');
      btn.type = 'submit';
      btn.className = 'cta';
      btn.style.marginTop = '12px';
      btn.textContent = '🖌️ Repaint the cover';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'linkbtn';
      cancel.textContent = '✕ Cancel';
      cancel.addEventListener('click', () => dlg.close());
      const actions = document.createElement('div');
      actions.className = 'music-actions';
      actions.appendChild(btn);
      actions.appendChild(cancel);
      form.appendChild(label); form.appendChild(ta); form.appendChild(actions);
      dlg.modal.appendChild(form);
      ta.focus();

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const coverPrompt = ta.value.trim();
        if (!coverPrompt) return;
        btn.disabled = true;
        cancel.disabled = true;
        setStatus('<span class="spinner"></span>Painting a new cover…');
        try {
          const res = await fetch('/v1/books/' + bookId + '/cover', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ coverPrompt: coverPrompt }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) {
            book = data.book;
            dlg.close();
            setStatus("Here's your new cover! 🎉");
            render();
            return;
          }
          const f = friendlyError(res, data);
          setStatus(f.text, f.cls);
          btn.disabled = false;
          cancel.disabled = false;
        } catch {
          setStatus('Could not reach the server. Check your connection and try again.', 'error');
          btn.disabled = false;
          cancel.disabled = false;
        }
      });
    });
    return wrap;
  }

  // "Edit text": edit a saved page's narration in place (left page). Opens the
  // SAME words editor as the new-page form (textarea + sprinkle + godmother),
  // prefilled with the page's words. Nothing persists until "Save the words".
  function wordsEditControls(pageIndex, page, textEl) {
    const wrap = document.createElement('div');
    wrap.className = 'regen words-edit';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'readbtn';
    toggle.textContent = '✏️ Edit text';
    wrap.appendChild(toggle);

    toggle.addEventListener('click', () => {
      toggle.remove();
      textEl.style.display = 'none'; // the editor takes the text's place

      // Ephemeral fairy-dust background state for this editing session.
      let background = '';
      const editor = buildWordsEditor({
        label: 'Rewrite the story for this page',
        initialText: page.text,
        editIndex: pageIndex,
        st: {
          getBackground: () => background,
          setBackground: (v) => { background = v; },
          clearBackground: () => { background = ''; },
          onTextSet: () => {},
        },
      });
      const btn = document.createElement('button');
      btn.type = 'submit';
      btn.className = 'cta';
      btn.textContent = '✏️ Save the words';
      editor.form.appendChild(btn);
      wrap.appendChild(editor.form);
      editor.ta.focus();

      editor.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = editor.ta.value.trim();
        if (!text) return;
        btn.disabled = true;
        setStatus('<span class="spinner"></span>Saving your words…');
        try {
          const res = await fetch('/v1/books/' + bookId + '/pages/' + pageIndex + '/text', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: text }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) {
            book = data.book;
            setStatus('Your new words are saved! ✏️');
            render();
            return;
          }
          const f = friendlyError(res, data);
          setStatus(f.text, f.cls);
          btn.disabled = false;
        } catch {
          setStatus('Could not reach the server. Check your connection and try again.', 'error');
          btn.disabled = false;
        }
      });
    });
    return wrap;
  }

  // "Suggest image prompt": translate story words into a concrete "Draw ..."
  // illustration instruction and fill the target box (overwriting). Shared by
  // the new-page form and the change-this-picture flow.
  async function suggestInto(btn, words, target, onFilled) {
    if (!words) { setStatus('Write your story words on the left first! ✍️', 'blocked'); return; }
    btn.disabled = true;
    const oldLabel = btn.textContent;
    btn.textContent = '💭 Dreaming up a picture…';
    try {
      const res = await fetch('/v1/books/' + bookId + '/suggest-image-prompt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: words }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        target.value = (data.result.imagePrompt || '').slice(0, 1000);
        if (onFilled) onFilled();
        target.classList.add('revealed');
        setTimeout(() => target.classList.remove('revealed'), 1100);
        setStatus('💡 How about this? Change any words you like, then hit Paint!');
      } else {
        const f = friendlyError(res, data);
        setStatus(f.text, f.cls);
      }
    } catch {
      setStatus('Could not reach the server. Check your connection and try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = oldLabel;
    }
  }

  /**
   * The shared right-page picture form — used by BOTH the new-page form and
   * "Change this picture". Label, 💡 Suggest image prompt (fed by getWords),
   * the multi-row prompt box, 🖌️ Paint it!, and an optional Cancel button.
   * The caller owns what Paint does via onSubmit(prompt, ctl).
   */
  function buildPictureForm(opts) {
    const form = document.createElement('form');
    const label = document.createElement('label');
    label.textContent = 'What picture should go with it?';
    form.appendChild(label);

    const sbtn = document.createElement('button');
    sbtn.type = 'button';
    sbtn.className = 'readbtn suggest';
    sbtn.title = 'Turn the story words into a picture idea';
    sbtn.textContent = '💡 Suggest image prompt';
    sbtn.addEventListener('click', () => suggestInto(sbtn, opts.getWords(), ta, opts.onSuggested));
    form.appendChild(sbtn);

    const ta = document.createElement('textarea');
    ta.className = 'prompt';
    ta.rows = 5;
    ta.maxLength = 1000;
    ta.required = true;
    ta.value = opts.initialPrompt || '';
    if (opts.placeholder) ta.placeholder = opts.placeholder;
    form.appendChild(ta);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'cta';
    submitBtn.style.marginTop = '14px';
    submitBtn.textContent = '🖌️ Paint it!';
    form.appendChild(submitBtn);

    let cancelBtn = null;
    if (opts.cancel) {
      cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'cta cancel';
      cancelBtn.style.marginTop = '10px';
      cancelBtn.textContent = opts.cancel.label;
      cancelBtn.addEventListener('click', opts.cancel.onCancel);
      form.appendChild(cancelBtn);
    }

    const ctl = {
      form: form,
      promptEl: ta,
      submitBtn: submitBtn,
      setBusy(b) {
        submitBtn.disabled = b;
        if (cancelBtn) cancelBtn.disabled = b;
      },
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const p = ta.value.trim();
      if (!p) return;
      opts.onSubmit(p, ctl);
    });
    return ctl;
  }

  // "Change this picture": swap the right page for the same picture workflow
  // as making a new page — the one difference is the Cancel button that brings
  // the old picture back untouched.
  function regenControls(pageIndex, page) {
    const wrap = document.createElement('div');
    wrap.className = 'regen';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'readbtn';
    toggle.textContent = '🖌️ Change this picture';
    wrap.appendChild(toggle);

    toggle.addEventListener('click', () => {
      // A dialog in front of the book — the current picture stays visible.
      const dlg = openTaskDialog('🖌️ Change this picture');
      const pic = buildPictureForm({
        initialPrompt: page.imagePrompt || '',
        getWords: () => (page.text || '').trim(),
        cancel: {
          label: '✕ Cancel',
          onCancel: () => { setStatus(''); dlg.close(); },
        },
        onSubmit: async (imagePrompt, ctl) => {
          ctl.setBusy(true);
          setStatus('<span class="spinner"></span>Painting a new picture…');
          try {
            const res = await fetch('/v1/books/' + bookId + '/pages/' + pageIndex + '/image', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ imagePrompt: imagePrompt }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok) {
              book = data.book;
              dlg.close();
              setStatus("Here's the new picture! 🎉");
              render();
              return;
            }
            const f = friendlyError(res, data);
            setStatus(f.text, f.cls);
            ctl.setBusy(false);
          } catch {
            setStatus('Could not reach the server. Check your connection and try again.', 'error');
            ctl.setBusy(false);
          }
        },
      });
      dlg.modal.appendChild(pic.form);
      pic.promptEl.focus();
    });
    return wrap;
  }

  // Background music (edit mode): controls live on the LEFT side of story
  // pages and on the cover. Add/Change opens a modal DIALOG in front of the
  // book (never stretching the page): an AI-suggested, editable prompt makes
  // two instrumental takes; the child previews both and picks one, or
  // regenerates, or cancels — the dialog closes on accept or cancel.
  /** A floating dialog in front of the book (shared chrome for task flows). */
  function openTaskDialog(titleText) {
    const backdrop = document.createElement('div');
    backdrop.className = 'music-backdrop';
    const modal = document.createElement('div');
    modal.className = 'music-modal music-panel';
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    const h = document.createElement('h3');
    h.textContent = titleText;
    modal.appendChild(h);
    return { modal: modal, close: close };
  }

  // --- Narrator voice: read the whole book in one of the kid's Voices --------
  // The cover carries a picker (default narrator / My voices / library
  // voices); each story page gets a retake button that rerolls just that
  // page's read-aloud and lets the creator audition two takes.

  function narratorVoiceControls() {
    const wrap = document.createElement('div');
    wrap.className = 'readrow';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'readbtn voice-btn';
    btn.textContent = '🎙️ Narrator: ' + (book.narratorVoiceName || 'Storybook narrator');
    btn.addEventListener('click', openNarratorDialog);
    wrap.appendChild(btn);
    return wrap;
  }

  function openNarratorDialog() {
    stopReading();
    const dlg = openTaskDialog('🎙️ Who should read this book?');
    const modal = dlg.modal;
    const list = document.createElement('div');
    list.className = 'voicepick';
    list.textContent = 'Finding the voices…';
    modal.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'music-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'cta';
    save.textContent = '✅ Use this narrator';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'linkbtn';
    cancel.textContent = '✕ Cancel';
    cancel.addEventListener('click', () => { setStatus(''); dlg.close(); });
    actions.appendChild(save);
    actions.appendChild(cancel);
    modal.appendChild(actions);

    function option(value, label, checked) {
      const row = document.createElement('label');
      row.className = 'voiceopt';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'narrator';
      radio.value = value;
      radio.checked = checked;
      row.appendChild(radio);
      row.appendChild(document.createTextNode(' ' + label));
      return row;
    }

    (async () => {
      let mineVoices = [];
      let libraryVoices = [];
      try {
        const results = await Promise.all([fetch('/v1/voices'), fetch('/v1/voices/library')]);
        const md = await results[0].json().catch(() => ({}));
        const ld = await results[1].json().catch(() => ({}));
        if (results[0].ok && md.ok) mineVoices = md.voices;
        if (results[1].ok && ld.ok) libraryVoices = ld.voices.filter((v) => !v.mine);
      } catch {}
      list.textContent = '';
      const current = book.narratorVoiceId || '';
      list.appendChild(option('', '📖 Storybook narrator (default)', current === ''));
      if (mineVoices.length) {
        const h = document.createElement('div');
        h.className = 'voicegroup';
        h.textContent = '🗣️ My voices';
        list.appendChild(h);
        for (const v of mineVoices) list.appendChild(option(v.id, v.name, current === v.id));
      }
      if (libraryVoices.length) {
        const h = document.createElement('div');
        h.className = 'voicegroup';
        h.textContent = '📚 From the library';
        list.appendChild(h);
        for (const v of libraryVoices) list.appendChild(option(v.id, v.name, current === v.id));
      }
      if (!mineVoices.length && !libraryVoices.length) {
        const hint = document.createElement('div');
        hint.className = 'voicehint';
        hint.innerHTML = 'Want the book read in YOUR voice? <a href="/voice/new">Create one in Voices</a> first!';
        list.appendChild(hint);
      }
    })();

    save.addEventListener('click', async () => {
      const picked = modal.querySelector('input[name="narrator"]:checked');
      if (!picked) { setStatus('Pick a narrator first! 🎙️', 'blocked'); return; }
      save.disabled = true;
      try {
        const res = await fetch('/v1/books/' + bookId + '/narrator-voice', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ voiceId: picked.value || null }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          book = data.book;
          dlg.close();
          render();
          // Re-record every page in the new voice now (cached once done), and
          // when the book is in reading mode show the friendly wait dialog.
          try { fetch('/v1/books/' + bookId + '/warm-narration', { method: 'POST' }); } catch {}
          if (!editMode) watchNarrationReadiness();
          setStatus('🎙️ ' + (book.narratorVoiceName ? book.narratorVoiceName + ' will read this book!' : 'Back to the storybook narrator!') + ' New recordings are being made now.');
          return;
        }
        const f = friendlyError(res, data);
        setStatus(f.text, f.cls);
        save.disabled = false;
      } catch {
        setStatus('Could not reach the server. Check your connection and try again.', 'error');
        save.disabled = false;
      }
    });
  }

  function narrationControls(pageIndex) {
    const wrap = document.createElement('div');
    wrap.className = 'readrow';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'readbtn voice-btn';
    btn.textContent = "🎙️ Redo this page's voice";
    btn.addEventListener('click', () => openNarrationRetakeDialog(pageIndex));
    wrap.appendChild(btn);
    return wrap;
  }

  function openNarrationRetakeDialog(pageIndex) {
    stopReading();
    const dlg = openTaskDialog('🎙️ New voice takes for this page');
    const modal = dlg.modal;
    const line = document.createElement('div');
    line.className = 'music-working';
    line.innerHTML = '<span class="notes-anim">🎙️</span><span>Recording two fresh takes…</span>';
    modal.appendChild(line);
    const cancelRow = document.createElement('div');
    cancelRow.className = 'music-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'linkbtn';
    cancel.textContent = '✕ Cancel — keep the old voice';
    cancel.addEventListener('click', () => { setStatus(''); dlg.close(); });
    cancelRow.appendChild(cancel);
    modal.appendChild(cancelRow);

    (async () => {
      let data;
      try {
        const res = await fetch('/v1/books/' + bookId + '/pages/' + pageIndex + '/narration-takes', { method: 'POST' });
        data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          const f = friendlyError(res, data);
          setStatus(f.text, f.cls);
          dlg.close();
          return;
        }
      } catch {
        setStatus('Could not reach the server. Check your connection and try again.', 'error');
        dlg.close();
        return;
      }
      line.remove();
      const label = document.createElement('label');
      label.textContent = 'Pick the reading you like best!';
      modal.insertBefore(label, cancelRow);
      for (let n = 1; n <= (data.clips || 0); n++) {
        const card = document.createElement('div');
        card.className = 'music-cand';
        const title = document.createElement('div');
        title.className = 'mc-title';
        title.textContent = '🎙️ Take ' + n;
        card.appendChild(title);
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'none';
        audio.src = '/v1/books/' + bookId + '/narration-take/' + data.setId + '/audio/' + n;
        card.appendChild(audio);
        const use = document.createElement('button');
        use.type = 'button';
        use.className = 'cta';
        use.textContent = '✅ Use this take';
        use.addEventListener('click', async () => {
          modal.querySelectorAll('button').forEach((b) => { b.disabled = true; });
          try {
            const res = await fetch('/v1/books/' + bookId + '/pages/' + pageIndex + '/narration-accept', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ setId: data.setId, choice: n }),
            });
            const rd = await res.json().catch(() => ({}));
            if (res.ok && rd.ok) {
              book = rd.book;
              dlg.close();
              setStatus('🎙️ New voice saved for this page!');
              render();
              return;
            }
            const f = friendlyError(res, rd);
            setStatus(f.text, f.cls);
            modal.querySelectorAll('button').forEach((b) => { b.disabled = false; });
          } catch {
            setStatus('Could not reach the server. Check your connection and try again.', 'error');
            modal.querySelectorAll('button').forEach((b) => { b.disabled = false; });
          }
        });
        card.appendChild(use);
        modal.insertBefore(card, cancelRow);
      }
    })();
  }

  function musicTarget(kind, index) {
    const base = '/v1/books/' + bookId;
    if (kind === 'cover') {
      return {
        suggest: base + '/cover/suggest-music-prompt',
        job: base + '/cover/music-job',
        attach: base + '/cover/music',
        remove: base + '/cover/music',
        existing: function () { return book.coverMusic; },
        what: 'the cover',
      };
    }
    return {
      suggest: base + '/pages/' + index + '/suggest-music-prompt',
      job: base + '/pages/' + index + '/music-job',
      attach: base + '/pages/' + index + '/music',
      remove: base + '/pages/' + index + '/music',
      existing: function () { return (book.pages[index] || {}).music; },
      what: 'this page',
    };
  }

  // Background-music jobs keep running after the dialog closes, so the child
  // can keep editing the book meanwhile. Keyed by 'cover' or 'page:<index>'
  // (the same target string the server stores on the job). While 'working'
  // the page shows the composing line instead of its music buttons; once
  // 'ready' it shows "Review background music" until a take is chosen or the
  // job is discarded.
  const bgMusicJobs = {};
  function musicKey(kind, index) { return kind === 'cover' ? 'cover' : 'page:' + index; }

  // Swap just that page's music controls when its job changes state — never
  // re-render the whole spread under the child's feet.
  function refreshMusicControls(key) {
    const el = document.querySelector('[data-music-key="' + key + '"]');
    if (!el || !el.replaceWith) return; // that page isn't on screen right now
    if (key === 'cover') el.replaceWith(musicControls('cover', null));
    else el.replaceWith(musicControls('page', Number(key.slice(5))));
  }

  // Poll a submitted job in the background until it settles.
  function startMusicJobWatch(key, jobId) {
    bgMusicJobs[key] = { jobId: jobId, state: 'working' };
    const timer = setInterval(async () => {
      try {
        const jr = await fetch('/v1/books/' + bookId + '/music-job/' + jobId);
        const jd = await jr.json().catch(() => ({}));
        if (!jr.ok || !jd.ok) throw new Error('gone');
        if (jd.state === 'working') return;
        clearInterval(timer);
        if (jd.state === 'done') {
          bgMusicJobs[key] = { jobId: jobId, state: 'ready', candidates: jd.candidates || 0, takes: jd.takes || [] };
          const where = key === 'cover' ? 'the cover' : 'page ' + (Number(key.slice(5)) + 1);
          setStatus('🎼 The music for ' + where + ' is ready! Look for the glowing “Review background music” button.'
            + (jd.message ? ' (' + jd.message + ')' : ''));
        } else {
          delete bgMusicJobs[key];
          setStatus(jd.message || 'The music maker had trouble — try again!', 'error');
        }
        refreshMusicControls(key);
      } catch {
        clearInterval(timer);
        delete bgMusicJobs[key];
        setStatus('Lost track of the music — please try again.', 'error');
        refreshMusicControls(key);
      }
    }, 4000);
  }

  function musicControls(kind, index) {
    const t = musicTarget(kind, index);
    const key = musicKey(kind, index);
    const wrap = document.createElement('div');
    wrap.className = 'musicstack';
    wrap.dataset.musicKey = key;
    const job = bgMusicJobs[key];
    if (job && job.state === 'working') {
      // Composing continues quietly in the background: the music buttons make
      // way for the status line until the takes are ready.
      const line = document.createElement('div');
      line.className = 'music-working';
      line.innerHTML = '<span class="notes-anim">🎶</span><span>Composing… this takes a minute or two!</span>';
      wrap.appendChild(line);
      return wrap;
    }
    if (job && job.state === 'ready') {
      const row = document.createElement('div');
      row.className = 'readrow';
      const review = document.createElement('button');
      review.type = 'button';
      // The shine pulls the child back to a page whose music finished while
      // they were composing or reading elsewhere — it glows the moment this
      // button is rendered, whether in place or when they navigate back to it.
      review.className = 'readbtn music-btn music-review-shine';
      review.textContent = '🎵 Review background music';
      review.addEventListener('click', () => openMusicReviewDialog(t, key));
      row.appendChild(review);
      wrap.appendChild(row);
      return wrap;
    }
    const has = !!t.existing();
    const row1 = document.createElement('div');
    row1.className = 'readrow';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'readbtn music-btn';
    toggle.textContent = has ? '🎼 Change background music' : '🎼 Add background music';
    toggle.addEventListener('click', () => {
      // Each page (and the cover) composes on its own: a page that's already
      // working shows the composing line instead of this button, so opening the
      // dialog here is always for an idle target. Other pages may be composing
      // meanwhile — that's fine, they don't block this one.
      openMusicDialog(t, key);
    });
    row1.appendChild(toggle);
    wrap.appendChild(row1);
    if (has) {
      const row2 = document.createElement('div');
      row2.className = 'readrow';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'readbtn remove-music';
      remove.textContent = '✕ Remove background music';
      remove.addEventListener('click', async () => {
        if (!confirm('Remove the background music from ' + t.what + '?')) return;
        remove.disabled = true;
        try {
          const res = await fetch(t.remove, { method: 'DELETE' });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) {
            book = data.book;
            setStatus('Background music removed. 🔇');
            render();
            return;
          }
          const f = friendlyError(res, data);
          setStatus(f.text, f.cls);
          remove.disabled = false;
        } catch {
          setStatus('Could not reach the server. Check your connection and try again.', 'error');
          remove.disabled = false;
        }
      });
      row2.appendChild(remove);
      wrap.appendChild(row2);
    }
    return wrap;
  }

  function openMusicDialog(t, key) {
    stopReading(); // no narration/music while composing new music
    const dlg = openTaskDialog('🎼 Background music for ' + t.what);
    const modal = dlg.modal;
    const close = dlg.close;

    const label = document.createElement('label');
    label.textContent = 'What should the music feel like?';
    modal.appendChild(label);
    const ta = document.createElement('textarea');
    ta.maxLength = 400;
    modal.appendChild(ta);

    // Which music makers to try (A/B): one checkbox per configured engine.
    // All checked takes are composed side by side in ONE job, and the review
    // opens only when every one of them has finished.
    const engLabel = document.createElement('label');
    engLabel.textContent = 'Which music makers should try?';
    modal.appendChild(engLabel);
    const engRow = document.createElement('div');
    engRow.className = 'music-engines';
    engRow.textContent = 'Looking for the music makers…';
    modal.appendChild(engRow);
    const engineBoxes = []; // { id, box }
    fetch('/v1/books/music-engines')
      .then((res) => res.json())
      .then((data) => {
        engRow.textContent = '';
        for (const e of (data && data.engines) || []) {
          const wrap = document.createElement('label');
          wrap.className = 'music-engine';
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.checked = e.configured;
          box.disabled = !e.configured;
          wrap.appendChild(box);
          wrap.appendChild(document.createTextNode(
            ' 🎹 ' + e.label + (e.configured ? '' : ' (not set up)')));
          engRow.appendChild(wrap);
          if (e.configured) engineBoxes.push({ id: e.id, box: box });
        }
        if (!engineBoxes.length) engRow.textContent = 'No music makers are set up yet.';
      })
      .catch(() => { engRow.textContent = 'Could not load the music makers — try again!'; });

    const actions = document.createElement('div');
    actions.className = 'music-actions';
    const gen = document.createElement('button');
    gen.type = 'button';
    gen.className = 'cta';
    gen.textContent = '🎵 Generate music';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'linkbtn';
    cancel.textContent = '✕ Cancel';
    cancel.addEventListener('click', () => { setStatus(''); close(); });
    actions.appendChild(gen);
    actions.appendChild(cancel);
    modal.appendChild(actions);

    // Prefill: the existing prompt when changing music; otherwise ask the AI
    // for a prompt that fits the scene and mood (still fully editable).
    const existing = t.existing();
    if (existing && existing.prompt) {
      ta.value = existing.prompt;
      ta.focus();
    } else {
      ta.placeholder = '🎼 The music director is thinking…';
      ta.disabled = true;
      gen.disabled = true;
      fetch(t.suggest, { method: 'POST' })
        .then((res) => res.json().then((data) => ({ res, data })))
        .then(({ res, data }) => {
          if (res.ok && data.ok) ta.value = (data.result.musicPrompt || '').slice(0, 400);
        })
        .catch(() => {})
        .finally(() => {
          ta.disabled = false;
          gen.disabled = false;
          ta.placeholder = 'Gentle, hopeful music with soft piano and warm strings…';
          ta.focus();
        });
    }

    let jobInFlight = false; // belt-and-suspenders: the server refuses doubles too
    gen.addEventListener('click', async () => {
      if (jobInFlight) return;
      const prompt = ta.value.trim();
      if (!prompt) { setStatus('Tell me how the music should feel first! 🎼', 'blocked'); return; }
      const engines = engineBoxes.filter((e) => e.box.checked).map((e) => e.id);
      if (!engines.length) { setStatus('Pick at least one music maker! 🎹', 'blocked'); return; }
      jobInFlight = true;
      gen.disabled = true;
      setStatus('');
      try {
        const res = await fetch(t.job, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: prompt, engines: engines }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          const f = friendlyError(res, data);
          setStatus(f.text, f.cls);
          gen.disabled = false;
          jobInFlight = false;
          return;
        }
        // The dialog's work is done: composing continues quietly in the
        // background while the child keeps editing. The page's music buttons
        // make way for the composing line until the takes are ready.
        close();
        startMusicJobWatch(key, data.jobId);
        refreshMusicControls(key);
        setStatus('🎶 Composing has begun! You can keep working on your book meanwhile.');
      } catch {
        setStatus('Could not reach the server. Check your connection and try again.', 'error');
        gen.disabled = false;
        jobInFlight = false;
      }
    });
  }

  // Review a finished job: hear both takes and pick one — or cancel to keep
  // things exactly as they are. Either way the dialog closes and the page
  // gets its normal music buttons back.
  function openMusicReviewDialog(t, key) {
    stopReading();
    const job = bgMusicJobs[key];
    if (!job) return;
    const dlg = openTaskDialog('🎼 Background music for ' + t.what);
    const modal = dlg.modal;
    const close = dlg.close;

    const label = document.createElement('label');
    label.textContent = 'Pick the music you like best!';
    modal.appendChild(label);

    const candBox = document.createElement('div');
    modal.appendChild(candBox);
    for (let n = 1; n <= (job.candidates || 2); n++) {
      const card = document.createElement('div');
      card.className = 'music-cand';
      const title = document.createElement('div');
      title.className = 'mc-title';
      // Label each take with the engine that made it (and how long it took),
      // so takes from different music makers can be compared fairly.
      const take = (job.takes || [])[n - 1];
      title.textContent = '🎵 Music ' + n
        + (take ? ' — ' + take.label + ' (' + take.seconds + 's)' : '');
      card.appendChild(title);
      // A custom player: native <audio controls> can't be recolored, so we
      // drive a hidden audio element with a bold blue play/pause button (white
      // symbol, like "Pick this song") plus a seek bar and elapsed time.
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.src = '/v1/books/' + bookId + '/music-job/' + job.jobId + '/audio/' + n;
      const player = document.createElement('div');
      player.className = 'mc-player';
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'mc-play';
      play.setAttribute('aria-label', 'Play music ' + n);
      play.innerHTML = '<span class="ic-play"></span><span class="ic-pause"></span>';
      const track = document.createElement('div');
      track.className = 'mc-track';
      const fill = document.createElement('div');
      fill.className = 'mc-fill';
      track.appendChild(fill);
      const time = document.createElement('span');
      time.className = 'mc-time';
      time.textContent = '0:00';
      player.appendChild(play);
      player.appendChild(track);
      player.appendChild(time);
      card.appendChild(player);
      card.appendChild(audio);

      const fmtTime = (s) => {
        if (!isFinite(s) || s < 0) s = 0;
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60);
        return mins + ':' + (secs < 10 ? '0' : '') + secs;
      };
      play.addEventListener('click', () => {
        if (audio.paused) {
          // Only one take plays at a time, so it's a fair side-by-side compare.
          candBox.querySelectorAll('audio').forEach((a) => { if (a !== audio) a.pause(); });
          audio.play().catch(() => {});
        } else {
          audio.pause();
        }
      });
      audio.addEventListener('play', () => play.classList.add('playing'));
      audio.addEventListener('pause', () => play.classList.remove('playing'));
      audio.addEventListener('ended', () => { play.classList.remove('playing'); fill.style.width = '0%'; });
      audio.addEventListener('timeupdate', () => {
        const dur = audio.duration || 0;
        fill.style.width = (dur ? (audio.currentTime / dur) * 100 : 0) + '%';
        time.textContent = fmtTime(audio.currentTime);
      });
      track.addEventListener('click', (e) => {
        const dur = audio.duration || 0;
        if (!dur) return;
        const rect = track.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        audio.currentTime = ratio * dur;
      });

      const use = document.createElement('button');
      use.type = 'button';
      use.className = 'cta';
      use.textContent = '✅ Pick this song';
      use.addEventListener('click', async () => {
        modal.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        try {
          const res = await fetch(t.attach, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jobId: job.jobId, choice: n }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) {
            book = data.book;
            delete bgMusicJobs[key];
            close();
            setStatus('🎼 Background music added! It plays softly while the words are read aloud.');
            render();
            return;
          }
          const f = friendlyError(res, data);
          setStatus(f.text, f.cls);
          modal.querySelectorAll('button').forEach((b) => { b.disabled = false; });
        } catch {
          setStatus('Could not reach the server. Check your connection and try again.', 'error');
          modal.querySelectorAll('button').forEach((b) => { b.disabled = false; });
        }
      });
      card.appendChild(use);
      candBox.appendChild(card);
    }

    const actions = document.createElement('div');
    actions.className = 'music-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'linkbtn';
    cancel.textContent = '✕ Cancel — no new music';
    cancel.addEventListener('click', async () => {
      cancel.disabled = true;
      // Let the server drop the unused takes right away; losing this call is
      // harmless (the job times out on its own).
      try { await fetch('/v1/books/' + bookId + '/music-job/' + job.jobId, { method: 'DELETE' }); } catch {}
      delete bgMusicJobs[key];
      close();
      setStatus('Okay — no new music. 🎼');
      refreshMusicControls(key);
    });
    actions.appendChild(cancel);
    modal.appendChild(actions);
  }

  // Page tools (edit mode): move / insert after / copy / remove this page.
  function pageToolsControls(pageIndex) {
    const wrap = document.createElement('div');
    wrap.className = 'pagetools';
    const storyCount = book.pages.length - (finished() ? 1 : 0);

    function tool(label, handler, opts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'linkbtn' + (opts && opts.danger ? ' danger' : '');
      b.textContent = label;
      if (opts && opts.disabled) b.disabled = true;
      else b.addEventListener('click', handler);
      wrap.appendChild(b);
      return b;
    }

    async function call(method, path, body, okStatus, onOk) {
      setStatus('<span class="spinner"></span>Rearranging your book…');
      try {
        const res = await fetch('/v1/books/' + bookId + path, {
          method: method,
          headers: body ? { 'content-type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          book = data.book;
          setStatus(okStatus);
          onOk(data);
          render();
          return;
        }
        const f = friendlyError(res, data);
        setStatus(f.text, f.cls);
      } catch {
        setStatus('Could not reach the server. Check your connection and try again.', 'error');
      }
    }

    tool('◀ Move earlier', () => {
      call('POST', '/pages/' + pageIndex + '/move', { to: pageIndex - 1 },
        'Moved! This is page ' + pageIndex + ' now.', () => { spread = pageIndex + 1; });
    }, { disabled: pageIndex === 0 });

    tool('Move later ▶', () => {
      call('POST', '/pages/' + pageIndex + '/move', { to: pageIndex + 1 },
        'Moved! This is page ' + (pageIndex + 2) + ' now.', () => { spread = pageIndex + 3; });
    }, { disabled: pageIndex >= storyCount - 1 });

    function startInsert(at) {
      insertAt = at;
      insertReturn = spread;
      spread = lastSpread();
      setStatus('');
      render();
    }
    tool('➕ Insert new page before', () => startInsert(pageIndex));
    tool('➕ Insert new page after', () => startInsert(pageIndex + 1));

    tool('🗑️ Delete this page', () => {
      if (!confirm('Delete page ' + (pageIndex + 1) + ' (its words and picture)? This cannot be undone.')) return;
      call('DELETE', '/pages/' + pageIndex, null,
        'Page deleted. 🗑️', () => { if (spread > lastSpread()) spread = lastSpread(); });
    }, { danger: true });

    return wrap;
  }

  // On the "The End" page in edit mode: remove it and jump back to writing.
  function endPageControls() {
    const wrap = document.createElement('div');
    wrap.className = 'regen';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'readbtn theend';
    btn.textContent = '✍️ Keep writing the story';
    wrap.appendChild(btn);
    btn.addEventListener('click', async () => {
      if (!confirm('Remove the "The End" page so you can add more pages?')) return;
      btn.disabled = true;
      setStatus('<span class="spinner"></span>Reopening your story…');
      try {
        const res = await fetch('/v1/books/' + bookId + '/end', { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          book = data.book;
          spread = book.pages.length + 2; // jump to the "add a page" spread
          setStatus('Keep going — add your next page! ✍️');
          render();
          return;
        }
        const f = friendlyError(res, data);
        setStatus(f.text, f.cls);
        btn.disabled = false;
      } catch {
        setStatus('Could not reach the server. Check your connection and try again.', 'error');
        btn.disabled = false;
      }
    });
    return wrap;
  }

  function renderAddPage() {
    const inserting = insertAt !== null;
    navlabel.textContent = inserting
      ? 'New page — will be page ' + (insertAt + 1)
      : 'New page';

    // Left page: the shared words editor, kept in sync with the draft so
    // flipping back through the book (or even a refresh) never loses work.
    const editor = buildWordsEditor({
      label: 'Write your story for this page',
      placeholder: 'Once upon a time…',
      initialText: draft.text,
      insertAt: insertAt !== null ? insertAt : book.pages.length,
      st: {
        getBackground: () => draft.sourceText,
        setBackground: (v) => { draft.sourceText = v; saveDraft(); },
        clearBackground: () => { delete draft.sourceText; saveDraft(); },
        onTextSet: (v) => { draft.text = v; saveDraft(); },
      },
    });
    editor.form.id = 'add-form';
    const storyEl = editor.ta;
    left.appendChild(editor.form);
    if (inserting) {
      const cancelRow = document.createElement('div');
      cancelRow.className = 'readrow';
      const cancelIns = document.createElement('button');
      cancelIns.type = 'button';
      cancelIns.className = 'linkbtn';
      cancelIns.textContent = '✕ Cancel adding page';
      cancelIns.addEventListener('click', () => {
        const backTo = insertReturn;
        insertAt = null;
        spread = Math.min(backTo, lastSpread());
        setStatus('');
        render();
      });
      cancelRow.appendChild(cancelIns);
      left.appendChild(cancelRow);
    }

    // Right page: the shared picture form; Paint makes the page.
    const pic = buildPictureForm({
      initialPrompt: draft.imagePrompt,
      placeholder: 'A turtle trying on a big red hat',
      getWords: () => storyEl.value.trim(),
      onSuggested: () => { draft.imagePrompt = pic.promptEl.value; saveDraft(); },
      onSubmit: async (imagePrompt, ctl) => {
        const text = storyEl.value.trim();
        if (!text) { setStatus('Write your story on the left page first!', 'blocked'); return; }
        ctl.setBusy(true);
        setStatus('<span class="spinner"></span>Painting your picture…');
        try {
          const res = await fetch('/v1/books/' + bookId + '/pages', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              text: text,
              imagePrompt: imagePrompt,
              insertAt: insertAt !== null ? insertAt : undefined,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) {
            clearDraft(); // the page is in the book now
            insertAt = null;
            book = data.book;
            spread = data.pageIndex + 2; // show the page just added
            setStatus('Your page is in the book! 🎉');
            render();
            return;
          }
          const f = friendlyError(res, data);
          setStatus(f.text, f.cls);
          ctl.setBusy(false);
        } catch {
          setStatus('Could not reach the server. Check your connection and try again.', 'error');
          ctl.setBusy(false);
        }
      },
    });
    right.appendChild(pic.form);
    pic.promptEl.addEventListener('input', () => {
      draft.imagePrompt = pic.promptEl.value;
      saveDraft();
    });
  }

  // Bottom action bar. What it offers depends on the book's state:
  //   published                  → just a note (read-only forever)
  //   finished draft, read mode  → "Edit this book" (the owner can reopen it)
  //   editing (or mid-creation)  → Save / Publish
  function renderActions() {
    const actions = document.getElementById('bookactions');
    actions.innerHTML = '';
    actions.hidden = true;
    const oldNote = document.querySelector('.pubnote');
    if (oldNote) oldNote.remove();

    if (book.status === 'published') {
      const note = document.createElement('div');
      note.className = 'pubnote';
      note.textContent = '📚 This book is published in the library';
      actions.parentNode.insertBefore(note, actions);
      // The author account may pull its own book back off the library, after
      // which it is editable again like any book in "My storybooks".
      if (mine) {
        actions.hidden = false;
        const unpub = document.createElement('button');
        unpub.className = 'cta cancel';
        unpub.type = 'button';
        unpub.textContent = '📤 Pull it off the library';
        unpub.addEventListener('click', async () => {
          if (!confirm('Take "' + book.title + '" out of the library? It goes back to My storybooks, where you can edit it and publish it again later.')) return;
          unpub.disabled = true;
          setStatus('<span class="spinner"></span>Bringing your book home…');
          try {
            const res = await fetch('/v1/books/' + bookId + '/unpublish', { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok) {
              book = data.book;
              editMode = false;
              editSession = false;
              setStatus('Your book is back on your shelf — press “Edit this book” to change it. 📚➡️🏠');
              renderActions();
              render();
              return;
            }
            const f = friendlyError(res, data);
            setStatus(f.text, f.cls);
            unpub.disabled = false;
          } catch {
            setStatus('Could not reach the server. Check your connection and try again.', 'error');
            unpub.disabled = false;
          }
        });
        actions.appendChild(unpub);
      }
      return;
    }

    actions.hidden = false;

    // Publish moves the book to the library (offered in read AND edit mode —
    // a finished draft can be published without opening it for editing).
    function makePublishButton() {
      const pub = document.createElement('button');
      pub.className = 'cta publish';
      pub.type = 'button';
      pub.textContent = '📚 Publish to the library';
      pub.addEventListener('click', async () => {
        if (!confirm('Publish "' + book.title + '" to the library? Everyone can read it there, and it can no longer be changed.')) return;
        pub.disabled = true;
        setStatus('<span class="spinner"></span>Publishing to the library…');
        try {
          const res = await fetch('/v1/books/' + bookId + '/publish', { method: 'POST' });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) { location.href = '/library'; return; }
          const f = friendlyError(res, data);
          setStatus(f.text, f.cls);
          pub.disabled = false;
        } catch {
          setStatus('Could not reach the server. Check your connection and try again.', 'error');
          pub.disabled = false;
        }
      });
      return pub;
    }

    if (!editMode) {
      // Reading a finished book from the shelf/library view. This single
      // account owns every draft, so the owner check is implicit.
      const edit = document.createElement('button');
      edit.className = 'cta';
      edit.type = 'button';
      edit.textContent = '✏️ Edit this book';
      edit.addEventListener('click', async () => {
        edit.disabled = true;
        // Snapshot the book first so "Cancel" can undo everything.
        try {
          const res = await fetch('/v1/books/' + bookId + '/edit-session', { method: 'POST' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.ok) {
            const f = friendlyError(res, data);
            setStatus(f.text, f.cls);
            edit.disabled = false;
            return;
          }
        } catch {
          setStatus('Could not reach the server. Check your connection and try again.', 'error');
          edit.disabled = false;
          return;
        }
        editMode = true;
        editSession = true;
        setStatus('You can change the words, pictures and authors now. ✏️');
        renderActions();
        render();
      });
      actions.appendChild(edit);
      actions.appendChild(makePublishButton());
      return;
    }

    // Save keeps the draft on your shelf; publish moves it to the library.
    const save = document.createElement('button');
    save.className = 'cta';
    save.type = 'button';
    save.textContent = '💾 Save to my books';
    save.addEventListener('click', () => {
      setStatus('Saved! Your book is waiting in My storybooks. 💾');
      setTimeout(() => { location.href = '/books'; }, 700);
    });
    actions.appendChild(save);
    actions.appendChild(makePublishButton());

    // Cancel is only offered when a snapshot exists to go back to (i.e. the
    // book was reopened via "Edit this book" — not during first creation).
    if (editSession) {
      const cancel = document.createElement('button');
      cancel.className = 'cta cancel';
      cancel.type = 'button';
      cancel.textContent = '↩️ Cancel my changes';
      cancel.addEventListener('click', async () => {
        if (!confirm('Throw away all the changes you just made? Your book will go back to how it was.')) return;
        cancel.disabled = true;
        setStatus('<span class="spinner"></span>Undoing your changes…');
        try {
          const res = await fetch('/v1/books/' + bookId + '/edit-session/cancel', { method: 'POST' });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) {
            book = data.book;
            editMode = false;
            editSession = false;
            if (spread > lastSpread()) spread = lastSpread();
            setStatus('All changes undone — your book is back to how it was. ↩️');
            renderActions();
            render();
            return;
          }
          const f = friendlyError(res, data);
          setStatus(f.text, f.cls);
          cancel.disabled = false;
        } catch {
          setStatus('Could not reach the server. Check your connection and try again.', 'error');
          cancel.disabled = false;
        }
      });
      actions.appendChild(cancel);
    }
  }

  prev.addEventListener('click', () => { if (spread > 0) { spread--; setStatus(''); render(); } });
  next.addEventListener('click', () => {
    if (book && spread < lastSpread()) { spread++; setStatus(''); render(); }
  });

  // Arrow keys flip the pages too — but never while the child is typing in a
  // text box (the arrows must keep moving the cursor there).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (!book) return;
    if (e.key === 'ArrowLeft' && spread > 0) { e.preventDefault(); spread--; setStatus(''); render(); }
    if (e.key === 'ArrowRight' && spread < lastSpread()) { e.preventDefault(); spread++; setStatus(''); render(); }
  });

  // Voices are recorded in the background after a book is written. If a reader
  // opens the book before every page (and the cover intro) has its recording,
  // greet them with a friendly "please wait" dialog that clears itself the
  // moment the voices are ready — and hydrates the book so playback is instant.
  function watchNarrationReadiness() {
    let dlg = null;      // the wait dialog, once shown
    let progress = null; // the "3 of 8 pages ready" line inside it
    let dismissed = false; // child chose to wait quietly — don't pop it back up
    let kicked = false;    // asked the server to start recording (once)
    let waited = false;    // narration was ever incomplete on this open

    function showDialog() {
      dlg = openTaskDialog('🎙️ Getting the voices ready');
      const line = document.createElement('div');
      line.className = 'music-working';
      line.innerHTML = '<span class="notes-anim">🎙️</span>'
        + '<span>We’re still recording the voices for this book. '
        + 'Please wait a little — this can take a minute!</span>';
      dlg.modal.appendChild(line);
      progress = document.createElement('div');
      progress.className = 'narr-progress';
      dlg.modal.appendChild(progress);
      const actions = document.createElement('div');
      actions.className = 'music-actions';
      const peek = document.createElement('button');
      peek.type = 'button';
      peek.className = 'linkbtn';
      peek.textContent = '👀 Look at the pictures while I wait';
      // Closing just hides the dialog; the watcher keeps polling and will let
      // the child know (via the status line) once the voices are ready.
      peek.addEventListener('click', () => { dismissed = true; dlg.close(); dlg = null; progress = null; });
      actions.appendChild(peek);
      dlg.modal.appendChild(actions);
    }

    async function hydrate() {
      // Reload the book so the fresh recordings are cached for instant "Read to
      // me"; keep the reader on the same spread it was showing.
      try {
        const r = await fetch('/v1/books/' + bookId);
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.ok) { book = d.book; render(); }
      } catch {}
    }

    async function poll() {
      let st;
      try {
        const r = await fetch('/v1/books/' + bookId + '/narration-status');
        st = await r.json().catch(() => ({}));
        if (!r.ok || !st.ok) return true; // can't tell — don't nag the child
      } catch { return true; }
      if (st.ready) {
        if (dlg) { dlg.close(); dlg = null; progress = null; }
        // Only announce (and reload for instant playback) if the child actually
        // had to wait — a book that was ready all along stays quiet.
        if (waited) { await hydrate(); setStatus('🎙️ The voices are ready — press “Read to me” to listen!'); }
        return true;
      }
      waited = true;
      // Nudge the server to record any missing pieces so this wait actually ends.
      if (!kicked) {
        kicked = true;
        try { fetch('/v1/books/' + bookId + '/warm-narration', { method: 'POST' }); } catch {}
      }
      if (!dlg && !dismissed) showDialog();
      if (progress) {
        progress.textContent = st.total ? '🎧 ' + (st.done || 0) + ' of ' + st.total + ' pages ready…' : '';
      }
      return false;
    }

    (async () => {
      if (await poll()) return;
      const timer = setInterval(async () => { if (await poll()) clearInterval(timer); }, 4000);
    })();
  }

  (async () => {
    try {
      const res = await fetch('/v1/books/' + bookId);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (res.status === 404) { setStatus('This book was not found. <a href="/books">Back to my books</a>', 'error'); return; }
        const f = friendlyError(res, data);
        setStatus(f.text, f.cls);
        return;
      }
      book = data.book;
      mine = !!data.mine;
      // Did this login session opt into experimental features? Decides whether
      // any music UI renders or attached music plays — resolve before render.
      try {
        const er = await fetch('/v1/experimental');
        const ed = await er.json().catch(() => ({}));
        expFeatures = !!(er.ok && ed.ok && ed.enabled);
      } catch {}
      // Music generation lives on the server: restore any job still composing
      // (or waiting for review) so a reload doesn't lose the page's state.
      // (Experimental sessions only — for everyone else the endpoint 404s and
      // there is no music UI to restore.)
      if (expFeatures) try {
        const mj = await fetch('/v1/books/' + bookId + '/music-jobs');
        const md = await mj.json().catch(() => ({}));
        for (const j of (mj.ok && md.ok && md.jobs) || []) {
          if (j.state === 'done') bgMusicJobs[j.target] = { jobId: j.jobId, state: 'ready', candidates: j.candidates || 0, takes: j.takes || [] };
          else startMusicJobWatch(j.target, j.jobId);
        }
      } catch {}
      // A book that was already finished when opened starts as a pure reader;
      // one still being written continues in creation (edit) mode.
      editMode = !finished();
      renderActions();
      render();
      // A finished book opens to read: make sure every voice is recorded first,
      // and if not, ask the reader to wait. Drafts still being written warm
      // their voices page-by-page, so they don't get nagged.
      if (!editMode) watchNarrationReadiness();
    } catch {
      setStatus('Could not load your book. Check your connection and try again.', 'error');
    }
  })();
  `;
}

// --- Coming-soon pages for the other tools -----------------------------------
function comingSoon(icon: string, name: string): string {
  return shell({
    title: `${name} — Harbor House`,
    back: true,
    body: `<div class="card" style="text-align:center">
      <div style="font-size:48px">${icon}</div>
      <h1>${name}</h1>
      <p class="sub">This tool is coming soon. Check back later!</p>
    </div>`,
  });
}

// (/music is served by musicPagesRouter — see routes/musicPages.ts.)
// /voice is served by voicePagesRouter (routes/voicePages.ts).
pagesRouter.get('/code', (_req, res) => res.type('html').send(comingSoon('💻', 'Coding')));
