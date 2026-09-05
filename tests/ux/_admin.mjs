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

const ADMIN_HASH = "#/extension/pianotell-flamoji";

// Defaults taken from extend.php so a final `applySettings(page, DEFAULTS)`
// fully restores the test forum no matter what permutation a spec ran.
export const DEFAULTS = Object.freeze({
  auto_hide: true,
  show_preview: true,
  show_search: true,
  show_variants: true,
  show_category_buttons: true,
  show_recents: true,
  sticker_mode: false,
  picker_set: "auto",
  frequent_rows: 4,
  // All eight categories enabled = "no narrowing".
  specify_categories: [
    "people",
    "nature",
    "foods",
    "activity",
    "places",
    "objects",
    "symbols",
    "flags",
  ],
});

// Map setting key → English label as rendered next to the Switch.
// (The label is the only stable identifier the DOM gives us — the input
// itself has no name/id.)
const SWITCH_LABELS = {
  auto_hide: "Auto hide",
  show_preview: "Show preview section",
  show_search: "Show search input",
  show_variants: "Show skin-tone variants",
  sticker_mode: "Sticker mode",
  show_category_buttons: "Show category buttons",
  show_recents: "Show (and save) frequently used emojis",
};

export async function gotoAdmin(page, baseUrl) {
  const url = baseUrl.replace(/\/$/, "") + "/admin" + ADMIN_HASH;
  await page.goto(url, { waitUntil: "networkidle" });
  // Wait for the extension settings panel to render.
  await page.waitForSelector(".Flamoji--settingsContainer", {
    timeout: 15_000,
  });
  await page.waitForSelector("button.Button--primary", { timeout: 5_000 });
  await page.waitForTimeout(300);
}

// Toggle a single Flarum Switch identified by its visible label text.
// Flarum hides the underlying <input> — clicking the wrapping <label>
// flips the checkbox.
async function setSwitch(page, label, desired) {
  const handle = await page.evaluateHandle((labelText) => {
    return [...document.querySelectorAll("label.Checkbox--switch")].find(
      (l) => l.textContent?.trim() === labelText
    );
  }, label);
  const el = handle.asElement();
  if (!el) throw new Error(`Switch not found: "${label}"`);
  const current = await el.evaluate((l) => l.querySelector("input")?.checked);
  if (current !== desired) await el.click();
  await handle.dispose();
}

async function setSelectByValue(page, value) {
  // Flarum's Select wraps a native <select> inside `.Select`. Setting
  // .value programmatically and dispatching `change` mirrors what the
  // user does (the bound onchange flows through Mithril like normal).
  await page.evaluate((v) => {
    const sel = document.querySelector(".Flamoji--emojiSetting select");
    if (!sel) throw new Error("picker_set <select> not found in admin");
    sel.value = v;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function setNumberInput(page, selector, value) {
  await page.fill(selector, String(value));
  // Trigger Mithril's bidi binding by dispatching `input`+`change`.
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    el?.dispatchEvent(new Event("input", { bubbles: true }));
    el?.dispatchEvent(new Event("change", { bubbles: true }));
  }, selector);
}

async function setCategories(page, wantedList) {
  const wanted = new Set(wantedList);
  await page.evaluate(
    (wantedArr) => {
      const want = new Set(wantedArr);
      const boxes = [...document.querySelectorAll(".cat-checkbox")];
      for (const box of boxes) {
        const input = box.querySelector('input[type="checkbox"]');
        const cat = box.querySelector("label")?.getAttribute("for");
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
    },
    [...wanted]
  );
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
    document
      .querySelectorAll(".Alert .Alert-controls .Button")
      .forEach((b) => b.click());
  });

  for (const [key, label] of Object.entries(SWITCH_LABELS)) {
    if (key in overrides) await setSwitch(page, label, !!overrides[key]);
  }
  if ("picker_set" in overrides)
    await setSelectByValue(page, overrides.picker_set);
  if ("frequent_rows" in overrides) {
    // The Frequent emoji rows input only renders when show_recents is
    // ON. Caller's responsibility to ensure that — we don't toggle it
    // implicitly because that would mask a buggy admin UI.
    await setNumberInput(
      page,
      '.recentsCountGroup input[type="number"]',
      overrides.frequent_rows
    );
  }
  if ("specify_categories" in overrides)
    await setCategories(page, overrides.specify_categories);

  // Wait briefly for Mithril to redraw the Save button's disabled state.
  await page.waitForTimeout(250);
  const dirty = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /save changes/i.test(b.textContent || "")
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
      document.querySelectorAll(".Alert").forEach((a) => a.remove());
    });
    await page.click("button.Button--primary:not([disabled])", {
      timeout: 5_000,
    });
    try {
      await page.waitForFunction(
        () => {
          const btn = [...document.querySelectorAll("button")].find((b) =>
            /save changes/i.test(b.textContent || "")
          );
          return btn && btn.disabled;
        }, null,
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
      throw new Error("admin Save Changes did not complete after 2 attempts");
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
      ...document.querySelectorAll(
        ".customEmoji-list li .customEmoji:not(.addEmoji) .customEmoji-image"
      ),
    ]
      .map((img) => img.getAttribute("title"))
      .filter(Boolean)
  );
}

