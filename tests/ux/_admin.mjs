// Shared admin-UI helpers used by every Flamoji UX spec.
//
// All test setup/teardown that touches admin-visible state (settings,
// custom emoji) goes through these helpers — i.e. through the actual
// Flarum admin panel UI — so the tests double as proof that the admin
// surface itself works end-to-end. No direct DB writes, no
// `app.forum.data.attributes` mutation, no REST POST/DELETE shortcuts.
//
// The trade-off is speed: every state change costs an admin SPA round
// trip + a forum reload. We mitigate by batching all overrides for one
// scenario into a single Save click.
//
// Selectors observed on the running 1.x admin page:
//
//   Switches     <label class="Checkbox on Checkbox--switch"><input type="checkbox">…label</label>
//   Picker style <select> in `.Flamoji--emojiSetting` (auto/twemoji/native)
//   Frequent rows <input type="number"> in `.recentsCountGroup`
//   Categories   `.cat-checkbox > input[type="checkbox"]` + `<label for="people">…`
//   Save button  `button.Button--primary` w/ "Save Changes" — disabled when clean
//   Custom emoji `.customEmoji-list li .customEmoji` (image title=":shortcode:")
//                Add button: `.customEmoji-addButton`
//                Edit button: `.customEmoji-editButton` (per row)
//                Modal save: `.EditEmojiModal-save`
//                Modal delete: `.EditEmojiModal-delete` (only in edit mode)
//                Modal close: `.Modal-close .Button`
//
// All admin tests assume the test user provisioned by run.sh has the
// admin group (run.sh's provisioner promotes them). The `flarum_remember`
// cookie carries them through to the admin panel.

const ADMIN_HASH = '#/extension/pianotell-flamoji';

// Defaults taken from extend.php so a final `applySettings(page, DEFAULTS)`
// fully restores the test forum no matter what permutation a spec ran.
export const DEFAULTS = Object.freeze({
  auto_hide: true,
  show_preview: true,
  show_search: true,
  show_variants: true,
  show_category_buttons: true,
  show_recents: true,
  prepopulate_recents: true,
  picker_set: 'auto',
  frequent_rows: 4,
  // All eight categories enabled = "no narrowing".
  specify_categories: ['people', 'nature', 'foods', 'activity', 'places', 'objects', 'symbols', 'flags'],
});

// Map setting key → English label as rendered next to the Switch.
// (The label is the only stable identifier the DOM gives us — the input
// itself has no name/id.)
const SWITCH_LABELS = {
  auto_hide: 'Auto hide',
  show_preview: 'Show preview section',
  show_search: 'Show search input',
  show_variants: 'Show skin-tone variants',
  show_category_buttons: 'Show category buttons',
  show_recents: 'Show (and save) frequently used emojis',
};

export async function gotoAdmin(page, baseUrl) {
  const url = baseUrl.replace(/\/$/, '') + '/admin' + ADMIN_HASH;
  await page.goto(url, { waitUntil: 'networkidle' });
  // Wait for the extension settings panel to render.
  await page.waitForSelector('.Flamoji--settingsContainer', { timeout: 15_000 });
  await page.waitForSelector('button.Button--primary', { timeout: 5_000 });
  await page.waitForTimeout(300);
}

// Toggle a single Flarum Switch identified by its visible label text.
// Flarum hides the underlying <input> — clicking the wrapping <label>
// flips the checkbox.
async function setSwitch(page, label, desired) {
  const handle = await page.evaluateHandle((labelText) => {
    return [...document.querySelectorAll('label.Checkbox--switch')].find(
      (l) => l.textContent?.trim() === labelText
    );
  }, label);
  const el = handle.asElement();
  if (!el) throw new Error(`Switch not found: "${label}"`);
  const current = await el.evaluate((l) => l.querySelector('input')?.checked);
  if (current !== desired) await el.click();
  await handle.dispose();
}

