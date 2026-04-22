<?php

/*
 * Migrate stored Flamoji settings from the emoji-button era (legacy IDs,
 * recents_count) to the emoji-mart era (new IDs, frequent_rows).
 *
 * Three operations, all idempotent:
 *
 * 1. Rename `recents_count` -> `frequent_rows`. The old setting counted
 *    individual emojis to remember (default 50). emoji-mart's analogue
 *    counts ROWS of frequent emojis to display in the picker. Clamp the
 *    legacy value into the 1..10 row range so admins land on a sane
 *    default; if the row is missing or unparseable, fall back to 4.
 *
 * 2. Delete settings that no longer have an emoji-mart analogue:
 *    emoji_style (always Twemoji now via getSpritesheetURL),
 *    emoji_data (i18n is driven from Flarum translations directly),
 *    initial_category (emoji-mart picks Frequent automatically).
 *
 * 3. Rewrite `specify_categories` JSON values from the emoji-button
 *    category IDs to emoji-mart's. Notably, `smileys` and `people`
 *    collapse into a single `people` category in emoji-mart, so we
 *    dedupe after mapping.
 *
 * `down` is a no-op: the deleted settings have no recoverable values
 * and emoji-mart cannot consume the legacy IDs.
 */

use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        $connection = $schema->getConnection();

        // 1. recents_count -> frequent_rows.
        $existingFrequent = $connection->table('settings')
            ->where('key', 'pianotell-flamoji.frequent_rows')
            ->first();

        if ($existingFrequent === null) {
            $legacy = $connection->table('settings')
                ->where('key', 'pianotell-flamoji.recents_count')
                ->first();

            $rows = 4;
            if ($legacy !== null && is_numeric($legacy->value)) {
                $rows = max(1, min(10, (int) $legacy->value));
            }

            $connection->table('settings')->insert([
                'key' => 'pianotell-flamoji.frequent_rows',
                'value' => (string) $rows,
            ]);
        }

        $connection->table('settings')
            ->where('key', 'pianotell-flamoji.recents_count')
            ->delete();

        // 2. Drop obsolete settings.
        $connection->table('settings')
            ->whereIn('key', [
                'pianotell-flamoji.emoji_style',
                'pianotell-flamoji.emoji_data',
                'pianotell-flamoji.initial_category',
            ])
            ->delete();

        // 3. Translate specify_categories JSON to emoji-mart IDs.
        $row = $connection->table('settings')
            ->where('key', 'pianotell-flamoji.specify_categories')
            ->first();

        if ($row !== null) {
            $cats = json_decode($row->value, true);
            if (is_array($cats)) {
                $map = [
                    'smileys' => 'people',
                    'people' => 'people',
                    'animals' => 'nature',
                    'food' => 'foods',
                    'activities' => 'activity',
                    'travel' => 'places',
                    // objects, symbols, flags pass through unchanged
                ];

                $translated = array_map(
                    fn ($c) => $map[$c] ?? $c,
                    $cats
                );

                // Dedupe (smileys + people both collapse to people) while
                // preserving order of first occurrence.
                $deduped = array_values(array_unique($translated));

                $connection->table('settings')
                    ->where('key', 'pianotell-flamoji.specify_categories')
                    ->update(['value' => json_encode($deduped)]);
            }
        }
    },
    'down' => function (Builder $schema) {
        // no-op
    },
];