// Open the "Add Emoji" modal, fill it, click Save, and wait for the
// list to gain our new row. `path` accepts any URL or data URI — the
// admin UI doesn't validate it. `category` is optional (freeform).
//
// Fields are located by their visible LABEL text, not by DOM index:
// the modal re-renders on every keystroke (the modal title binds to
// the live emojiTitle stream) and index-based filling has raced with
// that re-render under load, landing values in the wrong inputs (a
// stuck modal with a "text to replace is required" validation error).
// Label matching is stable across re-renders.
export async function addCustomEmoji(
  page,
  { title, shortcode, path, category }
) {
  // Defensive: a stray open modal from a prior step would swallow the
  // "+" click and make us fill a dead modal.
  await closeStrayModal(page);

  // The list's async load puts a LoadingIndicator over the grid; if it
  // is still up, the "+" click is blocked by the overlay.
  await page
    .waitForFunction(
      () => {
        const list = document.querySelector(".customEmoji-list");
        return list && !list.querySelector(".LoadingIndicator-container");
      },
      null,
      { timeout: 15_000 }
    )
    .catch(() => {});

  await page.click(".customEmoji-addButton");
  await page.waitForSelector(".EditEmojiModal", { timeout: 10_000 });

  // Read the current value of a modal field by its label.
  const readField = (patternStr) =>
    page.evaluate((p) => {
      const rx = new RegExp(p, "i");
      const group = [...document.querySelectorAll(".EditEmojiModal .Form-group")].find(
        (g) => rx.test(g.querySelector("label")?.textContent || "")
      );
      return group?.querySelector("input.FormControl")?.value ?? null;
    }, patternStr);

  // Fill one field and verify it stuck. A Mithril redraw scheduled by a
  // previous interaction can flush AFTER the fill and reset the input
  // from its (empty) stream, silently undoing the fill. Detect that and
  // re-fill after letting the redraw flush; each attempt is therefore
  // "after settle", which is what finally makes it stick.
  const fillVerified = async (patternStr, value) => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const input = await page.evaluateHandle((p) => {
        const rx = new RegExp(p, "i");
        const group = [...document.querySelectorAll(".EditEmojiModal .Form-group")].find(
          (g) => rx.test(g.querySelector("label")?.textContent || "")
        );
        return group ? group.querySelector("input.FormControl") : null;
      }, patternStr);
      const el = input.asElement();
      if (!el) throw new Error(`EditEmojiModal field not found: /${patternStr}/`);
      await el.fill(value);
      await el.dispose();
      await page.waitForTimeout(120); // let Mithril's async redraw flush
      const held = await readField(patternStr);
      if ((held ?? "") === value) return;
      console.log(
        `  [addCustomEmoji] field /${patternStr}/ lost its value (holds ${JSON.stringify(held)}); re-filling (attempt ${attempt})`
      );
    }
    const held = await readField(patternStr);
    throw new Error(
      `EditEmojiModal fill for /${patternStr}/ did not stick after 4 attempts ` +
      `(holds ${JSON.stringify(held)}, wanted ${JSON.stringify(value)})`
    );
  };

  await fillVerified("emoji\\s*title", title);
  await fillVerified("shortcode", shortcode);
  await fillVerified("categor", category ?? "");
  await fillVerified("path|url", path);

  // Final pre-save verification: all four fields must hold their
  // intended values after a last redraw settle. Retry the fill loop
  // once if anything drifted, then fail with a precise message instead
  // of a mysterious server-side "text to replace is required" error.
  const intended = { title, shortcode, category: category ?? "", path };
  const patterns = {
    title: "emoji\\s*title",
    shortcode: "shortcode",
    category: "categor",
    path: "path|url",
  };
  for (let round = 0; round < 2; round++) {
    await page.waitForTimeout(150);
    const actual = {
      title: await readField(patterns.title),
      shortcode: await readField(patterns.shortcode),
      category: await readField(patterns.category),
      path: await readField(patterns.path),
    };
    const drifted = Object.keys(intended).filter(
      (k) => (actual[k] ?? "") !== intended[k]
    );
    if (drifted.length === 0) break;
    if (round === 0) {
      console.log(`  [addCustomEmoji] fields drifted before save: ${drifted.join(", ")}; re-filling`);
      for (const k of drifted) await fillVerified(patterns[k], intended[k]);
    } else {
      throw new Error(
        `EditEmojiModal fill verification failed before save: ` +
        `expected ${JSON.stringify(intended)}, inputs hold ${JSON.stringify(actual)} ` +
        `(Mithril redraw keeps resetting the modal).`
      );
    }
  }

  // Save click can be intercepted by a lingering overlay while the
  // page is under load — retry with a settle instead of aborting (the
  // modal still holds the filled data).
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.click(".EditEmojiModal-save", { timeout: 10_000 });
      break;
    } catch (e) {
      if (attempt === 3) throw e;
      console.log(`  [addCustomEmoji] save click stalled (attempt ${attempt}); retrying`);
      await page.waitForTimeout(1000);
    }
  }
  // Modal closes on success; list re-renders with the new row. A server
  // validation failure leaves the modal open — surface that distinctly.
  await page
    .waitForFunction(() => !document.querySelector(".EditEmojiModal"), null, {
      timeout: 15_000,
    })
    .catch(() => {
      throw new Error(
        "EditEmojiModal did not close after Save (validation error or " +
        "failed POST). Check the server response and retry the spec."
      );
    });
  await page.waitForFunction(
    (sc) =>
      [...document.querySelectorAll(".customEmoji-image")].some(
        (img) => img.getAttribute("title") === sc
      ),
    shortcode,
    { timeout: 10_000 }
  );
}

