# child-safe-ai

A lightweight web gateway that sits **in front of** generative-AI providers and
moderates text for **child safety** in both directions:

1. **Inbound** — every prompt a child sends is checked *before* any provider is
   called (no unsafe request ever reaches Suno / ElevenLabs / Gemini / Claude).
2. **Outbound** — every text result and piece of metadata coming back is
   re-checked *before* it reaches the child.

Moderation is performed by Claude using a child-safety rubric, so it catches
nuance a wordlist can't (intent, context, PII solicitation, jailbreak attempts).

```
child ──▶ gateway ──[input moderation]──▶ provider ──[output moderation]──▶ child
                     (block if unsafe)               (block/redact if unsafe)
```

## Providers wired in

| Route        | Provider              | Purpose                          | Moderated |
|--------------|-----------------------|----------------------------------|-----------|
| `POST /v1/music`  | Suno             | music generation                 | prompt in; lyrics + title out |
| `POST /v1/voice`  | ElevenLabs       | TTS / voice generation           | text in (audio out) |
| `POST /v1/images` | Nano Banana Pro (Replicate) / Nano Banana 2 (Gemini) | text-to-image | prompt in; captions out; image via Vision SafeSearch |
| `POST /v1/code`   | Claude Code      | "vibe coding" for kids           | prompt in; generated code out |

Each provider is an adapter implementing a small interface
(`src/providers/types.ts`). The provider HTTP shapes are templates — adjust the
request/response mapping to the exact API version you integrate against.

## Quick start

```bash
cp .env.example .env        # then set ANTHROPIC_API_KEY (+ any provider keys)
npm install
npm run dev                 # watch mode, or: npm run build && npm start
```

```bash
curl -s localhost:8080/health | jq
curl -s -X POST localhost:8080/v1/code \
  -H 'content-type: application/json' \
  -d '{"prompt":"make a bouncing ball game in HTML"}' | jq
```

### Response shapes

Allowed:
```json
{ "ok": true, "result": { ... } }
```

Blocked (HTTP 403) — `message` is a gentle, age-appropriate line; `verdict`
exposes only severity + categories (never the internal reasoning):
```json
{ "ok": false, "blocked": true, "stage": "input",
  "message": "Let's try a different idea — keep it friendly and safe!",
  "verdict": { "severity": "high", "categories": ["weapons"] } }
```

Other statuses: `400` invalid body · `501` provider not configured ·
`502` upstream provider failed · `503` server busy (load shed).

## How the safety engine works

- **Rubric** (`src/safety/rubric.ts`) — the moderator's system prompt, written
  for ages ~5–12. It treats the text under review strictly as **data**, never
  instructions, so content can't jailbreak the moderator.
- **Structured verdict** — moderation uses Claude structured outputs to return a
  typed `{ allowed, severity, categories[], reason, childMessage }`, so results
  are predictable and easy to act on.
- **Prompt caching** — the (stable) rubric is cached, cutting cost/latency on
  every check.
- **Fail-closed** — if a moderation call itself errors, the request is blocked
  by default (`FAIL_CLOSED=true`). This is the safe choice for children; set it
  to `false` to fail open.
- **Image SafeSearch** (`src/safety/safeSearch.ts`) — every generated image is
  screened with Google Cloud Vision **SafeSearch Detection** before it is
  returned. Blocks when adult/racy/violence likelihood ≥ `SAFESEARCH_BLOCK_AT`
  (default `POSSIBLE`; medical needs one step higher). Auth: `VISION_API_KEY`
  if set, else Application Default Credentials / the GCE metadata token. Also
  fail-closed.

### Choosing the moderation model

`MODERATION_MODEL` picks both the model and the provider (inferred from the id:
`claude-*` → Anthropic, `gemini-*` → Google). It defaults to `claude-opus-4-8` —
for child safety, correctness matters more than cost or latency. Cheaper/faster
alternatives: `claude-haiku-4-5`, or `gemini-3.1-flash-lite` (runs on
`GEMINI_API_KEY`; same rubric, same structured verdict). `MODERATION_EFFORT`
(`low`/`medium`/`high`) trades depth for speed on the Claude engine.

## Authentication

The gateway is gated by a login page (`GET /login`) with a **single account and
no sign-up**:

- Username: `HarborHouse`
- Password: `hhai123!`

(Override via `AUTH_USERNAME` / `AUTH_PASSWORD`.) Credentials are checked in
constant time; a successful login mints an in-memory session delivered as an
httpOnly cookie (`SESSION_TTL_HOURS`, default 12h). `POST /logout` ends it.

- `GET /` — authenticated landing page (redirects to `/login` when signed out).
- `POST /v1/*` — all generation endpoints require a session, else `401`.
- `GET /health` — left open for readiness checks.

For production, serve over HTTPS and set `COOKIE_SECURE=true`.

