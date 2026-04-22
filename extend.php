<?php

/**
 * This file is part of pianotell/flarum-ext-flamoji.
 *
 * Copyright (c) 2021 Hasan Özbey
 *
 * LICENSE: For the full copyright and license information,
 * please view the LICENSE file that was distributed
 * with this source code.
 */

namespace PianoTell\Flamoji;

use Flarum\Extend;
use s9e\TextFormatter\Configurator;
use PianoTell\Flamoji\Api\Controllers;

return [
    (new Extend\Frontend('forum'))
        ->css(__DIR__.'/less/forum.less')
        ->js(__DIR__.'/js/dist/forum.js'),

    (new Extend\Frontend('admin'))
        ->css(__DIR__.'/less/admin.less')
        ->js(__DIR__.'/js/dist/admin.js'),

    new Extend\Locales(__DIR__.'/locale'),

    (new Extend\Formatter)
        ->configure(ConfigureTextFormatter::class),

    (new Extend\Routes('api'))
        ->get('/pianotell/emojis', 'emojis.list', Controllers\ListEmojisController::class)
        ->post('/pianotell/emojis', 'emojis.create', Controllers\CreateEmojiController::class)
        ->post('/pianotell/import-emojis', 'emojis.import', Controllers\ImportEmojiController::class)
        ->patch('/pianotell/emojis/{id}', 'emojis.update', Controllers\UpdateEmojiController::class)
        ->delete('/pianotell/emojis/{id}', 'emojis.delete', Controllers\DeleteEmojiController::class),

    (new Extend\Settings())
        ->default('pianotell-flamoji.auto_hide', true)
        ->default('pianotell-flamoji.show_preview', false)
        ->default('pianotell-flamoji.show_search', true)
        ->default('pianotell-flamoji.show_variants', true)
        ->default('pianotell-flamoji.emoji_version', '14')
        ->default('pianotell-flamoji.show_category_buttons', true)
        ->default('pianotell-flamoji.show_recents', true)
        ->default('pianotell-flamoji.frequent_rows', 4)
        ->default('pianotell-flamoji.specify_categories', '["people","nature","foods","activity","places","objects","symbols","flags"]')
        ->serializeToForum('flamoji.auto_hide', 'pianotell-flamoji.auto_hide', 'boolVal')
        ->serializeToForum('flamoji.show_preview', 'pianotell-flamoji.show_preview', 'boolVal')
        ->serializeToForum('flamoji.show_search', 'pianotell-flamoji.show_search', 'boolVal')
        ->serializeToForum('flamoji.show_variants', 'pianotell-flamoji.show_variants', 'boolVal')
        ->serializeToForum('flamoji.emoji_version', 'pianotell-flamoji.emoji_version')
        ->serializeToForum('flamoji.show_category_buttons', 'pianotell-flamoji.show_category_buttons', 'boolVal')
        ->serializeToForum('flamoji.show_recents', 'pianotell-flamoji.show_recents', 'boolVal')
        ->serializeToForum('flamoji.frequent_rows', 'pianotell-flamoji.frequent_rows', 'intVal')
        ->serializeToForum('flamoji.specify_categories', 'pianotell-flamoji.specify_categories'),
];
