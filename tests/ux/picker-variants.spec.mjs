// Picker variant baseline specs.
//
// Captures structural + pixel baselines for every admin-toggleable
// picker configuration so regressions in any mode are caught:
//
//   1. native   — picker_set=native (system emoji, no Twemoji sprites)
//   2. no-skin  — show_variants=false (skin-tone selector hidden)
//   3. no-preview — show_preview=false (preview row hidden)
//   4. no-search — show_search=false (search bar hidden)
//   5. no-category — show_category_buttons=false (nav bar hidden)
//   6. no-recents — show_recents=false (Recently Used tab hidden)
//
// Each variant applies its override, captures, then restores defaults
// before the next. Baselines live in tests/ux/_baselines/.
//
// Set FLAMOJI_BASELINE_UPDATE=1 to accept new baselines.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { applySettings, DEFAULTS, gotoAdmin, addCustomEmoji, deleteCustomEmojiByShortcode, deleteAllCustomEmojis } from './_admin.mjs';

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

async function openComposer(page) {
  for (const sel of ['.IndexPage-newDiscussion', 'button[onclick*="composer"]', 'button.Button--primary']) {
    const btn = await page.$(sel);
    if (btn) { await btn.click(); return; }
  }
  throw new Error('Could not find a "new discussion" button.');
}

async function openPicker(page) {
  await page.waitForSelector('button.Button-flamoji', { timeout: 10_000 });
  await page.click('button.Button-flamoji');
  await page.waitForSelector('em-emoji-picker.flamoji-picker-popup', { timeout: 15_000 });
  // Wait for tiles to paint.
  await page.waitForFunction(
    () => {
      const p = document.querySelector('em-emoji-picker.flamoji-picker-popup');
      const sr = p?.shadowRoot;
      if (!sr) return false;
      return sr.querySelectorAll('.category button').length > 3;
    },
    { timeout: 10_000 }
  );
  await page.waitForTimeout(800);
}

function snapshotPicker(page) {
  return page.evaluate(() => {
    const picker = document.querySelector('em-emoji-picker.flamoji-picker-popup');
    if (!picker) return { error: 'no picker' };
    const sr = picker.shadowRoot;
    const navLabels = [...sr.querySelectorAll('nav button[aria-label]')]
      .map((b) => b.getAttribute('aria-label'));
    return {
      visible: picker.style.display !== 'none',
      hasSearchInput: !!sr.querySelector('input[type="search"]'),
      hasPreview: !!sr.querySelector('.preview-placeholder, [class*="preview"]'),
      hasSkinToneButton: !!sr.querySelector('.skin-tone-button'),
      navLabels,
      navCount: navLabels.length,
      firstTileHasSpriteBackground:
        !!sr.querySelector('.category button span[style*="background-image"]'),
    };
  });
}

async function capturePicker(page) {
  return page.evaluate(() => {
    const p = document.querySelector('em-emoji-picker.flamoji-picker-popup');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });
}

async function comparePixelBaseline(page, bbox, baselineFile, label) {
  if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
    check(`${label} — has bounding box`, false, `bbox=${JSON.stringify(bbox)}`);
    return;
  }
  check(`${label} — has bounding box`, true);

  const actual = await page.screenshot({ clip: bbox, omitBackground: false });

  if (UPDATE || !existsSync(baselineFile)) {
    mkdirSync(BASELINES, { recursive: true });
    writeFileSync(baselineFile, actual);
    console.log(`  → baseline written: ${baselineFile} (${bbox.width}×${bbox.height})`);
    return;
  }

  const expectedPng = PNG.sync.read(readFileSync(baselineFile));
  const actualPng = PNG.sync.read(actual);

  if (expectedPng.width !== actualPng.width || expectedPng.height !== actualPng.height) {
    const actualFile = baselineFile.replace('.png', '-actual.png');
    writeFileSync(actualFile, actual);
    check(`${label} — pixel match`, false,
      `dimensions changed: ${expectedPng.width}×${expectedPng.height} → ${actualPng.width}×${actualPng.height}. Wrote ${actualFile}`);
    return;
  }

  const { width, height } = expectedPng;
  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(expectedPng.data, actualPng.data, diff.data, width, height,
    { threshold: 0.1, includeAA: false });
  const pct = (mismatched / (width * height)) * 100;
  const ok = pct <= 1.0;
  if (!ok) {
    writeFileSync(baselineFile.replace('.png', '-actual.png'), actual);
    writeFileSync(baselineFile.replace('.png', '-diff.png'), PNG.sync.write(diff));
  }
  check(`${label} — pixel match (within 1%)`, ok,
    ok ? `(${pct.toFixed(3)}%)` : `${pct.toFixed(3)}% diff. Re-run with FLAMOJI_BASELINE_UPDATE=1`);
}

