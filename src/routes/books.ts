import { Router, type Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { geminiProvider } from '../providers/gemini.js';
import { runGuardedGeneration } from '../safety/guardedGeneration.js';
import { guardText } from '../safety/pipeline.js';
import {
  addPage,
  createBook,
  deleteBook,
  getBook,
  listBooks,
  publishBook,
  updateAuthors,
  updateCover,
  updatePage,
  type Book,
  type BookImage,
} from '../books/store.js';
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

/** Consistent style wrapper for every storybook illustration. */
function illustrationPrompt(subject: string): string {
  return (
    'Illustration for a children\'s picture storybook, in a bright, colorful, ' +
    `friendly art style, no text or lettering in the image: ${subject}`
  );
}

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
 * Illustration prompt for a story page, carrying the narrative so far so the
 * image stays consistent with earlier events (a broken oven stays broken).
 */
function pageIllustrationPrompt(
  book: Book,
  priorTexts: string[],
  pageText: string,
  imagePrompt: string,
): string {
  const parts: string[] = [];
  let used = 0;
  for (let i = priorTexts.length - 1; i >= 0; i--) {
    const t = priorTexts[i]!;
    if (used + t.length > STORY_CONTEXT_MAX_CHARS) break;
    parts.unshift(t);
    used += t.length;
  }
  const soFar = parts.length
    ? `\nThe story so far (earlier pages):\n${parts.join('\n')}\n`
    : '';
  return (
    `Illustration for one page of a children's picture storybook titled "${book.title}", ` +
    'in a bright, colorful, friendly art style, no text or lettering in the image.' +
    soFar +
    `\nThis page's story: ${pageText}\n` +
    `\nDraw this scene: ${imagePrompt}\n` +
    'Keep the picture consistent with the story so far — the same characters, places and ' +
    'objects, including any changes that happened to them in earlier pages.'
  );
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

/** 409 helper: published books are frozen. */
function publishedConflict(res: Response): void {
  res.status(409).json({ ok: false, error: 'This book is published and can no longer be changed' });
}

/** Pull the first generated image out of a guarded-generation result. */
function firstImage(result: unknown): BookImage | null {
  const images = (result as { images?: BookImage[] } | undefined)?.images;
  return images && images.length > 0 ? images[0]! : null;
}

// --- Shelf -------------------------------------------------------------------
booksApiRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const books = await listBooks();
    res.json({ ok: true, books: books.map(summarize) });
  }),
);

// --- Create a book: moderate the title, then illustrate the cover from it ----
booksApiRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const title = requireString(req.body, 'title', { maxLength: 80 });
    const authors = parseAuthors(req.body);
    const userCoverPrompt = optionalString(req.body, 'coverPrompt', { maxLength: 1000 });

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

    // Cover image goes through the full guarded pipeline.
    const outcome = await runGuardedGeneration(geminiProvider, {
      prompt: coverPrompt(title, userCoverPrompt),
    });
    if (outcome.status !== 200) {
      res.status(outcome.status).json(outcome.body);
      return;
    }

    const book = await createBook(title, authors, firstImage(outcome.body.result), userCoverPrompt);
    res.status(201).json({ ok: true, book: summarize(book) });
  }),
);

// --- Repaint the front cover with a fresh prompt (title stays in the art) -----
booksApiRouter.post(
  '/:id/cover',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const userCoverPrompt = requireString(req.body, 'coverPrompt', { maxLength: 1000 });

    const book = await getBook(bookId);
    if (!book) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    if (book.status === 'published') return publishedConflict(res);

    const outcome = await runGuardedGeneration(geminiProvider, {
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
    if (!book) {
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

    const existing = await getBook(bookId);
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

    // The illustration runs through the full guarded pipeline, with the story
    // so far as context so the picture stays consistent with earlier events.
    const outcome = await runGuardedGeneration(geminiProvider, {
      prompt: pageIllustrationPrompt(
        existing,
        existing.pages.map((p) => p.text),
        text,
        imagePrompt,
      ),
    });
    if (outcome.status !== 200) {
      res.status(outcome.status).json(outcome.body);
      return;
    }

    const book = await addPage(bookId, {
      text,
      imagePrompt,
      image: firstImage(outcome.body.result),
    });
    if (!book) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    res.status(201).json({ ok: true, book, pageIndex: book.pages.length - 1 });
  }),
);

// --- Repaint a page's picture with a fresh prompt (story text unchanged) ------
booksApiRouter.post(
  '/:id/pages/:index/image',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const index = Number.parseInt(req.params.index ?? '', 10);
    const imagePrompt = requireString(req.body, 'imagePrompt', { maxLength: 1000 });

    const book = await getBook(bookId);
    const page = Number.isInteger(index) && index >= 0 ? book?.pages[index] : undefined;
    if (!book || !page) {
      res.status(404).json({ ok: false, error: 'Page not found' });
      return;
    }
    if (book.status === 'published') return publishedConflict(res);

    const outcome = await runGuardedGeneration(geminiProvider, {
      prompt: pageIllustrationPrompt(
        book,
        book.pages.slice(0, index).map((p) => p.text),
        page.text,
        imagePrompt,
      ),
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

// --- Close the book with a "The End" page --------------------------------------
booksApiRouter.post(
  '/:id/end',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const existing = await getBook(bookId);
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
    const book = await addPage(bookId, { text: 'The End', imagePrompt: '', image: null, isEnd: true });
    if (!book) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    res.status(201).json({ ok: true, book, pageIndex: book.pages.length - 1 });
  }),
);

// --- Update the "written by" author names (title page) --------------------------
booksApiRouter.patch(
  '/:id/authors',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const authors = parseAuthors(req.body);

    const existing = await getBook(bookId);
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
    const book = await publishBook(req.params.id ?? '');
    if (!book) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    res.json({ ok: true, book: summarize(book) });
  }),
);

// --- Remove a book -------------------------------------------------------------
booksApiRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const ok = await deleteBook(req.params.id ?? '');
    if (!ok) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
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
