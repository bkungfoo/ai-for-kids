import { Router, type Request, type Response } from 'express';
import { requirePageAuth } from '../middleware/requireAuth.js';
import { MUSIC_MOODS, MUSIC_STYLES } from '../music/options.js';
import { shell } from './pages.js';

/**
 * The kids' music maker page: pick a style and a mood (optional), choose
 * words vs instrumental, add your own idea, hit "Generate music". The song
 * plays in a small audio player when ready, and can be saved to "My music"
 * or published to the shared music library — both shown on this same page.
 */
export const musicPagesRouter = Router();

musicPagesRouter.get('/music', requirePageAuth);

// A bright, happy wallpaper tile: sunny sky, soft clouds, and rainbow notes
// dancing along two wavy staff bands. Self-contained inline SVG — no external
// assets. The wave period divides the tile width, so the tile repeats
// seamlessly.
const MUSIC_BG_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' width='340' height='300' viewBox='0 0 340 300'>` +
  `<defs><linearGradient id='sky' x1='0' y1='0' x2='0' y2='1'>` +
  `<stop offset='0' stop-color='#dff1fd'/><stop offset='0.7' stop-color='#e9f6fb'/>` +
  `<stop offset='1' stop-color='#fdf6df'/></linearGradient></defs>` +
  `<rect width='340' height='300' fill='url(#sky)'/>` +
  // sun with soft rays
  `<g opacity='.55'><circle cx='56' cy='46' r='17' fill='#ffd66e'/>` +
  `<g stroke='#ffd66e' stroke-width='4' stroke-linecap='round'>` +
  `<line x1='56' y1='16' x2='56' y2='24'/><line x1='56' y1='68' x2='56' y2='76'/>` +
  `<line x1='26' y1='46' x2='34' y2='46'/><line x1='78' y1='46' x2='86' y2='46'/>` +
  `<line x1='35' y1='25' x2='41' y2='31'/><line x1='71' y1='61' x2='77' y2='67'/>` +
  `<line x1='77' y1='25' x2='71' y2='31'/><line x1='41' y1='61' x2='35' y2='67'/>` +
  `</g></g>` +
  // clouds
  `<g fill='#ffffff' opacity='.8'>` +
  `<ellipse cx='210' cy='42' rx='30' ry='12'/><ellipse cx='232' cy='36' rx='20' ry='10'/>` +
  `<ellipse cx='190' cy='36' rx='16' ry='9'/>` +
  `<ellipse cx='305' cy='84' rx='24' ry='10'/><ellipse cx='322' cy='79' rx='15' ry='8'/>` +
  `<ellipse cx='105' cy='250' rx='26' ry='10'/><ellipse cx='124' cy='244' rx='16' ry='8'/>` +
  `</g>` +
  // staff band 1 (wavy, seamless: period 85 = 340/4)
  `<g stroke='#7fa8c9' stroke-width='1.6' fill='none' opacity='.5'>` +
  `<path d='M0 112 Q 21 104, 42.5 112 T 85 112 T 127.5 112 T 170 112 T 212.5 112 T 255 112 T 297.5 112 T 340 112'/>` +
  `<path d='M0 122 Q 21 114, 42.5 122 T 85 122 T 127.5 122 T 170 122 T 212.5 122 T 255 122 T 297.5 122 T 340 122'/>` +
  `<path d='M0 132 Q 21 124, 42.5 132 T 85 132 T 127.5 132 T 170 132 T 212.5 132 T 255 132 T 297.5 132 T 340 132'/>` +
  `<path d='M0 142 Q 21 134, 42.5 142 T 85 142 T 127.5 142 T 170 142 T 212.5 142 T 255 142 T 297.5 142 T 340 142'/>` +
  `<path d='M0 152 Q 21 144, 42.5 152 T 85 152 T 127.5 152 T 170 152 T 212.5 152 T 255 152 T 297.5 152 T 340 152'/>` +
  `</g>` +
  // rainbow notes dancing on band 1
  `<g font-family='Georgia, serif' font-weight='bold' opacity='.75'>` +
  `<text x='24' y='128' font-size='26' fill='#e23b3b' transform='rotate(-10 24 128)'>&#9834;</text>` +
  `<text x='92' y='146' font-size='30' fill='#f39a12' transform='rotate(8 92 146)'>&#9835;</text>` +
  `<text x='168' y='122' font-size='24' fill='#3aa657' transform='rotate(-6 168 122)'>&#9833;</text>` +
  `<text x='232' y='142' font-size='28' fill='#2c6e8f' transform='rotate(10 232 142)'>&#9834;</text>` +
  `<text x='298' y='126' font-size='26' fill='#7a5aa0' transform='rotate(-8 298 126)'>&#9835;</text>` +
  `</g>` +
  // staff band 2 (offset phase)
  `<g stroke='#9fb9d4' stroke-width='1.4' fill='none' opacity='.4'>` +
  `<path d='M0 216 Q 21 224, 42.5 216 T 85 216 T 127.5 216 T 170 216 T 212.5 216 T 255 216 T 297.5 216 T 340 216'/>` +
  `<path d='M0 226 Q 21 234, 42.5 226 T 85 226 T 127.5 226 T 170 226 T 212.5 226 T 255 226 T 297.5 226 T 340 226'/>` +
  `<path d='M0 236 Q 21 244, 42.5 236 T 85 236 T 127.5 236 T 170 236 T 212.5 236 T 255 236 T 297.5 236 T 340 236'/>` +
  `<path d='M0 246 Q 21 254, 42.5 246 T 85 246 T 127.5 246 T 170 246 T 212.5 246 T 255 246 T 297.5 246 T 340 246'/>` +
  `<path d='M0 256 Q 21 264, 42.5 256 T 85 256 T 127.5 256 T 170 256 T 212.5 256 T 255 256 T 297.5 256 T 340 256'/>` +
  `</g>` +
  `<g font-family='Georgia, serif' font-weight='bold' opacity='.7'>` +
  `<text x='56' y='250' font-size='26' fill='#3aa657' transform='rotate(9 56 250)'>&#9835;</text>` +
  `<text x='140' y='232' font-size='24' fill='#e23b3b' transform='rotate(-9 140 232)'>&#9834;</text>` +
  `<text x='206' y='252' font-size='28' fill='#7a5aa0' transform='rotate(7 206 252)'>&#9833;</text>` +
  `<text x='272' y='234' font-size='24' fill='#f39a12' transform='rotate(-7 272 234)'>&#9834;</text>` +
  `</g>` +
  // sparkles
  `<g fill='#ffd66e' opacity='.6' font-size='13' font-family='Georgia, serif'>` +
  `<text x='150' y='76'>&#10022;</text><text x='36' y='192'>&#10023;</text>` +
  `<text x='318' y='176'>&#10022;</text><text x='250' y='290'>&#10023;</text>` +
  `</g></svg>`;

