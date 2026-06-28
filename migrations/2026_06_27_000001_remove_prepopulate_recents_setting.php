<?php

/*
 * The `prepopulate_recents` admin setting was removed: the Frequently
 * Used tab now always starts empty and fills from the user's own picks
 * (the standard emoji-picker convention), and emoji-mart's hardcoded
 * unicode defaults are unconditionally suppressed. The defaults were the
 * sole cause of invalid emoji appearing in restricted pickers
 * (custom-only/sticker mode, or deselected categories).
 *
 * Flarum keeps a setting's row after the code stops reading it, so delete
 * the now-orphan `pianotell-flamoji.prepopulate_recents` row. Idempotent;
 * `down` is a no-op since the setting no longer exists in code.
 */

use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        $schema->getConnection()->table('settings')
            ->where('key', 'pianotell-flamoji.prepopulate_recents')
            ->delete();
    },
    'down' => function (Builder $schema) {
        // no-op
    },
];
