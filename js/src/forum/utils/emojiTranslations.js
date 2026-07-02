/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

import app from 'flarum/common/app';

const t_p = 'pianotell-flamoji.forum.emoji-mart.';

/**
 * Build the emoji-mart i18n object from Flarum's translator. emoji-mart
 * shallow-merges the `i18n` prop on top of its built-in English defaults, but
 * nested objects (`categories`, `skins`) are *replaced* wholesale rather than
 * deep-merged — partial objects there leave downstream code reading from
 * `undefined`. So we always emit the full nested structure.
 *
 * (Named `buildEmojiTranslations` rather than the conventional `buildI18n`:
 * a module basename containing the "18n" digit sequence gets corrupted by
 * flarum-webpack-config's module-registration pass under production scope
 * hoisting — `forum/utils/buildI18n` emitted as `buildI18buildI18n` with a
 * dangling binding, throwing "buildI is not defined" at runtime.)
 */
export default function buildEmojiTranslations() {
  const cat = (id) => app.translator.trans(t_p + 'categories.' + id, {}, true);
  const tp = (key) => app.translator.trans(t_p + key, {}, true);
  return {
    search: tp('search_placeholder'),
    search_no_results_1: tp('no_emojis_found_title'),
    search_no_results_2: tp('no_emojis_found_message'),
    pick: tp('pick'),
    add_custom: tp('add_custom'),
    categories: {
      search: tp('category_search'),
      frequent: cat('frequent'),
      people: cat('people'),
      nature: cat('nature'),
      foods: cat('foods'),
      activity: cat('activity'),
      places: cat('places'),
      objects: cat('objects'),
      symbols: cat('symbols'),
      flags: cat('flags'),
      custom: cat('custom'),
    },
    skins: {
      choose: tp('skin_tone_choose'),
      1: tp('skin_tone_default'),
      2: tp('skin_tone_light'),
      3: tp('skin_tone_medium_light'),
      4: tp('skin_tone_medium'),
      5: tp('skin_tone_medium_dark'),
      6: tp('skin_tone_dark'),
    },
  };
}
