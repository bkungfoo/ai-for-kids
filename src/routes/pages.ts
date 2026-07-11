import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { requirePageAuth } from '../middleware/requireAuth.js';
import { availableEngines, ENGINE_NAMES, illustratorName } from '../providers/imageProvider.js';

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
  { href: '/music', icon: '🎵', title: 'Music', blurb: 'Compose a song', ready: false },
  { href: '/voice', icon: '🎙️', title: 'Voices', blurb: 'Turn words into speech', ready: false },
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
function shell(opts: {
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
    <a class="tile${f.ready ? '' : ' soon'}${f.href === '/books' ? ' storybooks' : ''}" href="${f.href}">
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
        .badge { position: absolute; top: 12px; right: 12px; font-size: 11px; font-weight: 700;
          color: #2c6e8f; background: #dcebf1; border-radius: 999px; padding: 3px 9px; }
      </style>`,
    }),
  );
});

// --- Storybooks ---------------------------------------------------------------
// The old single-image tool grew into a picture-book maker; keep the old URL.
pagesRouter.get('/images', (_req: Request, res: Response) => res.redirect('/books'));

/** Friendly error text shared by the storybook pages' client scripts. */
const CLIENT_HELPERS_JS = `
  function friendlyError(res, data) {
    if (res.status === 403 && data && data.blocked) {
      return { text: data.message || "Let's try a different idea — keep it friendly and safe!", cls: 'blocked' };
    }
    if (res.status === 401) return { text: 'Your session ended. <a href="/login">Sign in again</a>.', cls: 'error' };
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
        /* Picture + optional pen-drawing overlay, kept exactly aligned. */
        .page-pic { position: relative; display: inline-block; line-height: 0; margin: auto; max-width: 100%; }
        .page-pic .drawing-overlay { position: absolute; inset: 0; width: 100% !important;
          height: 100% !important; max-height: none; margin: 0; pointer-events: none; }
        .draw-canvas { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 8px;
          touch-action: none; cursor: crosshair; }
        /* Pen palette */
        .draw-tool .palette { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 10px; }
        .draw-tool .swatch { width: 26px; height: 26px; border-radius: 50%; border: 2px solid #cbbfa4;
          cursor: pointer; padding: 0; }
        .draw-tool .swatch[data-color="#ffffff"] { border-color: #b3a789; }
        .draw-tool .tool.active { outline: 3px solid #2c6e8f; outline-offset: 1px; }
        .draw-tool .eraser, .draw-tool .tool:not(.swatch) { font-size: 13px; font-weight: 600;
          padding: 5px 10px; border-radius: 8px; border: 1px solid #cbbfa4; background: #fdf9f0;
          color: #5a4632; cursor: pointer; }
        .draw-tool .draw-actions { display: flex; gap: 12px; align-items: center; margin-top: 10px; }
        .draw-tool .draw-actions .cta { padding: 9px 14px; font-size: 14px; margin: 0; }
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
        /* "Change the cover" sits on a paper strip below the full-bleed cover art */
        .book.closed .page-right .cover-regen { padding: 12px 16px 16px; position: relative; z-index: 2; }
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
        /* Repaint-the-picture controls under a page's image */
        .regen { margin-top: 10px; }
        .regen form { flex-direction: column; gap: 8px; height: auto; }
        .regen input[type=text] { background: transparent; border: 1px dashed #cbbfa4; font-size: 14px; }
        .regen .cta { padding: 9px 14px; font-size: 14px; margin-top: 8px; }
        /* Read-aloud */
        .readrow { display: flex; gap: 10px; align-items: center; justify-content: center; margin-top: 10px; }
        .readbtn { font-size: 13px; font-weight: 700; padding: 6px 12px; border-radius: 999px;
          border: 1px solid #cbbfa4; background: #fdf9f0; color: #5a4632; cursor: pointer; }
        .readbtn:hover { background: #f2e9d6; }
        .readbtn.reading { background: #8a5a00; border-color: #8a5a00; color: #fff; }
        .w.said { background: #ffe9a8; border-radius: 4px; }
        /* On the closed cover the read button sits on a paper strip below the art */
        .book.closed .page-right .readrow { padding: 12px 16px 4px; position: relative; z-index: 2; }
        /* The End page */
        .the-end-art { margin: auto; font-size: 56px; text-align: center; letter-spacing: 8px; }
        .cta.end { background: #8a5a00; margin-top: 10px; }
        .cta.end:hover { background: #6f4800; }
        .cta.end:disabled { background: #b9a37a; }
        /* Add-a-page form lives ON the book pages */
        .page form { display: flex; flex-direction: column; height: 100%; }
        .page label { font-size: 13px; font-weight: 700; color: #6b5d43; margin-bottom: 6px; }
        .page textarea { flex: 1; min-height: 220px; background: transparent; border: 1px dashed #cbbfa4;
          font-family: Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.6; }
        .page input[type=text] { background: transparent; border: 1px dashed #cbbfa4; }
        @media (max-width: 720px) {
          .book { flex-direction: column; }
          .spine { width: auto; height: 3px; }
          .page { min-height: 260px; }
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
  // Spread 0 = closed front cover; 1 = title page; 2..n+1 = story pages;
  // n+2 = "add a page" (drafts that aren't finished only).
  function lastSpread() {
    return book.pages.length + 1 + (editable() && !finished() ? 1 : 0);
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

  function stopReading() {
    readAllMode = false;
    haltPlayback();
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
      haltPlayback();
      btn.classList.add('reading');
      btn.textContent = '⏹ Stop reading';
      narratePage(pageIndex, page, el, btn, label, () => {
        if (reading && reading.btn === btn) haltPlayback();
        if (readAllMode) advanceReadAll();
      });
    }
    btn.addEventListener('click', () => {
      if (reading && reading.btn === btn) { stopReading(); return; }
      readAllMode = false; // a single-page read cancels any read-all run
      start();
    });
    return row;
  }

  // After a page finishes in read-all: flip forward and read the next spread.
  function advanceReadAll() {
    if (!readAllMode || !book) return;
    const lastPageSpread = book.pages.length + 1;
    if (spread >= lastPageSpread) { readAllMode = false; return; }
    advancing = true;
    spread++;
    render();
    advancing = false;
    if (spread === 1) { advanceReadAll(); return; } // skip the title page
    if (curReadStart) curReadStart();
    else advanceReadAll(); // nothing readable here — keep going
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
    btn.addEventListener('click', () => {
      if (reading && reading.btn === btn) { stopReading(); return; }
      haltPlayback();
      if (!book.pages.length) { setStatus('This book has no pages to read yet!', 'blocked'); return; }
      readAllMode = true;
      btn.classList.add('reading');
      btn.textContent = '⏹ Stop reading';
      const by = authorsLine(book.authors);
      const intro = book.title + (by ? '. Written by ' + by + '.' : '.');
      const r = speakText(intro, null, () => {
        if (reading && reading.btn === btn) haltPlayback();
        if (readAllMode) advanceReadAll();
      });
      if (r) reading = { btn: btn, btnLabel: label, utter: r.utter, restore: r.restore };
      else readAllMode = false;
    });
    return row;
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
      right.appendChild(readAllControls());
      if (editable()) right.appendChild(coverRegenControls());
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
        left.appendChild(readRow(spread - 2, p, h));
        if (editable()) left.appendChild(endPageControls());
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
      left.appendChild(readRow(spread - 2, p, t));
      if (editable()) left.appendChild(wordsEditControls(spread - 2, p, t));
      if (p.image) {
        const picWrap = document.createElement('div');
        picWrap.className = 'page-pic';
        const ai = imgEl(p.image, p.imagePrompt);
        ai.className = 'ai-pic';
        picWrap.appendChild(ai);
        if (p.drawing) {
          const d = imgEl(p.drawing, 'your drawing');
          d.className = 'drawing-overlay';
          picWrap.appendChild(d);
        }
        right.appendChild(picWrap);
        if (editable()) right.appendChild(drawControls(spread - 2, p, picWrap, ai));
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
    toggle.className = 'linkbtn';
    toggle.textContent = '🖌️ Change the cover';
    wrap.appendChild(toggle);

    toggle.addEventListener('click', () => {
      toggle.remove();
      const form = document.createElement('form');
      const label = document.createElement('label');
      label.textContent = 'What should the new cover look like?';
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 1000;
      input.required = true;
      input.value = book.coverPrompt || '';
      const btn = document.createElement('button');
      btn.type = 'submit';
      btn.className = 'cta';
      btn.textContent = '🖌️ Repaint the cover';
      form.appendChild(label); form.appendChild(input); form.appendChild(btn);
      wrap.appendChild(form);
      input.focus();

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const coverPrompt = input.value.trim();
        if (!coverPrompt) return;
        btn.disabled = true;
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
            setStatus("Here's your new cover! 🎉");
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

  // "Change the words": edit a saved page's narration in place (left page).
  // The picture is untouched; the new words are re-checked by the server.
  function wordsEditControls(pageIndex, page, textEl) {
    const wrap = document.createElement('div');
    wrap.className = 'regen';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'linkbtn';
    toggle.textContent = '✏️ Change the words';
    wrap.appendChild(toggle);

    toggle.addEventListener('click', () => {
      toggle.remove();
      closeDrawTool(); // no drawing while changing the words
      textEl.style.display = 'none'; // the textarea takes the text's place
      const form = document.createElement('form');
      const label = document.createElement('label');
      label.textContent = 'Rewrite the story for this page';
      const ta = document.createElement('textarea');
      ta.maxLength = 2000;
      ta.required = true;
      ta.value = page.text;
      const btn = document.createElement('button');
      btn.type = 'submit';
      btn.className = 'cta';
      btn.textContent = '✏️ Save the words';
      form.appendChild(label); form.appendChild(ta); form.appendChild(btn);
      wrap.appendChild(form);
      ta.focus();

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = ta.value.trim();
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

  // Remove any open drawing tool (called when a change-words/picture form opens).
  function closeDrawTool() {
    const dt = document.getElementById('draw-tool');
    if (dt) dt.remove();
    const cv = document.getElementById('draw-canvas');
    if (cv) cv.remove();
  }

  // Pen palette: draw on the page's picture with a pen (colors) and an eraser.
  // Only offered on a fully-made page (has words AND a picture), in edit mode.
  const PEN_COLORS = ['#e23b3b','#f39a12','#f7d21a','#3aa657','#2c6e8f','#7a5aa0','#3d2f1e','#ffffff'];
  function drawControls(pageIndex, page, picWrap, aiImg) {
    const wrap = document.createElement('div');
    wrap.className = 'regen draw-tool';
    wrap.id = 'draw-tool';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'linkbtn';
    toggle.textContent = page.drawing ? '🖍️ Draw / erase on the picture' : '🖍️ Draw on the picture';
    wrap.appendChild(toggle);

    toggle.addEventListener('click', () => {
      toggle.remove();
      startDrawing(pageIndex, page, picWrap, aiImg, wrap);
    });
    return wrap;
  }

  function startDrawing(pageIndex, page, picWrap, aiImg, wrap) {
    // Remove the static saved-drawing overlay: its pixels get loaded INTO the
    // canvas below, so the canvas (which the pen and eraser act on) becomes the
    // one and only drawing layer. Otherwise the old overlay would still show
    // through and look impossible to erase.
    const staleOverlay = picWrap.querySelector('.drawing-overlay');
    if (staleOverlay) staleOverlay.remove();

    // Size the canvas to the picture as it is displayed right now.
    const rect = aiImg.getBoundingClientRect();
    const w = Math.round(rect.width) || 400;
    const h = Math.round(rect.height) || 400;
    const canvas = document.createElement('canvas');
    canvas.id = 'draw-canvas';
    canvas.className = 'draw-canvas';
    canvas.width = w;
    canvas.height = h;
    picWrap.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Continue from any existing drawing so the child can add to it.
    if (page.drawing) {
      const prev = new Image();
      prev.onload = () => ctx.drawImage(prev, 0, 0, w, h);
      prev.src = 'data:' + page.drawing.mimeType + ';base64,' + page.drawing.dataBase64;
    }

    let color = PEN_COLORS[0];
    let erasing = false;
    let drawing = false;

    function pos(e) {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (canvas.width / r.width),
               y: (e.clientY - r.top) * (canvas.height / r.height) };
    }
    function stroke(p) {
      ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = erasing ? 22 : 5;
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    }
    canvas.addEventListener('pointerdown', (e) => {
      drawing = true;
      canvas.setPointerCapture(e.pointerId);
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      stroke(p); // a tap leaves a dot
    });
    canvas.addEventListener('pointermove', (e) => { if (drawing) stroke(pos(e)); });
    const end = () => { drawing = false; ctx.beginPath(); };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', end);

    // --- palette ---
    const pal = document.createElement('div');
    pal.className = 'palette';
    const swatches = [];
    function selectTool(next) {
      erasing = next === 'eraser';
      pal.querySelectorAll('.tool').forEach((b) => b.classList.remove('active'));
      if (next === 'eraser') eraserBtn.classList.add('active');
      swatches.forEach((s) => { if (!erasing && s.dataset.color === color) s.classList.add('active'); });
    }
    for (const c of PEN_COLORS) {
      const s = document.createElement('button');
      s.type = 'button';
      s.className = 'swatch tool';
      s.dataset.color = c;
      s.style.background = c;
      s.title = 'Pen';
      s.addEventListener('click', () => { color = c; selectTool('pen'); });
      pal.appendChild(s);
      swatches.push(s);
    }
    const eraserBtn = document.createElement('button');
    eraserBtn.type = 'button';
    eraserBtn.className = 'tool eraser';
    eraserBtn.textContent = '🧽 Eraser';
    eraserBtn.addEventListener('click', () => selectTool('eraser'));
    pal.appendChild(eraserBtn);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'tool';
    clearBtn.textContent = '🗑️ Clear';
    clearBtn.addEventListener('click', () => {
      if (!confirm('Erase your whole drawing on this page?')) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
    pal.appendChild(clearBtn);
    wrap.appendChild(pal);

    // --- save / cancel ---
    const actions = document.createElement('div');
    actions.className = 'draw-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'cta';
    save.textContent = '💾 Save my drawing';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'linkbtn';
    cancel.textContent = 'Cancel';
    actions.appendChild(save);
    actions.appendChild(cancel);
    wrap.appendChild(actions);

    selectTool('pen'); // start on the first pen colour

    cancel.addEventListener('click', () => { setStatus(''); render(); });

    save.addEventListener('click', async () => {
      save.disabled = true;
      setStatus('<span class="spinner"></span>Saving your drawing…');
      // Empty canvas → clear any saved drawing; otherwise send the PNG overlay.
      const blank = document.createElement('canvas');
      blank.width = canvas.width; blank.height = canvas.height;
      const isEmpty = canvas.toDataURL() === blank.toDataURL();
      const dataUrl = isEmpty ? null : canvas.toDataURL('image/png');
      try {
        const res = await fetch('/v1/books/' + bookId + '/pages/' + pageIndex + '/drawing', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ drawing: dataUrl }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          book = data.book;
          setStatus(dataUrl ? 'Your drawing is saved! 🖍️' : 'Drawing cleared.');
          render();
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

  // "Change this picture": re-enter a prompt and repaint this page's artwork.
  function regenControls(pageIndex, page) {
    const wrap = document.createElement('div');
    wrap.className = 'regen';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'linkbtn';
    toggle.textContent = '🖌️ Change this picture';
    wrap.appendChild(toggle);

    toggle.addEventListener('click', () => {
      toggle.remove();
      closeDrawTool(); // no drawing while changing the picture
      const form = document.createElement('form');
      const label = document.createElement('label');
      label.textContent = 'Describe the new picture';
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 1000;
      input.required = true;
      input.value = page.imagePrompt || '';
      const btn = document.createElement('button');
      btn.type = 'submit';
      btn.className = 'cta';
      btn.textContent = '🖌️ Repaint it';
      form.appendChild(label); form.appendChild(input); form.appendChild(btn);
      wrap.appendChild(form);
      input.focus();

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const imagePrompt = input.value.trim();
        if (!imagePrompt) return;
        btn.disabled = true;
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
            setStatus("Here's the new picture! 🎉");
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

  // On the "The End" page in edit mode: remove it and jump back to writing.
  function endPageControls() {
    const wrap = document.createElement('div');
    wrap.className = 'regen';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cta';
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
    navlabel.textContent = 'New page';
    // Left page: the story words. Right page: a SEPARATE picture prompt.
    const form = document.createElement('form');
    form.id = 'add-form';
    form.innerHTML =
      '<label for="story">Write your story for this page</label>' +
      '<textarea id="story" maxlength="2000" required placeholder="Once upon a time…"></textarea>';
    left.appendChild(form);

    const rightForm = document.createElement('form');
    rightForm.innerHTML =
      '<label for="imgprompt">What picture should go with it?</label>' +
      '<input id="imgprompt" type="text" maxlength="1000" required placeholder="A turtle trying on a big red hat" />' +
      '<button class="cta" id="makepage" type="submit" style="margin-top:14px">🖌️ Paint it &amp; add the page</button>' +
      '<button class="cta end" id="endbook" type="button">🏁 Finish with a “The End” page</button>';
    right.appendChild(rightForm);

    // Restore any in-progress draft, and keep it saved on every keystroke so
    // flipping back through the book (or even a refresh) never loses work.
    const storyEl = document.getElementById('story');
    const imgEl2 = document.getElementById('imgprompt');
    storyEl.value = draft.text;
    imgEl2.value = draft.imagePrompt;
    storyEl.addEventListener('input', () => { draft.text = storyEl.value; saveDraft(); });
    imgEl2.addEventListener('input', () => { draft.imagePrompt = imgEl2.value; saveDraft(); });

    // First time the child clicks over to the picture prompt and it's still
    // empty, start it off with the narration they just wrote — a ready-made
    // description they can then tweak. Only once, so deliberately clearing it
    // doesn't fight back.
    let prefilled = false;
    imgEl2.addEventListener('focus', () => {
      if (prefilled || imgEl2.value.trim()) return;
      const words = storyEl.value.trim();
      if (!words) return;
      prefilled = true;
      imgEl2.value = words.slice(0, 1000); // input maxlength
      draft.imagePrompt = imgEl2.value;
      saveDraft();
    });

    rightForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = storyEl.value.trim();
      const imagePrompt = imgEl2.value.trim();
      if (!text) { setStatus('Write your story on the left page first!', 'blocked'); return; }
      if (!imagePrompt) return;
      const btn = document.getElementById('makepage');
      btn.disabled = true;
      setStatus('<span class="spinner"></span>Painting your picture…');
      try {
        const res = await fetch('/v1/books/' + bookId + '/pages', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: text, imagePrompt: imagePrompt }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          clearDraft(); // the page is in the book now
          book = data.book;
          spread = data.pageIndex + 2; // show the page just added
          setStatus('Your page is in the book! 🎉');
          render();
          return;
        }
        const f = friendlyError(res, data);
        setStatus(f.text, f.cls);
        btn.disabled = false;
      } catch {
        setStatus('Could not reach the server. Check your connection and try again.', 'error');
        const btn2 = document.getElementById('makepage');
        if (btn2) btn2.disabled = false;
      }
    });

    document.getElementById('endbook').addEventListener('click', async () => {
      const btn = document.getElementById('endbook');
      btn.disabled = true;
      setStatus('<span class="spinner"></span>Closing your book…');
      try {
        const res = await fetch('/v1/books/' + bookId + '/end', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          book = data.book;
          spread = data.pageIndex + 2;
          setStatus('Your book is finished! 🎉');
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
      // A book that was already finished when opened starts as a pure reader;
      // one still being written continues in creation (edit) mode.
      editMode = !finished();
      renderActions();
      render();
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

pagesRouter.get('/music', (_req, res) => res.type('html').send(comingSoon('🎵', 'Music')));
pagesRouter.get('/voice', (_req, res) => res.type('html').send(comingSoon('🎙️', 'Voices')));
pagesRouter.get('/code', (_req, res) => res.type('html').send(comingSoon('💻', 'Coding')));
