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

### 0.1.0 — 2026-04-20

- **Replaced the discontinued [`emoji-button`](https://github.com/joeattardi/emoji-button) (and its archived successor [`picmo`](https://github.com/joeattardi/picmo)) with [`emoji-mart`](https://github.com/missive/emoji-mart)** (Missive, MIT). Picker glyphs continue to use [Twemoji](https://github.com/jdecked/twemoji) via a jsDelivr-hosted spritesheet — no extra assets ship with the extension.
- Removed four settings without an emoji-mart analogue. A migration handles the rename and rewrites stored category lists from the old taxonomy to emoji-mart's.
- Bumped requirements to `flarum/core: ^1.8.0` and `php: >=8.1`.
- Renamed package to [`pianotell/flarum-ext-flamoji`](https://github.com/PrimateCoder/flarum-flamoji) which `replace`s the upstream [`the-turk/flarum-flamoji`](https://discuss.flarum.org/d/28095-flamoji) so the two can't be installed together. A migration cleans up orphan settings rows from the upstream extension if it was previously installed.
