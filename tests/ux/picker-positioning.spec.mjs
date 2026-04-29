// Picker positioning UX test.
//
// Spec:    tests/ux/README.md  (read first; this file asserts what's there)
// Runtime: node tests/ux/picker-positioning.spec.mjs
//
// Failure mode: writes tests/ux/_failure.png and exits non-zero.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSpec, openComposer } from '../../.pianotell/tests/ux/helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// Geometry tolerances. emoji-mart's Shadow DOM lays out asynchronously
// and can settle a sub-pixel away from the math; allow ±2px on every
// numeric assertion so we don't chase phantom regressions.
const PX_TOLERANCE = 2;
const SPEC_MARGIN = 6;
const SPEC_SCREEN_PADDING = 8;

const within = (a, b, tol = PX_TOLERANCE) => Math.abs(a - b) <= tol;

async function openPicker(page) {
  // The flamoji button is rendered in the editor toolbar. Match by either
  // the class our component sets or by tooltip text containing "moji".
  await page.waitForSelector('button.Button-flamoji, button[title*="moji" i]', {
    timeout: 10_000,
  });
  await page.click('button.Button-flamoji, button[title*="moji" i]');
  // Wait for emoji-mart to lazy-load + Shadow DOM to settle.
  await page.waitForSelector('em-emoji-picker.flamoji-picker-popup', { timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const p = document.querySelector('em-emoji-picker.flamoji-picker-popup');
      if (!p) return false;
      const r = p.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    },
    { timeout: 10_000 }
  );
  // Final settle: positionPicker runs from a ResizeObserver which fires
  // on the next animation frame.
  await page.waitForTimeout(250);
}

async function snapshot(page) {
  return await page.evaluate(() => {
    const picker = document.querySelector('em-emoji-picker.flamoji-picker-popup');
    const button = document.querySelector('button.Button-flamoji, button[title*="moji" i]');
    const composer = button ? button.closest('.ComposerBody') : null;
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      picker: picker ? rect(picker) : null,
      button: button ? rect(button) : null,
      composer: composer ? rect(composer) : null,
      pickerStyleTop: picker?.style.top ?? null,
      pickerStyleLeft: picker?.style.left ?? null,
    };
  });
}

