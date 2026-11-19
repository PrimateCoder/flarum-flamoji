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

export const DISABLED_PREF_KEY = 'flamojiDisabledCategories';
export const ORDER_PREF_KEY = 'flamojiCategoryOrder';
export const BUILTIN_PREFIX = 'builtin:';
export const CUSTOM_PREFIX = 'custom:';
export const FREQUENT_CATEGORY_ID = 'frequent';

// emoji-mart's preview renders one of a few built-in default emoji depending on
// state: "point_up" (bottom idle), "point_down" (top idle), and "cry" (no
// search results). Seed all three as native glyphs so the preview is never
// blank in sticker mode without pulling in the 460KB dataset.
export const STICKER_SKELETON = {
  categories: [],
  emojis: {
    point_up: { id: 'point_up', name: 'Index Pointing Up', skins: [{ native: '☝️' }] },
    point_down: { id: 'point_down', name: 'Backhand Index Pointing Down', skins: [{ native: '👇' }] },
    cry: { id: 'cry', name: 'Crying Face', skins: [{ native: '😢' }] },
  },
  aliases: {},
  sheet: { cols: 1, rows: 1 },
};

let webpackVersioned = false;

export function toBuiltinToken(id) {
  return BUILTIN_PREFIX + id;
}

export function toCustomToken(categoryKey) {
  return CUSTOM_PREFIX + categoryKey;
}

/**
 * Read a string-array user preference, trimmed and deduplicated.
 */
function readStringListPreference(key, user = app.session && app.session.user) {
  const prefs = user && typeof user.preferences === 'function' ? user.preferences() : null;
  const raw = prefs && prefs[key];
  if (!Array.isArray(raw)) return [];

  return Array.from(new Set(raw.filter((c) => typeof c === 'string').map((c) => c.trim())));
}

/**
 * Return the current user's disabled category entries (tokens or legacy bare custom keys).
 */
export function getDisabledCategories(user = app.session && app.session.user) {
  return readStringListPreference(DISABLED_PREF_KEY, user);
}

/**
 * Return the current user's custom category order token list.
 */
export function getCategoryOrder(user = app.session && app.session.user) {
  return readStringListPreference(ORDER_PREF_KEY, user);
}

/**
 * Cache-buster key representing the user's current category visibility and order.
 */
export function getPreferencesSignature(user = app.session && app.session.user) {
  return JSON.stringify({
    d: getDisabledCategories(user),
    o: getCategoryOrder(user),
  });
}

export function isBuiltinDisabled(id, disabledSet) {
  return disabledSet.has(toBuiltinToken(id));
}

export function isCustomDisabled(categoryKey, disabledSet) {
  return disabledSet.has(toCustomToken(categoryKey)) || disabledSet.has(categoryKey);
}

/**
 * Normalize the `/flamojis/all` response (numeric-keyed object or array) into an array.
 */
export function extractEmojiArray(response) {
  if (Array.isArray(response)) return response;
  if (!response || typeof response !== 'object') return [];

  return Object.keys(response)
    .filter((k) => !isNaN(k))
    .map((k) => response[k]);
}

/**
 * Return the admin-enabled built-in Unicode emoji category IDs in default order.
 */
export function getAdminBuiltinCategories() {
  const sortingArr = getEmojiCategories();
  let specifiedCategories = [];

  try {
    const parsed = JSON.parse(app.forum.attribute('flamoji.specify_categories') || '[]');
    if (Array.isArray(parsed)) {
      specifiedCategories = parsed.filter((c) => sortingArr.includes(c));
    }
  } catch (e) {
    specifiedCategories = [];
  }

  specifiedCategories.sort((a, b) => sortingArr.indexOf(a) - sortingArr.indexOf(b));
  return specifiedCategories;
}

/**
 * Group custom emoji records by trimmed category name, sorted alphabetically
 * with the uncategorized (`""`) group placed last, and assign deterministic
 * emoji-mart category IDs (`flamoji_custom` or `flamoji_custom_<idx>`).
 */
