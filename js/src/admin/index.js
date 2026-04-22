import { extend, override } from 'flarum/common/extend';

import app from 'flarum/common/app';
import AdminPage from 'flarum/admin/components/AdminPage';
import CustomEmojiListState from './states/CustomEmojiListState';
import CustomEmojiSection from './components/CustomEmojiSection';
import Emoji from '../common/models/Emoji';
import ExtensionPage from 'flarum/admin/components/ExtensionPage';
import getEmojiCategories from '../common/utils/getEmojiCategories';
import Select from 'flarum/common/components/Select';
import Stream from 'flarum/common/utils/Stream';
import Switch from 'flarum/common/components/Switch';

app.initializers.add('pianotell-flamoji', (app) => {
  app.store.models.emojis = Emoji;
  app.customEmojiListState = new CustomEmojiListState();

  extend(ExtensionPage.prototype, ['oncreate', 'onupdate'], function () {
    if (this.extension.id != 'pianotell-flamoji') return;

    const $recentsCountSetting = this.$('.recentsCountSetting');

    if (!this.setting(['pianotell-flamoji.show_recents'])()) {
      $recentsCountSetting.hide();
    } else {
      $recentsCountSetting.show();
    }
  });

  extend(ExtensionPage.prototype, 'oninit', function () {
    if (this.extension.id != 'pianotell-flamoji') return;

    this.specifiedCategories = Stream(JSON.parse(this.setting(['pianotell-flamoji.specify_categories'])() || []))();
  });

  extend(ExtensionPage.prototype, 'sections', function (items) {
    if (this.extension.id != 'pianotell-flamoji') return;

    items.has('permissions') ? items.remove('permissions') : '';

    items.add('customFlamoji', <CustomEmojiSection />);
  });

  override(AdminPage.prototype, 'dirty', function (original) {
    if (!this.extension || this.extension.id != 'pianotell-flamoji') return original();

    const dirty = {};

    const specifiedCategories = JSON.stringify(this.specifiedCategories);

    if (specifiedCategories !== this.setting(['pianotell-flamoji.specify_categories'])()) {
      dirty['pianotell-flamoji.specify_categories'] = specifiedCategories;
    }

    Object.keys(this.settings).forEach((key) => {
      const value = this.settings[key]();

      if (value !== app.data.settings[key]) {
        dirty[key] = value;
      }
    });

    return dirty;
  });

  app.extensionData.for('pianotell-flamoji').registerSetting(function () {
    return (
      <div className="Flamoji--settingsContainer">
        <div className="Flamoji--generalUISettingsContainer">
          <h3>{app.translator.trans('pianotell-flamoji.admin.settings.general_ui_settings_heading')}</h3>
          <hr />
          <div className="Flamoji--generalUISetting">
            <div className="Form-group">
              <Switch
                state={!!this.setting(['pianotell-flamoji.auto_hide'])() && this.setting(['pianotell-flamoji.auto_hide'])() !== '0'}
                onchange={this.settings['pianotell-flamoji.auto_hide']}
              >
                {app.translator.trans('pianotell-flamoji.admin.settings.auto_hide_label')}
              </Switch>
            </div>
            <div className="helpText">{app.translator.trans('pianotell-flamoji.admin.settings.auto_hide_text')}</div>
          </div>
          <div className="Flamoji--generalUISetting">
            <div className="Form-group">
              <Switch
                state={!!this.setting(['pianotell-flamoji.show_preview'])() && this.setting(['pianotell-flamoji.show_preview'])() !== '0'}
                onchange={this.settings['pianotell-flamoji.show_preview']}
              >
                {app.translator.trans('pianotell-flamoji.admin.settings.show_preview_label')}
              </Switch>
            </div>
            <div className="helpText" />
          </div>
          <div className="Flamoji--generalUISetting">
            <div className="Form-group">
              <Switch
                state={!!this.setting(['pianotell-flamoji.show_search'])() && this.setting(['pianotell-flamoji.show_search'])() !== '0'}
                onchange={this.settings['pianotell-flamoji.show_search']}
              >
                {app.translator.trans('pianotell-flamoji.admin.settings.show_search_label')}
              </Switch>
            </div>
            <div className="helpText" />
          </div>
        </div>

        <div className="Flamoji--emojiSettingsContainer">
          <h3>{app.translator.trans('pianotell-flamoji.admin.settings.emoji_settings_heading')}</h3>
          <hr />
          <div className="Flamoji--emojiSetting">
            <div className="Form-group">
              <Switch
                state={!!this.setting(['pianotell-flamoji.show_variants'])() && this.setting(['pianotell-flamoji.show_variants'])() !== '0'}
                onchange={this.settings['pianotell-flamoji.show_variants']}
              >
                {app.translator.trans('pianotell-flamoji.admin.settings.show_variants_label')}
              </Switch>
            </div>
            <div className="helpText">{app.translator.trans('pianotell-flamoji.admin.settings.show_variants_text')}</div>
          </div>
          <div className="Flamoji--emojiSetting">
            <div className="Form-group">
              <label>{app.translator.trans('pianotell-flamoji.admin.settings.picker_set_label')}</label>
              <Select
                value={this.setting(['pianotell-flamoji.picker_set'])() || 'auto'}
                options={{
                  auto: app.translator.trans('pianotell-flamoji.admin.settings.picker_set_auto'),
                  twemoji: app.translator.trans('pianotell-flamoji.admin.settings.picker_set_twemoji'),
                  native: app.translator.trans('pianotell-flamoji.admin.settings.picker_set_native'),
                }}
                buttonClassName="Button"
                onchange={this.settings['pianotell-flamoji.picker_set']}
              />
            </div>
            <div className="helpText">{app.translator.trans('pianotell-flamoji.admin.settings.picker_set_text')}</div>
          </div>
        </div>

        <div className="Flamoji--categorySettingsContainer">
          <h3>{app.translator.trans('pianotell-flamoji.admin.settings.category_settings_heading')}</h3>
          <hr />
          <div className="Flamoji--categorySetting">
            <div className="Form-group">
              <Switch
                state={
                  !!this.setting(['pianotell-flamoji.show_category_buttons'])() && this.setting(['pianotell-flamoji.show_category_buttons'])() !== '0'
                }
                onchange={this.settings['pianotell-flamoji.show_category_buttons']}
              >
                {app.translator.trans('pianotell-flamoji.admin.settings.show_category_buttons_label')}
              </Switch>
            </div>
            <div className="helpText" />
          </div>
          <div className="Flamoji--categorySetting">
            <div className="Form-group">
              <Switch
                state={!!this.setting(['pianotell-flamoji.show_recents'])() && this.setting(['pianotell-flamoji.show_recents'])() !== '0'}
                onchange={this.settings['pianotell-flamoji.show_recents']}
              >
                {app.translator.trans('pianotell-flamoji.admin.settings.show_recents_label')}
              </Switch>
            </div>
            <div className="helpText" />
          </div>
          <div className="Flamoji--categorySetting recentsCountSetting">
            <div className="Form-group recentsCountGroup">
              <label>{app.translator.trans('pianotell-flamoji.admin.settings.frequent_rows_label')}</label>
              <input className="FormControl" type="number" min="1" max="10" bidi={this.setting('pianotell-flamoji.frequent_rows')} />
            </div>
            <div className="helpText">{app.translator.trans('pianotell-flamoji.admin.settings.frequent_rows_text')}</div>
          </div>
          <div className="Flamoji--categorySetting specifyCategoriesSetting">
            <div className="Form-group specifyCategoriesGroup">
              <label>{app.translator.trans('pianotell-flamoji.admin.settings.specify_categories_label')}</label>
              <div className="helpText">{app.translator.trans('pianotell-flamoji.admin.settings.specify_categories_text')}</div>
              <div className="options">
                {getEmojiCategories().map((category) => {
                  return (
                    <div className="cat-checkbox">
                      <input
                        type="checkbox"
                        name="specifyCats[]"
                        checked={this.specifiedCategories.indexOf(category) > -1}
                        onchange={(change) => {
                          if (change.target.checked) {
                            this.specifiedCategories.push(category);
                          } else {
                            const index = this.specifiedCategories.indexOf(category);

                            if (index > -1) {
                              this.specifiedCategories.splice(index, 1);
                            }
                          }
                        }}
                      />
                      <label for={category}>{app.translator.trans('pianotell-flamoji.admin.settings.emoji_categories.' + category)}</label>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  });
});

// Forward-compat: see js/src/forum/index.js for the same pattern. Exposes
// our admin extension surface so 2.x's Export Registry (and any future
// extension that wants to extend our admin UI) can reach it.
import CustomEmojiList_ from './components/CustomEmojiList';
import CustomEmojiSection_ from './components/CustomEmojiSection';
import EditEmojiModal_ from './components/EditEmojiModal';
import CustomEmojiListState_ from './states/CustomEmojiListState';
import Emoji_ from '../common/models/Emoji';

export default Object.freeze({
  components: {
    CustomEmojiList: CustomEmojiList_,
    CustomEmojiSection: CustomEmojiSection_,
    EditEmojiModal: EditEmojiModal_,
  },
  states: {
    CustomEmojiListState: CustomEmojiListState_,
  },
  models: {
    Emoji: Emoji_,
  },
});