/** Sunny-sky mode: light wallpaper + dark header text (like the library mode). */
const MUSIC_MODE_CSS = `<style>
  body { background: #e9f6fb url("data:image/svg+xml,${encodeURIComponent(MUSIC_BG_SVG)}") repeat; color: #16324a; }
  header { color: #35566b; }
  .back, .signout { color: #35566b; }
  .signout { border-color: rgba(53,86,107,.45); }
  .signout:hover { background: rgba(53,86,107,.08); }
</style>`;

const MUSIC_CSS = `<style>
  main { width: min(94vw, 860px); }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 2px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; padding: 8px 13px;
    border: 2px solid #dceaf0; border-radius: 999px; background: #f1f7fa; cursor: pointer;
    font-size: 14px; font-weight: 700; color: #102a36; }
  .chip:hover { border-color: #2c6e8f; }
  .chip.on { border-color: #2c6e8f; background: #dcebf1; box-shadow: 0 0 0 3px rgba(44,110,143,.15); }
  .group-label { display: block; font-size: 13px; font-weight: 800; color: #35566b;
    margin: 18px 0 2px; text-transform: uppercase; letter-spacing: .5px; }
  .group-hint { font-size: 12px; color: #5a7785; font-weight: 400; text-transform: none; letter-spacing: 0; }
  textarea#idea { margin-top: 6px; min-height: 74px; }
  .genrow { display: flex; align-items: center; gap: 14px; margin-top: 18px; }
  .cta.generate { font-size: 17px; padding: 14px 22px; }
  .result { margin-top: 18px; border: 1px solid #dceaf0; background: #f7fbfd;
    border-radius: 14px; padding: 16px; }
  .result h3 { margin: 0 0 4px; font-size: 17px; }
  .result .meta { font-size: 12.5px; color: #5a7785; margin-bottom: 10px; }
  .result audio, .trackrow audio { width: 100%; margin-top: 6px; }
  .result .actions { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
  .cta.publish { background: #7a5aa0; }
  .cta.publish:hover { background: #684b8a; }
  .lyrics { white-space: pre-wrap; font-family: Georgia, serif; font-size: 14px;
    color: #35566b; margin-top: 10px; max-height: 180px; overflow-y: auto;
    border-top: 1px dashed #c4d3da; padding-top: 8px; }
  .shelfhead { font-size: 18px; margin: 26px 0 4px; }
  .trackrow { border: 1px solid #dceaf0; background: #fbfdfe; border-radius: 12px;
    padding: 12px 14px; margin-top: 10px; }
  .trackrow .t-title { font-weight: 800; font-size: 15px; }
  .trackrow .t-meta { font-size: 12px; color: #5a7785; margin-top: 1px; }
  .trackrow .t-actions { display: flex; gap: 12px; margin-top: 6px; flex-wrap: wrap; }
  .t-actions .linkbtn.danger { color: #8a1c1c; }
  .pubbadge { display: inline-block; font-size: 11px; font-weight: 700; color: #2c6e8f;
    background: #dcebf1; border-radius: 999px; padding: 2px 8px; margin-left: 6px; }
  .empty { color: #5a7785; font-size: 14px; margin-top: 8px; }
  .working { display: flex; align-items: center; gap: 10px; margin-top: 16px;
    font-size: 15px; font-weight: 600; color: #2c6e8f; }
  .notes-anim { font-size: 22px; animation: bob 1s ease-in-out infinite alternate; }
  @keyframes bob { from { transform: translateY(2px) rotate(-8deg); } to { transform: translateY(-4px) rotate(8deg); } }
</style>`;

