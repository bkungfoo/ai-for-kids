import { Router, type Request, type Response } from 'express';
import { requirePageAuth } from '../middleware/requireAuth.js';
import { MUSIC_MOODS, MUSIC_STYLES } from '../music/options.js';
import { MUSIC_BG_BRIGHT, MUSIC_BG_DARK, MUSIC_BG_PURPLE } from './wallpapers.js';
import { shell } from './pages.js';

/**
 * The music section, structured like Storybooks: a hub (/music) with three
 * tiles — Make new song, My music, Browse the library — plus the pages
 * behind them. Every page carries the background-mode picker (Light / Dark /
 * Purple), remembered per browser, and the whole UI themes with the mode.
 */
export const musicPagesRouter = Router();

for (const path of ['/music', '/music/new', '/music/mine', '/music/library']) {
  musicPagesRouter.get(path, requirePageAuth);
}

const MUSIC_MODE_CSS = `<style>
  /* Theme variables per background mode — the card ("dialog box"), chips,
     inputs and panels all read from these, VSCode-style. */
  body {
    --card: #ffffff; --card-shadow: rgba(16,42,54,.30);
    --fg: #102a36; --muted: #5a7785; --label: #35566b;
    --chip-bg: #f1f7fa; --chip-border: #dceaf0; --chip-on-bg: #dcebf1;
    --chip-on-border: #2c6e8f; --chip-ring: rgba(44,110,143,.15);
    --panel: #f7fbfd; --panel-border: #dceaf0; --divider: #c4d3da;
    --input-bg: #ffffff; --input-border: #c4d3da; --input-focus: #2c6e8f;
    --accent: #2c6e8f; --badge-bg: #dcebf1; --badge-fg: #2c6e8f;
    --danger: #8a1c1c; --warn: #8a5a00;
    background: #e9f6fb url("data:image/svg+xml,${encodeURIComponent(MUSIC_BG_BRIGHT)}") repeat;
    color: #16324a;
  }
  header { color: #35566b; }
  .back, .signout { color: #35566b; }
  .signout { border-color: rgba(53,86,107,.45); }
  .signout:hover { background: rgba(53,86,107,.08); }

  /* Dark: VSCode-dark-like greys, light foreground. */
  body.bg-dark {
    --card: #252526; --card-shadow: rgba(0,0,0,.6);
    --fg: #d4d4d4; --muted: #9da3ab; --label: #c8ccd2;
    --chip-bg: #2d2d30; --chip-border: #3e3e42; --chip-on-bg: #1f3a52;
    --chip-on-border: #569cd6; --chip-ring: rgba(86,156,214,.25);
    --panel: #1e1e1e; --panel-border: #3e3e42; --divider: #4a4a50;
    --input-bg: #1e1e1e; --input-border: #3e3e42; --input-focus: #569cd6;
    --accent: #4fc1ff; --badge-bg: #143a52; --badge-fg: #7fd0ff;
    --danger: #ff8a8a; --warn: #ffce85;
    background: #0d0d12 url("data:image/svg+xml,${encodeURIComponent(MUSIC_BG_DARK)}") repeat;
    color: #d4d4d4; color-scheme: dark;
  }
  body.bg-dark header, body.bg-dark .back, body.bg-dark .signout { color: #e6e2ee; }
  body.bg-dark .signout { border-color: rgba(230,226,238,.5); }
  body.bg-dark .signout:hover { background: rgba(230,226,238,.12); }

  /* Purple: deep-violet card, high-contrast light text (Dracula-ish). */
  body.bg-purple {
    --card: #2e2749; --card-shadow: rgba(20,10,50,.55);
    --fg: #f0eafc; --muted: #b9abdd; --label: #d9cdf5;
    --chip-bg: #3a3160; --chip-border: #544684; --chip-on-bg: #4a3a7e;
    --chip-on-border: #c9a2f5; --chip-ring: rgba(201,162,245,.3);
    --panel: #362e56; --panel-border: #544684; --divider: #5c4f8c;
    --input-bg: #251f3d; --input-border: #544684; --input-focus: #c9a2f5;
    --accent: #d6b6ff; --badge-bg: #4a3a7e; --badge-fg: #e3d1ff;
    --danger: #ff9cae; --warn: #ffd28a;
    background: #bdaae9 url("data:image/svg+xml,${encodeURIComponent(MUSIC_BG_PURPLE)}") repeat;
    color: #3c2f66; color-scheme: dark;
  }
  body.bg-purple header, body.bg-purple .back, body.bg-purple .signout { color: #4b3d80; }
  body.bg-purple .signout { border-color: rgba(75,61,128,.45); }
  body.bg-purple .signout:hover { background: rgba(75,61,128,.08); }
</style>`;

