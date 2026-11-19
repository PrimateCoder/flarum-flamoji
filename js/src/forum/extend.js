/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

import Extend from 'flarum/common/extenders';
import FlamojiSettingsPage from './components/FlamojiSettingsPage';

export default [new Extend.Routes().add('settings.flamoji', '/settings/flamoji', FlamojiSettingsPage)];
