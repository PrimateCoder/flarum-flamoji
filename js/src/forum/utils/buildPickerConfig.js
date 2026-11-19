/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

import app from 'flarum/common/app';
import buildEmojiTranslations from './emojiTranslations';
import {
  BUILTIN_PREFIX,
  CUSTOM_PREFIX,
  FREQUENT_CATEGORY_ID,
  getAdminBuiltinCategories,
  getCategoryOrder,
  getDisabledCategories,
  groupCustomEmojis,
  isBuiltinDisabled,
  isCustomDisabled,
  sortTokensByUserOrder,
  toBuiltinToken,
  toCustomToken,
} from './customEmojiCategories';

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
 * caller can inject instance-bound handlers (`onEmojiSelect`, `onClickOutside`).
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
  const { Picker } = emojiMartModule;
  const data = dataModule.default || dataModule;

  const customGroups = groupCustomEmojis(response);
  const disabledSet = new Set(getDisabledCategories());
  const orderList = getCategoryOrder();

  // Build lookup keyed by the id we set on each enabled custom emoji entry, so
  // onEmojiSelect can find the configured replacement shortcode without
  // round-tripping through paths or URLs.
  //
  // We register ALL custom groups on `options.custom` (and control visibility +
  // ordering via `options.categories`) because emoji-mart populates its global
  // `Data.originalCategories` singleton only on the first `init()` call; omitting
  // a disabled custom group here would make it unreachable if re-enabled in the
  // same SPA session (e.g. via the live preview on /settings/flamoji).
  const customEmojiReplacers = {};
  const customEmojis = [];
  const customGroupIdByKey = new Map();

  customGroups.forEach((group) => {
    const disabled = isCustomDisabled(group.key, disabledSet);
    customGroupIdByKey.set(group.key, group.groupId);

    if (!disabled) {
      group.emojis.forEach((emoji) => {
        customEmojiReplacers[emoji.id] = emoji.replacer;
      });
    }

    customEmojis.push({
      id: group.groupId,
      name: group.name,
      icon: group.icon,
      emojis: group.emojis.map((emoji) => ({
        id: emoji.id,
        name: emoji.title,
        keywords: emoji.keywords,
        skins: [{ src: emoji.src }],
      })),
    });
  });

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
  const effectiveStickerMode = stickerMode && customGroups.length > 0;

  // Assemble enabled tokens in default order (Frequently Used first, then
  // standard categories, then custom packs), and apply the user's preferred
  // category order.
  const defaultTokens = [];
  if (showRecents && !isBuiltinDisabled(FREQUENT_CATEGORY_ID, disabledSet)) {
    defaultTokens.push(toBuiltinToken(FREQUENT_CATEGORY_ID));
  }
  if (!effectiveStickerMode) {
    getAdminBuiltinCategories().forEach((cat) => {
      if (!isBuiltinDisabled(cat, disabledSet)) {
        defaultTokens.push(toBuiltinToken(cat));
      }
    });
  }
  customGroups.forEach((group) => {
    if (!isCustomDisabled(group.key, disabledSet)) {
      defaultTokens.push(toCustomToken(group.key));
    }
  });

  const orderedTokens = sortTokensByUserOrder(defaultTokens, orderList);
  const specifiedCategories = orderedTokens
    .map((token) => {
      if (token.startsWith(BUILTIN_PREFIX)) return token.slice(BUILTIN_PREFIX.length);
      if (token.startsWith(CUSTOM_PREFIX)) return customGroupIdByKey.get(token.slice(CUSTOM_PREFIX.length));
      return null;
    })
    .filter(Boolean);

  const frequentEnabled = specifiedCategories.includes(FREQUENT_CATEGORY_ID);

  // emoji-mart stores a per-browser Frequently Used index in localStorage
  // ('emoji-mart.frequently'); when it's ABSENT it falls back to a hardcoded
  // list of popular *unicode* defaults. Seed an empty index so those defaults
  // never appear.
  let hasFrequentItems = false;
  if (showRecents) {
    const FREQUENTLY_KEY = 'emoji-mart.frequently';
    if (window.localStorage.getItem(FREQUENTLY_KEY) == null) {
      window.localStorage.setItem(FREQUENTLY_KEY, JSON.stringify({}));
    }
    try {
      const stored = JSON.parse(window.localStorage.getItem(FREQUENTLY_KEY) || '{}');
      hasFrequentItems = !!(stored && typeof stored === 'object' && Object.keys(stored).length > 0);
    } catch (e) {
      hasFrequentItems = false;
    }
  }

  // Guard against empty `Nav`: emoji-mart splices out `frequent` when it has
  // zero items, and its `Nav` throws on `this.categories[0].id` if zero
  // categories remain.
  const hasVisibleCategories = specifiedCategories.some((id) => id !== FREQUENT_CATEGORY_ID || hasFrequentItems);

  const maxFrequentRows = frequentEnabled ? parseInt(app.forum.attribute('flamoji.frequent_rows'), 10) || 4 : 0;

  // Match the picker's emoji rendering to what posts will actually display:
  // the core flarum/emoji extension rewrites unicode to Twemoji <img>; without
  // it, posts render OS-native glyphs. The `picker_set` admin setting can force
  // one or the other; default `auto` follows whatever the core extension is
  // doing.
  const pickerSet = app.forum.attribute('flamoji.picker_set') || 'auto';
  const hasEmojiExt = !!app.forum.attribute('flamoji.has_emoji_extension');
  const useTwemoji = pickerSet === 'twemoji' || (pickerSet === 'auto' && hasEmojiExt);

  const options = {
    data,
    custom: customEmojis,
    categories: specifiedCategories,
    i18n: buildEmojiTranslations(),
    theme: 'auto',
    autoFocus: false,
    set: effectiveStickerMode ? 'native' : useTwemoji ? 'twitter' : 'native',
    ...(useTwemoji && !effectiveStickerMode ? { getSpritesheetURL: () => TWEMOJI_SPRITESHEET_URL } : {}),
    ...(effectiveStickerMode ? STICKER_GRID : {}),
    previewPosition: showPreview ? 'bottom' : 'none',
    searchPosition: showSearch ? 'sticky' : 'none',
    skinTonePosition: showVariants && !effectiveStickerMode ? 'preview' : 'none',
    navPosition: hasVisibleCategories && showCategoryButtons ? 'top' : 'none',
    maxFrequentRows,
  };

  return { Picker, options, customEmojiReplacers, effectiveStickerMode, autoHide };
}