// Close a modal left open by a previous failed step, if any. Tolerant:
// no modal or a slow close simply moves on.
export async function closeStrayModal(page) {
  const had = await page.evaluate(() => !!document.querySelector(".Modal-backdrop"));
  if (!had) return;
  await page.evaluate(() => {
    document.querySelector(".Modal-close .Button")?.click();
  });
  await page
    .waitForFunction(() => !document.querySelector(".EditEmojiModal"), null, {
      timeout: 5_000,
    })
    .catch(() => {});
}

// Open the edit modal for an existing row by shortcode, accept the
// confirm dialog, click Delete, wait for the row to disappear.
// Returns false if no row matches. Retries the whole flow once if the
// delete POST stalls (the modal then stays open — seen under load when
// the delete request races other background requests).
export async function deleteCustomEmojiByShortcode(page, shortcode) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ok = await deleteCustomEmojiByShortcodeOnce(page, shortcode, attempt);
    if (ok === true) return true;
    if (ok === false) return false;
    // 'retry' — fall through and try again.
    console.log(`  [deleteCustomEmoji] attempt ${attempt} for ${shortcode} stalled; retrying`);
  }
  throw new Error(
    `deleteCustomEmojiByShortcode: delete of ${shortcode} stalled after 2 attempts`
  );
}

