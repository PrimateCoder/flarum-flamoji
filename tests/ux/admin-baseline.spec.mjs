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
import { applySettings, DEFAULTS, gotoAdmin, deleteAllCustomEmojis, addCustomEmoji } from './_admin.mjs';

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

  // Reset the custom-emoji list to exactly one deterministic fixture so
  // both the structural `customEmojiCount` and the custom-emoji-section
  // pixel baseline are reproducible regardless of ambient DB state (other
  // specs in the suite add/remove custom emoji). Uses a pinned CDN image
  // so it renders identically in CI.
  console.log('[setup] resetting custom emoji to a single fixture');
  await gotoAdmin(page, BASE);
  await deleteAllCustomEmojis(page, BASE);
  await gotoAdmin(page, BASE);
  await addCustomEmoji(page, {
    title: 'Baseline Fixture',
    shortcode: ':flamoji_admin_fixture:',
    path: 'https://cdn.jsdelivr.net/npm/emoji-datasource-twitter@15.0.1/img/twitter/64/1f600.png',
  });
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
  // Scroll to top so the settings container is fully visible below the
  // fixed admin header.
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

  // ---- Grouped-list baselines ----
  // Seeds a realistic multi-category state (2 named categories +
  // uncategorized) and captures:
  //   1. the grouped list (headers, order, per-category export/edit
  //      icons),
  //   2. one group in inline-rename edit mode (input + Save/Cancel),
  //   3. the Import JSON modal in its default state,
  //   4. the same modal with override mode armed (red warning + confirm
  //      checkbox) — the destructive-wipe confirmation surface.
  // Each capture also has a structural snapshot so layout changes that
  // pixel drift tolerates are still caught.
  console.log('\n[grouped] seeding multi-category list');
  await gotoAdmin(page, BASE);
  await deleteAllCustomEmojis(page, BASE);
  await gotoAdmin(page, BASE);
  const CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-twitter@15.0.1/img/twitter/64';
  await addCustomEmoji(page, { title: 'Party', shortcode: ':flamoji_ab_party:', category: 'Memes', path: `${CDN}/1f389.png` });
  await addCustomEmoji(page, { title: 'Fire', shortcode: ':flamoji_ab_fire:', category: 'Memes', path: `${CDN}/1f525.png` });
  await addCustomEmoji(page, { title: 'Thumbs Up', shortcode: ':flamoji_ab_thumb:', category: 'Reactions', path: `${CDN}/1f44d.png` });
  await addCustomEmoji(page, { title: 'Heart', shortcode: ':flamoji_ab_heart:', category: 'Reactions', path: `${CDN}/2764-fe0f.png` });
  await addCustomEmoji(page, { title: 'Loose', shortcode: ':flamoji_ab_loose:', path: `${CDN}/2b50.png` });
  await gotoAdmin(page, BASE);
  await page.waitForSelector('.customEmoji-categoryGroup', { timeout: 10_000 });
  await page.waitForTimeout(800);

  // Structural: group labels + counts (label/count pairs — a plain
  // object keyed by arbitrary category names would lose a group
  // literally named "__proto__" to the prototype setter).
  const grouped = await page.evaluate(() =>
    [...document.querySelectorAll('.customEmoji-categoryGroup')].map((group) => [
      (group.querySelector('h3')?.textContent || '').trim(),
      group.querySelectorAll('li .customEmoji:not(.addEmoji)').length,
    ])
  );
  const groupedStruct = { groups: grouped };
  check('grouped — three groups render (alphabetical)', grouped.length === 3,
    `groups=${JSON.stringify(grouped)}`);
  const groupedLabels = grouped.map(([label]) => label);
  const sortedCopy = [...groupedLabels].sort((a, b) => a.localeCompare(b));
  check('grouped — groups in alphabetical order',
    JSON.stringify(groupedLabels) === JSON.stringify(sortedCopy),
    `labels=${JSON.stringify(groupedLabels)}`);
  check('grouped — expected membership counts',
    JSON.stringify(grouped) === JSON.stringify([['Memes', 2], ['Reactions', 2], ['Uncategorized', 1]]),
    `groups=${JSON.stringify(grouped)}`);

  const groupedFile = resolve(BASELINES, 'admin-grouped-list.json');
  if (UPDATE || !existsSync(groupedFile)) {
    mkdirSync(BASELINES, { recursive: true });
    writeFileSync(groupedFile, JSON.stringify(groupedStruct, null, 2) + '\n');
    console.log(`  → structural baseline written: ${groupedFile}`);
  } else {
    const expected = JSON.parse(readFileSync(groupedFile, 'utf-8'));
    const diffs = Object.keys(expected)
      .filter((k) => JSON.stringify(expected[k]) !== JSON.stringify(groupedStruct[k]));
    check('grouped — structural baseline matches', diffs.length === 0,
      diffs.length ? `keys differ: ${diffs.join(', ')}` : '');
  }

  await page.evaluate(() => {
    document.querySelector('.ExtensionPage-customFlamoji')?.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(500);
  const groupedListBox = await page.evaluate(() => {
    const el = document.querySelector('.ExtensionPage-customFlamoji');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });
  if (groupedListBox && groupedListBox.width > 0) {
    const total = groupedListBox.width * groupedListBox.height;
    const result = await compareScreenshot(page, {
      baselinePath: resolve(BASELINES, 'admin-grouped-list.png'),
      clip: groupedListBox,
      maxDiffPixels: Math.ceil(total * 0.015),
      update: UPDATE,
    });
    check('admin-grouped-list — pixel match (within 1.5%)', result.pass, result.detail);
  }

  // ---- Inline rename edit mode ----
  console.log('\n[rename] capturing a group in inline-rename edit mode');
  const editOpened = await page.evaluate(() => {
    const group = [...document.querySelectorAll('.customEmoji-categoryGroup')].find(
      (g) => (g.querySelector('h3')?.textContent || '').trim() === 'Memes'
    );
    if (!group) return false;
    group.querySelector('.customEmoji-categoryEditButton')?.click();
    return true;
  });
  check('rename — edit mode entered', editOpened);
  await page.waitForSelector('.customEmoji-categoryGroup h3 form input.FormControl', {
    timeout: 10_000,
  });
  await page.waitForTimeout(300);

  const form = await page.evaluate(() => {
    const formEl = document.querySelector('.customEmoji-categoryGroup h3 form');
    if (!formEl) return null;
    const input = formEl.querySelector('input.FormControl');
    const buttons = [...formEl.querySelectorAll('button')].map((b) => (b.textContent || '').trim());
    return {
      inputValue: input?.value ?? null,
      maxLength: input?.getAttribute('maxlength'),
      buttons,
    };
  });
  check('rename — input prefilled with the current category', form?.inputValue === 'Memes',
    `value=${JSON.stringify(form?.inputValue)}`);
  check('rename — input clamps to 255 (maxlength attr)', form?.maxLength === '255',
    `maxlength=${JSON.stringify(form?.maxLength)}`);
  check('rename — buttons are translated, not raw keys',
    (form?.buttons ?? []).includes('Save') && (form?.buttons ?? []).includes('Cancel')
    && !(form?.buttons ?? []).some((b) => b.includes('pianotell-flamoji.admin')),
    `buttons=${JSON.stringify(form?.buttons)}`);

  const editGroupBox = await page.evaluate(() => {
    const formEl = document.querySelector('.customEmoji-categoryGroup h3 form');
    const group = formEl?.closest('.customEmoji-categoryGroup');
    if (!group) return null;
    const r = group.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });
  if (editGroupBox && editGroupBox.width > 0) {
    const result = await compareScreenshot(page, {
      baselinePath: resolve(BASELINES, 'admin-rename-form.png'),
      clip: editGroupBox,
      maxDiffPixels: 200,
      update: UPDATE,
    });
    check('admin-rename-form — pixel match', result.pass, result.detail);
  }

  // Leave edit mode.
  await page.click('.customEmoji-categoryGroup h3 form button:not(.Button--primary)').catch(() => {});

  // ---- Import JSON modal: default + override-armed ----
  console.log('\n[import modal] capturing default and override-armed states');
  const importBtn = page.locator('.ExtensionPage-headerTopItems button', { hasText: 'Import JSON' });
  await importBtn.waitFor({ timeout: 10_000 });
  await importBtn.click();
  await page.waitForSelector('.Flamoji-ImportEmojisModal', { timeout: 10_000 });
  await page.waitForTimeout(500);

  const modalDefault = await page.evaluate(() => {
    const modal = document.querySelector('.Flamoji-ImportEmojisModal');
    if (!modal) return null;
    const textarea = modal.querySelector('textarea.FormControl');
    const submit = [...modal.querySelectorAll('button.Button--primary')].find((b) => /import/i.test(b.textContent || ''));
    return {
      hasTextarea: !!textarea,
      hasUploadButton: !!modal.querySelector('#import-json-file'),
      submitDisabled: submit ? submit.disabled : null,
    };
  });
  check('import modal — textarea present', !!modalDefault?.hasTextarea);
  check('import modal — file upload input present', !!modalDefault?.hasUploadButton);
  check('import modal — submit disabled while payload empty', modalDefault?.submitDisabled === true,
    `submitDisabled=${JSON.stringify(modalDefault?.submitDisabled)}`);

  const modalBox = await page.evaluate(() => {
    const el = document.querySelector('.Flamoji-ImportEmojisModal');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });
  if (modalBox && modalBox.width > 0) {
    const result = await compareScreenshot(page, {
      baselinePath: resolve(BASELINES, 'admin-import-modal.png'),
      clip: modalBox,
      maxDiffPixels: 200,
      update: UPDATE,
    });
    check('admin-import-modal — pixel match', result.pass, result.detail);
  }

  // Arm override mode: switch on → red warning alert + confirm checkbox.
  await page.click('.Flamoji-ImportEmojisModal label.Checkbox--switch');
  await page.waitForTimeout(300);
  const overrideState = await page.evaluate(() => {
    const modal = document.querySelector('.Flamoji-ImportEmojisModal');
    if (!modal) return null;
    const warning = [...modal.querySelectorAll('.Alert')].find((a) =>
      /delete all your current custom emojis/i.test(a.textContent || '')
    );
    const checkbox = modal.querySelector('label.checkbox input[type="checkbox"]');
    const submit = [...modal.querySelectorAll('button.Button--primary')].find((b) => /import/i.test(b.textContent || ''));
    return {
      warningAlertVisible: !!warning && warning.offsetParent !== null,
      confirmCheckboxVisible: !!checkbox && checkbox.offsetParent !== null,
      submitDisabled: submit ? submit.disabled : null,
    };
  });
  check('import override — warning alert rendered', !!overrideState?.warningAlertVisible);
  check('import override — confirm checkbox rendered', !!overrideState?.confirmCheckboxVisible);
  check('import override — submit stays disabled until confirmed', overrideState?.submitDisabled === true,
    `submitDisabled=${JSON.stringify(overrideState?.submitDisabled)}`);

  const overrideBox = await page.evaluate(() => {
    const el = document.querySelector('.Flamoji-ImportEmojisModal');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });
  if (overrideBox && overrideBox.width > 0) {
    const result = await compareScreenshot(page, {
      baselinePath: resolve(BASELINES, 'admin-import-override.png'),
      clip: overrideBox,
      maxDiffPixels: 200,
      update: UPDATE,
    });
    check('admin-import-override — pixel match', result.pass, result.detail);
  }

  // Close the modal without importing.
  await page.evaluate(() => {
    document.querySelector('.Flamoji-ImportEmojisModal .Modal-close .Button')?.click();
  });
  await page.waitForFunction(() => !document.querySelector('.Flamoji-ImportEmojisModal'), null, {
    timeout: 5_000,
  }).catch(() => {});
});
