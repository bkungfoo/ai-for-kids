#!/usr/bin/env bash
# Export everything Harbor House needs to run somewhere else.
#
# Run this ON THE GCP VM, from the repo root:
#     ./deploy/migrate/export-from-gcp.sh
#
# Produces /tmp/harbor-house-export/harbor-house-<stamp>.tar.gz plus a .sha256.
# The bundle holds the runtime state that is NOT in git:
#   data/            books, page music, voices, songs, analytics, users, invites
#   .env             API keys and account list  (SECRET — see the README)
#   system/          the systemd unit and Caddyfile currently in use, for reference
#   MANIFEST.txt     counts + sizes, so the import side can verify nothing was lost
#
# Safe to run repeatedly while the service keeps serving: books are written
# atomically (write-then-rename), so a snapshot mid-write is still consistent.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO"

OUT_DIR="${OUT_DIR:-/tmp/harbor-house-export}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
STAGE="$OUT_DIR/stage-$STAMP"
TARBALL="$OUT_DIR/harbor-house-$STAMP.tar.gz"

echo "==> Harbor House export"
echo "    repo:   $REPO"
echo "    output: $TARBALL"

if [[ ! -d data ]]; then
  echo "!! no data/ directory here — are you in the right repo?" >&2
  exit 1
fi

mkdir -p "$STAGE/system"

# --- 1. runtime data ---------------------------------------------------------
echo "==> copying data/ ($(du -sh data | cut -f1)) …"
cp -a data "$STAGE/data"
# In-flight writes leave *.tmp behind; they are never part of the real state.
find "$STAGE/data" -name '*.tmp' -delete 2>/dev/null || true

# --- 2. secrets --------------------------------------------------------------
if [[ -f .env ]]; then
  echo "==> copying .env (secrets)"
  cp -a .env "$STAGE/.env"
  chmod 600 "$STAGE/.env"
else
  echo "!! no .env found — the new host will need one" >&2
fi

# --- 3. system config, for reference on the new host -------------------------
echo "==> copying system config"
sudo cat /etc/systemd/system/harbor-house.service > "$STAGE/system/harbor-house.service" 2>/dev/null || true
sudo cat /etc/caddy/Caddyfile > "$STAGE/system/Caddyfile" 2>/dev/null || true
{
  echo "node:  $(node -v 2>/dev/null || echo '?')"
  echo "npm:   $(npm -v 2>/dev/null || echo '?')"
  echo "os:    $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME")"
  echo "git:   $(git rev-parse --abbrev-ref HEAD 2>/dev/null) @ $(git rev-parse --short HEAD 2>/dev/null)"
} > "$STAGE/system/source-host.txt"

# --- 4. integrity: every JSON on disk must actually parse --------------------
# A book whose JSON is damaged is invisible in the app (getBook swallows the
# parse error and returns undefined), so corruption is silent. Surface it here
# rather than copying it to the new host unnoticed.
echo "==> checking JSON integrity"
CORRUPT="$(python3 - <<'PY'
import json, glob
bad = []
for pat in ('data/books/*.json', 'data/books/snapshots/*.json', 'data/music/*.json',
            'data/voices/*.json', 'data/blocked/*.json', 'data/users.json', 'data/invites.json'):
    for f in sorted(glob.glob(pat)):
        try:
            with open(f, encoding='utf-8') as fh: json.load(fh)
        except Exception:
            bad.append(f)
print('\n'.join(bad))
PY
)"
CORRUPT_N=$(printf '%s' "$CORRUPT" | grep -c . || true)
if [[ "$CORRUPT_N" != "0" ]]; then
  echo "!! $CORRUPT_N file(s) do NOT parse — these are already broken on this host:" >&2
  printf '     %s\n' $CORRUPT >&2
  echo "!! they are still included in the bundle, but fix them before cutting over" >&2
  echo "!! (see deploy/migrate/README.md — 'Damaged book files')" >&2
fi

# --- 5. manifest: what the import side must be able to verify ----------------
echo "==> writing manifest"
{
  echo "Harbor House export"
  echo "exported_at_utc: $(date -u +%FT%TZ)"
  echo "source_branch:   $(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  echo "source_commit:   $(git rev-parse HEAD 2>/dev/null)"
  echo
  echo "counts:"
  echo "  books:         $(ls data/books/*.json 2>/dev/null | wc -l)"
  echo "  snapshots:     $(ls data/books/snapshots/*.json 2>/dev/null | wc -l)"
  echo "  page_music:    $(ls data/books/music/*.mp3 2>/dev/null | wc -l)"
  echo "  music_tracks:  $(ls data/music/*.json 2>/dev/null | wc -l)"
  echo "  voices:        $(ls data/voices/*.json 2>/dev/null | wc -l)"
  echo "  analytics_days:$(ls data/analytics/*.jsonl 2>/dev/null | wc -l)"
  echo "  users:         $(python3 -c "import json;print(len(json.load(open('data/users.json'))))" 2>/dev/null || echo 0)"
  echo "  invites:       $(python3 -c "import json;print(len(json.load(open('data/invites.json'))))" 2>/dev/null || echo 0)"
  echo "  data_bytes:    $(du -sb data | cut -f1)"
  echo "  corrupt_json:  $CORRUPT_N"
} > "$STAGE/MANIFEST.txt"
cat "$STAGE/MANIFEST.txt"

# --- 6. bundle + checksum ----------------------------------------------------
echo "==> creating tarball (this takes a moment for ~500 MB) …"
tar -czf "$TARBALL" -C "$STAGE" .
( cd "$OUT_DIR" && sha256sum "$(basename "$TARBALL")" > "$(basename "$TARBALL").sha256" )
rm -rf "$STAGE"

echo
echo "==> DONE"
ls -lh "$TARBALL" "$TARBALL.sha256" | awk '{print "    " $9 "  " $5}'
echo
echo "Next: pull it to the mini PC (run THIS on the mini PC):"
echo "    gcloud compute scp harbor-house-ai-sandbox:$TARBALL . --zone=us-west1-b"
echo "    gcloud compute scp harbor-house-ai-sandbox:$TARBALL.sha256 . --zone=us-west1-b"
echo "  …then: ./deploy/migrate/import-to-local.sh $(basename "$TARBALL")"
