#!/usr/bin/env bash
# Install a Harbor House export onto this machine (the mini PC).
#
# Run this ON THE MINI PC, from your cloned repo root, with the tarball path:
#     ./deploy/migrate/import-to-local.sh ~/harbor-house-20260901-120000.tar.gz
#
# It verifies the checksum, backs up anything already here, restores data/ and
# .env, installs dependencies, builds, and writes a systemd unit for THIS user
# and path. It does not touch DNS or the reverse proxy — see README.md for that.
#
# Re-runnable: a second run with a newer tarball refreshes data/ (keeping a
# timestamped backup of the previous one), which is how the final cutover sync
# is meant to be done.
set -euo pipefail

TARBALL="${1:-}"
if [[ -z "$TARBALL" || ! -f "$TARBALL" ]]; then
  echo "usage: $0 <harbor-house-export.tar.gz>" >&2
  exit 1
fi
TARBALL="$(cd "$(dirname "$TARBALL")" && pwd)/$(basename "$TARBALL")"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO"
STAMP="$(date -u +%Y%m%d-%H%M%S)"

echo "==> Harbor House import"
echo "    repo:    $REPO"
echo "    bundle:  $TARBALL"
echo "    user:    $USER"

# --- 0. sanity: right repo? --------------------------------------------------
if [[ ! -f package.json ]] || ! grep -q '"child-safe-ai"' package.json; then
  echo "!! this does not look like the ai-for-kids repo" >&2
  exit 1
fi

# --- 1. verify the bundle ----------------------------------------------------
if [[ -f "$TARBALL.sha256" ]]; then
  echo "==> verifying checksum …"
  ( cd "$(dirname "$TARBALL")" && sha256sum -c "$(basename "$TARBALL").sha256" ) \
    || { echo "!! CHECKSUM MISMATCH — transfer was corrupted, do not proceed" >&2; exit 1; }
else
  echo "!! no .sha256 alongside the tarball — skipping integrity check"
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
echo "==> unpacking …"
tar -xzf "$TARBALL" -C "$STAGE"
echo "--- manifest from the source host ---"
cat "$STAGE/MANIFEST.txt" 2>/dev/null || echo "(no manifest)"
echo "-------------------------------------"

# --- 2. back up whatever is already here -------------------------------------
if [[ -d data ]]; then
  echo "==> backing up existing data/ -> data.backup-$STAMP"
  mv data "data.backup-$STAMP"
fi
if [[ -f .env ]]; then
  cp -a .env ".env.backup-$STAMP"
  echo "==> backed up existing .env -> .env.backup-$STAMP"
fi

# --- 3. restore --------------------------------------------------------------
echo "==> restoring data/ …"
cp -a "$STAGE/data" ./data
if [[ -f "$STAGE/.env" ]]; then
  cp -a "$STAGE/.env" ./.env
  chmod 600 .env
  echo "==> restored .env (mode 600)"
fi
mkdir -p deploy/migrate/from-source-host
cp -a "$STAGE/system/." deploy/migrate/from-source-host/ 2>/dev/null || true

# --- 4. verify nothing was lost in transit -----------------------------------
echo "==> verifying restored counts against the manifest"
verify() { # label, actual, manifest-key
  local want; want="$(grep -E "^  $3:" "$STAGE/MANIFEST.txt" 2>/dev/null | awk '{print $2}')"
  if [[ -z "$want" ]]; then printf "    %-14s %s (no manifest entry)\n" "$1" "$2"; return; fi
  if [[ "$2" == "$want" ]]; then printf "    %-14s %s  OK\n" "$1" "$2"
  else printf "    %-14s %s  != manifest %s  <-- MISMATCH\n" "$1" "$2" "$want"; MISMATCH=1; fi
}
MISMATCH=0
verify books        "$(ls data/books/*.json 2>/dev/null | wc -l)"        books
verify page_music   "$(ls data/books/music/*.mp3 2>/dev/null | wc -l)"   page_music
verify music_tracks "$(ls data/music/*.json 2>/dev/null | wc -l)"        music_tracks
verify voices       "$(ls data/voices/*.json 2>/dev/null | wc -l)"       voices
verify analytics    "$(ls data/analytics/*.jsonl 2>/dev/null | wc -l)"   analytics_days
[[ "$MISMATCH" == "1" ]] && echo "!! counts differ from the source — investigate before cutting over" >&2

# Counts can match while a file is damaged, and a book that does not parse is
# silently invisible in the app rather than erroring. So check content too.
echo "==> checking JSON integrity of the restored data"
BAD="$(python3 - <<'PY'
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
BAD_N=$(printf '%s' "$BAD" | grep -c . || true)
WANT_BAD="$(grep -E '^  corrupt_json:' "$STAGE/MANIFEST.txt" 2>/dev/null | awk '{print $2}')"
if [[ "$BAD_N" == "0" ]]; then
  echo "    all JSON parses  OK"
elif [[ -n "$WANT_BAD" && "$BAD_N" == "$WANT_BAD" ]]; then
  echo "!! $BAD_N file(s) do not parse — same as the source, so this is pre-existing"
  printf '     %s\n' $BAD
  echo "!! see deploy/migrate/README.md — 'Damaged book files'"
else
  echo "!! $BAD_N file(s) do not parse (source had ${WANT_BAD:-?}) — TRANSFER DAMAGE" >&2
  printf '     %s\n' $BAD >&2
  echo "!! do not cut over; re-transfer the bundle" >&2
fi

# --- 5. dependencies + build -------------------------------------------------
command -v node >/dev/null || { echo "!! node is not installed (need v20+)" >&2; exit 1; }
echo "==> node $(node -v) / npm $(npm -v)"
case "$(node -v)" in v1[0-9].*|v[1-9].*) echo "!! node 20+ recommended" >&2;; esac
echo "==> npm ci …"
npm ci
echo "==> building …"
npm run build

# --- 6. systemd unit for THIS host ------------------------------------------
UNIT=/etc/systemd/system/harbor-house.service
echo "==> writing $UNIT (user=$USER, dir=$REPO)"
sudo tee "$UNIT" >/dev/null <<UNITEOF
[Unit]
Description=Harbor House child-safe-ai gateway
After=network.target

[Service]
Type=simple
User=$USER
Group=$USER
WorkingDirectory=$REPO
ExecStart=$(command -v node) dist/index.js
Restart=on-failure
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNITEOF
sudo systemctl daemon-reload
sudo systemctl enable harbor-house
sudo systemctl restart harbor-house
sleep 2

# --- 7. smoke test -----------------------------------------------------------
PORT="$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2)"; PORT="${PORT:-5000}"
echo "==> smoke test on 127.0.0.1:$PORT"
if curl -fsS -m 10 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
  echo "    health: OK"
  echo "    books on disk: $(ls data/books/*.json 2>/dev/null | wc -l)"
else
  echo "!! health check FAILED — check: sudo journalctl -u harbor-house -n 40" >&2
  exit 1
fi

echo
echo "==> IMPORT COMPLETE. Harbor House is serving on 127.0.0.1:$PORT"
echo "    Remaining: point Cloudflare at this box, then verify logins."
echo "    See deploy/migrate/README.md  (sections 4-6)"
