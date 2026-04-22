<?php

namespace PianoTell\Flamoji\Commands;

use PianoTell\Flamoji\Models\Emoji;
use Illuminate\Support\Arr;

class ImportEmojiHandler
{
    /**
     * @param ImportEmoji $command
     */
    public function handle(ImportEmoji $command): void
    {
        $data = $command->data;

        foreach ($data as $emojiData) {
            $emoji = Emoji::build(
                Arr::get($emojiData, 'title'),
                Arr::get($emojiData, 'text_to_replace'),
                Arr::get($emojiData, 'path')
            );

            $emoji->save();
        }
    }
}
