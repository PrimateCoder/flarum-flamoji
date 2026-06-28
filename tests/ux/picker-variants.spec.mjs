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
    const firstTileBtn = sr.querySelector('.category button[aria-label]:not([aria-selected])')
      || sr.querySelector('.category button');
    const tileSize = firstTileBtn ? Math.round(firstTileBtn.getBoundingClientRect().width) : 0;
    return {
      visible: picker.style.display !== 'none',
      hasSearchInput: !!sr.querySelector('input[type="search"]'),
      hasPreview: !!sr.querySelector('.preview-placeholder, [class*="preview"]'),
      hasSkinToneButton: !!sr.querySelector('.skin-tone-button'),
      navLabels,
      navCount: navLabels.length,
      tileSize,
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
      check('with-custom-emoji — nav has 9+ buttons (8 default + Custom)', snap.navCount >= 9);
    },
  },
  {
    id: 'with-custom-categories',
    label: 'custom emoji grouped into named categories',
    overrides: DEFAULTS,
    // Seeds custom emoji across two named categories plus one
    // uncategorized, so the picker nav renders dedicated image-icon tabs
    // for "Memes" and "Reactions" (alphabetical) followed by the default
    // "Custom" tab last. Multiple emoji per named category so the captured
    // screenshot shows a populated custom grid (not just nav icons).
    // Pinned CDN images keep the pixel baseline stable.
    setup: async (page, baseUrl) => {
      const cdn = 'https://cdn.jsdelivr.net/npm/emoji-datasource-twitter@15.0.1/img/twitter/64';
      await gotoAdmin(page, baseUrl);
      await addCustomEmoji(page, { title: 'Party', shortcode: ':flamoji_var_party:', category: 'Memes', path: `${cdn}/1f389.png` });
      await addCustomEmoji(page, { title: 'Fire', shortcode: ':flamoji_var_fire:', category: 'Memes', path: `${cdn}/1f525.png` });
      await addCustomEmoji(page, { title: 'Hundred', shortcode: ':flamoji_var_100:', category: 'Memes', path: `${cdn}/1f4af.png` });
      await addCustomEmoji(page, { title: 'Thumbs Up', shortcode: ':flamoji_var_thumb:', category: 'Reactions', path: `${cdn}/1f44d.png` });
      await addCustomEmoji(page, { title: 'Heart', shortcode: ':flamoji_var_heart:', category: 'Reactions', path: `${cdn}/2764-fe0f.png` });
      await addCustomEmoji(page, { title: 'Star', shortcode: ':flamoji_var_star:', path: `${cdn}/2b50.png` });
    },
    teardown: async (page, baseUrl) => {
      await gotoAdmin(page, baseUrl);
      for (const sc of [
        ':flamoji_var_party:', ':flamoji_var_fire:', ':flamoji_var_100:',
        ':flamoji_var_thumb:', ':flamoji_var_heart:', ':flamoji_var_star:',
      ]) {
        await deleteCustomEmojiByShortcode(page, sc);
      }
    },
    // Before the pixel capture, click the "Memes" nav tab so the picker
    // scrolls its custom emoji tiles into view — the baseline then proves
    // custom emoji actually render in the grid, not just as nav icons.
    beforeCapture: async (page) => {
      await page.evaluate(() => {
        const sr = document.querySelector('em-emoji-picker.flamoji-picker-popup')?.shadowRoot;
        const memes = [...(sr?.querySelectorAll('nav button[aria-label]') || [])]
          .find((b) => b.getAttribute('aria-label') === 'Memes');
        memes?.click();
      });
      await page.waitForTimeout(600);
    },
    checks: (snap, check) => {
      check('with-custom-categories — picker visible', snap.visible);
      check('with-custom-categories — "Memes" tab present', snap.navLabels.includes('Memes'),
        `nav=${JSON.stringify(snap.navLabels)}`);
      check('with-custom-categories — "Reactions" tab present', snap.navLabels.includes('Reactions'),
        `nav=${JSON.stringify(snap.navLabels)}`);
      check('with-custom-categories — default "Custom" tab present', snap.navLabels.some((l) => /custom/i.test(l)),
        `nav=${JSON.stringify(snap.navLabels)}`);
      check('with-custom-categories — named tabs precede Custom (alphabetical, Custom last)',
        snap.navLabels.indexOf('Memes') < snap.navLabels.indexOf('Reactions') &&
          snap.navLabels.indexOf('Reactions') < snap.navLabels.findIndex((l) => /custom/i.test(l)),
        `nav=${JSON.stringify(snap.navLabels)}`);
      check('with-custom-categories — nav has 11+ buttons (8 default + 2 named + Custom)', snap.navCount >= 11,
        `navCount=${snap.navCount}`);
    },
  },
  {
    id: 'sticker-mode',
    label: 'sticker_mode=true (enlarged, custom-only grid)',
    overrides: { ...DEFAULTS, sticker_mode: true },
    // Seed several custom emoji so sticker mode has a populated custom grid
    // to show (the picker is restricted to custom categories in this mode).
    // 4+ emoji also satisfies openPicker's ">3 tiles" readiness wait.
    setup: async (page, baseUrl) => {
      const cdn = 'https://cdn.jsdelivr.net/npm/emoji-datasource-twitter@15.0.1/img/twitter/64';
      await gotoAdmin(page, baseUrl);
      await addCustomEmoji(page, { title: 'Party', shortcode: ':flamoji_stk_party:', category: 'Memes', path: `${cdn}/1f389.png` });
      await addCustomEmoji(page, { title: 'Fire', shortcode: ':flamoji_stk_fire:', category: 'Memes', path: `${cdn}/1f525.png` });
      await addCustomEmoji(page, { title: 'Hundred', shortcode: ':flamoji_stk_100:', category: 'Memes', path: `${cdn}/1f4af.png` });
      await addCustomEmoji(page, { title: 'Star', shortcode: ':flamoji_stk_star:', category: 'Memes', path: `${cdn}/2b50.png` });
      await addCustomEmoji(page, { title: 'Rocket', shortcode: ':flamoji_stk_rocket:', category: 'Memes', path: `${cdn}/1f680.png` });
    },
    teardown: async (page, baseUrl) => {
      await gotoAdmin(page, baseUrl);
      for (const sc of [
        ':flamoji_stk_party:', ':flamoji_stk_fire:', ':flamoji_stk_100:',
        ':flamoji_stk_star:', ':flamoji_stk_rocket:',
      ]) {
        await deleteCustomEmojiByShortcode(page, sc);
      }
    },
    checks: (snap, check) => {
      check('sticker-mode — picker visible', snap.visible);
      // Default tiles are ~36px; sticker mode uses an 80px tile.
      check('sticker-mode — grid tiles enlarged (>= 70px)', snap.tileSize >= 70,
        `tileSize=${snap.tileSize}`);
      // Custom-only: no built-in unicode category (e.g. "Smileys & People",
      // "Flags") and no "Frequently Used" — just the custom tabs.
      const BUILTINS = /smileys|people|animals & nature|food|activities|travel|objects|symbols|flags|frequent/i;
      check('sticker-mode — picker restricted to custom categories',
        snap.navLabels.length > 0 && !snap.navLabels.some((l) => BUILTINS.test(l)),
        `nav=${JSON.stringify(snap.navLabels)}`);
      // Custom emoji have no skin-tone variants, so the skin-tone selector is
      // suppressed in sticker mode even though show_variants is on (default).
      check('sticker-mode — no skin-tone selector (custom emoji have no variants)',
        !snap.hasSkinToneButton);
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
    // Optional pre-capture interaction (e.g. scroll a custom category into
    // view) so the screenshot shows more than the default Frequent tab.
    if (variant.beforeCapture) await variant.beforeCapture(page);
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
