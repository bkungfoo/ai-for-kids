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
