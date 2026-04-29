// Picker-features UX test.
//
// Spec:    tests/ux/picker-features.md  (read first; this file asserts that)
// Runtime: node tests/ux/picker-features.spec.mjs
//
// Exercises the user-visible behavior of the emoji picker when *every*
// admin-visible toggle is on — the realistic "give the user everything"
// preset. We assert what an end-user can actually see and do, not what
// our source code says it does. emoji-mart renders inside Shadow DOM, so
// every selector below pierces `picker.shadowRoot`.
//
// Failure mode: writes tests/ux/_failure.png and exits non-zero.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSpec, openComposer } from '../../.pianotell/tests/ux/helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

async function openPicker(page) {
  await page.waitForSelector('button.Button-flamoji, button[title*="moji" i]', {
    timeout: 10_000,
  });
  await page.click('button.Button-flamoji, button[title*="moji" i]');
  await page.waitForSelector('em-emoji-picker.flamoji-picker-popup', { timeout: 15_000 });
  // Wait for the Shadow DOM to populate (the search input is one of the
  // last things to render once data finishes loading).
  await page.waitForFunction(
    () => {
      const p = document.querySelector('em-emoji-picker.flamoji-picker-popup');
      return p?.shadowRoot?.querySelector('input[type="search"]') != null;
    },
    { timeout: 15_000 }
  );
  // Final settle: positionPicker / sticky category measurement.
  await page.waitForTimeout(300);
}

// Pull a structured snapshot of every assertable feature out of the
// picker's Shadow DOM in one round-trip.
async function snapshotFeatures(page) {
  return await page.evaluate(() => {
    const picker = document.querySelector('em-emoji-picker.flamoji-picker-popup');
    if (!picker) return { error: 'no picker' };
    const sr = picker.shadowRoot;
    const navButtons = [...sr.querySelectorAll('nav button[aria-label]')]
      .map((b) => b.getAttribute('aria-label'));
    const previewEl = sr.querySelector('.preview-placeholder, [class*="preview"]');
    const previewText = previewEl?.textContent?.trim() || null;
    return {
      visible: picker.style.display !== 'none',
      hasSearchInput: !!sr.querySelector('input[type="search"]'),
      navCount: navButtons.length,
      navLabels: navButtons,
      hasPreview: !!previewEl,
      previewText,
      hasSkinToneButton: !!sr.querySelector('.skin-tone-button'),
      // Categories rendered in the scrollable area; sticky labels carry
      // the category name in their text content.
      categoryHeadings: [...sr.querySelectorAll('.category .sticky')]
        .map((h) => h.textContent?.trim())
        .filter(Boolean),
      // First emoji-tile button, used for click-to-insert.
      firstTileSelector:
        sr.querySelector('.category button[aria-label]:not([aria-selected])')
          ? true
          : false,
    };
  });
}

// Click the first selectable emoji tile inside the picker's Shadow DOM
// and return the (native) text it carried.
async function pickFirstEmoji(page) {
  return await page.evaluate(() => {
    const picker = document.querySelector('em-emoji-picker.flamoji-picker-popup');
    const sr = picker.shadowRoot;
    // Tiles are inside .category; nav buttons live in <nav>. Filter
    // nav-tab buttons (aria-selected attribute present) out.
    const tile = [...sr.querySelectorAll('.category button')].find(
      (b) => !b.hasAttribute('aria-selected')
    );
    if (!tile) return { ok: false, reason: 'no tile found' };
    const label = tile.getAttribute('aria-label') || '';
    tile.click();
    return { ok: true, label };
  });
}

// Read the composer's textarea contents (Flarum's TextEditor uses a
// <textarea class="FormControl"> inside .ComposerBody-content).
async function composerText(page) {
  return await page.evaluate(() => {
    const ta = document.querySelector('.ComposerBody textarea');
    return ta ? ta.value : null;
  });
}

