// Category grouping / inline-rename UX tests.
//
// Spec:    tests/ux/category-grouping.md
// Runtime: node tests/ux/category-grouping.spec.mjs
//
// Pins the code-review findings for the grouping feature (PR #3/#4)
// as observable behavior contracts — now validated by the fixes:
//
//   A. Renaming a category updates EVERY emoji in it — including ones
//      on unloaded list pages (the list paginates at 23 + "Load more").
//      Fixed by the server-side bulk rename endpoint.
//   B. A failed rename surfaces an error alert AND is atomic — the
//      single bulk request fails cleanly and renames nothing.
//   C. A category literally named "__proto__" does not break the
//      grouped list rendering (null-prototype grouping map).
//   D. Renaming a group TO the literal string "Uncategorized" stores
//      that string as data, not null (server-side contract).
//   E. The rename input clamps to 255 chars (maxlength), matching the
//      Edit Emoji modal's category field.
//
// Finding #5 (hardcoded untranslated "Save"/"Cancel") is covered
// indirectly: the buttons now go through the translator with en.yml
// keys; an English-locale e2e run cannot distinguish hardcoded from
// translated-but-English text, so no automated check exists here.

import { readFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runSpec,
  clearCache,
  dbExecStatement,
} from '../../.pianotell/tests/ux/helpers.mjs';
import {
  gotoAdmin,
  addCustomEmoji,
  deleteAllCustomEmojis,
} from './_admin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Enter a group's inline rename mode, type the new name, and save.
// Only one group is in edit mode at a time, so the form selectors are
// unique while editing.
async function renameCategory(page, fromLabel, toName) {
  const started = await page.evaluate((from) => {
    const groups = [...document.querySelectorAll('.customEmoji-categoryGroup')];
    const group = groups.find((g) => (g.querySelector('h3')?.textContent || '').trim() === from);
    if (!group) return false;
    group.querySelector('.customEmoji-categoryEditButton')?.click();
    return true;
  }, fromLabel);
  if (!started) throw new Error(`group '${fromLabel}' not found for rename`);

  await page.waitForSelector('.customEmoji-categoryGroup h3 form input.FormControl', {
    timeout: 10_000,
  });
  await page.fill('.customEmoji-categoryGroup h3 form input.FormControl', toName);
  await page.click('.customEmoji-categoryGroup h3 form button.Button--primary');
}

// Open the admin, wait for the emoji list to render, and keep clicking
// "Load more" until every page is loaded.
async function loadEntireList(page, baseUrl) {
  await gotoAdmin(page, baseUrl);
  await page.waitForSelector('.customEmoji-list', { timeout: 10_000 });
  for (let i = 0; i < 30; i++) {
    const more = await page.evaluate(
      () => !!document.querySelector('.customEmoji-loadMore button:not([disabled])')
    );
    if (!more) break;
    await page.click('.customEmoji-loadMore button');
    await page.waitForTimeout(400);
  }
}

// Map each rendered category group header to its emoji count. Returns
// label/count PAIRS: an object keyed by "__proto__" would be destroyed
// by Playwright's deserialization (it assigns properties onto a plain
// object, where __proto__ is the prototype setter, not a key).
async function groupCounts(page) {
  const pairs = await page.evaluate(() =>
    [...document.querySelectorAll('.customEmoji-categoryGroup')].map((group) => [
      (group.querySelector('h3')?.textContent || '').trim(),
      group.querySelectorAll('li .customEmoji:not(.addEmoji)').length,
    ])
  );
  const counts = Object.create(null);
  for (const [label, count] of pairs) counts[label] = count;
  return counts;
}

