<?php
/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

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
