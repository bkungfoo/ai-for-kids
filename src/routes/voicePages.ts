import { Router, type Request, type Response } from 'express';
import { currentUniverse, requirePageAuth } from '../middleware/requireAuth.js';
import { shell } from './pages.js';
import { VOICES_BG_CHAT } from './wallpapers.js';

/**
 * The Voices section, structured like Music and Storybooks: a hub (/voice)
 * with three tiles — Create new voice, My voices, Browse the library — plus
 * the maker page where a kid records ~15 seconds of speech, clones it, tests
 * it, and saves or publishes it.
 */
export const voicePagesRouter = Router();

for (const path of ['/voice', '/voice/new', '/voice/mine', '/voice/library']) {
  voicePagesRouter.get(path, requirePageAuth);
}
// Public-universe accounts are storybooks-only: bounce them home.
voicePagesRouter.use('/voice', (req, res, next) => {
  if (currentUniverse(req) === 'public') {
    res.redirect('/');
    return;
  }
  next();
});

const VOICES_CSS = `<style>
  /* People-chatting wallpaper behind every Voices page; content stays in
     opaque cards on top. */
  body { background: #ffffff url("data:image/svg+xml,${encodeURIComponent(VOICES_BG_CHAT)}") repeat;
    background-size: 380px; }
  /* The shell header defaults to white text (for its dark gradient); on this
     light background, darken it so the back arrow + sign-out stay visible —
     same pattern as the Music section. */
  header { color: #35566b; }
  .back, .signout { color: #35566b; }
  .signout { border-color: rgba(53,86,107,.45); }
  .signout:hover { background: rgba(53,86,107,.10); }
  .card { background: #ffffff; box-shadow: 0 18px 40px rgba(16,42,54,.30); }
  main { width: min(94vw, 860px); }
  .vtiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  @media (max-width: 620px) { .vtiles { grid-template-columns: 1fr; } }
  .vtile { display: flex; flex-direction: column; gap: 4px; padding: 22px; border-radius: 14px;
    text-decoration: none; color: #102a36; background: #f1f7fa; border: 1px solid #dceaf0;
    transition: transform .08s, box-shadow .12s; }
  .vtile:hover { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(16,42,54,.16); }
  .vtile-icon { font-size: 34px; }
  .vtile-title { font-weight: 700; font-size: 18px; }
  .vtile-blurb { font-size: 14px; color: #5a7785; }
  .group-label { display: block; font-size: 13px; font-weight: 800; color: #4a6c7c;
    margin: 18px 0 4px; text-transform: uppercase; letter-spacing: .5px; }
  input#vname { width: 100%; padding: 11px 13px; font-size: 15px; font-family: inherit;
    border: 1px solid #c9dbe4; border-radius: 10px; outline: none; }
  input#vname:focus { border-color: #2c6e8f; box-shadow: 0 0 0 3px rgba(44,110,143,.18); }
  button.cta { padding: 12px 18px; font-size: 15px; font-weight: 700; color: #fff;
    background: #2c6e8f; border: none; border-radius: 10px; cursor: pointer; }
  button.cta:hover { background: #245d79; }
  button.cta:disabled { opacity: .55; cursor: progress; }
  .cta.rec { background: #b3402e; }
  .cta.rec:hover { background: #9c3524; }
  .cta.publish { background: #7a5aa0; }
  .cta.publish:hover { background: #684b8a; }
  .linkbtn { background: none; border: none; color: #2c6e8f; font-size: 13px;
    font-weight: 700; cursor: pointer; padding: 4px 2px; text-decoration: underline; }
  .linkbtn.danger { color: #8a1c1c; }
  .recrow { display: flex; align-items: center; gap: 14px; margin-top: 10px; flex-wrap: wrap; }
  .rectimer { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; color: #102a36; }
  .rectimer.live { color: #b3402e; }
  .rechint { font-size: 13px; color: #5a7785; }
  .readprompt { margin-top: 14px; border: 1px dashed #c9b46a; background: #fdf9ec;
    border-radius: 12px; padding: 12px 15px; font-family: Georgia, 'Times New Roman', serif;
    font-size: 16px; line-height: 1.65; color: #4a3d20; }
  .readprompt .rp-label { display: block; font-family: system-ui, sans-serif; font-size: 12px;
    font-weight: 800; color: #8a6d1f; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
  .rp-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin: 2px 0 10px; }
  .rp-tab { font-family: system-ui, sans-serif; font-size: 13px; font-weight: 700;
    color: #6d5518; background: #fff; border: 2px solid #e0c98a; border-radius: 999px;
    padding: 6px 12px; cursor: pointer; }
  .rp-tab:hover { border-color: #c9a63f; }
  .rp-tab.on { background: #f7e6b0; border-color: #c9a63f; }
  .status { margin-top: 12px; font-size: 14px; min-height: 20px; }
  .status.error { color: #8a1c1c; }
  .status.blocked { color: #8a5a00; }
  .working { display: flex; align-items: center; gap: 10px; margin-top: 14px;
    font-size: 15px; font-weight: 600; color: #2c6e8f; }
  .mic-anim { font-size: 22px; display: inline-block; animation: vbob 1s ease-in-out infinite alternate; }
  @keyframes vbob { from { transform: translateY(2px); } to { transform: translateY(-4px); } }
  .testbox { margin-top: 18px; border: 1px solid #dceaf0; background: #f6fafc;
    border-radius: 14px; padding: 16px; }
  .testbox h3 { margin: 0 0 6px; font-size: 17px; }
  textarea.saytext { width: 100%; min-height: 64px; padding: 11px 13px; font-size: 15px;
    font-family: inherit; border: 1px solid #c9dbe4; border-radius: 10px; outline: none; resize: vertical; }
  textarea.saytext:focus { border-color: #2c6e8f; box-shadow: 0 0 0 3px rgba(44,110,143,.18); }
  .testrow { display: flex; gap: 10px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
  .finishrow { display: flex; gap: 12px; margin-top: 20px; padding-top: 14px;
    border-top: 1px dashed #d5e2e9; flex-wrap: wrap; }
  .voicerow { border: 1px solid #dceaf0; background: #f6fafc; border-radius: 12px;
    padding: 12px 14px; margin-top: 10px; }
  .voicerow .v-name { font-weight: 800; font-size: 15px; }
  .voicerow .v-meta { font-size: 12px; color: #5a7785; margin-top: 1px; }
  .voicerow .v-say { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
  .voicerow .v-say input { flex: 1; min-width: 180px; padding: 8px 11px; font-size: 14px;
    font-family: inherit; border: 1px solid #c9dbe4; border-radius: 8px; outline: none; }
  .voicerow .v-say .cta { padding: 8px 14px; font-size: 13px; }
  .voicerow .v-actions { display: flex; gap: 12px; margin-top: 8px; flex-wrap: wrap; }
  .pubbadge { display: inline-block; font-size: 11px; font-weight: 700; color: #4c2a73;
    background: #e9def7; border-radius: 999px; padding: 2px 8px; margin-left: 6px; }
  .empty { color: #5a7785; font-size: 14px; margin-top: 8px; }
</style>`;

