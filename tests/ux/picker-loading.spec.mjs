// Picker loading-indicator UX test.
//
// Spec:    tests/ux/picker-loading.md  (read first; this file asserts that)
// Runtime: node tests/ux/picker-loading.spec.mjs
//
// Inputs (env, mirrors picker-features.spec.mjs):
//   PIANOTELL_FLARUM_UX_BASE_URL    forum origin (e.g. https://localhost/)
//   PIANOTELL_FLARUM_UX_COOKIE      flarum_remember cookie value
//
// Failure mode: writes tests/ux/_failure.png and exits non-zero.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}  ${detail ?? ''}`);
    failures.push({ label, detail });
  }
}

async function openComposer(page) {
  const selectors = [
    '.IndexPage-newDiscussion',
    'button[onclick*="composer"]',
    'button.Button--primary',
  ];
  for (const sel of selectors) {
    const btn = await page.$(sel);
    if (btn) {
      await btn.click();
      return;
    }
  }
  throw new Error('Could not find a "new discussion" button to open the composer.');
}

async function clickPickerButton(page) {
  await page.waitForSelector('button.Button-flamoji, button[title*="moji" i]', {
    timeout: 10_000,
  });
  await page.click('button.Button-flamoji, button[title*="moji" i]');
}

async function snapshotLoader(page) {
  return await page.evaluate(() => {
    const loader = document.querySelector('.flamoji-picker-loader');
    if (!loader) return { present: false };
    return {
      present: true,
      role: loader.getAttribute('role'),
      ariaLive: loader.getAttribute('aria-live'),
      hasSpinner: !!loader.querySelector('.flamoji-picker-loader__spinner'),
      labelText: loader.querySelector('.flamoji-picker-loader__label')?.textContent || '',
      hasRetry: !!loader.querySelector('.flamoji-picker-loader__retry'),
      isError: loader.classList.contains('flamoji-picker-loader--error'),
      top: loader.style.top,
      left: loader.style.left,
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
  });
  await context.addCookies([
    { name: 'flarum_remember', value: COOKIE, url: BASE },
  ]);
  const page = await context.newPage();

  try {
    // ---------------------------------------------------------------
    // Phase 1: Loader appears while picker is loading; vanishes after.
    // ---------------------------------------------------------------
    // Throttle the API call so the loader has time to show up. The
    // emoji-mart chunks themselves are cached after first run so we can't
    // count on them being slow; delaying the API gives a deterministic
    // window in which the loader must be visible.
    await page.route('**/api/flamojis/**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await openComposer(page);
    await clickPickerButton(page);

    // Loader uses LOADER_DELAY_MS=120 in source; wait a bit longer.
    await page.waitForSelector('.flamoji-picker-loader', { timeout: 5_000 });
    const loading = await snapshotLoader(page);
    check('loader is present while picker is loading', loading.present);
    check('loader has role="status"', loading.role === 'status');
    check('loader is aria-live="polite"', loading.ariaLive === 'polite');
    check('loader contains a spinner', loading.hasSpinner);
    check(
      'loader label reads "Loading emojis…"',
      loading.labelText.includes('Loading emojis'),
      `actual label: "${loading.labelText}"`
    );
    check(
      'loader is positioned (non-empty top/left)',
      !!loading.top && !!loading.left,
      `top="${loading.top}", left="${loading.left}"`
    );
    check(
      'loader is not in error state during normal load',
      !loading.isError && !loading.hasRetry
    );

    // Wait for the picker to mount, then assert loader cleanup.
    await page.waitForSelector('em-emoji-picker.flamoji-picker-popup', {
      timeout: 15_000,
    });
    await page.waitForFunction(
      () => {
        const p = document.querySelector('em-emoji-picker.flamoji-picker-popup');
        return p?.shadowRoot?.querySelector('input[type="search"]') != null;
      },
      { timeout: 15_000 }
    );
    const afterMount = await snapshotLoader(page);
    check('loader is removed once the picker mounts', !afterMount.present);

    // Verify the picker mounted with the safe category-button size.
    // The Safari Travel & Places / Flags wrong-category bug is rooted
    // in WebKit's sub-pixel IntersectionObserver math when category
    // total height (rows * emojiButtonSize + header) lands at a
    // fractional pixel. Empirically any emojiButtonSize > 36 can trip
    // it (the trigger pixel shifts depending on whether Recently Used
    // is populated), so we use emoji-mart's default of 36 unchanged.
    // If a regression bumps the picker prop, this guard fails fast.
    await page.waitForTimeout(200);
    const buttonSize = await page.evaluate(() => {
      const p = document.querySelector('em-emoji-picker.flamoji-picker-popup');
      const btn = p?.shadowRoot?.querySelector('.category button');
      return btn ? Math.round(btn.getBoundingClientRect().width) : null;
    });
    check(
      'category button width is within safe sub-pixel range (≤ 36)',
      buttonSize !== null && buttonSize <= 36,
      `actual button width=${buttonSize}`
    );

    // Drop the throttle for the next phase.
    await page.unroute('**/api/flamojis/**');

    // ---------------------------------------------------------------
    // Phase 2: Loader swaps to error state when API fails. Retry works.
    // ---------------------------------------------------------------
    // Open a fresh page so the picker isn't already cached on this editor.
    await page.close();
    const page2 = await context.newPage();

    let blockApi = true;
    await page2.route('**/api/flamojis/**', async (route) => {
      if (blockApi) {
        await route.fulfill({ status: 500, body: 'forced failure' });
      } else {
        await route.continue();
      }
    });

    await page2.goto(BASE, { waitUntil: 'domcontentloaded' });
    await openComposer(page2);
    await clickPickerButton(page2);

    await page2.waitForSelector('.flamoji-picker-loader--error', { timeout: 10_000 });
    const errored = await page2.evaluate(() => {
      const loader = document.querySelector('.flamoji-picker-loader');
      return {
        hasErrorClass: loader?.classList.contains('flamoji-picker-loader--error'),
        hasRetry: !!loader?.querySelector('.flamoji-picker-loader__retry'),
        retryText: loader?.querySelector('.flamoji-picker-loader__retry')?.textContent || '',
        spinnerGone: !loader?.querySelector('.flamoji-picker-loader__spinner'),
      };
    });
    check('loader gains error class on API failure', errored.hasErrorClass);
    check('Retry button is present in error state', errored.hasRetry);
    check(
      'Retry button text reads "Retry"',
      errored.retryText.toLowerCase().includes('retry'),
      `actual: "${errored.retryText}"`
    );
    check('spinner is removed in error state', errored.spinnerGone);

    // Lift the block, click Retry, expect the real picker to mount.
    blockApi = false;
    await page2.click('.flamoji-picker-loader__retry');
    await page2.waitForSelector('em-emoji-picker.flamoji-picker-popup', {
      timeout: 15_000,
    });
    await page2.waitForFunction(
      () => {
        const p = document.querySelector('em-emoji-picker.flamoji-picker-popup');
        return p?.shadowRoot?.querySelector('input[type="search"]') != null;
      },
      { timeout: 15_000 }
    );
    const afterRetry = await snapshotLoader(page2);
    check('loader is removed after successful Retry', !afterRetry.present);

    await page2.unroute('**/api/flamojis/**');
    await page2.close();

    // ---------------------------------------------------------------
    // Phase 3: Spam-click guard. Multiple rapid clicks during load must
    // not stack multiple loaders (onPickerButtonClick early-returns when
    // isPickerLoading is true, but verify the user-visible invariant).
    // ---------------------------------------------------------------
    const page3 = await context.newPage();
    await page3.route('**/api/flamojis/**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page3.goto(BASE, { waitUntil: 'domcontentloaded' });
    await openComposer(page3);
    await page3.waitForSelector('button.Button-flamoji, button[title*="moji" i]', {
      timeout: 10_000,
    });
    // Rapid-fire clicks before the loader's setTimeout has elapsed.
    for (let i = 0; i < 5; i++) {
      await page3.click('button.Button-flamoji, button[title*="moji" i]');
      await page3.waitForTimeout(20);
    }
    await page3.waitForSelector('.flamoji-picker-loader', { timeout: 5_000 });
    const loaderCount = await page3.evaluate(
      () => document.querySelectorAll('.flamoji-picker-loader').length
    );
    check(
      'spam-clicking the picker button mounts exactly one loader',
      loaderCount === 1,
      `found ${loaderCount} loader element(s)`
    );
    await page3.waitForSelector('em-emoji-picker.flamoji-picker-popup', {
      timeout: 15_000,
    });
    await page3.unroute('**/api/flamojis/**');
    await page3.close();

    // ---------------------------------------------------------------
    // Phase 4: Loader repositions on window scroll. mountPickerLoader
    // attaches a capture-phase scroll listener so the placeholder tracks
    // the toolbar button if the page scrolls under it during the load.
    // ---------------------------------------------------------------
    const page4 = await context.newPage();
    await page4.route('**/api/flamojis/**', async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await page4.goto(BASE, { waitUntil: 'domcontentloaded' });
    await openComposer(page4);
    await clickPickerButton(page4);
    await page4.waitForSelector('.flamoji-picker-loader', { timeout: 5_000 });
    const beforeScroll = await page4.evaluate(() => {
      const l = document.querySelector('.flamoji-picker-loader');
      return l.getBoundingClientRect().top;
    });
    // Scroll an internal container — picker positioning uses the toolbar
    // button as anchor, so any layout shift should re-trigger positioning.
    await page4.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page4.setViewportSize({ width: 1280, height: 700 });
    await page4.waitForTimeout(150);
    const afterResize = await page4.evaluate(() => {
      const l = document.querySelector('.flamoji-picker-loader');
      return l ? l.getBoundingClientRect().top : null;
    });
    check(
      'loader stays on screen after viewport resize',
      afterResize !== null,
      `loader vanished after resize`
    );
    check(
      'loader top position updates after viewport resize',
      afterResize !== beforeScroll,
      `before=${beforeScroll} after=${afterResize}`
    );
    await page4.unroute('**/api/flamojis/**');
    await page4.close();

    // ---------------------------------------------------------------
    // Phase 5: Editor torn down mid-load → no orphan loader. The
    // onremove teardown must clear both the pending setTimeout and any
    // already-mounted loader; otherwise we'd leak DOM into document.body.
    // ---------------------------------------------------------------
    const page5 = await context.newPage();
    await page5.route('**/api/flamojis/**', async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue();
    });
    await page5.goto(BASE, { waitUntil: 'domcontentloaded' });
    await openComposer(page5);
    await clickPickerButton(page5);
    await page5.waitForSelector('.flamoji-picker-loader', { timeout: 5_000 });
    // Close composer (Esc key, then click any "discard" confirmation).
    // Flarum's TextEditor unmount fires our onremove which should clean up.
    await page5.evaluate(() => {
      // app.composer is the global composer state on Flarum 1.x.
      if (window.app && window.app.composer && window.app.composer.isVisible()) {
        window.app.composer.hide();
      }
    });
    await page5.waitForTimeout(300);
    const orphan = await page5.evaluate(
      () => document.querySelectorAll('.flamoji-picker-loader').length
    );
    check(
      'closing the composer mid-load removes the loader (no orphan)',
      orphan === 0,
      `found ${orphan} orphaned loader element(s) after composer close`
    );
    await page5.unroute('**/api/flamojis/**');
    await page5.close();

    // ---------------------------------------------------------------
    // Phase 6: Loader does NOT appear on subsequent picker opens. Once
    // chunks + custom emojis are cached on the editor instance, the
    // toolbar button just toggles display and shouldn't flash a loader.
    // ---------------------------------------------------------------
    const page6 = await context.newPage();
    await page6.goto(BASE, { waitUntil: 'domcontentloaded' });
    await openComposer(page6);
    // First open: load to completion (no throttle here — keep it fast).
    await clickPickerButton(page6);
    await page6.waitForSelector('em-emoji-picker.flamoji-picker-popup', {
      timeout: 15_000,
    });
    await page6.waitForFunction(
      () => {
        const p = document.querySelector('em-emoji-picker.flamoji-picker-popup');
        return p?.shadowRoot?.querySelector('input[type="search"]') != null;
      },
      { timeout: 15_000 }
    );
    // Close the picker popup (Escape) then re-open it.
    await page6.keyboard.press('Escape');
    await page6.waitForTimeout(100);
    await clickPickerButton(page6);
    // Wait long enough that LOADER_DELAY_MS would have fired if the
    // second-open code path mistakenly went through scheduleLoaderMount.
    await page6.waitForTimeout(300);
    const reopenLoader = await page6.evaluate(
      () => document.querySelectorAll('.flamoji-picker-loader').length
    );
    check(
      'second open of cached picker does not mount a loader',
      reopenLoader === 0,
      `found ${reopenLoader} loader(s) on cached re-open`
    );
    await page6.close();

    if (failures.length) {
      mkdirSync(HERE, { recursive: true });
      const dumpPage = await context.newPage();
      try { await dumpPage.screenshot({ path: resolve(HERE, '_failure.png'), fullPage: true }); } catch {}
      await dumpPage.close();
      writeFileSync(resolve(HERE, '_failures.json'), JSON.stringify(failures, null, 2));
      console.error(`\n${failures.length} check(s) failed; screenshot at tests/ux/_failure.png`);
      process.exit(1);
    }
    console.log('\nAll picker-loading checks passed.');
  } catch (err) {
    try {
      await page.screenshot({ path: resolve(HERE, '_failure.png'), fullPage: true });
    } catch {}
    console.error(err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
