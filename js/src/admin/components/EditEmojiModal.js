/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

import Form from 'flarum/common/components/Form';
import app from 'flarum/common/app';
import Alert from 'flarum/common/components/Alert';
import Button from 'flarum/common/components/Button';
import FormModal from 'flarum/common/components/FormModal';
import ItemList from 'flarum/common/utils/ItemList';
import Stream from 'flarum/common/utils/Stream';
import urlChecker from '../../common/utils/urlChecker';

/**
 * The `EditEmojiModal` component shows a modal dialog which allows the user
 * to add or edit a emoji.
 */
export default class EditEmojiModal extends FormModal {
  oninit(vnode) {
    super.oninit(vnode);

    this.emoji = this.attrs.model || app.store.createRecord('flamojis');

    this.emojiTitle = Stream(this.emoji.title() || '');
    this.textToReplace = Stream(this.emoji.textToReplace() || '');
    this.category = Stream(this.emoji.category() || '');
    this.path = Stream(this.emoji.path() || '');

    // Remember the stored trigger so we can grandfather it: an existing
    // (possibly legacy, non-canonical) shortcode that the admin doesn't
    // change must still be saveable when editing other fields.
    this.originalTrigger = (this.emoji.textToReplace() || '').trim();
  }

  // Canonical shortcode format, mirrored from the server (EmojiRules).
  // Returns an error string when the *changed* trigger isn't canonical, or
  // null when it's valid or an unchanged legacy value.
  shortcodeError() {
    const value = this.textToReplace().trim();
    if (value === '') return null; // emptiness handled on submit / server-side
    // Grandfather an unchanged existing trigger.
    if (this.emoji.exists && value === this.originalTrigger) return null;
    if (!/^:[a-zA-Z0-9_+-]+:$/.test(value)) {
      return app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.edit_emoji.shortcode_invalid', {}, true);
    }
    return null;
  }

  className() {
    return 'EditEmojiModal Modal--small';
  }

  title() {
    let url = '';

    if (this.path()) url = urlChecker(this.path()) ? this.path() : app.forum.attribute('baseUrl') + this.path();

    return this.emojiTitle()
      ? this.path()
        ? [m('img', { className: 'EditEmojiModal-titleEmoji', src: url, alt: this.emojiTitle() }), this.emojiTitle()]
        : this.emojiTitle()
      : app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.edit_emoji.modal_title');
  }

