import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ImageEngine } from '../providers/types.js';

/**
 * File-backed storybook store. Each book is one JSON file under data/books/
 * (images embedded as base64). Simple and durable enough for this
 * single-account gateway; swap for a real database if it ever grows up.
 */

export interface BookImage {
  mimeType: string;
  dataBase64: string;
}

export interface BookPage {
  /** The story text shown on the left-hand page. */
  text: string;
  /**
   * The child's own words, kept intact while `text` holds a fairy-dust (AI
   * grammar/flow) rewrite. Every sprinkle regenerates from THIS, so sprinkling
   * again gives a fresh fix of the original. Cleared when the child manually
   * edits the words — their edit becomes the new background state.
   */
  sourceText?: string;
  /** The prompt the child used for the illustration (kept for regeneration). */
  imagePrompt: string;
  /** The illustration shown on the right-hand page. */
  image: BookImage | null;
  /** True for the closing "The End" page. */
  isEnd?: boolean;
  /**
   * Cached read-aloud audio for this page's text (generated once, replayed
   * free). Cleared whenever the words change. Null/absent means not narrated.
   */
  narration?: BookNarration | null;
  /**
   * Instrumental background music for the page — plays softly underneath the
   * narration. The audio itself is an mp3 under data/books/music/<id>.mp3
   * (megabytes don't belong inside book JSON). Null/absent means no music.
   */
  music?: PageMusic | null;
}

export interface PageMusic {
  /** Audio file id (uuid) under data/books/music/. */
  id: string;
  /** The (moderated) prompt that produced it — prefilled when changing it. */
  prompt: string;
  mimeType: string;
  /** Which music engine made the chosen take (for A/B comparison). */
  engine?: string;
}

export interface BookNarration {
  mimeType: string;
  dataBase64: string;
  voiceId: string;
  /**
   * Cache-validity key: engine + voice + speed + format revision. A cached
   * narration is replayed only while this matches the current configuration —
   * anything else (including pre-key entries) is regenerated.
   */
  key?: string;
}

/** Where a page's background-music mp3 lives (uuid-checked, like books). */
export function pageMusicFile(musicId: string): string | null {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(musicId)) return null;
  return path.join(DATA_DIR, 'music', `${musicId}.mp3`);
}

/** Persist a freshly generated background-music mp3 and return its id. */
export async function savePageMusicAudio(bytes: Buffer): Promise<string> {
  const id = randomUUID();
  const file = pageMusicFile(id)!;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return id;
}

/** 'draft' books live on the owner's shelf; 'published' ones appear in the library. */
export type BookStatus = 'draft' | 'published';

export interface Book {
  id: string;
  title: string;
  /** The account that created the book — its private "My storybooks" shelf. */
  owner?: string;
  /** Author names shown on the cover (children's first names, moderated on input). */
  authors: string[];
  status: BookStatus;
  cover: BookImage | null;
  /** The prompt used for the current cover (kept for regeneration prefill). */
  coverPrompt?: string;
  /**
   * The engine chosen for this book's pictures (picked when the book is
   * started, so the whole book is illustrated in one consistent style).
   * Absent on older books — those use the configured default.
   */
  imageEngine?: ImageEngine;
  /** Instrumental background music for the COVER (plays under the intro). */
  coverMusic?: PageMusic | null;
  pages: BookPage[];
  /**
   * Cached read-aloud audio for the cover intro ("Title. Written by …") —
   * same keying/invalidation rules as page narration; cleared when the
   * authors change.
   */
  introNarration?: BookNarration;
  /**
   * Narrator for the whole book: the id of a Voices-feature voice (the kid's
   * own clone or a library voice). Absent/null = the default storybook
   * narrator. Changing it re-keys the narration cache, so pages regenerate
   * lazily in the new voice and stay cached per voice.
   */
  narratorVoiceId?: string | null;
  /** Display name of that voice, denormalized for the reader UI. */
  narratorVoiceName?: string | null;
  /** Accounts the owner shared EDIT permission with (never the owner itself).
   * Editors can change content but not publish, delete, share, or transfer. */
  editors?: string[];
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = path.resolve('data', 'books');

function fileFor(id: string): string | null {
  // IDs are UUIDs we mint ourselves; reject anything else so a crafted id can
  // never traverse outside the data directory.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return null;
  return path.join(DATA_DIR, `${id}.json`);
}

async function save(book: Book): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const file = fileFor(book.id);
  if (!file) throw new Error(`invalid book id: ${book.id}`);
  // Write-then-rename so a crash mid-write can't corrupt an existing book.
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(book), 'utf8');
  await rename(tmp, file);
}

