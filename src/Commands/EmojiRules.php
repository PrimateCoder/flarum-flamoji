<?php
/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

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
     * @return array{title: string, text_to_replace: string, path: string, category: ?string}
     *
     * @throws ValidationException
     */
    public static function validateCreate(array $attributes, string $errorKeyPrefix = ''): array
    {
        $title = trim((string) ($attributes['title'] ?? ''));
        $textToReplace = trim((string) ($attributes['text_to_replace'] ?? $attributes['textToReplace'] ?? ''));
        $path = trim((string) ($attributes['path'] ?? ''));
        $category = trim((string) ($attributes['category'] ?? ''));

        $errors = [];
        if (($err = self::validateTextToReplace($textToReplace, true)) !== null) {
            $errors[$errorKeyPrefix . 'text_to_replace'] = $err;
        }
        if (($err = self::validatePath($path, true)) !== null) {
            $errors[$errorKeyPrefix . 'path'] = $err;
        }
        if (($err = self::validateCategory($category)) !== null) {
            $errors[$errorKeyPrefix . 'category'] = $err;
        }
        if (! empty($errors)) {
            throw new ValidationException($errors);
        }

        return [
            'title' => $title,
            'text_to_replace' => $textToReplace,
            'path' => $path,
            'category' => $category !== '' ? $category : null,
        ];
    }

    /**
     * Single-field validators. Return null on success, error message on
     * failure. `$required` controls whether an empty value is rejected.
     *
     * This is the "legacy floor": non-empty + no whitespace. Existing
     * custom emoji (and JSON exported by older versions) satisfy only this,
     * so the import path uses it to stay backwards-compatible. New emoji
     * authored through the admin form must additionally satisfy the
     * canonical shortcode rule (see validateCanonicalShortcode).
     */
    public static function validateTextToReplace(string $value, bool $required): ?string
    {
        if ($value === '') {
            return $required ? 'The shortcode is required.' : null;
        }
        if (preg_match('/\s/u', $value)) {
            return 'The shortcode must not contain whitespace.';
        }
        return null;
    }

    /**
     * Canonical shortcode format: wrapped in colons, with an inner of
     * letters, digits, dash, underscore or plus — e.g. `:myemoji_party:`.
     *
     * Enforced for NEW or CHANGED triggers (interactive create/edit), but
     * NOT for import or pre-existing rows, so older non-conforming triggers
     * keep working. emoji-mart's own SHORTCODES_REGEX only requires
     * `:<non-colon>:`; we additionally restrict the character set so the
     * trigger is a safe shortcode and not, say, a bare word like `png`
     * that the text formatter would match as a substring anywhere in a post.
     */
    public static function isCanonicalShortcode(string $value): bool
    {
        return (bool) preg_match('/^:[a-zA-Z0-9_+-]+:$/', $value);
    }

    /**
     * Returns an error message if the value is not a canonical shortcode,
     * or null if it is. Assumes the value is already trimmed and non-empty
     * (callers run validateTextToReplace first).
     */
    public static function validateCanonicalShortcode(string $value): ?string
    {
        if (! self::isCanonicalShortcode($value)) {
            return 'The shortcode must be wrapped in colons and contain only letters, numbers, dashes, underscores or plus signs — e.g. :myemoji_party:.';
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

    /**
     * Category is optional and freeform. The only constraint is length:
     * it is persisted in a VARCHAR(255) column, so reject anything longer
     * to surface a 422 instead of a DB-level error / silent truncation.
     */
    public static function validateCategory(string $value): ?string
    {
        if (mb_strlen($value) > 255) {
            return 'The category must not be longer than 255 characters.';
        }
        return null;
    }
}

