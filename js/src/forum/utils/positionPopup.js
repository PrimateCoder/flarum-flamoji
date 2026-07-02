/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

/**
 * Position a popup element as a fixed-position popup relative to a toolbar
 * button. Shared by the real emoji-mart picker and the loading placeholder.
 * Two placement modes:
 *
 * Primary: centered horizontally on `buttonEl`, floating above it. As the
 * viewport shrinks vertically, the popup slides up to stay on-screen rather
 * than clipping at the top.
 *
 * Fallback (when the button is so close to a viewport edge that a
 * button-centered popup wouldn't fit): center on `composerEl` horizontally,
 * and align the popup's vertical center with the composer's bottom edge —
 * the popup hovers over the bottom of the composer.
 *
 * In both modes the final coordinates are clamped to the viewport so the
 * popup stays fully visible. The popup is expected to live at document.body
 * level with `position: fixed`, so viewport coordinates from
 * getBoundingClientRect are used directly (page scroll is already accounted
 * for — no offset math needed).
 *
 * No-ops until the element has measurable dimensions: emoji-mart populates
 * its Shadow DOM asynchronously after appendChild, so the first call right
 * after mount sees width/height of 0. Callers re-run this via a
 * ResizeObserver once the element takes its real shape.
 *
 * @param {HTMLElement} el         The popup element to position.
 * @param {HTMLElement} buttonEl   The flamoji toolbar button (anchor).
 * @param {HTMLElement} composerEl The composer body (fallback anchor).
 */
export default function positionPopup(el, buttonEl, composerEl) {
  if (!el || !buttonEl) return;

  const btnRect = buttonEl.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  if (!elRect.width || !elRect.height) return;

  const margin = 6;
  const screenPadding = 8;

  const minLeft = screenPadding;
  const maxLeft = window.innerWidth - elRect.width - screenPadding;
  const minTop = screenPadding;
  const maxTop = window.innerHeight - elRect.height - screenPadding;

  // Try primary placement: horizontally centered on the button.
  const btnCenterX = btnRect.left + btnRect.width / 2;
  let left = btnCenterX - elRect.width / 2;
  let top;

  if ((left < minLeft || left > maxLeft) && composerEl) {
    // Fallback: horizontally center on the composer body, vertically anchor
    // the popup's center to the composer's bottom edge.
    const composerRect = composerEl.getBoundingClientRect();
    left = composerRect.left + (composerRect.width - elRect.width) / 2;
    top = composerRect.bottom - elRect.height / 2;
  } else {
    // Primary: float above the button; slide up rather than clip if there
    // isn't enough room above.
    top = btnRect.top - margin - elRect.height;
  }

  // Final clamp keeps the popup fully on-screen in either mode.
  if (left > maxLeft) left = maxLeft;
  if (left < minLeft) left = minLeft;
  if (top > maxTop) top = maxTop;
  if (top < minTop) top = minTop;

  el.style.top = Math.round(top) + 'px';
  el.style.left = Math.round(left) + 'px';
}
