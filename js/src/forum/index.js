/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

import { extend } from 'flarum/common/extend';

import app from 'flarum/common/app';
import FlamojiPickerButton from './components/FlamojiPickerButton';

export { default as extend } from './extend';

// Translation key prefix
const t = 'pianotell-flamoji.forum.';

app.initializers.add(
  'pianotell-flamoji',
  () => {
    // Sticker mode is a forum-wide style toggle: when on, custom emoji
    // render at sticker size everywhere (existing posts + the live composer
    // preview), not just in the picker. Drive a root class that
    // less/forum.less keys the enlarged `span.flamoji img` rule off of.
    // `app.forum` isn't populated until AFTER initializers run, so defer the
    // read to a microtask (and guard it) — reading it synchronously here
    // throws and aborts the whole initializer.
    Promise.resolve().then(() => {
      if (app.forum && app.forum.attribute('flamoji.sticker_mode')) {
        document.documentElement.classList.add('flamoji--sticker');
      }
    });

    // Add the flamoji toolbar button. The button component owns the entire
    // picker lifecycle itself (via its own oninit/onremove → PickerController),
    // so the editor needs no other lifecycle patching.
    extend('flarum/common/components/TextEditor', 'toolbarItems', function (items) {
      items.add(
        'flamoji',
        FlamojiPickerButton.component({
          composer: this.attrs.composer,
          title: app.translator.trans(t + 'composer.emoji_tooltip', {}, true),
        })
      );

      // Drop the stock flarum/emoji toolbar button if present; we replace it.
      if (items.has('emoji')) items.remove('emoji');
    });
  },
  -150 // initialize before flarum/emoji
);
