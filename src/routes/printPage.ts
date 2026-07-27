import { Router, type Request, type Response } from 'express';
import { requirePageAuth } from '../middleware/requireAuth.js';

/**
 * Printable storybook.
 *
 * BOOK PAGE = one page of the finished book; it holds EITHER words OR a
 * picture, never both. The sequence is: cover, authors, illustrators, then for
 * every story page a words page followed by its picture page, then The End.
 * Because the words land on even book pages and the pictures on odd ones, an
 * assembled book opens to words on the left and the matching picture on the
 * right — exactly how the reader shows it.
 *
 * PRINTING PAGE = one side of a sheet of paper, and always carries TWO book
 * pages side by side, each inside a dotted square to cut out. Squares sit at
 * identical positions on the front and back, so one cut yields a leaf with a
 * book page on each side; cut-and-stack ordering (books/imposition.ts) means
 * the left pile stacked on the right pile is the finished book.
 */
export const printPagesRouter = Router();

printPagesRouter.get('/books/:id/print', requirePageAuth, (req: Request, res: Response) => {
  const bookId = req.params.id ?? '';
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Print your storybook — Harbor House</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #eef4f7; color: #102a36; }

  /* --- on-screen controls (never printed) --------------------------------- */
  .toolbar { position: sticky; top: 0; z-index: 5; background: #fff; border-bottom: 1px solid #dceaf0;
    padding: 14px 20px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap;
    box-shadow: 0 2px 10px rgba(16,42,54,.06); }
  .toolbar h1 { font-size: 17px; margin: 0 8px 0 0; }
  .toolbar label { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
  .toolbar select, .toolbar button { font-family: inherit; font-size: 14px; }
  .toolbar button { padding: 9px 16px; font-weight: 700; color: #fff; background: #2c6e8f;
    border: none; border-radius: 9px; cursor: pointer; }
  .toolbar button:hover { background: #245d79; }
  .toolbar a { font-size: 13px; color: #2c6e8f; font-weight: 700; }
  .howto { background: #fdf9ec; border: 1px dashed #d9c37a; border-radius: 10px;
    margin: 16px auto; padding: 14px 18px; max-width: 1000px; font-size: 14px; line-height: 1.65; }
  .howto h2 { margin: 0 0 6px; font-size: 15px; }
  .howto ol { margin: 6px 0 0; padding-left: 20px; }
  .note { color: #6d5518; }

  /* --- sheets ------------------------------------------------------------- */
  /* One .sheet = one side of one piece of paper, landscape letter (11x8.5in). */
  .sheet { position: relative; width: 11in; height: 8.5in; margin: 18px auto; background: #fff;
    box-shadow: 0 6px 20px rgba(16,42,54,.18); display: flex; overflow: hidden; }
  .side-label { position: absolute; top: 4px; left: 50%; transform: translateX(-50%);
    font-size: 10px; color: #9bb0bb; letter-spacing: .5px; }
  /* Each slot centers ONE square book page. The square is what the child cuts
     out; front and back of a sheet place their squares identically, so one cut
     yields a leaf with a page on each side. */
  .slot { width: 50%; height: 100%; display: flex; align-items: center; justify-content: center; }
  .bookpage { position: relative; width: 4.9in; height: 4.9in; border: 2px dashed #b9c8d1;
    display: flex; overflow: hidden; background: #fff; }
  .cut-hint { position: absolute; bottom: 5px; left: 50%; transform: translateX(-50%);
    font-size: 8.5px; color: #b9c8d1; letter-spacing: .5px; }
  .p-title { font-family: Georgia, 'Times New Roman', serif; font-size: 21px; font-weight: 700;
    text-align: center; margin: 0 0 8px; }
  .p-byline { text-align: center; font-family: Georgia, serif; font-size: 12.5px; color: #5a4632; }
  /* A book page holds EITHER words OR a picture — each fills its square.
     The left padding is the binding margin, the same on every page, so the
     cut-out stack staples or ring-binds cleanly along one edge. */
  .fullpage { width: 100%; height: 100%; padding: 0.3in 0.3in 0.3in 0.5in; display: flex;
    flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
  .fullpage img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px; }
  .fullpage.picture { padding: 0.22in 0.22in 0.22in 0.42in; }
  .fullpage.cover { padding: 0.18in; }
  .p-text { font-family: Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.6;
    white-space: pre-wrap; overflow: hidden; text-align: left; width: 100%; }
  .p-credit { font-family: Georgia, serif; font-size: 15px; color: #5a4632; text-align: center; }
  .p-num { position: absolute; bottom: 5px; left: 0.5in; font-size: 8.5px; color: #9bb0bb; }
  .theend { font-family: Georgia, serif; font-size: 26px; }
  .blank { color: #cfd9df; font-size: 10px; margin: auto; }

  /* --- print -------------------------------------------------------------- */
  @page { size: letter landscape; margin: 0; }
  @media print {
    body { background: #fff; }
    .toolbar, .howto { display: none !important; }
    .sheet { margin: 0; box-shadow: none; page-break-after: always; break-after: page; }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
    .side-label { display: none; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <h1>🖨️ Print your storybook</h1>
    <label>Printer flips on:
      <select id="flip">
        <option value="short" selected>Short edge (most common)</option>
        <option value="long">Long edge</option>
      </select>
    </label>
    <button id="printbtn" type="button">Print</button>
    <a href="/books/${bookId}">← Back to the book</a>
    <span id="status" style="font-size:13px;color:#5a7785"></span>
  </div>

  <div class="howto">
    <h2>How to print and assemble</h2>
    <ol>
      <li>In the print dialog choose <strong>Landscape</strong>, <strong>Double-sided (two-sided)</strong>,
        and set <strong>Margins: None</strong> with <strong>Background graphics ON</strong>.</li>
      <li>Match the <em>flip</em> setting above to your printer's two-sided option
        ("flip on short edge" is the usual default). If the backs come out mismatched, switch it and reprint one sheet to check.</li>
      <li>Cut out each <strong>dotted square</strong> with scissors — two book pages per
        printed side. Each square is one page of your book, with another page on its back.</li>
      <li>Keep them in two piles as you cut: <strong>left-hand squares</strong> in one pile,
        <strong>right-hand squares</strong> in the other.</li>
      <li>Put the whole <strong>left pile on top of the right pile</strong> —
        that's your book, already in order.</li>
      <li>Staple or add binder rings along the <strong>left edge</strong> (the wide margin
        inside each square).</li>
    </ol>
    <p class="note" id="sheetnote"></p>
  </div>

  <div id="sheets"></div>

<script>
const BOOK_ID = ${JSON.stringify(bookId)};

/** Same imposition as src/books/imposition.ts (kept in sync deliberately). */
function imposeSheets(pageCount, flip) {
  if (pageCount <= 0) return [];
  const leaves = Math.ceil(pageCount / 2);
  const sheets = Math.ceil(leaves / 2);
  const at = (i) => (i < pageCount ? i : null);
  const out = [];
  for (let k = 0; k < sheets; k++) {
    const leftLeaf = k, rightLeaf = sheets + k;
    const front = { left: at(leftLeaf * 2), right: at(rightLeaf * 2) };
    const bn = { left: at(leftLeaf * 2 + 1), right: at(rightLeaf * 2 + 1) };
    const back = flip === 'short' ? { left: bn.right, right: bn.left } : bn;
    out.push({ front, back });
  }
  return out;
}

let PAGES = [];

function imgTag(image, alt) {
  if (!image) return '';
  return '<img src="data:' + image.mimeType + ';base64,' + image.dataBase64 + '" alt="' + alt + '" />';
}

/** Build the printable content for one book page. */
/** The inside of one square BOOK PAGE — words only, or a picture only. */
function renderPage(p) {
  if (p.kind === 'cover') {
    return '<div class="fullpage cover">' +
      (p.cover ? imgTag(p.cover, p.title) : '<div class="p-title">' + p.title + '</div>') +
      '</div>';
  }
  if (p.kind === 'authors') {
    return '<div class="fullpage"><div class="p-title">' + p.title + '</div>' +
      (p.byline ? '<div class="p-byline">' + p.byline + '</div>' : '') + '</div>';
  }
  if (p.kind === 'illustrators') {
    return '<div class="fullpage"><div class="p-credit">' + p.credit + '</div></div>';
  }
  if (p.kind === 'end') return '<div class="fullpage"><div class="theend">✨ The End ✨</div></div>';
  if (p.kind === 'picture') {
    return '<div class="fullpage picture">' +
      (p.image ? imgTag(p.image, '') : '<div class="p-credit">(no picture)</div>') + '</div>';
  }
  // words-only page
  return '<div class="fullpage words"><div class="p-text">' + (p.text || '') + '</div></div>' +
    '<div class="p-num">' + p.num + '</div>';
}

function slotHtml(idx, side) {
  const cls = 'slot ' + side;
  if (idx === null || !PAGES[idx]) return '<div class="' + cls + '"></div>';
  return '<div class="' + cls + '"><div class="bookpage">' + renderPage(PAGES[idx]) +
    '<div class="cut-hint">✂ cut along the dotted square</div></div></div>';
}

function render() {
  const flip = document.getElementById('flip').value;
  const sheets = imposeSheets(PAGES.length, flip);
  const host = document.getElementById('sheets');
  let html = '';
  sheets.forEach((s, i) => {
    for (const [side, name] of [[s.front, 'front'], [s.back, 'back']]) {
      html += '<div class="sheet">' +
        '<div class="side-label">sheet ' + (i + 1) + ' — ' + name + '</div>' +
        slotHtml(side.left, 'left') + slotHtml(side.right, 'right') +
        '</div>';
    }
  });
  host.innerHTML = html;
  document.getElementById('sheetnote').textContent =
    PAGES.length + ' book pages → ' + (sheets.length * 2) + ' printed sides on ' +
    sheets.length + ' sheet' + (sheets.length === 1 ? '' : 's') + ' of paper (two book pages per side).';
}

(async () => {
  const status = document.getElementById('status');
  try {
    const res = await fetch('/v1/books/' + BOOK_ID);
    const data = await res.json();
    if (!res.ok || !data.ok) { status.textContent = 'Could not load this book.'; return; }
    const b = data.book;
    const authors = (b.authors || []).filter(Boolean);
    const byline = authors.length
      ? 'Written by ' + (authors.length === 1 ? authors[0] :
          authors.slice(0, -1).join(', ') + ' and ' + authors[authors.length - 1])
      : '';
    const ENGINES = { replicate: 'Nano Banana Pro', gemini: 'Nano Banana 2' };
    const illustrator = ENGINES[b.imageEngine] || 'Harbor House AI';
    // Cover, authors, illustrators, then words+picture per story page, then
    // The End — words on even book pages, pictures on odd, so a bound copy
    // opens to words on the left and its picture on the right.
    PAGES = [
      { kind: 'cover', title: b.title, cover: b.cover },
      { kind: 'authors', title: b.title, byline: byline },
      { kind: 'illustrators', credit: 'Pictures by ' + illustrator },
    ];
    let n = 1;
    for (const p of b.pages) {
      if (p.isEnd) { PAGES.push({ kind: 'end' }); continue; }
      const num = n++;
      PAGES.push({ kind: 'words', text: p.text, num: num });
      PAGES.push({ kind: 'picture', image: p.image, num: num });
    }
    document.title = b.title + ' — print';
    render();
  } catch {
    status.textContent = 'Could not reach the server.';
  }
})();

document.getElementById('flip').addEventListener('change', render);
document.getElementById('printbtn').addEventListener('click', () => window.print());
</script>
</body>
</html>`);
});
