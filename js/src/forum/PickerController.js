/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

import app from 'flarum/common/app';
import Alert from 'flarum/common/components/Alert';
import PickerLoader from './components/PickerLoader';
import positionPopup from './utils/positionPopup';
import { injectEmojiMartRgbVars, injectShadowStyles } from './utils/pickerTheme';
import buildPickerConfig from './utils/buildPickerConfig';

const t = 'pianotell-flamoji.forum.';

// Delay before the loading placeholder mounts, so warm-cache loads (≪100ms)
// skip it entirely — avoids a flicker where the placeholder shows for one
// frame and is immediately replaced by the real picker.
const LOADER_DELAY_MS = 120;

// One-time global patch to webpack's chunk-URL builder, appending the
// forum.js revision hash as a cache-buster so lazy chunks bust the browser
// cache after upgrades. Shared across every controller instance.
let webpackVersioned = false;

/**
 * Owns the emoji-mart picker lifecycle for a single Flarum composer: lazy
 * loading, the loading/error placeholder, the body-portaled Picker web
 * component, its positioning, and full teardown. One instance per toolbar
 * button — created in the FlamojiPickerButton component's `oninit` and
 * disposed in its `onremove`, so the picker's lifetime is scoped to the button
 * that opens it (no TextEditor.prototype patching, no `_flamoji*` state on the
 * editor).
 *
 * The controller talks to its host (the button component) through a tiny
 * interface — `getButtonElement()` and `insertText()` — rather than reaching
 * into TextEditor/composer internals.
 *
 * emoji-mart's `Picker` is an imperative Web Component (its own Shadow DOM)
 * mounted on document.body to escape the composer footer's `overflow: auto`
 * clipping, so this integration is unavoidably imperative — but it lives here,
 * cohesively, in one place.
 */
export default class PickerController {
  constructor(host) {
    // The host provides getButtonElement() (the positioning anchor + focus
    // target) and insertText() (insert a shortcode / native emoji at the
    // cursor). It is the FlamojiPickerButton component, whose own Mithril
    // lifecycle owns this controller — decoupling us from TextEditor.prototype.
    this.host = host;

    this.picker = null;

    this.isLoading = false;
    this.isLoaded = false;
    this.isVisible = false;

    // Picker listeners/observer.
    this._reposition = null;
    this._keydown = null;
    this._resizeObserver = null;

    // Loading-placeholder mount point + listeners + delay timer.
    this._loaderContainer = null;
    this._loaderEl = null;
    this._loaderReposition = null;
    this._loaderTimer = null;

    // Point __webpack_public_path__ at our extension's published assets so
    // webpack knows where to fetch lazy chunks (emoji-mart.js, etc).
    this._setWebpackPublicPath();
  }

  /** The toolbar button element (positioning anchor + focus target). */
  _button() {
    return this.host.getButtonElement();
  }

  /** Whether the host button is still attached to the document. */
  _isConnected() {
    const btn = this._button();
    return !!(btn && btn.isConnected);
  }

  _setWebpackPublicPath() {
    const baseUrl = (app.forum.attribute('baseUrl') || '').replace(/\/+$/, '');
    __webpack_public_path__ = baseUrl + '/assets/extensions/pianotell-flamoji/dist/';
  }

  // ---------------------------------------------------------------------
  // Positioning
  // ---------------------------------------------------------------------

  /**
   * Position a popup (the real picker or the loading placeholder) relative to
   * the toolbar button, resolving the button + composer anchors from the
   * editor instance and deferring the geometry to the pure `positionPopup`.
   */
  position(el) {
    if (!el) return;
    const button = this._button();
    if (!button) return;
    // Fallback anchor for the edge case where a button-centered popup won't
    // fit: the composer body, else the editor root, else the button itself.
    const composerEl = button.closest('.ComposerBody') || button.closest('.TextEditor') || button;
    positionPopup(el, button, composerEl);
  }

  positionPicker() {
    if (!this.picker) return;
    this.position(this.picker);
  }

  // ---------------------------------------------------------------------
  // Loading placeholder
  // ---------------------------------------------------------------------

  scheduleLoaderMount() {
    if (this._loaderContainer || this._loaderTimer) return;
    this._loaderTimer = setTimeout(() => {
      this._loaderTimer = null;
      // Editor torn down or load already finished while we were waiting.
      if (!this._isConnected()) return;
      if (!this.isLoading) return;
      this.mountLoader();
    }, LOADER_DELAY_MS);
  }

  mountLoader() {
    if (this._loaderContainer) return;
    // A bare body-level mount point; the PickerLoader component's own root
    // element (`.flamoji-picker-loader`) becomes its firstChild and is what we
    // position. Body-level so it escapes composer clipping like the picker.
    const container = document.createElement('div');
    document.body.appendChild(container);
    this._loaderContainer = container;

    this.renderLoader('loading', null);

    this._loaderReposition = () => this.position(this._loaderEl);
    window.addEventListener('resize', this._loaderReposition);
    window.addEventListener('scroll', this._loaderReposition, true);
    this.position(this._loaderEl);
  }

