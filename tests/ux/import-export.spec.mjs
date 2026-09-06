// Custom-emoji import/export UX test, end-to-end through the admin panel.
//
// Spec:    tests/ux/import-export.md
// Runtime: node tests/ux/import-export.spec.mjs
//
// What this proves (2.x grouped export/import contract)
// -----------------------------------------------------
// * Clicking the admin "Export JSON" button downloads a flamoji.json
//   payload in the grouped schema { "<category>": [row, ...] } where
//   every row carries {title, text_to_replace, category, path}.
// * The import modal accepts BOTH shapes:
//     - the legacy flat array (back-compat with pre-grouping exports),
//     - the new grouped object written by the exporter.
// * Additive import (append mode) keeps every pre-existing row.
// * Override mode (switch + confirm checkbox) replaces the entire
//   custom-emoji set with the imported payload.
//
// All operations go through the admin UI buttons and the Import JSON
// modal — no REST shortcuts. The download is captured via Playwright's
// `download` event; imports are typed into the modal's textarea and
// observed via the /flamojis/import network response.
//
// Cleanup: all custom emojis are removed via the admin Delete button at
// end of test, regardless of pass/fail.

import { readFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSpec } from '../../.pianotell/tests/ux/helpers.mjs';
import {
  gotoAdmin,
  addCustomEmoji,
  deleteAllCustomEmojis,
  listCustomEmojiShortcodes,
} from './_admin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// 1×1 transparent PNG; the admin UI doesn't validate path content and
// emoji-mart still renders the tile (with a broken-image glyph) which
// is enough for the row to count as present.
const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Open the Import JSON modal, paste the payload into its textarea,
// optionally arm override mode (switch + confirm checkbox), submit, and
// wait for the POST /flamojis/import response. Returns the response.
// The caller is responsible for re-navigating afterwards (the handler
// reloads the page, which can race under load).
async function importViaModal(page, payloadJson, { override = false } = {}) {
  const importBtn = page.locator('.ExtensionPage-headerTopItems button', {
    hasText: 'Import JSON',
  });
  await importBtn.waitFor({ timeout: 10_000 });
  await importBtn.click();
  await page.waitForSelector('.Flamoji-ImportEmojisModal', { timeout: 10_000 });

  const importResponse = page.waitForResponse(
    (resp) => resp.url().includes('/flamojis/import'),
    { timeout: 15_000 }
  );

  await page.fill('.Flamoji-ImportEmojisModal textarea.FormControl', payloadJson);

  if (override) {
    await page.click('.Flamoji-ImportEmojisModal label.Checkbox--switch');
    await page.check('.Flamoji-ImportEmojisModal label.checkbox input[type="checkbox"]');
  }

  await page.click('.Flamoji-ImportEmojisModal button.Button--primary');
  const resp = await importResponse;

  // Success path closes the modal (clearCache → reload). Give it a
  // moment, then force it closed so a failure here can't poison the
  // next step.
  try {
    await page.waitForFunction(
      () => !document.querySelector('.Flamoji-ImportEmojisModal'),
      null,
      { timeout: 5_000 }
    );
  } catch {
    const close = await page.$('.Flamoji-ImportEmojisModal .Modal-close .Button');
    if (close) await close.click();
  }
  return resp;
}

