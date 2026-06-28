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
