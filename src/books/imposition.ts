/**
 * Cut-and-stack imposition for printing a storybook.
 *
 * The sheet model: LANDSCAPE paper, DOUBLE-SIDED, two book pages side by side
 * per side with a gap down the middle. After printing you cut every sheet
 * along that middle line, giving two half-sheet "leaves" per sheet — each leaf
 * carrying one book page on its front and the next on its back. Stack the
 * left-hand pile on top of the right-hand pile and the book is in order, ready
 * to staple or ring-bind along the left edge.
 *
 * That stacking works because of how leaves are assigned: with S sheets, the
 * LEFT slot of sheet k carries leaf k and the RIGHT slot carries leaf S+k. So
 * the left pile is leaves 1..S in order and the right pile continues S+1..2S.
 *
 * Duplex flip: printers either preserve left/right on the back ("long edge"
 * for landscape) or mirror it ("short edge"). Both are supported — the back
 * slots are swapped for the mirroring case — because we cannot know the
 * user's printer.
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
 * Impose `pageCount` book pages onto landscape 2-up duplex sheets.
 * `flip: 'short'` mirrors the back side's slots (the common "flip on short
 * edge" behavior for landscape duplex).
 */
export function imposeSheets(pageCount: number, flip: FlipMode = 'short'): Sheet[] {
  if (pageCount <= 0) return [];
  const leaves = Math.ceil(pageCount / 2); // each leaf = 2 pages (front + back)
  const sheets = Math.ceil(leaves / 2); // each sheet = 2 leaves (left + right)
  const at = (i: number): number | null => (i < pageCount ? i : null);

  const out: Sheet[] = [];
  for (let k = 0; k < sheets; k++) {
    const leftLeaf = k; // leaves 0..S-1 land in the left slot, in order
    const rightLeaf = sheets + k; // leaves S..2S-1 continue in the right slot
    const front: SheetSide = { left: at(leftLeaf * 2), right: at(rightLeaf * 2) };
    const backNatural: SheetSide = { left: at(leftLeaf * 2 + 1), right: at(rightLeaf * 2 + 1) };
    const back: SheetSide =
      flip === 'short' ? { left: backNatural.right, right: backNatural.left } : backNatural;
    out.push({ front, back });
  }
  return out;
}
