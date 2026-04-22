<?php

namespace PianoTell\Flamoji\Commands;

use Flarum\Foundation\ValidationException;

/**
 * Shared validation rules for custom-emoji attributes.
 *
 * Two modes:
 * - validateCreate(): all required fields enforced. Used by the single-
 *   create and bulk-import handlers.
 * - validateUpdate(): partial — only validates fields that are present in
 *   the attribute bag. Used by the edit handler.
 *
 * Centralizing here keeps the three handlers in lockstep and gives the
 * eventual 2.x port a single place to lift the rules from when translating
 * to `Schema\Str::make(...)->regex(...)->requiredOnCreate()` field rules
 * on the new API resource.
 */
class EmojiRules
{
    /**
     * Full-create validation. Trims string inputs and enforces required +
     * format rules on text_to_replace and path. Title is optional.
     *
     * @param  array<string, mixed>  $attributes
     * @param  string  $errorKeyPrefix  optional, used by bulk import to
     *                                  point the error at the failing row
     * @return array{title: string, text_to_replace: string, path: string}
     *
     * @throws ValidationException
     */
    public static function validateCreate(array $attributes, string $errorKeyPrefix = ''): array
    {
        $title = trim((string) ($attributes['title'] ?? ''));
        $textToReplace = trim((string) ($attributes['text_to_replace'] ?? $attributes['textToReplace'] ?? ''));
        $path = trim((string) ($attributes['path'] ?? ''));

        $errors = [];
        if (($err = self::validateTextToReplace($textToReplace, true)) !== null) {
            $errors[$errorKeyPrefix . 'text_to_replace'] = $err;
        }
        if (($err = self::validatePath($path, true)) !== null) {
            $errors[$errorKeyPrefix . 'path'] = $err;
        }
        if (! empty($errors)) {
            throw new ValidationException($errors);
        }

        return [
            'title' => $title,
            'text_to_replace' => $textToReplace,
            'path' => $path,
        ];
    }

    /**
     * Single-field validators. Return null on success, error message on
     * failure. `$required` controls whether an empty value is rejected.
     */
    public static function validateTextToReplace(string $value, bool $required): ?string
    {
        if ($value === '') {
            return $required ? 'The trigger text is required.' : null;
        }
        if (preg_match('/\s/u', $value)) {
            return 'The trigger text must not contain whitespace.';
        }
        return null;
    }

    public static function validatePath(string $value, bool $required): ?string
    {
        if ($value === '' && $required) {
            return 'The image path is required.';
        }
        // Empty string in update context means "not changing" — caller
        // should branch on array_key_exists before invoking us.
        return null;
    }
}