async function setSearch(page, term) {
  await page.evaluate((q) => {
    const picker = document.querySelector('em-emoji-picker.flamoji-picker-popup');
    const input = picker.shadowRoot.querySelector('input[type="search"]');
    input.focus();
    // emoji-mart wires both `input` and `keyup`; setting .value alone
    // doesn't trigger its observer. Use the native setter + an input
    // event so its React-style listener picks it up.
    const proto = Object.getPrototypeOf(input);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(input, q);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, term);
  // emoji-mart debounces search ~150ms.
  await page.waitForTimeout(400);
}

async function searchResultLabels(page) {
  return await page.evaluate(() => {
    const picker = document.querySelector('em-emoji-picker.flamoji-picker-popup');
    const sr = picker.shadowRoot;
    return [...sr.querySelectorAll('.category button[aria-label]:not([aria-selected])')]
      .slice(0, 20)
      .map((b) => b.getAttribute('aria-label'));
  });
}

await runSpec({
  specName: 'picker-features',
  outputDir: HERE,
}, async ({ page, check, BASE }) => {
  await page.context().setExtraHTTPHeaders({ 'cache-control': 'no-cache' });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await openComposer(page);
  await openPicker(page);

  // === 1. STRUCTURE — every "all on" toggle produces its UI region ===
  const snap = await snapshotFeatures(page);
  console.log('[features] picker snapshot:');
  console.log(`  navCount=${snap.navCount}`);
  console.log(`  navLabels=${JSON.stringify(snap.navLabels)}`);
  console.log(`  previewText="${snap.previewText}"`);

  check(
    'show_search → search input visible',
    snap.hasSearchInput,
    `hasSearchInput=${snap.hasSearchInput}`
  );

  check(
    'show_category_buttons → category nav rendered with 7+ buttons',
    snap.navCount >= 7,
    `got ${snap.navCount}: ${JSON.stringify(snap.navLabels)}`
  );

  check(
    'show_preview → preview placeholder rendered with hint text',
    snap.hasPreview && /pick an emoji/i.test(snap.previewText || ''),
    `hasPreview=${snap.hasPreview} text="${snap.previewText}"`
  );

  check(
    'show_variants → skin-tone selector rendered (lives in preview row)',
    snap.hasSkinToneButton,
    `hasSkinToneButton=${snap.hasSkinToneButton}`
  );

  // Expected categories (from default specify_categories). Match
  // case-insensitively against the human-readable nav labels emoji-mart
  // renders ("Smileys & People", "Animals & Nature", ...).
  const expectedCategoryAliases = {
    people: /smileys|people/i,
    nature: /nature|animals/i,
    foods: /food/i,
    activity: /activit/i,
    places: /places|travel/i,
    objects: /object/i,
    symbols: /symbol/i,
  };
  for (const [id, re] of Object.entries(expectedCategoryAliases)) {
    check(
      `category "${id}" is reachable from nav`,
      snap.navLabels.some((l) => re.test(l)),
      `nav=${JSON.stringify(snap.navLabels)}`
    );
  }

  // === 2. INSERT — clicking an emoji writes into the composer ===
  const beforeText = (await composerText(page)) ?? '';
  const picked = await pickFirstEmoji(page);
  console.log(`[features] picked first emoji: ${JSON.stringify(picked)}`);
  check('first emoji tile is clickable', picked.ok, picked.reason || '');

  // emoji-mart fires onEmojiSelect synchronously, but the editor's
  // insertAtCursor hop through Mithril takes a tick.
  await page.waitForTimeout(150);

  const afterText = (await composerText(page)) ?? '';
  check(
    'onEmojiSelect → composer textarea grows',
    afterText.length > beforeText.length,
    `before="${beforeText}" after="${afterText}"`
  );

  // === 3. AUTO-HIDE — picker disappears after a successful pick ===
  const visibleAfter = await page.evaluate(() => {
    const p = document.querySelector('em-emoji-picker.flamoji-picker-popup');
    return p && p.style.display !== 'none';
  });
  check(
    'auto_hide → picker hidden after selection',
    !visibleAfter,
    `style.display still visible`
  );

  // === 4. SEARCH — re-open picker, type, results filter ===
  await openPicker(page);
  await setSearch(page, 'smile');
  const results = await searchResultLabels(page);
  console.log(`[features] search results (top 20): ${JSON.stringify(results)}`);
  check(
    'show_search → typing filters the visible tiles',
    results.length > 0 && results.length < 30,
    `got ${results.length} tiles`
  );

  // Negative search: a junk query must produce strictly fewer tiles
  // than the meaningful one. (We can't easily map glyphs back to names
  // to assert "every result is a smile" — emoji-mart sets aria-label
  // to the glyph itself, not the keyword. Instead, flex the filter.)
  await setSearch(page, 'zzznotanemoji');
  const emptyResults = await searchResultLabels(page);
  check(
    'show_search → unmatched query returns no tiles',
    emptyResults.length === 0,
    `expected 0 tiles, got ${emptyResults.length}: ${JSON.stringify(emptyResults)}`
  );
});
