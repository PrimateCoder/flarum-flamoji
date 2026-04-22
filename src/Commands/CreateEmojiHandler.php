<?php

namespace PianoTell\Flamoji\Commands;

use PianoTell\Flamoji\Models\Emoji;
use Illuminate\Support\Arr;

class CreateEmojiHandler
{
    public function handle(CreateEmoji $command): Emoji
    {
        $attrs = EmojiRules::validateCreate(Arr::get($command->data, 'attributes', []));

        $emoji = Emoji::build($attrs['title'], $attrs['text_to_replace'], $attrs['path']);

        $emoji->save();

        return $emoji;
    }
}