const MUSIC_CSS = `<style>
  main { width: min(94vw, 860px); }
  .card { background: var(--card); color: var(--fg);
    box-shadow: 0 18px 40px var(--card-shadow); }
  .card .sub { color: var(--muted); }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 2px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; padding: 8px 13px;
    border: 2px solid var(--chip-border); border-radius: 999px; background: var(--chip-bg);
    cursor: pointer; font-size: 14px; font-weight: 700; color: var(--fg); }
  .chip:hover { border-color: var(--chip-on-border); }
  .chip.on { border-color: var(--chip-on-border); background: var(--chip-on-bg);
    box-shadow: 0 0 0 3px var(--chip-ring); }
  .group-label { display: block; font-size: 13px; font-weight: 800; color: var(--label);
    margin: 18px 0 2px; text-transform: uppercase; letter-spacing: .5px; }
  .group-hint { font-size: 12px; color: var(--muted); font-weight: 400; text-transform: none; letter-spacing: 0; }
  textarea#idea { width: 100%; margin-top: 6px; min-height: 74px; padding: 11px 13px;
    font-size: 15px; font-family: inherit; border: 1px solid var(--input-border);
    border-radius: 10px; outline: none; background: var(--input-bg); color: var(--fg); resize: vertical; }
  textarea#idea:focus { border-color: var(--input-focus); box-shadow: 0 0 0 3px var(--chip-ring); }
  .genrow { display: flex; align-items: center; gap: 14px; margin-top: 18px; }
  button.cta { padding: 12px 18px; font-size: 15px; font-weight: 700; color: #fff;
    background: #2c6e8f; border: none; border-radius: 10px; cursor: pointer; }
  button.cta:hover { background: #245d79; }
  button.cta:disabled { opacity: .55; cursor: progress; }
  .cta.generate { font-size: 17px; padding: 14px 22px; }
  .cta.publish { background: #7a5aa0; }
  .cta.publish:hover { background: #684b8a; }
  .linkbtn { background: none; border: none; color: var(--accent); font-size: 13px;
    font-weight: 700; cursor: pointer; padding: 4px 2px; text-decoration: underline; }
  .status { margin-top: 12px; font-size: 14px; min-height: 20px; color: var(--fg); }
  .status.error { color: var(--danger); }
  .status.blocked { color: var(--warn); }
  .result { margin-top: 18px; border: 1px solid var(--panel-border); background: var(--panel);
    border-radius: 14px; padding: 16px; }
  .result h3 { margin: 0 0 4px; font-size: 17px; }
  .songcard.another { border-top: 1px dashed var(--divider); margin-top: 16px; padding-top: 14px; }
  .result .meta { font-size: 12.5px; color: var(--muted); margin-bottom: 10px; }
  .result audio, .trackrow audio { width: 100%; margin-top: 6px; }
  .result .actions { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
  .lyrics { white-space: pre-wrap; font-family: Georgia, serif; font-size: 14px;
    color: var(--fg); margin-top: 10px; max-height: 180px; overflow-y: auto;
    border-top: 1px dashed var(--divider); padding-top: 8px; }
  .shelfhead { font-size: 18px; margin: 26px 0 4px; }
  .trackrow { border: 1px solid var(--panel-border); background: var(--panel);
    border-radius: 12px; padding: 12px 14px; margin-top: 10px; }
  .trackrow .t-title { font-weight: 800; font-size: 15px; }
  .trackrow .t-meta { font-size: 12px; color: var(--muted); margin-top: 1px; }
  .trackrow .t-actions { display: flex; gap: 12px; margin-top: 6px; flex-wrap: wrap; }
  .t-actions .linkbtn.danger { color: var(--danger); }
  .pubbadge { display: inline-block; font-size: 11px; font-weight: 700; color: var(--badge-fg);
    background: var(--badge-bg); border-radius: 999px; padding: 2px 8px; margin-left: 6px; }
  .empty { color: var(--muted); font-size: 14px; margin-top: 8px; }
  .working { display: flex; align-items: center; gap: 10px; margin-top: 16px;
    font-size: 15px; font-weight: 600; color: var(--accent); }
  .notes-anim { font-size: 22px; animation: bob 1s ease-in-out infinite alternate; }
  @keyframes bob { from { transform: translateY(2px) rotate(-8deg); } to { transform: translateY(-4px) rotate(8deg); } }
  .bgmodes { display: flex; align-items: center; gap: 6px; justify-content: flex-end;
    margin: -8px -8px 4px 0; flex-wrap: wrap; }
  .bg-label { font-size: 11.5px; font-weight: 800; color: var(--muted); text-transform: uppercase;
    letter-spacing: .5px; }
  .chip.mini { padding: 4px 9px; font-size: 12px; border-width: 2px; }
  /* Hub tiles (like the Storybooks hub), themed with the mode. */
  .mtiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  @media (max-width: 620px) { .mtiles { grid-template-columns: 1fr; } }
  .mtile { display: flex; flex-direction: column; gap: 4px; padding: 22px; border-radius: 14px;
    text-decoration: none; color: var(--fg); background: var(--chip-bg);
    border: 1px solid var(--chip-border); transition: transform .08s, box-shadow .12s; }
  .mtile:hover { transform: translateY(-2px); box-shadow: 0 10px 22px var(--card-shadow); }
  .mtile-icon { font-size: 34px; }
  .mtile-title { font-weight: 700; font-size: 18px; }
  .mtile-blurb { font-size: 14px; color: var(--muted); }
</style>`;

