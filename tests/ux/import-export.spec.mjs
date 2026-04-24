// Custom-emoji import/export UX test, end-to-end through the admin panel.
//
// Spec:    tests/ux/import-export.md
// Runtime: node tests/ux/import-export.spec.mjs
//
// What this proves
// ----------------
// * Clicking the admin "Export JSON" button downloads a flamoji.json
//   payload whose schema matches what the import endpoint accepts.
// * Clicking the admin "Import JSON" button, confirming the dialog,
//   and selecting a JSON file containing a fresh emoji actually
//   creates that emoji on the forum.
// * Round-trip: export, edit JSON to add one row, re-import; verify the
//   exported file's existing rows survive and the new one appears.
//
// All operations go through the admin UI buttons — no REST shortcuts.
// The download is captured via Playwright's `download` event; the
// upload is fed via the `filechooser` event triggered by the
// programmatic <input type="file"> the admin code creates.
//
// Cleanup: any imported fixture rows are removed via the admin Delete
// button at end of test, regardless of pass/fail.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import {
  gotoAdmin,
  addCustomEmoji,
  deleteCustomEmojiByShortcode,
  deleteAllCustomEmojis,
  listCustomEmojiShortcodes,
} from './_admin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PIANOTELL_FLARUM_UX_BASE_URL;
const COOKIE = process.env.PIANOTELL_FLARUM_UX_COOKIE;
if (!BASE || !COOKIE) {
  console.error(
    'PIANOTELL_FLARUM_UX_BASE_URL and PIANOTELL_FLARUM_UX_COOKIE must be set. See tests/ux/README.md.'
  );
  process.exit(2);
}

// 1×1 transparent PNG; the admin UI doesn't validate path content and
// emoji-mart still renders the tile (with a broken-image glyph) which
// is enough for the row to count as present.
const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const IMPORT_FIXTURE_TITLE = 'Flamoji Import Fixture';
const IMPORT_FIXTURE_SHORTCODE = ':flamoji_import_fixture:';

const failures = [];
function check(label, ok, detail) {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    console.log(`  ✗ ${label}  ${detail ?? ''}`);
    failures.push({ label, detail });
  }
}

let browser;
let toCleanupShortcodes = [];

