# Flamoji Picker UX tests

Black-box browser tests covering the user-visible behavior of the emoji
picker. They drive a real Chromium against a running Flarum instance via
Playwright and assert on observed DOM geometry — they do not import any
of our source.

These exist because the picker is built on emoji-mart's `<em-emoji-picker>`
custom element (Shadow DOM, asynchronous internal layout) and is portaled
to `document.body`. That combination has subtle failure modes — sized to
zero on first measurement, host bounding rect briefly reading viewport-
wide before Shadow DOM applies internal sizing, etc. — that pure unit
tests on our positioning math cannot catch. We need to look at where the
picker actually lands in a real browser.

## Picker positioning specification

When the user clicks the flamoji toolbar button, the `<em-emoji-picker>`
custom element is appended to `document.body` with `position: fixed` and
positioned in JS by `positionPicker()` (see `js/src/forum/index.js`). The
position must satisfy, in order:

1. **Primary placement: button-centered above.** The picker is centered
   horizontally on the toolbar button (`btnRect.left + btnRect.width/2`)
   and floats above it with a `margin = 6` gap (`top = btnRect.top -
   margin - pickerRect.height`). This is the common case on desktop
   where the composer sits in the page's main column.

2. **Fallback placement: composer-anchored.** If the button-centered
   horizontal coordinate would fall outside the viewport bounds (within
   `screenPadding = 8` of either edge), we instead horizontally center
   the picker on the closest `.ComposerBody` ancestor and vertically
   anchor the picker's center on the composer's bottom edge
   (`top = composerRect.bottom - pickerRect.height/2`). This matches the
   behavior of the original emoji-button extension on narrower layouts.

3. **Viewport clamp.** In *both* placement modes, the final coordinates
   are clamped so the picker is fully visible:
   `screenPadding ≤ left ≤ window.innerWidth − pickerRect.width − screenPadding`,
   and likewise for `top` against `window.innerHeight`.

4. **No mid-flight return.** `positionPicker()` must always set
   `top` / `left` on every invocation where `pickerRect.{width,height}`
   are non-zero. Early-returning after partial work (e.g., setting
   `style.maxWidth` and bailing to wait for ResizeObserver to retrigger)
   is forbidden — the picker's `top` / `left` default to 0/0, which
   strands it in the upper-left corner if a subsequent reposition never
   lands. (This was the regression in commit `d4ede25`.)

5. **Reposition triggers.** The picker repositions on `window.resize`,
   `window.scroll` (capture), and any size change to the picker host
   itself (via a `ResizeObserver` observing the picker). Each of these
   must end in fully-set `top` / `left`.

What this spec does *not* mandate (intentionally — leaves room for future
visual work):

- Animation, fade-in, or transition behavior.
- Behavior when the picker is taller than the viewport (the clamp keeps
  the top edge visible, but bottom may still extend past `innerHeight`).
- Behavior on viewports narrower than the picker's natural width — the
  picker is allowed to overflow horizontally; styling that with a
  responsive clamp belongs in CSS, not JS.

## Running

The simplest way is the harness, which lives in the
`pianotell-flarum-common` submodule mounted at `.pianotell/`:

```sh
.pianotell/tests/ux/run.sh tests/ux/picker-positioning.spec.mjs
```

It (a) verifies the dev container is running, (b) provisions or reuses
a deterministic test user + remember-me cookie inside the container —
no real-account credentials ever touch the harness or the repo — (c)
installs Playwright on first run, and (d) runs the spec, exiting with
its status code.

For shared-harness configuration (`PIANOTELL_FLARUM_UX_CONTAINER`,
`PIANOTELL_FLARUM_UX_BASE_URL`, `PIANOTELL_FLARUM_UX_FLARUM_PATH`,
`PIANOTELL_FLARUM_UX_PHP_USER`, `PIANOTELL_FLARUM_UX_USERS`,
`PIANOTELL_FLARUM_UX_ACTION`), see [`.pianotell/tests/ux/README.md`](../../.pianotell/tests/ux/README.md).

## Running the test directly

If you already have a cookie and just want to re-run the assertions
without re-provisioning:

```sh
export PIANOTELL_FLARUM_UX_BASE_URL=https://localhost/
export PIANOTELL_FLARUM_UX_COOKIE=<flarum_remember-cookie value>
node tests/ux/picker-positioning.spec.mjs
```

**Do not paste a production token.** The harness mints a synthetic 40-
character token (the upper bound on Flarum's `access_tokens.token`
column) of the form `TEST_FLAMOJI_UX_HARNESS_<padding>`; if you're
running standalone, mint your own throwaway token rather than reusing a
real one.
