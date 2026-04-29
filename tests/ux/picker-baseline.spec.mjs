// Picker structural + pixel baseline spec.
//
// Spec:    tests/ux/picker-baseline.md
// Runtime: node tests/ux/picker-baseline.spec.mjs
//
// What this proves: In the all-defaults configuration, the forum-side
// picker mounts, has the expected shape, and renders pixels close to
// a committed baseline.
//
// Set FLAMOJI_BASELINE_UPDATE=1 to accept new baselines.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSpec, openComposer, compareScreenshot } from '../../.pianotell/tests/ux/helpers.mjs';
import { applySettings, DEFAULTS, deleteAllCustomEmojis } from './_admin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINES = resolve(HERE, '_baselines');
const STRUCT_FILE = resolve(BASELINES, 'picker-defaults.json');
const PIXEL_FILE = resolve(BASELINES, 'picker-twemoji-default.png');
const UPDATE = process.env.FLAMOJI_BASELINE_UPDATE === '1';

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
  await page.waitForFunction(
    () => {
      const p = document.querySelector('em-emoji-picker.flamoji-picker-popup');
      return p?.shadowRoot?.querySelectorAll('.category button').length > 5;
    },
    { timeout: 10_000 }
  );
  await page.waitForTimeout(800);
}

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
      firstTileUsesTwemojiSprite:
        !!firstSpriteUrl && /twemoji|emoji-mart/i.test(firstSpriteUrl),
      firstTileHasSpriteBackground:
        !!firstTile?.querySelector('span[style*="background-image"]'),
    };
  });
}

await runSpec({
  specName: 'picker-baseline',
  outputDir: HERE,
}, async ({ page, check, BASE }) => {
  // Ensure clean state
  console.log('\n[setup] cleaning custom emojis');
  await deleteAllCustomEmojis(page, BASE);

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

  // ---- Pixel snapshot ----
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
    const total = bbox.width * bbox.height;
    const maxDiff = Math.ceil(total * 0.01); // 1% tolerance
    const result = await compareScreenshot(page, {
      baselinePath: PIXEL_FILE,
      clip: bbox,
      maxDiffPixels: maxDiff,
      update: UPDATE,
    });
    check('pixel baseline matches (within 1% drift)', result.pass, result.detail);
  }
});