export function groupCustomEmojis(response) {
  const baseUrl = app.forum.attribute('baseUrl');
  const CUSTOM_LABEL = app.translator.trans('pianotell-flamoji.forum.emoji-mart.categories.custom', {}, true);
  const customGroups = new Map();

  extractEmojiArray(response).forEach((customEmoji) => {
    if (!customEmoji) return;
    const path = customEmoji['path'];
    const title = customEmoji['title'];
    const replacer = customEmoji['text_to_replace'];
    const category = (customEmoji['category'] || '').trim();
    const src = urlChecker(path) ? path : baseUrl + path;

    const stripped = (replacer || '').replace(/^:|:$/g, '');
    const id = stripped || 'flamoji-' + path;

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

    if (!customGroups.has(category)) {
      customGroups.set(category, {
        key: category,
        name: category || CUSTOM_LABEL,
        icon: { src },
        emojis: [],
      });
    }

    customGroups.get(category).emojis.push({
      id,
      title,
      replacer,
      keywords: Array.from(keywords),
      src,
    });
  });

  return Array.from(customGroups.entries())
    .sort(([a], [b]) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b);
    })
    .map(([key, group], i) => ({
      ...group,
      groupId: key === '' ? 'flamoji_custom' : 'flamoji_custom_' + i,
    }));
}

/**
 * Sort an array of tokens using the user's saved order list.
 * Tokens present in `orderList` appear first in `orderList` order; any newer
 * tokens not yet in `orderList` preserve their relative default order after.
 */
export function sortTokensByUserOrder(tokens, orderList) {
  if (!orderList || !orderList.length) return tokens.slice();

  const orderIndex = new Map();
  orderList.forEach((token, idx) => {
    if (!orderIndex.has(token)) orderIndex.set(token, idx);
  });

  return tokens
    .map((token, defaultIdx) => ({
      token,
      defaultIdx,
      userIdx: orderIndex.has(token) ? orderIndex.get(token) : Infinity,
    }))
    .sort((a, b) => {
      if (a.userIdx !== b.userIdx) return a.userIdx - b.userIdx;
      return a.defaultIdx - b.defaultIdx;
    })
    .map((entry) => entry.token);
}

/**
 * Build the complete ordered list of manageable categories (Frequently Used,
 * standard Unicode categories, and custom packs) for the Flamoji user settings page.
 */
export function buildOrderedCategoryItems(response, user = app.session && app.session.user, orderOverride = null) {
  const disabledSet = new Set(getDisabledCategories(user));
  const orderList = Array.isArray(orderOverride) ? orderOverride : getCategoryOrder(user);
  const customGroups = groupCustomEmojis(response);
  const showRecents = !!app.forum.attribute('flamoji.show_recents');
  const effectiveStickerMode = !!app.forum.attribute('flamoji.sticker_mode') && customGroups.length > 0;
  const categoryLabels = buildEmojiTranslations().categories;

  const itemsByToken = new Map();

  if (showRecents) {
    const token = toBuiltinToken(FREQUENT_CATEGORY_ID);
    itemsByToken.set(token, {
      token,
      type: 'builtin',
      key: FREQUENT_CATEGORY_ID,
      name: categoryLabels[FREQUENT_CATEGORY_ID] || FREQUENT_CATEGORY_ID,
      emojis: [],
      enabled: !isBuiltinDisabled(FREQUENT_CATEGORY_ID, disabledSet),
    });
  }

  if (!effectiveStickerMode) {
    getAdminBuiltinCategories().forEach((id) => {
      const token = toBuiltinToken(id);
      itemsByToken.set(token, {
        token,
        type: 'builtin',
        key: id,
        name: categoryLabels[id] || id,
        emojis: [],
        enabled: !isBuiltinDisabled(id, disabledSet),
      });
    });
  }

  customGroups.forEach((group) => {
    const token = toCustomToken(group.key);
    itemsByToken.set(token, {
      token,
      type: 'custom',
      key: group.key,
      groupId: group.groupId,
      name: group.name,
      icon: group.icon,
      emojis: group.emojis,
      enabled: !isCustomDisabled(group.key, disabledSet),
    });
  });

  const sortedTokens = sortTokensByUserOrder(Array.from(itemsByToken.keys()), orderList);
  return sortedTokens.map((token) => itemsByToken.get(token));
}

/**
 * Extract rendered category <svg> geometry from an emoji-mart picker's Shadow DOM
 * nav bar, keyed by category ID (`frequent`, `people`, `nature`, ...).
 */
