import { Router, type Request, type Response } from 'express';
import { requirePageAuth } from '../middleware/requireAuth.js';

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
          <label class="field-label">Who wrote it?</label>
          <div id="authors"><input class="author" type="text" maxlength="40" placeholder="Author name" /></div>
          <button type="button" class="linkbtn" id="addauthor">+ Add another author</button>
          <div><button class="cta" id="create" type="submit" style="margin-top:12px">✨ Make my book</button></div>
        </form>
        <div id="status" class="status" role="status" aria-live="polite"></div>
      </div>`,
      head: BOOK_STYLES + SHELF_STYLES,
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
    tile.href = '/books/' + b.id;
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
    create.disabled = true;
    setStatus('<span class="spinner"></span>Making your book and painting the cover…');
    try {
      const res = await fetch('/v1/books', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: title, coverPrompt: coverPrompt || undefined, authors: authors }),
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
        const tile = bookTile(b, { showPublished: true });
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
      for (const b of data.books) shelf.appendChild(bookTile(b));
    } catch {}
  })();
  `;
}

// --- Book reader: open-book spread, words left / picture right ------------------
pagesRouter.get('/books/:id', (req: Request, res: Response) => {
  const id = req.params.id ?? '';
  // The page shell is static; the client fetches the book JSON by id.
  res.type('html').send(
    shell({
      title: 'My book — Harbor House',
      back: { href: '/library', label: 'Library' },
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
        <div class="bookactions" id="bookactions" hidden>
          <button class="cta" id="savebtn" type="button">💾 Save to my books</button>
          <button class="cta publish" id="publishbtn" type="button">📚 Publish to the library</button>
        </div>
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
        .pubnote { text-align: center; color: #5a4632; font-size: 13px; font-weight: 600; margin-top: 12px; }
        /* Repaint-the-picture controls under a page's image */
        .regen { margin-top: 10px; }
        .regen form { flex-direction: column; gap: 8px; height: auto; }
        .regen input[type=text] { background: transparent; border: 1px dashed #cbbfa4; font-size: 14px; }
        .regen .cta { padding: 9px 14px; font-size: 14px; margin-top: 8px; }
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
    }) + `<script>${CLIENT_HELPERS_JS}${readerClientJs()}</script>`,
  );
});

function readerClientJs(): string {
  return `
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
  function editable() { return book.status !== 'published'; }
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

  function render() {
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
      right.appendChild(p.image ? imgEl(p.image, p.imagePrompt) : noImage('No picture on this page'));
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
    iname.textContent = 'Google Nano Banana 2';
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

  // Save keeps the draft on your shelf; publish moves it to the library for everyone.
  function setupActions() {
    const actions = document.getElementById('bookactions');
    if (!editable()) {
      const note = document.createElement('div');
      note.className = 'pubnote';
      note.textContent = '📚 This book is published in the library';
      actions.parentNode.insertBefore(note, actions);
      return;
    }
    actions.hidden = false;
    document.getElementById('savebtn').addEventListener('click', () => {
      setStatus('Saved! Your book is waiting in My storybooks. 💾');
      setTimeout(() => { location.href = '/books'; }, 700);
    });
    document.getElementById('publishbtn').addEventListener('click', async () => {
      if (!confirm('Publish "' + book.title + '" to the library? Everyone can read it there, and it can no longer be changed.')) return;
      const btn = document.getElementById('publishbtn');
      btn.disabled = true;
      setStatus('<span class="spinner"></span>Publishing to the library…');
      try {
        const res = await fetch('/v1/books/' + bookId + '/publish', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) { location.href = '/library'; return; }
        const f = friendlyError(res, data);
        setStatus(f.text, f.cls);
        btn.disabled = false;
      } catch {
        setStatus('Could not reach the server. Check your connection and try again.', 'error');
        btn.disabled = false;
      }
    });
  }

  prev.addEventListener('click', () => { if (spread > 0) { spread--; setStatus(''); render(); } });
  next.addEventListener('click', () => {
    if (book && spread < lastSpread()) { spread++; setStatus(''); render(); }
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
      setupActions();
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
