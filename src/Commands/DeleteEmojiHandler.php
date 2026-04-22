<?php

namespace PianoTell\Flamoji\Commands;

use PianoTell\Flamoji\Models\Emoji;

class DeleteEmojiHandler
{
    /**
     * @param  DeleteEmoji $command
     * @return Emoji
     */
    public function handle(DeleteEmoji $command)
    {
        $emoji = Emoji::findOrFail($command->emojiId);

        $emoji->delete();

        return $emoji;
    }
}
