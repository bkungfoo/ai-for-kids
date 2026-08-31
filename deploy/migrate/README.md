# Migrating Harbor House from GCP to the home mini PC

Moves the app, all content (books, music, analytics, accounts) and both
universes — harborhouse **and** public — onto the Minisforum UM760, served
through Cloudflare instead of the GCP VM + Caddy.

The plan keeps the GCP box running and untouched until the very end, so you can
abort at any point and nothing is lost.

---

## 0. What actually has to move

| Thing | Where it lives | How it moves |
|---|---|---|
| Application code | git | already cloned — just check out the right branch |
| **Content** (39 books, page music, songs) | `data/` — **not in git** | export bundle |
| Accounts + invites | `data/users.json`, `data/invites.json`, `data/invite-secret` | export bundle |
| Analytics history | `data/analytics/*.jsonl` | export bundle |
| API keys, account list | `.env` — **not in git** | export bundle (secret!) |
| TLS / public hostname | Caddy + Let's Encrypt on GCP | replaced by Cloudflare |

Total data ≈ **505 MB**, dominated by `data/books/` (images are embedded
base64 inside the book JSON) and `data/music/`.

There is no database — everything is files on disk, so the migration really is
"copy `data/` and `.env`, then run the same code."

---

## 1. Two GCP dependencies that will NOT survive the move

Read this before cutting over; both are easy, but silent if ignored.

### a) ACE-Step background music (Vertex AI) — will break

`ACESTEP_ENDPOINT_URL` points at a **Vertex AI endpoint in your GCP project**.
The app authenticates with Google *Application Default Credentials* — on the VM
that came free from the metadata server. **The mini PC has no metadata server**,
so those calls will fail.

Pick one:

- **Recommended — turn it off.** It is the experimental HarborHouse-only
  background-music engine, and the analytics log shows **zero** ACE-Step
  generations, i.e. nobody uses it. Comment out `ACESTEP_ENDPOINT_URL` in
  `.env`; the engine simply stops being offered. **Also undeploy the Vertex
  model so it stops costing money** (see §7).
- **Keep it.** Install gcloud on the mini PC and run
  `gcloud auth application-default login`; the adapter already tries ADC
  before the metadata server. You still pay for the endpoint.

### b) Everything else is portable

`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `VISION_API_KEY`, `ELEVENLABS_*`,
`AIMUSICAPI_KEY` and the SMTP settings are plain API keys — they work from any
network. Image SafeSearch uses `VISION_API_KEY` (not ADC), so screening keeps
working.

---

## 2. Prepare the mini PC

```bash
# Node 20+ (the VM runs v20.19.2)
node -v    # if missing:  sudo apt install -y nodejs npm   (or use nvm)

cd ~/code/ai-for-kids          # your clone
git fetch origin
git checkout main
git pull
```

> `main` has everything — the analytics dashboard, print, the public universe
> and these migration scripts were all merged in PR #5.

---

## 3. Export from GCP, transfer, import

**On the GCP VM:**

```bash
cd ~/code/ai-for-kids
./deploy/migrate/export-from-gcp.sh
# -> /tmp/harbor-house-export/harbor-house-<stamp>.tar.gz  (+ .sha256)
```

**On the mini PC** (it pulls; no need to expose the mini PC):

```bash
gcloud compute scp harbor-house-ai-sandbox:/tmp/harbor-house-export/harbor-house-<stamp>.tar.gz . --zone=us-west1-b
gcloud compute scp harbor-house-ai-sandbox:/tmp/harbor-house-export/harbor-house-<stamp>.tar.gz.sha256 . --zone=us-west1-b

cd ~/code/ai-for-kids
./deploy/migrate/import-to-local.sh ~/harbor-house-<stamp>.tar.gz
```

`import-to-local.sh` verifies the checksum, backs up anything already present,
restores `data/` + `.env`, runs `npm ci && npm run build`, installs a systemd
unit pointing at **this** user and path, starts the service, and smoke-tests
`/health`. It also re-verifies book/music/analytics counts against the source
manifest, so a truncated transfer is caught immediately.

No gcloud on the mini PC? Use rsync instead:

```bash
rsync -avP --partial <gcp-user>@34.53.116.202:/tmp/harbor-house-export/harbor-house-<stamp>.tar.gz .
```

---

## 4. Put Cloudflare in front

The app listens on **127.0.0.1:5000** and expects to sit behind a proxy that
terminates TLS (`.env` already has `TRUST_PROXY=true`, `COOKIE_SECURE=true` —
**keep both**, they are correct for Cloudflare).

### Option A — Cloudflare Tunnel (recommended for a home box)

No port forwarding, no exposing your home IP, works behind CGNAT, and TLS is
Cloudflare's problem.

```bash
# install cloudflared, then:
cloudflared tunnel login
cloudflared tunnel create harbor-house
cloudflared tunnel route dns harbor-house harbor-house.brianfoo.ai