## Storybooks

The image tool is a **picture-storybook maker** (`/books`; `/images` redirects
there). Kids create a book with a title (a cover is painted from it), then add
pages: **story words on the left-hand page, an illustration on the right**. The
picture is generated from a prompt that is deliberately **separate** from the
story sentences.

API (behind the child session, all content moderated):

| Route | Purpose |
|-------|---------|
| `GET /v1/books` | list books (id, title, cover, page count) |
| `POST /v1/books` `{title}` | moderate title → paint cover → create book |
| `GET /v1/books/:id` | full book with pages + images |
| `POST /v1/books/:id/pages` `{text, imagePrompt, insertAt?}` | moderate story text → guarded illustration → append page (or insert at `insertAt`) |
| `POST /v1/books/:id/pages/:index/move` `{to}` | reorder story pages ("The End" stays last) |
| `POST /v1/books/:id/pages/:index/duplicate` | copy a page (words, picture, doodle) right after itself |
| `DELETE /v1/books/:id/pages/:index` | remove one story page |
| `POST /v1/books/:id/pages/:index/narration` | read-aloud audio for a page (see below) |
| `POST /v1/books/:id/pages/:index/sprinkle` | fairy dust: AI-polish the page's words (see below) |
| `DELETE /v1/books/:id` | remove a book |

