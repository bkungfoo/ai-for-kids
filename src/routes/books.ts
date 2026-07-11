import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { currentUser } from '../middleware/requireAuth.js';
import { imageProviderFor } from '../providers/imageProvider.js';
import type { ImageEngine } from '../providers/types.js';
import { runGuardedGeneration } from '../safety/guardedGeneration.js';
import { guardText } from '../safety/pipeline.js';
import {
  addPage,
  createBook,
  deleteBook,
  deletePage,
  discardSnapshot,
  duplicatePage,
  getBook,
  listBooks,
  movePage,
  publishBook,
  removeEndPage,
  revertBook,
  snapshotBook,
  updateAuthors,
  updateCover,
  updatePage,
  type Book,
  type BookImage,
  type BookPage,
} from '../books/store.js';
import { config } from '../config.js';
import { elevenLabsProvider } from '../providers/elevenlabs.js';
import {
  draftSprinkleProvider,
  fairyDustProvider,
  suggestPromptProvider,
} from '../providers/fairyDust.js';
import { optionalString, requireString, ValidationError } from './validate.js';

/**
 * Storybook API (mounted at /v1/books, behind the child-session auth).
 *
 * Safety model: the story text and title a child writes are moderated as
 * INPUT before they are stored (they are displayed back on the left-hand
 * page), and every illustration request runs through the full guarded
 * pipeline (input moderation -> Gemini -> output moderation -> SafeSearch).
 * The image prompt is deliberately separate from the story sentences.
 */
export const booksApiRouter = Router();

/**
 * Front-cover prompt. Unlike page illustrations, the cover DOES contain text:
 * the book's title is painted into the artwork.
 */
function coverPrompt(title: string, userPrompt?: string): string {
  const scene = userPrompt?.trim()
    ? userPrompt.trim()
    : 'a scene that captures the spirit of the story';
  return (
    'Front cover illustration for a children\'s picture storybook, in a bright, ' +
    `colorful, friendly art style. The cover shows: ${scene}. ` +
    `The book's title, "${title}", must be painted into the artwork as decorative, ` +
    'easy-to-read lettering near the top of the cover. No other text or lettering.'
  );
}

/** Most recent story text that fits the budget (drop oldest pages first). */
const STORY_CONTEXT_MAX_CHARS = 2500;

/**
 * Cover + up to five recent page images. Nano Banana Pro accepts up to 14
 * references; we keep it small (the cover as the main-character anchor, plus the
 * latest pages) to bound the request while staying visually consistent.
 */
const MAX_REFERENCE_IMAGES = 6;

/**
 * The scene to draw for one page, with reinforcement instructions. The narrative
 * so far is passed SEPARATELY (as `context`) and earlier pictures as reference
 * images, so a stateless engine can still keep characters and objects consistent.
 */
function pageScenePrompt(
  book: Book,
  pageText: string,
  imagePrompt: string,
  hasReferences: boolean,
): string {
  const reinforcement = hasReferences
    ? 'You are also given reference pictures from earlier pages of THIS SAME book. ' +
      'Copy the exact same characters (their faces, hair, skin tone and clothing), objects and ' +
      'art style from those reference pictures so the whole book looks consistent — including any ' +
      'changes that already happened to them (for example, a scraped knee stays scraped).'
    : 'Keep the picture consistent with the story so far — the same characters, places and ' +
      'objects, including any changes that happened to them in earlier pages.';
  return (
    `Illustration for one page of a children's picture storybook titled "${book.title}", ` +
    'in a bright, colorful, friendly art style. No text, words or lettering in the image.\n' +
    `This page's story: ${pageText}\n` +
    `Draw this scene: ${imagePrompt}\n` +
    reinforcement
  );
}