  /**
   * (Re)render the PickerLoader component into the body-level container in the
   * given state ('loading' | 'error'). Mithril diffs across state swaps, so the
   * `.flamoji-picker-loader` root element is reused — keeping the positioned
   * node stable. Caches that node on `this._loaderEl`.
   */
  renderLoader(state, onRetry) {
    const sticker = !!app.forum.attribute('flamoji.sticker_mode');
    m.render(
      this._loaderContainer,
      m(PickerLoader, {
        state,
        sticker,
        onRetry,
        loadingLabel: app.translator.trans(t + 'composer.picker_loading', {}, true),
        errorLabel: app.translator.trans(t + 'composer.picker_load_error', {}, true),
        retryLabel: app.translator.trans(t + 'composer.picker_load_retry', {}, true),
      })
    );
    this._loaderEl = this._loaderContainer.firstChild;
  }

  unmountLoader() {
    if (this._loaderReposition) {
      window.removeEventListener('resize', this._loaderReposition);
      window.removeEventListener('scroll', this._loaderReposition, true);
      this._loaderReposition = null;
    }
    if (this._loaderContainer) {
      try {
        // Unmount the component (runs its teardown), then drop the mount point.
        m.render(this._loaderContainer, []);
        this._loaderContainer.remove();
      } catch (e) {
        /* already detached */
      }
      this._loaderContainer = null;
    }
    this._loaderEl = null;
  }

  /**
   * Swap the loader into its error state: an inline error card + Retry button
   * (declaratively rendered by PickerLoader). Complements the top-of-page Alert
   * (which can be missed if the user is focused on the composer). Retry tears
   * down the loader and re-runs the same load path.
   */
  showLoaderError(retryCb) {
    // If the loader hasn't materialized yet (load failed faster than
    // LOADER_DELAY_MS), mount it now so the error has a surface to live on.
    if (this._loaderTimer) {
      clearTimeout(this._loaderTimer);
      this._loaderTimer = null;
    }
    if (!this._loaderContainer) this.mountLoader();

    const onRetry = () => {
      this.unmountLoader();
      retryCb();
    };
    this.renderLoader('error', onRetry);
    // Error card is a different size than the spinner; re-clamp its position.
    this.position(this._loaderEl);
  }

  // ---------------------------------------------------------------------
  // Picker construction + toggling
  // ---------------------------------------------------------------------

  /**
   * Toggle the picker. On the first open, lazy-loads emoji-mart + its data and
   * builds the picker. On subsequent opens, just toggles visibility.
   */
  toggle() {
    if (this.isLoading) return;

    if (this.isLoaded) {
      this.isVisible = !this.isVisible;
      this.picker.style.display = this.isVisible ? '' : 'none';
      if (this.isVisible) this._reposition();
      return;
    }

    this.isLoading = true;
    m.redraw();
    this.scheduleLoaderMount();

    // Re-assert the public path and patch chunk URLs to bust cache after
    // upgrades, then kick off the load.
    this._setWebpackPublicPath();
    this._patchWebpackVersion();
    this._loadAndBuild();
  }