async function deleteCustomEmojiByShortcodeOnce(page, shortcode, attempt) {
  await closeStrayModal(page);
  const found = await page.evaluate((sc) => {
    const img = [...document.querySelectorAll(".customEmoji-image")].find(
      (i) => i.getAttribute("title") === sc
    );
    if (!img) return false;
    const li = img.closest("li");
    li?.querySelector(".customEmoji-editButton")?.click();
    return true;
  }, shortcode);
  if (!found) {
    // Row may have actually been deleted by a stalled prior attempt.
    return false;
  }

  try {
    await page.waitForSelector(".EditEmojiModal-delete", { timeout: 10_000 });
  } catch (e) {
    if (attempt < 2) return "retry";
    throw e;
  }

  // EditEmojiModal.delete() uses native window.confirm — auto-accept.
  // Register the handler before the click so we don't miss it.
  page.once("dialog", (d) => d.accept());
  await page.click(".EditEmojiModal-delete");

  try {
    await page.waitForFunction(
      () => !document.querySelector(".EditEmojiModal"),
      null,
      { timeout: 15_000 }
    );
    await page.waitForFunction(
      (sc) =>
        ![...document.querySelectorAll(".customEmoji-image")].some(
          (i) => i.getAttribute("title") === sc
        ),
      shortcode,
      { timeout: 10_000 }
    );
  } catch (e) {
    if (attempt < 2) return "retry";
    throw e;
  }
  return true;
}

// Delete every custom emoji in the admin list. Runs in passes: delete
// what the DOM shows, then re-navigate (a stalled-but-successful delete
// leaves the DOM stale, so each pass re-renders from the server) until
// the list is empty. Throws if the same row set survives two consecutive
// passes, or if the list never renders, so specs fail here with a clear
// message instead of producing confusing downstream mismatches.
export async function deleteAllCustomEmojis(page, baseUrl) {
  const seenPasses = new Set();
  for (let pass = 0; pass < 5; pass++) {
    await gotoAdmin(page, baseUrl);
    // A crashed render (e.g. the __proto__ grouping bug) leaves the
    // list frozen on its initial LoadingIndicator forever — the DOM
    // then reports zero rows even though the DB is non-empty, and a
    // silent "success" here would strand debris that poisons every
    // later spec. Treat a spinner that never clears as a crash.
    await page
      .waitForFunction(
        () => {
          const list = document.querySelector(".customEmoji-list");
          return list && !list.querySelector(".LoadingIndicator-container");
        },
        null,
        { timeout: 10_000 }
      )
      .catch(() => {
        throw new Error(
          "deleteAllCustomEmojis: the custom-emoji list never finished " +
          "rendering (frozen LoadingIndicator — likely a JS render crash)."
        );
      });
    const shortcodes = await listCustomEmojiShortcodes(page);
    if (shortcodes.length === 0) return;
    const key = shortcodes.slice().sort().join("|");
    if (seenPasses.has(key)) {
      throw new Error(
        `deleteAllCustomEmojis: rows survived a full delete pass: ` +
        `${JSON.stringify(shortcodes)}`
      );
    }
    seenPasses.add(key);
    for (const sc of shortcodes) {
      await deleteCustomEmojiByShortcode(page, sc);
    }
  }
  throw new Error(
    "deleteAllCustomEmojis: list still non-empty after 5 delete passes"
  );
}
