/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

import { saveAs } from 'file-saver';
import Button from 'flarum/common/components/Button';
import app from 'flarum/common/app';
import Component from 'flarum/common/Component';
import CustomEmojiList from './CustomEmojiList';
import EditEmojiModal from './EditEmojiModal';
import listItems from 'flarum/common/helpers/listItems';
import ItemList from 'flarum/common/utils/ItemList';

// sessionStorage key used to carry a post-import notice across the page
// reload that import triggers.
const IMPORT_NOTICE_KEY = 'flamoji.importLegacyShortcodes';

export default class CustomEmojiSection extends Component {
  oninit(vnode) {
    super.oninit(vnode);

    // If a prior import (which reloads the page) flagged legacy shortcodes,
    // surface a non-blocking warning now that we've reloaded.
    try {
      const stashed = sessionStorage.getItem(IMPORT_NOTICE_KEY);
      if (stashed) {
        sessionStorage.removeItem(IMPORT_NOTICE_KEY);
        const legacy = JSON.parse(stashed);
        if (Array.isArray(legacy) && legacy.length) {
          app.alerts.show(
            { type: 'warning' },
            app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.import_legacy_shortcodes', {
              count: legacy.length,
              shortcodes: legacy.join(', '),
            })
          );
        }
      }
    } catch (e) {
      // sessionStorage / JSON failures are non-fatal — skip the notice.
    }
  }

  exportEmojiList() {
    var customEmojiList = {};

    app.store.find('pianotell/emojis', { filter: { all: 1 } }).then((results) => {
      results.payload.data.map((emoji, i) => {
        const attr = emoji.attributes;

        customEmojiList[i] = {
          title: attr.title,
          text_to_replace: attr.text_to_replace,
          category: attr.category,
          path: attr.path,
        };
      });

      var blob = new Blob([JSON.stringify(customEmojiList)], { type: 'application/json;charset=utf-8' });
      saveAs(blob, 'flamoji.json');
    });
  }

  importEmojiList() {
    if (!confirm(app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.import_emojis_message'))) return;

    var input = document.createElement('input');
    input.type = 'file';

    input.onchange = (e) => {
      app.customEmojiListState.loading = true;

      // getting a hold of the file reference
      var file = e.target.files[0];

      // setting up the reader
      var reader = new FileReader();
      reader.readAsText(file, 'UTF-8');

      // here we tell the reader what to do when it's done reading...
      reader.onload = (readerEvent) => {
        app
          .request({
            method: 'POST',
            url: `${app.forum.attribute('apiUrl')}/pianotell/import-emojis`,
            body: { data: JSON.parse(readerEvent.target.result) },
          })
          .then((response) => {
            const legacy = (response && response.legacyShortcodes) || [];
            if (Array.isArray(legacy) && legacy.length) {
              // Stash for after the reload below.
              try {
                sessionStorage.setItem(IMPORT_NOTICE_KEY, JSON.stringify(legacy));
              } catch (e) {
                // non-fatal
              }
            }
            EditEmojiModal.prototype.clearCache().then(() => window.location.reload());
          });
      };
    };

    input.click();
  }

  flamojiTopItems() {
    const items = new ItemList();

    items.add(
      'import',
      <Button icon="fas fa-sign-in-alt" onclick={() => this.importEmojiList()}>
        {app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.import_json_button')}
      </Button>
    );

    items.add(
      'export',
      <Button icon="fas fa-share" onclick={() => this.exportEmojiList()}>
        {app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.export_json_button')}
      </Button>
    );

    return items;
  }

  view() {
    return (
      <div className="ExtensionPage-customFlamoji">
        <div className="ExtensionPage-customFlamoji-header">
          <div className="container">
            <div className="ExtensionTitle">
              <div className="ExtensionName">
                <h2>{app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.heading_title')}</h2>
              </div>
              <div class="ExtensionPage-headerTopItems">
                <ul>{listItems(this.flamojiTopItems().toArray())}</ul>
              </div>
            </div>
          </div>
        </div>
        <div className="container">
          <CustomEmojiList />
        </div>
      </div>
    );
  }
}
