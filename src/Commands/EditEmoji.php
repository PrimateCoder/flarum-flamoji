<?php
/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace PianoTell\Flamoji\Commands;

class EditEmoji
{
    /**
     * The ID of the emoji to edit.
     *
     * @var int
     */
    public $emojiId;

    /**
     * The attributes to update on the emoji.
     *
     * @var array
     */
    public $data;

    /**
     * @param int   $tagId The ID of the emoji to edit.
     * @param array $data  The attributes to update on the emoji.
     */
    public function __construct($emojiId, array $data)
    {
        $this->emojiId = $emojiId;
        $this->data = $data;
    }
}
