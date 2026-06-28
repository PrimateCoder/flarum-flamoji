/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

import Model from 'flarum/common/Model';
import mixin from 'flarum/common/utils/mixin';

export default class Emoji extends mixin(Model, {
  title: Model.attribute('title'),
  textToReplace: Model.attribute('text_to_replace'),
  category: Model.attribute('category'),
  path: Model.attribute('path'),
}) {
  apiEndpoint() {
    return '/pianotell/emojis' + (this.exists ? '/' + this.data.id : '');
  }
}
