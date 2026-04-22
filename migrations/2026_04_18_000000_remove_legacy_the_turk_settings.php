<?php

/*
 * Cleanup migration for forks that previously had the upstream
 * `the-turk/flarum-flamoji` extension installed. Two things happen:
 *
 * 1. Remove `the-turk-flamoji` from the `extensions_enabled` settings
 *    list. If the upstream package is still on disk and currently
 *    enabled, leaving it active alongside this fork would cause a
 *    fatal at boot from duplicate model bindings on the shared
 *    `custom_emojis` table.
 *
 * 2. Delete the ~12 orphan `the-turk-flamoji.*` settings rows. Flarum
 *    keeps an extension's settings rows when the extension is
 *    uninstalled, so a site that switched from `the-turk-flamoji` to
 *    `pianotell-flamoji` will still have those rows under the old
 *    key prefix.
 *
 * Both operations are idempotent. `down` is intentionally a no-op:
 * the previous values are unrecoverable, and there is no scenario in
 * which we would want to recreate state for a defunct extension ID.
 *
 * Note: both extensions share the `custom_emojis` table (this fork
 * inherited it), so emoji data carries over without any action.
 */

use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        $connection = $schema->getConnection();

        // 1. Disable the upstream extension if it is enabled.
        $row = $connection->table('settings')
            ->where('key', 'extensions_enabled')
            ->first();

        if ($row !== null) {
            $enabled = json_decode($row->value, true);
            if (is_array($enabled) && in_array('the-turk-flamoji', $enabled, true)) {
                $enabled = array_values(array_filter(
                    $enabled,
                    fn ($id) => $id !== 'the-turk-flamoji'
                ));

                $connection->table('settings')
                    ->where('key', 'extensions_enabled')
                    ->update(['value' => json_encode($enabled)]);
            }
        }

        // 2. Delete orphan settings rows under the legacy key prefix.
        $connection->table('settings')
            ->where('key', 'like', 'the-turk-flamoji.%')
            ->delete();
    },
    'down' => function (Builder $schema) {
        // no-op
    },
];

