import { config } from '../config.js';
import type { Book } from '../books/store.js';
import {
  ProviderNotConfiguredError,
  ProviderRequestError,
  type GenerationResult,
  type Provider,
} from './types.js';

/**
 * Storybook "fairy dust": rewrite one page's words with perfect grammar and
 * smooth flow in the context of the rest of the story, keeping the child's
 * meaning, voice and events — in language an elementary-aged child can read.
 *
 * Powered by Google Gemini (FAIRY_DUST_MODEL, default gemini-2.0-flash) using
 * the same AI Studio key as image generation (GEMINI_API_KEY). Wrapped as a
 * Provider so runGuardedGeneration moderates the child's words on the way in
 * and the rewrite on the way out. The route keeps the child's own words intact
 * (page.sourceText) so every sprinkle starts from them again and can land on a
 * different fix.
 */

export interface SprinkleRequest {
  book: Book;
  /** Index of the page being polished. */
  pageIndex: number;
  /** The words to polish — the child's original (background) text. */
  sourceText: string;
}

// Gemini structured output (OpenAPI-style responseSchema).
const SPRINKLE_SCHEMA = {
  type: 'OBJECT',
  properties: { text: { type: 'STRING' } },
  required: ['text'],
} as const;

const EDITOR_PERSONA =
  "You are a gentle, magical editor inside a children's picture-book app for ages 5-12. " +
  'A child sprinkled fairy dust on one page of their story, asking you to polish their words. ' +
  'Rules:\n' +
  '- Fix all grammar, spelling and punctuation.\n' +
  '- Make the page read smoothly and flow naturally with the pages around it ' +
  '(carry tense, names and events consistently; a good opening/transition if needed).\n' +
  "- Keep the child's meaning, characters, events and voice EXACTLY — you polish, you never " +
  'invent new plot, characters or details.\n' +
  '- Use words an elementary-aged child can read; this is a picture book.\n' +
  '- Keep roughly the same length (never more than a quarter longer) and keep their ' +
  'paragraph breaks.\n' +
  '- Fairy dust sparkles differently every time: when there are several good ways to fix ' +
  'something, feel free to pick a different one than you might have last time.\n' +
  'Return ONLY the polished page text, as JSON: {"text": "..."}';

/** The whole story as context, with the target page marked. Bounded. */
function storyForPrompt(book: Book, pageIndex: number, maxChars = 4000): string {
  const lines: string[] = [`Story title: "${book.title}"`];
  for (const [i, p] of book.pages.entries()) {
    if (p.isEnd) continue;
    const marker = i === pageIndex ? ' <-- THE PAGE BEING POLISHED' : '';
    lines.push(`Page ${i + 1}${marker}: ${p.text}`);
  }
  let text = lines.join('\n');
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}…`;
  return text;
}

interface GeminiTextResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
}

export const fairyDustProvider: Provider<SprinkleRequest> = {
  name: 'fairy dust',

  isConfigured() {
    return Boolean(config.providers.gemini.apiKey);
  },

  inputTexts(req) {
    return [req.sourceText];
  },

  async generate(req): Promise<GenerationResult> {
    const { apiKey, baseUrl } = config.providers.gemini;
    if (!apiKey) throw new ProviderNotConfiguredError('fairy dust');
    const user =
      `Here is the story so far:\n\n${storyForPrompt(req.book, req.pageIndex)}\n\n` +
      `The child's words on the page being polished:\n"""${req.sourceText}"""\n\n` +
      'Polish them now.';

    const raw = await callGemini(apiKey, baseUrl, EDITOR_PERSONA, user, SPRINKLE_SCHEMA);
    const polished = pickString(raw, 'text');
    if (!polished) {
      throw new ProviderRequestError('fairy dust', 502, 'the editor returned no text');
    }

    return {
      textToModerate: [polished],
      metadataToModerate: [],
      result: { text: polished },
    };
  },
};

// --- Draft sprinkle: polish the words in an open editor (nothing stored) --------

export interface DraftSprinkleRequest {
  book: Book;
  /** The live words in the editor. Moderated on input. */
  text: string;
  /** When editing a saved page: exclude its stored text from the context. */
  excludeIndex?: number;
}

