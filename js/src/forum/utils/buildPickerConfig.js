/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

import app from 'flarum/common/app';
import getEmojiCategories from '../../common/utils/getEmojiCategories';
import urlChecker from '../../common/utils/urlChecker';
import buildEmojiTranslations from './emojiTranslations';

// emoji-mart's twitter.json `x`/`y` percentages assume a specific sprite-
// sheet grid size. @emoji-mart/data v1.2.1 was built against
// emoji-datasource v15.0.1 (61×61 grid). The matching twitter sprite is
// emoji-datasource-twitter@15.0.1. Bumping @emoji-mart/data later means
// re-pinning this URL to the corresponding emoji-datasource-twitter
// release — verify by checking that the sprite's tile count matches
// `data.sheet.cols`/`data.sheet.rows`.
const TWEMOJI_SPRITESHEET_URL = 'https://cdn.jsdelivr.net/npm/emoji-datasource-twitter@15.0.1/img/twitter/sheets-256/64.png';

// "Sticker mode" grid (admin toggle, flamoji.sticker_mode). 64px glyph in an
// 80px tile; `dynamicWidth` lets emoji-mart compute perLine from the popup's
// CSS width (set responsively in less/forum.less) rather than a fixed column
// count, so the grid adapts to the viewport / mobile. See the emoji-mart
// "Dynamic width" example: dynamicWidth + a CSS width on em-emoji-picker.
const STICKER_GRID = { emojiSize: 64, emojiButtonSize: 80, dynamicWidth: true };

/**
 * Build everything needed to construct the emoji-mart Picker for the current
 * forum settings + custom-emoji set — but stop short of `new Picker()` so the
 * caller can inject the instance-bound `onEmojiSelect` / `onClickOutside`
 * handlers (which close over the editor). Pure aside from seeding the empty
 * "frequently used" localStorage index, which is deliberate setup.
 *
 * @param {object} emojiMartModule The dynamically imported `emoji-mart` module.
 * @param {object} dataModule      The imported emoji dataset (twitter.json).
 * @param {Array}  response        The custom-emoji records from /flamojis/all.
 * @returns {{
 *   Picker: Function,
 *   options: object,               // Picker options WITHOUT event handlers
 *   customEmojiReplacers: object,  // custom-emoji id -> shortcode to insert
 *   effectiveStickerMode: boolean,
 *   autoHide: boolean,
 * }}
 */
