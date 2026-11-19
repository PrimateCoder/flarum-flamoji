/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

import app from 'flarum/common/app';

const FETCH_TIMEOUT_MS = 4000;
export const DEFAULT_LOCALIZED_SEARCH_URL = 'https://cdn.jsdelivr.net/npm/emojibase-data@15.3.2/{locale}/compact.json';

// Non-English locales published by emojibase-data@15.3.2 (used only for the
// pinned default URL to avoid guaranteed 404 requests on unsupported locales).
const DEFAULT_SUPPORTED_LOCALES = new Set([
  'bn',
  'da',
  'de',
  'es',
  'es-mx',
  'et',
  'fi',
  'fr',
  'hi',
  'hu',
  'it',
  'ja',
  'ko',
  'lt',
  'ms',
  'nb',
  'nl',
  'pl',
  'pt',
  'ru',
  'sv',
  'th',
  'uk',
  'vi',
  'zh',
  'zh-hant',
]);

const LOCALE_ALIASES = {
  no: 'nb',
  nn: 'nb',
  'zh-cn': 'zh',
  'zh-hans': 'zh',
  'zh-sg': 'zh',
  'zh-hk': 'zh-hant',
  'zh-mo': 'zh-hant',
  'zh-tw': 'zh-hant',
};

const annotationCache = new Map();

export function getActiveLocale() {
  return (
    (app.translator && typeof app.translator.getLocale === 'function' && app.translator.getLocale()) ||
    (app.translator && app.translator.locale) ||
    (app.data && app.data.locale) ||
    (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang) ||
    ''
  );
}

/**
 * Map Flarum's active locale code to an emojibase-data locale, or return null
 * when English (already built into @emoji-mart/data) or unsupported by the
 * pinned default emojibase-data@15.3.2 release. Custom URL templates bypass
 * the fixed allowlist so admins can point at newer releases or custom files.
 */
export function resolveEmojibaseLocale(rawLocale, urlTemplate = DEFAULT_LOCALIZED_SEARCH_URL) {
  const normalized = String(rawLocale || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');

  if (!normalized || normalized === 'en' || normalized.startsWith('en-')) {
    return null;
  }

  const mapped = LOCALE_ALIASES[normalized] || normalized;

  if (urlTemplate !== DEFAULT_LOCALIZED_SEARCH_URL) {
    return mapped;
  }

  if (DEFAULT_SUPPORTED_LOCALES.has(mapped)) {
    return mapped;
  }

  const primary = mapped.split('-')[0];
  if (primary && primary !== 'en' && DEFAULT_SUPPORTED_LOCALES.has(primary)) {
    return primary;
  }

  return null;
}

export function getLocalizedSearchUrlTemplate() {
  const configured = app.forum && app.forum.attribute('flamoji.localized_search_url');
  if (configured === undefined || configured === null) {
    return DEFAULT_LOCALIZED_SEARCH_URL;
  }
  return String(configured).trim();
}

/**
 * Fetch and session-cache compact CLDR annotations for a non-English locale.
 * Never rejects: CDN failures degrade silently to English-only search.
 */
export function loadLocalizedAnnotations(locale, urlTemplate = getLocalizedSearchUrlTemplate()) {
  if (!locale || !urlTemplate) return Promise.resolve(null);

  const url = urlTemplate.includes('{locale}') ? urlTemplate.replace(/\{locale\}/g, encodeURIComponent(locale)) : urlTemplate;
  if (annotationCache.has(url)) return annotationCache.get(url);

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;

  const request = fetch(url, controller ? { signal: controller.signal } : {})
    .then((res) => {
      if (!res.ok) throw new Error(`emojibase-data responded ${res.status}`);
      return res.json();
    })
    .then((data) => (Array.isArray(data) ? data : null))
    .catch((err) => {
      console.warn(`[pianotell-flamoji] failed to load localized emoji search data (${locale}); falling back to English:`, err);
      return null;
    })
    .finally(() => {
      if (timer) clearTimeout(timer);
    });

  annotationCache.set(url, request);
  return request;
}

function addTokens(set, text) {
  if (!text || typeof text !== 'string') return;
  const normalized = text.trim().toLowerCase();
  if (!normalized) return;

  set.add(normalized);
  normalized
    .split(/[\s\-_,/()]+/)
    .filter(Boolean)
    .forEach((token) => set.add(token));
}

/**
 * Return a shallow copy of emoji-mart's dataset with localized CLDR labels and
 * tags appended to each emoji's search keywords (preserving English terms).
 */
export function mergeLocalizedKeywords(baseData, annotations) {
  if (!baseData || !baseData.emojis || !Array.isArray(annotations) || annotations.length === 0) {
    return baseData;
  }

  const byHex = new Map();
  const byStrippedHex = new Map();

  annotations.forEach((entry) => {
    if (!entry || !entry.hexcode) return;
    const hex = String(entry.hexcode).toLowerCase();
    byHex.set(hex, entry);

    const stripped = hex.replace(/-fe0f\b/g, '');
    if (!byStrippedHex.has(stripped)) {
      byStrippedHex.set(stripped, entry);
    }
  });

  const emojis = {};
  Object.keys(baseData.emojis).forEach((id) => {
    const emoji = baseData.emojis[id];
    const unified = emoji && emoji.skins && emoji.skins[0] && emoji.skins[0].unified;
    if (!unified) {
      emojis[id] = emoji;
      return;
    }

    const hex = String(unified).toLowerCase();
    const annotation = byHex.get(hex) || byStrippedHex.get(hex.replace(/-fe0f\b/g, ''));
    if (!annotation) {
      emojis[id] = emoji;
      return;
    }

    const keywords = new Set(Array.isArray(emoji.keywords) ? emoji.keywords : []);
    // Preserve the original English name tokens so English queries still match
    // after switching `name` to the localized label for the picker preview.
    addTokens(keywords, emoji.name);
    addTokens(keywords, annotation.label);
    if (Array.isArray(annotation.tags)) {
      annotation.tags.forEach((tag) => addTokens(keywords, tag));
    }

    emojis[id] = {
      ...emoji,
      name: annotation.label || emoji.name,
      keywords: Array.from(keywords),
    };
  });

  return {
    ...baseData,
    emojis,
  };
}