/** The background-mode picker, shown top-right of the card on every page. */
const BG_MODES_HTML = `<div class="bgmodes" id="bgmodes" title="Change the background">
  <span class="bg-label">Background:</span>
  <button type="button" class="chip mini" data-bg="bright">☀️ Light</button>
  <button type="button" class="chip mini" data-bg="dark">🥁 Dark</button>
  <button type="button" class="chip mini" data-bg="purple">🌙 Purple</button>
</div>`;

/** Shared client helpers: theming, errors, status, and track rows. */
function musicSharedJs(): string {
  return `
  function friendlyError(res, data) {
    if (data && data.code === 'credits_exhausted') {
      return { text: '🪫 ' + (data.error || 'The AI credits have run out — ask a grown-up to top up the account.'), cls: 'error' };
    }
    if (res.status === 403 && data && data.blocked) {
      return { text: data.message || "Let's try a different idea — keep it friendly and safe!", cls: 'blocked' };
    }
    if (res.status === 401) return { text: 'Your session ended. <a href="/login">Sign in again</a>.', cls: 'error' };
    if (res.status === 400 && data && data.error) return { text: data.error, cls: 'blocked' };
    if (res.status === 501) return { text: "The music maker isn't set up yet. Ask a grown-up to add the key.", cls: 'error' };
    if (res.status === 503) return { text: 'Lots of people are creating right now — please try again in a moment.', cls: 'error' };
    return { text: 'Something went wrong. Please try again.', cls: 'error' };
  }

  const statusEl = document.getElementById('status');
  function setStatus(text, cls) {
    if (!statusEl) return;
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
    statusEl.innerHTML = text;
  }

  // Background modes: bright/light (default) / dark / purple, remembered.
  function applyBg(mode) {
    if (mode === 'kpop') mode = 'purple'; // legacy saved value
    document.body.className = mode === 'dark' ? 'bg-dark' : mode === 'purple' ? 'bg-purple' : '';
    document.querySelectorAll('#bgmodes .chip').forEach(function (c) {
      c.classList.toggle('on', c.dataset.bg === mode);
    });
    try { localStorage.setItem('hh-music-bg', mode); } catch {}
  }
  document.querySelectorAll('#bgmodes .chip').forEach(function (c) {
    c.addEventListener('click', function () { applyBg(c.dataset.bg); });
  });
  (function () {
    let saved = 'bright';
    try { saved = localStorage.getItem('hh-music-bg') || 'bright'; } catch {}
    applyBg(saved);
  })();

  function trackMeta(t) {
    const bits = [];
    if (t.style) bits.push(t.style);
    if (t.mood) bits.push(t.mood);
    bits.push(t.instrumental ? 'instrumental' : 'with words');
    return bits.join(' · ');
  }

  function trackRow(t, mineShelf, onChanged) {
    const row = document.createElement('div');
    row.className = 'trackrow';
    const title = document.createElement('div');
    title.className = 't-title';
    title.textContent = '🎵 ' + t.title;
    if (mineShelf && t.status === 'published') {
      const b = document.createElement('span');
      b.className = 'pubbadge';
      b.textContent = '📻 In the library';
      title.appendChild(b);
    }
    row.appendChild(title);
    const meta = document.createElement('div');
    meta.className = 't-meta';
    meta.textContent = trackMeta(t);
    row.appendChild(meta);
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.src = '/v1/music/' + t.id + '/audio';
    row.appendChild(audio);
    if (mineShelf) {
      const actions = document.createElement('div');
      actions.className = 't-actions';
      const pubBtn = document.createElement('button');
      pubBtn.className = 'linkbtn';
      pubBtn.textContent = t.status === 'published' ? '📤 Pull it off the library' : '📻 Publish to the library';
      pubBtn.addEventListener('click', async function () {
        await fetch('/v1/music/' + t.id + '/' + (t.status === 'published' ? 'unpublish' : 'publish'), { method: 'POST' });
        onChanged();
      });
      actions.appendChild(pubBtn);
      const del = document.createElement('button');
      del.className = 'linkbtn danger';
      del.textContent = '🗑️ Delete';
      del.addEventListener('click', async function () {
        if (!confirm('Delete "' + t.title + '"? This cannot be undone.')) return;
        await fetch('/v1/music/' + t.id, { method: 'DELETE' });
        onChanged();
      });
      actions.appendChild(del);
      row.appendChild(actions);
    }
    return row;
  }

  async function fillShelf(url, boxId, mineShelf, emptyHtml, onChanged) {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok) return;
      const box = document.getElementById(boxId);
      box.innerHTML = '';
      if (!data.tracks.length) {
        const p = document.createElement('p');
        p.className = 'empty';
        p.innerHTML = emptyHtml;
        box.appendChild(p);
        return;
      }
      for (const t of data.tracks) box.appendChild(trackRow(t, mineShelf, onChanged));
    } catch {}
  }
  `;
}