# ~/.cloudflared/config.yml
# tunnel: <tunnel-id>
# credentials-file: /home/<you>/.cloudflared/<tunnel-id>.json
# ingress:
#   - hostname: harbor-house.brianfoo.ai
#     service: http://127.0.0.1:5000
#   - service: http_status:404

sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

### Option B — port-forward + Cloudflare proxy

Forward router :443 → mini PC, run Caddy locally (reuse the Caddyfile in
`deploy/migrate/from-source-host/`), set the Cloudflare DNS record to the home
IP with the **orange cloud on**, and SSL/TLS mode **Full (strict)**. You will
also want a dynamic-DNS updater if your home IP changes.

Either way the DNS record for `harbor-house.brianfoo.ai` must exist in the
Cloudflare zone — this is also what fixes the current outage (the domain
currently returns **no NS/SOA at all**, so nothing resolves; make sure the
registrar's nameservers point at Cloudflare).

---

## 5. Verify before you trust it

```bash
# on the mini PC
curl -s localhost:5000/health

# from anywhere, once DNS is live
curl -sI https://harbor-house.brianfoo.ai/login
```

Then in a browser:

- [ ] Log in as **HarborHouse** → storybooks, music, voices all load
- [ ] Log in as a kid account (e.g. **austin**) → shelf shows their shared books
- [ ] Log in as **admin** (public universe) → sees only the public library
- [ ] Open a book → "Read to me" plays cached narration
- [ ] `/dashboard` as HarborHouse → analytics history is present
- [ ] Generate one image → confirms Gemini + SafeSearch keys work from home
- [ ] Print a book → `/books/<id>/print` renders

Sessions are in-memory, so **everyone must log in again** after the move —
that is expected, and the "Server updated" notice will prompt them.

---

## 6. Final cutover (minimise lost work)

Kids may create books between the export and the switch. So:

1. Do steps 3–5 as a **dry run** while GCP still serves traffic.
2. When satisfied, **stop the GCP app** so nothing new is written there:
   `sudo systemctl stop harbor-house`
3. Re-run the export on GCP and re-run `import-to-local.sh` with the new
   tarball (it backs up and replaces `data/`) — a few minutes, and now the two
   sides are identical.
4. Point Cloudflare DNS at the mini PC (§4).
5. Verify (§5).

Keep the GCP VM stopped-but-not-deleted for a week as a rollback: if anything
goes wrong, start it and point DNS back.

---

## 7. After a successful migration (stop paying GCP)

```bash
# the ACE-Step Vertex endpoint still has a model deployed (~$1/hr while warm)
gcloud ai endpoints list --region=us-west1
gcloud ai endpoints undeploy-model <ENDPOINT_ID> --deployed-model-id=<ID> --region=us-west1
gcloud ai endpoints delete <ENDPOINT_ID> --region=us-west1

# then, once you are confident:
gcloud compute instances stop harbor-house-ai-sandbox --zone=us-west1-b
# …and later: instances delete, plus release the static IP harbor-house-external
```

---

## Damaged book files

Both scripts check that every JSON file on disk actually parses, and record the
count in the manifest. This matters because `getBook()` catches parse errors and
returns `undefined`, so a damaged book does not raise an error anywhere — it
just **stops appearing on the shelf**.

The export reports files that were already broken on the source host; the import
compares its own count against the manifest, so it can tell "this was already
broken" apart from "the transfer damaged it". Only the latter means re-transfer.

One such book was found and repaired during migration testing:
**"The Homestead Fairy Forest"** (`26de0e45-…`, owner `Jhunt02`, 12 pages) had
been invisible since 13 Aug. It held a complete document followed by 125 KB of
leftover tail from a longer earlier version — the signature of two concurrent
saves of the same book racing on a shared `data/books/<id>.json.tmp` path. All
stores now use a unique temp name per write, so this cannot recur. To repair a
file like this by hand, keep only the leading valid document:

```python
import json
text = open(path, encoding='utf-8').read()
obj, end = json.JSONDecoder().raw_decode(text)   # end is a CHARACTER index
open(path, 'w', encoding='utf-8').write(text[:end])
```

Back the file up first, and slice **characters, not bytes** — book JSON contains
multibyte UTF-8, so a byte slice at a character offset cuts mid-character and
destroys the file.

---

## Notes / gotchas

- **`.env` is a secret bundle.** It contains every API key plus all account
  passwords in `AUTH_ADDITIONAL_USERS`. Delete the tarball from both machines
  when finished (`shred -u` if you like), and never commit it.
- **`data/invite-secret`** signs public-universe invite approval links. It is in
  the bundle; if it were lost, previously-emailed approval links would stop
  validating.
- **Back up `data/`** on the mini PC — it is now the only copy of the kids'
  books, and unlike GCP there are no automatic disk snapshots. A nightly
  `rsync`/`restic` to an external drive is enough.
- **`data/blocked/`** (12 MB) holds moderation audit images for the operator
  review area; it moves with everything else.
