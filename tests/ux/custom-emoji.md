# custom-emoji.spec.mjs

End-to-end test that exercises the custom-emoji lifecycle through the
admin panel and confirms the forum-side picker reflects it.

## Contract

Driven entirely through the admin UI — no REST shortcuts, no DB writes.

1. **Baseline** — record the current Custom Emojis admin list and the
   Custom-category tile count in the picker. The forum is seeded with
   `:pianotell:`, so baselines are non-zero.
2. **Create** — open the admin "Add Emoji" modal, fill `Title`, `Text
   to replace` (shortcode like `:flamoji_ux_fixture:`), `Path`, and
   click Save. Wait for the row to appear.
3. **Picker reflection** — reload the forum, open the composer + picker,
   click into the Custom category, and assert the tile count grew by
   exactly one.
4. **Search + insert** — type a name token into the picker search,
   confirm a tile appears, click it, and assert the composer textarea
   gained the shortcode.
5. **Delete** — back in admin, click the row's pencil, accept the
   `confirm()` dialog, click Delete in the modal, wait for the row to
   disappear.
6. **Picker returns to baseline** — reload, open picker, assert tile
   count returned to the baseline number.

## Why baseline-relative

The forum carries a seed `:pianotell:` row that other devs may have
duplicated when poking around. Absolute counts (e.g. "1 tile in
Custom") would falsely fail. We assert deltas instead.

## Failure artifacts

* `tests/ux/_failure.png` — full-page screenshot at the moment of error.
* `tests/ux/_failures.json` — structured list of failed checks.
