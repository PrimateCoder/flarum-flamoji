# category-grouping.spec.mjs

Validates the grouping/inline-rename feature against the findings from
its code review (PR #3 on 2.x / PR #2 on 1.x — the same code shipped in
PR #4). Each check pins a review finding as an observable behavior
contract; the fixes (server-side bulk rename endpoint, null-prototype
grouping, data-preserving "Uncategorized", maxlength) make these pass.

## Contract

Driven through the admin UI (group headers, inline rename form, export
button). Scenario B uses Playwright route interception only to inject
a network failure — no API shortcuts for setup or assertions.

1. **Bulk rename covers every emoji (finding #1)** — seed 25 emojis in
   one category (> the list's page limit of 23), rename the group, then
   reload the admin and load all pages:
   - the old category group is completely empty/gone;
   - all 25 emojis are in the renamed group.
   Fixed by `POST /api/flamojis/rename-category`, which renames all
   matching rows server-side in one statement — the client no longer
   fans out per-emoji PATCHes over only the loaded page.

2. **Failed rename surfaces an alert and is atomic (finding #2)** —
   seed 3 emojis, intercept the single rename request with a 500, then
   rename:
   - an error alert is visible to the admin;
   - after reload, all 3 emojis still have the old category (the bulk
     rename is one atomic server-side operation).
   (Note: the original review claimed the failure was silent — in fact
   Flarum 2.x already auto-alerts on failed saves; the real defect was
   the non-atomicity, which this check pins.)

3. **`"__proto__"` category must not break the list (finding #3)** —
   seed one emoji with category `__proto__` and one with a normal
   category:
   - the grouped list renders both groups;
   - the `"__proto__"` group renders its emoji.
   Fixed by grouping into a null-prototype object.
   (Related hardening: the spec's own `groupCounts` helper returns
   label/count pairs, because Playwright's evaluate deserialization
   destroys object keys named `__proto__`.)

4. **Renaming TO "Uncategorized" stores data (finding #4)** — seed one
   emoji in category `Alpha`, rename the group to the literal string
   `Uncategorized`, then export:
   - the exported row's `category` equals `"Uncategorized"` (real
     data), not `null`.

5. **Rename input clamps to 255 chars (finding #6)** — type 300 chars
   into the inline rename input:
   - the input's value length is ≤ 255 (maxlength, like the Edit Emoji
     modal's category field).

## Not covered

- **Finding #5 (hardcoded untranslated "Save"/"Cancel")** — fixed in
  code (translator + en.yml keys `rename_save_button` /
  `rename_cancel_button`), but an English-locale end-to-end run cannot
  distinguish hardcoded English from translated English, so there is
  no automated check.
- The silent merge when renaming a category onto an existing one is a
  UX-design decision (confirmation dialog) rather than a hard
  contract; not pinned here.

## Server-side contract

`tests/integration/api/RenameCategoryApiTest.php` pins the same
contract at the API level (TDD for the bulk endpoint) — see that file;
both suites turn green on the same fix.

## Cleanup

`finally` deletes every custom emoji via the admin UI, then sweeps the
table from the bootstrap as a safety net (a no-op once the list renders
correctly).

## Failure artifacts

* `tests/ux/_failure.png` — full-page screenshot at the moment of error.
* `tests/ux/_failures.json` — structured list of failed checks.
