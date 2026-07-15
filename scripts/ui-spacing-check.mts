/**
 * Rule-based button-spacing check, measured in a real browser (npm run
 * ui-spacing-check). The rule: the vertical gaps between the pill buttons in
 * the action cluster must be IDENTICAL when editing the cover page and when
 * editing a story page — pages must never invent their own spacing.
 *
 * Boots the server with a throwaway data dir (the live data/ is untouched),
 * seeds a one-page draft book, and measures rendered button positions with
 * the playwright chromium headless shell. Install the browser once with:
 *   npx playwright-core install chromium-headless-shell
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = 5199;
const GAP_MIN = 6, GAP_MAX = 14; // px — the shared .readrow rhythm

function findChromium(): string {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = path.join(process.env.HOME ?? '', '.cache', 'ms-playwright');
  try {
    for (const dir of readdirSync(cache)) {
      if (dir.startsWith('chromium_headless_shell-')) {
        return path.join(cache, dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
      }
    }
  } catch {}
  console.error('ui-spacing-check: chromium headless shell not found.');
  console.error('Install it once with: npx playwright-core install chromium-headless-shell');
  process.exit(2);
}
const chromiumPath = findChromium();

// Seed a draft book into a throwaway data dir (the store resolves data/
// against the cwd, so chdir BEFORE importing it).
const workDir = mkdtempSync(path.join(tmpdir(), 'ui-spacing-'));
process.chdir(workDir);
const store = await import(pathToFileURL(path.join(REPO, 'src', 'books', 'store.ts')).href);
const px = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5CYII=';
const book = await store.createBook('Spacing Check', ['Test'], null, 'a test cover', undefined, 'HarborHouse');
await store.addPage(book.id, {
  text: 'A page for measuring buttons.',
  imagePrompt: 'test picture',
  image: { mimeType: 'image/png', dataBase64: px },
});

// Boot the server on the throwaway dir.
const server = spawn(
  process.execPath,
  [path.join(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(REPO, 'src', 'index.ts')],
  { cwd: workDir, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' },
);
async function cleanup(code: number): Promise<never> {
  server.kill();
  rmSync(workDir, { recursive: true, force: true });
  process.exit(code);
}
for (let i = 0; ; i++) {
  try {
    await fetch(`http://127.0.0.1:${PORT}/login`);
    break;
  } catch {
    if (i > 50) { console.error('server did not come up'); await cleanup(2); }
    await new Promise((r) => setTimeout(r, 200));
  }
}

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: chromiumPath });
try {
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
  await page.goto(`http://127.0.0.1:${PORT}/login`);
  await page.fill('input[name=username]', 'HarborHouse');
  await page.fill('input[name=password]', 'hhai123!');
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
  await page.goto(`http://127.0.0.1:${PORT}/books/${book.id}`);
  await page.waitForSelector('.actions .readbtn');

  // Vertical gaps between consecutive pill buttons inside the action cluster.
  const pillGaps = () =>
    page.evaluate(() => {
      const pills = [...document.querySelectorAll('.actions .readbtn')]
        .map((b) => b.getBoundingClientRect())
        .sort((a, b) => a.top - b.top);
      return pills.slice(1).map((r, i) => Math.round(r.top - pills[i].bottom));
    });

  const cover = await pillGaps();
  await page.click('#next'); // title page
  await page.click('#next'); // story page 1
  await page.waitForSelector('.actions .readbtn');
  const story = await pillGaps();

  console.log(`cover pill gaps: [${cover.join(', ')}]  story-page pill gaps: [${story.join(', ')}]`);
  const failures: string[] = [];
  if (!cover.length || !story.length) failures.push('found no pill-button gaps to compare — selector or fixture broke');
  if (cover.join(',') !== story.join(',')) {
    failures.push(`cover gaps [${cover.join(', ')}] must equal story-page gaps [${story.join(', ')}]`);
  }
  for (const g of [...cover, ...story]) {
    if (g < GAP_MIN || g > GAP_MAX) failures.push(`gap of ${g}px outside the shared rhythm (${GAP_MIN}-${GAP_MAX}px)`);
  }

  if (failures.length) {
    console.error(`UI spacing check: ${failures.length} violation(s)`);
    for (const f of [...new Set(failures)]) console.error('  ✗ ' + f);
    await browser.close();
    await cleanup(1);
  }
  console.log('UI spacing check: cover and story-page button spacing match ✓');
  await browser.close();
  await cleanup(0);
} catch (err) {
  console.error(err);
  await browser.close();
  await cleanup(2);
}
