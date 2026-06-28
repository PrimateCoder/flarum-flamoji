// Sticker-mode render spec.
//
// Spec:    tests/ux/sticker-render.md (none yet; behavior described here)
// Runtime: node tests/ux/sticker-render.spec.mjs
//
// What this proves: the sticker_mode admin toggle isn't just a bigger
// picker — it actually enlarges how custom emoji RENDER in posts and the
// composer preview. When on, the forum gets a `flamoji--sticker` root class
// (set by the forum initializer once app.forum is available) and
// less/forum.less sizes `span.flamoji img` up to ~4em (vs the default
// 1.5em). When off, the class is absent and images stay 1.5em.
//
// Failure mode: writes tests/ux/_failure.png + _failures.json, exits non-zero.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSpec } from '../../.pianotell/tests/ux/helpers.mjs';
import { applySettings, DEFAULTS } from './_admin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// Measure the height the post/preview render path produces for a custom
// emoji: a <span class="flamoji"><img></span> inserted into the page.
async function measureFlamojiImg(page) {
  return page.evaluate(() => {
    const span = document.createElement('span');
    span.className = 'flamoji';
    const img = document.createElement('img');
    img.src =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    span.appendChild(img);
    (document.querySelector('#content') || document.body).appendChild(span);
    const px = img.getBoundingClientRect().height;
    const em = parseFloat(getComputedStyle(document.body).fontSize);
    span.remove();
    return { px: Math.round(px), em: Math.round(em) };
  });
}

await runSpec({ specName: 'sticker-render', outputDir: HERE }, async ({ page, check, BASE }) => {
  // === sticker_mode ON ===
  console.log('\n[scenario] sticker_mode = ON');
  await applySettings(page, { ...DEFAULTS, sticker_mode: true }, BASE);
  await page.goto(BASE, { waitUntil: 'networkidle' });

  const onClass = await page.evaluate(() =>
    document.documentElement.classList.contains('flamoji--sticker')
  );
  check('sticker ON → <html> has flamoji--sticker class', onClass);

  const on = await measureFlamojiImg(page);
  console.log(`  → rendered custom-emoji img = ${on.px}px (1em=${on.em}px, 4em=${on.em * 4}px)`);
  check('sticker ON → custom-emoji img renders ~4em', on.px >= on.em * 3.5,
    `${on.px}px expected ~${on.em * 4}px`);

  // === sticker_mode OFF (restore default) ===
  console.log('\n[scenario] sticker_mode = OFF');
  await applySettings(page, DEFAULTS, BASE);
  await page.goto(BASE, { waitUntil: 'networkidle' });

  const offClass = await page.evaluate(() =>
    document.documentElement.classList.contains('flamoji--sticker')
  );
  check('sticker OFF → no flamoji--sticker class', !offClass);

  const off = await measureFlamojiImg(page);
  console.log(`  → rendered custom-emoji img = ${off.px}px (default 1.5em = ${Math.round(off.em * 1.5)}px)`);
  check('sticker OFF → custom-emoji img back to default ~1.5em', off.px <= on.em * 2,
    `${off.px}px expected ~${Math.round(off.em * 1.5)}px`);

  check('sticker ON renders clearly larger than OFF', on.px > off.px * 2,
    `on=${on.px}px off=${off.px}px`);
});
