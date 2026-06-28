<?php
/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

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
            } elseif ($textToReplace !== $emoji->text_to_replace) {
                // The trigger CHANGED. Enforce the canonical format and
                // uniqueness. The "changed" guard grandfathers existing
                // legacy rows: editing a legacy emoji's other fields leaves
                // its trigger untouched and so skips re-validation.
                $cErr = EmojiRules::validateCanonicalShortcode($textToReplace);
                if ($cErr !== null) {
                    $errors['textToReplace'] = $cErr;
                } elseif (Emoji::where('text_to_replace', $textToReplace)->where('id', '!=', $emoji->id)->exists()) {
                    $errors['textToReplace'] = 'This shortcode is already used by another emoji.';
                } else {
                    $emoji->text_to_replace = $textToReplace;
                }
            } else {
                // Unchanged — keep as-is (no canonical/uniqueness check).
                $emoji->text_to_replace = $textToReplace;
            }
        }

        if (array_key_exists('category', $attributes)) {
            $category = trim((string) $attributes['category']);
            $err = EmojiRules::validateCategory($category);
            if ($err !== null) {
                $errors['category'] = $err;
            } else {
                $emoji->category = $category !== '' ? $category : null;
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
