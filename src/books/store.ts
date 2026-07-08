import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
  /** The prompt the child used for the illustration (kept for regeneration). */
  imagePrompt: string;
  /** The illustration shown on the right-hand page. */
  image: BookImage | null;
  /** True for the closing "The End" page. */
  isEnd?: boolean;
}

/** 'draft' books live on the owner's shelf; 'published' ones appear in the library. */
export type BookStatus = 'draft' | 'published';

export interface Book {
  id: string;
  title: string;
  /** Author names shown on the cover (children's first names, moderated on input). */
  authors: string[];
  status: BookStatus;
  cover: BookImage | null;
  /** The prompt used for the current cover (kept for regeneration prefill). */
  coverPrompt?: string;
  pages: BookPage[];
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
): Promise<Book> {
  const now = new Date().toISOString();
  const book: Book = {
    id: randomUUID(),
    title,
    authors,
    status: 'draft',
    cover,
    coverPrompt,
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
  book.updatedAt = new Date().toISOString();
  await save(book);
  return book;
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

export async function addPage(id: string, page: BookPage): Promise<Book | undefined> {
  const book = await getBook(id);
  if (!book) return undefined;
  book.pages.push(page);
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

export async function deleteBook(id: string): Promise<boolean> {
  const file = fileFor(id);
  if (!file) return false;
  try {
    await unlink(file);
    return true;
  } catch {
    return false;
  }
}