/** The narrative so far (most recent pages that fit the budget), or undefined. */
function storyContext(priorTexts: string[]): string | undefined {
  const parts: string[] = [];
  let used = 0;
  for (let i = priorTexts.length - 1; i >= 0; i--) {
    const t = priorTexts[i]!;
    if (used + t.length > STORY_CONTEXT_MAX_CHARS) break;
    parts.unshift(t);
    used += t.length;
  }
  return parts.length ? `The story so far (earlier pages):\n${parts.join('\n')}` : undefined;
}

/**
 * Earlier pictures to hand the model as visual references: the cover (main
 * character anchor) followed by the most recent page images, capped.
 */
function referenceImages(book: Book, priorPages: BookPage[]): BookImage[] {
  const refs: BookImage[] = [];
  if (book.cover) refs.push(book.cover);
  const pageImages = priorPages
    .map((p) => p.image)
    .filter((img): img is BookImage => Boolean(img));
  refs.push(...pageImages.slice(-(MAX_REFERENCE_IMAGES - refs.length)));
  return refs;
}

/** Slim listing shape: cover + counts, not every page image. */
function summarize(book: Book) {
  return {
    id: book.id,
    title: book.title,
    authors: book.authors,
    status: book.status,
    cover: book.cover,
    pageCount: book.pages.length,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  };
}

/** Optional list of author names from the request body (max 6, each ≤ 40 chars). */
function parseAuthors(body: unknown): string[] {
  const raw = (body as { authors?: unknown } | undefined)?.authors;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ValidationError('"authors" must be an array of names');
  const authors = raw
    .map((a) => (typeof a === 'string' ? a.trim() : ''))
    .filter((a) => a.length > 0);
  if (authors.length > 6) throw new ValidationError('At most 6 authors are allowed');
  if (authors.some((a) => a.length > 40)) {
    throw new ValidationError('Author names must be at most 40 characters');
  }
  return authors;
}

/** Optional per-book illustration engine from the request body. */
function parseImageEngine(body: unknown): ImageEngine | undefined {
  const raw = optionalString(body, 'imageEngine', { maxLength: 20 });
  if (raw === undefined) return undefined;
  if (raw !== 'replicate' && raw !== 'gemini') {
    throw new ValidationError('"imageEngine" must be "replicate" or "gemini"');
  }
  return raw;
}

/**
 * A page-drawing payload: `{ drawing }` is either a PNG data URL (the child's
 * doodle overlay) or null to erase it. Rejects anything that isn't a
 * base64-encoded PNG data URL.
 */
function parseDrawing(body: unknown): BookImage | null {
  const value = (body as { drawing?: unknown } | undefined)?.drawing;
  if (value === null || value === undefined) return null; // clear the drawing
  if (typeof value !== 'string') throw new ValidationError('"drawing" must be a data URL or null');
  if (value.length > 5_000_000) throw new ValidationError('That drawing is too large to save');
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new ValidationError('"drawing" must be a PNG data URL');
  return { mimeType: 'image/png', dataBase64: match[1]! };
}

/** 409 helper: published books are frozen. */
function publishedConflict(res: Response): void {
  res.status(409).json({ ok: false, error: 'This book is published and can no longer be changed' });
}

/** Pull the first generated image out of a guarded-generation result. */
function firstImage(result: unknown): BookImage | null {
  const images = (result as { images?: BookImage[] } | undefined)?.images;
  return images && images.length > 0 ? images[0]! : null;
}

/**
 * Fetch a book only if the signed-in account owns it — the basis of per-account
 * "My storybooks". Returns undefined otherwise, so callers respond 404 and
 * never reveal that another user's book exists (let alone let it be edited).
 */
async function getOwnedBook(id: string, user: string | undefined): Promise<Book | undefined> {
  if (!user) return undefined;
  const book = await getBook(id);
  return book && book.owner === user ? book : undefined;
}

// --- Shelf -------------------------------------------------------------------
booksApiRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    // "My storybooks" is private to the signed-in account.
    const user = currentUser(req);
    const books = await listBooks();
    const mine = books.filter((b) => b.owner === user);
    res.json({ ok: true, books: mine.map(summarize) });
  }),
);

