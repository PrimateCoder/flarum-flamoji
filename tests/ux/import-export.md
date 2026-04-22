# import-export.spec.mjs

End-to-end test that exercises the custom-emoji import/export buttons
in the admin panel.

## Contract

Driven entirely through the admin UI — no REST shortcuts.

1. **Export** — click the admin "Export JSON" button. Capture the
   download via Playwright's `download` event.
   - Filename is `flamoji.json`.
   - Body parses as JSON.
   - Every row has `{title, text_to_replace, path}` (the schema the
     importer accepts).
   - At least one row exists (the seed `:pianotell:`).

2. **Import (additive round-trip)** — take the just-exported payload,
   append one fixture row (`:flamoji_import_fixture:`), write it to a
   temp file, click the admin "Import JSON" button. The handler:
   - Pops a native `confirm()` dialog → auto-accepted.
   - Creates a programmatic `<input type="file">` and clicks it →
     captured via the page's `filechooser` event.
   - POSTs to `/pianotell/import-emojis` and reloads the page.
   After reload, re-open admin and assert:
   - The fixture row appears in the Custom Emojis list.
   - Every pre-existing row from the export is still present (the
     import is additive, not destructive).

3. **Cleanup** — delete the fixture row via the same admin Delete
   button used by `custom-emoji.spec.mjs`. Cleanup runs in `finally`,
   so a mid-test failure doesn't leave debris on the dev forum.

## Why round-trip the full export

A bug that silently dropped existing rows on import (e.g. by using
`Array#fill` instead of merging) would pass a "fixture row appears"
assertion in isolation. Verifying every pre-existing row survives
catches that class of regression cheaply.

## Failure artifacts

* `tests/ux/_failure.png` — full-page screenshot at the moment of error.
* `tests/ux/_failures.json` — structured list of failed checks.
