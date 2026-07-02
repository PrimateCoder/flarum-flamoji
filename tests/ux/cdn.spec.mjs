// CDN loading UX test.
//
// Exercises the "Load Emoji-Mart via CDN" feature and the hardening added on
// top of the original PR:
//   1. When CDN mode is on with the (default) valid URL + SRI, the emoji-mart
//      library is loaded via an injected <script> carrying the integrity
//      attribute, and the picker mounts from window.EmojiMart.
//   2. When the JS SRI does not match, the browser blocks the script and the
//      picker transparently falls back to the locally-bundled copy — it still
//      mounts, no error card.
//   3. When the data SRI does not match, the integrity-checked fetch() is
//      rejected and the dataset falls back to the local bundle — picker still
//      mounts with full unicode data.
//   4. In (effective) sticker mode the heavy unicode dataset is skipped
//      entirely: the CDN data URL is never requested.
//
// Runtime: node tests/ux/cdn.spec.mjs (via tests/ux/run.sh)
// Failure mode: writes tests/ux/_failure.png and exits non-zero.
//
// NOTE: this spec loads emoji-mart from jsdelivr, so it requires outbound
// network access from the browser host (as any CDN feature test must).

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSpec, openComposer, dbQuery, clearCache } from '../../.pianotell/tests/ux/helpers.mjs';
import { applySettings, DEFAULTS, addCustomEmoji, deleteAllCustomEmojis } from './_admin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const CDN_JS_HOST = 'cdn.jsdelivr.net';
const CDN_JS_PATH = '/npm/emoji-mart@5.6.0/dist/browser.js';
const CDN_DATA_URL = 'https://cdn.jsdelivr.net/npm/@emoji-mart/data@1.2.1/sets/15/twitter.json';
// A validly-formatted (base64 sha384) but intentionally wrong hash.
const WRONG_SRI = 'sha384-CNpLE5g/RklAvQ6YhxMzVPSJ33H3o4jdhQPjc+UNIRVdk0iV2DBLBP10pIrZQzrh';

// Upsert a Flarum setting (dbWriteSetting only UPDATEs; defaulted keys have no
// row yet, so we INSERT ... ON DUPLICATE KEY UPDATE).
async function setSetting(key, value) {
  const hex = Buffer.from(String(value), 'utf8').toString('hex').toUpperCase();
  const v = hex ? "UNHEX('" + hex + "')" : "''";
  await dbQuery("INSERT INTO settings (`key`, value) VALUES ('" + key + "', " + v + ') ' + 'ON DUPLICATE KEY UPDATE value = ' + v);
}

async function clearSetting(key) {
  await dbQuery("DELETE FROM settings WHERE `key` = '" + key + "'");
}

// Apply a set of pianotell-flamoji.* settings, then clear Flarum's cache so the
// forum payload (which serializes these into forum attributes) is regenerated.
async function applyCdnSettings(settings) {
  for (const [key, value] of Object.entries(settings)) {
    await setSetting('pianotell-flamoji.' + key, value);
  }
  await clearCache();
}

async function resetCdnSettings() {
  for (const key of ['use_cdn', 'cdn_js_url', 'cdn_js_sri', 'cdn_data_url', 'cdn_data_sri']) {
    await clearSetting('pianotell-flamoji.' + key);
  }
  await clearCache();
}

async function openPicker(page) {
  await page.waitForSelector('button.Button-flamoji, button[title*="moji" i]', { timeout: 10_000 });
  await page.click('button.Button-flamoji, button[title*="moji" i]');
}

async function pickerMounted(page) {
  await page.waitForSelector('em-emoji-picker.flamoji-picker-popup', { timeout: 20_000 });
  await page.waitForFunction(() => document.querySelector('em-emoji-picker.flamoji-picker-popup')?.shadowRoot?.querySelector('input[type="search"]') != null, {
    timeout: 20_000,
  });
}

