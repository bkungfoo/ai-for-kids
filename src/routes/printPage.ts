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
 * pages side by side, each inside a dotted border. Sheets use saddle-stitch
 * ordering (books/imposition.ts): print them all, keep the stack in order,
 * fold the whole stack in half along the short edge, and the booklet reads
 * 1, 2, 3… from the front — no cutting or collating.
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
  /* Each slot centers ONE square book page. The square is what the child cuts
     out; front and back of a sheet place their squares identically, so one cut
     yields a leaf with a page on each side. */
  .slot { width: 50%; height: 100%; display: flex; align-items: center; justify-content: center; }
  .bookpage { position: relative; width: 4.9in; height: 4.9in; border: 2px dashed #b9c8d1;
    display: flex; overflow: hidden; background: #fff; }
  /* The fold runs down the middle of every sheet — the crease that turns the
     stack into a booklet. */
  .foldline { position: absolute; top: 0; bottom: 0; left: 50%; width: 0;
    border-left: 1px dashed #d6e0e6; }
  .fold-hint { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(90deg);
    font-size: 8.5px; color: #c8d4db; letter-spacing: 2px; background: #fff; padding: 0 4px; }
  .p-title { font-family: Georgia, 'Times New Roman', serif; font-size: 21px; font-weight: 700;
    text-align: center; margin: 0 0 8px; }
  .p-byline { text-align: center; font-family: Georgia, serif; font-size: 12.5px; color: #5a4632; }
  /* A book page holds EITHER words OR a picture — each fills its square.
     The left padding is the binding margin, the same on every page, so the
     cut-out stack staples or ring-binds cleanly along one edge. */
  .fullpage { width: 100%; height: 100%; padding: 0.3in; display: flex;
    flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
  /* Extra breathing room beside the fold (the book's gutter): the left page's
     inner edge is on its right, the right page's inner edge is on its left. */
  .slot.left .fullpage { padding-right: 0.45in; }
  .slot.right .fullpage { padding-left: 0.45in; }
  .fullpage img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px; }
  .fullpage.picture { padding: 0.22in 0.22in 0.22in 0.42in; }
  .fullpage.cover { padding: 0.18in; }
  .p-text { font-family: Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.6;
    white-space: pre-wrap; overflow: hidden; text-align: left; width: 100%; }
  .p-credit { font-family: Georgia, serif; font-size: 15px; color: #5a4632; text-align: center; }
  /* Page number: bottom OUTER corner of each book page (away from the fold).
     Because .bookpage fills the whole slot in borderless mode, the number
     lands in the sheet-half's corner there. */
  .p-num { position: absolute; bottom: 0.14in; font-size: 9px; color: #9bb0bb; }
  .slot.left .p-num { left: 0.16in; right: auto; }
  .slot.right .p-num { right: 0.16in; left: auto; }
  .theend { font-family: Georgia, serif; font-size: 26px; }
  .blank { color: #cfd9df; font-size: 10px; margin: auto; }
  /* Borderless mode: no dotted page squares — the book fills the whole paper.
     The center FOLD line stays (it's the crease to fold on); only its text
     label is dropped so it can't land on a full-bleed picture. */
  #sheets.no-borders .bookpage { border-color: transparent; width: 100%; height: 100%; }
  #sheets.no-borders .fold-hint { display: none; }

  /* --- print -------------------------------------------------------------- */
  @page { size: letter landscape; margin: 0; }
  @media print {
    body { background: #fff; }
    .toolbar, .howto { display: none !important; }
    .sheet { margin: 0; box-shadow: none; page-break-after: always; break-after: page; }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
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
    <label>Page borders:
      <select id="borders">
        <option value="off" selected>None (fill the whole paper)</option>
        <option value="on">Dotted lines (trim to square pages)</option>
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
      <li>Keep the printed sheets <strong>in the order they came out</strong> — don't shuffle them.</li>
      <li><strong>Fold the whole stack in half</strong> along the dotted FOLD line down the
        middle (a short-edge fold). Your book now reads in order from the front cover.</li>
      <li>Staple or add binder rings <strong>along the fold</strong>.</li>
      <li>The dotted page squares are just cutting guides. Choose <strong>Page borders: None</strong>
        above to fill the whole paper (the center fold line stays either way), or trim around
        each dotted square for neat pages.</li>
    </ol>
    <p class="note" id="sheetnote"></p>
  </div>

  <div id="sheets"></div>

<script>
const BOOK_ID = ${JSON.stringify(bookId)};

/** Saddle-stitch imposition — same as src/books/imposition.ts (kept in sync
 *  deliberately). Page 1 lands on the RIGHT of the first sheet's front, so
 *  folding the printed stack in half gives a booklet that reads in order. */
function imposeSheets(pageCount, flip) {
  if (pageCount <= 0) return [];
  const padded = Math.ceil(pageCount / 4) * 4;
  const sheets = padded / 4;
  const at = (i) => (i < pageCount ? i : null);
  const out = [];
  for (let k = 0; k < sheets; k++) {
    const front = { left: at(padded - 1 - 2 * k), right: at(2 * k) };
    const bn = { left: at(2 * k + 1), right: at(padded - 2 - 2 * k) };
    const back = flip === 'long' ? { left: bn.right, right: bn.left } : bn;
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
  return '<div class="fullpage words"><div class="p-text">' + (p.text || '') + '</div></div>';
}

function slotHtml(idx, side) {
  const cls = 'slot ' + side;
  if (idx === null || !PAGES[idx]) return '<div class="' + cls + '"></div>';
  const folio = PAGES[idx].folio ? '<div class="p-num">' + PAGES[idx].folio + '</div>' : '';
  return '<div class="' + cls + '"><div class="bookpage">' + renderPage(PAGES[idx]) +
    folio + '</div></div>';
}

function render() {
  const flip = document.getElementById('flip').value;
  const borders = document.getElementById('borders').value;
  const sheets = imposeSheets(PAGES.length, flip);
  const host = document.getElementById('sheets');
  host.className = borders === 'off' ? 'no-borders' : '';
  let html = '';
  sheets.forEach((s, i) => {
    for (const side of [s.front, s.back]) {
      html += '<div class="sheet">' +
        slotHtml(side.left, 'left') + slotHtml(side.right, 'right') +
        '<div class="foldline"></div><div class="fold-hint">FOLD</div>' +
        '</div>';
    }
  });
  host.innerHTML = html;
  document.getElementById('sheetnote').textContent =
    PAGES.length + ' book pages → ' + sheets.length + ' sheet' + (sheets.length === 1 ? '' : 's') +
    ' of paper, printed on both sides, folded together into a booklet.';
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
    for (const p of b.pages) {
      if (p.isEnd) { PAGES.push({ kind: 'end' }); continue; }
      PAGES.push({ kind: 'words', text: p.text });
      PAGES.push({ kind: 'picture', image: p.image });
    }
    // Page numbers start where the STORY does: the cover, authors and
    // illustrators pages carry no number; the first words page is page 1.
    let folio = 0;
    for (const pg of PAGES) {
      if (pg.kind === 'words' || pg.kind === 'picture') pg.folio = ++folio;
    }
    document.title = b.title + ' — print';
    render();
  } catch {
    status.textContent = 'Could not reach the server.';
  }
})();

document.getElementById('flip').addEventListener('change', render);
document.getElementById('borders').addEventListener('change', render);
document.getElementById('printbtn').addEventListener('click', () => window.print());
</script>
</body>
</html>`);
});
