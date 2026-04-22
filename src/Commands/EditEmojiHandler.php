<?php

namespace PianoTell\Flamoji\Commands;

use Flarum\Foundation\ValidationException;
use PianoTell\Flamoji\Models\Emoji;
use Illuminate\Support\Arr;

class EditEmojiHandler
{
    public function handle(EditEmoji $command): Emoji
    {
        $emoji = Emoji::findOrFail($command->emojiId);

        $attributes = Arr::get($command->data, 'attributes', []);
        $errors = [];

        if (array_key_exists('title', $attributes)) {
            $emoji->title = trim((string) $attributes['title']);
        }

        if (array_key_exists('textToReplace', $attributes)) {
            $textToReplace = trim((string) $attributes['textToReplace']);
            $err = EmojiRules::validateTextToReplace($textToReplace, true);
            if ($err !== null) {
                $errors['textToReplace'] = $err;
            } else {
                $emoji->text_to_replace = $textToReplace;
            }
        }

        if (array_key_exists('path', $attributes)) {
            $path = trim((string) $attributes['path']);
            $err = EmojiRules::validatePath($path, true);
            if ($err !== null) {
                $errors['path'] = $err;
            } else {
                $emoji->path = $path;
            }
        }

        if (! empty($errors)) {
            throw new ValidationException($errors);
        }

        $emoji->save();

        return $emoji;
    }
}
