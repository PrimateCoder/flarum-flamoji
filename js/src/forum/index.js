import { extend } from 'flarum/common/extend';

import app from 'flarum/common/app';
import Alert from 'flarum/common/components/Alert';
import getEmojiCategories from '../common/utils/getEmojiCategories';
import TextEditorButton from './components/TextEditorButton';
import TextEditor from 'flarum/common/components/TextEditor';
import urlChecker from '../common/utils/urlChecker';

// Translation key prefixes
const t = 'pianotell-flamoji.forum.';
const t_p = t + 'emoji-mart.';

// emoji-mart's twitter.json `x`/`y` percentages assume a specific sprite-
// sheet grid size. @emoji-mart/data v1.2.1 was built against
// emoji-datasource v15.0.1 (61×61 grid). The matching twitter sprite is
// emoji-datasource-twitter@15.0.1. Bumping @emoji-mart/data later means
// re-pinning this URL to the corresponding emoji-datasource-twitter
// release — verify by checking that the sprite's tile count matches
// `data.sheet.cols`/`data.sheet.rows`.
const TWEMOJI_SPRITESHEET_URL =
  'https://cdn.jsdelivr.net/npm/emoji-datasource-twitter@15.0.1/img/twitter/sheets-256/64.png';

app.initializers.add(
  'pianotell-flamoji',
  () => {
    /**
     * Build the emoji-mart i18n object from Flarum's translator. emoji-mart
     * shallow-merges the `i18n` prop on top of its built-in English
     * defaults, but nested objects (`categories`, `skins`) are *replaced*
     * wholesale rather than deep-merged — partial objects there leave
     * downstream code reading from `undefined`. So we always emit the full
     * nested structure.
     */
    function buildI18n() {
      const cat = (id) => app.translator.trans('pianotell-flamoji.forum.emoji-mart.categories.' + id);
      const tp = (key) => app.translator.trans(t_p + key);
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

    extend(TextEditor.prototype, 'oncreate', function () {
      this.flamojiButton = this.element.querySelector('.Button-flamoji');
    });

    extend(TextEditor.prototype, 'oninit', function () {
      this.isPickerLoading = this.isPickerLoaded = false;
      this.isPickerVisible = false;

      // https://v4.webpack.js.org/guides/public-path/#on-the-fly
      // Normalize trailing slash on baseUrl so chunk URLs don't end up with
      // a double slash (`/forum//assets/...`). Most servers tolerate it,
      // but some chunked-loading paths and CDNs are strict about it.
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
     * placeholder. Same primary/fallback geometry as positionPicker; pulled
     * out so the loader can reuse it without temporarily aliasing
     * `this.picker`.
     */
    function positionElement(el) {
      if (!el || !this.flamojiButton) return;
      const btnRect = this.flamojiButton.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      // Reposition won't work until the element has measurable dimensions —
      // emoji-mart populates Shadow DOM asynchronously after appendChild,
      // so the first call right after mount sees width/height of 0. The
      // ResizeObserver wired up in buildPicker() will re-fire this once
      // the picker takes its real shape.
      if (!elRect.width || !elRect.height) return;

      const margin = 6;
      const screenPadding = 8;

      const minLeft = screenPadding;
      const maxLeft = window.innerWidth - elRect.width - screenPadding;
      const minTop = screenPadding;
      const maxTop = window.innerHeight - elRect.height - screenPadding;

      // Try primary placement: horizontally centered on the button.
      const btnCenterX = btnRect.left + btnRect.width / 2;
      let left = btnCenterX - elRect.width / 2;
      let top;

      if (left < minLeft || left > maxLeft) {
        // Fallback: horizontally center on the composer body, vertically
        // anchor the picker's center to the composer's bottom edge.
        const composer = this.element.closest('.ComposerBody') || this.element;
        const composerRect = composer.getBoundingClientRect();
        left = composerRect.left + (composerRect.width - elRect.width) / 2;
        top = composerRect.bottom - elRect.height / 2;
      } else {
        // Primary: float above the button; slide up rather than clip if
        // there isn't enough room above.
        top = btnRect.top - margin - elRect.height;
      }

      // Final clamp keeps the picker fully on-screen in either mode.
      if (left > maxLeft) left = maxLeft;
      if (left < minLeft) left = minLeft;
      if (top > maxTop) top = maxTop;
      if (top < minTop) top = minTop;

      el.style.top = Math.round(top) + 'px';
      el.style.left = Math.round(left) + 'px';
    }

    // Clean up the picker DOM + listeners when the editor is removed (e.g.
    // composer closes, or another composer takes over). Without this, every
    // open/close cycle would leak an <em-emoji-picker> custom element on
    // document.body and a window listener.
    extend(TextEditor.prototype, 'onremove', function () {
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
      if (this._flamojiLoader) return;
      const loader = document.createElement('div');
      loader.className = 'flamoji-picker-loader';
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
        try { this._flamojiLoader.remove(); } catch (e) { /* already detached */ }
        this._flamojiLoader = null;
      }
    }

    /**
     * Replace the loader's spinner with an inline error card + Retry button.
     * Complements the existing top-of-page Alert (which can be missed if the
     * user is focused on the composer). Retry re-runs the same load path.
     */
    function showLoaderError(retryCb) {
      // If the loader hasn't materialized yet (load failed faster than
      // LOADER_DELAY_MS), mount it now so the error has a surface to live on.
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

    /**
     * emoji-mart's picker lives entirely behind a Shadow DOM, so external
     * stylesheets can't reach the category headers, search input, etc.
     * The picker exposes a few CSS custom properties (handled in our LESS
     * file), but the rest needs CSS injected into the shadow root after
     * mount. Adopting a sheet is idempotent — re-runs are no-ops because
     * we tag the element.
     */
    function injectShadowStyles(picker) {
      const root = picker.shadowRoot;
      if (!root || root.querySelector('style[data-flamoji]')) return;

      // Category headers (`.sticky`) and the search input live behind
      // emoji-mart's Shadow DOM. Bring them closer to Flarum's form/section
      // aesthetic via an injected sheet:
      //
      // - Headers: slightly larger, semi-bold, with a subtle bottom border
      //   so categories read as real sections (not just floating labels).
      //   Use the picker's own background color so they blend when sticky.
      // - Search: 1px border + a real focus ring using Flarum's primary
      //   accent. The default emoji-mart input is borderless; with our
      //   tighter --em-rgb-input matching Flarum's @control-bg, that made
      //   the field disappear into the chrome.
      const css = `
        /* Match the original emoji-button look: medium-weight, ~13px,
           secondary text color (Flarum's @muted-color piped in via the
           --flamoji-category-header-color custom prop in less/forum.less).
           Subtle bottom border + background so the sticky header reads
           cleanly when categories scroll behind it. */
        .sticky {
          font-weight: 700;
          font-size: 15px;
          text-transform: none;
          color: var(--flamoji-category-header-color, rgba(var(--em-rgb-color), 0.75));
          background: rgb(var(--em-rgb-background));
          padding: 14px 12px 8px !important;
          border-bottom: 1px solid var(--em-color-border);
          margin-bottom: 4px;
        }
        .search input[type="search"] {
          font-size: 14px;
          border: 1px solid var(--em-color-border);
          padding-top: 9px;
          padding-bottom: 9px;
          transition: border-color 120ms ease, box-shadow 120ms ease;
        }
        .search input[type="search"]:focus {
          border-color: rgb(var(--em-rgb-accent));
          box-shadow: 0 0 0 2px rgba(var(--em-rgb-accent), 0.25);
          outline: none;
        }
        .search .icon {
          opacity: 0.5;
        }
        nav button {
          padding: 6px 0;
        }
      `;
      const style = document.createElement('style');
      style.setAttribute('data-flamoji', '');
      style.textContent = css;
      root.appendChild(style);
    }

    /**
     * Construct the emoji-mart Picker for this TextEditor instance, append
     * it to flamojiContainer, and show it. Called only on the first picker
     * open per editor instance; subsequent opens just toggle visibility.
     */
    function buildPicker(emojiMartModule, dataModule, response) {
      const baseUrl = app.forum.attribute('baseUrl');
      const { Picker } = emojiMartModule;
      const data = dataModule.default || dataModule;

      const specifiedCategories = JSON.parse(app.forum.attribute('flamoji.specify_categories'));
      const sortingArr = getEmojiCategories();
      // Order of `categories` in the picker prop drives nav-tab order.
      specifiedCategories.sort((a, b) => sortingArr.indexOf(a) - sortingArr.indexOf(b));

      // Build a lookup keyed by the id we set on each custom emoji entry,
      // so the onEmojiSelect handler can find the configured replacement
      // text without round-tripping through paths or URLs.
      const customEmojiReplacers = {};
      const customEmojis = [];
      const customEntries = [];

      response['data'].forEach((customEmoji) => {
        const path = customEmoji['attributes']['path'];
        const title = customEmoji['attributes']['title'];
        const replacer = customEmoji['attributes']['text_to_replace'];
        // Use the path as a stable id; paths are unique in the custom-emoji table.
        const id = 'flamoji-' + path;

        // emoji-mart's SearchIndex tokenizes name + each keyword and does
        // prefix matching per token. Build a comprehensive keyword set
        // from both the title and the shortcode so users can find the
        // emoji by typing any word in either, regardless of separator
        // (space, dash, underscore) or surrounding colons.
        const stripped = replacer.replace(/^:|:$/g, '');
        const keywords = new Set();
        [title, stripped].forEach((src) => {
          if (!src) return;
          keywords.add(src.toLowerCase());
          src.toLowerCase().split(/[\s\-_]+/).filter(Boolean).forEach((tok) => keywords.add(tok));
        });

        customEmojiReplacers[id] = replacer;
        customEntries.push({
          id,
          name: title,
          keywords: Array.from(keywords),
          skins: [{ src: urlChecker(path) ? path : baseUrl + path }],
        });
      });

      if (customEntries.length) {
        customEmojis.push({
          id: 'flamoji_custom',
          name: app.translator.trans('pianotell-flamoji.forum.emoji-mart.categories.custom'),
          emojis: customEntries,
        });

        // emoji-mart's `categories` prop is an explicit allow-list. If we
        // pass `custom` items but don't include their category id here,
        // the picker silently hides the entire Custom tab. Append the
        // custom group's id to the allow-list so it shows up at the end.
        if (specifiedCategories.indexOf('flamoji_custom') === -1) {
          specifiedCategories.push('flamoji_custom');
        }
      }

      const autoHide = !!app.forum.attribute('flamoji.auto_hide');
      const showRecents = !!app.forum.attribute('flamoji.show_recents');
      const showPreview = !!app.forum.attribute('flamoji.show_preview');
      const showSearch = !!app.forum.attribute('flamoji.show_search');
      const showVariants = !!app.forum.attribute('flamoji.show_variants');
      const showCategoryButtons = !!app.forum.attribute('flamoji.show_category_buttons');

      // emoji-mart's `categories` prop is an explicit allow-list. When
      // showRecents is enabled, we still need 'frequent' on the list or
      // the Frequently Used category is silently filtered out — even
      // though maxFrequentRows > 0 would otherwise enable it. Prepend so
      // it appears first as emoji-mart expects.
      if (showRecents && specifiedCategories.indexOf('frequent') === -1) {
        specifiedCategories.unshift('frequent');
      }

      // Match the picker's emoji rendering to what posts will actually
      // display: the core flarum/emoji extension rewrites unicode to
      // Twemoji <img>; without it, posts render OS-native glyphs. The
      // `picker_set` admin setting can force one or the other; default
      // `auto` follows whatever the core extension is doing.
      const pickerSet = app.forum.attribute('flamoji.picker_set') || 'auto';
      const hasEmojiExt = !!app.forum.attribute('flamoji.has_emoji_extension');
      const useTwemoji = pickerSet === 'twemoji' || (pickerSet === 'auto' && hasEmojiExt);

      const picker = new Picker({
        data,
        custom: customEmojis,
        categories: specifiedCategories,
        i18n: buildI18n(),
        // 'auto' tracks the user's OS color-scheme preference. Better than
        // hardcoding 'light' on forums with dark themes — the picker would
        // otherwise pop up bright-white against dark chrome.
        theme: 'auto',
        autoFocus: false,
        set: useTwemoji ? 'twitter' : 'native',
        ...(useTwemoji ? { getSpritesheetURL: () => TWEMOJI_SPRITESHEET_URL } : {}),
        // Tile sizing — use emoji-mart defaults (perLine: 9,
        // emojiSize: 24, emojiButtonSize: 36). We previously bumped
        // these for a chunkier grid, but at larger sizes WebKit's
        // sub-pixel-rounded IntersectionObserver in emoji-mart's
        // NavBar reliably mis-picks the previous category when
        // clicking Travel & Places / Flags (the indicator highlights
        // the wrong icon). Defaults stay clean across all category
        // configurations.
        previewPosition: showPreview ? 'bottom' : 'none',
        searchPosition: showSearch ? 'sticky' : 'none',
        skinTonePosition: showVariants ? 'preview' : 'none',
        navPosition: showCategoryButtons ? 'top' : 'none',
        maxFrequentRows: showRecents ? (parseInt(app.forum.attribute('flamoji.frequent_rows'), 10) || 4) : 0,
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
      // Tear down the loading placeholder right before the real picker is
      // attached so positioning math (which is shared) sees the correct
      // mount target.
      unmountPickerLoader.call(this);
      document.body.appendChild(picker);
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

      const loadAndBuild = () => Promise.all([
        import(/* webpackChunkName: "emoji-mart" */ 'emoji-mart'),
        import(/* webpackChunkName: "emoji-mart-data" */ '@emoji-mart/data/sets/15/twitter.json'),
        app.request({
          method: 'GET',
          url: app.forum.attribute('apiUrl') + '/pianotell/emojis',
          params: { filter: { all: 1 } },
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
          // Defensive: a corrupt or proxied API response could leave us
          // without the expected JSON:API shape. Coerce to an empty list
          // rather than crashing inside the forEach loop.
          const safeResponse = response && Array.isArray(response.data)
            ? response
            : { data: [] };
          buildPicker.call(this, emojiMartModule, dataModule, safeResponse);
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
