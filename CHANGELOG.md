### 2.4.0 — 2026-06-30

- **Style custom emojis by category from your own CSS.** Custom emojis now render with a `data-flamoji-category` attribute on the wrapping `<span>` carrying the emoji's category, so you can target them per category — e.g. `span.flamoji[data-flamoji-category="Stickers"] img { height: 35px }`. Uncategorized emojis are unchanged.

### 2.3.0 — 2026-06-26

- **Frequently Used now starts empty and reflects only emoji you've actually used.** On a fresh browser it previously pre-filled with emoji-mart's built-in "popular" defaults — generic Unicode emoji unrelated to your forum, and in sticker/custom-only mode (or with categories disabled) even emoji the picker couldn't insert. The tab now begins empty and fills from each member's own picks — the standard emoji-picker behavior — saved per browser.
- **Removed the "Pre-populate with popular emojis" admin setting** (added in 2.1.0). Suppressing those defaults is now built-in and unconditional, so the toggle is no longer needed; the stored setting is cleaned up automatically on upgrade.
- **Fixed: the Frequently Used tab was missing in sticker mode.** Sticker mode restricts the picker to your custom emoji, but its category filter also dropped Frequently Used even when enabled. It now stays available (surfacing your most-used stickers) and follows the "Show frequently used emojis" setting just like normal mode.

### 2.2.1 — 2026-06-25

- **Shortcode convention enforcement** — the emoji trigger field is now labelled **Shortcode** and validates the recommended `:word:` format (wrapped in colons; letters, numbers, `_`, `+`, `-` only) when you add an emoji or change an existing one's shortcode. This prevents bare-word triggers (e.g. `png`) that the formatter would otherwise match anywhere in a post. Existing shortcodes are grandfathered: editing a legacy emoji's other fields won't force you to fix its trigger.
- **Backwards-compatible import** — JSON import still accepts legacy (non-canonical) shortcodes so older exports keep working; it now surfaces a non-blocking notice listing any imported shortcodes that don't follow the convention.

### 2.2.0 — 2026-06-25

- **Custom emoji categories** — custom emojis can now be organized into named tabs in the picker. Assign each emoji a freeform **Category** in the admin panel; emojis sharing a category appear together under their own picker tab, with the category's first emoji as the tab icon. Emojis left without a category stay in the default Custom tab. Categories are included in JSON import/export.
- **Sticker mode** — a new admin toggle ("Emoji Settings" → "Sticker mode") that renders custom emoji as large stickers forum-wide: in posts, the live composer preview, and an enlarged picker grid. The picker adapts responsively to the screen (mobile-friendly). Since only custom emoji are enlarged, the picker is restricted to your custom emoji while sticker mode is on. Off by default; nothing changes unless enabled.

### 2.1.0 — 2026-05-03

- **New admin setting: "Pre-populate with popular emojis"** — controls whether the Frequently Used tab starts with emoji-mart's built-in popular defaults or begins empty. Default ON preserves existing behavior. When OFF, the tab appears only after the user picks their first emoji; picks persist in localStorage.
- Renamed "Recently Used" to "Frequently Used" throughout (locale key unchanged — existing translations are unaffected).

### 2.0.2 — 2026-04-26

- Move picker shadow fix from global CSS to JS inline style.

### 2.0.1 — 2026-04-26

- Fix picker popup missing box-shadow (emoji-mart's `--shadow-color` CSS property clashed with Flarum's).

### 2.0.0 — 2026-04-25

- **Ported to Flarum 2.x.** Requires `flarum/core: ^2.0.0-beta` and `php: ^8.3`.
- Added picker variant and admin console baseline tests.

### 1.4.0 — 2026-06-30

- **Style custom emojis by category from your own CSS.** Custom emojis now render with a `data-flamoji-category` attribute on the wrapping `<span>` carrying the emoji's category, so you can target them per category — e.g. `span.flamoji[data-flamoji-category="Stickers"] img { height: 35px }`. Uncategorized emojis are unchanged.

### 1.3.0 — 2026-06-27

- **Custom emoji categories** — organize custom emojis into named tabs in the picker. Assign each emoji a freeform **Category** in the admin panel; emojis sharing a category appear together under their own picker tab, with the category's first emoji as the tab icon. Emojis left without a category stay in the default Custom tab. Categories are included in JSON import/export.
- **Sticker mode** — a new admin toggle ("Emoji Settings" → "Sticker mode") that renders custom emoji as large stickers forum-wide: in posts, the live composer preview, and an enlarged picker grid. The picker adapts responsively to the screen (mobile-friendly). Since only custom emoji are enlarged, the picker is restricted to your custom emoji while sticker mode is on. Off by default; nothing changes unless enabled.
- **Shortcode convention enforcement** — the emoji trigger field is now labelled **Shortcode** and validates the recommended `:word:` format (wrapped in colons; letters, numbers, `_`, `+`, `-` only) when you add an emoji or change an existing one's shortcode. This prevents bare-word triggers (e.g. `png`) that the formatter would otherwise match anywhere in a post. Existing shortcodes are grandfathered. Custom emoji triggers must now also be unique. JSON import stays tolerant of legacy shortcodes and surfaces a non-blocking notice listing any that don't follow the convention.
- **Frequently Used now starts empty and reflects only emoji you've actually used.** It no longer pre-fills with emoji-mart's built-in "popular" defaults (generic Unicode emoji unrelated to your forum). The tab begins empty and fills from each member's own picks — the standard emoji-picker behavior — saved per browser. The "Pre-populate with popular emojis" admin setting (added in 1.1.0) has been removed; its stored value is cleaned up automatically on upgrade.

### 1.1.0 — 2026-05-03

- **New admin setting: "Pre-populate with popular emojis"** — controls whether the Frequently Used tab starts with emoji-mart's built-in popular defaults or begins empty. Default ON preserves existing behavior. When OFF, the tab appears only after the user picks their first emoji; picks persist in localStorage.
- Renamed "Recently Used" to "Frequently Used" throughout (locale key unchanged — existing translations are unaffected).

### 0.1.0 — 2026-04-20

- **Replaced the discontinued [`emoji-button`](https://github.com/joeattardi/emoji-button) (and its archived successor [`picmo`](https://github.com/joeattardi/picmo)) with [`emoji-mart`](https://github.com/missive/emoji-mart)** (Missive, MIT). Picker glyphs continue to use [Twemoji](https://github.com/jdecked/twemoji) via a jsDelivr-hosted spritesheet — no extra assets ship with the extension.
- Removed four settings without an emoji-mart analogue. A migration handles the rename and rewrites stored category lists from the old taxonomy to emoji-mart's.
- Bumped requirements to `flarum/core: ^1.8.0` and `php: >=8.1`.
- Renamed package to [`pianotell/flarum-ext-flamoji`](https://github.com/PrimateCoder/flarum-flamoji) which `replace`s the upstream [`the-turk/flarum-flamoji`](https://discuss.flarum.org/d/28095-flamoji) so the two can't be installed together. A migration cleans up orphan settings rows from the upstream extension if it was previously installed.