// --- Create a book: moderate the title, then illustrate the cover from it ----
booksApiRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const title = requireString(req.body, 'title', { maxLength: 80 });
    const authors = parseAuthors(req.body);
    const userCoverPrompt = optionalString(req.body, 'coverPrompt', { maxLength: 1000 });
    // The child picks who paints the pictures when starting the book; the
    // choice sticks for every illustration in it (cover, pages, repaints).
    const imageEngine = parseImageEngine(req.body);

    // Title and author names are shown back on the cover — moderate them first.
    const titleVerdict = await guardText([title, ...authors], 'input');
    if (!titleVerdict.allowed) {
      res.status(403).json({
        ok: false,
        blocked: true,
        stage: 'input',
        message: titleVerdict.childMessage,
        verdict: { severity: titleVerdict.severity, categories: titleVerdict.categories },
      });
      return;
    }

    // Cover image goes through the full guarded pipeline. It is the first
    // picture in the book, so it has no earlier context or references — it sets
    // the look that later pages copy.
    const outcome = await runGuardedGeneration(imageProviderFor(imageEngine), {
      prompt: coverPrompt(title, userCoverPrompt),
    });
    if (outcome.status !== 200) {
      res.status(outcome.status).json(outcome.body);
      return;
    }

    const book = await createBook(
      title,
      authors,
      firstImage(outcome.body.result),
      userCoverPrompt,
      imageEngine,
      currentUser(req),
    );
    res.status(201).json({ ok: true, book: summarize(book) });
  }),
);

// --- Repaint the front cover with a fresh prompt (title stays in the art) -----
booksApiRouter.post(
  '/:id/cover',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const userCoverPrompt = requireString(req.body, 'coverPrompt', { maxLength: 1000 });

    const book = await getOwnedBook(bookId, currentUser(req));
    if (!book) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    if (book.status === 'published') return publishedConflict(res);

    const outcome = await runGuardedGeneration(imageProviderFor(book.imageEngine), {
      prompt: coverPrompt(book.title, userCoverPrompt),
    });
    if (outcome.status !== 200) {
      res.status(outcome.status).json(outcome.body);
      return;
    }

    const image = firstImage(outcome.body.result);
    if (!image) {
      res.status(502).json({ ok: false, error: 'No picture came back — try different words!' });
      return;
    }

    const updated = await updateCover(bookId, image, userCoverPrompt);
    if (!updated) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    res.json({ ok: true, book: updated });
  }),
);

// --- Read a whole book (pages + images) ---------------------------------------
booksApiRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const book = await getBook(req.params.id ?? '');
    // The owner may read their own book; anyone signed in may read a PUBLISHED
    // book (the shared library). Otherwise 404 — don't reveal it exists.
    if (!book || (book.owner !== currentUser(req) && book.status !== 'published')) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    res.json({ ok: true, book });
  }),
);