export async function createBook(
  title: string,
  authors: string[],
  cover: BookImage | null,
  coverPrompt?: string,
  imageEngine?: ImageEngine,
  owner?: string,
): Promise<Book> {
  const now = new Date().toISOString();
  const book: Book = {
    id: randomUUID(),
    title,
    owner,
    authors,
    status: 'draft',
    cover,
    coverPrompt,
    imageEngine,
    pages: [],
    createdAt: now,
    updatedAt: now,
  };
  await save(book);
  return book;
}

/** Replace the cover artwork (and remember the prompt that painted it). */
export async function updateCover(
  id: string,
  cover: BookImage,
  coverPrompt: string,
): Promise<Book | undefined> {
  const book = await getBook(id);
  if (!book) return undefined;
  book.cover = cover;
  book.coverPrompt = coverPrompt;
  book.updatedAt = new Date().toISOString();
  await save(book);
  return book;
}

export async function getBook(id: string): Promise<Book | undefined> {
  const file = fileFor(id);
  if (!file) return undefined;
  try {
    const book = JSON.parse(await readFile(file, 'utf8')) as Book;
    // Normalize books saved before authors/status existed.
    book.authors ??= [];
    book.status ??= 'draft';
    return book;
  } catch {
    return undefined;
  }
}

/** Replace the author list (title-page "written by" names). */
export async function updateAuthors(id: string, authors: string[]): Promise<Book | undefined> {
  const book = await getBook(id);
  if (!book) return undefined;
  book.authors = authors;
  delete book.introNarration; // the "written by" line changed
  book.updatedAt = new Date().toISOString();
  await save(book);
  return book;
}

/** Set (or clear) the cover's background music. */
export async function updateCoverMusic(
  id: string,
  music: PageMusic | null,
): Promise<Book | undefined> {
  const book = await getBook(id);
  if (!book) return undefined;
  if (music) book.coverMusic = music;
  else delete book.coverMusic;
  book.updatedAt = new Date().toISOString();
  await save(book);
  return book;
}

/** Set (or clear) the cached cover-intro narration. */
export async function updateIntroNarration(
  id: string,
  narration: BookNarration | null,
): Promise<Book | undefined> {
  const book = await getBook(id);
  if (!book) return undefined;
  if (narration) book.introNarration = narration;
  else delete book.introNarration;
  await save(book);
  return book;
}

/** Set (or clear, with null) the book-wide narrator voice. Cached narration is
 * left in place — the narration cache key includes the voice, so stale audio
 * simply stops matching and regenerates in the new voice on demand. */
export async function updateNarratorVoice(
  id: string,
  voiceId: string | null,
  voiceName: string | null,
): Promise<Book | undefined> {
  const book = await getBook(id);
  if (!book) return undefined;
  if (voiceId) {
    book.narratorVoiceId = voiceId;
    book.narratorVoiceName = voiceName;
  } else {
    delete book.narratorVoiceId;
    delete book.narratorVoiceName;
  }
  book.updatedAt = new Date().toISOString();
  await save(book);
  return book;
}

/**
 * Deep-copy a book onto another account's shelf as an editable draft (the
 * "make my own copy" path from the library). Background-music mp3s are
 * duplicated to fresh ids so deleting either book never breaks the other's
 * audio; inline assets (images, narration) copy with the JSON.
 */
export async function cloneBook(id: string, owner: string | undefined): Promise<Book | undefined> {
  const src = await getBook(id);
  if (!src) return undefined;
  const copy: Book = structuredClone(src);
  copy.id = randomUUID();
  copy.owner = owner;
  copy.status = 'draft';
  copy.createdAt = new Date().toISOString();
  copy.updatedAt = copy.createdAt;

  const holders: Array<{ music?: PageMusic | null }> = [copy, ...copy.pages] as Array<{
    music?: PageMusic | null;
  }>;
  // The cover's music lives under a different key; normalize it into the loop.
  const coverHolder = { music: copy.coverMusic ?? null };
  holders[0] = coverHolder;
  for (const holder of holders) {
    if (!holder.music) continue;
    try {
      const file = pageMusicFile(holder.music.id);
      if (!file) throw new Error('bad music id');
      const bytes = await readFile(file);
      holder.music = { ...holder.music, id: await savePageMusicAudio(bytes) };
    } catch {
      holder.music = null; // source mp3 missing — drop the music, keep the book
    }
  }
  if (coverHolder.music) copy.coverMusic = coverHolder.music;
  else delete copy.coverMusic;
  copy.pages.forEach((page, i) => {
    if (holders[i + 1]!.music === null && page.music) page.music = null;
    else if (holders[i + 1]!.music) page.music = holders[i + 1]!.music;
  });

  await save(copy);
  return copy;
}