try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
  await ctx.addCookies([
    { name: 'flarum_remember', value: COOKIE, url: BASE },
  ]);
  const page = await ctx.newPage();

  // ---- Precondition: clean slate + one seed emoji ----
  // Clear any leftover custom emojis from prior specs, then seed one
  // so the export test has data to export.
  console.log('\n[setup] cleaning custom emojis and seeding one');
  await deleteAllCustomEmojis(page, BASE);
  await gotoAdmin(page, BASE);
  await addCustomEmoji(page, {
    title: 'Import Export Seed',
    shortcode: ':flamoji_ie_seed:',
    path: 'https://cdn.jsdelivr.net/npm/emoji-datasource-twitter@15.0.1/img/twitter/64/1f600.png',
  });
  toCleanupShortcodes.push(':flamoji_ie_seed:');

  // ---- 1. Export ----
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

  const dlPath = resolve(tmpdir(), `flamoji-export-${Date.now()}.json`);
  await download.saveAs(dlPath);
  let exported;
  try {
    exported = JSON.parse(readFileSync(dlPath, 'utf-8'));
  } catch (e) {
    check('export → JSON parses', false, e.message);
    throw e;
  }
  check('export → JSON parses', true);

  // The export shape is { "0": {title, text_to_replace, path}, "1": {...}, ... }
  const exportedRows = Object.values(exported);
  const looksLikeRow = (r) =>
    r && typeof r === 'object' && 'title' in r && 'text_to_replace' in r && 'path' in r;
  const allRowsValid = exportedRows.every(looksLikeRow);
  check('export → every row has {title, text_to_replace, path}',
    allRowsValid,
    `rows=${exportedRows.length} invalid=${exportedRows.filter((r) => !looksLikeRow(r)).length}`);

  // The forum always has at least :pianotell: from the seed; assert
  // export is non-empty so future regressions that silently drop rows
  // get caught.
  check('export → non-empty (seed emoji present)', exportedRows.length >= 1,
    `got ${exportedRows.length} rows`);

  // ---- 2. Import (round-trip + new row) ----
  console.log('\n[import] inject one row, import via admin button');

  const importPayload = { ...exported };
  const newKey = String(Object.keys(importPayload).length);
  importPayload[newKey] = {
    title: IMPORT_FIXTURE_TITLE,
    text_to_replace: IMPORT_FIXTURE_SHORTCODE,
    path: PNG_DATA_URI,
  };

  const importPath = resolve(tmpdir(), `flamoji-import-${Date.now()}.json`);
  writeFileSync(importPath, JSON.stringify(importPayload), 'utf-8');

  // Set up the file chooser handler BEFORE clicking — the admin code
  // creates an <input type="file"> and immediately calls .click(),
  // which fires `filechooser` on the page synchronously.
  // Also accept the native confirm() dialog.
  page.once('dialog', (d) => d.accept());
  const filechooserPromise = page.waitForEvent('filechooser', { timeout: 10_000 });

  const importBtn = page.locator('.ExtensionPage-headerTopItems button', {
    hasText: 'Import JSON',
  });
  await importBtn.click();

  const filechooser = await filechooserPromise;
  toCleanupShortcodes.push(IMPORT_FIXTURE_SHORTCODE);
  await filechooser.setFiles(importPath);

  // The import handler reloads the page on success. Wait for the
  // navigation to settle, then re-navigate to admin to confirm the
  // new row landed.
  await page.waitForLoadState('load', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  // Force a full reload to clear any stale app.store state, then
  // navigate to the admin extension page.
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
  await gotoAdmin(page, BASE);
  await page.waitForSelector('.customEmoji-list', { timeout: 10_000 });
  // Wait for the list to finish loading (the API fetch is async after mount).
  await page.waitForTimeout(2000);

  const shortcodes = await listCustomEmojiShortcodes(page);
  check('import → fixture row present in admin list',
    shortcodes.includes(IMPORT_FIXTURE_SHORTCODE),
    `shortcodes=${JSON.stringify(shortcodes)}`);

  // Round-trip check: the export rows that pre-existed should still
  // be present (importer is additive — does not wipe existing).
  const preexistingShortcodes = exportedRows
    .map((r) => r.text_to_replace)
    .filter(Boolean);
  const survivors = preexistingShortcodes.filter((sc) => shortcodes.includes(sc));
  check('import → all pre-existing rows still present (additive import)',
    survivors.length === preexistingShortcodes.length,
    `pre=${preexistingShortcodes.length} survived=${survivors.length}`);

  // Tidy local files.
  try { unlinkSync(dlPath); } catch {}
  try { unlinkSync(importPath); } catch {}

  console.log('\n[cleanup] deleting fixture row via admin Delete button');
  for (const sc of toCleanupShortcodes) {
    await deleteCustomEmojiByShortcode(page, sc).catch((e) =>
      console.log(`  (cleanup of ${sc} failed: ${e.message.slice(0, 80)})`)
    );
  }
  toCleanupShortcodes = [];
} catch (err) {
  failures.push({ label: 'unhandled exception', detail: err.message });
  if (browser) {
    try {
      const pages = browser.contexts().flatMap((c) => c.pages());
      if (pages[0]) {
        const shotPath = resolve(HERE, '_failure.png');
        await pages[0].screenshot({ path: shotPath, fullPage: true });
        console.error(`  saved failure screenshot to ${shotPath}`);
      }
    } catch {}
  }
} finally {
  if (browser) {
    try {
      // Best-effort cleanup for any leftover fixture rows.
      if (toCleanupShortcodes.length) {
        const ctx = browser.contexts()[0];
        const page = ctx?.pages()[0];
        if (page) {
          await gotoAdmin(page, BASE);
          for (const sc of toCleanupShortcodes) {
            await deleteCustomEmojiByShortcode(page, sc).catch(() => {});
          }
        }
      }
    } catch {}
    await browser.close();
  }
}

mkdirSync(HERE, { recursive: true });
writeFileSync(resolve(HERE, '_failures.json'), JSON.stringify(failures, null, 2));

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const f of failures) console.error(` - ${f.label}: ${f.detail ?? ''}`);
  process.exit(1);
}
console.log('\nAll import-export checks passed.');
