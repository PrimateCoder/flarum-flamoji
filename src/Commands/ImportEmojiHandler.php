<?php
/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace PianoTell\Flamoji\Commands;

use Flarum\Foundation\ValidationException;
use Illuminate\Database\ConnectionInterface;
use PianoTell\Flamoji\Models\Emoji;

class ImportEmojiHandler
{
    protected ConnectionInterface $db;

    public function __construct(ConnectionInterface $db)
    {
        $this->db = $db;
    }

    /**
     * Bulk import. Validates every row up-front before persisting any of
     * them (a malformed row would otherwise land empty path/text_to_replace
     * that the text formatter chokes on), and wraps persistence in a
     * transaction so the import is all-or-nothing.
     *
     * Import is the backwards-compatibility surface: it validates only the
     * legacy floor (non-empty, no whitespace, unique), NOT the canonical
     * shortcode format, so JSON exported by an older version still imports
     * cleanly. Non-canonical triggers are collected and returned so the
     * admin gets a non-blocking notice.
     *
     * @return list<string> the non-canonical ("legacy") shortcodes imported
     */
    public function handle(ImportEmoji $command): array
    {
        $errors = [];
        $normalized = [];
        $seenTriggers = [];
        $legacyShortcodes = [];

        // Pre-load existing triggers for duplicate detection.
        $existingTriggers = $command->mode === 'override' ? [] : Emoji::pluck('text_to_replace')->filter()->all();

        foreach ($command->data as $i => $emojiData) {
            try {
                $normalized[$i] = EmojiRules::validateCreate(
                    is_array($emojiData) ? $emojiData : [],
                    "data.$i."
                );

                $trigger = $normalized[$i]['text_to_replace'];

                // Duplicate within the import batch.
                if (isset($seenTriggers[$trigger])) {
                    $errors["data.$i.text_to_replace"] = "Duplicate shortcode within import batch (same as row {$seenTriggers[$trigger]}).";
                }
                // Duplicate against existing DB rows.
                elseif (in_array($trigger, $existingTriggers, true)) {
                    $errors["data.$i.text_to_replace"] = 'This shortcode is already used by another emoji.';
                } else {
                    $seenTriggers[$trigger] = $i;
                    // Track non-canonical triggers for a non-blocking notice
                    // (the import still succeeds).
                    if (! EmojiRules::isCanonicalShortcode($trigger)) {
                        $legacyShortcodes[] = $trigger;
                    }
                }
            } catch (ValidationException $e) {
                $errors = array_merge($errors, $e->getAttributes());
            }
        }

        if (! empty($errors)) {
            throw new ValidationException($errors);
        }

        $this->db->transaction(function () use ($normalized, $command) {
            if ($command->mode === 'override') {
                Emoji::query()->delete();
            }

            foreach ($normalized as $row) {
                $emoji = Emoji::build(
                    $row['title'],
                    $row['text_to_replace'],
                    $row['path'],
                    $row['category'] ?? null
                );
                $emoji->save();
            }
        });

        return $legacyShortcodes;
    }
}