await runSpec({
  specName: 'category-grouping',
  outputDir: HERE,
  acceptDownloads: true,
}, async ({ page, check, BASE }) => {
  // Harness convention: capture JS page errors. Scenario C expects the
  // grouping TypeError until finding #3 is fixed, so the final
  // "no unexpected JS errors" check filters that known signature.
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err?.message || err)));

  let dlPath = null;

  try {
    // ---------------------------------------------------------------
    // Scenario A — review finding #1: rename must cover ALL emojis,
    // including ones past the first list page (limit 23).
    // ---------------------------------------------------------------
    console.log('\n[A] bulk rename across pagination (25 emojis, page limit 23)');
    await deleteAllCustomEmojis(page, BASE);
    await gotoAdmin(page, BASE);
    for (let i = 1; i <= 25; i++) {
      await addCustomEmoji(page, {
        title: `Bulk ${i}`,
        shortcode: `:flamoji_cg_bulk_${i}:`,
        category: 'Big Cat',
        path: PNG_DATA_URI,
      });
    }

    // Force a REAL navigation (gotoAdmin to the URL we are already on
    // would be a same-document hash navigation): the list state must
    // hold only the first page (23) — exactly what a user opening the
    // admin fresh would see. Do NOT load the remaining pages first.
    await page.goto('about:blank');
    await gotoAdmin(page, BASE);
    await page.waitForSelector('.customEmoji-categoryGroup', { timeout: 10_000 });
    await page.waitForTimeout(500);
    await renameCategory(page, 'Big Cat', 'Big Cat Renamed');
    // The rename fires one PATCH per loaded emoji; let them finish.
    await page.waitForTimeout(2500);

    await loadEntireList(page, BASE);
    const counts = await groupCounts(page);
    check('A1 → old category fully emptied after rename', (counts['Big Cat'] ?? 0) === 0,
      `counts=${JSON.stringify(counts)}`);
    check('A2 → all 25 emojis now in the renamed category', (counts['Big Cat Renamed'] ?? 0) === 25,
      `counts=${JSON.stringify(counts)}`);

    // ---------------------------------------------------------------
    // Scenario B — review finding #2: failure surfacing + atomicity.
    // Force the second rename request to fail; the required outcome is
    // an error alert AND zero partial renames.
    // ---------------------------------------------------------------
    console.log('\n[B] rename failure surfaces an alert and stays atomic');
    await deleteAllCustomEmojis(page, BASE);
    await gotoAdmin(page, BASE);
    for (const sc of ['a', 'b', 'c']) {
      await addCustomEmoji(page, {
        title: `Atomic ${sc}`,
        shortcode: `:flamoji_cg_atomic_${sc}:`,
        category: 'Fail Cat',
        path: PNG_DATA_URI,
      });
    }

    // The rename issues ONE bulk request (POST /api/flamojis/rename-
    // category). Fail it: the required outcome is an error alert and
    // zero renames (a single server-side atomic operation).
    let renameCount = 0;
    await page.route('**/api/flamojis/**', (route) => {
      const req = route.request();
      if (/\/api\/flamojis\/rename-category/.test(new URL(req.url()).pathname)) {
        renameCount += 1;
        if (renameCount === 1) {
          return route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ errors: [{ detail: 'forced test failure' }] }),
          });
        }
      }
      return route.fallback();
    });

    await renameCategory(page, 'Fail Cat', 'Fail Cat 2');
    await page.waitForTimeout(2000);
    await page.unroute('**/api/flamojis/**');
    console.log(`  [B] rename requests issued: ${renameCount}`);

    const alertVisible = await page.evaluate(() => {
      const alerts = [...document.querySelectorAll('.Alert')];
      return alerts.length > 0 && alerts.some((a) => a.offsetParent !== null);
    });
    check('B1 → failed rename shows an error alert to the admin', alertVisible,
      `alerts=${await page.evaluate(() => document.querySelectorAll('.Alert').length)}`);

    await loadEntireList(page, BASE);
    const atomicCounts = await groupCounts(page);
    check('B2 → rename is atomic: no emoji left half-renamed',
      (atomicCounts['Fail Cat'] ?? 0) === 3 && (atomicCounts['Fail Cat 2'] ?? 0) === 0,
      `counts=${JSON.stringify(atomicCounts)}`);

    // ---------------------------------------------------------------
    // Scenario D — review finding #4: renaming TO "Uncategorized" must
    // store the literal string as data (visible in the export), not
    // coerce it to null.
    // ---------------------------------------------------------------
    console.log('\n[D] rename to the literal "Uncategorized" stores data');
    await deleteAllCustomEmojis(page, BASE);
    await gotoAdmin(page, BASE);
    await addCustomEmoji(page, {
      title: 'Alpha Emoji',
      shortcode: ':flamoji_cg_alpha:',
      category: 'Alpha',
      path: PNG_DATA_URI,
    });

    await renameCategory(page, 'Alpha', 'Uncategorized');
    await page.waitForTimeout(2500);

    // Export and inspect what is actually stored server-side.
    const exportBtn = page.locator('.ExtensionPage-headerTopItems button', {
      hasText: 'Export JSON',
    });
    await exportBtn.waitFor({ timeout: 10_000 });
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
    await exportBtn.click();
    const download = await downloadPromise;
    dlPath = resolve(HERE, `_cg-export-${Date.now()}.json`);
    await download.saveAs(dlPath);
    const exported = JSON.parse(readFileSync(dlPath, 'utf-8'));
    const rows = Object.values(exported).flat();
    const alphaRow = rows.find((r) => r.text_to_replace === ':flamoji_cg_alpha:');

    check('D1 → renamed category is stored as the literal string "Uncategorized"',
      !!alphaRow && alphaRow.category === 'Uncategorized',
      `stored=${JSON.stringify(alphaRow?.category)}`);

    // ---------------------------------------------------------------
    // Scenario E — review finding #6: rename input clamps to 255.
    // ---------------------------------------------------------------
    console.log('\n[E] rename input maxlength');
    await gotoAdmin(page, BASE);
    const started = await page.evaluate(() => {
      const group = [...document.querySelectorAll('.customEmoji-categoryGroup')].find(
        (g) => (g.querySelector('h3')?.textContent || '').trim() === 'Uncategorized'
      );
      if (!group) return false;
      group.querySelector('.customEmoji-categoryEditButton')?.click();
      return true;
    });
    check('E1 → rename mode entered', started);
    await page.waitForSelector('.customEmoji-categoryGroup h3 form input.FormControl', {
      timeout: 10_000,
    });
    await page.fill('.customEmoji-categoryGroup h3 form input.FormControl', 'x'.repeat(300));
    const typedLen = await page.evaluate(
      () =>
        document.querySelector('.customEmoji-categoryGroup h3 form input.FormControl')?.value
          .length ?? 0
    );
    check('E2 → rename input clamps to 255 chars (maxlength, like the edit modal)',
      typedLen <= 255,
      `typed length=${typedLen}`);
    // Leave edit mode without saving.
    await page
      .click('.customEmoji-categoryGroup h3 form button:not(.Button--primary)')
      .catch(() => {});

    // ---------------------------------------------------------------
    // Scenario C — review finding #3: "__proto__" category must not
    // break the grouped list. Runs LAST: the crash (while the bug
    // exists) makes the list un-renderable, and cleanup falls back to
    // a bootstrap delete because the admin UI itself is broken.
    // ---------------------------------------------------------------
    console.log('\n[C] category named "__proto__" does not crash the list');
    await deleteAllCustomEmojis(page, BASE);
    await gotoAdmin(page, BASE);
    let setupCrashed = false;
    try {
      await addCustomEmoji(page, {
        title: 'Proto Emoji',
        shortcode: ':flamoji_cg_proto:',
        category: '__proto__',
        path: PNG_DATA_URI,
      });
      await addCustomEmoji(page, {
        title: 'Safe Emoji',
        shortcode: ':flamoji_cg_safe:',
        category: 'Safe Cat',
        path: PNG_DATA_URI,
      });
    } catch (e) {
      // Saving triggers a list redraw with the broken grouping —
      // crashing here IS the bug under test; note it and continue.
      setupCrashed = true;
      console.log(`  (list threw while adding an emoji: ${String(e.message).slice(0, 120)})`);
    }

    await gotoAdmin(page, BASE);
    await page.waitForSelector('.customEmoji-list', { timeout: 10_000 });
    await page.waitForTimeout(1000);

    const protoCounts = await groupCounts(page);
    check('C1 → admin list still renders with a "__proto__" category present',
      Object.keys(protoCounts).length >= 1 && !setupCrashed,
      `groups=${JSON.stringify(protoCounts)} setupCrashed=${setupCrashed}`);
    check('C2 → "__proto__" group renders with its emoji',
      (protoCounts['__proto__'] ?? 0) === 1,
      `groups=${JSON.stringify(protoCounts)}`);
    await page.screenshot({ path: resolve(HERE, '_c2-diag.png') });
    check('C3 → ordinary categories still render alongside',
      (protoCounts['Safe Cat'] ?? 0) === 1,
      `groups=${JSON.stringify(protoCounts)}`);
  } finally {
    console.log('\n[cleanup] removing all custom emojis');
    try {
      await deleteAllCustomEmojis(page, BASE);
    } catch (e) {
      console.log(`  (UI cleanup failed: ${String(e.message).slice(0, 120)})`);
    }
    // While the __proto__ bug exists, a crashed list render can leave
    // the DOM at an intermediate state (no spinner, no rows) where the
    // UI cleanup cannot see the debris. Sweep the table from the
    // bootstrap regardless — it is a no-op once the list renders
    // correctly and deleteAllCustomEmojis has already emptied it.
    await dbExecStatement('DELETE FROM custom_emojis');
    await clearCache();
    // Tidy the export download even if an earlier scenario threw.
    if (dlPath) { try { unlinkSync(dlPath); } catch {} }
  }

  // No unexpected JS errors — page errors caused by the known grouping
  // crash (finding #3) are tolerated until it is fixed.
  const unexpected = pageErrors.filter(
    (m) => !/\.push is not a function|__proto__|Object\.prototype/i.test(m)
  );
  check('no unexpected JS errors', unexpected.length === 0, unexpected.join('; '));
});