// --- Add a page: story text (left page) + separate image prompt (right page) --
booksApiRouter.post(
  '/:id/pages',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const text = requireString(req.body, 'text', { maxLength: 2000 });
    const imagePrompt = requireString(req.body, 'imagePrompt', { maxLength: 1000 });
    // Optional: slot the new page in at this index instead of appending.
    const insertAtRaw = (req.body as { insertAt?: unknown } | undefined)?.insertAt;
    const insertAt =
      insertAtRaw === undefined || insertAtRaw === null ? undefined : Number(insertAtRaw);
    if (insertAt !== undefined && (!Number.isInteger(insertAt) || insertAt < 0)) {
      throw new ValidationError('"insertAt" must be a non-negative integer');
    }

    const existing = await getOwnedBook(bookId, currentUser(req));
    if (!existing) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    if (existing.status === 'published') return publishedConflict(res);

    // The story sentences are stored and displayed back — moderate them first.
    const textVerdict = await guardText([text], 'input');
    if (!textVerdict.allowed) {
      res.status(403).json({
        ok: false,
        blocked: true,
        stage: 'input',
        message: textVerdict.childMessage,
        verdict: { severity: textVerdict.severity, categories: textVerdict.categories },
      });
      return;
    }

    // The illustration runs through the full guarded pipeline. We hand the
    // engine the story so far (context) and the earlier pictures (references) so
    // characters, objects and settings stay consistent from page to page. For a
    // mid-book insert, "the story so far" is the pages BEFORE the insert point.
    const priorPages =
      insertAt === undefined ? existing.pages : existing.pages.slice(0, insertAt);
    const refs = referenceImages(existing, priorPages);
    const outcome = await runGuardedGeneration(imageProviderFor(existing.imageEngine), {
      prompt: pageScenePrompt(existing, text, imagePrompt, refs.length > 0),
      context: storyContext(priorPages.map((p) => p.text)),
      referenceImages: refs,
    });
    if (outcome.status !== 200) {
      res.status(outcome.status).json(outcome.body);
      return;
    }

    const added = await addPage(
      bookId,
      { text, imagePrompt, image: firstImage(outcome.body.result) },
      insertAt,
    );
    if (!added) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    res.status(201).json({ ok: true, book: added.book, pageIndex: added.pageIndex });
  }),
);

// --- Repaint a page's picture with a fresh prompt (story text unchanged) ------
booksApiRouter.post(
  '/:id/pages/:index/image',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const index = Number.parseInt(req.params.index ?? '', 10);
    const imagePrompt = requireString(req.body, 'imagePrompt', { maxLength: 1000 });

    const book = await getOwnedBook(bookId, currentUser(req));
    const page = Number.isInteger(index) && index >= 0 ? book?.pages[index] : undefined;
    if (!book || !page) {
      res.status(404).json({ ok: false, error: 'Page not found' });
      return;
    }
    if (book.status === 'published') return publishedConflict(res);

    const priorPages = book.pages.slice(0, index);
    const refs = referenceImages(book, priorPages);
    const outcome = await runGuardedGeneration(imageProviderFor(book.imageEngine), {
      prompt: pageScenePrompt(book, page.text, imagePrompt, refs.length > 0),
      context: storyContext(priorPages.map((p) => p.text)),
      referenceImages: refs,
    });
    if (outcome.status !== 200) {
      res.status(outcome.status).json(outcome.body);
      return;
    }

    const image = firstImage(outcome.body.result);
    if (!image) {
      res.status(502).json({ ok: false, error: 'No picture came back — try different words!' });
      return;
    }

    const updated = await updatePage(bookId, index, { imagePrompt, image });
    if (!updated) {
      res.status(404).json({ ok: false, error: 'Page not found' });
      return;
    }
    res.json({ ok: true, book: updated, pageIndex: index });
  }),
);

// --- Edit a page's story words (the picture stays as it is) --------------------
booksApiRouter.patch(
  '/:id/pages/:index/text',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const index = Number.parseInt(req.params.index ?? '', 10);
    const text = requireString(req.body, 'text', { maxLength: 2000 });

    const book = await getOwnedBook(bookId, currentUser(req));
    const page = Number.isInteger(index) && index >= 0 ? book?.pages[index] : undefined;
    if (!book || !page) {
      res.status(404).json({ ok: false, error: 'Page not found' });
      return;
    }
    if (book.status === 'published') return publishedConflict(res);
    if (page.isEnd) {
      res.status(409).json({ ok: false, error: 'The "The End" page cannot be changed' });
      return;
    }

    // The new story words are stored and displayed back — moderate them first.
    const verdict = await guardText([text], 'input');
    if (!verdict.allowed) {
      res.status(403).json({
        ok: false,
        blocked: true,
        stage: 'input',
        message: verdict.childMessage,
        verdict: { severity: verdict.severity, categories: verdict.categories },
      });
      return;
    }

    // New words invalidate any cached read-aloud audio for the page — and
    // become the new fairy-dust background state (sourceText is cleared, so
    // future sprinkles polish THIS text, not the pre-sprinkle original).
    const updated = await updatePage(bookId, index, {
      text,
      narration: null,
      sourceText: undefined,
    });
    if (!updated) {
      res.status(404).json({ ok: false, error: 'Page not found' });
      return;
    }
    res.json({ ok: true, book: updated, pageIndex: index });
  }),
);