function assertSpec(scenario, snap, check) {
  console.log(`[${scenario}] vw=${snap.vw} vh=${snap.vh}`);
  console.log(
    `  picker  ${JSON.stringify(snap.picker)}\n  button  ${JSON.stringify(snap.button)}`
  );

  // Spec rule 4: top/left must be set (non-empty inline styles, both
  // numeric). This is the regression guard for d4ede25.
  check(
    'positionPicker set inline top/left (rule 4)',
    !!snap.pickerStyleTop && !!snap.pickerStyleLeft,
    `top="${snap.pickerStyleTop}" left="${snap.pickerStyleLeft}"`
  );

  // Picker isn't stranded in the upper-left corner — that's the visual
  // signature of the regression even when inline styles happen to be set.
  check(
    'picker not stranded at viewport origin',
    snap.picker.left > SPEC_SCREEN_PADDING + 1 || snap.picker.top > SPEC_SCREEN_PADDING + 1,
    `picker.left=${snap.picker.left} picker.top=${snap.picker.top}`
  );

  // Spec rule 3: viewport clamp.
  check(
    'picker fully on-screen horizontally (rule 3)',
    snap.picker.left >= SPEC_SCREEN_PADDING - PX_TOLERANCE &&
      snap.picker.right <= snap.vw - SPEC_SCREEN_PADDING + PX_TOLERANCE,
    `left=${snap.picker.left} right=${snap.picker.right} vw=${snap.vw}`
  );
  check(
    'picker fully on-screen vertically (rule 3)',
    snap.picker.top >= SPEC_SCREEN_PADDING - PX_TOLERANCE &&
      snap.picker.bottom <= snap.vh - SPEC_SCREEN_PADDING + PX_TOLERANCE,
    `top=${snap.picker.top} bottom=${snap.picker.bottom} vh=${snap.vh}`
  );

  // Determine which placement should be in effect by replaying the
  // primary-mode test the source code does. If primary fits, assert the
  // primary geometry; otherwise assert the composer-anchored fallback.
  const btnCenterX = snap.button.left + snap.button.width / 2;
  const primaryLeft = btnCenterX - snap.picker.width / 2;
  const minLeft = SPEC_SCREEN_PADDING;
  const maxLeft = snap.vw - snap.picker.width - SPEC_SCREEN_PADDING;
  const primaryFits = primaryLeft >= minLeft && primaryLeft <= maxLeft;

  if (primaryFits) {
    // Spec rule 1: button-centered horizontally, with margin gap above.
    // Allow for the viewport clamp to nudge `top` down if the button is
    // close to the top edge.
    const expectedLeft = primaryLeft;
    const expectedTopUnclamped = snap.button.top - SPEC_MARGIN - snap.picker.height;
    const expectedTop = Math.max(SPEC_SCREEN_PADDING, expectedTopUnclamped);
    check(
      'primary: horizontally centered on button (rule 1)',
      within(snap.picker.left, expectedLeft),
      `actual=${snap.picker.left} expected=${expectedLeft}`
    );
    check(
      'primary: floats above button by margin (rule 1)',
      within(snap.picker.top, expectedTop),
      `actual=${snap.picker.top} expected=${expectedTop} (clamped from ${expectedTopUnclamped})`
    );
  } else {
    // Spec rule 2: composer-centered, vertically anchored to bottom edge.
    if (!snap.composer) {
      check('fallback: requires .ComposerBody to be measurable', false, 'composer missing');
      return;
    }
    const expectedLeft = snap.composer.left + (snap.composer.width - snap.picker.width) / 2;
    const expectedTopUnclamped = snap.composer.bottom - snap.picker.height / 2;
    // Apply the same clamps the source does.
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const expectedClampedLeft = clamp(expectedLeft, minLeft, maxLeft);
    const expectedClampedTop = clamp(
      expectedTopUnclamped,
      SPEC_SCREEN_PADDING,
      snap.vh - snap.picker.height - SPEC_SCREEN_PADDING
    );
    check(
      'fallback: horizontally centered on composer (rule 2)',
      within(snap.picker.left, expectedClampedLeft),
      `actual=${snap.picker.left} expected=${expectedClampedLeft}`
    );
    check(
      'fallback: vertically anchored to composer bottom (rule 2)',
      within(snap.picker.top, expectedClampedTop),
      `actual=${snap.picker.top} expected=${expectedClampedTop}`
    );
  }
}

await runSpec({
  specName: 'picker-positioning',
  outputDir: HERE,
}, async ({ browser, check, BASE, COOKIE }) => {
  // Two viewports exercise both placement modes. 1280×800 is the
  // canonical desktop; 480×800 is narrow enough that a button near the
  // left edge of the composer toolbar will trip the fallback path.
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 480, height: 800 },
  ]) {
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport,
    });
    await ctx.addCookies([
      { name: 'flarum_remember', value: COOKIE, url: BASE },
    ]);
    const page = await ctx.newPage();
    // Bypass the per-extension chunk cache by appending a one-shot
    // version param. Webpack's chunkLoader honors the document URL but
    // chunks are loaded by hard-coded filename — instead, just disable
    // the HTTP cache for this run so we always get the latest dist.
    await page.route('**/*', (route) => route.continue());
    await page.context().setExtraHTTPHeaders({ 'cache-control': 'no-cache' });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await openComposer(page);
    await openPicker(page);
    const snap = await snapshot(page);
    assertSpec(`${viewport.width}x${viewport.height}`, snap, check);

    await ctx.close();
  }
});
