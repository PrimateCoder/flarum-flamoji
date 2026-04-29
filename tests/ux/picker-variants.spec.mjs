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

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSpec, openComposer, compareScreenshot } from '../../.pianotell/tests/ux/helpers.mjs';
import { applySettings, DEFAULTS, gotoAdmin, addCustomEmoji, deleteCustomEmojiByShortcode, deleteAllCustomEmojis } from './_admin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINES = resolve(HERE, '_baselines');
const UPDATE = process.env.FLAMOJI_BASELINE_UPDATE === '1';

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

// Each variant: { id, label, overrides, structural checks }
const VARIANTS = [
  {
    id: 'native',
    label: 'picker_set=native',
    overrides: { ...DEFAULTS, picker_set: 'native' },
    checks: (snap, check) => {
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
    checks: (snap, check) => {
      check('no-skintone — picker visible', snap.visible);
      check('no-skintone — skin-tone button absent', !snap.hasSkinToneButton);
      check('no-skintone — preview still present', snap.hasPreview);
    },
  },
  {
    id: 'no-preview',
    label: 'show_preview=false',
    overrides: { ...DEFAULTS, show_preview: false },
    checks: (snap, check) => {
      check('no-preview — picker visible', snap.visible);
      check('no-preview — preview absent', !snap.hasPreview);
      check('no-preview — search still present', snap.hasSearchInput);
    },
  },
  {
    id: 'no-search',
    label: 'show_search=false',
    overrides: { ...DEFAULTS, show_search: false },
    checks: (snap, check) => {
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
    checks: (snap, check) => {
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
    checks: (snap, check) => {
      check('no-recents — picker visible', snap.visible);
      // "Recently Used" tab should be gone; other categories remain.
      const hasRecent = snap.navLabels.some((l) => /recent/i.test(l));
      check('no-recents — Recently Used tab absent', !hasRecent);
      check('no-recents — other categories still present', snap.navCount >= 7);
    },
  },
  {
    id: 'with-custom-emoji',
    label: 'custom emoji present',
    overrides: DEFAULTS,
    // This variant needs a custom emoji in the DB to show the Custom tab.
    // setup/teardown are called by the test loop.
    setup: async (page, baseUrl) => {
      await gotoAdmin(page, baseUrl);
      await addCustomEmoji(page, {
        title: 'Baseline Fixture',
        shortcode: ':flamoji_baseline_fixture:',
        path: 'https://cdn.jsdelivr.net/npm/emoji-datasource-twitter@15.0.1/img/twitter/64/1f600.png',
      });
    },
    teardown: async (page, baseUrl) => {
      await gotoAdmin(page, baseUrl);
      await deleteCustomEmojiByShortcode(page, ':flamoji_baseline_fixture:');
    },
    checks: (snap, check) => {
      check('with-custom-emoji — picker visible', snap.visible);
      const hasCustom = snap.navLabels.some((l) => /custom/i.test(l));
      check('with-custom-emoji — Custom category tab present', hasCustom);
      check('with-custom-emoji — nav has 10+ buttons (9 default + Custom)', snap.navCount >= 10);
    },
  },
];

await runSpec({
  specName: 'picker-variants',
  outputDir: HERE,
}, async ({ page, check, BASE }) => {
  // Ensure clean state
  console.log('\n[setup] cleaning custom emojis');
  await deleteAllCustomEmojis(page, BASE);

  for (const variant of VARIANTS) {
    console.log(`\n[variant: ${variant.id}] applying ${variant.label}`);

    if (variant.setup) await variant.setup(page, BASE);
    await applySettings(page, variant.overrides, BASE);

    await page.goto(BASE, { waitUntil: 'load' });
    await openComposer(page);
    await openPicker(page);

    const snap = await snapshotPicker(page);
    variant.checks(snap, check);

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

    // Pixel baseline
    const pixelFile = resolve(BASELINES, `picker-${variant.id}.png`);
    const bbox = await capturePicker(page);
    if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
      check(`${variant.id} — has bounding box`, false, `bbox=${JSON.stringify(bbox)}`);
    } else {
      check(`${variant.id} — has bounding box`, true);
      const total = bbox.width * bbox.height;
      const maxDiff = Math.ceil(total * 0.01);
      const result = await compareScreenshot(page, {
        baselinePath: pixelFile,
        clip: bbox,
        maxDiffPixels: maxDiff,
        update: UPDATE,
      });
      check(`${variant.id} — pixel match (within 1%)`, result.pass, result.detail);
    }

    // Close picker for next round
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    if (variant.teardown) await variant.teardown(page, BASE);
  }

  // Restore defaults for next spec
  console.log('\n[teardown] restoring defaults');
  await applySettings(page, DEFAULTS, BASE);
});