await runSpec(
  {
    specName: 'cdn',
    outputDir: HERE,
  },
  async ({ context, page, check, BASE }) => {
    // Capture unexpected JS errors (per harness convention).
    page._uxErrors = [];
    page.on('pageerror', (err) => {
      if (err.message.includes('@context')) return;
      page._uxErrors.push(err.message);
    });

    // Clean slate: default (non-CDN) UI settings + no custom emoji.
    console.log('\n[setup] applying defaults + clearing custom emoji');
    await applySettings(page, DEFAULTS, BASE);
    await deleteAllCustomEmojis(page, BASE);

    try {
      // -------------------------------------------------------------
      // Phase 1: CDN on, valid defaults → integrity-tagged <script>,
      // picker mounts from window.EmojiMart.
      // -------------------------------------------------------------
      console.log('\n[phase 1] CDN enabled with default URL + SRI');
      await applyCdnSettings({ use_cdn: '1' });

      await page.goto(BASE, { waitUntil: 'networkidle' });
      await openComposer(page);
      await openPicker(page);
      await pickerMounted(page);

      const injected = await page.evaluate((path) => {
        const s = [...document.querySelectorAll('script[src]')].find((el) => el.src.includes(path));
        if (!s) return { present: false };
        return { present: true, src: s.src, integrity: s.integrity || '', crossOrigin: s.crossOrigin || '' };
      }, CDN_JS_PATH);

      check('phase1 — emoji-mart CDN script was injected', injected.present, `src seen: ${injected.src || '(none)'}`);
      check('phase1 — injected script carries an SRI integrity hash', injected.integrity.startsWith('sha384-'), `integrity="${injected.integrity}"`);
      check('phase1 — injected script uses crossorigin=anonymous', injected.crossOrigin === 'anonymous', `crossOrigin="${injected.crossOrigin}"`);

      const usedCdnGlobal = await page.evaluate(() => !!window.EmojiMart);
      check('phase1 — window.EmojiMart present (loaded from CDN)', usedCdnGlobal);

      // -------------------------------------------------------------
      // Phase 2: CDN on, WRONG JS SRI → browser blocks the script →
      // fall back to the local bundle → picker still mounts.
      // -------------------------------------------------------------
      console.log('\n[phase 2] CDN JS SRI mismatch → local fallback');
      await applyCdnSettings({ use_cdn: '1', cdn_js_sri: WRONG_SRI });

      const page2 = await context.newPage();
      const blockedSri = [];
      page2.on('console', (m) => {
        const t = m.text();
        if (/Failed to find a valid digest|integrity|Subresource Integrity/i.test(t)) blockedSri.push(t);
      });
      await page2.goto(BASE, { waitUntil: 'networkidle' });
      await openComposer(page2);
      await openPicker(page2);
      await pickerMounted(page2); // must still mount via local fallback
      check('phase2 — picker still mounts after JS SRI mismatch (local fallback)', true);
      await page2.close();

      // -------------------------------------------------------------
      // Phase 3: CDN on, WRONG data SRI → integrity-checked fetch()
      // rejects → fall back to local dataset → picker still mounts.
      // -------------------------------------------------------------
      console.log('\n[phase 3] CDN data SRI mismatch → local dataset fallback');
      await applyCdnSettings({ use_cdn: '1', cdn_data_sri: WRONG_SRI });

      const page3 = await context.newPage();
      await page3.goto(BASE, { waitUntil: 'networkidle' });
      await openComposer(page3);
      await openPicker(page3);
      await pickerMounted(page3);
      // A built-in unicode category proves the full dataset loaded (locally).
      const hasUnicode = await page3.evaluate(() => {
        const sr = document.querySelector('em-emoji-picker.flamoji-picker-popup')?.shadowRoot;
        return !!sr && sr.querySelectorAll('.category button').length > 3;
      });
      check('phase3 — picker mounts with full dataset after data SRI mismatch (local fallback)', hasUnicode);
      await page3.close();

      // -------------------------------------------------------------
      // Phase 4: effective sticker mode → the unicode dataset is skipped
      // entirely; the CDN data URL is never requested.
      // -------------------------------------------------------------
      console.log('\n[phase 4] sticker mode skips the (CDN) unicode dataset');
      await deleteAllCustomEmojis(page, BASE);
      await addCustomEmoji(page, {
        title: 'Party',
        shortcode: ':cdn_stk_party:',
        category: 'Stickers',
        path: 'https://cdn.jsdelivr.net/npm/emoji-datasource-twitter@15.0.1/img/twitter/64/1f389.png',
      });
      await applySettings(page, { ...DEFAULTS, sticker_mode: true }, BASE);
      await applyCdnSettings({ use_cdn: '1' });

      const page4 = await context.newPage();
      let dataFetched = false;
      await page4.route(CDN_DATA_URL, (route) => {
        dataFetched = true;
        return route.continue();
      });
      await page4.goto(BASE, { waitUntil: 'networkidle' });
      await openComposer(page4);
      await openPicker(page4);
      await pickerMounted(page4);
      await page4.waitForTimeout(500);
      check('phase4 — CDN unicode dataset NOT requested in sticker mode', dataFetched === false, dataFetched ? 'data URL was fetched despite sticker mode' : '');
      const stickerNav = await page4.evaluate(() => {
        const sr = document.querySelector('em-emoji-picker.flamoji-picker-popup')?.shadowRoot;
        const labels = [...(sr?.querySelectorAll('nav button[aria-label]') || [])].map((b) => b.getAttribute('aria-label'));
        const BUILTINS = /smileys|people|animals|food|activit|travel|objects|symbols|flags/i;
        return { labels, hasBuiltin: labels.some((l) => BUILTINS.test(l)) };
      });
      check('phase4 — sticker picker restricted to custom categories', stickerNav.labels.length > 0 && !stickerNav.hasBuiltin, `nav=${JSON.stringify(stickerNav.labels)}`);
      await page4.close();

      check('no unexpected JS errors', page._uxErrors.length === 0, page._uxErrors.join('; '));
    } finally {
      // Restore a clean, non-CDN, non-sticker state for the next spec.
      console.log('\n[teardown] resetting CDN settings + defaults + custom emoji');
      await resetCdnSettings();
      await deleteAllCustomEmojis(page, BASE);
      await applySettings(page, DEFAULTS, BASE);
    }
  }
);