/**
 * The optional read-aloud passages: friendly, child-safe, and deliberately
 * packed with varied syllables — long/short vowels, diphthongs, th/ch/sh/wh,
 * buzzes, plosives, blends and counting — so the clone hears a wide sweep of
 * the kid's speech sounds. The kid picks whichever sounds most fun.
 */
const READING_PROMPTS = [
  {
    id: 'hello',
    label: '👋 My own voice',
    text:
      'Hello, hello! This is my very own voice. The quick brown fox jumps over the lazy dog, ' +
      'while seven silly zebras zoom past purple mountains. I love crunchy apples, fluffy clouds, ' +
      'and jolly jumping frogs. Whales whistle, dragons giggle, and tiny turtles tiptoe through ' +
      'the garden. Let’s count together: one, two, three, four, five — hooray! Yesterday I saw a ' +
      'shiny rainbow after the rain. Thunder rumbles, bees buzz, and choo-choo goes the train. ' +
      'Splish-splash go my boots in a puddle, and that is the end — thank you for listening!',
  },
  {
    id: 'space',
    label: '🚀 Space trip',
    text:
      'Three, two, one — blast off! My shiny rocket zooms past the moon while sparkling stars ' +
      'twinkle and glow. Hello, friendly aliens! Do you munch cheese, chew jelly, or slurp fizzy ' +
      'juice? Whoosh goes a comet, boom goes the thunder-drum, and my puppy barks hooray. Quick, ' +
      'jump over the wobbly space bridge — splish, splash — we made it home in time for supper!',
  },
  {
    id: 'jungle',
    label: '🦁 Jungle picnic',
    text:
      'Welcome to my jungle picnic! The cheeky monkeys giggle, the shy giraffe nibbles green ' +
      'leaves, and a roaring lion sings a silly song. Yum, yum — we share peaches, pretzels, and ' +
      'blueberry pie. Can you hop like a frog? Boing, boing! Can you slither like a snake? ' +
      'Sss! Then we drum on buckets — rat-a-tat-tat — and wave goodbye until tomorrow.',
  },
];

