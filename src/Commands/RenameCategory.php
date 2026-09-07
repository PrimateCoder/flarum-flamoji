<?php
/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace PianoTell\Flamoji\Commands;

class RenameCategory
{
    /**
     * @param  string|null $from the stored category to rename; null
     *                           addresses uncategorized emojis
     * @param  string|null $to   the new category; null clears it
     */
    public function __construct(
        public ?string $from,
        public ?string $to
    ) {
    }
}