// --- Save (or clear) the child's pen drawing over a page's picture -------------
booksApiRouter.put(
  '/:id/pages/:index/drawing',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const index = Number.parseInt(req.params.index ?? '', 10);
    const drawing = parseDrawing(req.body);

    const book = await getOwnedBook(bookId, currentUser(req));
    const page = Number.isInteger(index) && index >= 0 ? book?.pages[index] : undefined;
    if (!book || !page) {
      res.status(404).json({ ok: false, error: 'Page not found' });
      return;
    }
    if (book.status === 'published') return publishedConflict(res);
    // Drawing is only offered once a page has both its words and its picture.
    if (page.isEnd || !page.text || !page.image) {
      res.status(409).json({ ok: false, error: 'This page cannot be drawn on yet' });
      return;
    }

    // The overlay is the child's own pen strokes (no AI, no text), so it isn't
    // run through the generation-safety pipeline.
    const updated = await updatePage(bookId, index, { drawing });
    if (!updated) {
      res.status(404).json({ ok: false, error: 'Page not found' });
      return;
    }
    res.json({ ok: true, book: updated, pageIndex: index });
  }),
);

// --- Read-aloud narration for a page (generated once, then cached) -------------
booksApiRouter.post(
  '/:id/pages/:index/narration',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const index = Number.parseInt(req.params.index ?? '', 10);

    // Same visibility rule as reading the book: the owner always may; anyone
    // signed in may narrate a PUBLISHED library book. Narration is derived
    // audio of already-moderated words, not an edit, so published books allow
    // it too (the audio is cached into the book so it is generated only once).
    const book = await getBook(bookId);
    if (!book || (book.owner !== currentUser(req) && book.status !== 'published')) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    const page = Number.isInteger(index) && index >= 0 ? book.pages[index] : undefined;
    if (!page || !page.text) {
      res.status(404).json({ ok: false, error: 'Page not found' });
      return;
    }

    // Cached? Replay for free.
    if (page.narration) {
      res.json({ ok: true, narration: page.narration, pageIndex: index, cached: true });
      return;
    }

    // 501 when ElevenLabs isn't configured — the reader then falls back to the
    // browser's built-in speech synthesis.
    const voiceId = config.providers.elevenlabs.narratorVoiceId;
    const outcome = await runGuardedGeneration(elevenLabsProvider, { text: page.text, voiceId });
    if (outcome.status !== 200) {
      res.status(outcome.status).json(outcome.body);
      return;
    }
    const result = outcome.body.result as { contentType: string; audioBase64: string };
    const narration = {
      mimeType: result.contentType,
      dataBase64: result.audioBase64,
      voiceId,
    };
    await updatePage(bookId, index, { narration });
    res.json({ ok: true, narration, pageIndex: index });
  }),
);

// --- Fairy dust: polish a page's words (grammar + flow, kid-readable) -----------
booksApiRouter.post(
  '/:id/pages/:index/sprinkle',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const index = Number.parseInt(req.params.index ?? '', 10);

    const book = await getOwnedBook(bookId, currentUser(req));
    const page = Number.isInteger(index) && index >= 0 ? book?.pages[index] : undefined;
    if (!book || !page) {
      res.status(404).json({ ok: false, error: 'Page not found' });
      return;
    }
    if (book.status === 'published') return publishedConflict(res);
    if (page.isEnd || !page.text.trim()) {
      res.status(409).json({ ok: false, error: 'This page has no words to sprinkle' });
      return;
    }

    // Always polish the child's ORIGINAL words (the background state), so
    // sprinkling again gives a fresh fix of the original — not a fix of a fix.
    const sourceText = page.sourceText ?? page.text;
    const outcome = await runGuardedGeneration(fairyDustProvider, {
      book,
      pageIndex: index,
      sourceText,
    });
    if (outcome.status !== 200) {
      res.status(outcome.status).json(outcome.body);
      return;
    }
    const polished = (outcome.body.result as { text: string }).text;
    const updated = await updatePage(bookId, index, {
      text: polished,
      sourceText,
      narration: null, // the words changed — stale read-aloud audio goes
    });
    if (!updated) {
      res.status(404).json({ ok: false, error: 'Page not found' });
      return;
    }
    res.json({ ok: true, book: updated, pageIndex: index });
  }),
);

