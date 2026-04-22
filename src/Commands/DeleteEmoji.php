<?php

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