async function setSelectByValue(page, value) {
  // Flarum's Select wraps a native <select> inside `.Select`. Setting
  // .value programmatically and dispatching `change` mirrors what the
  // user does (the bound onchange flows through Mithril like normal).
  await page.evaluate((v) => {
    const sel = document.querySelector('.Flamoji--emojiSetting select');
    if (!sel) throw new Error('picker_set <select> not found in admin');
    sel.value = v;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function setNumberInput(page, selector, value) {
  await page.fill(selector, String(value));
  // Trigger Mithril's bidi binding by dispatching `input`+`change`.
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    el?.dispatchEvent(new Event('input', { bubbles: true }));
    el?.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector);
}

async function setCategories(page, wantedList) {
  const wanted = new Set(wantedList);
  await page.evaluate((wantedArr) => {
    const want = new Set(wantedArr);
    const boxes = [...document.querySelectorAll('.cat-checkbox')];
    for (const box of boxes) {
      const input = box.querySelector('input[type="checkbox"]');
      const cat = box.querySelector('label')?.getAttribute('for');
      if (!input || !cat) continue;
      const desired = want.has(cat);
      if (input.checked !== desired) {
        // .click() toggles + fires click+change per spec, but be belt-
        // and-braces: the onchange in admin/index.js mutates this.
        // specifiedCategories from change.target.checked, and Mithril's
        // auto-redraw needs the change event to bubble through Mithril's
        // event delegation. .click() handles both.
        input.click();
      }
    }
  }, [...wanted]);
}

// Apply a partial overrides map. Anything you omit keeps its current
// admin-saved value. Returns once Save Changes has completed.
//
// `overrides` recognised keys mirror DEFAULTS above:
//   - boolean switch keys: auto_hide, show_preview, show_search,
//     show_variants, show_category_buttons, show_recents
//   - picker_set: 'auto' | 'twemoji' | 'native'
//   - frequent_rows: integer 1..10
//   - specify_categories: array of category ids
//
// On save the underlying /api/settings call sometimes flakes — alerts
// fire from earlier extensions (e.g. cache-clear 409 races) and the
// page is reused across scenarios, so we always close stale alerts and
// retry the save once on failure before giving up.
export async function applySettings(page, overrides, baseUrl) {
  await gotoAdmin(page, baseUrl);
  // Dismiss any leftover alert/dialog from previous scenarios so a
  // stale "Oops!" banner doesn't make us think THIS save failed.
  await page.evaluate(() => {
    document.querySelectorAll('.Alert .Alert-controls .Button').forEach((b) => b.click());
  });

  for (const [key, label] of Object.entries(SWITCH_LABELS)) {
    if (key in overrides) await setSwitch(page, label, !!overrides[key]);
  }
  if ('picker_set' in overrides) await setSelectByValue(page, overrides.picker_set);
  if ('prepopulate_recents' in overrides) {
    // Only renders when show_recents is ON. Skip if show_recents is
    // being turned OFF in this same call (the switch won't be in the DOM).
    const recentsOn = 'show_recents' in overrides ? !!overrides.show_recents : true;
    if (recentsOn) {
      await page.waitForTimeout(200);
      await setSwitch(page, 'Pre-populate with popular emojis', !!overrides.prepopulate_recents);
    }
  }
  if ('frequent_rows' in overrides) {
    // The Frequent emoji rows input only renders when show_recents is
    // ON. Caller's responsibility to ensure that — we don't toggle it
    // implicitly because that would mask a buggy admin UI.
    await setNumberInput(page, '.recentsCountGroup input[type="number"]', overrides.frequent_rows);
  }
  if ('specify_categories' in overrides) await setCategories(page, overrides.specify_categories);

  // Wait briefly for Mithril to redraw the Save button's disabled state.
  await page.waitForTimeout(250);
  const dirty = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => /save changes/i.test(b.textContent || '')
    );
    return btn && !btn.disabled;
  });
  if (!dirty) return;

  // Save with retry. Flarum's POST /api/settings races with other
  // background requests on this forum (the formatter cache-clear used
  // by Flamoji's own custom-emoji flow returns 409 under load) and the
  // alert system can briefly mark the form as failed even when the
  // settings did persist server-side.
  const saveOnce = async () => {
    await page.evaluate(() => {
      // Wipe any prior alert so we can detect a fresh one this round.
      document.querySelectorAll('.Alert').forEach((a) => a.remove());
    });
    await page.click('button.Button--primary:not([disabled])', { timeout: 5_000 });
    try {
      await page.waitForFunction(
        () => {
          const btn = [...document.querySelectorAll('button')].find(
            (b) => /save changes/i.test(b.textContent || '')
          );
          return btn && btn.disabled;
        },
        { timeout: 8_000 }
      );
      return true;
    } catch {
      return false;
    }
  };

  if (!(await saveOnce())) {
    // First attempt didn't settle. Wait out any background noise and
    // retry once more before declaring failure.
    await page.waitForTimeout(1_500);
    if (!(await saveOnce())) {
      throw new Error('admin Save Changes did not complete after 2 attempts');
    }
  }
  await page.waitForTimeout(200);
}

