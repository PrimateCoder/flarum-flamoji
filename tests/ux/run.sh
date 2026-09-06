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
  tests/ux/picker-features.spec.mjs
  tests/ux/sticker-render.spec.mjs
  tests/ux/admin-options.spec.mjs
  tests/ux/custom-emoji.spec.mjs
  tests/ux/import-export.spec.mjs
  tests/ux/category-grouping.spec.mjs
  tests/ux/picker-baseline.spec.mjs
  tests/ux/picker-variants.spec.mjs
  tests/ux/admin-baseline.spec.mjs
  tests/ux/picker-loading.spec.mjs
  tests/ux/cdn.spec.mjs
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

CONTAINER="${PIANOTELL_FLARUM_UX_CONTAINER:-pianotell-web}"
FLARUM_PATH="${PIANOTELL_FLARUM_UX_FLARUM_PATH:-/var/www/html}"
PHP_USER="${PIANOTELL_FLARUM_UX_PHP_USER:-docker}"

# ---------------------------------------------------------------------------
# Precondition: the specs assert against Flarum core's TextEditor (a
# <textarea> composer). If fof-rich-text (Tiptap/ProseMirror) is active,
# the composer has no textarea and every composer-insert assertion reads
# "" on both sides of the click. Disable it for the run and restore it
# on exit, whatever the outcome.
#
# Uses Flarum's own console commands. `extension:disable` doubles as the
# probe: exit 0 = was enabled (restore later); exit 1 "already disabled"
# = nothing to do; exit 2 "no extensions by the ID" = not installed.
# ---------------------------------------------------------------------------
RICH_TEXT_WAS_ENABLED=0

flarum_cli() {
  docker exec -u "$PHP_USER" -w "$FLARUM_PATH" "$CONTAINER" \
    php flarum "$@" 2>&1
}

ensure_core_text_editor() {
  local out
  if out="$(flarum_cli extension:disable fof-rich-text)"; then
    RICH_TEXT_WAS_ENABLED=1
    if ! flarum_cli cache:clear >/dev/null; then
      echo "[flamoji] warning: cache:clear failed after disabling fof-rich-text" >&2
    fi
    echo "[flamoji] disabled fof-rich-text for this run (restored on exit)" >&2
    return
  fi
  case "$out" in
    *"already disabled"*) ;;
    *"no extensions by the ID"*) ;;
    *)
      echo "[flamoji] warning: could not manage fof-rich-text ('$out'); continuing" >&2
      ;;
  esac
}

restore_rich_text() {
  local out
  if [[ $RICH_TEXT_WAS_ENABLED = 1 ]]; then
    RICH_TEXT_WAS_ENABLED=0
    if out="$(flarum_cli extension:enable fof-rich-text)" || [[ "$out" == *"already enabled"* ]]; then
      flarum_cli cache:clear >/dev/null 2>&1 || true
      echo "[flamoji] re-enabled fof-rich-text" >&2
    else
      echo "[flamoji] warning: failed to re-enable fof-rich-text ('$out'); enable it manually" >&2
    fi
  fi
}
trap restore_rich_text EXIT

ensure_core_text_editor

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
