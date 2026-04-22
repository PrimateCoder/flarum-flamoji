// Admin-options UX matrix test, end-to-end through the admin panel.
//
// Spec:    tests/ux/admin-options.md (read first; this file asserts that)
// Runtime: node tests/ux/admin-options.spec.mjs
//
// What this proves
// ----------------
// Drives every admin-visible setting (switches, picker style select,
// frequent-rows number input, specify-categories checkboxes) via the
// real Flarum admin panel — clicking the actual controls and pressing
// Save Changes — then loads the forum and asserts the picker reacts the
// way the admin UI promises it will. No `app.forum.data.attributes`
// mutation, no API shortcuts: a regression in the admin panel itself
// will fail the test.
//
// Strategy
// --------
// Each scenario:
//   1. applySettings(page, overrides)  — drive admin UI + Save
//   2. page.goto(BASE)                  — wipe in-memory picker state
//   3. open composer + picker
//   4. snapshot Shadow DOM, assert
// After all scenarios run, restoreDefaults() puts the test forum back
// in its all-on baseline so subsequent runs (or a human admin) start
// from a clean slate.
//
// Cost: ~5 s/scenario (admin SPA navigation + Save round-trip + forum
// reload). 12 scenarios × ~5 s ≈ 1 min. The trade-off is "real" admin
// coverage vs. raw test speed, and per project convention this kind of
// test should always go through Playwright.
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
import { applySettings, restoreDefaults, DEFAULTS } from './_admin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PIANOTELL_FLARUM_UX_BASE_URL;
const COOKIE = process.env.PIANOTELL_FLARUM_UX_COOKIE;
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
  // Some scenarios disable the search input; fall back to nav or first
  // category-tile as our "picker is alive" signal.
  await page.waitForFunction(
    () => {
      const sr = document.querySelector('em-emoji-picker.flamoji-picker-popup')?.shadowRoot;
      if (!sr) return false;
      return (
        sr.querySelector('input[type="search"]') ||
        sr.querySelector('nav button[aria-label]') ||
        sr.querySelector('.category button')
      );
    },
    { timeout: 15_000 }
  );
  await page.waitForTimeout(300);
}

// One-call structured snapshot of every assertable feature.
async function snapshot(page) {
  return await page.evaluate(() => {
    const picker = document.querySelector('em-emoji-picker.flamoji-picker-popup');
    if (!picker) return { error: 'no picker' };
    const sr = picker.shadowRoot;
    const navButtons = [...sr.querySelectorAll('nav button[aria-label]')]
      .map((b) => b.getAttribute('aria-label'));
    const previewEl = sr.querySelector('.preview-placeholder, [class*="preview"]');
    // Identify the rendering set from the inner emoji span. Twitter
    // tiles have data-emoji-set="twitter" + a CSS background-image
    // pointing at the Twemoji sprite sheet; native tiles render the
    // raw glyph as text with data-emoji-set="native".
    const sampleSpan = sr.querySelector('.category .emoji-mart-emoji');
    const sampleSpanHTML = sampleSpan?.outerHTML || '';
    return {
      visible: picker.style.display !== 'none',
      hasSearchInput: !!sr.querySelector('input[type="search"]'),
      navCount: navButtons.length,
      navLabels: navButtons,
      hasPreview: !!previewEl,
      hasSkinToneButton: !!sr.querySelector('.skin-tone-button'),
      tileEmojiSet: sampleSpan?.getAttribute('data-emoji-set') || null,
      // Twemoji rendering: inner <span> carries `background-image:
      // url(.../emoji-datasource-twitter/...)`. Native rendering: inner
      // span has no background-image and the glyph is a literal Unicode
      // character (with a `font-family` fallback that *also* contains the
      // word "Twemoji" — don't match against font-family by mistake).
      tileUsesTwemojiSprite:
        /background-image\s*:\s*url\([^)]*(emoji-datasource-twitter|twemoji)/i.test(sampleSpanHTML),
    };
  });
}

// Click the first selectable emoji tile and return whether the
// composer textarea grew.
async function pickFirstEmoji(page) {
  const before = await page.evaluate(
    () => document.querySelector('.ComposerBody textarea')?.value?.length ?? 0
  );
  const ok = await page.evaluate(() => {
    const sr = document.querySelector('em-emoji-picker.flamoji-picker-popup').shadowRoot;
    const tile = [...sr.querySelectorAll('.category button')].find(
      (b) => !b.hasAttribute('aria-selected')
    );
    if (!tile) return false;
    tile.click();
    return true;
  });
  await page.waitForTimeout(200);
  const after = await page.evaluate(
    () => document.querySelector('.ComposerBody textarea')?.value?.length ?? 0
  );
  return { ok, delta: after - before };
}

