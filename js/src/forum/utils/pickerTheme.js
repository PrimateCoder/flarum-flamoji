/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

/**
 * Compute emoji-mart --rgb-* triplets from Flarum's live CSS custom
 * properties and inject them as inline styles on the picker element. This
 * adapts to the active color scheme (light, dark, high-contrast) without
 * hardcoding any color values.
 */
export function injectEmojiMartRgbVars(picker) {
  const style = getComputedStyle(document.documentElement);
  const toRgb = (cssVar) => {
    const raw = style.getPropertyValue(cssVar).trim();
    if (!raw) return null;
    // Parse the computed color value by drawing it through a temp element
    const el = document.createElement('div');
    el.style.color = raw;
    document.body.appendChild(el);
    const computed = getComputedStyle(el).color;
    document.body.removeChild(el);
    // computed is "rgb(r, g, b)" or "rgba(r, g, b, a)"
    const m = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? `${m[1]}, ${m[2]}, ${m[3]}` : null;
  };

  const bg = toRgb('--body-bg') || '255, 255, 255';
  const input = toRgb('--control-bg') || '240, 240, 240';
  const color = toRgb('--text-color') || '17, 17, 17';
  const accent = toRgb('--primary-color') || '69, 156, 211';

  picker.style.setProperty('--background-rgb', bg);
  picker.style.setProperty('--rgb-background', bg);
  picker.style.setProperty('--rgb-input', input);
  picker.style.setProperty('--rgb-color', color);
  picker.style.setProperty('--rgb-accent', accent);

  // emoji-mart sets its own --shadow-color that clashes with Flarum's.
  // Read Flarum's value from the root (before emoji-mart overrides it)
  // and apply the box-shadow directly as an inline style.
  const shadowColor = style.getPropertyValue('--shadow-color').trim();
  if (shadowColor) {
    picker.style.boxShadow = `0 2px 6px ${shadowColor}`;
  }
}

/**
 * emoji-mart's picker lives entirely behind a Shadow DOM, so external
 * stylesheets can't reach the category headers, search input, etc. The
 * picker exposes a few CSS custom properties (handled in our LESS file), but
 * the rest needs CSS injected into the shadow root after mount. Adopting a
 * sheet is idempotent — re-runs are no-ops because we tag the element.
 */
export function injectShadowStyles(picker) {
  const root = picker.shadowRoot;
  if (!root || root.querySelector('style[data-flamoji]')) return;

  // Category headers (`.sticky`) and the search input live behind
  // emoji-mart's Shadow DOM. Bring them closer to Flarum's form/section
  // aesthetic via an injected sheet:
  //
  // - Headers: slightly larger, semi-bold, with a subtle bottom border
  //   so categories read as real sections (not just floating labels).
  //   Use the picker's own background color so they blend when sticky.
  // - Search: 1px border + a real focus ring using Flarum's primary
  //   accent. The default emoji-mart input is borderless; with our
  //   tighter --em-rgb-input matching Flarum's @control-bg, that made
  //   the field disappear into the chrome.
  const css = `
    /* Match the original emoji-button look: medium-weight, ~13px,
       secondary text color (Flarum's @muted-color piped in via the
       --flamoji-category-header-color custom prop in less/forum.less).
       Subtle bottom border + background so the sticky header reads
       cleanly when categories scroll behind it. */
    .sticky {
      font-weight: 700;
      font-size: 15px;
      text-transform: none;
      color: var(--flamoji-category-header-color, rgba(var(--em-rgb-color), 0.75));
      background: rgb(var(--em-rgb-background));
      padding: 14px 12px 8px !important;
      border-bottom: 1px solid var(--em-color-border);
      margin-bottom: 4px;
    }
    .search input[type="search"] {
      font-size: 14px;
      border: 1px solid var(--em-color-border);
      padding-top: 9px;
      padding-bottom: 9px;
      transition: border-color 120ms ease, box-shadow 120ms ease;
    }
    .search input[type="search"]:focus {
      border-color: rgb(var(--em-rgb-accent));
      box-shadow: 0 0 0 2px rgba(var(--em-rgb-accent), 0.25);
      outline: none;
    }
    .search .icon {
      opacity: 0.5;
    }
    nav button {
      padding: 6px 0;
    }
  `;
  const style = document.createElement('style');
  style.setAttribute('data-flamoji', '');
  style.textContent = css;
  root.appendChild(style);
}