// --- Suggest an image prompt from the page narrative ----------------------------
// Translates the story words into a concrete "Draw ..." illustration
// instruction, with character appearances carried from the cover description
// and earlier picture prompts. Nothing is stored; the form fills its box.
booksApiRouter.post(
  '/:id/suggest-image-prompt',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const text = requireString(req.body, 'text', { maxLength: 2000 });

    const book = await getOwnedBook(bookId, currentUser(req));
    if (!book) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    if (book.status === 'published') return publishedConflict(res);

    const outcome = await runGuardedGeneration(suggestPromptProvider, { book, text });
    res.status(outcome.status).json(outcome.body);
  }),
);

// --- Fairy dust on the NEW-page form (draft words, nothing stored yet) ----------
booksApiRouter.post(
  '/:id/sprinkle-draft',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const text = requireString(req.body, 'text', { maxLength: 2000 });

    const book = await getOwnedBook(bookId, currentUser(req));
    if (!book) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    if (book.status === 'published') return publishedConflict(res);

    const outcome = await runGuardedGeneration(draftSprinkleProvider, { book, text });
    res.status(outcome.status).json(outcome.body);
  }),
);

// --- Page management: move / duplicate / remove a story page --------------------
booksApiRouter.post(
  '/:id/pages/:index/move',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const from = Number.parseInt(req.params.index ?? '', 10);
    const toRaw = (req.body as { to?: unknown } | undefined)?.to;
    const to = Number(toRaw);
    if (!Number.isInteger(to) || to < 0) {
      throw new ValidationError('"to" must be a non-negative page index');
    }

    const book = await getOwnedBook(bookId, currentUser(req));
    if (!book) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    if (book.status === 'published') return publishedConflict(res);

    // movePage enforces that both spots are story pages ("The End" stays last).
    const updated = await movePage(bookId, from, to);
    if (!updated) {
      res.status(409).json({ ok: false, error: 'That page cannot move there' });
      return;
    }
    res.json({ ok: true, book: updated, pageIndex: to });
  }),
);

booksApiRouter.post(
  '/:id/pages/:index/duplicate',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const index = Number.parseInt(req.params.index ?? '', 10);

    const book = await getOwnedBook(bookId, currentUser(req));
    if (!book) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    if (book.status === 'published') return publishedConflict(res);

    // Copies the already-moderated words, picture, doodle and narration as-is.
    const updated = await duplicatePage(bookId, index);
    if (!updated) {
      res.status(404).json({ ok: false, error: 'Page not found' });
      return;
    }
    res.status(201).json({ ok: true, book: updated, pageIndex: index + 1 });
  }),
);

booksApiRouter.delete(
  '/:id/pages/:index',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const index = Number.parseInt(req.params.index ?? '', 10);

    const book = await getOwnedBook(bookId, currentUser(req));
    if (!book) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    if (book.status === 'published') return publishedConflict(res);

    const updated = await deletePage(bookId, index);
    if (!updated) {
      res.status(404).json({ ok: false, error: 'Page not found' });
      return;
    }
    res.json({ ok: true, book: updated });
  }),
);

