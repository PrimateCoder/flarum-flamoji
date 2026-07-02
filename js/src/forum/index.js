/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

import { extend } from 'flarum/common/extend';

import app from 'flarum/common/app';
import Alert from 'flarum/common/components/Alert';
import TextEditorButton from './components/TextEditorButton';
import PickerLoader from './components/PickerLoader';
import positionPopup from './utils/positionPopup';
import { injectEmojiMartRgbVars, injectShadowStyles } from './utils/pickerTheme';
import buildPickerConfig from './utils/buildPickerConfig';

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

    extend('flarum/common/components/TextEditor', ['oncreate', 'onupdate'], function () {
      this.flamojiButton = this.element.querySelector('.Button-flamoji');
    });

    extend('flarum/common/components/TextEditor', 'oninit', function () {
      this.isPickerLoading = this.isPickerLoaded = false;
      this.isPickerVisible = false;

      // Point __webpack_public_path__ at our extension's published assets.
      // This tells webpack where to fetch lazy chunks (emoji-mart.js, etc).
      const baseUrl = (app.forum.attribute('baseUrl') || '').replace(/\/+$/, '');
      __webpack_public_path__ = baseUrl + '/assets/extensions/pianotell-flamoji/dist/';
    });

    /**
     * Position the picker as a popup. Two placement modes:
     *
     * Primary: centered horizontally on the flamoji toolbar button,
     * floating above it. As the viewport shrinks vertically, the picker
     * slides up to stay on-screen rather than clipping at the top.
     *
     * Fallback (when the button is so close to a viewport edge that a
     * button-centered picker wouldn't fit): center on the composer body
     * horizontally, and align the picker's vertical center with the
     * composer's bottom edge. Same idea as the original emoji-button
     * picker — popup hovers over the bottom of the composer.
     *
     * In both modes the final coordinates are clamped to the viewport so
     * the popup stays fully visible.
     *
     * Picker lives at document.body level (see buildPicker), so we use
     * viewport coordinates from getBoundingClientRect — `position: fixed`
     * already accounts for page scroll, no offset math needed.
     */
    function positionPicker() {
      if (!this.picker) return;
      positionElement.call(this, this.picker);
    }

    /**
     * Shared positioner used by both the real picker and the loading
     * placeholder. Resolves the toolbar-button anchor + composer fallback
     * anchor from the editor instance, then defers the primary/fallback/clamp
     * geometry to the pure `positionPopup` helper.
     */
    function positionElement(el) {
      if (!el) return;
      // Lazily find the button if it hasn't been cached yet
      if (!this.flamojiButton && this.element) {
        this.flamojiButton = this.element.querySelector('.Button-flamoji');
      }
      if (!this.flamojiButton) return;
      const composerEl = this.element ? this.element.closest('.ComposerBody') || this.element : null;
      positionPopup(el, this.flamojiButton, composerEl);
    }

    // Clean up the picker DOM + listeners when the editor is removed (e.g.
    // composer closes, or another composer takes over). Without this, every
    // open/close cycle would leak an <em-emoji-picker> custom element on
    // document.body and a window listener.
    extend('flarum/common/components/TextEditor', 'onremove', function () {
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
      // Tear down the loading-placeholder popup if it's still on screen
      // (composer dismissed mid-load, or picker mount races teardown).
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
      this.isPickerLoaded = false;
      this.isPickerVisible = false;
      this.flamojiButton = null;
    });

    /**
     * Mount a placeholder popup at the picker's eventual position so the
     * user gets immediate visual feedback while the emoji-mart chunks +
     * custom-emoji API are loading on first open. Mount is delayed by
     * LOADER_DELAY_MS so warm-cache loads (≪100ms) skip the loader
     * entirely — avoids a flicker where the placeholder appears for one
     * frame and is immediately replaced.
     *
     * If a loader is already mounted (e.g. the user clicked Retry after a
     * prior failure), it's reused rather than re-mounted.
     */
    const LOADER_DELAY_MS = 120;

    function scheduleLoaderMount() {
      if (this._flamojiLoader || this._flamojiLoaderTimer) return;
      this._flamojiLoaderTimer = setTimeout(() => {
        this._flamojiLoaderTimer = null;
        // Editor torn down or load already finished while we were waiting.
        if (!this.element || !this.element.isConnected) return;
        if (!this.isPickerLoading) return;
        mountPickerLoader.call(this);
      }, LOADER_DELAY_MS);
    }

    function mountPickerLoader() {
      if (this._flamojiLoaderContainer) return;
      // A bare body-level mount point; the PickerLoader component's own root
      // element (`.flamoji-picker-loader`) becomes its firstChild and is what
      // we position. Body-level so it escapes composer clipping like the picker.
      const container = document.createElement('div');
      document.body.appendChild(container);
      this._flamojiLoaderContainer = container;

      renderPickerLoader.call(this, 'loading', null);

      this._flamojiLoaderReposition = () => positionElement.call(this, this._flamojiLoader);
      window.addEventListener('resize', this._flamojiLoaderReposition);
      window.addEventListener('scroll', this._flamojiLoaderReposition, true);
      positionElement.call(this, this._flamojiLoader);
    }

    /**
     * (Re)render the PickerLoader component into the body-level container in
     * the given state ('loading' | 'error'). Mithril diffs across state swaps,
     * so the `.flamoji-picker-loader` root element is reused — keeping the
     * positioned node stable. Caches that node on `this._flamojiLoader`.
     */
    function renderPickerLoader(state, onRetry) {
      const sticker = !!app.forum.attribute('flamoji.sticker_mode');
      m.render(
        this._flamojiLoaderContainer,
        m(PickerLoader, {
          state,
          sticker,
          onRetry,
          loadingLabel: app.translator.trans(t + 'composer.picker_loading', {}, true),
          errorLabel: app.translator.trans(t + 'composer.picker_load_error', {}, true),
          retryLabel: app.translator.trans(t + 'composer.picker_load_retry', {}, true),
        })
      );
      this._flamojiLoader = this._flamojiLoaderContainer.firstChild;
    }

    function unmountPickerLoader() {
      if (this._flamojiLoaderReposition) {
        window.removeEventListener('resize', this._flamojiLoaderReposition);
        window.removeEventListener('scroll', this._flamojiLoaderReposition, true);
        this._flamojiLoaderReposition = null;
      }
      if (this._flamojiLoaderContainer) {
        try {
          // Unmount the component (runs its teardown), then drop the mount point.
          m.render(this._flamojiLoaderContainer, []);
          this._flamojiLoaderContainer.remove();
        } catch (e) {
          /* already detached */
        }
        this._flamojiLoaderContainer = null;
      }
      this._flamojiLoader = null;
    }

    /**
     * Swap the loader into its error state: an inline error card + Retry
     * button (declaratively rendered by PickerLoader). Complements the
     * top-of-page Alert (which can be missed if the user is focused on the
     * composer). Retry tears down the loader and re-runs the same load path.
     */
    function showLoaderError(retryCb) {
      // If the loader hasn't materialized yet (load failed faster than
      // LOADER_DELAY_MS), mount it now so the error has a surface to live on.
      if (this._flamojiLoaderTimer) {
        clearTimeout(this._flamojiLoaderTimer);
        this._flamojiLoaderTimer = null;
      }
      if (!this._flamojiLoaderContainer) mountPickerLoader.call(this);

      const onRetry = () => {
        unmountPickerLoader.call(this);
        retryCb();
      };
      renderPickerLoader.call(this, 'error', onRetry);
      // Error card is a different size than the spinner; re-clamp its position.
      positionElement.call(this, this._flamojiLoader);
    }

    /**
     * Construct the emoji-mart Picker for this TextEditor instance, append
     * it to flamojiContainer, and show it. Called only on the first picker
     * open per editor instance; subsequent opens just toggle visibility.
     */
    function buildPicker(emojiMartModule, dataModule, response) {
      const { Picker, options, customEmojiReplacers, effectiveStickerMode, autoHide } = buildPickerConfig(emojiMartModule, dataModule, response);

      const picker = new Picker({
        ...options,
        onEmojiSelect: (emoji) => {
          // Built-in emoji: insert the native Unicode character. Custom emoji
          // (those we registered above) carry our own id; insert the
          // configured shortcode (e.g. `:partyparrot:`) which Flarum's text
          // formatter then expands at render time.
          const insert = customEmojiReplacers[emoji.id] || emoji.native || '';
          if (!insert) return;
          this.attrs.composer.editor.insertAtCursor(insert);

          if (autoHide) {
            this.isPickerVisible = false;
            this.picker.style.display = 'none';
          }
        },
        onClickOutside: (event) => {
          // emoji-mart fires this for any click outside its DOM, including
          // while we have it hidden. Gate on our own visibility flag, and
          // ignore the click that opened us.
          if (!this.isPickerVisible) return;
          if (this.flamojiButton && this.flamojiButton.contains(event.target)) return;
          this.isPickerVisible = false;
          this.picker.style.display = 'none';
        },
      });

      // emoji-mart returns a custom element. Mount it on document.body so
      // it escapes the composer footer's `overflow: auto` clipping. We
      // position it ourselves via positionPicker() relative to the
      // composer on every open / window resize / scroll. emoji-mart
      // populates its Shadow DOM asynchronously, so the picker's first
      // measurement after appendChild is 0 — a ResizeObserver re-runs
      // positionPicker() once it has real dimensions, and on later size
      // changes (e.g. category navigation expanding rows).
      this.picker = picker;
      picker.classList.add('flamoji-picker-popup');
      // In sticker mode the popup gets a responsive CSS width/height (see
      // less/forum.less); emoji-mart's dynamicWidth then computes perLine
      // from that width.
      if (effectiveStickerMode) picker.classList.add('flamoji-picker-popup--sticker');
      picker.setAttribute('role', 'dialog');
      picker.setAttribute('aria-label', app.translator.trans(t + 'composer.emoji_picker_label', {}, true));
      // Tear down the loading placeholder right before the real picker is
      // attached so positioning math (which is shared) sees the correct
      // mount target.
      unmountPickerLoader.call(this);
      document.body.appendChild(picker);
      injectEmojiMartRgbVars(picker);
      injectShadowStyles(picker);

      this._flamojiReposition = positionPicker.bind(this);
      window.addEventListener('resize', this._flamojiReposition);
      window.addEventListener('scroll', this._flamojiReposition, true);
      this._flamojiResizeObserver = new ResizeObserver(this._flamojiReposition);
      this._flamojiResizeObserver.observe(picker);
      this._flamojiReposition();

      // Esc closes the picker — standard popup/dialog behavior. Listener
      // is attached at document level in capture phase so we intercept the
      // key before Flarum's own Escape handler closes the entire composer
      // (which would otherwise tear down the editor while the user was
      // only trying to dismiss the picker).
      this._flamojiKeydown = (event) => {
        if (event.key !== 'Escape' || !this.isPickerVisible) return;
        event.stopPropagation();
        this.isPickerVisible = false;
        this.picker.style.display = 'none';
        if (this.flamojiButton) this.flamojiButton.focus();
      };
      document.addEventListener('keydown', this._flamojiKeydown, true);

      this.isPickerLoaded = true;
      this.isPickerLoading = false;
      this.isPickerVisible = true;
      m.redraw();
    }

    /**
     * Click handler for the flamoji toolbar button. On the first click,
     * lazy-loads emoji-mart + its data and builds the picker. On subsequent
     * clicks, just toggles visibility.
     */
    function onPickerButtonClick() {
      if (this.isPickerLoading) return;

      if (this.isPickerLoaded) {
        this.isPickerVisible = !this.isPickerVisible;
        this.picker.style.display = this.isPickerVisible ? '' : 'none';
        if (this.isPickerVisible) this._flamojiReposition();
        return;
      }

      this.isPickerLoading = true;
      m.redraw();
      scheduleLoaderMount.call(this);

      // Re-assert __webpack_public_path__ and append a cache-busting
      // query string derived from the Flarum forum.js revision hash.
      // This ensures chunk URLs bust the browser cache after upgrades.
      const baseUrl = (app.forum.attribute('baseUrl') || '').replace(/\/+$/, '');
      __webpack_public_path__ = baseUrl + '/assets/extensions/pianotell-flamoji/dist/';

      if (!onPickerButtonClick._versioned) {
        const scripts = document.querySelectorAll('script[src*="forum.js"]');
        for (const s of scripts) {
          const m = s.src.match(/[?&]v=([a-f0-9]+)/);
          if (m) {
            const ver = m[1];
            const origU = __webpack_require__.u;
            __webpack_require__.u = (id) => origU(id) + '?v=' + ver;
            break;
          }
        }
        onPickerButtonClick._versioned = true;
      }

      const loadAndBuild = () =>
        Promise.all([
          import(/* webpackChunkName: "emoji-mart" */ 'emoji-mart'),
          import(/* webpackChunkName: "emoji-mart-data" */ '@emoji-mart/data/sets/15/twitter.json'),
          app.request({
            method: 'GET',
            url: app.forum.attribute('apiUrl') + '/flamojis/all',
          }),
        ])
          .then(([emojiMartModule, dataModule, response]) => {
            // Guard against the editor being torn down (composer closed,
            // navigated away) while chunks were downloading. Without this
            // we'd append a picker to document.body that nothing references
            // and leak listeners on a detached editor element.
            if (!this.element || !this.element.isConnected) {
              this.isPickerLoading = false;
              unmountPickerLoader.call(this);
              return;
            }
            // The /all endpoint returns raw model objects keyed numerically
            // (not a JSON:API envelope). Extract them into an array.
            const emojis = Object.keys(response)
              .filter((k) => !isNaN(k))
              .map((k) => response[k]);
            buildPicker.call(this, emojiMartModule, dataModule, emojis);
          })
          .catch((err) => {
            console.error('[pianotell-flamoji] failed to load picker:', err);
            this.isPickerLoading = false;
            // Inline error card with Retry button on the loader surface,
            // plus a top-of-page Alert (some users keep focus inside the
            // composer and miss page-level alerts).
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

      loadAndBuild();
    }

    extend('flarum/common/components/TextEditor', 'toolbarItems', function (items) {
      items.add(
        'flamoji',
        TextEditorButton.component({
          onclick: onPickerButtonClick.bind(this),
          icon: this.isPickerLoading ? 'fas fa-spinner fa-pulse' : 'far fa-smile-wink',
          title: app.translator.trans(t + 'composer.emoji_tooltip', {}, true),
        })
      );

      // Drop the stock flarum/emoji toolbar button if present; we replace it.
      if (items.has('emoji')) items.remove('emoji');
    });
  },
  -150 // initialize before flarum/emoji
);
