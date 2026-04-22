<?php

namespace PianoTell\Flamoji\Commands;

use Flarum\Foundation\ValidationException;
use PianoTell\Flamoji\Models\Emoji;
use Illuminate\Support\Arr;

class CreateEmojiHandler
{
    /**
     * @param  CreateEmoji $command
     * @return Emoji
     */
    public function handle(CreateEmoji $command)
    {
        $data = $command->data;

        $title = trim((string) Arr::get($data, 'attributes.title', ''));
        $textToReplace = trim((string) Arr::get($data, 'attributes.textToReplace', ''));
        $path = trim((string) Arr::get($data, 'attributes.path', ''));

        $errors = [];
        if ($textToReplace === '') {
            $errors['textToReplace'] = 'The trigger text is required.';
        } elseif (preg_match('/\s/u', $textToReplace)) {
            $errors['textToReplace'] = 'The trigger text must not contain whitespace.';
        }
        if ($path === '') {
            $errors['path'] = 'The image path is required.';
        }
        if (! empty($errors)) {
            throw new ValidationException($errors);
        }

        $emoji = Emoji::build($title, $textToReplace, $path);

        $emoji->save();

        return $emoji;
    }
}