  content() {
    return (
      <div className="Modal-body">
        <p className="helpText" style="margin-bottom: 15px;">
          {app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.edit_emoji.intro_text')}
        </p>
        <Form>{this.fields().toArray()}</Form>
      </div>
    );
  }

  fields() {
    const items = new ItemList();

    items.add(
      'title',
      <div className="Form-group">
        <label>{app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.edit_emoji.emoji_title_label')}</label>
        <input className="FormControl" bidi={this.emojiTitle} />
        <div className="helpText">{app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.edit_emoji.emoji_title_text')}</div>
      </div>,
      50
    );

    const shortcodeError = this.shortcodeError();

    items.add(
      'textToReplace',
      <div className={'Form-group' + (shortcodeError ? ' has-error' : '')}>
        <label>{app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.edit_emoji.text_to_replace_label')}</label>
        <input className="FormControl" placeholder=":myemoji_partyparrot:" bidi={this.textToReplace} />
        <div className={'helpText' + (shortcodeError ? ' EditEmojiModal-error' : '')}>
          {shortcodeError || app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.edit_emoji.text_to_replace_text')}
        </div>
      </div>,
      40
    );

    items.add(
      'category',
      <div className="Form-group">
        <label>{app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.edit_emoji.category_label')}</label>
        <input
          className="FormControl"
          list="flamoji-category-suggestions"
          maxlength="255"
          placeholder={app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.edit_emoji.category_placeholder', {}, true)}
          bidi={this.category}
        />
        <datalist id="flamoji-category-suggestions">
          {this.existingCategories().map((c) => (
            <option value={c} />
          ))}
        </datalist>
        <div className="helpText">{app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.edit_emoji.category_text')}</div>
      </div>,
      35
    );

    items.add(
      'path',
      <div className="Form-group">
        <label>{app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.edit_emoji.path_or_url_label')}</label>
        <input className="FormControl" placeholder="/assets/emojis/batman.png" bidi={this.path} />
        <div className="helpText">{app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.edit_emoji.path_or_url_text')}</div>
      </div>,
      30
    );

    items.add(
      'submit',
      <div className="Form-group">
        {Button.component(
          {
            type: 'submit',
            className: 'Button Button--primary EditEmojiModal-save',
            loading: this.loading,
            disabled: !!shortcodeError,
          },
          app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.edit_emoji.submit_button')
        )}
        {this.emoji.exists ? (
          <button type="button" className="Button EditEmojiModal-delete" onclick={this.delete.bind(this)}>
            {app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.edit_emoji.delete_emoji_button')}
          </button>
        ) : (
          ''
        )}
      </div>,
      -10
    );

    return items;
  }

  submitData() {
    return {
      title: this.emojiTitle(),
      text_to_replace: this.textToReplace(),
      category: this.category().trim() || null,
      path: this.path(),
    };
  }

  /**
   * Distinct, sorted list of category names already in use, sourced from
   * the emoji records loaded in the store. Drives the <datalist> so admins
   * reuse existing spellings instead of accidentally creating near-dupes.
   */
  existingCategories() {
    const seen = new Set();
    app.store.all('flamojis').forEach((emoji) => {
      const c = (emoji.category() || '').trim();
      if (c) seen.add(c);
    });
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }

  onsubmit(e) {
    e.preventDefault();

    // Defense-in-depth: the submit button is disabled when invalid, but
    // guard here too (e.g. Enter key) so we never POST a non-canonical
    // shortcode the server will reject.
    if (this.shortcodeError()) return;

    this.loading = true;

    const exists = this.emoji.exists;

    this.emoji
      .save(this.submitData())
      .then((emoji) => {
        if (!exists) app.customEmojiListState.addToList(emoji);
        // Cache clearing is best-effort: the formatter cache is keyed
        // and will be regenerated on next request, so a failure here
        // (e.g. transient permission issue on storage/cache) shouldn't
        // block the user. Surface it as a non-fatal warning.
        return this.clearCache().catch((err) => this.showCacheClearWarning(err));
      })
      .then(() => {
        this.hide();
        this.showSuccessMessage();
      })
      .catch(this.onerror.bind(this))
      .then(() => {
        this.loading = false;
        m.redraw();
      });
  }

  delete() {
    if (!confirm(app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.edit_emoji.delete_emoji_confirmation', {}, true))) {
      return;
    }

    this.loading = true;

    this.emoji
      .delete()
      .then(() => {
        app.customEmojiListState.removeFromList(this.emoji.id());
        return this.clearCache().catch((err) => this.showCacheClearWarning(err));
      })
      .then(() => {
        this.hide();
        this.showSuccessMessage();
      })
      .catch(this.onerror.bind(this))
      .then(() => {
        this.loading = false;
        m.redraw();
      });
  }

  showSuccessMessage() {
    return app.alerts.show(
      Alert,
      { type: 'success' },
      app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.edit_emoji.saved_message')
    );
  }

  showCacheClearWarning(err) {
    // eslint-disable-next-line no-console
    console.warn('Flamoji: failed to clear formatter cache after emoji change', err);
    app.alerts.show(
      Alert,
      { type: 'warning' },
      'Saved, but the formatter cache could not be cleared automatically. New emoji may take a moment to render in existing posts.'
    );
  }

  // Seems like we need to clear cache
  // to tell TextFormatter that some changes
  // have been made on the configurator.
  clearCache() {
    return app.request({
      method: 'DELETE',
      url: app.forum.attribute('apiUrl') + '/cache',
    });
  }
}