// --- Hub: three tiles, like the Storybooks hub ----------------------------------
musicPagesRouter.get('/music', (_req: Request, res: Response) => {
  res.type('html').send(
    shell({
      title: 'Music — Harbor House',
      back: true,
      body: `<div class="card">
        ${BG_MODES_HTML}
        <h1>🎵 Music</h1>
        <p class="sub">Make songs with AI, keep your favorites, and share them in the library.</p>
        <div class="mtiles">
          <a class="mtile" href="/music/new">
            <span class="mtile-icon" aria-hidden="true">✨</span>
            <span class="mtile-title">Make new song</span>
            <span class="mtile-blurb">Pick a style and a mood, and let the music maker sing</span>
          </a>
          <a class="mtile" href="/music/mine">
            <span class="mtile-icon" aria-hidden="true">💿</span>
            <span class="mtile-title">My music</span>
            <span class="mtile-blurb">Listen to the songs you saved</span>
          </a>
          <a class="mtile" href="/music/library">
            <span class="mtile-icon" aria-hidden="true">📻</span>
            <span class="mtile-title">Browse the library</span>
            <span class="mtile-blurb">Hear the songs everyone published</span>
          </a>
        </div>
      </div>`,
      head: MUSIC_MODE_CSS + MUSIC_CSS,
    }) + `<script>${musicSharedJs()}</script>`,
  );
});

// --- My music --------------------------------------------------------------------
musicPagesRouter.get('/music/mine', (_req: Request, res: Response) => {
  res.type('html').send(
    shell({
      title: 'My music — Harbor House',
      back: { href: '/music', label: 'Music' },
      body: `<div class="card">
        ${BG_MODES_HTML}
        <h1>💿 My music</h1>
        <p class="sub">Your saved songs — or <a href="/music/new">✨ make a new one</a>.</p>
        <div id="mymusic"></div>
        <div id="status" class="status" role="status" aria-live="polite"></div>
      </div>`,
      head: MUSIC_MODE_CSS + MUSIC_CSS,
    }) + `<script>${musicSharedJs()}
      function reload() { fillShelf('/v1/music', 'mymusic', true, 'Nothing saved yet — <a href="/music/new">make your first song!</a>', reload); }
      reload();
    </script>`,
  );
});

