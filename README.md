# Flamoji

[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/PrimateCoder/flarum-flamoji/blob/master/LICENSE) [![Latest Stable Version](https://img.shields.io/packagist/v/pianotell/flarum-ext-flamoji.svg)](https://packagist.org/packages/pianotell/flarum-ext-flamoji) [![Total Downloads](https://img.shields.io/packagist/dt/pianotell/flarum-ext-flamoji.svg)](https://packagist.org/packages/pianotell/flarum-ext-flamoji)

Simple emoji manager for Flarum.

> **About this fork:** This is a fork of [`the-turk/flarum-flamoji`](https://discuss.flarum.org/d/28095-flamoji) (originally by [Hasan Özbey](https://github.com/the-turk)). This fork is published as [`pianotell/flarum-ext-flamoji`](https://github.com/PrimateCoder/flarum-flamoji) and was originally created for [🎹 Piano | Tell](https://pianotell.com), but now available to all. It has substantial changes from the original including replacing [emoji-button](https://github.com/joeattardi/emoji-button) with [emoji-mart](https://github.com/missive/emoji-mart). All credit for the original extension belongs to the original author.

Screenshot:

![Picker](https://raw.githubusercontent.com/PrimateCoder/flarum-flamoji/main/docs/screenshots/picker.png)

## Features

- Built on [emoji-mart](https://github.com/missive/emoji-mart) (Missive, MIT). Originally based on [joeattardi/emoji-button](https://github.com/joeattardi/emoji-button) — migrated in this fork after the upstream picker was archived.
- Add an emoji picker to the text editor (compatible with dark mode).
- **Picker style is configurable** — choose [Twemoji](https://github.com/jdecked/twemoji) glyphs (sourced from a jsDelivr-hosted spritesheet) or your operating system's native emoji font, or leave the picker on `Auto` to mirror what posts actually display (Twemoji when [`flarum/emoji`](https://github.com/flarum/emoji) is enabled, native otherwise).
- Add custom emojis to the picker.
- **Organize custom emojis into named categories** — assign each a freeform category and it gets its own tab in the picker. Each category is also exposed on rendered emoji so you can style them per category from your own CSS (see [Styling emojis by category](#styling-emojis-by-category)).
- **Sticker mode** — an optional admin toggle that renders custom emojis as large stickers in posts, the composer preview, and the picker.
- Import and export custom emoji configurations.
- Picker code and emoji data load lazily on first open (no impact on initial page load); when Twemoji is selected, the image spritesheet is fetched from jsDelivr on first picker render. Native mode adds zero image bytes.

## Installation

```bash
composer require pianotell/flarum-ext-flamoji
php flarum extension:enable pianotell-flamoji
```

## Updating

```bash
composer update pianotell/flarum-ext-flamoji
php flarum migrate
php flarum assets:publish
php flarum cache:clear
```

## Styling emojis by category

Custom emojis render with their category on the wrapping `<span>` as a
`data-flamoji-category` attribute (the exact category name you set in the
admin panel). This lets you size or style emojis per category from your own
theme/CSS — for example, to make everything in a "Stickers" category larger:

```css
span.flamoji[data-flamoji-category="Stickers"] img {
  height: 35px;
  vertical-align: bottom;
}
```

Uncategorized emojis render as plain `<span class="flamoji">` with no
attribute, so they're unaffected.

## Links

- [Source code on GitHub](https://github.com/PrimateCoder/flarum-flamoji)
- [Changelog](https://github.com/PrimateCoder/flarum-flamoji/blob/main/CHANGELOG.md)
- [Report an issue](https://github.com/PrimateCoder/flarum-flamoji/issues)
- [Download via Packagist](https://packagist.org/packages/pianotell/flarum-ext-flamoji)
- [Original project](https://discuss.flarum.org/d/28095-flamoji)
