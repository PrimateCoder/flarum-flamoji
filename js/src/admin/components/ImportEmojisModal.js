/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

import app from 'flarum/common/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import Switch from 'flarum/common/components/Switch';
import EditEmojiModal from './EditEmojiModal';

export default class ImportEmojisModal extends Modal {
  oninit(vnode) {
    super.oninit(vnode);
    this.jsonPayload = '';
    this.loading = false;
    this.overrideMode = false;
    this.overrideConfirmed = false;
  }

  className() {
    return 'Flamoji-ImportEmojisModal Modal--medium';
  }

  title() {
    return app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.import_json_button');
  }

  content() {
    return (
      <div className="Modal-body">
        <div className="Form">
          <div className="Form-group">
            <div className="helpText">{app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.import_emojis_message')}</div>
            <div className="Form-group">
              <input type="file" id="import-json-file" accept=".json" style={{ display: 'none' }} onchange={this.handleFileUpload.bind(this)} />
              <Button className="Button" icon="fas fa-upload" onclick={() => document.getElementById('import-json-file').click()}>
                {app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.upload_json_button')}
              </Button>
            </div>
            <textarea
              className="FormControl"
              rows="10"
              value={this.jsonPayload}
              oninput={(e) => (this.jsonPayload = e.target.value)}
              placeholder='[{"title": "My Emoji", "text_to_replace": ":myemoji:", "path": "/assets/myemoji.png", "category": "Custom"}]'
            />
          </div>

          <div className="Form-group">
            <Switch state={this.overrideMode} onchange={this.toggleOverride.bind(this)}>
              {app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.import_override_mode')}
            </Switch>
          </div>

          {this.overrideMode && (
            <div className="Alert Alert--error Form-group">
              <p>
                <strong>{app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.import_override_warning')}</strong>
              </p>
              <label className="checkbox">
                <input type="checkbox" checked={this.overrideConfirmed} onchange={(e) => (this.overrideConfirmed = e.target.checked)} />
                {app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.import_override_confirm')}
              </label>
            </div>
          )}

          <div className="Form-group">
            <Button
              type="submit"
              className="Button Button--primary Button--block"
              loading={this.loading}
              disabled={!this.jsonPayload.trim() || (this.overrideMode && !this.overrideConfirmed)}
              onclick={this.onsubmit.bind(this)}
            >
              {app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.import_json_button')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  toggleOverride(val) {
    this.overrideMode = val;
    this.overrideConfirmed = false;
  }

  handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      this.jsonPayload = evt.target.result;
      m.redraw();
    };
    reader.readAsText(file);

    // Reset input so the same file can be selected again if needed
    e.target.value = '';
  }

  onsubmit(e) {
    e.preventDefault();

    let data;
    try {
      let rawData = JSON.parse(this.jsonPayload);
      if (Array.isArray(rawData)) {
        data = rawData;
      } else if (rawData && typeof rawData === 'object') {
        const uncategorized = app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.emoji_list.uncategorized', {}, true);
        const uncategorizedStr = Array.isArray(uncategorized) ? uncategorized.join('') : String(uncategorized || 'Uncategorized');

        // Flatten grouped emojis
        data = [];
        for (const [category, emojis] of Object.entries(rawData)) {
          if (Array.isArray(emojis)) {
            emojis.forEach((emoji) => {
              if (typeof emoji === 'object') {
                data.push({
                  ...emoji,
                  category: category !== uncategorizedStr ? category : emoji.category,
                });
              }
            });
          }
        }
      } else {
        throw new Error('Payload must be an array or a grouped object.');
      }
    } catch (err) {
      app.alerts.show({ type: 'error' }, 'Invalid JSON: ' + err.message);
      return;
    }

    this.loading = true;

    app
      .request({
        method: 'POST',
        url: `${app.forum.attribute('apiUrl')}/flamojis/import`,
        body: { data, mode: this.overrideMode ? 'override' : 'append' },
      })
      .then((response) => {
        const legacy = (response && response.legacyShortcodes) || [];
        if (Array.isArray(legacy) && legacy.length) {
          try {
            sessionStorage.setItem('flamoji.importLegacyShortcodes', JSON.stringify(legacy));
          } catch (e) {
            // non-fatal
          }
        }
        EditEmojiModal.prototype.clearCache().then(() => window.location.reload());
      })
      .catch((err) => {
        this.loading = false;
        m.redraw();
        throw err;
      });
  }
}
