#!/usr/bin/env node
/**
 * Deterministic UI design-symmetry checks — the mechanical half of the
 * ui-design-reviewer agent (.claude/agents/ui-design-reviewer.md).
 *
 * Runs in milliseconds with zero LLM cost. The agent runs this FIRST; it only
 * spends model tokens when a check fails (diagnose/fix), when a new UI
 * pattern needs a new rule here, or when asked for a full aesthetic pass.
 *
 * The rule TABLES below are the editable policy; the agent maintains them as
 * the design canon evolves. Exit code 0 = all checks pass.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const pages = read('src/routes/pages.ts');
const music = read('src/routes/musicPages.ts');

const failures = [];
function check(id, ok, detail) {
  if (!ok) failures.push(`[${id}] ${detail}`);
}
function lineOf(src, needle) {
  const i = src.indexOf(needle);
  return i < 0 ? '?' : src.slice(0, i).split('\n').length;
}

// ---------------------------------------------------------------------------
// RULE TABLES (edit these when the canon changes)
// ---------------------------------------------------------------------------

// R1: these action labels must be pill buttons (className assigned 'readbtn…'
// within the 300 chars before the label is set).
const PILL_LABELS = [
  "'🖌️ Change the cover'",
  "'🖌️ Change this picture'",
  "'✏️ Edit text'",
  "'✍️ Keep writing the story'",
  "'✕ Remove background music'",
];

// R3: canonical order of appendChild calls on the reader's left story page.
const LEFT_PAGE_ORDER = [
  'left.appendChild(readRow(',
  'left.appendChild(wordsEditControls(',
  "left.appendChild(musicControls('page'",
  'left.appendChild(pageToolsControls(',
];

// R6: generate-flows that must open a floating dialog (never reshape pages).
const DIALOG_FLOWS = [
  "openTaskDialog('🖌️ Change the cover')",
  "openTaskDialog('🖌️ Change this picture')",
];

// R10: hex colors permitted in the music maker's themed CSS (everything else
// must come from the per-mode variables). Update deliberately.
const MUSIC_CSS_HEX_ALLOWLIST = new Set([
  '#2c6e8f', '#245d79', // .cta blue (no mode variable exists for CTAs)
  '#7a5aa0', '#684b8a', // .cta.publish purple
  '#fff', '#ffffff',    // CTA text
]);

// ---------------------------------------------------------------------------
// Reader checks (pages.ts)
// ---------------------------------------------------------------------------

// R2: centered rows — the containers that hold standalone pills must center.
check('R2-readrow', /\.readrow\s*\{[^}]*justify-content:\s*center/.test(pages),
  '.readrow must center its content (justify-content: center)');
check('R2-regen', /\.regen\s*\{[^}]*text-align:\s*center/.test(pages),
  '.regen must center its toggle pill (text-align: center)');
check('R2-regen-form', /\.regen form\s*\{[^}]*text-align:\s*left/.test(pages),
  '.regen form must restore left-aligned text inside expanded forms');

// R1: same role => same clothes (pill labels wear .readbtn).
for (const label of PILL_LABELS) {
  const i = pages.indexOf(`textContent = ${label}`);
  if (i < 0) {
    failures.push(`[R1] expected button label ${label} not found in pages.ts (update PILL_LABELS if it was renamed)`);
    continue;
  }
  const before = pages.slice(Math.max(0, i - 300), i);
  check('R1', /className = 'readbtn/.test(before),
    `${label} (pages.ts:${lineOf(pages, `textContent = ${label}`)}) must be a .readbtn pill like its siblings`);
}

// R3: left-page button order (Read to me -> Edit text -> music add -> tools).
{
  let pos = -1;
  let ok = true;
  for (const step of LEFT_PAGE_ORDER) {
    const next = pages.indexOf(step);
    if (next < 0 || next < pos) { ok = false; break; }
    pos = next;
  }
  check('R3', ok, `left-page appendChild order must be: ${LEFT_PAGE_ORDER.join(' -> ')}`);
}

// R6/R7: layout stability — page wipes only inside render(); generate-flows
// use the floating dialog.
{
  const renderStart = pages.indexOf('function render() {');
  const renderEnd = pages.indexOf('\n  function ', renderStart + 10);
  const renderBlock = pages.slice(renderStart, renderEnd);
  const wipes = [...pages.matchAll(/(left|right)\.innerHTML = ''/g)];
  for (const m of wipes) {
    const inRender = m.index > renderStart && m.index < renderEnd;
    check('R7-wipe', inRender,
      `${m[1]}.innerHTML='' outside render() (pages.ts:${pages.slice(0, m.index).split('\n').length}) — a click must not blank a book page; use openTaskDialog`);
  }
  check('R7-render-sane', renderBlock.includes("left.innerHTML = ''"),
    'render() should still own the page reset (checker assumption broken — update the script)');
}
for (const flow of DIALOG_FLOWS) {
  check('R7-dialog', pages.includes(flow),
    `generate-flow missing its dialog: ${flow} (update DIALOG_FLOWS if the label changed)`);
}
check('R7-modal-css', pages.includes('.music-backdrop {') && pages.includes('.music-modal {'),
  'floating-dialog chrome CSS (.music-backdrop/.music-modal) must exist');

// R8: responsive — portrait stacks vertically with square-ish pages and
// comfortable tap targets; the cover keeps its square box.
{
  // The reader's stacking query is the media block that mentions .book.
  const mqs = [...pages.matchAll(/@media \(max-width: (\d+)px\) \{([\s\S]*?)\n        \}/g)];
  const mq = mqs.find((m) => m[2].includes('.book {'));
  check('R8-mq', !!mq, 'reader must have a max-width media query that stacks .book for portrait');
  if (mq) {
    check('R8-breakpoint', Number(mq[1]) >= 800,
      `stacking breakpoint is ${mq[1]}px — must be >= 800px so side-by-side pages never become tall strips`);
    check('R8-stack', mq[2].includes('flex-direction: column'),
      'portrait must stack the book vertically (text page over picture page)');
    check('R8-square', /min-height:\s*min\(/.test(mq[2]),
      'stacked pages must keep a square-ish shape (min-height: min(..vw, ..px))');
    check('R8-tap', /\.pagetools \.linkbtn\s*\{[^}]*padding/.test(mq[2]),
      'portrait must give .pagetools .linkbtn comfortable tap padding');
  }
  check('R8-cover-square', /\.cover-square\s*\{[^}]*padding-bottom:\s*100%/.test(pages),
    '.cover-square must keep the padding-bottom:100% square box');
}

// ---------------------------------------------------------------------------
// Music maker checks (musicPages.ts)
// ---------------------------------------------------------------------------

// R5: theme safety — the card and modes run on variables; dark modes flip
// native controls too.
check('R5-card-var', /\.card\s*\{[^}]*var\(--card\)/.test(music),
  'music .card must read background from var(--card)');
for (const mode of ['bg-dark', 'bg-purple']) {
  // Slice the rule body up to its closing line (template ${...} interpolations
  // inside the block contain '}' characters, so [^}]* would stop early).
  const start = music.indexOf('body.' + mode + ' {');
  const end = music.indexOf('\n  }', start);
  const body = start >= 0 && end > start ? music.slice(start, end) : '';
  check('R5-mode-vars', body.includes('--card:'),
    `body.${mode} must define its --card variable`);
  check('R5-color-scheme', body.includes('color-scheme: dark'),
    `body.${mode} must set color-scheme: dark for native controls`);
}

// R10: no new hard-coded hexes in the themed CSS (use mode variables).
{
  const cssStart = music.indexOf('const MUSIC_CSS');
  const cssEnd = music.indexOf('</style>`;', cssStart);
  const block = music.slice(cssStart, cssEnd);
  const hexes = [...new Set([...block.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase()))];
  for (const hex of hexes) {
    check('R10', MUSIC_CSS_HEX_ALLOWLIST.has(hex),
      `hard-coded color ${hex} in MUSIC_CSS (musicPages.ts:${lineOf(music, hex)}) — use a mode variable, or add to the allowlist deliberately`);
  }
}

// R2 (music): the background-mode picker exists on every music page.
check('R2-bgmodes', (music.match(/BG_MODES_HTML/g) || []).length >= 5,
  'every music page must include the background-mode picker (BG_MODES_HTML)');

// ---------------------------------------------------------------------------
const unique = [...new Set(failures)];
if (unique.length) {
  console.error(`UI design check: ${unique.length} violation(s)\n`);
  for (const f of unique) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('UI design check: all mechanical checks pass ✓');
