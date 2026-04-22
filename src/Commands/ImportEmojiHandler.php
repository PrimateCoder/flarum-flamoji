<?php

namespace PianoTell\Flamoji\Commands;

use Flarum\Foundation\ValidationException;
use PianoTell\Flamoji\Models\Emoji;

class ImportEmojiHandler
{
    public function handle(ImportEmoji $command): void
    {
        // Validate every row up-front before persisting any of them.
        // Without this, a malformed bulk import could land rows with empty
        // path/text_to_replace into the table, which the text formatter
        // would then iterate over and choke on. Rules live in EmojiRules
        // so single-create / edit / import stay in lockstep.
        $errors = [];
        $normalized = [];
        foreach ($command->data as $i => $emojiData) {
            try {
                $normalized[$i] = EmojiRules::validateCreate(
                    is_array($emojiData) ? $emojiData : [],
                    "data.$i."
                );
            } catch (ValidationException $e) {
                $errors = array_merge($errors, $e->errors());
            }
        }
        if (! empty($errors)) {
            throw new ValidationException($errors);
        }

        foreach ($normalized as $row) {
            $emoji = Emoji::build($row['title'], $row['text_to_replace'], $row['path']);
            $emoji->save();
        }
    }
}