export function extractNavCategorySvgs(pickerEl, targetMap) {
  const sr = pickerEl && pickerEl.shadowRoot;
  if (!sr) return false;

  const buttons = sr.querySelectorAll('nav button[aria-label]');
  if (!buttons.length) return false;

  const categoryLabels = buildEmojiTranslations().categories;
  const idByLabel = new Map();
  [FREQUENT_CATEGORY_ID, ...getEmojiCategories()].forEach((id) => {
    if (categoryLabels[id]) idByLabel.set(categoryLabels[id], id);
  });

  let added = false;
  buttons.forEach((btn) => {
    const label = btn.getAttribute('aria-label');
    const id = idByLabel.get(label);
    if (!id || targetMap.has(id)) return;

    const svg = btn.querySelector('svg');
    if (!svg) return;

    const children = [];
    Array.from(svg.children).forEach((child) => {
      const tag = child.tagName ? child.tagName.toLowerCase() : '';
      if (!tag) return;
      const attrs = {};
      Array.from(child.attributes).forEach((attr) => {
        attrs[attr.name] = attr.value;
      });
      children.push({ tag, attrs });
    });

    targetMap.set(id, {
      viewBox: svg.getAttribute('viewBox') || '0 0 24 24',
      children,
    });
    added = true;
  });

  return added;
}

/**
 * Point __webpack_public_path__ at our extension's published dist directory and
 * append forum.js's cache-busting revision hash to lazy chunk URLs.
 */
export function ensureWebpackAssetConfig() {
  const baseUrl = (app.forum.attribute('baseUrl') || '').replace(/\/+$/, '');
  __webpack_public_path__ = baseUrl + '/assets/extensions/pianotell-flamoji/dist/';

  if (webpackVersioned) return;
  const scripts = document.querySelectorAll('script[src*="forum.js"]');
  for (const s of scripts) {
    const match = s.src.match(/[?&]v=([a-f0-9]+)/);
    if (match) {
      const ver = match[1];
      const origU = __webpack_require__.u;
      __webpack_require__.u = (id) => origU(id) + '?v=' + ver;
      break;
    }
  }
  webpackVersioned = true;
}

/**
 * Load the emoji-mart module (via CDN with SRI + fallback, or local chunk).
 */
export function loadEmojiMartModule() {
  const useCdn = app.forum.attribute('flamoji.use_cdn');
  const cdnJsUrl = app.forum.attribute('flamoji.cdn_js_url');
  const importLocalJs = () => import(/* webpackChunkName: "emoji-mart" */ 'emoji-mart');

  if (useCdn && cdnJsUrl) {
    const cdnJsSri = app.forum.attribute('flamoji.cdn_js_sri');
    return new Promise((resolve, reject) => {
      if (window.EmojiMart) return resolve(window.EmojiMart);
      const script = document.createElement('script');
      script.src = cdnJsUrl;
      if (cdnJsSri) {
        script.integrity = cdnJsSri;
        script.crossOrigin = 'anonymous';
      }
      script.onload = () =>
        window.EmojiMart ? resolve(window.EmojiMart) : reject(new Error('emoji-mart CDN script loaded but window.EmojiMart is undefined'));
      script.onerror = reject;
      document.head.appendChild(script);
    }).catch((err) => {
      console.warn('[pianotell-flamoji] emoji-mart CDN load failed; falling back to local bundle:', err);
      return importLocalJs();
    });
  }

  return importLocalJs();
}

/**
 * Load the emoji dataset JSON (via CDN with SRI + fallback, or local chunk).
 */
export function loadUnicodeDataset() {
  const useCdn = app.forum.attribute('flamoji.use_cdn');
  const cdnDataUrl = app.forum.attribute('flamoji.cdn_data_url');
  const importLocalData = () => import(/* webpackChunkName: "emoji-mart-data" */ '@emoji-mart/data/sets/15/twitter.json');

  if (useCdn && cdnDataUrl) {
    const cdnDataSri = app.forum.attribute('flamoji.cdn_data_sri');
    const opts = cdnDataSri ? { integrity: cdnDataSri } : {};
    return fetch(cdnDataUrl, opts)
      .then((res) => {
        if (!res.ok) throw new Error('emoji-mart data CDN responded ' + res.status);
        return res.json();
      })
      .catch((err) => {
        console.warn('[pianotell-flamoji] emoji-mart data CDN load failed; falling back to local bundle:', err);
        return importLocalData();
      });
  }

  return importLocalData();
}

/**
 * Lazy-load SortableJS so it only ships when /settings/flamoji is visited.
 */
export function loadSortableModule() {
  return import(/* webpackChunkName: "sortablejs" */ 'sortablejs').then((mod) => mod.default || mod);
}