/** Share edit permission with another account (idempotent). */
export async function addEditor(id: string, username: string): Promise<Book | undefined> {
  const book = await getBook(id);
  if (!book) return undefined;
  const editors = new Set(book.editors ?? []);
  if (username !== book.owner) editors.add(username);
  book.editors = [...editors];
  book.updatedAt = new Date().toISOString();
  await save(book);
  return book;
}

/** Take an account's edit permission away. */
export async function removeEditor(id: string, username: string): Promise<Book | undefined> {
  const book = await getBook(id);
  if (!book) return undefined;
  book.editors = (book.editors ?? []).filter((e) => e !== username);
  book.updatedAt = new Date().toISOString();
  await save(book);
  return book;
}

/** Hand the book to a new owner. The old owner stays on as an editor (they
 * can be removed later), and the new owner comes off the editor list. */
export async function transferBook(id: string, newOwner: string): Promise<Book | undefined> {
  const book = await getBook(id);
  if (!book || !newOwner) return undefined;
  const editors = new Set(book.editors ?? []);
  if (book.owner && book.owner !== newOwner) editors.add(book.owner);
  editors.delete(newOwner);
  book.owner = newOwner;
  book.editors = [...editors];
  book.updatedAt = new Date().toISOString();
  await save(book);
  return book;
}

/**
 * A narrator voice was deleted: scrub it from every book — clear the
 * narrator selection and remove all cached narration recorded in that voice
 * (key prefix elv:<voiceId>:), so those books fall back to the default
 * storybook narrator and re-record cleanly. Returns how many books changed.
 */
export async function purgeNarratorVoice(voiceId: string): Promise<number> {
  const books = await listBooks();
  let touched = 0;
  const keyPrefix = `elv:${voiceId}:`;
  for (const book of books) {
    let changed = false;
    if (book.narratorVoiceId === voiceId) {
      delete book.narratorVoiceId;
      delete book.narratorVoiceName;
      changed = true;
    }
    if (book.introNarration?.key?.startsWith(keyPrefix)) {
      delete book.introNarration;
      changed = true;
    }
    for (const page of book.pages) {
      if (page.narration?.key?.startsWith(keyPrefix)) {
        delete page.narration;
        changed = true;
      }
    }
    if (changed) {
      book.updatedAt = new Date().toISOString();
      await save(book);
      touched += 1;
    }
  }
  return touched;
}

/** Move a book to the public library. Published books can no longer be edited. */
export async function publishBook(id: string): Promise<Book | undefined> {
  const book = await getBook(id);
  if (!book) return undefined;
  if (book.status !== 'published') {
    book.status = 'published';
    book.updatedAt = new Date().toISOString();
    await save(book);
  }
  return book;
}

/** Pull a book off the library — back to an editable draft on the owner's shelf. */
export async function unpublishBook(id: string): Promise<Book | undefined> {
  const book = await getBook(id);
  if (!book) return undefined;
  if (book.status === 'published') {
    book.status = 'draft';
    book.updatedAt = new Date().toISOString();
    await save(book);
  }
  return book;
}