// --- Close the book with a "The End" page --------------------------------------
booksApiRouter.post(
  '/:id/end',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const existing = await getOwnedBook(bookId, currentUser(req));
    if (!existing) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    if (existing.status === 'published') return publishedConflict(res);
    if (existing.pages.at(-1)?.isEnd) {
      res.status(409).json({ ok: false, error: 'This book already has a "The End" page' });
      return;
    }
    // Fixed, safe text — no moderation or illustration needed.
    const added = await addPage(bookId, { text: 'The End', imagePrompt: '', image: null, isEnd: true });
    if (!added) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    res.status(201).json({ ok: true, book: added.book, pageIndex: added.pageIndex });
  }),
);

// --- Remove the "The End" page so the story can keep going ----------------------
booksApiRouter.delete(
  '/:id/end',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const existing = await getOwnedBook(bookId, currentUser(req));
    if (!existing) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    if (existing.status === 'published') return publishedConflict(res);
    if (!existing.pages.at(-1)?.isEnd) {
      res.status(409).json({ ok: false, error: 'This book has no "The End" page to remove' });
      return;
    }
    const book = await removeEndPage(bookId);
    if (!book) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    res.json({ ok: true, book });
  }),
);

// --- Edit session: snapshot on open, restore on cancel --------------------------
// Reopening a finished book for editing snapshots it first, so "cancel" can
// throw away every change (words, pictures, authors) in one move.
booksApiRouter.post(
  '/:id/edit-session',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const book = await getOwnedBook(bookId, currentUser(req));
    if (!book) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    if (book.status === 'published') return publishedConflict(res);
    const ok = await snapshotBook(bookId);
    if (!ok) {
      res.status(500).json({ ok: false, error: 'Could not start editing — try again' });
      return;
    }
    res.json({ ok: true });
  }),
);

booksApiRouter.post(
  '/:id/edit-session/cancel',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const book = await getOwnedBook(bookId, currentUser(req));
    if (!book) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    if (book.status === 'published') return publishedConflict(res);
    // No snapshot (e.g. already cancelled) → the book is returned as-is.
    const restored = await revertBook(bookId);
    res.json({ ok: true, book: restored ?? book });
  }),
);

// --- Update the "written by" author names (title page) --------------------------
booksApiRouter.patch(
  '/:id/authors',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const authors = parseAuthors(req.body);

    const existing = await getOwnedBook(bookId, currentUser(req));
    if (!existing) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    if (existing.status === 'published') return publishedConflict(res);

    // Author names are displayed on the title page — moderate them.
    if (authors.length > 0) {
      const verdict = await guardText(authors, 'input');
      if (!verdict.allowed) {
        res.status(403).json({
          ok: false,
          blocked: true,
          stage: 'input',
          message: verdict.childMessage,
          verdict: { severity: verdict.severity, categories: verdict.categories },
        });
        return;
      }
    }

    const book = await updateAuthors(bookId, authors);
    if (!book) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    res.json({ ok: true, book });
  }),
);

// --- Publish to the library (one-way; the book becomes read-only) --------------
booksApiRouter.post(
  '/:id/publish',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    // Only the owner may publish their own book.
    if (!(await getOwnedBook(bookId, currentUser(req)))) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    const book = await publishBook(bookId);
    if (!book) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    // Publishing keeps the edits — any pending edit-session snapshot is stale.
    await discardSnapshot(book.id);
    res.json({ ok: true, book: summarize(book) });
  }),
);

// --- Remove a book -------------------------------------------------------------
booksApiRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    // Only the owner may delete their own book.
    if (!(await getOwnedBook(bookId, currentUser(req)))) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    const ok = await deleteBook(bookId);
    if (!ok) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    await discardSnapshot(bookId);
    res.json({ ok: true });
  }),
);

// --- The library: published books, browsable by everyone -----------------------
export const libraryApiRouter = Router();

libraryApiRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const books = await listBooks();
    res.json({ ok: true, books: books.filter((b) => b.status === 'published').map(summarize) });
  }),
);