/** Shared client helpers (status line + friendly errors + audio playback). */
function voicesSharedJs(): string {
  return `
  function friendlyError(res, data) {
    if (res.status === 401) return { text: 'Your session ended. <a href="/login">Sign in again</a>.', cls: 'error' };
    if (res.status === 501) return { text: "The voice maker isn't set up yet. Ask a grown-up to add the key.", cls: 'error' };
    if (res.status === 403 && data && data.blocked) return { text: data.message || "Let's keep it friendly!", cls: 'blocked' };
    if (res.status === 422 && data && data.error) return { text: data.error, cls: 'blocked' };
    if (res.status === 503 && data && data.error) return { text: data.error, cls: 'blocked' };
    return { text: (data && data.error) || 'Something went wrong — please try again!', cls: 'error' };
  }
  function setStatus(el, html, cls) {
    el.innerHTML = html || '';
    el.className = 'status' + (cls ? ' ' + cls : '');
  }
  let currentAudio = null;
  function playBlob(blob) {
    if (currentAudio) { try { currentAudio.pause(); } catch {} }
    currentAudio = new Audio(URL.createObjectURL(blob));
    currentAudio.play().catch(() => {});
  }
  // POST text to a voice's speak endpoint and play the mp3 that comes back.
  async function speak(voiceId, text, statusEl, btn) {
    if (!text.trim()) { setStatus(statusEl, 'Type some words to say first! ✏️', 'blocked'); return; }
    btn.disabled = true;
    setStatus(statusEl, '🗣️ Getting the words ready…');
    try {
      const res = await fetch('/v1/voices/' + voiceId + '/speak', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: text }),
      });
      if (res.ok) {
        playBlob(await res.blob());
        setStatus(statusEl, '');
      } else {
        const data = await res.json().catch(() => ({}));
        const f = friendlyError(res, data);
        setStatus(statusEl, f.text, f.cls);
      }
    } catch {
      setStatus(statusEl, 'Could not reach the server. Check your connection and try again.', 'error');
    }
    btn.disabled = false;
  }
  // A voice row for the shelf/library pages.
  function voiceRow(v, isMine, reload, statusEl) {
    const row = document.createElement('div');
    row.className = 'voicerow';
    const name = document.createElement('div');
    name.className = 'v-name';
    name.textContent = '🎙️ ' + v.name;
    if (v.status === 'published') {
      const b = document.createElement('span');
      b.className = 'pubbadge';
      b.textContent = 'In the library';
      name.appendChild(b);
    }
    row.appendChild(name);
    const say = document.createElement('div');
    say.className = 'v-say';
    const input = document.createElement('input');
    input.maxLength = 300;
    input.placeholder = 'Type words for this voice to say…';
    // Ready-to-play default: press Play right away, or click the box —
    // the first click selects it all so typing replaces the whole line.
    input.value = 'Hi! I am ' + v.name + ' and this is my amazing new voice. Nice to meet you!';
    input.addEventListener('focus', () => {
      if (input.dataset.touched) return;
      input.dataset.touched = '1';
      input.select();
    });
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'cta';
    play.textContent = '▶ Play';
    play.addEventListener('click', () => speak(v.id, input.value, statusEl, play));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') play.click(); });
    say.appendChild(input);
    say.appendChild(play);
    row.appendChild(say);
    if (!v.mine) {
      const actions = document.createElement('div');
      actions.className = 'v-actions';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'linkbtn';
      copy.textContent = '📋 Save a copy to my voices';
      copy.addEventListener('click', async () => {
        copy.disabled = true;
        try {
          const res = await fetch('/v1/voices/' + v.id + '/clone', { method: 'POST' });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) setStatus(statusEl, '📋 Saved! Find it in <a href="/voice/mine">My voices</a>.');
          else { const f = friendlyError(res, data); setStatus(statusEl, f.text, f.cls); copy.disabled = false; }
        } catch {
          setStatus(statusEl, 'Could not reach the server. Check your connection and try again.', 'error');
          copy.disabled = false;
        }
      });
      actions.appendChild(copy);
      row.appendChild(actions);
    }
    if (isMine) {
      const actions = document.createElement('div');
      actions.className = 'v-actions';
      const pub = document.createElement('button');
      pub.type = 'button';
      pub.className = 'linkbtn';
      pub.textContent = v.status === 'published' ? 'Take out of the library' : '📚 Publish to library';
      pub.addEventListener('click', async () => {
        pub.disabled = true;
        await fetch('/v1/voices/' + v.id + '/' + (v.status === 'published' ? 'unpublish' : 'publish'), { method: 'POST' });
        reload();
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'linkbtn danger';
      del.textContent = '✕ Delete';
      del.addEventListener('click', async () => {
        if (!confirm('Delete the voice “' + v.name + '”? This cannot be undone.')) return;
        del.disabled = true;
        await fetch('/v1/voices/' + v.id, { method: 'DELETE' });
        reload();
      });
      actions.appendChild(pub);
      actions.appendChild(del);
      row.appendChild(actions);
    }
    return row;
  }
  async function fillShelf(url, holderId, isMine, emptyHtml, reload) {
    const holder = document.getElementById(holderId);
    const statusEl = document.getElementById('status');
    try {
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { const f = friendlyError(res, data); setStatus(statusEl, f.text, f.cls); return; }
      holder.innerHTML = '';
      if (!data.voices.length) { holder.innerHTML = '<div class="empty">' + emptyHtml + '</div>'; return; }
      for (const v of data.voices) holder.appendChild(voiceRow(v, isMine && v.mine !== false, reload, statusEl));
    } catch {
      setStatus(statusEl, 'Could not reach the server. Check your connection and try again.', 'error');
    }
  }
  `;
}

