<?php

namespace PianoTell\Flamoji\Commands;

use Flarum\Foundation\ValidationException;
use PianoTell\Flamoji\Models\Emoji;
use Illuminate\Support\Arr;

class EditEmojiHandler
{
    /**
     * @param  EditEmoji $command
     * @return Emoji
     */
    public function handle(EditEmoji $command)
    {
        $data = $command->data;

        $emoji = Emoji::findOrFail($command->emojiId);

        $attributes = Arr::get($data, 'attributes', []);
        $errors = [];

        if (array_key_exists('title', $attributes)) {
            $emoji->title = trim((string) $attributes['title']);
        }

        if (array_key_exists('textToReplace', $attributes)) {
            $textToReplace = trim((string) $attributes['textToReplace']);
            if ($textToReplace === '') {
                $errors['textToReplace'] = 'The trigger text is required.';
            } elseif (preg_match('/\s/u', $textToReplace)) {
                $errors['textToReplace'] = 'The trigger text must not contain whitespace.';
            } else {
                $emoji->text_to_replace = $textToReplace;
            }
        }

        if (array_key_exists('path', $attributes)) {
            $path = trim((string) $attributes['path']);
            if ($path === '') {
                $errors['path'] = 'The image path is required.';
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
