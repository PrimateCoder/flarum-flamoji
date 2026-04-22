# Flamoji Picker features UX tests

Black-box browser tests for the picker's user-facing features. Drives a
real Chromium against a running Flarum instance via Playwright; reads
into emoji-mart's Shadow DOM rather than importing source.

These exist alongside [picker-positioning.md](picker-positioning.md) —
positioning is about *where* the picker lands; features is about *what's
inside* and *what happens when you use it*. Together they cover the
visible contract of the picker.

## Assumed admin state

The forum under test must have **every admin-visible toggle on**, with
the default category list. That's the realistic "give the user
everything" preset and the single state where every assertion below has
a stable expected outcome:

| Setting                        | Value                                    |
| ------------------------------ | ---------------------------------------- |
| `auto_hide`                    | `true`                                   |
| `show_preview`                 | `true`                                   |
| `show_search`                  | `true`                                   |
| `show_variants`                | `true`                                   |
| `show_category_buttons`        | `true`                                   |
| `show_recents`                 | `true`                                   |
| `frequent_rows`                | `4` (or any non-zero default)            |
| `picker_set`                   | any (`auto` / `twemoji` / `native`)      |
| `specify_categories`           | the 8 default categories                 |

A fresh install satisfies this — the extension's defaults already match.
If a tester has flipped any toggle off in the forum being tested, expect
the matching structural assertion below to fail.

## Behaviors asserted

### Structure (one open of the picker)

1. **`show_search`** — a single `<input type="search">` is present in the
   picker's Shadow DOM.
2. **`show_category_buttons`** — the top `<nav>` renders one button per
   enabled category (≥7 buttons for the default category list).
3. **`show_preview`** — the bottom preview pane renders with its hint
   text ("Pick an emoji" before any hover).
4. **`show_variants`** — the skin-tone selector (`.skin-tone-button`)
   appears in the preview row.
5. **`specify_categories`** — every category id in the configured list
   has a corresponding nav button reachable by name (matched against
   emoji-mart's English nav labels: "Smileys & People" for `people`,
   "Animals & Nature" for `nature`, "Food & Drink" for `foods`, etc.).

### Insertion flow

6. **Click → insert** — clicking the first non-nav tile inside the
   picker grows the composer's textarea (a Unicode glyph or shortcode
   has been inserted at the caret).

### `auto_hide`

7. **Auto-hide on select** — after step 6, the picker host element is
   `display: none`. (When `auto_hide` is off, the picker stays open.)

### Search filtering

8. **Filtering reduces results** — re-opening the picker, typing
   `"smile"` into the search input, and waiting for the debounce reduces
   the number of visible tiles to a small set (>0, <30). The full picker
   has hundreds of tiles.
9. **Unmatched query empties results** — typing `"zzznotanemoji"`
   returns zero tiles. This is the "the search filter is actually
   wired" check rather than the weaker "result count went down" one.

## Not yet asserted (intentional gaps)

- **`picker_set` rendering**: would need to verify Twemoji sprite URLs
  load when set is `twitter`, or that no sprites load for `native`. The
  `<em-emoji>` sprite is a CSS background, hard to grep stably across
  emoji-mart versions.
- **`frequent_rows` / recents**: requires multi-session state (one pick
  in session A, then verify "Frequently Used" appears in session B). The
  shared harness can run this once we have a multi-user fixture for it.
- **Custom categories** (via `Extend\ApiSerializer` `flamoji.custom`):
  not exercised because no custom emoji are registered in the test
  forum.
- **Variant tray expansion**: long-press → tray opens. emoji-mart only
  exposes this via pointer events with timing, brittle to test.

## Running

Through the shared harness (provisions a test user / cookie):

```sh
.pianotell/tests/ux/run.sh tests/ux/picker-features.spec.mjs
```

Or via the wrapper that runs every spec:

```sh
tests/ux/run.sh
```

For shared-harness configuration, see
[`.pianotell/tests/ux/README.md`](../../.pianotell/tests/ux/README.md).