**Read to me.** Every page (and the cover, which offers *"Read this book to
me"* with automatic page turning) has a 🔊 button. Narration runs through the
guarded pipeline on the first configured engine — ElevenLabs
(`ELEVENLABS_NARRATOR_VOICE`) when its key is set, otherwise **Gemini TTS** on
the AI Studio key (`GEMINI_TTS_MODEL`/`GEMINI_TTS_VOICE`, delivered "warmly,
for a young child"; compressed to MP3 via ffmpeg) — and is cached on the page
(`page.narration`, keyed by engine + voice + speed so config changes
regenerate instead of replaying stale audio, and cleared when the words
change). Narration is also **pre-generated in the background** whenever a
page's words are created or changed (add page, edit text, fairy dust), so the
first "Read to me" starts instantly. Playback tempo is `NARRATION_SPEED`
(default 1.2). It is allowed on published
library books too — derived audio of already-moderated words, not an edit.
With neither engine configured the reader falls back to the browser's built-in
speech synthesis, which also highlights each word as it is spoken.

**Fairy dust.** In edit mode a 🪄 button on the writing page has a rainbow wand
sweep across the text in a trail of sparkly dust; when the dust vanishes the
child's words reappear with perfect grammar, flowing smoothly with the rest of
the story, in elementary-age language (Google Gemini via `GEMINI_API_KEY`;
`FAIRY_DUST_MODEL`, default `gemini-3.1-flash-lite`; guarded pipeline:
the words are moderated in, the rewrite is moderated out). The child's own
words are kept intact as a background state (`page.sourceText`), so every
sprinkle re-polishes the *original* and can land on a different fix. If the
child then hand-edits the words, that edit becomes the new background state and
future sprinkles polish it instead. Sprinkling clears the page's cached
narration (the words changed).

Fairy dust also works on the **new-page form** before the page is made
(`POST /v1/books/:id/sprinkle-draft`): it polishes the draft words with the
same background-state rules, kept on the client draft.

**Ask Fairy Godmother.** Beside the sprinkle button (on the new-page form and
inside "Edit text"), a 🧚 button (`POST /v1/books/:id/godmother`) sends the
Fairy Godmother flying across the page in a trail of dust: she polishes
whatever the child has written (same rules as fairy dust), then offers **three
possible next sentences**, each taking the story a different direction. Her
context runs both ways — pages before AND after the one being written — so
mid-book suggestions bridge toward what already happens later. Clicking a
sentence accepts it (it fades in as rainbow sparkle-text and solidifies into
ink); "No thanks" rejects all three; she can always be asked again.

**Suggest image prompt.** On the picture side of the new-page form, a 💡
button (`POST /v1/books/:id/suggest-image-prompt`) translates the narrative on
the left into a concrete **illustration instruction** — a "Draw …" scene with
each character's appearance carried from the cover description and earlier
picture prompts (e.g. "a small mouse wearing a red cape") and feelings turned
into visible actions — and fills the prompt box (overwriting whatever was
there). Nothing is painted until the child clicks **🖌️ Paint it!**.

**Page management.** In edit mode each page has tools to move it earlier/later
(reordering never crosses the "The End" page), insert a new page before or
after it (the illustration context — story-so-far and reference pictures — is
built from the pages *before* the insert point), or delete it. (A duplicate
endpoint also exists but is not surfaced in the UI.)

**Draw on the pictures.** In edit mode, a page that already has both its words
and its AI picture shows a pen palette (pen + colors, eraser, clear) so a child
can doodle on top of the illustration. The doodle is saved as a separate
transparent PNG overlay (`page.drawing`) — the AI picture underneath is kept
intact — via `PUT /v1/books/:id/pages/:index/drawing` (owner-only; `null` clears
it). It isn't run through the generation-safety pipeline since it's the child's
own pen strokes (no AI, no text). Not offered while the "change the words" or
"change this picture" forms are open.

Safety: titles and story text are moderated as *input* before being stored
(they are displayed back); every illustration runs the full pipeline (input
moderation → image engine → output moderation → Vision SafeSearch). Books
persist as JSON files under `data/books/`.

### Illustration engine & cross-page consistency

Storybook pictures are painted by one of two engines, selected with
`STORY_IMAGE_PROVIDER`:

- **`replicate` (default)** — **Nano Banana Pro** (Google Gemini 3 Pro Image),
  hosted on Replicate. Needs `REPLICATE_API_TOKEN`.
- **`gemini`** — **Nano Banana 2** (Gemini 3.1 Flash Image), called directly.
  Cheaper. Needs `GEMINI_API_KEY`.

If the selected engine isn't configured, the app falls back to the other one so
it keeps working.

Every image prompt **leads with a child-safety preamble** (before the story
context, reference images, and scene description) instructing the model that
the picture must be gentle and child-safe — reducing how many generations are
lost to the downstream output-moderation/SafeSearch blocks.

The Replicate API is **stateless** — it has no memory of earlier pictures — so
we rebuild the context from the storybook on every call to keep characters,
objects and settings consistent from page to page:

- **prompt** — the scene to draw now, plus reinforcement instructions ("copy the
  same characters, objects, art style — and the same NUMBER of each character —
  from the reference pictures"), with the **whole story** appended as extra
  context (pages before AND after the one being painted, so a mid-book repaint
  or insert honors details established on later pages too);
- **reference images** — the cover (main-character anchor) plus the page
  illustrations NEAREST the target position, from both directions, capped at 6
  (Nano Banana Pro accepts up to 14). A repaint excludes the page's own old
  picture so it doesn't anchor the composition being replaced.

The Gemini engine gets the same three channels (reference pictures as inline
image parts; story so far + scene as the text prompt), so consistency works
whichever engine is active. The child never supplies these context fields — they
are derived entirely from the book.

## Operator review area (adults only)

Optional audit console at `/review` showing the gallery of **generated images
the safety pipeline blocked** (output moderation or SafeSearch), newest first —
each with the prompt/context that produced it, the model's captions, and the
internal verdict reason the child-facing API never exposes. Entries are
recorded automatically by the guarded pipeline into `data/blocked/` (capped at
200; oldest pruned). The console is read-only: operators review what children
already tried, they don't generate anything new. Disabled (404) unless
`REVIEW_PASSWORD` is set; separate password, cookie, and session TTL
(`REVIEW_SESSION_TTL_HOURS`, default 4h); operator views of blocked content are
logged. Never linked from the kids UI.

## Concurrency

Designed for many simultaneous clients (target: ~10). Node serves concurrent
requests on its event loop; on top of that:

- **`MAX_CONCURRENT_REQUESTS`** (default 10) bounds in-flight requests via a
  semaphore (`src/util/semaphore.ts`); excess requests queue briefly.
- **`MAX_QUEUE`** (default 50) sheds load with `503` once the queue is too deep.
- **`MAX_MODERATION_CONCURRENCY`** (default 16) caps simultaneous calls to the
  Anthropic API, so a burst of clients can't fan out unbounded upstream calls.

Within a single request, multiple text fields are moderated concurrently.

## Project layout

```
src/
  index.ts               entry point + graceful shutdown
  server.ts              Express app factory
  config.ts              env-driven config
  safety/
    rubric.ts            child-safety system prompt
    moderator.ts         Claude moderation call (structured output, fail-closed)
    pipeline.ts          batch-moderate a set of fields, combine verdicts
    guardedGeneration.ts orchestrates input → provider → output moderation
    types.ts             Verdict / category types
  providers/
    types.ts             Provider adapter interface
    suno.ts elevenlabs.ts gemini.ts claudeCode.ts
  middleware/
    concurrency.ts asyncHandler.ts errorHandler.ts
  routes/
    index.ts             route wiring + health
    validate.ts          request-body validation
  util/semaphore.ts
```

## Status / next steps

- Verified: builds and runs on `@anthropic-ai/sdk@0.71.x`; health, validation
  (`400`), not-configured (`501`), and `404` paths smoke-tested.
- **Not yet exercised against a live key** in this environment — set
  `ANTHROPIC_API_KEY` and confirm the moderation path end to end before relying
  on it.
- Likely follow-ups: provider response shapes finalized per real API versions,
  audit logging of blocked attempts, per-client auth/rate limits, and streaming
  passthrough for audio.
```