export const draftSprinkleProvider: Provider<DraftSprinkleRequest> = {
  name: 'fairy dust',

  isConfigured() {
    return Boolean(config.providers.gemini.apiKey);
  },

  inputTexts(req) {
    return [req.text];
  },

  async generate(req): Promise<GenerationResult> {
    const { apiKey, baseUrl } = config.providers.gemini;
    if (!apiKey) throw new ProviderNotConfiguredError('fairy dust');

    const user =
      `Here is the story so far:\n\n${storyWithPictures(req.book, req.excludeIndex)}\n\n` +
      `The child's words for the page being written:\n"""${req.text}"""\n\n` +
      'Polish them now.';

    const raw = await callGemini(apiKey, baseUrl, EDITOR_PERSONA, user, SPRINKLE_SCHEMA);
    const polished = pickString(raw, 'text');
    if (!polished) {
      throw new ProviderRequestError('fairy dust', 502, 'the editor returned no text');
    }

    return {
      textToModerate: [polished],
      metadataToModerate: [],
      result: { text: polished },
    };
  },
};

// --- Suggest an image prompt: narrative -> concrete illustration instruction ----

export interface SuggestPromptRequest {
  book: Book;
  /** The page narrative to translate into a picture idea. Moderated on input. */
  text: string;
}

const SUGGEST_SCHEMA = {
  type: 'OBJECT',
  properties: { imagePrompt: { type: 'STRING' } },
  required: ['imagePrompt'],
} as const;

const ILLUSTRATOR_PERSONA =
  "You are the art director of a children's picture-book app for ages 5-12. Given one page's " +
  'story words (and the story so far), write "imagePrompt": a short, concrete instruction ' +
  "telling the illustrator exactly what to DRAW for this page — do NOT copy the story " +
  'sentences. Rules:\n' +
  '- Start with "Draw ".\n' +
  '- Show the main moment of the page as one visual scene: who is in it, what each character ' +
  'is doing, and where.\n' +
  "- Describe each character's appearance concretely, carrying visual details established by " +
  'the cover description and earlier pictures (species, size, clothing, colors — e.g. if the ' +
  'cover shows a small mouse wearing a red cape, say "a small mouse wearing a red cape").\n' +
  '- Turn feelings and abstract lines into visible things (e.g. "made fun of him" -> other ' +
  'mice pointing and laughing).\n' +
  '- 1-3 sentences, gentle and child-friendly. No text or lettering in the picture.';

/**
 * The story with its VISUAL details (cover description + earlier picture
 * prompts), so the crafted image prompt keeps characters looking consistent.
 * `excludeIndex` drops a page whose words are being rewritten live.
 */