export default function buildPickerConfig(emojiMartModule, dataModule, response) {
  const baseUrl = app.forum.attribute('baseUrl');
  const { Picker } = emojiMartModule;
  const data = dataModule.default || dataModule;

  let specifiedCategories = JSON.parse(app.forum.attribute('flamoji.specify_categories'));
  const sortingArr = getEmojiCategories();
  // Order of `categories` in the picker prop drives nav-tab order.
  specifiedCategories.sort((a, b) => sortingArr.indexOf(a) - sortingArr.indexOf(b));

  // Build a lookup keyed by the id we set on each custom emoji entry, so the
  // onEmojiSelect handler can find the configured replacement text without
  // round-tripping through paths or URLs.
  const customEmojiReplacers = {};
  const customEmojis = [];

  // emoji-mart's `custom` prop is an array of categories, each rendered as its
  // own nav tab. Group the flat custom-emoji list by its freeform `category`
  // name (whitespace-trimmed, exact match); emoji with no category fall into
  // the default "Custom" group. Opaque ids are assigned after sorting (see
  // below) so the freeform category text is never turned into a DOM/category id.
  const CUSTOM_LABEL = app.translator.trans('pianotell-flamoji.forum.emoji-mart.categories.custom', {}, true);
  const customGroups = new Map(); // trimmed category name ('' = uncategorized) -> group

  response.forEach((customEmoji) => {
    const path = customEmoji['path'];
    const title = customEmoji['title'];
    const replacer = customEmoji['text_to_replace'];
    const category = (customEmoji['category'] || '').trim();
    const src = urlChecker(path) ? path : baseUrl + path;

    // emoji-mart uses an emoji's `id` as its shortcode and renders `:<id>:` as
    // the preview subtitle, so use the configured shortcode (sans the
    // surrounding colons) as the id. text_to_replace is unique — enforced
    // server-side and required by the text formatter — so these ids are unique
    // too. (Fall back to a path-based id for the degenerate case of a
    // colons-only shortcode that strips to nothing.)
    const stripped = replacer.replace(/^:|:$/g, '');
    const id = stripped || 'flamoji-' + path;

    // emoji-mart's SearchIndex tokenizes name + each keyword and does prefix
    // matching per token. Build a comprehensive keyword set from both the
    // title and the shortcode so users can find the emoji by typing any word
    // in either, regardless of separator (space, dash, underscore) or
    // surrounding colons.
    const keywords = new Set();
    [title, stripped].forEach((kwSrc) => {
      if (!kwSrc) return;
      keywords.add(kwSrc.toLowerCase());
      kwSrc
        .toLowerCase()
        .split(/[\s\-_]+/)
        .filter(Boolean)
        .forEach((tok) => keywords.add(tok));
    });

    customEmojiReplacers[id] = replacer;

    if (!customGroups.has(category)) {
      customGroups.set(category, {
        name: category || CUSTOM_LABEL,
        // emoji-mart marks every custom category after the first that lacks an
        // `icon` as a `target` and drops it from the nav bar. Give each group
        // its first emoji's image as the icon so every category renders as its
        // own selectable, distinguishable tab.
        icon: { src },
        emojis: [],
      });
    }
    customGroups.get(category).emojis.push({
      id,
      name: title,
      keywords: Array.from(keywords),
      skins: [{ src }],
    });
  });

  if (customGroups.size) {
    // Order tabs deterministically: named categories alphabetically, with the
    // uncategorized "Custom" group last (insertion order would otherwise be
    // arbitrary from the admin's perspective).
    const groups = Array.from(customGroups.entries()).sort(([a], [b]) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b);
    });

    groups.forEach(([name, group], i) => {
      // Assign an opaque id here rather than deriving one from the freeform
      // category text: the uncategorized group keeps the bare id, named groups
      // get an index suffix. All share the `flamoji_custom` prefix that the
      // sticker-mode filter relies on, and none can collide with a built-in
      // emoji-mart category id.
      group.id = name === '' ? 'flamoji_custom' : 'flamoji_custom_' + i;
      customEmojis.push(group);

      // emoji-mart's `categories` prop is an explicit allow-list; a custom
      // group whose id isn't listed is silently hidden. These ids are freshly
      // generated, so just append them.
      specifiedCategories.push(group.id);
    });
  }

  const autoHide = !!app.forum.attribute('flamoji.auto_hide');
  const showRecents = !!app.forum.attribute('flamoji.show_recents');
  const showPreview = !!app.forum.attribute('flamoji.show_preview');
  const showSearch = !!app.forum.attribute('flamoji.show_search');
  const showVariants = !!app.forum.attribute('flamoji.show_variants');
  const showCategoryButtons = !!app.forum.attribute('flamoji.show_category_buttons');
  const stickerMode = !!app.forum.attribute('flamoji.sticker_mode');
  // Sticker mode only enlarges custom emoji, so on a forum with no custom
  // emoji it would just leave a sticker-sized grid of normal unicode emoji.
  // Gate the entire behaviour (category filter, enlarged grid, responsive
  // popup) on having at least one custom group.
  const effectiveStickerMode = stickerMode && customGroups.size > 0;

  // emoji-mart's `categories` prop is an explicit allow-list. When showRecents
  // is enabled, we still need 'frequent' on the list or the Frequently Used
  // category is silently filtered out — even though maxFrequentRows > 0 would
  // otherwise enable it. Prepend so it appears first as emoji-mart expects.
  if (showRecents && specifiedCategories.indexOf('frequent') === -1) {
    specifiedCategories.unshift('frequent');
  }

  // Sticker mode only enlarges custom emoji (the unicode set keeps its default
  // size, since those render as fonts/sprites, not <img>). So when it's on,
  // restrict the picker to the custom categories only — the built-in unicode
  // tabs would otherwise sit at normal size amongst the stickers and just add
  // noise. The Frequently Used tab is exempt: it stays driven by show_recents
  // exactly like normal mode, so users keep quick access to their most-used
  // stickers.
  if (effectiveStickerMode) {
    specifiedCategories = specifiedCategories.filter((id) => id === 'frequent' || id.indexOf('flamoji_custom') === 0);
  }

  // Match the picker's emoji rendering to what posts will actually display:
  // the core flarum/emoji extension rewrites unicode to Twemoji <img>; without
  // it, posts render OS-native glyphs. The `picker_set` admin setting can force
  // one or the other; default `auto` follows whatever the core extension is
  // doing.
  const pickerSet = app.forum.attribute('flamoji.picker_set') || 'auto';
  const hasEmojiExt = !!app.forum.attribute('flamoji.has_emoji_extension');
  const useTwemoji = pickerSet === 'twemoji' || (pickerSet === 'auto' && hasEmojiExt);

  // emoji-mart stores a per-browser Frequently Used index in localStorage
  // ('emoji-mart.frequently'); when it's ABSENT it falls back to a hardcoded
  // list of popular *unicode* defaults. Seed an empty index so those defaults
  // never appear: Frequently Used should reflect the user's own picks (the
  // standard picker convention), and the generic defaults are often emoji this
  // picker can't even show (custom-only/sticker mode, deselected categories).
  // The tab simply appears once the user picks their first emoji; real picks
  // overwrite this seed normally.
  if (showRecents) {
    const FREQUENTLY_KEY = 'emoji-mart.frequently';
    if (window.localStorage.getItem(FREQUENTLY_KEY) == null) {
      window.localStorage.setItem(FREQUENTLY_KEY, JSON.stringify({}));
    }
  }

  const options = {
    data,
    custom: customEmojis,
    categories: specifiedCategories,
    i18n: buildEmojiTranslations(),
    // 'auto' tracks the user's OS color-scheme preference. Better than
    // hardcoding 'light' on forums with dark themes — the picker would
    // otherwise pop up bright-white against dark chrome.
    theme: 'auto',
    autoFocus: false,
    set: useTwemoji ? 'twitter' : 'native',
    ...(useTwemoji ? { getSpritesheetURL: () => TWEMOJI_SPRITESHEET_URL } : {}),
    // Tile sizing. Default (perLine 9 / emojiSize 24 / emojiButtonSize 36) is
    // emoji-mart's own. When sticker mode is on we enlarge the grid (see
    // STICKER_GRID); note that larger emojiButtonSize can trip a WebKit
    // sub-pixel IntersectionObserver bug in emoji-mart's NavBar that
    // mis-highlights a category on click — acceptable for the opt-in sticker
    // mode.
    ...(effectiveStickerMode ? STICKER_GRID : {}),
    previewPosition: showPreview ? 'bottom' : 'none',
    searchPosition: showSearch ? 'sticky' : 'none',
    // Custom emoji have a single image (no skin-tone variants), so the
    // skin-tone selector is non-functional in sticker mode (which shows only
    // custom emoji). Suppress it there regardless of the setting.
    skinTonePosition: showVariants && !effectiveStickerMode ? 'preview' : 'none',
    navPosition: showCategoryButtons ? 'top' : 'none',
    maxFrequentRows: showRecents ? parseInt(app.forum.attribute('flamoji.frequent_rows'), 10) || 4 : 0,
  };

  return { Picker, options, customEmojiReplacers, effectiveStickerMode, autoHide };
}
