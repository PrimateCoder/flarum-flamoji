import { extend } from 'flarum/common/extend';

import app from 'flarum/common/app';
import getEmojiCategories from '../common/utils/getEmojiCategories';
import TextEditorButton from './components/TextEditorButton';
import TextEditor from 'flarum/common/components/TextEditor';
import urlChecker from '../common/utils/urlChecker';

// Make translation calls shorter
const t = 'pianotell-flamoji.forum.';
const t_p = t + 'emoji-button.';

app.initializers.add(
  'pianotell-flamoji',
  () => {
    // localization of the `emoji-button` package
    const i18n = {
      search: app.translator.trans(t_p + 'search_placeholder'),
      notFound: app.translator.trans(t_p + 'no_emojis_found_message'),
      categories: {
        recents: app.translator.trans(t_p + 'categories.recents'),
        smileys: app.translator.trans(t_p + 'categories.smileys'),
        people: app.translator.trans(t_p + 'categories.people'),
        animals: app.translator.trans(t_p + 'categories.animals'),
        food: app.translator.trans(t_p + 'categories.food'),
        activities: app.translator.trans(t_p + 'categories.activities'),
        travel: app.translator.trans(t_p + 'categories.travel'),
        objects: app.translator.trans(t_p + 'categories.objects'),
        symbols: app.translator.trans(t_p + 'categories.symbols'),
        flags: app.translator.trans(t_p + 'categories.flags'),
        custom: app.translator.trans(t_p + 'categories.custom'),
      },
    };

    extend(TextEditor.prototype, 'oncreate', function () {
      this.flamojiButton = this.element.querySelector('.Button-flamoji');
      this.flamojiContainer = document.createElement('div');
      this.flamojiContainer.classList.add('ComposerBody-flamojiContainer');

      this.flamojiButton.after(this.flamojiContainer);
    });

    extend(TextEditor.prototype, 'oninit', function () {
      this.isPickerLoading = this.isPickerLoaded = false;

      // https://v4.webpack.js.org/guides/public-path/#on-the-fly
      __webpack_public_path__ = app.forum.attribute('baseUrl') + '/assets/extensions/pianotell-flamoji/dist/';

      // dyanmically load translated emoji keyword files
      this.emojiData = (lang) => {
        this.isPickerLoading = true;
        return import(/* webpackChunkName: "emoji-button-message-[request]" */ `@roderickhsiao/emoji-button-locale-data/dist/${lang}`);
      };
    });

    // Clean up DOM + picker when the editor is removed (e.g. composer
    // closes, or another composer takes over). Without this, every open/
    // close cycle leaks a flamojiContainer <div> and a picker instance
    // with its event listeners.
    extend(TextEditor.prototype, 'onremove', function () {
      if (this.picker && typeof this.picker.destroyPicker === 'function') {
        try {
          this.picker.destroyPicker();
        } catch (e) {
          // EmojiButton can throw if the picker DOM is already gone.
        }
      }
      this.picker = null;

      if (this.flamojiContainer && this.flamojiContainer.parentNode) {
        this.flamojiContainer.parentNode.removeChild(this.flamojiContainer);
      }
      this.flamojiContainer = null;
      this.flamojiButton = null;
    });

    /**
     * Build the EmojiButton picker for this TextEditor instance, wire up
     * insertion into the composer, and toggle it open. This is only
     * called once per TextEditor (subsequent clicks just togglePicker).
     */
    function buildPicker(localeData, response, i18n) {
      const baseUrl = app.forum.attribute('baseUrl');

      const specifiedCategories = JSON.parse(app.forum.attribute('flamoji.specify_categories'));
      const sortingArr = getEmojiCategories();

      const customEmojis = [];
      const customEmojiReplacers = {};

      response['data'].forEach((customEmoji) => {
        const path = customEmoji['attributes']['path'];
        customEmojiReplacers[path] = customEmoji['attributes']['text_to_replace'];
        customEmojis.push({
          name: customEmoji['attributes']['title'],
          emoji: urlChecker(path) ? path : baseUrl + path,
        });
      });

      // If we don't sort `specifiedCategories` based on `sortingArr`,
      // some categories silently fail to render. Looks like an
      // emoji-button bug.
      specifiedCategories.sort((a, b) => sortingArr.indexOf(a) - sortingArr.indexOf(b));

      return import(/* webpackChunkName: "emoji-button" */ '@joeattardi/emoji-button').then(({ EmojiButton }) => {
        this.picker = new EmojiButton({
          theme: 'light', // based on Flarum's less variables
          autoFocusSearch: false,
          rootElement: this.flamojiContainer,
          style: app.forum.attribute('flamoji.emoji_style'),
          recentsCount: app.forum.attribute('flamoji.recents_count'),
          showRecents: app.forum.attribute('flamoji.show_recents'),
          showVariants: app.forum.attribute('flamoji.show_variants'),
          autoHide: app.forum.attribute('flamoji.auto_hide'),
          showPreview: app.forum.attribute('flamoji.show_preview'),
          showCategoryButtons: app.forum.attribute('flamoji.show_category_buttons'),
          showSearch: app.forum.attribute('flamoji.show_search'),
          emojiVersion: app.forum.attribute('flamoji.emoji_version'),
          initialCategory: app.forum.attribute('flamoji.initial_category'),
          categories: specifiedCategories,
          emojiData: localeData.default,
          custom: customEmojis,
          i18n,
        });

        this.picker.on('emoji', (selection) => {
          // For custom emoji, EmojiButton gives us `selection.url` instead
          // of `selection.emoji`. Look up the configured replacer text by
          // path (paths are unique in the custom-emoji table).
          const insert = selection.emoji || customEmojiReplacers[selection.url.replace(app.forum.attribute('baseUrl'), '')];
          this.attrs.composer.editor.insertAtCursor(insert);
        });

        this.isPickerLoaded = true;
        this.isPickerLoading = false;
        m.redraw();

        this.picker.togglePicker(this.flamojiButton);
      });
    }

    /**
     * Click handler for the flamoji toolbar button. On the first click,
     * lazy-loads the locale + custom emoji list + EmojiButton chunk and
     * builds the picker. On subsequent clicks, just toggles it.
     */
    function onPickerButtonClick() {
      if (this.isPickerLoading) return;

      if (this.isPickerLoaded) {
        this.picker.togglePicker(this.flamojiButton);
        return;
      }

      this.emojiData(app.forum.attribute('flamoji.emoji_data')).then((localeData) => {
        app
          .request({
            method: 'GET',
            url: app.forum.attribute('apiUrl') + '/pianotell/emojis',
            params: { filter: { all: 1 } },
          })
          .then((response) => buildPicker.call(this, localeData, response, i18n));
      });
    }

    extend(TextEditor.prototype, 'toolbarItems', function (items) {
      items.add(
        'flamoji',
        TextEditorButton.component({
          onclick: onPickerButtonClick.bind(this),
          icon: this.isPickerLoading ? 'fas fa-spinner fa-pulse' : 'far fa-smile-wink',
          title: app.translator.trans(t + 'composer.emoji_tooltip'),
        })
      );

      // Drop the stock flarum/emoji toolbar button if present; we replace it.
      if (items.has('emoji')) items.remove('emoji');
    });
  },
  -150 // initialize before flarum/emoji
);
