#!/usr/bin/env bash
# Run flarum-flamoji UX tests via the shared pianotell-flarum-common
# harness mounted at .pianotell/. Add new spec files to SPECS below as
# they're written.
#
# Usage:
#   tests/ux/run.sh                    # run all specs
#   tests/ux/run.sh picker-positioning # run a single spec by basename
#
# Env overrides (forwarded to the shared harness):
#   PIANOTELL_FLARUM_UX_CONTAINER   (default: pianotell-web)
#   PIANOTELL_FLARUM_UX_BASE_URL    (default: https://localhost/)
#   PIANOTELL_FLARUM_UX_FLARUM_PATH (default: /var/www/html)
#   PIANOTELL_FLARUM_UX_PHP_USER    (default: docker)
# Full reference: .pianotell/tests/ux/README.md

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# Specs to run (paths relative to repo root, no .spec.mjs suffix).
SPECS=(
  tests/ux/picker-positioning.spec.mjs
)

# Auto-init the submodule on a fresh clone. Skip cleanly if the
# contributor doesn't have access to the (currently private)
# pianotell-flarum-common repo — UX tests are a contributor-internal
# tool, not a build prerequisite.
if [[ ! -f .pianotell/tests/ux/run.sh ]]; then
  echo "[flamoji] initializing pianotell-flarum-common submodule..." >&2
  if ! git submodule update --init --recursive .pianotell 2>/dev/null; then
    cat >&2 <<'EOF'
[flamoji] could not init the .pianotell submodule (likely no access to
[flamoji] the private pianotell-flarum-common repo). UX tests require
[flamoji] this submodule and will be skipped. The rest of the extension
[flamoji] (build, PHPUnit, source) is unaffected.
EOF
    exit 0
  fi
fi

HARNESS=".pianotell/tests/ux/run.sh"

# Optional filter: match any spec whose basename contains $1.
if [[ $# -gt 0 ]]; then
  filter="$1"
  matched=()
  for s in "${SPECS[@]}"; do
    [[ "$(basename "$s")" == *"$filter"* ]] && matched+=("$s")
  done
  if [[ ${#matched[@]} -eq 0 ]]; then
    printf '[flamoji] no spec matches "%s". known specs:\n' "$filter" >&2
    printf '  %s\n' "${SPECS[@]}" >&2
    exit 2
  fi
  SPECS=("${matched[@]}")
fi

failed=0
for spec in "${SPECS[@]}"; do
  echo
  echo "============================================================"
  echo "[flamoji] $spec"
  echo "============================================================"
  if ! "$HARNESS" "$spec"; then
    failed=$((failed + 1))
  fi
done

if [[ $failed -gt 0 ]]; then
  echo
  echo "[flamoji] $failed spec(s) failed" >&2
  exit 1
fi
