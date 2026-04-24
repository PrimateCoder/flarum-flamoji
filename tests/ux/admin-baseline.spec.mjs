// Admin console baseline spec.
//
// Captures structural + pixel baselines for the Flamoji admin settings
// page and custom emoji list so regressions in the admin UI are caught.
//
// Baselines are captured against default settings.
// Set FLAMOJI_BASELINE_UPDATE=1 to accept new baselines.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { applySettings, DEFAULTS, gotoAdmin, deleteAllCustomEmojis } from './_admin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINES = resolve(HERE, '_baselines');

const BASE = process.env.PIANOTELL_FLARUM_UX_BASE_URL;
const COOKIE = process.env.PIANOTELL_FLARUM_UX_COOKIE;
const UPDATE = process.env.FLAMOJI_BASELINE_UPDATE === '1';

if (!BASE || !COOKIE) {
  console.error(
    'PIANOTELL_FLARUM_UX_BASE_URL and PIANOTELL_FLARUM_UX_COOKIE must be set.'
  );
  process.exit(2);
}

const failures = [];
function check(label, ok, detail) {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    console.log(`  ✗ ${label}  ${detail ?? ''}`);
    failures.push({ label, detail });
  }
}

async function comparePixelBaseline(page, clip, baselineFile, label) {
  const actual = await page.screenshot({ clip, omitBackground: false });

  if (UPDATE || !existsSync(baselineFile)) {
    mkdirSync(BASELINES, { recursive: true });
    writeFileSync(baselineFile, actual);
    console.log(`  → baseline written: ${baselineFile} (${clip.width}×${clip.height})`);
    return;
  }

  const expectedPng = PNG.sync.read(readFileSync(baselineFile));
  const actualPng = PNG.sync.read(actual);

  if (expectedPng.width !== actualPng.width || expectedPng.height !== actualPng.height) {
    writeFileSync(baselineFile.replace('.png', '-actual.png'), actual);
    check(`${label} — pixel match`, false,
      `dimensions changed: ${expectedPng.width}×${expectedPng.height} → ${actualPng.width}×${actualPng.height}`);
    return;
  }

  const { width, height } = expectedPng;
  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(expectedPng.data, actualPng.data, diff.data, width, height,
    { threshold: 0.1, includeAA: false });
  const pct = (mismatched / (width * height)) * 100;
  const ok = pct <= 1.5; // admin pages have more text reflow variance
  if (!ok) {
    writeFileSync(baselineFile.replace('.png', '-actual.png'), actual);
    writeFileSync(baselineFile.replace('.png', '-diff.png'), PNG.sync.write(diff));
  }
  check(`${label} — pixel match (within 1.5%)`, ok,
    ok ? `(${pct.toFixed(3)}%)` : `${pct.toFixed(3)}% diff. Re-run with FLAMOJI_BASELINE_UPDATE=1`);
}

