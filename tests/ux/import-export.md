# import-export.spec.mjs

End-to-end test that exercises the custom-emoji import/export flow in
the admin panel (2.x grouped schema, since the grouping PR).

## Contract

Driven entirely through the admin UI — no REST shortcuts.

1. **Export** — click the admin "Export JSON" button. Capture the
   download via Playwright's `download` event.
   - Filename is `flamoji.json`.
   - Body parses as JSON.
   - Shape is the **grouped** object `{ "<category>": [row, ...] }`,
     not the pre-grouping flat array.
   - Every row has `{title, text_to_replace, category, path}`.
   - Every row's `category` matches its group key (rows grouped under
     "Uncategorized" are exempt).
   - At least one row exists (the seed `:flamoji_ie_seed:`).

2. **Import — modal flow.** Clicking "Import JSON" opens
   `ImportEmojisModal` (textarea payload + optional override switch).
   The spec types JSON into the textarea and observes the
   `POST /flamojis/import` response. Three import scenarios:

   - **Legacy flat array** (`[{title, text_to_replace, path}, ...]`,
     no `category`) — proves the importer still accepts pre-grouping
     export files. Fixture appears; existing rows survive (append
     mode is additive).
   - **Grouped object** with a named category
     (`{ "Flamoji IE Test": [row] }`) — the new format. Fixture
     appears under its category; previous rows survive.
   - **Override mode** — arm the switch, tick the confirm checkbox,
     import a single-row payload. Asserts *every* pre-existing row is
     gone and only the override fixture remains.

3. **Cleanup** — `deleteAllCustomEmojis` (the same admin Delete flow
   used by `custom-emoji.spec.mjs`) runs in `finally`, so a mid-test
   failure doesn't leave debris on the dev forum.

## Backwards-compatibility note

The import modal deliberately accepts both the legacy flat array and
the new grouped object; the export always writes the grouped form.
This spec is what pins that: if the importer ever drops flat-array
support, the flat-array scenario fails.

## Failure artifacts

* `tests/ux/_failure.png` — full-page screenshot at the moment of error.
* `tests/ux/_failures.json` — structured list of failed checks.