function storyWithPictures(book: Book, excludeIndex?: number, maxChars = 4500): string {
  const lines: string[] = [`Story title: "${book.title}"`];
  if (book.coverPrompt) lines.push(`Cover picture: ${book.coverPrompt}`);
  for (const [i, p] of book.pages.entries()) {
    if (p.isEnd || i === excludeIndex) continue;
    lines.push(`Page ${i + 1}: ${p.text}`);
    if (p.imagePrompt) lines.push(`Page ${i + 1} picture: ${p.imagePrompt}`);
  }
  let text = lines.join('\n');
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}…`;
  return text;
}

export const suggestPromptProvider: Provider<SuggestPromptRequest> = {
  name: 'fairy dust',

  isConfigured() {
    return Boolean(config.providers.gemini.apiKey);
  },

  inputTexts(req) {
    return [req.text];
  },

  async generate(req): Promise<GenerationResult> {
    const { apiKey, baseUrl } = config.providers.gemini;
    if (!apiKey) throw new ProviderNotConfiguredError('fairy dust');

    const user =
      `Here is the story so far:\n\n${storyWithPictures(req.book)}\n\n` +
      `The story words on the page being illustrated:\n"""${req.text}"""\n\n` +
      'Write the imagePrompt for this page.';

    const raw = await callGemini(apiKey, baseUrl, ILLUSTRATOR_PERSONA, user, SUGGEST_SCHEMA);
    const imagePrompt = pickString(raw, 'imagePrompt').slice(0, 1000);
    if (!imagePrompt) {
      throw new ProviderRequestError('fairy dust', 502, 'no picture idea came back');
    }

    return {
      textToModerate: [imagePrompt],
      metadataToModerate: [],
      result: { imagePrompt },
    };
  },
};

// --- Fairy Godmother: polish + three ways the story could continue --------------

export interface GodmotherRequest {
  book: Book;
  /** The child's words on the page so far — may be empty. Moderated on input. */
  text: string;
  /** Where the page sits: an index (editing) or index-0.5 (new page/insert). */
  targetPos: number;
  /** The page being edited (its stored text is replaced by `text`). */
  excludeIndex?: number;
}

const GODMOTHER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    text: { type: 'STRING' },
    suggestions: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['text', 'suggestions'],
} as const;

const GODMOTHER_PERSONA =
  "You are the Fairy Godmother in a children's picture-book app (ages 5-12). A child is " +
  'writing ONE page of their story and asked for your help. Return JSON with:\n' +
  '1. "text" — if the child has already written words for this page, polish them: fix all ' +
  'grammar, spelling and punctuation, smooth the flow with the surrounding pages, keep their ' +
  "meaning, characters, events and voice EXACTLY (you polish, you never invent), elementary " +
  'vocabulary, roughly the same length. If the child has written nothing, return "".\n' +
  '2. "suggestions" — exactly 3 different single sentences that could come NEXT on this page, ' +
  'continuing straight on from the child\'s words (or opening the page if they are empty). ' +
  'Each suggestion should take the story a different direction — for example an action, a ' +
  'feeling, or a small surprise. Keep each under 20 words, elementary vocabulary, gentle and ' +
  'wholesome. They must fit the story: consistent with the earlier pages, and when LATER pages ' +
  'exist, each suggestion must lead naturally toward what happens in them (never contradict ' +
  'them). Do not repeat a sentence the story already has.';

/** The story split around the page being written, so suggestions bridge both ways. */
function storyAround(book: Book, targetPos: number, excludeIndex?: number): string {
  const before: string[] = [];
  const after: string[] = [];
  for (const [i, p] of book.pages.entries()) {
    if (p.isEnd || i === excludeIndex || !p.text.trim()) continue;
    (i < targetPos ? before : after).push(`Page ${i + 1}: ${p.text}`);
  }
  const parts = [`Story title: "${book.title}"`];
  parts.push(
    before.length ? `Earlier pages:\n${before.join('\n')}` : 'This is the very first page.',
  );
  if (after.length) {
    parts.push(
      `Later pages (the page being written must connect toward these):\n${after.join('\n')}`,
    );
  }
  let text = parts.join('\n\n');
  if (text.length > 4500) text = `${text.slice(0, 4500)}…`;
  return text;
}

export const godmotherProvider: Provider<GodmotherRequest> = {
  name: 'fairy godmother',

  isConfigured() {
    return Boolean(config.providers.gemini.apiKey);
  },

  inputTexts(req) {
    return [req.text];
  },

  async generate(req): Promise<GenerationResult> {
    const { apiKey, baseUrl } = config.providers.gemini;
    if (!apiKey) throw new ProviderNotConfiguredError('fairy godmother');

    const user =
      `${storyAround(req.book, req.targetPos, req.excludeIndex)}\n\n` +
      `The child's words on the page being written so far:\n"""${req.text}"""\n\n` +
      'Polish them (or return "" if empty), and offer your 3 suggestions for the next sentence.';

    const raw = await callGemini(apiKey, baseUrl, GODMOTHER_PERSONA, user, GODMOTHER_SCHEMA);
    const polished = pickString(raw, 'text');
    const suggestions = (Array.isArray(raw.suggestions) ? raw.suggestions : [])
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s) => s.trim().slice(0, 300))
      .slice(0, 3);
    if (!suggestions.length) {
      throw new ProviderRequestError('fairy godmother', 502, 'no suggestions came back');
    }

    return {
      textToModerate: [polished, ...suggestions],
      metadataToModerate: [],
      result: { text: polished, suggestions },
    };
  },
};

// --- Shared Gemini plumbing ------------------------------------------------------

async function callGemini(
  apiKey: string,
  baseUrl: string,
  system: string,
  user: string,
  schema: object,
): Promise<Record<string, unknown>> {
  const model = config.providers.fairyDust.model;
  const res = await fetch(`${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        maxOutputTokens: 2048,
        // A little sampling room so repeat sprinkles can land on different fixes.
        temperature: 1.0,
      },
    }),
  });
  if (!res.ok) {
    throw new ProviderRequestError('fairy dust', res.status, await safeText(res));
  }

  const data = (await res.json()) as GeminiTextResponse;
  const raw = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!raw.trim()) {
    throw new ProviderRequestError(
      'fairy dust',
      502,
      `no text returned (finishReason=${data.candidates?.[0]?.finishReason ?? 'unknown'})`,
    );
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Some models occasionally return the plain text despite JSON mode.
    return { text: raw.trim() };
  }
}

/** A trimmed, bounded string field from the model's JSON (page-text sized). */
function pickString(raw: Record<string, unknown>, key: string): string {
  const v = raw[key];
  return (typeof v === 'string' ? v : '').trim().slice(0, 2200);
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}
