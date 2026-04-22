// Custom-emoji UX test, end-to-end through the admin panel.
//
// Spec:    tests/ux/custom-emoji.md (read first; this file asserts that)
// Runtime: node tests/ux/custom-emoji.spec.mjs
//
// What this proves
// ----------------
// Drives the actual admin UI to create a custom emoji, observes that
// the forum picker surfaces it, exercises search+insert in the picker,
// then drives the admin UI again to delete it and verifies the picker
// drops it back to baseline.
//
// No DB writes, no REST POST/DELETE calls — anything we'd want to
// "skip ahead" with goes through the same Add/Edit/Delete flow a human
// admin uses, so a regression in that flow fails the test.
//
// Inputs (env, mirrors the other specs):
//   PIANOTELL_FLARUM_UX_BASE_URL    forum origin (e.g. https://localhost/)
//   PIANOTELL_FLARUM_UX_COOKIE      flarum_remember cookie value (admin)
//
// Failure mode: writes tests/ux/_failure.png + _failures.json, exits non-zero.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  gotoAdmin,
  addCustomEmoji,
  deleteCustomEmojiByShortcode,
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

// Fixture identity. Title contains "fixture" so emoji-mart's prefix-
// tokenised keyword index matches a search for "fixture". The path is
// a 1×1 transparent PNG data URI — the admin UI doesn't validate the
// path, and emoji-mart still renders the tile (with a broken image
// glyph) which is enough for the click flow to register.
const FIXTURE_TITLE = 'Flamoji UX Fixture';
const FIXTURE_SHORTCODE = ':flamoji_ux_fixture:';
const FIXTURE_PATH =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const failures = [];
function check(label, ok, detail) {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    console.log(`  ✗ ${label}  ${detail ?? ''}`);
    failures.push({ label, detail });
  }
}

// ---------- forum-side helpers (shared shape with picker-features) ----------

async function openComposer(page) {
  for (const sel of ['.IndexPage-newDiscussion', 'button[onclick*="composer"]', 'button.Button--primary']) {
    const btn = await page.$(sel);
    if (btn) { await btn.click(); return; }
  }
  throw new Error('Could not find a "new discussion" button to open the composer.');
}

async function openPicker(page) {
  await page.waitForSelector('button.Button-flamoji, button[title*="moji" i]', { timeout: 10_000 });
  await page.click('button.Button-flamoji, button[title*="moji" i]');
  await page.waitForSelector('em-emoji-picker.flamoji-picker-popup', { timeout: 15_000 });
  await page.waitForFunction(() => {
    const sr = document.querySelector('em-emoji-picker.flamoji-picker-popup')?.shadowRoot;
    return sr && (sr.querySelector('.category button') || sr.querySelector('nav button'));
  }, { timeout: 15_000 });
  await page.waitForTimeout(300);
}

// Snapshot whatever we need to assert about the Custom category.
// emoji-mart lazy-renders categories outside the visible scroll area,
// so we click the Custom nav button (if present) to scroll its section
// into view before counting tiles. Falls back to a direct snapshot if
// no Custom nav exists (i.e. no custom emoji on the forum at all).
async function pickerSnapshot(page) {
  await page.evaluate(() => {
    const sr = document.querySelector('em-emoji-picker.flamoji-picker-popup').shadowRoot;
    const customNav = [...sr.querySelectorAll('nav button[aria-label]')].find((b) =>
      /custom/i.test(b.getAttribute('aria-label') || '')
    );
    customNav?.click();
  });
  await page.waitForTimeout(400);
  return await page.evaluate(() => {
    const sr = document.querySelector('em-emoji-picker.flamoji-picker-popup').shadowRoot;
    const navLabels = [...sr.querySelectorAll('nav button[aria-label]')].map((b) =>
      b.getAttribute('aria-label')
    );
    const customCat = [...sr.querySelectorAll('.category')].find((c) =>
      /custom/i.test(c.querySelector('.sticky')?.textContent || '')
    );
    const customTileCount = customCat
      ? [...customCat.querySelectorAll('button')].filter((b) => !b.hasAttribute('aria-selected')).length
      : 0;
    return { navLabels, hasCustomNav: navLabels.some((l) => /custom/i.test(l)), customTileCount };
  });
}

