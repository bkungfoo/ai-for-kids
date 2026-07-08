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
| `POST /v1/images` | Gemini / Nano Banana 2 | text-to-image              | prompt in; captions out; image via Vision SafeSearch |
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

`MODERATION_MODEL` defaults to `claude-opus-4-8` — for child safety, correctness
matters more than cost or latency. For high request volumes where you want lower
latency, `claude-haiku-4-5` is a strong, much faster alternative. `MODERATION_EFFORT`
(`low`/`medium`/`high`) trades depth for speed.

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
| `POST /v1/books/:id/pages` `{text, imagePrompt}` | moderate story text → guarded illustration → append page |
| `DELETE /v1/books/:id` | remove a book |

Safety: titles and story text are moderated as *input* before being stored
(they are displayed back); every illustration runs the full pipeline (input
moderation → Gemini → output moderation → Vision SafeSearch). Books persist as
JSON files under `data/books/`.

## Operator review area (adults only)

Optional audit console at `/review` that generates content and shows it **with
every stage verdict and internal reason — even when the child app would block
it**. Disabled (404) unless `REVIEW_PASSWORD` is set; separate password,
cookie, and session TTL (`REVIEW_SESSION_TTL_HOURS`, default 4h); operator
views of blocked content are logged. Never linked from the kids UI.

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
