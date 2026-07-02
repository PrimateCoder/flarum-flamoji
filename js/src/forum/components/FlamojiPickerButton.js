/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

import TextEditorButton from './TextEditorButton';
import PickerController from '../PickerController';

/**
 * The flamoji toolbar button, and the Mithril host that owns the picker.
 *
 * Extends TextEditorButton (icon button + tooltip + `.Button-flamoji` class)
 * and additionally drives a per-instance `PickerController` from its OWN
 * lifecycle: `oninit` constructs the controller, `onremove` disposes it. The
 * button therefore scopes the picker's lifetime — no `extend()` hooks on
 * TextEditor.prototype and no `_flamoji*` state stashed on the editor.
 *
 * The button element is the natural positioning anchor, so this component also
 * satisfies the controller's small host interface:
 *   - `getButtonElement()` → the `.Button-flamoji` DOM node
 *   - `insertText(text)`   → insert at the composer's cursor
 *
 * Attrs:
 *   - `composer` the composer state (its `.editor` exposes insertAtCursor)
 *   - `title`    the tooltip / accessible label
 */
export default class FlamojiPickerButton extends TextEditorButton {
  oninit(vnode) {
    super.oninit(vnode);
    this.controller = new PickerController(this);
  }

  view(vnode) {
    // Reflect load state in the icon and route clicks to the controller on
    // every render (Flarum refreshes `this.attrs` from the vnode each update,
    // so these can't be set once in oninit).
    this.attrs.icon = this.controller.isLoading ? 'fas fa-spinner fa-pulse' : 'far fa-smile-wink';
    this.attrs.onclick = () => this.controller.toggle();
    return super.view(vnode);
  }

  onremove(vnode) {
    this.controller.dispose();
    if (super.onremove) super.onremove(vnode);
  }

  // --- host interface consumed by PickerController ---

  getButtonElement() {
    const el = this.element;
    if (!el) return null;
    // Flarum's Tooltip renders its child as the root, so `this.element` is
    // usually the button itself; fall back to a descendant lookup otherwise.
    if (el.matches && el.matches('.Button-flamoji')) return el;
    return el.querySelector ? el.querySelector('.Button-flamoji') : null;
  }

  insertText(text) {
    this.attrs.composer.editor.insertAtCursor(text);
  }
}