async function setSearch(page, q) {
  await page.evaluate((query) => {
    const input = document
      .querySelector('em-emoji-picker.flamoji-picker-popup')
      .shadowRoot.querySelector('input[type="search"]');
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, q);
  await page.waitForTimeout(400);
}

// emoji-mart renders search results inside a `.category` whose sticky
// heading starts with "Search" (the default emoji-mart i18n string).
// Buttons inside it carry `aria-posinset` but no `aria-label` — we
// count clickable, non-radio buttons.
async function searchResultCount(page) {
  return await page.evaluate(() => {
    const sr = document.querySelector('em-emoji-picker.flamoji-picker-popup').shadowRoot;
    const cat = [...sr.querySelectorAll('.category')].find((c) =>
      /search/i.test(c.querySelector('.sticky')?.textContent || '')
    );
    if (!cat) return 0;
    return [...cat.querySelectorAll('button')].filter((b) => !b.hasAttribute('aria-selected')).length;
  });
}

async function clickFirstResult(page) {
  return await page.evaluate(() => {
    const sr = document.querySelector('em-emoji-picker.flamoji-picker-popup').shadowRoot;
    const cat = [...sr.querySelectorAll('.category')].find((c) =>
      /search/i.test(c.querySelector('.sticky')?.textContent || '')
    );
    const tile = cat && [...cat.querySelectorAll('button')].find((b) => !b.hasAttribute('aria-selected'));
    if (!tile) return false;
    tile.click();
    return true;
  });
}

async function composerText(page) {
  return await page.evaluate(() => document.querySelector('.ComposerBody textarea')?.value ?? '');
}

// ---------- main ----------

(async () => {
  const browser = await chromium.launch();
  let lastPage = null;
  try {
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 900 },
    });
    await ctx.addCookies([{ name: 'flarum_remember', value: COOKIE, url: BASE }]);
    const page = await ctx.newPage();
    lastPage = page;
    await page.context().setExtraHTTPHeaders({ 'cache-control': 'no-cache' });

    // === 0. baseline: clean stale fixture (best-effort), then capture
    // the pre-fixture state of both the admin list AND the forum picker.
    // The test forum may already have other custom emoji (e.g. a
    // pre-existing :pianotell:); we don't want to depend on the exact
    // count, so all later assertions are baseline-relative. ===
    console.log('\n[scenario] baseline');
    await gotoAdmin(page, BASE);
    await deleteCustomEmojiByShortcode(page, FIXTURE_SHORTCODE).catch(() => {});
    const adminBaseline = await listCustomEmojiShortcodes(page);
    console.log(`  → admin list baseline: ${JSON.stringify(adminBaseline)}`);

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await openComposer(page);
    await openPicker(page);
    const pickerBaseline = await pickerSnapshot(page);
    console.log(`  → picker baseline: customTileCount=${pickerBaseline.customTileCount}`);

    // === 1. CREATE via admin "Add Emoji" modal ===
    console.log('\n[scenario] create custom emoji via admin UI');
    await gotoAdmin(page, BASE);
    await addCustomEmoji(page, {
      title: FIXTURE_TITLE,
      shortcode: FIXTURE_SHORTCODE,
      path: FIXTURE_PATH,
    });
    const adminAfterCreate = await listCustomEmojiShortcodes(page);
    console.log(`  → admin list after create: ${JSON.stringify(adminAfterCreate)}`);
    check(
      'admin Custom Emojis list contains the new fixture row',
      adminAfterCreate.includes(FIXTURE_SHORTCODE),
      JSON.stringify(adminAfterCreate)
    );
    check(
      'admin list grew by exactly one row after create',
      adminAfterCreate.length === adminBaseline.length + 1,
      `before=${adminBaseline.length} after=${adminAfterCreate.length}`
    );

    // === 2. VISIBILITY in the forum picker ===
    console.log('\n[scenario] custom emoji surfaces in forum picker');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await openComposer(page);
    await openPicker(page);
    const afterCreate = await pickerSnapshot(page);
    console.log(`  → picker after create: customTileCount=${afterCreate.customTileCount}`);
    check(
      'picker shows a Custom category nav button',
      afterCreate.hasCustomNav,
      `nav=${JSON.stringify(afterCreate.navLabels)}`
    );
    check(
      'Custom category gains exactly one tile after admin create',
      afterCreate.customTileCount === pickerBaseline.customTileCount + 1,
      `before=${pickerBaseline.customTileCount} after=${afterCreate.customTileCount}`
    );

    // === 3. SEARCH by a name token. emoji-mart's SearchIndex pre-builds
    // a token pool from the custom emoji's `name` and `keywords`; in
    // practice "flamoji" reliably matches our fixture (other emoji on
    // this forum don't carry that token), while shorter generic words
    // like "fixture" can be missed by the index. Pick a token that's
    // distinctive AND in the name so the assertion is robust. ===
    console.log('\n[scenario] picker search by name token');
    await setSearch(page, 'flamoji');
    const resultsByTitle = await searchResultCount(page);
    check(
      'searching the picker for "flamoji" returns at least one tile',
      resultsByTitle >= 1,
      `count=${resultsByTitle}`
    );

    // === 4. SEARCH + INSERT inserts the configured shortcode ===
    console.log('\n[scenario] click first search hit → composer gains shortcode');
    const beforeText = await composerText(page);
    const clicked = await clickFirstResult(page);
    check('first search result is clickable', clicked);
    await page.waitForTimeout(200);
    const afterText = await composerText(page);
    check(
      'clicking the custom-emoji tile inserts the shortcode',
      afterText.includes(FIXTURE_SHORTCODE) && afterText.length > beforeText.length,
      `before="${beforeText}" after="${afterText}"`
    );

    // === 5. DELETE via admin pencil → modal Delete button ===
    console.log('\n[scenario] delete custom emoji via admin UI');
    await gotoAdmin(page, BASE);
    const deleted = await deleteCustomEmojiByShortcode(page, FIXTURE_SHORTCODE);
    check('admin delete flow ran (row found, modal opened, Delete clicked)', deleted);
    const adminAfterDelete = await listCustomEmojiShortcodes(page);
    check(
      'admin Custom Emojis list returns to baseline after delete',
      adminAfterDelete.length === adminBaseline.length &&
        !adminAfterDelete.includes(FIXTURE_SHORTCODE),
      `baseline=${adminBaseline.length} after=${adminAfterDelete.length} list=${JSON.stringify(adminAfterDelete)}`
    );

    // === 6. PICKER returns to baseline tile count ===
    console.log('\n[scenario] picker returns to baseline after delete');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await openComposer(page);
    await openPicker(page);
    const afterDelete = await pickerSnapshot(page);
    console.log(`  → picker after delete: customTileCount=${afterDelete.customTileCount}`);
    check(
      'Custom category tile count returns to baseline',
      afterDelete.customTileCount === pickerBaseline.customTileCount,
      `baseline=${pickerBaseline.customTileCount} after=${afterDelete.customTileCount}`
    );

    await ctx.close();
    lastPage = null;
  } catch (err) {
    failures.push({ label: 'unhandled exception', detail: String(err) });
    if (lastPage) {
      mkdirSync(HERE, { recursive: true });
      try {
        await lastPage.screenshot({ path: resolve(HERE, '_failure.png'), fullPage: true });
      } catch {}
    }
  } finally {
    await browser.close();
  }

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed:`);
    for (const f of failures) console.error(` - ${f.label}: ${f.detail ?? ''}`);
    writeFileSync(resolve(HERE, '_failures.json'), JSON.stringify(failures, null, 2));
    process.exit(1);
  }
  console.log('\nAll custom-emoji checks passed.');
})();
