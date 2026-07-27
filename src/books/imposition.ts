/**
 * Saddle-stitch (booklet) imposition for printing a storybook.
 *
 * The assembly model: LANDSCAPE paper, DOUBLE-SIDED, two book pages side by
 * side per printed side. Print every sheet, keep the stack in order, fold the
 * WHOLE stack in half along the short edge, and the booklet reads 1, 2, 3…
 * from the front — no cutting or collating.
 *
 * That means page 1 must sit on the RIGHT half of the first sheet's front (it
 * becomes the front cover when folded) and the last page on its LEFT half (the
 * back cover). Each sheet inward carries the next pages in, and the innermost
 * sheet holds the middle of the book. Page count is padded to a multiple of 4,
 * since one folded sheet always yields four book pages.
 *
 * Duplex flip: printers either mirror left/right on the back ("flip on short
 * edge", the usual landscape default — which is what the classic formula
 * assumes) or preserve it ("long edge"). Both are supported.
 */

export interface SheetSide {
  /** Page indexes into the caller's page list; null = a blank half. */
  left: number | null;
  right: number | null;
}

export interface Sheet {
  front: SheetSide;
  back: SheetSide;
}

export type FlipMode = 'long' | 'short';

/**
 * Impose `pageCount` book pages onto landscape 2-up duplex sheets for folding.
 * `flip: 'long'` mirrors the back side's slots for printers that preserve
 * left/right across a landscape duplex flip.
 */
export function imposeSheets(pageCount: number, flip: FlipMode = 'short'): Sheet[] {
  if (pageCount <= 0) return [];
  const padded = Math.ceil(pageCount / 4) * 4; // a folded sheet = 4 book pages
  const sheets = padded / 4;
  const at = (i: number): number | null => (i < pageCount ? i : null);

  const out: Sheet[] = [];
  for (let k = 0; k < sheets; k++) {
    // Outermost sheet (k = 0) carries the first and last pages; each sheet
    // inward steps one page in from each end.
    const front: SheetSide = { left: at(padded - 1 - 2 * k), right: at(2 * k) };
    const backNatural: SheetSide = { left: at(2 * k + 1), right: at(padded - 2 - 2 * k) };
    const back: SheetSide =
      flip === 'long' ? { left: backNatural.right, right: backNatural.left } : backNatural;
    out.push({ front, back });
  }
  return out;
}