// Convenience wrapper to drop the test forum back to a known baseline.
// Spec teardown should always call this so a failing scenario doesn't
// leave the next run starting from a poisoned state.
export async function restoreDefaults(page, baseUrl) {
  await applySettings(page, DEFAULTS, baseUrl);
}

// ---------- custom emoji ----------

// Returns the list of `:shortcode:` strings currently rendered in the
// Custom Emojis admin section.
export async function listCustomEmojiShortcodes(page) {
  return await page.evaluate(() =>
    [
      ...document.querySelectorAll('.customEmoji-list li .customEmoji:not(.addEmoji) .customEmoji-image'),
    ]
      .map((img) => img.getAttribute('title'))
      .filter(Boolean)
  );
}

// Open the "Add Emoji" modal, fill it, click Save, and wait for the
// list to gain our new row. `path` accepts any URL or data URI — the
// admin UI doesn't validate it.
//
// Note: the modal re-renders on every keystroke (the modal title binds
// to the live emojiTitle stream), so previously-resolved input handles
// can become detached. Re-query before each fill to be safe.
export async function addCustomEmoji(page, { title, shortcode, path }) {
  await page.click('.customEmoji-addButton');
  await page.waitForSelector('.EditEmojiModal', { timeout: 10_000 });

  for (const [idx, value] of [[0, title], [1, shortcode], [2, path]]) {
    const input = await page.evaluateHandle((i) => {
      return document.querySelectorAll('.EditEmojiModal .FormControl')[i];
    }, idx);
    const el = input.asElement();
    if (!el) throw new Error(`EditEmojiModal input #${idx} not found`);
    await el.fill(value);
    await el.dispose();
  }

  await page.click('.EditEmojiModal-save');
  // Modal closes on success; list re-renders with the new row.
  await page.waitForFunction(
    () => !document.querySelector('.EditEmojiModal'),
    { timeout: 15_000 }
  );
  await page.waitForFunction(
    (sc) =>
      [...document.querySelectorAll('.customEmoji-image')].some(
        (img) => img.getAttribute('title') === sc
      ),
    shortcode,
    { timeout: 10_000 }
  );
}

// Open the edit modal for an existing row by shortcode, accept the
// confirm dialog, click Delete, wait for the row to disappear.
// Returns false if no row matches.
export async function deleteCustomEmojiByShortcode(page, shortcode) {
  const found = await page.evaluate((sc) => {
    const img = [...document.querySelectorAll('.customEmoji-image')].find(
      (i) => i.getAttribute('title') === sc
    );
    if (!img) return false;
    const li = img.closest('li');
    li?.querySelector('.customEmoji-editButton')?.click();
    return true;
  }, shortcode);
  if (!found) return false;

  await page.waitForSelector('.EditEmojiModal-delete', { timeout: 10_000 });

  // EditEmojiModal.delete() uses native window.confirm — auto-accept.
  // Register the handler before the click so we don't miss it.
  page.once('dialog', (d) => d.accept());
  await page.click('.EditEmojiModal-delete');

  await page.waitForFunction(
    () => !document.querySelector('.EditEmojiModal'),
    { timeout: 15_000 }
  );
  await page.waitForFunction(
    (sc) =>
      ![...document.querySelectorAll('.customEmoji-image')].some(
        (i) => i.getAttribute('title') === sc
      ),
    shortcode,
    { timeout: 10_000 }
  );
  return true;
}

// Delete every custom emoji in the admin list. Iterates until the list
// is empty, so baseline specs start from a known-clean state regardless
// of what prior specs left behind.
export async function deleteAllCustomEmojis(page, baseUrl) {
  await gotoAdmin(page, baseUrl);
  let shortcodes = await listCustomEmojiShortcodes(page);
  while (shortcodes.length > 0) {
    for (const sc of shortcodes) {
      const deleted = await deleteCustomEmojiByShortcode(page, sc);
      if (!deleted) break;
    }
    shortcodes = await listCustomEmojiShortcodes(page);
  }
}
