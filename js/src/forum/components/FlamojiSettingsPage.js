/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

import app from 'flarum/common/app';
import Alert from 'flarum/common/components/Alert';
import Button from 'flarum/common/components/Button';
import FieldSet from 'flarum/common/components/FieldSet';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import Switch from 'flarum/common/components/Switch';
import UserPage from 'flarum/forum/components/UserPage';
import icon from 'flarum/common/helpers/icon';
import extractText from 'flarum/common/utils/extractText';
import getEmojiCategories from '../../common/utils/getEmojiCategories';
import buildPickerConfig from '../utils/buildPickerConfig';
import {
  DISABLED_PREF_KEY,
  FREQUENT_CATEGORY_ID,
  ORDER_PREF_KEY,
  STICKER_SKELETON,
  buildOrderedCategoryItems,
  ensureWebpackAssetConfig,
  extractEmojiArray,
  extractNavCategorySvgs,
  getCategoryOrder,
  getDisabledCategories,
  injectShadowStyles,
  loadEmojiMartModule,
  loadSortableModule,
  loadUnicodeDataset,
} from '../utils/customEmojiCategories';

const t = 'pianotell-flamoji.forum.settings.';
const cachedBuiltinIcons = new Map();

/**
 * Dedicated user settings page (`/settings/flamoji`) where members can
 * enable/disable standard (including Frequently Used) and custom emoji
 * categories, reorder them via SortableJS or arrow buttons, and test the live
 * preview.
 */
export default class FlamojiSettingsPage extends UserPage {
  oninit(vnode) {
    super.oninit(vnode);

    if (!app.session.user) {
      m.route.set('/');
      return;
    }

    this.show(app.session.user);
    app.setTitle(extractText(app.translator.trans(t + 'title')));

    this.loadingEmojis = true;
    this.loadError = false;
    this.savingPreferences = false;
    this.rawEmojis = [];
    this.selectedPreviewEmoji = null;

    // Extracted emoji-mart SVG icons keyed by category ID ('people', 'frequent', ...).
    this.builtinIcons = cachedBuiltinIcons;

    this._disposed = false;
    this._pickerEl = null;
    this._emojiMartModule = null;
    this._dataModule = null;
    this._Sortable = null;
    this._sortable = null;

    this._loadPageData();
  }

  onremove(vnode) {
    this._disposed = true;
    this._destroySortable();
    this._unmountPicker();
    if (super.onremove) super.onremove(vnode);
  }

  _loadPageData() {
    ensureWebpackAssetConfig();

    const stickerMode = !!app.forum.attribute('flamoji.sticker_mode');
    const loadJs = loadEmojiMartModule();
    // Don't fail the whole settings page if the optional SortableJS chunk
    // isn't published yet (e.g. before `php flarum assets:publish`); arrow
    // buttons still work as a fallback.
    const loadSortable = loadSortableModule().catch((err) => {
      console.warn('[pianotell-flamoji] sortablejs chunk failed to load; drag-and-drop disabled:', err);
      return null;
    });
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

    Promise.all([loadJs, loadData, loadApi, loadSortable])
      .then(([emojiMartModule, dataModule, response, Sortable]) => {
        if (this._disposed) return;
        this._emojiMartModule = emojiMartModule;
        this._dataModule = dataModule;
        this._Sortable = Sortable;
        this.rawEmojis = extractEmojiArray(response);
        // Probe standard category SVG icons BEFORE mounting the live preview
        // picker so the probe never overwrites emoji-mart's global
        // Data.categories singleton after the preview renders.
        return this._probeStandardCategoryIcons().then(() => {
          if (this._disposed) return;
          this.loadingEmojis = false;
          m.redraw();
        });
      })
      .catch((err) => {
        console.error('[pianotell-flamoji] failed to load emoji settings page:', err);
        if (this._disposed) return;
        this.loadingEmojis = false;
        this.loadError = true;
        m.redraw();
      });
  }