  _patchWebpackVersion() {
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

  _loadAndBuild() {
    return Promise.all([
      import(/* webpackChunkName: "emoji-mart" */ 'emoji-mart'),
      import(/* webpackChunkName: "emoji-mart-data" */ '@emoji-mart/data/sets/15/twitter.json'),
      app.request({
        method: 'GET',
        url: app.forum.attribute('apiUrl') + '/flamojis/all',
      }),
    ])
      .then(([emojiMartModule, dataModule, response]) => {
        // Guard against the editor being torn down (composer closed, navigated
        // away) while chunks were downloading. Without this we'd append a
        // picker to document.body that nothing references and leak listeners on
        // a detached editor element.
        if (!this._isConnected()) {
          this.isLoading = false;
          this.unmountLoader();
          return;
        }
        // The /all endpoint returns raw model objects keyed numerically (not a
        // JSON:API envelope). Extract them into an array.
        const emojis = Object.keys(response)
          .filter((k) => !isNaN(k))
          .map((k) => response[k]);
        this.buildPicker(emojiMartModule, dataModule, emojis);
      })
      .catch((err) => {
        console.error('[pianotell-flamoji] failed to load picker:', err);
        this.isLoading = false;
        // Inline error card with Retry button on the loader surface, plus a
        // top-of-page Alert (some users keep focus inside the composer and miss
        // page-level alerts).
        this.showLoaderError(() => {
          this.isLoading = true;
          m.redraw();
          this.scheduleLoaderMount();
          this._loadAndBuild();
        });
        if (app.alerts) {
          app.alerts.show(Alert, { type: 'error', dismissible: true }, app.translator.trans('pianotell-flamoji.forum.composer.picker_load_error'));
        }
        m.redraw();
      });
  }

  /**
   * Construct the emoji-mart Picker for this editor, mount it on document.body,
   * wire positioning + listeners, and show it. Called only on the first picker
   * open per editor instance; subsequent opens just toggle visibility.
   */
  buildPicker(emojiMartModule, dataModule, response) {
    const { Picker, options, customEmojiReplacers, effectiveStickerMode, autoHide } = buildPickerConfig(emojiMartModule, dataModule, response);

    const picker = new Picker({
      ...options,
      onEmojiSelect: (emoji) => {
        // Built-in emoji: insert the native Unicode character. Custom emoji
        // (those we registered) carry our own id; insert the configured
        // shortcode (e.g. `:partyparrot:`) which Flarum's text formatter then
        // expands at render time.
        const insert = customEmojiReplacers[emoji.id] || emoji.native || '';
        if (!insert) return;
        this.host.insertText(insert);

        if (autoHide) {
          this.isVisible = false;
          this.picker.style.display = 'none';
        }
      },
      onClickOutside: (event) => {
        // emoji-mart fires this for any click outside its DOM, including while
        // we have it hidden. Gate on our own visibility flag, and ignore the
        // click that opened us.
        if (!this.isVisible) return;
        const btn = this._button();
        if (btn && btn.contains(event.target)) return;
        this.isVisible = false;
        this.picker.style.display = 'none';
      },
    });

    // emoji-mart returns a custom element. Mount it on document.body so it
    // escapes the composer footer's `overflow: auto` clipping. We position it
    // ourselves via positionPicker() relative to the composer on every open /
    // window resize / scroll. emoji-mart populates its Shadow DOM
    // asynchronously, so the picker's first measurement after appendChild is
    // 0 — a ResizeObserver re-runs positionPicker() once it has real
    // dimensions, and on later size changes (e.g. category navigation
    // expanding rows).
    this.picker = picker;
    picker.classList.add('flamoji-picker-popup');
    // In sticker mode the popup gets a responsive CSS width/height (see
    // less/forum.less); emoji-mart's dynamicWidth then computes perLine from
    // that width.
    if (effectiveStickerMode) picker.classList.add('flamoji-picker-popup--sticker');
    picker.setAttribute('role', 'dialog');
    picker.setAttribute('aria-label', app.translator.trans(t + 'composer.emoji_picker_label', {}, true));
    // Tear down the loading placeholder right before the real picker is
    // attached so positioning math (which is shared) sees the correct mount
    // target.
    this.unmountLoader();
    document.body.appendChild(picker);
    injectEmojiMartRgbVars(picker);
    injectShadowStyles(picker);

    this._reposition = () => this.positionPicker();
    window.addEventListener('resize', this._reposition);
    window.addEventListener('scroll', this._reposition, true);
    this._resizeObserver = new ResizeObserver(this._reposition);
    this._resizeObserver.observe(picker);
    this._reposition();

    // Esc closes the picker — standard popup/dialog behavior. Listener is
    // attached at document level in capture phase so we intercept the key
    // before Flarum's own Escape handler closes the entire composer (which
    // would otherwise tear down the editor while the user was only trying to
    // dismiss the picker).
    this._keydown = (event) => {
      if (event.key !== 'Escape' || !this.isVisible) return;
      event.stopPropagation();
      this.isVisible = false;
      this.picker.style.display = 'none';
      const btn = this._button();
      if (btn) btn.focus();
    };
    document.addEventListener('keydown', this._keydown, true);

    this.isLoaded = true;
    this.isLoading = false;
    this.isVisible = true;
    m.redraw();
  }

  // ---------------------------------------------------------------------
  // Teardown
  // ---------------------------------------------------------------------

  /**
   * Clean up the picker DOM + listeners when the editor is removed (composer
   * closes, or another composer takes over). Without this, every open/close
   * cycle would leak an <em-emoji-picker> custom element on document.body and a
   * window listener.
   */
  dispose() {
    if (this._reposition) {
      window.removeEventListener('resize', this._reposition);
      window.removeEventListener('scroll', this._reposition, true);
      this._reposition = null;
    }
    if (this._keydown) {
      document.removeEventListener('keydown', this._keydown, true);
      this._keydown = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    // Tear down the loading-placeholder popup if it's still on screen (composer
    // dismissed mid-load, or picker mount races teardown).
    this.unmountLoader();
    if (this._loaderTimer) {
      clearTimeout(this._loaderTimer);
      this._loaderTimer = null;
    }
    if (this.picker && typeof this.picker.remove === 'function') {
      try {
        this.picker.remove();
      } catch (e) {
        // The custom element may already be detached.
      }
    }
    this.picker = null;
    this.isLoaded = false;
    this.isVisible = false;
  }
}
