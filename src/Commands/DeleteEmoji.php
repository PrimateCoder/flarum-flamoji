<?php
/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace PianoTell\Flamoji\Commands;

class DeleteEmoji
{
    /**
     * The ID of the emoji to delete.
     *
     * @var int
     */
    public $emojiId;

    /**
     * @param int $emojiId The ID of the emoji to delete.
     */
    public function __construct($emojiId)
    {
        $this->emojiId = $emojiId;
    }
}