  /**
   * Harvest emoji-mart's own category SVG icons from a mounted picker's Shadow
   * DOM so the settings list uses the exact same icons as the picker nav bar
   * without hardcoding any icon paths or glyphs.
   */
  _harvestIconsWhenReady(pickerEl, onDone, redrawOnSuccess = true) {
    let attempts = 0;
    const poll = () => {
      if (this._disposed) {
        if (onDone) onDone();
        return;
      }
      const gotIcons = extractNavCategorySvgs(pickerEl, this.builtinIcons);
      if (gotIcons) {
        if (redrawOnSuccess) m.redraw();
        if (onDone) onDone();
        return;
      }
      attempts += 1;
      if (attempts < 40) {
        requestAnimationFrame(poll);
      } else if (onDone) {
        onDone();
      }
    };
    requestAnimationFrame(poll);
  }

  /**
   * Run a hidden one-time probe Picker before the live preview mounts so we
   * capture every standard Unicode category SVG (including disabled ones).
   */
  _probeStandardCategoryIcons() {
    if (!this._emojiMartModule || !this._dataModule) return Promise.resolve();

    const standardIds = getEmojiCategories();
    const stickerMode = !!app.forum.attribute('flamoji.sticker_mode') && this.rawEmojis.length > 0;
    if (stickerMode || standardIds.every((id) => this.builtinIcons.has(id))) {
      return Promise.resolve();
    }

    const { Picker, options } = buildPickerConfig(this._emojiMartModule, this._dataModule, this.rawEmojis);
    const probe = new Picker({
      ...options,
      categories: standardIds,
      navPosition: 'top',
      previewPosition: 'none',
      searchPosition: 'none',
      skinTonePosition: 'none',
      maxFrequentRows: 0,
    });
    probe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;visibility:hidden;pointer-events:none;';
    document.body.appendChild(probe);

    return new Promise((resolve) => {
      this._harvestIconsWhenReady(
        probe,
        () => {
          try {
            probe.remove();
          } catch (e) {
            /* already detached */
          }
          resolve();
        },
        false
      );
    });
  }

  items() {
    return buildOrderedCategoryItems(this.rawEmojis, this.user);
  }

  toggleCategory(item, enabled) {
    const items = this.items();
    const currentOrder = items.map((i) => i.token);
    const currentDisabled = getDisabledCategories(this.user);

    let nextDisabled;
    if (enabled) {
      nextDisabled = currentDisabled.filter((entry) => entry !== item.token && !(item.type === 'custom' && entry === item.key));
    } else {
      const cleaned = item.type === 'custom' ? currentDisabled.filter((entry) => entry !== item.key) : currentDisabled;
      nextDisabled = Array.from(new Set([...cleaned, item.token]));
    }

    this.savePrefs({
      [DISABLED_PREF_KEY]: nextDisabled,
      [ORDER_PREF_KEY]: currentOrder,
    });
  }

