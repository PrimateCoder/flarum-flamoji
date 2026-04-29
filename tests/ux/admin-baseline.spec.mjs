// Admin console baseline spec.
//
// Captures structural + pixel baselines for the Flamoji admin settings
// page and custom emoji list so regressions in the admin UI are caught.
//
// Baselines are captured against default settings.
// Set FLAMOJI_BASELINE_UPDATE=1 to accept new baselines.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSpec, compareScreenshot } from '../../.pianotell/tests/ux/helpers.mjs';
import { applySettings, DEFAULTS, gotoAdmin } from './_admin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINES = resolve(HERE, '_baselines');
const UPDATE = process.env.FLAMOJI_BASELINE_UPDATE === '1';

await runSpec({
  specName: 'admin-baseline',
  outputDir: HERE,
}, async ({ page, check, BASE }) => {
  // Ensure defaults
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
  const settingsBox = await page.evaluate(() => {
    const el = document.querySelector('.Flamoji--settingsContainer');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });
  check('settings panel has bounding box', !!settingsBox && settingsBox.width > 0);
  if (settingsBox && settingsBox.width > 0) {
    const total = settingsBox.width * settingsBox.height;
    const maxDiff = Math.ceil(total * 0.015); // admin pages have more text reflow variance
    const result = await compareScreenshot(page, {
      baselinePath: resolve(BASELINES, 'admin-settings.png'),
      clip: settingsBox,
      maxDiffPixels: maxDiff,
      update: UPDATE,
    });
    check('admin-settings — pixel match (within 1.5%)', result.pass, result.detail);
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
    const total = emojiBox.width * emojiBox.height;
    const maxDiff = Math.ceil(total * 0.015);
    const result = await compareScreenshot(page, {
      baselinePath: resolve(BASELINES, 'admin-custom-emojis.png'),
      clip: emojiBox,
      maxDiffPixels: maxDiff,
      update: UPDATE,
    });
    check('admin-custom-emojis — pixel match (within 1.5%)', result.pass, result.detail);
  }
});
