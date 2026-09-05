/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

import app from 'flarum/common/app';
import Button from 'flarum/common/components/Button';
import Component from 'flarum/common/Component';
import EditEmojiModal from './EditEmojiModal';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import urlChecker from '../../common/utils/urlChecker';

export default class CustomEmojiList extends Component {
  oninit(vnode) {
    super.oninit(vnode);

    app.customEmojiListState.loadResults();
    this.editingCategory = null;
    this.newCategoryName = '';
    this.isUpdatingCategory = null;
  }

  getUncategorizedTranslation() {
    const translated = app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.emoji_list.uncategorized', {}, true);
    return Array.isArray(translated) ? translated.join('') : String(translated || 'Uncategorized');
  }

  startEditingCategory(category) {
    this.editingCategory = category;
    this.newCategoryName = category === this.getUncategorizedTranslation() ? '' : category;
  }

  saveCategory(oldCategory) {
    if (!this.editingCategory) return;

    const newName = this.newCategoryName.trim();
    this.editingCategory = null;

    const uncategorized = this.getUncategorizedTranslation();

    if (newName === oldCategory || (newName === '' && oldCategory === uncategorized)) {
      return;
    }

    this.isUpdatingCategory = oldCategory;

    // The server renames EVERY emoji in the category in one atomic
    // transaction — including rows the list has not loaded (it
    // paginates). The "Uncategorized" group holds null-category rows
    // and is addressed with from: null; real categories are addressed
    // by their literal name. Literal strings are stored as data, so a
    // category legitimately named "Uncategorized" survives a rename.
    const from = oldCategory === uncategorized ? null : oldCategory;
    const to = newName === '' ? null : newName;

    const state = app.customEmojiListState;

    app
      .request({
        method: 'POST',
        url: `${app.forum.attribute('apiUrl')}/flamojis/rename-category`,
        body: { from, to },
      })
      .then(() => {
        this.isUpdatingCategory = null;
        // Re-fetch the list: the server changed rows the local state
        // may not have loaded.
        state.emojis = [];
        state.loadResults();
        m.redraw();
      })
      .catch((err) => {
        console.error(err);
        this.isUpdatingCategory = null;
        m.redraw();
      });
  }

  exportCategory(categoryName, emojis) {
    const exportData = {
      [categoryName]: emojis.map((emoji) => ({
        title: emoji.title(),
        text_to_replace: emoji.textToReplace(),
        category: emoji.category(),
        path: emoji.path(),
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `flamoji-${categoryName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }

  view() {
    const state = app.customEmojiListState;
    const uncategorized = this.getUncategorizedTranslation();

    // Group emojis by category. Null-prototype so a category literally
    // named "__proto__" (freeform data, the server allows it) cannot
    // hijack the grouping and crash the list.
    const groupedEmojis = Object.create(null);
    state.emojis.forEach((emoji) => {
      let cat = (emoji.category() || '').trim();
      if (!cat) cat = uncategorized;

      if (!groupedEmojis[cat]) groupedEmojis[cat] = [];
      groupedEmojis[cat].push(emoji);
    });

    const categories = Object.keys(groupedEmojis).sort((a, b) => a.localeCompare(b));

    return (
      <div className="customEmoji-list">
        {/* Loading */}
        {state.isLoading() && state.emojis.length === 0 ? <LoadingIndicator display="unset" size="large" /> : ''}

        {/* Add Emoji Button */}
        <ul>
          <li>
            <div class="customEmoji addEmoji" title={app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.edit_emoji.modal_title')}>
              <div className="customEmoji-imageWrapper">
                <Button
                  className="Button Button--icon customEmoji-addButton"
                  icon="fas fa-plus"
                  aria-label={app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.emoji_list.add_button', {}, true)}
                  onclick={() => app.modal.show(EditEmojiModal)}
                />
              </div>
            </div>
          </li>
        </ul>

        {/* Emoji list grouped by category */}
        {categories.map((category) => (
          <div className="customEmoji-categoryGroup">
            <h3>
              {this.editingCategory === category ? (
                <form
                  onsubmit={(e) => {
                    e.preventDefault();
                    this.saveCategory(category);
                  }}
                >
                  <input
                    className="FormControl"
                    value={this.newCategoryName}
                    oninput={(e) => (this.newCategoryName = e.target.value)}
                    maxlength="255"
                  />
                  <Button type="submit" className="Button Button--primary" loading={this.isUpdatingCategory === category}>
                    {app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.emoji_list.rename_save_button')}
                  </Button>
                  <Button className="Button" onclick={() => (this.editingCategory = null)}>
                    {app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.emoji_list.rename_cancel_button')}
                  </Button>
                </form>
              ) : (
                <>
                  <span>
                    {category}
                    <Button
                      className="Button Button--icon Button--link customEmoji-categoryEditButton"
                      icon="fas fa-pencil-alt"
                      onclick={() => this.startEditingCategory(category)}
                    />
                    <Button
                      className="Button Button--icon Button--link customEmoji-categoryExportButton"
                      icon="fas fa-file-export"
                      title={app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.export_json_button')}
                      onclick={() => this.exportCategory(category, groupedEmojis[category])}
                    />
                    {this.isUpdatingCategory === category ? <LoadingIndicator display="inline" size="small" /> : ''}
                  </span>
                </>
              )}
            </h3>
            <ul>
              {groupedEmojis[category].map((emoji) => {
                const url = urlChecker(emoji.path()) ? emoji.path() : app.forum.attribute('baseUrl') + emoji.path();

                return (
                  <li>
                    <div class="customEmoji">
                      <Button
                        className="Button Button--icon customEmoji-editButton"
                        icon="fas fa-pencil-alt"
                        aria-label={app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.emoji_list.edit_button', {}, true)}
                        onclick={() => app.modal.show(EditEmojiModal, { model: emoji })}
                      />
                      <div className="customEmoji-imageWrapper">
                        <img src={url} className="customEmoji-image" alt={emoji.title()} title={emoji.textToReplace()} />
                      </div>
                      <div className="customEmoji-title">
                        <h4>{emoji.title()}</h4>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* Load more files */}
        {state.hasMoreResults() && (
          <div className="customEmoji-loadMore">
            <Button className="Button Button--primary" disabled={state.isLoading()} loading={state.isLoading()} onclick={() => state.loadMore()}>
              {app.translator.trans('pianotell-flamoji.admin.custom_emojis_section.emoji_list.load_more_button')}
            </Button>
          </div>
        )}
      </div>
    );
  }
}
