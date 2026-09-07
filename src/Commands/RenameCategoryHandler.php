<?php
/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace PianoTell\Flamoji\Commands;

use Flarum\Foundation\ValidationException;
use PianoTell\Flamoji\Models\Emoji;

class RenameCategoryHandler
{
    /**
     * All-or-nothing bulk category rename: a single UPDATE statement —
     * inherently atomic, no pagination blind spot, and no per-row model
     * saves (the target value is validated once here instead of per
     * row). The admin list paginates, so the previous client-side
     * fan-out of per-emoji saves silently missed emojis on unloaded
     * pages and failed non-atomically.
     *
     * `from: null` addresses uncategorized emojis; `to: null` clears
     * the category. Literal strings are stored as data — including
     * "Uncategorized" — so admins keep ownership of their names.
     *
     * @return int the number of emojis updated
     */
    public function handle(RenameCategory $command): int
    {
        $to = trim((string) $command->to);
        if ($to !== '') {
            $err = EmojiRules::validateCategory($to);
            if ($err !== null) {
                throw new ValidationException(['category' => $err]);
            }
        } else {
            $to = null;
        }

        $from = $command->from === null || trim($command->from) === ''
            ? null
            : trim($command->from);

        $query = Emoji::query();
        if ($from === null) {
            $query->whereNull('category');
        } else {
            $query->where('category', $from);
        }

        return $query->update(['category' => $to]);
    }
}