// --- The Voices hub ---------------------------------------------------------------
voicePagesRouter.get('/voice', (_req: Request, res: Response) => {
  res.type('html').send(
    shell({
      title: 'Voices — Harbor House',
      back: true,
      body: `<div class="card">
        <h1>🎙️ Voices</h1>
        <p class="sub">Record your voice, teach it to the computer, and make it say fun things.</p>
        <div class="vtiles">
          <a class="vtile" href="/voice/new">
            <span class="vtile-icon" aria-hidden="true">✨</span>
            <span class="vtile-title">Create new voice</span>
            <span class="vtile-blurb">Talk for a bit and make a voice that sounds like you</span>
          </a>
          <a class="vtile" href="/voice/mine">
            <span class="vtile-icon" aria-hidden="true">🗣️</span>
            <span class="vtile-title">My voices</span>
            <span class="vtile-blurb">Play with the voices you saved</span>
          </a>
          <a class="vtile" href="/voice/library">
            <span class="vtile-icon" aria-hidden="true">📚</span>
            <span class="vtile-title">Browse the library</span>
            <span class="vtile-blurb">Try the voices everyone published</span>
          </a>
        </div>
      </div>`,
      head: VOICES_CSS,
    }),
  );
});

// --- Create new voice --------------------------------------------------------------
voicePagesRouter.get('/voice/new', (_req: Request, res: Response) => {
  res.type('html').send(
    shell({
      title: 'Create new voice — Harbor House',
      back: { href: '/voice', label: 'Voices' },
      body: `<div class="card">
        <h1>✨ Create new voice</h1>
        <p class="sub">Give your voice a name, then talk for at least 15 seconds so the computer can learn how you sound.</p>
        <p class="sub" id="replace-note" hidden style="color:#8a5a00;font-weight:600"></p>

        <label class="group-label" for="vname">What should this voice be called?</label>
        <input id="vname" maxlength="40" placeholder="Captain Me, Robot Sam, My Voice…" />

        <label class="group-label">Record your voice</label>
        <div class="recrow">
          <button class="cta rec" id="recbtn" type="button">🎙️ Start recording</button>
          <span class="rectimer" id="rectimer">0:00</span>
          <span class="rechint" id="rechint">You'll need at least 15 seconds of talking.</span>
        </div>
        <audio id="preview" controls style="display:none; width:100%; margin-top:10px;"></audio>

        <div class="readprompt" id="readprompt">
          <span class="rp-label">Need something to say? Pick a story and read it out loud!</span>
          <div class="rp-tabs" id="rp-tabs">
            ${READING_PROMPTS.map(
              (p, i) =>
                `<button type="button" class="rp-tab${i === 0 ? ' on' : ''}" data-rp="${p.id}">${p.label}</button>`,
            ).join('')}
          </div>
          <div id="rp-text">${READING_PROMPTS[0]!.text}</div>
        </div>

        <div class="recrow">
          <button class="cta" id="makebtn" type="button" disabled>🧠 Make my voice!</button>
        </div>
        <div class="working" id="working" style="display:none">
          <span class="mic-anim">🎙️</span><span>Teaching the computer your voice… this takes a moment!</span>
        </div>

        <div class="testbox" id="testbox" style="display:none">
          <h3>🎉 Your voice is ready — try it out!</h3>
          <p class="sub" style="margin:0 0 8px">Type anything and press play. Try it as many times as you like.</p>
          <textarea class="saytext" id="saytext" maxlength="300" placeholder="Hello! I am a talking computer that sounds like me…"></textarea>
          <div class="testrow">
            <button class="cta" id="playbtn" type="button">▶ Play</button>
          </div>
          <div class="finishrow">
            <button class="cta" id="savebtn" type="button">💾 Save to my voices</button>
            <button class="cta publish" id="pubbtn" type="button">📚 Publish to library</button>
            <button class="linkbtn danger" id="discardbtn" type="button">✕ Start over</button>
          </div>
        </div>

        <div id="status" class="status" role="status" aria-live="polite"></div>
      </div>`,
      head: VOICES_CSS,
    }) + `<script>${voicesSharedJs()}${makerJs()}</script>`,
  );
});

