import { Router, type Request, type Response } from 'express';
import { requirePageAuth } from '../middleware/requireAuth.js';

/**
 * Printable storybook: landscape, double-sided, two pages per side with a
 * middle gap for stapling / binder rings, dotted cut lines, and cut-and-stack
 * page ordering (see books/imposition.ts) so the cut halves assemble into a
 * book by simply putting the left pile on the right pile.
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
  .slot { width: 50%; height: 100%; padding: 0.45in; display: flex; flex-direction: column;
    overflow: hidden; }
  /* Binding margin: the left slot binds on the sheet's left edge, the right
     slot binds on the middle gap — so after cutting, every leaf has its
     binding margin on the same side. */
  .slot.left { padding-left: 0.85in; padding-right: 0.35in; }
  .slot.right { padding-left: 0.85in; padding-right: 0.35in; }
  .cutline { position: absolute; top: 0; bottom: 0; left: 50%; width: 0;
    border-left: 2px dashed #b9c8d1; }
  .cut-hint { position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%);
    font-size: 9px; color: #b9c8d1; background: #fff; padding: 0 6px; letter-spacing: .5px; }
  .p-title { font-family: Georgia, 'Times New Roman', serif; font-size: 26px; font-weight: 700;
    text-align: center; margin: 0 0 10px; }
  .p-byline { text-align: center; font-family: Georgia, serif; font-size: 14px; color: #5a4632; }
  .p-img { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
  .p-img img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 6px; }
  .p-text { font-family: Georgia, 'Times New Roman', serif; font-size: 15px; line-height: 1.55;
    margin-top: 10px; white-space: pre-wrap; }
  .p-num { text-align: center; font-size: 10px; color: #9bb0bb; margin-top: 6px; }
  .cover-art { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
  .cover-art img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .theend { flex: 1; display: flex; align-items: center; justify-content: center;
    font-family: Georgia, serif; font-size: 30px; }
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
      <li>Cut every sheet along the <strong>dotted line</strong> down the middle.</li>
      <li>Put the whole <strong>left-hand pile on top of the right-hand pile</strong> —
        that's your book, already in order.</li>
      <li>Staple or add binder rings along the <strong>left edge</strong> (the wide margin).</li>
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
function renderPage(p) {
  if (p.kind === 'cover') {
    return '<div class="cover-art">' + (p.cover ? imgTag(p.cover, p.title) :
      '<div class="p-title">' + p.title + '</div>') + '</div>';
  }
  if (p.kind === 'title') {
    return '<div style="margin:auto;text-align:center">' +
      '<div class="p-title">' + p.title + '</div>' +
      (p.byline ? '<div class="p-byline">' + p.byline + '</div>' : '') + '</div>';
  }
  if (p.kind === 'end') return '<div class="theend">✨ The End ✨</div>';
  return (p.image ? '<div class="p-img">' + imgTag(p.image, '') + '</div>' : '') +
    (p.text ? '<div class="p-text">' + p.text + '</div>' : '') +
    '<div class="p-num">' + p.num + '</div>';
}

function slotHtml(idx, side) {
  const cls = 'slot ' + side;
  if (idx === null || !PAGES[idx]) return '<div class="' + cls + '"><div class="blank">(blank)</div></div>';
  return '<div class="' + cls + '">' + renderPage(PAGES[idx]) + '</div>';
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
        '<div class="cutline"></div><div class="cut-hint">✂ cut here</div>' +
        '</div>';
    }
  });
  host.innerHTML = html;
  document.getElementById('sheetnote').textContent =
    PAGES.length + ' book pages → ' + sheets.length + ' sheet' + (sheets.length === 1 ? '' : 's') +
    ' of paper (printed on both sides).';
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
    PAGES = [{ kind: 'cover', title: b.title, cover: b.cover },
             { kind: 'title', title: b.title, byline: byline }];
    let n = 1;
    for (const p of b.pages) {
      if (p.isEnd) { PAGES.push({ kind: 'end' }); continue; }
      PAGES.push({ kind: 'story', text: p.text, image: p.image, num: n++ });
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
