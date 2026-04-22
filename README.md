# Flamoji

[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/PrimateCoder/flarum-flamoji/blob/master/LICENSE) [![Latest Stable Version](https://img.shields.io/packagist/v/pianotell/flarum-ext-flamoji.svg)](https://packagist.org/packages/pianotell/flarum-ext-flamoji) [![Total Downloads](https://img.shields.io/packagist/dt/pianotell/flarum-ext-flamoji.svg)](https://packagist.org/packages/pianotell/flarum-ext-flamoji)

Simple emoji manager for Flarum.

> **About this fork:** This is a maintained fork of [`the-turk/flarum-flamoji`](https://github.com/the-turk/flarum-flamoji) (originally by [Hasan Özbey](https://github.com/the-turk)), which is no longer maintained. This fork is published as `pianotell/flarum-ext-flamoji` and includes fixes and updates for [🎹 Piano | Tell](https://forum.pianotell.com). All credit for the original extension belongs to the original author.

> **Build note:** `cd js && npm install && npm run build`

Screenshots:

![Picker](https://i.imgur.com/I7l1s6O.png)

- [Settings](https://i.imgur.com/hqlbvZB.png)
- [Edit Emoji Modal](https://i.imgur.com/nonfIjB.png)

## Features

- Based on [joeattardi/emoji-button](https://github.com/joeattardi/emoji-button) repository.
- Add an emoji picker to the text editor (compatible with dark mode).
- Show Twemoji or unicode emojis in the picker.
- Search emojis in your own language.
- Add custom emojis to the picker.
- Import and export custom emoji configurations.
- Everything is dynamically loaded (no CDNs) when the picker is opened (there should be no performance impact until the user interacts with the picker).

## Installation

```bash
composer require pianotell/flarum-ext-flamoji
```

## Updating

```bash
composer update pianotell/flarum-ext-flamoji
php flarum migrate
php flarum assets:publish
php flarum cache:clear
```

### Import and Export Configurations

I added these features so we can share our custom emoji configurations. Just use the "Export JSON" button from the extension's settings page to export your configuration and "Import JSON" button to import others. However, importing action will only import the configuration, not the image files. You still need to upload those images manually into your server.

## Links

- [Source code on GitHub](https://github.com/PrimateCoder/flarum-flamoji)
- [Changelog](https://github.com/PrimateCoder/flarum-flamoji/blob/main/CHANGELOG.md)
- [Report an issue](https://github.com/PrimateCoder/flarum-flamoji/issues)
- [Download via Packagist](https://packagist.org/packages/pianotell/flarum-ext-flamoji)
- [Original (discontinued) project](https://github.com/the-turk/flarum-flamoji)