/** The maker page's client logic: record -> clone -> test -> save/publish. */
function makerJs(): string {
  return `
  (() => {
    const MIN_SECONDS = 15;
    // One voice per account: warn when a new recording will replace the old
    // voice everywhere (library + any storybooks it narrates).
    fetch('/v1/voices').then((r) => r.json()).then((d) => {
      if (d && d.ok && d.voices && d.voices.length) {
        const note = document.getElementById('replace-note');
        note.textContent = '⚠️ You already have a voice called “' + d.voices[0].name +
          '”. Making a new one replaces it — in the library too, and any storybook it reads goes back to the storybook narrator.';
        note.hidden = false;
      }
    }).catch(() => {});
    // Reading-prompt picker: swap the passage when a story chip is chosen.
    const RP = ${JSON.stringify(Object.fromEntries(READING_PROMPTS.map((p) => [p.id, p.text])))};
    document.getElementById('rp-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.rp-tab');
      if (!tab) return;
      document.querySelectorAll('.rp-tab').forEach((t) => t.classList.toggle('on', t === tab));
      document.getElementById('rp-text').textContent = RP[tab.dataset.rp] || '';
    });
    const MAX_SECONDS = 60;
    const statusEl = document.getElementById('status');
    const recbtn = document.getElementById('recbtn');
    const timerEl = document.getElementById('rectimer');
    const hintEl = document.getElementById('rechint');
    const preview = document.getElementById('preview');
    const makebtn = document.getElementById('makebtn');
    const working = document.getElementById('working');
    const testbox = document.getElementById('testbox');

    let recorder = null;
    let chunks = [];
    let recordedBlob = null;
    let startedAt = 0;
    let tick = null;
    let voice = null; // { id, name } once cloned

    function fmt(s) { return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }

    async function startRecording() {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setStatus(statusEl, 'I need the microphone to hear you — ask a grown-up to allow it, then try again. 🎙️', 'blocked');
        return;
      }
      chunks = [];
      recordedBlob = null;
      preview.style.display = 'none';
      makebtn.disabled = true;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorder.addEventListener('dataavailable', (e) => { if (e.data.size) chunks.push(e.data); });
      recorder.addEventListener('stop', () => {
        stream.getTracks().forEach((t) => t.stop());
        const secs = (Date.now() - startedAt) / 1000;
        recordedBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        preview.src = URL.createObjectURL(recordedBlob);
        preview.style.display = 'block';
        timerEl.classList.remove('live');
        recbtn.textContent = '🎙️ Record again';
        recbtn.disabled = false;
        if (secs < MIN_SECONDS) {
          setStatus(statusEl, 'That was only ' + Math.floor(secs) + ' seconds — talk for at least ' + MIN_SECONDS + ' so the computer can really learn your voice!', 'blocked');
          makebtn.disabled = true;
        } else {
          setStatus(statusEl, 'Nice recording! Listen back if you like, then press “Make my voice!” 🎧');
          makebtn.disabled = false;
        }
      });
      recorder.start();
      startedAt = Date.now();
      timerEl.classList.add('live');
      recbtn.textContent = '⏹ Stop';
      hintEl.textContent = 'Keep talking! The reading below helps the computer hear lots of sounds.';
      setStatus(statusEl, '');
      tick = setInterval(() => {
        const secs = (Date.now() - startedAt) / 1000;
        timerEl.textContent = fmt(secs);
        if (secs >= MIN_SECONDS) hintEl.textContent = 'That\\'s enough — keep going or press Stop!';
        if (secs >= MAX_SECONDS) stopRecording();
      }, 250);
    }

    function stopRecording() {
      if (tick) { clearInterval(tick); tick = null; }
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    }

    recbtn.addEventListener('click', () => {
      if (recorder && recorder.state === 'recording') stopRecording();
      else startRecording();
    });

    makebtn.addEventListener('click', async () => {
      const name = document.getElementById('vname').value.trim();
      if (!name) { setStatus(statusEl, 'Give your voice a name first! ✏️', 'blocked'); return; }
      if (!recordedBlob) { setStatus(statusEl, 'Record your voice first! 🎙️', 'blocked'); return; }
      makebtn.disabled = true;
      recbtn.disabled = true;
      working.style.display = 'flex';
      setStatus(statusEl, '');
      try {
        const buf = await recordedBlob.arrayBuffer();
        let bin = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) {
          bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        const res = await fetch('/v1/voices/clone', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: name, audioBase64: btoa(bin), mimeType: recordedBlob.type || 'audio/webm' }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          voice = data.voice;
          testbox.style.display = 'block';
          testbox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          setStatus(statusEl, '');
        } else {
          const f = friendlyError(res, data);
          setStatus(statusEl, f.text, f.cls);
          makebtn.disabled = false;
        }
      } catch {
        setStatus(statusEl, 'Could not reach the server. Check your connection and try again.', 'error');
        makebtn.disabled = false;
      }
      working.style.display = 'none';
      recbtn.disabled = false;
    });

    document.getElementById('playbtn').addEventListener('click', function () {
      if (voice) speak(voice.id, document.getElementById('saytext').value, statusEl, this);
    });

    document.getElementById('savebtn').addEventListener('click', async function () {
      if (!voice) return;
      this.disabled = true;
      const res = await fetch('/v1/voices/' + voice.id + '/save', { method: 'POST' });
      if (res.ok) setStatus(statusEl, '💾 Saved! Find it in <a href="/voice/mine">My voices</a>.');
      else { setStatus(statusEl, 'Could not save — try again!', 'error'); this.disabled = false; }
    });

    document.getElementById('pubbtn').addEventListener('click', async function () {
      if (!voice) return;
      this.disabled = true;
      const res = await fetch('/v1/voices/' + voice.id + '/publish', { method: 'POST' });
      if (res.ok) setStatus(statusEl, '📚 Published! Everyone can try it in <a href="/voice/library">the library</a>.');
      else { setStatus(statusEl, 'Could not publish — try again!', 'error'); this.disabled = false; }
    });

    document.getElementById('discardbtn').addEventListener('click', async function () {
      if (voice) { try { await fetch('/v1/voices/' + voice.id, { method: 'DELETE' }); } catch {} }
      location.reload();
    });
  })();
  `;
}

