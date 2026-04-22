# Flamoji admin-options UX tests

Black-box matrix test asserting that every admin-visible setting
actually changes the picker the way the help text promises it will.
Complements [picker-features.md](picker-features.md) (which only checks
the all-on default state) by varying each setting independently and
running two combination scenarios.

## How it varies settings without touching the backend

The picker is built once per editor (see `js/src/forum/index.js`'s
`isPickerLoaded` gate); subsequent toolbar clicks merely toggle
visibility, so settings are closure-captured at the *first* picker open.
To re-test with new settings the spec:

1. Calls `page.reload()` — wipes the cached picker and the editor.
2. Mutates `app.forum.data.attributes['flamoji.<key>']` directly in the
   reloaded page. Flarum reads attributes lazily, so the picker built
   next picks them up. No DB writes, no `assets:publish`, no cache
   clear.
3. Re-opens composer + picker, snapshots the Shadow DOM, asserts.

This is faster (~2 s reload × 12 scenarios) than driving the admin UI
or the settings API, and keeps the test harness self-contained.

The mutation route also means the spec verifies the *front-end wiring*
of each setting, not the round-trip through the settings repo. Round-
trip is covered by integration / PHPUnit tests (and there's nothing
unique about flamoji's settings — they go through Flarum's standard
`Extend\Settings` plumbing).

## Scenarios and assertions (30 checks)

### Per-setting (one variable at a time)

| Setting | ON expectation | OFF expectation |
| --- | --- | --- |
| `show_search` | `<input type="search">` present in Shadow DOM | absent |
| `show_category_buttons` | `<nav>` has ≥ 1 category button | nav has 0 buttons |
| `show_preview` | `.preview-placeholder` present | absent |
| `show_variants` | `.skin-tone-button` present | absent |
| `auto_hide` | picker `display: none` after a tile click | picker stays visible after the click |

#### Cross-coupling note: preview ↔ variants

emoji-mart hosts the skin-tone selector inside the preview row. With
`show_preview=false AND show_variants=true` the skin-tone widget has
nowhere to go and emoji-mart drops it. To get a clean signal on each
toggle individually:

- The `show_preview` scenarios hold `show_variants=false`.
- The `show_variants` scenarios hold `show_preview=true`.

Both pairings are isolated probes of one toggle; the all-off
combination scenario (below) re-verifies they coexist correctly.

### Per-setting (multi-valued)

| Setting | Variant tested | Assertion |
| --- | --- | --- |
| `picker_set` | `twemoji` | inner span has `data-emoji-set="twitter"` AND its inline style has `background-image: url(...emoji-datasource-twitter...)` |
| `picker_set` | `native` | inner span has `data-emoji-set="native"` AND has no Twemoji `background-image` (font-family fallback may still mention "Twemoji Mozilla" — the regex is anchored to `background-image: url(...)` to avoid that false positive) |
| `picker_set` | `auto` | resolves to `twitter` if `flamoji.has_emoji_extension` is true on the test forum, else `native` |
| `specify_categories` | `["people"]` (JSON-stringified, since the source `JSON.parse`s this attribute) | nav has 1 or 2 buttons (Smileys/People + optionally a Custom tab if a custom set is registered); no Flags/Travel/etc. |

### Combination scenarios

10. **All chrome OFF** (`show_search`, `show_category_buttons`,
    `show_preview`, `show_variants` all false): bare grid only — no
    search input, no nav, no preview, no skin-tone selector. Verifies
    the toggles compose without entanglement.
11. **Search-only** (only `show_search=true`, other chrome off):
    search input present; nav, preview, skin-tone selector all absent.

## Not asserted (intentional gaps, with rationale)

- **`show_recents` / `frequent_rows`** — emoji-mart's "Frequently
  Used" category only appears after the user has actually picked
  emojis (data persisted to its own localStorage key). To test, the
  spec would need to seed that storage or pick → reload → re-verify.
  Skipped pending a stable enough emoji-mart storage contract to lean
  on.
- **Custom emoji** — covered by [`custom-emoji.spec.mjs`](custom-emoji.md),
  which drives the admin Add/Edit/Delete UI directly.
- **Skin-tone variant tray expansion** — long-press / pointerdown +
  hold + release is brittle to time across browsers.

## Visual regression

These tests do **not** do baseline screenshot comparison.
[`picker-baseline.spec.mjs`](picker-baseline.md) handles that
separately for the all-defaults configuration. On any exception,
`tests/ux/_failure.png` is captured (full-page) for debugging — but
no per-assertion `.toHaveScreenshot()` baseline is maintained inside
this spec.

Reasoning: the picker's appearance depends on emoji-mart version, OS
emoji fonts (Twemoji vs Apple Color Emoji vs Noto, …), Flarum theme,
and viewport DPR. A pixel-baseline would make these tests false-fail on
every emoji-mart bump, every container OS upgrade, and every theme
tweak. The structural Shadow-DOM assertions used here are stable
across all of those changes.

If a contributor wants a one-shot visual diff for manual review, the
fastest path is to run a spec with `headed: true` in the Chromium
launch options and watch.

## Running

```sh
.pianotell/tests/ux/run.sh tests/ux/admin-options.spec.mjs
```

Or via the wrapper that runs every spec:

```sh
tests/ux/run.sh
```

For shared-harness configuration, see
[`.pianotell/tests/ux/README.md`](../../.pianotell/tests/ux/README.md).
