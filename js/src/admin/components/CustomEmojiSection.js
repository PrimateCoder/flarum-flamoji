/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

import Button from 'flarum/common/components/Button';
import app from 'flarum/common/app';
import Component from 'flarum/common/Component';
import CustomEmojiList from './CustomEmojiList';
import ImportEmojisModal from './ImportEmojisModal';
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
    app
      .request({ method: 'GET', url: `${app.forum.attribute('apiUrl')}/flamojis/all` })
      .then((response) => {
        let emojis = [];
        if (Array.isArray(response)) {
          emojis = response;
        } else if (response && typeof response === 'object') {
          emojis = Object.keys(response)
            .filter((k) => !isNaN(k))
            .map((k) => response[k]);
        }

        if (emojis.length === 0) {
          app.alerts.show({ type: 'warning' }, app.translator.trans('core.forum.post_stream.no_results'));
          return;
        }

        const uncategorized = app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.emoji_list.uncategorized', {}, true);
        const uncategorizedStr = Array.isArray(uncategorized) ? uncategorized.join('') : String(uncategorized || 'Uncategorized');

        const groupedEmojis = {};
        emojis.forEach((emoji) => {
          let cat = (emoji.category || '').trim();
          if (!cat) cat = uncategorizedStr;

          if (!groupedEmojis[cat]) groupedEmojis[cat] = [];
          groupedEmojis[cat].push({
            title: emoji.title,
            text_to_replace: emoji.text_to_replace,
            category: emoji.category,
            path: emoji.path,
          });
        });

        const blob = new Blob([JSON.stringify(groupedEmojis, null, 2)], { type: 'application/json;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = 'flamoji.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      })
      .catch((err) => {
        app.alerts.show({ type: 'error' }, 'Failed to export emojis.');
        console.error(err);
      });
  }

  importEmojiList() {
    app.modal.show(ImportEmojisModal);
  }

  flamojiTopItems() {
    const items = new ItemList();

    items.add(
      'import',
      <Button className="Button" icon="fas fa-file-import" onclick={() => this.importEmojiList()}>
        {app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.import_json_button')}
      </Button>
    );

    items.add(
      'export',
      <Button className="Button" icon="fas fa-file-export" onclick={() => this.exportEmojiList()}>
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
              <div className="ExtensionPage-headerTopItems">
                <div className="ButtonGroup">{this.flamojiTopItems().toArray()}</div>
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
