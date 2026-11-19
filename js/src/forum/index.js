/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

import { extend } from 'flarum/common/extend';

import app from 'flarum/common/app';
import Alert from 'flarum/common/components/Alert';
import LinkButton from 'flarum/common/components/LinkButton';
import TextEditor from 'flarum/common/components/TextEditor';
import UserPage from 'flarum/forum/components/UserPage';
import getEmojiCategories from '../common/utils/getEmojiCategories';
import urlChecker from '../common/utils/urlChecker';
import FlamojiSettingsPage from './components/FlamojiSettingsPage';
import TextEditorButton from './components/TextEditorButton';
import buildPickerConfig from './utils/buildPickerConfig';
import {
  STICKER_SKELETON,
  ensureWebpackAssetConfig,
  extractEmojiArray,
  getPreferencesSignature,
  injectShadowStyles,
  loadEmojiMartModule,
  loadUnicodeDataset,
} from './utils/customEmojiCategories';

// Translation key prefix
const t = 'pianotell-flamoji.forum.';

app.initializers.add(
  'pianotell-flamoji',
  () => {
    // Register the dedicated Emoji Picker user settings route.
    app.routes['settings.flamoji'] = {
      path: '/settings/flamoji',
      component: FlamojiSettingsPage,
    };

    // Add Emoji Picker link to the signed-in user's profile sidebar.
    extend(UserPage.prototype, 'navItems', function (items) {
      if (!app.session.user || !this.user || app.session.user.id() !== this.user.id()) {
        return;
      }

      items.add(
        'flamoji',
        <LinkButton href={app.route('settings.flamoji')} icon="far fa-smile-wink">
          {app.translator.trans(t + 'settings.nav_label')}
        </LinkButton>,
        -105
      );
    });

    // Sticker mode is a forum-wide style toggle: when on, custom emoji
    // render at sticker size everywhere (existing posts + the live composer
    // preview), not just in the picker. Drive a root class that
    // less/forum.less keys the enlarged `span.flamoji img` rule off of.
    Promise.resolve().then(() => {
      if (app.forum && app.forum.attribute('flamoji.sticker_mode')) {
        document.documentElement.classList.add('flamoji--sticker');
      }
    });

    extend(TextEditor.prototype, 'oncreate', function () {
      this.flamojiButton = this.element.querySelector('.Button-flamoji');
    });

    extend(TextEditor.prototype, 'oninit', function () {
      this.isPickerLoading = this.isPickerLoaded = false;
      this.isPickerVisible = false;
      this._flamojiPrefsSig = null;

      ensureWebpackAssetConfig();
    });

    function positionPicker() {
      if (!this.picker) return;
      positionElement.call(this, this.picker);
    }

    function positionElement(el) {
      if (!el || !this.flamojiButton) return;
      const btnRect = this.flamojiButton.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      if (!elRect.width || !elRect.height) return;

      const margin = 6;
      const screenPadding = 8;

      const minLeft = screenPadding;
      const maxLeft = window.innerWidth - elRect.width - screenPadding;
      const minTop = screenPadding;
      const maxTop = window.innerHeight - elRect.height - screenPadding;

      const btnCenterX = btnRect.left + btnRect.width / 2;
      let left = btnCenterX - elRect.width / 2;
      let top;

      if (left < minLeft || left > maxLeft) {
        const composer = this.element.closest('.ComposerBody') || this.element;
        const composerRect = composer.getBoundingClientRect();
        left = composerRect.left + (composerRect.width - elRect.width) / 2;
        top = composerRect.bottom - elRect.height / 2;
      } else {
        top = btnRect.top - margin - elRect.height;
      }

      if (left > maxLeft) left = maxLeft;
      if (left < minLeft) left = minLeft;
      if (top > maxTop) top = maxTop;
      if (top < minTop) top = minTop;

      el.style.top = Math.round(top) + 'px';
      el.style.left = Math.round(left) + 'px';
    }

    function teardownPickerInstance() {
      if (this._flamojiReposition) {
        window.removeEventListener('resize', this._flamojiReposition);
        window.removeEventListener('scroll', this._flamojiReposition, true);
        this._flamojiReposition = null;
      }
      if (this._flamojiKeydown) {
        document.removeEventListener('keydown', this._flamojiKeydown, true);
        this._flamojiKeydown = null;
      }
      if (this._flamojiResizeObserver) {
        this._flamojiResizeObserver.disconnect();
        this._flamojiResizeObserver = null;
      }
      unmountPickerLoader.call(this);
      if (this._flamojiLoaderTimer) {
        clearTimeout(this._flamojiLoaderTimer);
        this._flamojiLoaderTimer = null;
      }
      if (this.picker && typeof this.picker.remove === 'function') {
        try {
          this.picker.remove();
        } catch (e) {
          // The custom element may already be detached.
        }
      }
      this.picker = null;
      this._flamojiPrefsSig = null;
      this.isPickerLoaded = false;
      this.isPickerVisible = false;
    }

    extend(TextEditor.prototype, 'onremove', function () {
      teardownPickerInstance.call(this);
      this.flamojiButton = null;
    });

    const LOADER_DELAY_MS = 120;

    function scheduleLoaderMount() {
      if (this._flamojiLoader || this._flamojiLoaderTimer) return;
      this._flamojiLoaderTimer = setTimeout(() => {
        this._flamojiLoaderTimer = null;
        if (!this.element || !this.element.isConnected) return;
        if (!this.isPickerLoading) return;
        mountPickerLoader.call(this);
      }, LOADER_DELAY_MS);
    }

    function mountPickerLoader() {
      if (this._flamojiLoader) return;
      const loader = document.createElement('div');
      loader.className = 'flamoji-picker-loader';
      if (app.forum.attribute('flamoji.sticker_mode')) {
        loader.classList.add('flamoji-picker-loader--sticker');
      }
      loader.setAttribute('role', 'status');
      loader.setAttribute('aria-live', 'polite');

      const spinner = document.createElement('div');
      spinner.className = 'flamoji-picker-loader__spinner';
      spinner.setAttribute('aria-hidden', 'true');

      const label = document.createElement('div');
      label.className = 'flamoji-picker-loader__label';
      label.textContent = app.translator.trans(t + 'composer.picker_loading');

      loader.appendChild(spinner);
      loader.appendChild(label);
      document.body.appendChild(loader);

      this._flamojiLoader = loader;
      this._flamojiLoaderReposition = () => positionElement.call(this, loader);
      window.addEventListener('resize', this._flamojiLoaderReposition);
      window.addEventListener('scroll', this._flamojiLoaderReposition, true);
      positionElement.call(this, loader);
    }

    function unmountPickerLoader() {
      if (this._flamojiLoaderReposition) {
        window.removeEventListener('resize', this._flamojiLoaderReposition);
        window.removeEventListener('scroll', this._flamojiLoaderReposition, true);
        this._flamojiLoaderReposition = null;
      }
      if (this._flamojiLoader) {
        try {
          this._flamojiLoader.remove();
        } catch (e) {
          /* already detached */
        }
        this._flamojiLoader = null;
      }
    }

    function showLoaderError(retryCb) {
      if (this._flamojiLoaderTimer) {
        clearTimeout(this._flamojiLoaderTimer);
        this._flamojiLoaderTimer = null;
      }
      if (!this._flamojiLoader) mountPickerLoader.call(this);

      const loader = this._flamojiLoader;
      loader.classList.add('flamoji-picker-loader--error');
      loader.replaceChildren();

      const label = document.createElement('div');
      label.className = 'flamoji-picker-loader__label';
      label.textContent = app.translator.trans(t + 'composer.picker_load_error');

      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'Button Button--primary flamoji-picker-loader__retry';
      retry.textContent = app.translator.trans(t + 'composer.picker_load_retry');
      retry.addEventListener('click', () => {
        unmountPickerLoader.call(this);
        retryCb();
      });

      loader.appendChild(label);
      loader.appendChild(retry);
      positionElement.call(this, loader);
    }

    function buildPicker(emojiMartModule, dataModule, response) {
      const { Picker, options, customEmojiReplacers, effectiveStickerMode, autoHide } = buildPickerConfig(emojiMartModule, dataModule, response);

      const picker = new Picker({
        ...options,
        onEmojiSelect: (emoji) => {
          const insert = customEmojiReplacers[emoji.id] || emoji.native || '';
          if (!insert) return;
          this.attrs.composer.editor.insertAtCursor(insert);

          if (autoHide) {
            this.isPickerVisible = false;
            this.picker.style.display = 'none';
          }
        },
        onClickOutside: (event) => {
          if (!this.isPickerVisible) return;
          if (this.flamojiButton && this.flamojiButton.contains(event.target)) return;
          this.isPickerVisible = false;
          this.picker.style.display = 'none';
        },
      });

      this.picker = picker;
      picker.classList.add('flamoji-picker-popup');
      if (effectiveStickerMode) {
        picker.classList.add('flamoji-picker-popup--sticker');
      }
      unmountPickerLoader.call(this);
      document.body.appendChild(picker);
      injectShadowStyles(picker);

      this._flamojiReposition = positionPicker.bind(this);
      window.addEventListener('resize', this._flamojiReposition);
      window.addEventListener('scroll', this._flamojiReposition, true);
      this._flamojiResizeObserver = new ResizeObserver(this._flamojiReposition);
      this._flamojiResizeObserver.observe(picker);
      this._flamojiReposition();

      this._flamojiKeydown = (event) => {
        if (event.key !== 'Escape' || !this.isPickerVisible) return;
        event.stopPropagation();
        this.isPickerVisible = false;
        this.picker.style.display = 'none';
        if (this.flamojiButton) this.flamojiButton.focus();
      };
      document.addEventListener('keydown', this._flamojiKeydown, true);

      this._flamojiPrefsSig = getPreferencesSignature();
      this.isPickerLoaded = true;
      this.isPickerLoading = false;
      this.isPickerVisible = true;
      m.redraw();
    }

    function onPickerButtonClick() {
      if (this.isPickerLoading) return;

      if (this.isPickerLoaded) {
        if (getPreferencesSignature() !== this._flamojiPrefsSig) {
          teardownPickerInstance.call(this);
          onPickerButtonClick.call(this);
          return;
        }
        this.isPickerVisible = !this.isPickerVisible;
        this.picker.style.display = this.isPickerVisible ? '' : 'none';
        if (this.isPickerVisible) this._flamojiReposition();
        return;
      }

      this.isPickerLoading = true;
      m.redraw();
      scheduleLoaderMount.call(this);

      ensureWebpackAssetConfig();

      const loadAndBuild = () => {
        const stickerMode = !!app.forum.attribute('flamoji.sticker_mode');
        const loadJs = loadEmojiMartModule();
        const loadApi = app.request({
          method: 'GET',
          url: app.forum.attribute('apiUrl') + '/pianotell/emojis',
          params: { filter: { all: 1 } },
        });

        const loadData = stickerMode
          ? loadApi.then((response) => {
              return extractEmojiArray(response).length > 0 ? STICKER_SKELETON : loadUnicodeDataset();
            })
          : loadUnicodeDataset();

        return Promise.all([loadJs, loadData, loadApi])
          .then(([emojiMartModule, dataModule, response]) => {
            if (!this.element || !this.element.isConnected) {
              this.isPickerLoading = false;
              unmountPickerLoader.call(this);
              return;
            }
            const safeResponse = response && Array.isArray(response.data) ? response : { data: [] };
            buildPicker.call(this, emojiMartModule, dataModule, safeResponse);
          })
          .catch((err) => {
            console.error('[pianotell-flamoji] failed to load picker:', err);
            this.isPickerLoading = false;
            showLoaderError.call(this, () => {
              this.isPickerLoading = true;
              m.redraw();
              scheduleLoaderMount.call(this);
              loadAndBuild();
            });
            if (app.alerts) {
              app.alerts.show(
                Alert,
                { type: 'error', dismissible: true },
                app.translator.trans('pianotell-flamoji.forum.composer.picker_load_error')
              );
            }
            m.redraw();
          });
      };

      loadAndBuild();
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

      if (items.has('emoji')) items.remove('emoji');
    });
  },
  -150 // initialize before flarum/emoji
);

// Forward-compat: Flarum 2.x's Export Registry discovers extension internals
// through a namespaced default export on the entry module. Other extensions
// can then `import { components } from 'ext:pianotell/flamoji/forum'`.
// Harmless under 1.x — just a re-exported object.
import TextEditorButton_ from './components/TextEditorButton';
import urlChecker_ from '../common/utils/urlChecker';
import getEmojiCategories_ from '../common/utils/getEmojiCategories';

export default Object.freeze({
  components: {
    TextEditorButton: TextEditorButton_,
  },
  utils: {
    urlChecker: urlChecker_,
    getEmojiCategories: getEmojiCategories_,
  },
});