musicPagesRouter.get('/music', (_req: Request, res: Response) => {
  const styleChips = MUSIC_STYLES.map(
    (s) => `<button type="button" class="chip" data-kind="style" data-id="${s.id}">${s.icon} ${s.label}</button>`,
  ).join('');
  const moodChips = MUSIC_MOODS.map(
    (m) => `<button type="button" class="chip" data-kind="mood" data-id="${m.id}">${m.icon} ${m.label}</button>`,
  ).join('');

  res.type('html').send(
    shell({
      title: 'Music — Harbor House',
      back: true,
      body: `<div class="card">
        <h1>🎵 Make music</h1>
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

        <h2 class="shelfhead">💿 My music</h2>
        <div id="mymusic"></div>

        <h2 class="shelfhead">📻 Music library <span class="group-hint">(songs everyone published)</span></h2>
        <div id="library"></div>
      </div>`,
      head: MUSIC_MODE_CSS + MUSIC_CSS,
    }) + `<script>${musicClientJs()}</script>`,
  );
});

function musicClientJs(): string {
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
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
    statusEl.innerHTML = text;
  }

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
  // vocals: always exactly one on
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
          showResult(data.track);
          setStatus('Your song is ready! 🎉');
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

  // --- result player + save/publish ---------------------------------------------
  function trackMeta(t) {
    const bits = [];
    if (t.style) bits.push(t.style);
    if (t.mood) bits.push(t.mood);
    bits.push(t.instrumental ? 'instrumental' : 'with words');
    return bits.join(' · ');
  }

  function showResult(track) {
    resultEl.innerHTML = '';
    resultEl.hidden = false;
    const h = document.createElement('h3');
    h.textContent = '🎵 ' + track.title;
    resultEl.appendChild(h);
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = trackMeta(track);
    resultEl.appendChild(meta);
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.autoplay = true;
    audio.src = '/v1/music/' + track.id + '/audio';
    resultEl.appendChild(audio);
    audio.play().catch(function () {});
    if (track.lyrics) {
      const ly = document.createElement('div');
      ly.className = 'lyrics';
      ly.textContent = track.lyrics;
      resultEl.appendChild(ly);
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
    resultEl.appendChild(actions);

    save.addEventListener('click', function () { finishTrack(track.id, 'keep', save, pub); });
    pub.addEventListener('click', function () { finishTrack(track.id, 'publish', save, pub); });
  }

  async function finishTrack(id, action, save, pub) {
    save.disabled = true; pub.disabled = true;
    try {
      const res = await fetch('/v1/music/' + id + '/' + action, { method: 'POST' });
      const data = await res.json().catch(function () { return {}; });
      if (res.ok && data.ok) {
        setStatus(action === 'publish' ? 'Published! Everyone can hear it in the library. 📻' : 'Saved to My music! 💾');
        loadShelves();
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

  // --- shelves -----------------------------------------------------------------
  function trackRow(t, mineShelf) {
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
        loadShelves();
      });
      actions.appendChild(pubBtn);
      const del = document.createElement('button');
      del.className = 'linkbtn danger';
      del.textContent = '🗑️ Delete';
      del.addEventListener('click', async function () {
        if (!confirm('Delete "' + t.title + '"? This cannot be undone.')) return;
        await fetch('/v1/music/' + t.id, { method: 'DELETE' });
        loadShelves();
      });
      actions.appendChild(del);
      row.appendChild(actions);
    }
    return row;
  }

  async function fillShelf(url, boxId, mineShelf, emptyText) {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok) return;
      const box = document.getElementById(boxId);
      box.innerHTML = '';
      if (!data.tracks.length) {
        const p = document.createElement('p');
        p.className = 'empty';
        p.textContent = emptyText;
        box.appendChild(p);
        return;
      }
      for (const t of data.tracks) box.appendChild(trackRow(t, mineShelf));
    } catch {}
  }

  function loadShelves() {
    fillShelf('/v1/music', 'mymusic', true, 'Nothing saved yet — make your first song!');
    fillShelf('/v1/music/library', 'library', false, 'The library is quiet — publish the first song!');
  }
  loadShelves();
  `;
}