await runSpec({
  specName: 'import-export',
  outputDir: HERE,
  acceptDownloads: true,
}, async ({ page, check, BASE }) => {
  let dlPath = null;

  try {
    // ---- Precondition: clean slate + one uncategorized seed emoji ----
    console.log('\n[setup] cleaning custom emojis and seeding one');
    await deleteAllCustomEmojis(page, BASE);
    await gotoAdmin(page, BASE);
    await addCustomEmoji(page, {
      title: 'Import Export Seed',
      shortcode: ':flamoji_ie_seed:',
      path: 'https://cdn.jsdelivr.net/npm/emoji-datasource-twitter@15.0.1/img/twitter/64/1f600.png',
    });

    // ---- 1. Export: grouped schema ----
    console.log('\n[export] download flamoji.json via admin button');
    await gotoAdmin(page, BASE);

    const exportBtn = page.locator('.ExtensionPage-headerTopItems button', {
      hasText: 'Export JSON',
    });
    await exportBtn.waitFor({ timeout: 10_000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
    await exportBtn.click();
    const download = await downloadPromise;

    check('export → download has filename "flamoji.json"', download.suggestedFilename() === 'flamoji.json',
      `got "${download.suggestedFilename()}"`);

    dlPath = resolve(HERE, `_export-temp-${Date.now()}.json`);
    await download.saveAs(dlPath);
    let exported;
    try {
      exported = JSON.parse(readFileSync(dlPath, 'utf-8'));
    } catch (e) {
      check('export → JSON parses', false, e.message);
      throw e;
    }
    check('export → JSON parses', true);

    // New contract: { "<category>": [ {title, text_to_replace,
    // category, path}, ... ], ... }. Uncategorized rows are grouped
    // under the translator's "Uncategorized" heading.
    const isGrouped = exported && typeof exported === 'object' && !Array.isArray(exported);
    check('export → grouped object (not a flat array)', isGrouped,
      `type=${Array.isArray(exported) ? 'array' : typeof exported}`);

    const looksLikeRow = (r) =>
      r && typeof r === 'object' && 'title' in r && 'text_to_replace' in r
      && 'category' in r && 'path' in r;

    let totalRows = 0;
    let invalidRows = 0;
    let groupKeyMismatches = 0;
    if (isGrouped) {
      for (const [group, rows] of Object.entries(exported)) {
        if (!Array.isArray(rows)) { invalidRows += 1; continue; }
        for (const row of rows) {
          totalRows += 1;
          if (!looksLikeRow(row)) invalidRows += 1;
          else if (group !== 'Uncategorized' && row.category !== group) groupKeyMismatches += 1;
        }
      }
    }
    check('export → every row has {title, text_to_replace, category, path}',
      invalidRows === 0,
      `rows=${totalRows} invalid=${invalidRows}`);
    check('export → group key matches each row\'s category (except Uncategorized)',
      groupKeyMismatches === 0,
      `mismatches=${groupKeyMismatches}`);

    const allExportedShortcodes = isGrouped
      ? Object.values(exported).flat().map((r) => r.text_to_replace).filter(Boolean)
      : [];
    check('export → non-empty (seed emoji present)',
      allExportedShortcodes.includes(':flamoji_ie_seed:'),
      `shortcodes=${JSON.stringify(allExportedShortcodes)}`);

    // ---- 2. Import legacy flat array (back-compat) ----
    console.log('\n[import:flat] import old-format flat array via modal');
    await gotoAdmin(page, BASE);
    const flatPayload = [{
      title: 'Flamoji IE Flat Fixture',
      text_to_replace: ':flamoji_ie_flat:',
      path: PNG_DATA_URI,
    }];
    const flatResp = await importViaModal(page, JSON.stringify(flatPayload));
    check('import flat → POST succeeded', flatResp.status() === 200, `status=${flatResp.status()}`);

    await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
    await gotoAdmin(page, BASE);
    await page.waitForSelector('.customEmoji-list', { timeout: 10_000 });
    await page.waitForTimeout(1500);

    let shortcodes = await listCustomEmojiShortcodes(page);
    check('import flat → fixture row present in admin list',
      shortcodes.includes(':flamoji_ie_flat:'),
      `shortcodes=${JSON.stringify(shortcodes)}`);
    check('import flat → pre-existing seed still present (additive)',
      shortcodes.includes(':flamoji_ie_seed:'),
      `shortcodes=${JSON.stringify(shortcodes)}`);

    // ---- 3. Import grouped payload (new format, named category) ----
    console.log('\n[import grouped] import grouped object via modal');
    await gotoAdmin(page, BASE);
    const groupedPayload = {
      'Flamoji IE Test': [{
        title: 'Flamoji IE Grouped Fixture',
        text_to_replace: ':flamoji_ie_grouped:',
        category: 'Flamoji IE Test',
        path: PNG_DATA_URI,
      }],
    };
    const groupedResp = await importViaModal(page, JSON.stringify(groupedPayload));
    check('import grouped → POST succeeded', groupedResp.status() === 200, `status=${groupedResp.status()}`);

    await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
    await gotoAdmin(page, BASE);
    await page.waitForSelector('.customEmoji-list', { timeout: 10_000 });
    await page.waitForTimeout(1500);

    shortcodes = await listCustomEmojiShortcodes(page);
    check('import grouped → fixture row present in admin list',
      shortcodes.includes(':flamoji_ie_grouped:'),
      `shortcodes=${JSON.stringify(shortcodes)}`);
    check('import grouped → all previous rows still present (additive)',
      shortcodes.includes(':flamoji_ie_flat:') && shortcodes.includes(':flamoji_ie_seed:'),
      `shortcodes=${JSON.stringify(shortcodes)}`);

    // ---- 4. Override mode replaces the whole set ----
    console.log('\n[import override] replace all emojis via override mode');
    await gotoAdmin(page, BASE);
    const overridePayload = [{
      title: 'Flamoji IE Override Fixture',
      text_to_replace: ':flamoji_ie_override:',
      path: PNG_DATA_URI,
    }];
    const overrideResp = await importViaModal(page, JSON.stringify(overridePayload), { override: true });
    check('import override → POST succeeded', overrideResp.status() === 200, `status=${overrideResp.status()}`);

    await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
    await gotoAdmin(page, BASE);
    await page.waitForSelector('.customEmoji-list', { timeout: 10_000 });
    await page.waitForTimeout(1500);

    shortcodes = await listCustomEmojiShortcodes(page);
    check('import override → pre-existing rows are gone',
      !shortcodes.includes(':flamoji_ie_seed:')
      && !shortcodes.includes(':flamoji_ie_flat:')
      && !shortcodes.includes(':flamoji_ie_grouped:'),
      `shortcodes=${JSON.stringify(shortcodes)}`);
    check('import override → only the override fixture remains',
      shortcodes.length === 1 && shortcodes.includes(':flamoji_ie_override:'),
      `shortcodes=${JSON.stringify(shortcodes)}`);

  } finally {
    console.log('\n[cleanup] removing all custom emojis via admin Delete buttons');
    await deleteAllCustomEmojis(page, BASE).catch((e) =>
      console.log(`  (cleanup failed: ${e.message.slice(0, 80)})`)
    );
    // Tidy the exported download even if an earlier scenario threw.
    if (dlPath) { try { unlinkSync(dlPath); } catch {} }
  }
});
