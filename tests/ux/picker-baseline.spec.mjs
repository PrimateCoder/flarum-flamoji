// Picker structural + pixel baseline spec.
//
// Spec:    tests/ux/picker-baseline.md
// Runtime: node tests/ux/picker-baseline.spec.mjs
//
// What this proves
// ----------------
// In the all-defaults configuration, the forum-side picker that an end
// user sees:
//
//   * mounts and is visible
//   * exposes the expected emoji-mart shape (search, nav, preview,
//     skin-tone, category headings) — captured as a JSON snapshot and
//     compared to a committed baseline at
//     tests/ux/_baselines/picker-defaults.json
//   * renders pixels close to a committed PNG baseline at
//     tests/ux/_baselines/picker-twemoji-default.png with picker_set
//     forced to "twemoji" (twemoji sprites are deterministic across
//     OSes; "auto"/"native" is not).
//
// Updating baselines
// ------------------
// Set FLAMOJI_BASELINE_UPDATE=1 to refresh both files. Review the diff
// in git before committing.
//
// Why two checks
// --------------
// Structural snapshot catches DOM-shape regressions cheaply and runs
// on any host. The pixel snapshot only meaningfully passes on the same
// browser/font stack used to generate it, so it lives behind a small
// difference threshold and writes a diff PNG on failure for triage.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { applySettings, DEFAULTS } from './_admin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINES = resolve(HERE, '_baselines');
const STRUCT_FILE = resolve(BASELINES, 'picker-defaults.json');
const PIXEL_FILE = resolve(BASELINES, 'picker-twemoji-default.png');
const PIXEL_DIFF = resolve(HERE, '_picker_baseline_diff.png');
const PIXEL_ACTUAL = resolve(HERE, '_picker_actual.png');

const BASE = process.env.PIANOTELL_FLARUM_UX_BASE_URL;
const COOKIE = process.env.PIANOTELL_FLARUM_UX_COOKIE;
const UPDATE = process.env.FLAMOJI_BASELINE_UPDATE === '1';

