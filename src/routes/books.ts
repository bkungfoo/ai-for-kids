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
  updateIntroNarration,
  updatePage,
  type Book,
  type BookImage,
  type BookPage,
} from '../books/store.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { elevenLabsProvider } from '../providers/elevenlabs.js';
import { geminiTtsProvider } from '../providers/geminiTts.js';
import {
  draftSprinkleProvider,
  fairyDustProvider,
  godmotherProvider,
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

/** Story text that fits the budget (pages nearest the target win). */
const STORY_CONTEXT_MAX_CHARS = 2500;

/**
 * Cover + up to five page images. Nano Banana Pro accepts up to 14 references;
 * we keep it small (the cover as the main-character anchor, plus the pages
 * nearest the one being painted) to bound the request while staying visually
 * consistent.
 */
const MAX_REFERENCE_IMAGES = 6;

/**
 * The scene to draw for one page, with reinforcement instructions. The story
 * is passed SEPARATELY (as `context`) and other pages' pictures as reference
 * images, so a stateless engine can still keep characters and objects consistent.
 */
function pageScenePrompt(
  book: Book,
  pageText: string,
  imagePrompt: string,
  hasReferences: boolean,
): string {
  const reinforcement = hasReferences
    ? 'You are also given reference pictures from other pages of THIS SAME book (earlier and ' +
      'later ones). Copy the exact same characters (their faces, hair, skin tone and clothing), ' +
      'objects and art style from those reference pictures so the whole book looks consistent — ' +
      'the SAME NUMBER of each character or group as the other pictures show, wearing the same ' +
      'clothes — including any changes the story already made to them (for example, a scraped ' +
      'knee stays scraped).'
    : 'Keep the picture consistent with the rest of the story — the same characters, places and ' +
      'objects, including any changes that happen to them across the pages.';
  return (
    `Illustration for one page of a children's picture storybook titled "${book.title}", ` +
    'in a bright, colorful, friendly art style. No text, words or lettering in the image.\n' +
    `This page's story: ${pageText}\n` +
    `Draw this scene: ${imagePrompt}\n` +
    reinforcement
  );
}

/**
 * The WHOLE story as context — pages before and after the one being painted —
 * so a mid-book repaint or insert stays consistent with what is established on
 * later pages too (who wears what, how many siblings there are, ...). When the
 * budget bites, the pages nearest the target position win. `targetPos` is the
 * page's index (use index - 0.5 / pages.length - 0.5 for a page that isn't in
 * the array yet, i.e. an insert or append).
 */
function wholeStoryContext(pages: BookPage[], targetPos: number): string | undefined {
  const story = pages
    .map((p, i) => ({ i, text: p.text, isEnd: p.isEnd }))
    .filter((p) => !p.isEnd && p.text.trim());
  const byDistance = [...story].sort(
    (a, b) => Math.abs(a.i - targetPos) - Math.abs(b.i - targetPos),
  );
  const keep = new Set<number>();
  let used = 0;
  for (const p of byDistance) {
    if (used + p.text.length > STORY_CONTEXT_MAX_CHARS) break;
    keep.add(p.i);
    used += p.text.length;
  }
  if (keep.size === 0) return undefined;
  const lines = story
    .filter((p) => keep.has(p.i))
    .map((p) => `Page ${p.i + 1}${p.i === targetPos ? ' (the page being illustrated)' : ''}: ${p.text}`);
  return (
    'The whole story, for consistency (characters, their clothing, places, and how MANY of ' +
    `each character there are must match every other page):\n${lines.join('\n')}`
  );
}

/**
 * Pictures to hand the model as visual references: the cover (main-character
 * anchor) plus the page images NEAREST the target position — from both before
 * and after it, so details established on later pages carry into a repaint or
 * a mid-book insert. `excludeIndex` skips the page being repainted (its old
 * picture would anchor the model to the composition we are replacing).
 */
function referenceImages(book: Book, targetPos: number, excludeIndex?: number): BookImage[] {
  const refs: BookImage[] = [];
  if (book.cover) refs.push(book.cover);
  const nearest = book.pages
    .map((p, i) => ({ i, image: p.image }))
    .filter((c): c is { i: number; image: BookImage } => Boolean(c.image) && c.i !== excludeIndex)
    .sort((a, b) => Math.abs(a.i - targetPos) - Math.abs(b.i - targetPos))
    .slice(0, MAX_REFERENCE_IMAGES - refs.length)
    .sort((a, b) => a.i - b.i); // hand them over in book order
  refs.push(...nearest.map((c) => c.image));
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
    // Pre-generate the cover intro so "Read this book to me" starts instantly.
    warmIntroNarration(book.id);
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
    // Hide narration cached under an old voice/speed so the reader regenerates
    // instead of playing stale audio (response only; the file is untouched).
    for (const page of book.pages) {
      if (page.narration && !validNarration(page)) delete page.narration;
    }
    if (book.introNarration && book.introNarration.key !== narrationKey()) {
      delete book.introNarration;
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
    // engine the whole story (context) and the nearest pages' pictures
    // (references) — before AND after the target position, so a mid-book
    // insert stays consistent with what later pages establish too.
    const targetPos = (insertAt ?? existing.pages.length) - 0.5; // between pages
    const refs = referenceImages(existing, targetPos);
    const outcome = await runGuardedGeneration(imageProviderFor(existing.imageEngine), {
      prompt: pageScenePrompt(existing, text, imagePrompt, refs.length > 0),
      context: wholeStoryContext(existing.pages, targetPos),
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
    // Pre-generate the read-aloud audio so "Read to me" starts instantly.
    warmNarration(bookId, added.pageIndex, text);
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

    // Whole-book context: pages AFTER this one count too (characters keep the
    // clothes and group sizes established anywhere in the book). The page's own
    // old picture is excluded so it doesn't anchor the composition we replace.
    const refs = referenceImages(book, index, index);
    const outcome = await runGuardedGeneration(imageProviderFor(book.imageEngine), {
      prompt: pageScenePrompt(book, page.text, imagePrompt, refs.length > 0),
      context: wholeStoryContext(book.pages, index),
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
    // Pre-generate the read-aloud audio for the new words.
    warmNarration(bookId, index, text);
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

/**
 * Cache-validity key for stored narration: engine + voice + speed + format
 * revision. Cached audio is replayed only while this matches (so changing the
 * voice or tempo — or old pre-key entries — regenerates instead of playing
 * stale audio).
 */
function narrationKey(): string {
  if (elevenLabsProvider.isConfigured()) {
    return `el:${config.providers.elevenlabs.narratorVoiceId}:r2`;
  }
  const { model, voice, speed } = config.providers.geminiTts;
  return `gt:${model}:${voice}:${speed}:r2`;
}

function validNarration(page: BookPage) {
  return page.narration && page.narration.key === narrationKey() ? page.narration : undefined;
}

/**
 * Synthesize narration for one page's words through the guarded pipeline.
 * Engine: ElevenLabs when its key is set, else Gemini TTS on the AI Studio
 * key. Returns the narration payload, or the non-200 outcome for forwarding.
 */
async function synthesizeNarration(text: string) {
  const outcome = elevenLabsProvider.isConfigured()
    ? await runGuardedGeneration(elevenLabsProvider, {
        text,
        voiceId: config.providers.elevenlabs.narratorVoiceId,
      })
    : await runGuardedGeneration(geminiTtsProvider, { text });
  if (outcome.status !== 200) return { outcome, narration: undefined };
  const result = outcome.body.result as {
    contentType: string;
    audioBase64: string;
    voiceId: string;
  };
  return {
    outcome,
    narration: {
      mimeType: result.contentType,
      dataBase64: result.audioBase64,
      voiceId: result.voiceId,
      key: narrationKey(),
    },
  };
}

/**
 * Pre-generate a page's narration in the background so the first "Read to me"
 * doesn't lag. Fired (not awaited) after the page's words are created or
 * changed. Saves only if the words are still the same when the audio is ready
 * (a fast follow-up edit wins), and never breaks the request that spawned it.
 */
function warmNarration(bookId: string, pageIndex: number, text: string): void {
  void (async () => {
    try {
      const { narration } = await synthesizeNarration(text);
      if (!narration) return; // engine unconfigured / blocked — nothing to warm
      const book = await getBook(bookId);
      const page = book?.pages[pageIndex];
      if (!book || !page || page.text !== text) return; // page changed/moved meanwhile
      if (validNarration(page)) return; // someone already narrated it
      await updatePage(bookId, pageIndex, { narration });
      logger.info('narration pre-generated', { bookId, pageIndex, bytes: narration.dataBase64.length });
    } catch (err) {
      logger.warn('narration pre-generation failed', {
        bookId,
        pageIndex,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}

/** The spoken cover intro; must match the reader's browser-voice fallback. */
function introText(book: Book): string {
  const a = book.authors.filter(Boolean);
  const by =
    a.length === 0 ? '' : a.length === 1 ? a[0]! : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`;
  return book.title + (by ? `. Written by ${by}.` : '.');
}

/** Pre-generate the cover-intro narration (same guarantees as warmNarration). */
function warmIntroNarration(bookId: string): void {
  void (async () => {
    try {
      const book = await getBook(bookId);
      if (!book) return;
      const text = introText(book);
      const { narration } = await synthesizeNarration(text);
      if (!narration) return;
      const fresh = await getBook(bookId);
      if (!fresh || introText(fresh) !== text) return; // authors changed meanwhile
      if (fresh.introNarration && fresh.introNarration.key === narrationKey()) return;
      await updateIntroNarration(bookId, narration);
      logger.info('intro narration pre-generated', { bookId });
    } catch (err) {
      logger.warn('intro narration pre-generation failed', {
        bookId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}

// The cover intro ("Title. Written by …") — same visibility and caching rules
// as page narration, cached on the book itself.
booksApiRouter.post(
  '/:id/intro-narration',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const book = await getBook(bookId);
    if (!book || (book.owner !== currentUser(req) && book.status !== 'published')) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    const cached =
      book.introNarration && book.introNarration.key === narrationKey()
        ? book.introNarration
        : undefined;
    if (cached) {
      res.json({ ok: true, narration: cached, cached: true });
      return;
    }
    const { outcome, narration } = await synthesizeNarration(introText(book));
    if (!narration) {
      res.status(outcome.status).json(outcome.body);
      return;
    }
    await updateIntroNarration(bookId, narration);
    res.json({ ok: true, narration });
  }),
);

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

    // Cached (and still matching the current voice/speed)? Replay for free.
    const cached = validNarration(page);
    if (cached) {
      res.json({ ok: true, narration: cached, pageIndex: index, cached: true });
      return;
    }

    // 501 only when no narrator engine is configured — the reader then falls
    // back to the browser's built-in speech synthesis.
    const { outcome, narration } = await synthesizeNarration(page.text);
    if (!narration) {
      res.status(outcome.status).json(outcome.body);
      return;
    }
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
    // Pre-generate the read-aloud audio for the polished words.
    warmNarration(bookId, index, polished);
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

// --- Fairy dust on an open words editor (new page OR edit-text; not stored) -----
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

    // When an existing page is being edited, its stored words are excluded from
    // the story context (the live editor text replaces them).
    const editIndex = Number((req.body as { editIndex?: unknown }).editIndex);
    const excludeIndex =
      Number.isInteger(editIndex) && editIndex >= 0 && book.pages[editIndex]
        ? editIndex
        : undefined;

    const outcome = await runGuardedGeneration(draftSprinkleProvider, {
      book,
      text,
      ...(excludeIndex !== undefined ? { excludeIndex } : {}),
    });
    res.status(outcome.status).json(outcome.body);
  }),
);

// --- Fairy Godmother: polish the page's words + 3 next-sentence ideas -----------
// Context runs BOTH ways: earlier pages and later pages (when writing or
// editing mid-book), so her suggestions bridge toward what already happens.
booksApiRouter.post(
  '/:id/godmother',
  asyncHandler(async (req, res) => {
    const bookId = req.params.id ?? '';
    const text = optionalString(req.body, 'text', { maxLength: 2000 }) ?? '';

    const book = await getOwnedBook(bookId, currentUser(req));
    if (!book) {
      res.status(404).json({ ok: false, error: 'Book not found' });
      return;
    }
    if (book.status === 'published') return publishedConflict(res);

    // Either editing an existing page (its stored words are replaced by the
    // live text) or writing a new one at insertAt (defaults to the end).
    const body = req.body as { editIndex?: unknown; insertAt?: unknown };
    const editIndex = Number(body.editIndex);
    let targetPos: number;
    let excludeIndex: number | undefined;
    if (Number.isInteger(editIndex) && editIndex >= 0 && book.pages[editIndex] && !book.pages[editIndex]!.isEnd) {
      targetPos = editIndex;
      excludeIndex = editIndex;
    } else {
      const insertAt = Number(body.insertAt);
      const pos = Number.isInteger(insertAt) && insertAt >= 0
        ? Math.min(insertAt, book.pages.length)
        : book.pages.length;
      targetPos = pos - 0.5;
    }

    const outcome = await runGuardedGeneration(godmotherProvider, {
      book,
      text,
      targetPos,
      ...(excludeIndex !== undefined ? { excludeIndex } : {}),
    });
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
    warmNarration(bookId, added.pageIndex, 'The End');
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
    // "Written by …" changed — re-narrate the cover intro in the background.
    warmIntroNarration(bookId);
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
