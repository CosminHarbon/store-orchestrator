#!/usr/bin/env bash
# Compare monorepo mirror key files vs private runtime tip (or RUNTIME_SHA).
# Does not mutate remotes. Exit 1 on mismatch / missing tip.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MONOREPO_ROOT="$(cd "$ROOT/../.." && pwd)"
REMOTE_URL="${RUNTIME_REMOTE_URL:-git@github.com:CosminHarbon/speedvendors-storefront-runtime.git}"
SHA_FILE="$ROOT/RUNTIME_SHA"

KEY_PATHS=(
  ".cursor/hooks/guardPolicy.mjs"
  "scripts/package-artifact.mjs"
  "package.json"
  "README_AGENT.md"
)

hash_file() {
  local f="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$f" | awk '{print $1}'
  else
    sha256sum "$f" | awk '{print $1}'
  fi
}

echo "== Local mirror hashes ($ROOT) =="
for rel in "${KEY_PATHS[@]}"; do
  abs="$ROOT/$rel"
  if [[ ! -f "$abs" ]]; then
    echo "MISSING local: $rel" >&2
    exit 1
  fi
  echo "$(hash_file "$abs")  $rel"
done

EXPECTED=""
if [[ -n "${RUNTIME_SHA:-}" ]]; then
  EXPECTED="$RUNTIME_SHA"
elif [[ -f "$SHA_FILE" ]]; then
  EXPECTED="$(tr -d '[:space:]' < "$SHA_FILE")"
fi

if [[ -n "$EXPECTED" ]]; then
  echo
  echo "Expected tip (RUNTIME_SHA): $EXPECTED"
fi

echo
echo "== Remote tip (git ls-remote) =="
TIP=""
if TIP="$(git ls-remote "$REMOTE_URL" HEAD 2>/dev/null | awk '{print $1}')"; then
  if [[ -z "$TIP" ]]; then
    echo "WARN: could not resolve remote HEAD (empty). Private repo may be unreachable."
    echo "Documented SoT: CosminHarbon/speedvendors-storefront-runtime — see RUNTIME_SOURCE_OF_TRUTH.md"
    exit 0
  fi
  echo "remote HEAD: $TIP"
else
  echo "WARN: git ls-remote failed for $REMOTE_URL"
  echo "Documented SoT: CosminHarbon/speedvendors-storefront-runtime — see RUNTIME_SOURCE_OF_TRUTH.md"
  if [[ -n "$EXPECTED" ]]; then
    echo "Cannot verify against expected SHA without network."
    exit 1
  fi
  exit 0
fi

if [[ -n "$EXPECTED" && "$EXPECTED" != "$TIP" ]]; then
  echo "FAIL: RUNTIME_SHA ($EXPECTED) != remote HEAD ($TIP)" >&2
  exit 1
fi

# Optional deep compare: clone tip to temp and diff key paths.
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

echo
echo "== Cloning tip for key-file compare =="
git clone --depth 1 "$REMOTE_URL" "$TMP/runtime" >/dev/null 2>&1 || {
  echo "WARN: shallow clone failed; hashes printed above for manual compare."
  exit 0
}

MISMATCH=0
for rel in "${KEY_PATHS[@]}"; do
  local_f="$ROOT/$rel"
  remote_f="$TMP/runtime/$rel"
  if [[ ! -f "$remote_f" ]]; then
    echo "MISSING on remote tip: $rel"
    MISMATCH=1
    continue
  fi
  lh="$(hash_file "$local_f")"
  rh="$(hash_file "$remote_f")"
  if [[ "$lh" != "$rh" ]]; then
    echo "DIFF: $rel"
    echo "  local:  $lh"
    echo "  remote: $rh"
    MISMATCH=1
  else
    echo "OK: $rel"
  fi
done

if [[ "$MISMATCH" -ne 0 ]]; then
  echo
  echo "FAIL: mirror differs from private tip. Sync before pinning agents." >&2
  echo "See $ROOT/RUNTIME_SOURCE_OF_TRUTH.md" >&2
  exit 1
fi

echo
echo "OK: key packaging/guard files match remote tip $TIP"