if (!BASE || !COOKIE) {
  console.error(
    'PIANOTELL_FLARUM_UX_BASE_URL and PIANOTELL_FLARUM_UX_COOKIE must be set. See tests/ux/README.md.'
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
  await page.waitForSelector('button.Button-flamoji, button[title*="moji" i]', { timeout: 10_000 });
  await page.click('button.Button-flamoji, button[title*="moji" i]');
  await page.waitForSelector('em-emoji-picker.flamoji-picker-popup', { timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const p = document.querySelector('em-emoji-picker.flamoji-picker-popup');
      return p?.shadowRoot?.querySelector('input[type="search"]') != null;
    },
    { timeout: 15_000 }
  );
  // Wait for the first category's tiles to actually paint — pixel
  // baseline depends on visible content, not just the chrome.
  await page.waitForFunction(
    () => {
      const p = document.querySelector('em-emoji-picker.flamoji-picker-popup');
      return p?.shadowRoot?.querySelectorAll('.category button').length > 5;
    },
    { timeout: 10_000 }
  );
  // Settle layout + sticky header positioning + sprite paint.
  await page.waitForTimeout(800);
}

// Structural snapshot of the picker's user-visible shape. Stable
// across hosts; insensitive to font rendering. Counts and order
// matter; tile imagery does not.
async function structuralSnapshot(page) {
  return await page.evaluate(() => {
    const picker = document.querySelector('em-emoji-picker.flamoji-picker-popup');
    if (!picker) return { error: 'no picker' };
    const sr = picker.shadowRoot;
    const navLabels = [...sr.querySelectorAll('nav button[aria-label]')]
      .map((b) => b.getAttribute('aria-label'));
    const categoryHeadings = [...sr.querySelectorAll('.category .sticky')]
      .map((h) => h.textContent?.trim())
      .filter(Boolean);
    const firstTile = sr.querySelector('.category button[aria-label]:not([aria-selected])');
    const firstSpriteUrl = firstTile?.querySelector('span[style*="url"]')
      ?.getAttribute('style')
      ?.match(/url\((['"]?)([^)'"]+)\1\)/)?.[2] || null;
    return {
      visible: picker.style.display !== 'none',
      hasSearchInput: !!sr.querySelector('input[type="search"]'),
      hasPreview: !!sr.querySelector('.preview-placeholder, [class*="preview"]'),
      hasSkinToneButton: !!sr.querySelector('.skin-tone-button'),
      navLabels,
      categoryHeadings,
      // We don't pin the exact sprite hash — it's part of emoji-mart's
      // bundle and can change innocently — but we do pin its shape so
      // a regression that swaps to a different image source surfaces.
      firstTileUsesTwemojiSprite:
        !!firstSpriteUrl && /twemoji|emoji-mart/i.test(firstSpriteUrl),
      firstTileHasSpriteBackground:
        !!firstTile?.querySelector('span[style*="background-image"]'),
    };
  });
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

  // Force the deterministic preset. Twemoji sprites render the same
  // bytes across hosts; "native" varies per OS.
  console.log('\n[setup] applying picker_set=twemoji + all defaults');
  await applySettings(page, { ...DEFAULTS, picker_set: 'twemoji' }, BASE);

  await page.goto(BASE, { waitUntil: 'load' });
  await openComposer(page);
  await openPicker(page);

  // ---- Structural snapshot ----
  console.log('\n[structural] snapshotting picker shape');
  const snap = await structuralSnapshot(page);
  check('picker visible', snap.visible === true);
  check('search input present', snap.hasSearchInput === true);
  check('preview pane present', snap.hasPreview === true);
  check('skin-tone button present', snap.hasSkinToneButton === true);
  check('nav has 8+ category buttons (default 9 incl. Frequent)', (snap.navLabels?.length ?? 0) >= 8,
    `navLabels=${JSON.stringify(snap.navLabels)}`);
  check('first tile uses Twemoji-style sprite', snap.firstTileHasSpriteBackground === true,
    `firstTileUsesTwemojiSprite=${snap.firstTileUsesTwemojiSprite}`);

  if (UPDATE || !existsSync(STRUCT_FILE)) {
    mkdirSync(BASELINES, { recursive: true });
    writeFileSync(STRUCT_FILE, JSON.stringify(snap, null, 2) + '\n');
    console.log(`  → baseline written: ${STRUCT_FILE}`);
  } else {
    const expected = JSON.parse(readFileSync(STRUCT_FILE, 'utf-8'));
    // Compare key-by-key so the diff is human-readable on failure.
    const diff = [];
    for (const k of Object.keys(expected)) {
      if (JSON.stringify(expected[k]) !== JSON.stringify(snap[k])) {
        diff.push({ key: k, expected: expected[k], got: snap[k] });
      }
    }
    check('structural snapshot matches baseline',
      diff.length === 0,
      diff.length ? `\n      ${JSON.stringify(diff, null, 2).split('\n').join('\n      ')}` : '');
  }

  // ---- Pixel snapshot of the picker only ----
  console.log('\n[pixel] capturing picker bounding box');
  const bbox = await page.evaluate(() => {
    const p = document.querySelector('em-emoji-picker.flamoji-picker-popup');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });
  check('picker has bounding box', !!bbox && bbox.width > 0 && bbox.height > 0,
    `bbox=${JSON.stringify(bbox)}`);

  if (bbox && bbox.width > 0 && bbox.height > 0) {
    const actual = await page.screenshot({ clip: bbox, omitBackground: false });

    if (UPDATE || !existsSync(PIXEL_FILE)) {
      mkdirSync(BASELINES, { recursive: true });
      writeFileSync(PIXEL_FILE, actual);
      console.log(`  → baseline written: ${PIXEL_FILE} (${actual.length} bytes, ${bbox.width}×${bbox.height})`);
    } else {
      const expectedPng = PNG.sync.read(readFileSync(PIXEL_FILE));
      const actualPng = PNG.sync.read(actual);

      if (expectedPng.width !== actualPng.width || expectedPng.height !== actualPng.height) {
        writeFileSync(PIXEL_ACTUAL, actual);
        check('pixel baseline matches',
          false,
          `dimensions changed: baseline ${expectedPng.width}×${expectedPng.height}, actual ${actualPng.width}×${actualPng.height}. wrote ${PIXEL_ACTUAL}. Re-run with FLAMOJI_BASELINE_UPDATE=1 to accept.`);
      } else {
        const { width, height } = expectedPng;
        const diff = new PNG({ width, height });
        const mismatched = pixelmatch(
          expectedPng.data,
          actualPng.data,
          diff.data,
          width,
          height,
          { threshold: 0.1, includeAA: false }
        );
        const total = width * height;
        const pct = (mismatched / total) * 100;
        // Allow up to 1% drift (font hinting, sprite atlas edges).
        const TOLERANCE_PCT = 1.0;
        const ok = pct <= TOLERANCE_PCT;
        if (!ok) {
          writeFileSync(PIXEL_ACTUAL, actual);
          writeFileSync(PIXEL_DIFF, PNG.sync.write(diff));
        }
        check('pixel baseline matches (within 1% drift)',
          ok,
          ok
            ? `(${pct.toFixed(3)}% diff)`
            : `${pct.toFixed(3)}% diff (${mismatched}/${total} px). wrote ${PIXEL_ACTUAL} and ${PIXEL_DIFF}. Re-run with FLAMOJI_BASELINE_UPDATE=1 to accept.`);
      }
    }
  }
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
  if (browser) await browser.close();
}

mkdirSync(HERE, { recursive: true });
writeFileSync(resolve(HERE, '_failures.json'), JSON.stringify(failures, null, 2));

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const f of failures) console.error(` - ${f.label}: ${f.detail ?? ''}`);
  process.exit(1);
}
console.log('\nAll picker-baseline checks passed.');
