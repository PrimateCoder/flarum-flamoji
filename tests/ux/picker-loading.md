# Picker loading indicator UX test

## Behavior under test

When the user clicks the Flamoji toolbar button for the first time in an
editor, the picker's emoji-mart chunks (~600KB) and custom-emoji API call
take measurable time to resolve. While they're in flight, a placeholder
**loading popup** appears at the picker's eventual position, containing
a spinner and the localized label "Loading emojis…". When everything
loads, the loader is removed and the real picker takes its place. If the
load fails (network error, 5xx on the API, blocked chunk), the loader
swaps to an inline error card with a Retry button.

## Assertions

1. **Loader appears** when the picker is loading.
   - Selector: `div.flamoji-picker-loader` on `document.body`
   - Must contain `.flamoji-picker-loader__spinner` and a label with the
     "Loading emojis…" text.
   - Must be positioned (has non-empty inline `top`/`left` styles).

2. **Loader is removed** once the picker mounts.
   - After `em-emoji-picker.flamoji-picker-popup` is in the DOM and its
     shadow root has the search input, `.flamoji-picker-loader` must be
     absent.

3. **Loader swaps to error state** if the API request fails.
   - Intercept `/api/pianotell/emojis` and return HTTP 500.
   - Loader gains class `flamoji-picker-loader--error`.
   - Retry button (`.flamoji-picker-loader__retry`) is present and clickable.

4. **Retry re-fires the load**.
   - Remove the route interception.
   - Click the Retry button.
   - Assert that `em-emoji-picker.flamoji-picker-popup` mounts.

5. **Spam-click guard**: rapid repeated clicks on the picker button while
   the load is in flight must mount **exactly one** `.flamoji-picker-loader`,
   not one per click.

6. **Reposition on viewport change**: while the loader is visible,
   resizing the viewport must keep the loader on-screen and update its
   `top` (positioning re-runs via the resize listener).

7. **Editor unmount cleanup**: closing the composer while the loader is
   still mounted must remove it from `document.body` (no orphan). This
   exercises the `onremove` teardown path that clears both the pending
   `setTimeout` and the mounted element.

8. **Cached re-open path**: after the picker has loaded once, closing
   and re-opening it (still on the same editor instance) must NOT mount
   a loader — `onPickerButtonClick` short-circuits to a `display:` toggle.

## Out of scope

- Time-budget assertions (chunk download speed varies)
- Scrim / backdrop behavior (loader is a popup, not a modal)
- A11y audit beyond the role="status" / aria-live="polite" attributes