let browser;
try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  await ctx.addCookies([{ name: 'flarum_remember', value: COOKIE, url: BASE }]);
  const page = await ctx.newPage();

  // Ensure clean state: no custom emojis, default settings.
  console.log('\n[setup] cleaning custom emojis');
  await deleteAllCustomEmojis(page, BASE);

  console.log('\n[setup] restoring defaults');
  await applySettings(page, DEFAULTS, BASE);
  await gotoAdmin(page, BASE);

  // ---- Structural snapshot of admin settings ----
  console.log('\n[structural] snapshotting admin settings page');
  const snap = await page.evaluate(() => {
    const container = document.querySelector('.Flamoji--settingsContainer');
    if (!container) return { error: 'no settings container' };

    const switches = [...container.querySelectorAll('label.Checkbox--switch')]
      .map((l) => ({
        label: l.textContent?.trim(),
        checked: !!l.querySelector('input')?.checked,
      }));

    const select = container.querySelector('.Flamoji--emojiSetting select');
    const pickerSet = select?.value || null;

    const freqInput = container.querySelector('.recentsCountGroup input[type="number"]');
    const frequentRows = freqInput ? parseInt(freqInput.value, 10) : null;

    const categories = [...container.querySelectorAll('.cat-checkbox')]
      .map((box) => ({
        name: box.querySelector('label')?.getAttribute('for'),
        checked: !!box.querySelector('input')?.checked,
      }));

    const customEmojiSection = !!document.querySelector('.ExtensionPage-customFlamoji');
    const customEmojiCount = document.querySelectorAll(
      '.customEmoji-list li .customEmoji:not(.addEmoji)'
    ).length;

    return {
      switches,
      pickerSet,
      frequentRows,
      categories,
      customEmojiSection,
      customEmojiCount,
    };
  });

  check('settings container rendered', !snap.error, snap.error);
  check('switches found', (snap.switches?.length ?? 0) >= 6,
    `count=${snap.switches?.length}`);
  check('picker_set dropdown present', snap.pickerSet !== null);
  check('picker_set default is auto', snap.pickerSet === 'auto',
    `got ${snap.pickerSet}`);
  check('frequent_rows input present', snap.frequentRows !== null);
  check('frequent_rows default is 4', snap.frequentRows === 4,
    `got ${snap.frequentRows}`);
  check('category checkboxes present', (snap.categories?.length ?? 0) >= 8,
    `count=${snap.categories?.length}`);
  check('all categories checked by default',
    snap.categories?.every((c) => c.checked),
    snap.categories?.filter((c) => !c.checked).map((c) => c.name).join(', '));
  check('custom emoji section present', snap.customEmojiSection);

  // Save structural baseline
  const structFile = resolve(BASELINES, 'admin-settings.json');
  if (UPDATE || !existsSync(structFile)) {
    mkdirSync(BASELINES, { recursive: true });
    writeFileSync(structFile, JSON.stringify(snap, null, 2) + '\n');
    console.log(`  → structural baseline written: ${structFile}`);
  } else {
    const expected = JSON.parse(readFileSync(structFile, 'utf-8'));
    const diffs = Object.keys(expected)
      .filter((k) => JSON.stringify(expected[k]) !== JSON.stringify(snap[k]));
    check('admin structural baseline matches', diffs.length === 0,
      diffs.length ? `keys differ: ${diffs.join(', ')}` : '');
  }

  // ---- Pixel baseline of settings panel ----
  console.log('\n[pixel] capturing admin settings panel');
  // Scroll the page to top so the settings container is fully visible
  // below the fixed admin header.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  const settingsBox = await page.evaluate(() => {
    const el = document.querySelector('.Flamoji--settingsContainer');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });
  check('settings panel has bounding box', !!settingsBox && settingsBox.width > 0);
  if (settingsBox && settingsBox.width > 0) {
    await comparePixelBaseline(page, settingsBox,
      resolve(BASELINES, 'admin-settings.png'), 'admin-settings');
  }

  // ---- Pixel baseline of custom emoji section ----
  console.log('\n[pixel] capturing custom emoji section');
  // Scroll section into view — it may be below the fold.
  await page.evaluate(() => {
    document.querySelector('.ExtensionPage-customFlamoji')?.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(500);
  const emojiBox = await page.evaluate(() => {
    const el = document.querySelector('.ExtensionPage-customFlamoji');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });
  check('custom emoji section has bounding box', !!emojiBox && emojiBox.width > 0);
  if (emojiBox && emojiBox.width > 0) {
    await comparePixelBaseline(page, emojiBox,
      resolve(BASELINES, 'admin-custom-emojis.png'), 'admin-custom-emojis');
  }

} catch (err) {
  failures.push({ label: 'unhandled exception', detail: err.message });
  console.error(`  EXCEPTION: ${err.message}`);
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
  if (browser) await browser.close();
}

writeFileSync(resolve(HERE, '_failures.json'), JSON.stringify(failures, null, 2));

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const f of failures) console.error(` - ${f.label}: ${f.detail ?? ''}`);
  process.exit(1);
}
console.log('\nAll admin-baseline checks passed.');