async function isPickerVisible(page) {
  return await page.evaluate(() => {
    const p = document.querySelector('em-emoji-picker.flamoji-picker-popup');
    return !!p && p.style.display !== 'none';
  });
}

// Drive the admin UI to apply `overrides`, then load the forum and open
// composer + picker. `overrides` keys mirror DEFAULTS in _admin.mjs.
async function bootScenario(page, overrides) {
  await applySettings(page, overrides, BASE);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await openComposer(page);
  await openPicker(page);
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

    // Establish the all-on baseline before running scenarios — picks up
    // any DB drift from earlier admin sessions.
    console.log('\n[setup] restoring all-on defaults via admin UI');
    await restoreDefaults(page, BASE);

    // --- 1. show_search ON / OFF ---
    console.log('\n[scenario] show_search=true (baseline ON)');
    await bootScenario(page, { show_search: true });
    let s = await snapshot(page);
    check('show_search=true → search input present', s.hasSearchInput);

    console.log('\n[scenario] show_search=false');
    await bootScenario(page, { show_search: false });
    s = await snapshot(page);
    check('show_search=false → search input absent', !s.hasSearchInput);

    // --- 2. show_category_buttons ON / OFF ---
    console.log('\n[scenario] show_category_buttons=true');
    await bootScenario(page, { show_search: true, show_category_buttons: true });
    s = await snapshot(page);
    check('show_category_buttons=true → nav has buttons', s.navCount > 0,
          `navCount=${s.navCount}`);

    console.log('\n[scenario] show_category_buttons=false');
    await bootScenario(page, { show_category_buttons: false });
    s = await snapshot(page);
    check('show_category_buttons=false → no category nav buttons', s.navCount === 0,
          `navCount=${s.navCount} labels=${JSON.stringify(s.navLabels)}`);

    // --- 3. show_preview ON / OFF ---
    // NOTE: emoji-mart renders the skin-tone selector inside the preview row.
    // With show_preview=false AND show_variants=true, there is no preview
    // pane to host the skin-tone widget — emoji-mart drops the skin-tone
    // widget too. To get a clean signal on `show_preview` alone, hold
    // `show_variants` off here.
    console.log('\n[scenario] show_preview=true, show_variants=false');
    await bootScenario(page, {
      show_category_buttons: true, show_preview: true, show_variants: false,
    });
    s = await snapshot(page);
    check('show_preview=true → preview placeholder rendered', s.hasPreview);

    console.log('\n[scenario] show_preview=false, show_variants=false');
    await bootScenario(page, { show_preview: false, show_variants: false });
    s = await snapshot(page);
    check('show_preview=false → preview placeholder absent', !s.hasPreview);

    // --- 4. show_variants ON / OFF (preview held ON to host the widget) ---
    console.log('\n[scenario] show_variants=true, show_preview=true');
    await bootScenario(page, { show_variants: true, show_preview: true });
    s = await snapshot(page);
    check('show_variants=true → skin-tone selector present', s.hasSkinToneButton);

    console.log('\n[scenario] show_variants=false, show_preview=true');
    await bootScenario(page, { show_variants: false, show_preview: true });
    s = await snapshot(page);
    check('show_variants=false → skin-tone selector absent', !s.hasSkinToneButton);

    // --- 5. auto_hide ON / OFF (verified via picker visibility post-pick) ---
    console.log('\n[scenario] auto_hide=true');
    await bootScenario(page, { auto_hide: true });
    let pick = await pickFirstEmoji(page);
    check('auto_hide=true → tile click registered', pick.ok && pick.delta > 0,
          JSON.stringify(pick));
    check('auto_hide=true → picker hidden after pick', !(await isPickerVisible(page)));

    console.log('\n[scenario] auto_hide=false');
    await bootScenario(page, { auto_hide: false });
    pick = await pickFirstEmoji(page);
    check('auto_hide=false → tile click registered', pick.ok && pick.delta > 0,
          JSON.stringify(pick));
    check('auto_hide=false → picker still visible after pick',
          await isPickerVisible(page));

    // --- 6. picker_set: twemoji vs native ---
    console.log('\n[scenario] picker_set=twemoji');
    await bootScenario(page, { picker_set: 'twemoji' });
    s = await snapshot(page);
    check('picker_set=twemoji → tile renders Twemoji sprite',
          s.tileEmojiSet === 'twitter' && s.tileUsesTwemojiSprite,
          `set="${s.tileEmojiSet}" twemojiSprite=${s.tileUsesTwemojiSprite}`);

    console.log('\n[scenario] picker_set=native');
    await bootScenario(page, { picker_set: 'native' });
    s = await snapshot(page);
    check('picker_set=native → tile renders native (no Twemoji sprite)',
          s.tileEmojiSet === 'native' && !s.tileUsesTwemojiSprite,
          `set="${s.tileEmojiSet}" twemojiSprite=${s.tileUsesTwemojiSprite}`);

    // --- 7. picker_set=auto resolution depends on flarum/emoji presence ---
    // The serializer attribute `flamoji.has_emoji_extension` is the
    // ground truth on this forum; auto must agree with it.
    console.log('\n[scenario] picker_set=auto');
    await bootScenario(page, { picker_set: 'auto' });
    const hasEmojiExt = await page.evaluate(
      () => !!window.app.forum.attribute('flamoji.has_emoji_extension')
    );
    s = await snapshot(page);
    const expectedAutoSet = hasEmojiExt ? 'twitter' : 'native';
    check(
      `picker_set=auto → resolves to "${expectedAutoSet}" given has_emoji_extension=${hasEmojiExt}`,
      s.tileEmojiSet === expectedAutoSet,
      `actual="${s.tileEmojiSet}"`
    );

    // --- 8. specify_categories narrows the nav ---
    console.log('\n[scenario] specify_categories=["people"] only');
    await bootScenario(page, { specify_categories: ['people'] });
    s = await snapshot(page);
    // Allow at most 3 nav buttons:
    //   - the requested category
    //   - Recently Used (show_recents defaults to true; this regression-
    //     guards the fix that prepends 'frequent' to the allow-list, see
    //     buildPicker in js/src/forum/index.js — without that, emoji-mart
    //     silently drops the Recently Used tab)
    //   - Custom (a custom emoji exists on this forum, see :pianotell:)
    check(
      'specify_categories=["people"] → nav has at most 3 buttons',
      s.navCount >= 1 && s.navCount <= 3,
      `navCount=${s.navCount} labels=${JSON.stringify(s.navLabels)}`
    );
    check(
      'specify_categories=["people"] → only Smileys/People (and maybe Recently/Custom) remain',
      s.navLabels.some((l) => /smileys|people/i.test(l)) &&
        !s.navLabels.some((l) => /flag/i.test(l)),
      `labels=${JSON.stringify(s.navLabels)}`
    );
    check(
      'show_recents (default) + narrow specify_categories → Recently Used tab present',
      s.navLabels.some((l) => /recent|frequent/i.test(l)),
      `labels=${JSON.stringify(s.navLabels)}`
    );

    // --- 9. COMBINATION: everything off → bare grid only ---
    console.log('\n[scenario] all chrome OFF');
    await bootScenario(page, {
      specify_categories: DEFAULTS.specify_categories,
      show_search: false,
      show_category_buttons: false,
      show_preview: false,
      show_variants: false,
    });
    s = await snapshot(page);
    check('all-off → no search input', !s.hasSearchInput);
    check('all-off → no category nav', s.navCount === 0,
          `navCount=${s.navCount}`);
    check('all-off → no preview pane', !s.hasPreview);
    check('all-off → no skin-tone selector', !s.hasSkinToneButton);

    // --- 10. COMBINATION: search-only ---
    console.log('\n[scenario] search-only (only show_search=true)');
    await bootScenario(page, {
      show_search: true,
      show_category_buttons: false,
      show_preview: false,
      show_variants: false,
    });
    s = await snapshot(page);
    check('search-only → search input present', s.hasSearchInput);
    check('search-only → no category nav', s.navCount === 0,
          `navCount=${s.navCount}`);
    check('search-only → no preview pane', !s.hasPreview);
    check('search-only → no skin-tone selector', !s.hasSkinToneButton);

    // --- TEARDOWN: put the forum back to all-on baseline ---
    console.log('\n[teardown] restoring all-on defaults via admin UI');
    await restoreDefaults(page, BASE);

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
  console.log('\nAll admin-options checks passed.');
})();
