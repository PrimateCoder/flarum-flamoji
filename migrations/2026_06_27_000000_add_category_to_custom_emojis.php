<?php

/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        if (! $schema->hasColumn('custom_emojis', 'category')) {
            $schema->table('custom_emojis', function (Blueprint $table) {
                $table->string('category')->nullable()->after('text_to_replace');
            });
        }
    },
    'down' => function (Builder $schema) {
        if ($schema->hasColumn('custom_emojis', 'category')) {
            $schema->table('custom_emojis', function (Blueprint $table) {
                $table->dropColumn('category');
            });
        }
    },
];
