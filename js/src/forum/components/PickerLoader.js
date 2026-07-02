/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

import Component from 'flarum/common/Component';

/**
 * The loading/error placeholder popup shown while the emoji-mart chunks and
 * the custom-emoji API are fetched on first picker open. Rendered into a
 * body-level container and positioned imperatively by the caller (so it can
 * escape the composer footer's `overflow: auto` clipping, exactly like the
 * real picker). This component only owns the *content* declaratively — the
 * two visual states (loading spinner vs. error card + Retry) that the old
 * imperative code toggled with `document.createElement` / `replaceChildren`.
 *
 * Attrs:
 * - `state`        'loading' | 'error'
 * - `sticker`      boolean — adds the `--sticker` size-matching modifier
 * - `onRetry`      () => void — click handler for the error-state Retry button
 * - `loadingLabel` string — "Loading emojis…"
 * - `errorLabel`   string — load-failed message
 * - `retryLabel`   string — Retry button caption
 *
 * The root element/class contract (`.flamoji-picker-loader`, `role="status"`,
 * `aria-live="polite"`, `__spinner`, `__label`, `__retry`, `--error`,
 * `--sticker`) is asserted by tests/ux/picker-loading.spec.mjs and must be
 * preserved.
 */
export default class PickerLoader extends Component {
  view() {
    const { state, sticker, onRetry, loadingLabel, errorLabel, retryLabel } = this.attrs;
    const isError = state === 'error';

    const className = ['flamoji-picker-loader', sticker ? 'flamoji-picker-loader--sticker' : '', isError ? 'flamoji-picker-loader--error' : '']
      .filter(Boolean)
      .join(' ');

    return (
      <div className={className} role="status" aria-live="polite">
        {isError
          ? [
              <div className="flamoji-picker-loader__label">{errorLabel}</div>,
              <button type="button" className="Button Button--primary flamoji-picker-loader__retry" onclick={onRetry}>
                {retryLabel}
              </button>,
            ]
          : [
              <div className="flamoji-picker-loader__spinner" aria-hidden="true" />,
              <div className="flamoji-picker-loader__label">{loadingLabel}</div>,
            ]}
      </div>
    );
  }
}