// Each variant: { id, label, overrides, structural checks }
const VARIANTS = [
  {
    id: 'native',
    label: 'picker_set=native',
    overrides: { ...DEFAULTS, picker_set: 'native' },
    checks: (snap) => {
      check('native — picker visible', snap.visible);
      check('native — NO Twemoji sprite (uses system emoji)', !snap.firstTileHasSpriteBackground);
      check('native — search present', snap.hasSearchInput);
      check('native — preview present', snap.hasPreview);
    },
  },
  {
    id: 'no-skintone',
    label: 'show_variants=false',
    overrides: { ...DEFAULTS, show_variants: false },
    checks: (snap) => {
      check('no-skintone — picker visible', snap.visible);
      check('no-skintone — skin-tone button absent', !snap.hasSkinToneButton);
      check('no-skintone — preview still present', snap.hasPreview);
    },
  },
  {
    id: 'no-preview',
    label: 'show_preview=false',
    overrides: { ...DEFAULTS, show_preview: false },
    checks: (snap) => {
      check('no-preview — picker visible', snap.visible);
      check('no-preview — preview absent', !snap.hasPreview);
      check('no-preview — search still present', snap.hasSearchInput);
    },
  },
  {
    id: 'no-search',
    label: 'show_search=false',
    overrides: { ...DEFAULTS, show_search: false },
    checks: (snap) => {
      check('no-search — picker visible', snap.visible);
      check('no-search — search absent', !snap.hasSearchInput);
      check('no-search — nav still present', snap.navCount >= 8);
      check('no-search — preview still present', snap.hasPreview);
    },
  },
  {
    id: 'no-category',
    label: 'show_category_buttons=false',
    overrides: { ...DEFAULTS, show_category_buttons: false },
    checks: (snap) => {
      check('no-category — picker visible', snap.visible);
      check('no-category — nav absent', snap.navCount === 0);
      check('no-category — search still present', snap.hasSearchInput);
      check('no-category — preview still present', snap.hasPreview);
    },
  },
  {
    id: 'no-recents',
    label: 'show_recents=false',
    overrides: { ...DEFAULTS, show_recents: false },
    checks: (snap) => {
      check('no-recents — picker visible', snap.visible);
      // "Recently Used" tab should be gone; other categories remain.
      const hasRecent = snap.navLabels.some((l) => /recent/i.test(l));
      check('no-recents — Recently Used tab absent', !hasRecent);
      check('no-recents — other categories still present', snap.navCount >= 7);
    },
  },
];

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

  // Ensure clean state: no leftover custom emojis from prior specs.
  console.log('\n[setup] cleaning custom emojis');
  await deleteAllCustomEmojis(page, BASE);

  for (const variant of VARIANTS) {
    console.log(`\n[variant: ${variant.id}] applying ${variant.label}`);
    await applySettings(page, variant.overrides, BASE);

    await page.goto(BASE, { waitUntil: 'load' });
    await openComposer(page);
    await openPicker(page);

    const snap = await snapshotPicker(page);
    variant.checks(snap);

    // Structural baseline
    const structFile = resolve(BASELINES, `picker-${variant.id}.json`);
    if (UPDATE || !existsSync(structFile)) {
      mkdirSync(BASELINES, { recursive: true });
      writeFileSync(structFile, JSON.stringify(snap, null, 2) + '\n');
      console.log(`  → structural baseline written: ${structFile}`);
    } else {
      const expected = JSON.parse(readFileSync(structFile, 'utf-8'));
      const diffs = Object.keys(expected)
        .filter((k) => JSON.stringify(expected[k]) !== JSON.stringify(snap[k]));
      check(`${variant.id} — structural baseline matches`, diffs.length === 0,
        diffs.length ? `keys differ: ${diffs.join(', ')}` : '');
    }

    // Pixel baseline (use twemoji for deterministic sprites, native for native)
    const pixelFile = resolve(BASELINES, `picker-${variant.id}.png`);
    const bbox = await capturePicker(page);
    await comparePixelBaseline(page, bbox, pixelFile, variant.id);

    // Close picker for next round
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // Restore defaults for next spec
  console.log('\n[teardown] restoring defaults');
  await applySettings(page, DEFAULTS, BASE);

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
console.log('\nAll picker-variants checks passed.');