// --- The music library -------------------------------------------------------------
musicPagesRouter.get('/music/library', (_req: Request, res: Response) => {
  res.type('html').send(
    shell({
      title: 'Music library — Harbor House',
      back: { href: '/music', label: 'Music' },
      body: `<div class="card">
        ${BG_MODES_HTML}
        <h1>📻 Music library</h1>
        <p class="sub">Songs our musicians published. Want to add yours?
          <a href="/music/new">✨ Make a new song</a>.</p>
        <div id="library"></div>
        <div id="status" class="status" role="status" aria-live="polite"></div>
      </div>`,
      head: MUSIC_MODE_CSS + MUSIC_CSS,
    }) + `<script>${musicSharedJs()}
      fillShelf('/v1/music/library', 'library', false, 'The library is quiet — <a href="/music/new">publish the first song!</a>', function () {});
    </script>`,
  );
});

// --- Make new song -----------------------------------------------------------------
musicPagesRouter.get('/music/new', (_req: Request, res: Response) => {
  const styleChips = MUSIC_STYLES.map(
    (s) => `<button type="button" class="chip" data-kind="style" data-id="${s.id}">${s.icon} ${s.label}</button>`,
  ).join('');
  const moodChips = MUSIC_MOODS.map(
    (m) => `<button type="button" class="chip" data-kind="mood" data-id="${m.id}">${m.icon} ${m.label}</button>`,
  ).join('');

  res.type('html').send(
    shell({
      title: 'Make new song — Harbor House',
      back: { href: '/music', label: 'Music' },
      body: `<div class="card">
        ${BG_MODES_HTML}
        <h1>✨ Make new song</h1>
        <p class="sub">Pick a style and a mood, add your own idea — then let the music maker sing!</p>

        <span class="group-label">Style <span class="group-hint">(optional — tap to choose, tap again to clear)</span></span>
        <div class="chips" id="styles">${styleChips}</div>

        <span class="group-label">Mood <span class="group-hint">(optional)</span></span>
        <div class="chips" id="moods">${moodChips}</div>

        <span class="group-label">Words or instrumental?</span>
        <div class="chips" id="vocals">
          <button type="button" class="chip on" data-kind="vocal" data-id="words">🎤 With words</button>
          <button type="button" class="chip" data-kind="vocal" data-id="instrumental">🎹 Instrumental</button>
        </div>

        <span class="group-label">Your idea <span class="group-hint">(optional — what should the song be about?)</span></span>
        <textarea id="idea" maxlength="500" placeholder="A brave little boat sailing home under the stars…"></textarea>

        <div class="genrow">
          <button class="cta generate" id="generate" type="button">🎵 Generate music</button>
        </div>
        <div id="working" class="working" hidden>
          <span class="notes-anim">🎶</span><span id="working-text">Composing your song…</span>
        </div>
        <div id="result" class="result" hidden></div>
        <div id="status" class="status" role="status" aria-live="polite"></div>
      </div>`,
      head: MUSIC_MODE_CSS + MUSIC_CSS,
    }) + `<script>${musicSharedJs()}${makerClientJs()}</script>`,
  );
});