  moveCategory(fromIndex, toIndex) {
    const order = this.items().map((i) => i.token);
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= order.length || toIndex >= order.length || fromIndex === toIndex) {
      return;
    }

    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);

    this.savePrefs({
      [ORDER_PREF_KEY]: order,
    });
  }

  resetToDefaults() {
    this.selectedPreviewEmoji = null;
    this.savePrefs({
      [DISABLED_PREF_KEY]: [],
      [ORDER_PREF_KEY]: [],
    });
  }

  savePrefs(prefs) {
    if (!this.user) return;

    const previousPrefs = { ...(this.user.preferences() || {}) };
    this.user.pushAttributes({
      preferences: {
        ...previousPrefs,
        ...prefs,
      },
    });
    this.savingPreferences = true;
    this.rebuildMockupPicker();
    m.redraw();

    this.user
      .savePreferences(prefs)
      .catch((err) => {
        this.user.pushAttributes({ preferences: previousPrefs });
        this.rebuildMockupPicker();
        if (app.alerts) {
          app.alerts.show(Alert, { type: 'error', dismissible: true }, app.translator.trans('core.lib.error.generic_message'));
        }
        console.error('[pianotell-flamoji] failed to save user preferences:', err);
      })
      .finally(() => {
        if (this._disposed) return;
        this.savingPreferences = false;
        m.redraw();
      });
  }

  // ---------------------------------------------------------------------
  // SortableJS Drag-and-Drop
  // ---------------------------------------------------------------------

  _destroySortable() {
    if (this._sortable) {
      this._sortable.destroy();
      this._sortable = null;
    }
  }

  _initSortable(listEl) {
    if (!listEl || !this._Sortable) return;

    if (this._sortable) {
      if (this._sortable.el === listEl) {
        this._sortable.option('disabled', !!this.savingPreferences);
        return;
      }
      this._destroySortable();
    }

    this._sortable = this._Sortable.create(listEl, {
      animation: 150,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
      handle: '.FlamojiSettings-dragHandle',
      disabled: !!this.savingPreferences,
      ghostClass: 'FlamojiSettings-categoryRow--ghost',
      chosenClass: 'FlamojiSettings-categoryRow--chosen',
      dragClass: 'FlamojiSettings-categoryRow--drag',
      onEnd: (event) => {
        const { item, from, oldIndex, newIndex } = event;
        if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;

        // Put the DOM node back where Mithril expects it so keyed vnode
        // reconciliation stays in sync when Mithril re-renders the new order.
        from.insertBefore(item, from.children[oldIndex > newIndex ? oldIndex + 1 : oldIndex] || null);
        this.moveCategory(oldIndex, newIndex);
      },
    });
  }

  // ---------------------------------------------------------------------
  // Mock-up Picker
  // ---------------------------------------------------------------------

  _unmountPicker() {
    if (this._pickerEl && typeof this._pickerEl.remove === 'function') {
      try {
        this._pickerEl.remove();
      } catch (e) {
        /* already detached */
      }
    }
    this._pickerEl = null;
  }

  rebuildMockupPicker() {
    this._unmountPicker();

    if (!this.element || !this._emojiMartModule || !this._dataModule) return;
    const mount = this.element.querySelector('.FlamojiSettings-pickerMount');
    if (!mount) return;

    const hasEnabled = this.items().some((item) => item.enabled);
    if (!hasEnabled) return;

    const { Picker, options, customEmojiReplacers, effectiveStickerMode } = buildPickerConfig(
      this._emojiMartModule,
      this._dataModule,
      this.rawEmojis
    );

    const picker = new Picker({
      ...options,
      onEmojiSelect: (emoji) => {
        this.selectedPreviewEmoji = customEmojiReplacers[emoji.id] || emoji.native || '';
        m.redraw();
      },
    });

    picker.classList.add('flamoji-settings-mockup-picker');
    if (effectiveStickerMode) {
      picker.classList.add('flamoji-settings-mockup-picker--sticker');
    }
    picker.setAttribute('aria-label', extractText(app.translator.trans(t + 'preview_heading')));

    this._pickerEl = picker;
    mount.appendChild(picker);
    injectShadowStyles(picker);

    // Harvest any newly-rendered nav icons (for example `frequent` once the
    // user selects an emoji in the live preview).
    this._harvestIconsWhenReady(picker);
  }

  _renderBuiltinIcon(id) {
    const svgData = this.builtinIcons.get(id);
    if (svgData) {
      return (
        <span className="FlamojiSettings-builtinIcon" aria-hidden="true">
          <svg viewBox={svgData.viewBox} xmlns="http://www.w3.org/2000/svg">
            {svgData.children.map((child) => m(child.tag, { ...child.attrs }))}
          </svg>
        </span>
      );
    }

    const fallbackIcon = id === FREQUENT_CATEGORY_ID ? 'far fa-clock' : 'far fa-smile';
    return (
      <span className="FlamojiSettings-builtinIcon" aria-hidden="true">
        {icon(fallbackIcon)}
      </span>
    );
  }

  content() {
    if (this.loadingEmojis) {
      return (
        <div className="FlamojiSettingsPage FlamojiSettingsPage--loading">
          <LoadingIndicator />
        </div>
      );
    }

    if (this.loadError) {
      return (
        <div className="FlamojiSettingsPage">
          <p className="FlamojiSettings-loadError">{app.translator.trans('pianotell-flamoji.forum.composer.picker_load_error')}</p>
        </div>
      );
    }

    const items = this.items();
    const hasEnabled = items.some((item) => item.enabled);
    const isDefault = getDisabledCategories(this.user).length === 0 && getCategoryOrder(this.user).length === 0;

    const moveUpLabel = extractText(app.translator.trans(t + 'move_up_tooltip'));
    const moveDownLabel = extractText(app.translator.trans(t + 'move_down_tooltip'));

    return (
      <div className="FlamojiSettingsPage SettingsPage">
        <div className="FlamojiSettingsPage-controls">
          <FieldSet className="Settings-flamoji" label={app.translator.trans(t + 'emoji_categories_heading')}>
            <p className="helpText">{app.translator.trans(t + 'emoji_categories_help')}</p>
            <div
              className="FlamojiSettings-categoryList"
              oncreate={(vnode) => this._initSortable(vnode.dom)}
              onupdate={(vnode) => this._initSortable(vnode.dom)}
            >
              {items.map((item, index) => {
                const rowClasses = ['FlamojiSettings-categoryRow', !item.enabled ? 'is-disabled' : ''].filter(Boolean).join(' ');

                return (
                  <div key={item.token} data-token={item.token} className={rowClasses}>
                    <span className="FlamojiSettings-dragHandle" aria-hidden="true">
                      {icon('fas fa-grip-vertical')}
                    </span>

                    <div className="FlamojiSettings-reorderButtons">
                      <Button
                        className="Button Button--icon FlamojiSettings-moveBtn"
                        icon="fas fa-arrow-up"
                        title={moveUpLabel}
                        aria-label={moveUpLabel}
                        disabled={this.savingPreferences || index === 0}
                        onclick={() => this.moveCategory(index, index - 1)}
                      />
                      <Button
                        className="Button Button--icon FlamojiSettings-moveBtn"
                        icon="fas fa-arrow-down"
                        title={moveDownLabel}
                        aria-label={moveDownLabel}
                        disabled={this.savingPreferences || index === items.length - 1}
                        onclick={() => this.moveCategory(index, index + 1)}
                      />
                    </div>

                    <div className="FlamojiSettings-categoryMeta">
                      <div className="FlamojiSettings-categoryTitleRow">
                        {item.type === 'builtin' && this._renderBuiltinIcon(item.key)}
                        <span className="FlamojiSettings-categoryName">{item.name}</span>
                        <span className={'FlamojiSettings-badge FlamojiSettings-badge--' + item.type}>
                          {app.translator.trans(t + (item.type === 'builtin' ? 'standard_badge' : 'custom_badge'))}
                        </span>
                      </div>

                      {item.type === 'custom' && item.emojis.length > 0 && (
                        <div className="FlamojiSettings-categoryPreview" aria-hidden="true">
                          {item.emojis.slice(0, 5).map((emoji) => (
                            <img className="FlamojiSettings-previewImg" src={emoji.src} alt={emoji.title || ''} />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="FlamojiSettings-categoryToggle">
                      <Switch state={item.enabled} loading={this.savingPreferences} onchange={(val) => this.toggleCategory(item, val)} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="FlamojiSettings-actions">
              <Button
                className="Button FlamojiSettings-resetBtn"
                icon="fas fa-undo"
                onclick={() => this.resetToDefaults()}
                disabled={isDefault || this.savingPreferences}
                loading={this.savingPreferences}
              >
                {app.translator.trans(t + 'reset_button')}
              </Button>
            </div>
          </FieldSet>
        </div>

        <div className="FlamojiSettingsPage-preview">
          <FieldSet className="Settings-flamojiPreview" label={app.translator.trans(t + 'preview_heading')}>
            <p className="helpText">{app.translator.trans(t + 'preview_help')}</p>
            {!hasEnabled && <div className="FlamojiSettings-pickerEmpty">{app.translator.trans(t + 'preview_empty')}</div>}
            <div className="FlamojiSettings-pickerMount" oncreate={() => this.rebuildMockupPicker()} />
            {this.selectedPreviewEmoji && (
              <div className="FlamojiSettings-selectedPreview">
                {app.translator.trans(t + 'preview_selected', { shortcode: this.selectedPreviewEmoji })}
              </div>
            )}
          </FieldSet>
        </div>
      </div>
    );
  }
}
