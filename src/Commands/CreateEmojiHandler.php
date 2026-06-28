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

class CreateEmojiHandler
{
    public function handle(CreateEmoji $command): Emoji
    {
        $attrs = EmojiRules::validateCreate(Arr::get($command->data, 'attributes', []));

        // Interactive create always authors a fresh trigger, so enforce the
        // canonical shortcode format (import stays tolerant — see
        // ImportEmojiHandler).
        $err = EmojiRules::validateCanonicalShortcode($attrs['text_to_replace']);
        if ($err !== null) {
            throw new ValidationException(['text_to_replace' => $err]);
        }

        // Reject a trigger already used by another emoji. The text formatter
        // keys on text_to_replace, so duplicates would shadow each other.
        if (Emoji::where('text_to_replace', $attrs['text_to_replace'])->exists()) {
            throw new ValidationException(['text_to_replace' => 'This shortcode is already used by another emoji.']);
        }

        $emoji = Emoji::build($attrs['title'], $attrs['text_to_replace'], $attrs['path'], $attrs['category']);

        $emoji->save();

        return $emoji;
    }
}