// --- My voices --------------------------------------------------------------------
voicePagesRouter.get('/voice/mine', (_req: Request, res: Response) => {
  res.type('html').send(
    shell({
      title: 'My voices — Harbor House',
      back: { href: '/voice', label: 'Voices' },
      body: `<div class="card">
        <h1>🗣️ My voices</h1>
        <p class="sub">Your saved voices — or <a href="/voice/new">✨ create a new one</a>.</p>
        <div id="myvoices"></div>
        <div id="status" class="status" role="status" aria-live="polite"></div>
      </div>`,
      head: VOICES_CSS,
    }) + `<script>${voicesSharedJs()}
      function reload() { fillShelf('/v1/voices', 'myvoices', true, 'Nothing saved yet — <a href="/voice/new">create your first voice!</a>', reload); }
      reload();
    </script>`,
  );
});

// --- The voice library -------------------------------------------------------------
voicePagesRouter.get('/voice/library', (_req: Request, res: Response) => {
  res.type('html').send(
    shell({
      title: 'Voice library — Harbor House',
      back: { href: '/voice', label: 'Voices' },
      body: `<div class="card">
        <h1>📚 Voice library</h1>
        <p class="sub">Voices everyone published. Want to add yours?
          <a href="/voice/new">✨ Create a new voice</a>.</p>
        <div id="library"></div>
        <div id="status" class="status" role="status" aria-live="polite"></div>
      </div>`,
      head: VOICES_CSS,
    }) + `<script>${voicesSharedJs()}
      fillShelf('/v1/voices/library', 'library', false, 'The library is quiet — <a href="/voice/new">publish the first voice!</a>', function () {});
    </script>`,
  );
});