export async function listBooks(): Promise<Book[]> {
  let entries: string[];
  try {
    entries = await readdir(DATA_DIR);
  } catch {
    return []; // data dir not created yet — no books
  }
  const books: Book[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const book = await getBook(entry.slice(0, -'.json'.length));
    if (book) books.push(book);
  }
  // Newest first on the shelf.
  return books.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Add a page. With `insertAt` the page slots in at that index (later pages
 * shift right); otherwise it is appended — but always BEFORE any "The End"
 * page, which stays last.
 */
export async function addPage(
  id: string,
  page: BookPage,
  insertAt?: number,
): Promise<{ book: Book; pageIndex: number } | undefined> {
  const book = await getBook(id);
  if (!book) return undefined;
  const lastStory = book.pages.at(-1)?.isEnd ? book.pages.length - 1 : book.pages.length;
  const index = insertAt === undefined ? lastStory : Math.max(0, Math.min(insertAt, lastStory));
  book.pages.splice(index, 0, page);
  book.updatedAt = new Date().toISOString();
  await save(book);
  return { book, pageIndex: index };
}

/** Move a story page to a new index. Both positions must be story pages. */
export async function movePage(
  id: string,
  from: number,
  to: number,
): Promise<Book | undefined> {
  const book = await getBook(id);
  if (!book) return undefined;
  const lastStory = (book.pages.at(-1)?.isEnd ? book.pages.length - 1 : book.pages.length) - 1;
  if (from < 0 || from > lastStory || to < 0 || to > lastStory || from === to) return undefined;
  const [page] = book.pages.splice(from, 1);
  book.pages.splice(to, 0, page!);
  book.updatedAt = new Date().toISOString();
  await save(book);
  return book;
}

/** Insert a copy of a story page right after it (picture and all). */
export async function duplicatePage(id: string, index: number): Promise<Book | undefined> {
  const book = await getBook(id);
  if (!book) return undefined;
  const page = book.pages[index];
  if (!page || page.isEnd) return undefined;
  const copy = structuredClone(page);
  // Music files aren't reference-counted — the copy starts without music so
  // deleting one page's music can never silence its twin.
  delete copy.music;
  book.pages.splice(index + 1, 0, copy);
  book.updatedAt = new Date().toISOString();
  await save(book);
  return book;
}

/** Remove a single story page ("The End" has its own endpoint). */
export async function deletePage(id: string, index: number): Promise<Book | undefined> {
  const book = await getBook(id);
  if (!book) return undefined;
  const page = book.pages[index];
  if (!page || page.isEnd) return undefined;
  book.pages.splice(index, 1);
  book.updatedAt = new Date().toISOString();
  await save(book);
  return book;
}

/** Merge a partial update into an existing page (e.g. a repainted image). */
export async function updatePage(
  id: string,
  index: number,
  patch: Partial<BookPage>,
): Promise<Book | undefined> {
  const book = await getBook(id);
  if (!book) return undefined;
  const page = book.pages[index];
  if (!page) return undefined;
  book.pages[index] = { ...page, ...patch };
  book.updatedAt = new Date().toISOString();
  await save(book);
  return book;
}

// --- Edit-session snapshots ---------------------------------------------------
// When a finished book is reopened for editing, we snapshot its file first so
// "cancel" can restore everything (words, pictures, authors) in one move.
// Snapshots live in a subdirectory, so listBooks (which scans *.json in the
// main dir) never sees them.

const SNAP_DIR = path.join(DATA_DIR, 'snapshots');

function snapFileFor(id: string): string | null {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return null;
  return path.join(SNAP_DIR, `${id}.json`);
}

/** Copy the book's current state aside. Overwrites any previous snapshot. */
export async function snapshotBook(id: string): Promise<boolean> {
  const file = fileFor(id);
  const snap = snapFileFor(id);
  if (!file || !snap) return false;
  try {
    const data = await readFile(file, 'utf8');
    await mkdir(SNAP_DIR, { recursive: true });
    const tmp = `${snap}.tmp`;
    await writeFile(tmp, data, 'utf8');
    await rename(tmp, snap);
    return true;
  } catch {
    return false;
  }
}

/** Restore the book from its snapshot (and consume the snapshot). */
export async function revertBook(id: string): Promise<Book | undefined> {
  const file = fileFor(id);
  const snap = snapFileFor(id);
  if (!file || !snap) return undefined;
  try {
    const data = await readFile(snap, 'utf8');
    const book = JSON.parse(data) as Book;
    const tmp = `${file}.tmp`;
    await writeFile(tmp, data, 'utf8');
    await rename(tmp, file);
    await unlink(snap).catch(() => {});
    book.authors ??= [];
    book.status ??= 'draft';
    return book;
  } catch {
    return undefined; // no snapshot (or unreadable) — nothing to revert
  }
}

/** Drop a snapshot without restoring (edits kept, e.g. after publish/delete). */
export async function discardSnapshot(id: string): Promise<void> {
  const snap = snapFileFor(id);
  if (!snap) return;
  await unlink(snap).catch(() => {});
}

/** Remove the trailing "The End" page so the story can be continued. */
export async function removeEndPage(id: string): Promise<Book | undefined> {
  const book = await getBook(id);
  if (!book) return undefined;
  if (!book.pages.at(-1)?.isEnd) return book; // nothing to remove
  book.pages.pop();
  book.updatedAt = new Date().toISOString();
  await save(book);
  return book;
}

export async function deleteBook(id: string): Promise<boolean> {
  const file = fileFor(id);
  if (!file) return false;
  // Best-effort cleanup of the book's referenced background-music files.
  const book = await getBook(id);
  try {
    await unlink(file);
  } catch {
    return false;
  }
  for (const page of book?.pages ?? []) {
    const music = page.music ? pageMusicFile(page.music.id) : null;
    if (music) await unlink(music).catch(() => {});
  }
  const coverMusic = book?.coverMusic ? pageMusicFile(book.coverMusic.id) : null;
  if (coverMusic) await unlink(coverMusic).catch(() => {});
  return true;
}