function makerClientJs(): string {
  return `
  // --- pickers: style + mood single-select (toggle off on second tap) --------
  let styleId = null, moodId = null, instrumental = false;
  function wireChips(boxId, onPick) {
    const box = document.getElementById(boxId);
    box.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        const already = chip.classList.contains('on');
        box.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('on'); });
        if (!already) chip.classList.add('on');
        onPick(already ? null : chip.dataset.id);
      });
    });
  }
  wireChips('styles', function (id) { styleId = id; });
  wireChips('moods', function (id) { moodId = id; });
  document.querySelectorAll('#vocals .chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      document.querySelectorAll('#vocals .chip').forEach(function (c) { c.classList.remove('on'); });
      chip.classList.add('on');
      instrumental = chip.dataset.id === 'instrumental';
    });
  });

  // --- generate + poll ---------------------------------------------------------
  const genBtn = document.getElementById('generate');
  const workingEl = document.getElementById('working');
  const workingText = document.getElementById('working-text');
  const resultEl = document.getElementById('result');
  let polling = null;

  const WORKING_LINES = [
    'Composing your song…',
    'Humming a melody…',
    'Tuning the instruments…',
    'Teaching the band your song…',
    'Adding the finishing sparkle…',
  ];

  genBtn.addEventListener('click', async function () {
    const prompt = document.getElementById('idea').value.trim();
    if (!prompt && !styleId && !moodId) {
      setStatus('Pick a style or a mood — or tell me what your song is about! 🎵', 'blocked');
      return;
    }
    genBtn.disabled = true;
    resultEl.hidden = true;
    setStatus('');
    try {
      const res = await fetch('/v1/music', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt || undefined,
          style: styleId || undefined,
          mood: moodId || undefined,
          instrumental: instrumental,
        }),
      });
      const data = await res.json().catch(function () { return {}; });
      if (res.ok && data.ok) {
        startPolling(data.jobId);
      } else {
        const f = friendlyError(res, data);
        setStatus(f.text, f.cls);
        genBtn.disabled = false;
      }
    } catch {
      setStatus('Could not reach the server. Check your connection and try again.', 'error');
      genBtn.disabled = false;
    }
  });

  function startPolling(jobId) {
    let line = 0;
    workingEl.hidden = false;
    workingText.textContent = WORKING_LINES[0];
    const spin = setInterval(function () {
      line = (line + 1) % WORKING_LINES.length;
      workingText.textContent = WORKING_LINES[line];
    }, 8000);

    polling = setInterval(async function () {
      try {
        const res = await fetch('/v1/music/job/' + jobId);
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) throw new Error('gone');
        if (data.state === 'working') return;
        clearInterval(polling); clearInterval(spin);
        workingEl.hidden = true;
        genBtn.disabled = false;
        if (data.state === 'done') {
          showResult(data.tracks || []);
          setStatus((data.tracks && data.tracks.length > 1)
            ? 'Two songs came out — listen to both and keep your favorite (or both)! 🎉'
            : 'Your song is ready! 🎉');
        } else {
          setStatus(data.message || 'The music maker had trouble — try again!', data.state === 'blocked' ? 'blocked' : 'error');
        }
      } catch {
        clearInterval(polling); clearInterval(spin);
        workingEl.hidden = true;
        genBtn.disabled = false;
        setStatus('Lost track of your song — please try again.', 'error');
      }
    }, 4000);
  }

  // --- result players + save/publish ---------------------------------------------
  function showResult(tracks) {
    resultEl.innerHTML = '';
    resultEl.hidden = false;
    tracks.forEach(function (track, i) {
      const card = document.createElement('div');
      card.className = 'songcard' + (i > 0 ? ' another' : '');
      const h = document.createElement('h3');
      h.textContent = tracks.length > 1
        ? '🎵 Song ' + (i + 1) + ' — ' + track.title
        : '🎵 ' + track.title;
      card.appendChild(h);
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = trackMeta(track);
      card.appendChild(meta);
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = '/v1/music/' + track.id + '/audio';
      if (i === 0) {
        audio.autoplay = true;
        audio.play().catch(function () {});
      } else {
        audio.preload = 'none';
      }
      card.appendChild(audio);
      if (track.lyrics) {
        const ly = document.createElement('div');
        ly.className = 'lyrics';
        ly.textContent = track.lyrics;
        card.appendChild(ly);
      }
      const actions = document.createElement('div');
      actions.className = 'actions';
      const save = document.createElement('button');
      save.className = 'cta';
      save.textContent = '💾 Save to My music';
      const pub = document.createElement('button');
      pub.className = 'cta publish';
      pub.textContent = '📻 Publish to the library';
      actions.appendChild(save); actions.appendChild(pub);
      card.appendChild(actions);
      save.addEventListener('click', function () { finishTrack(track.id, 'keep', save, pub); });
      pub.addEventListener('click', function () { finishTrack(track.id, 'publish', save, pub); });
      resultEl.appendChild(card);
    });
  }

  async function finishTrack(id, action, save, pub) {
    save.disabled = true; pub.disabled = true;
    try {
      const res = await fetch('/v1/music/' + id + '/' + action, { method: 'POST' });
      const data = await res.json().catch(function () { return {}; });
      if (res.ok && data.ok) {
        setStatus(action === 'publish'
          ? 'Published! Hear it in the <a href="/music/library">📻 library</a>.'
          : 'Saved! Find it in <a href="/music/mine">💿 My music</a>.');
        return;
      }
      const f = friendlyError(res, data);
      setStatus(f.text, f.cls);
      save.disabled = false; pub.disabled = false;
    } catch {
      setStatus('Could not reach the server. Check your connection and try again.', 'error');
      save.disabled = false; pub.disabled = false;
    }
  }
  `;
}

