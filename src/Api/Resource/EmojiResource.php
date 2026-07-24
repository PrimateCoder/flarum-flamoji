<?php

/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace PianoTell\Flamoji\Api\Resource;

use Flarum\Api\Context;
use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Flarum\Api\Sort\SortColumn;
use Flarum\Foundation\ValidationException;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Arr;
use Laminas\Diactoros\Response\JsonResponse;
use PianoTell\Flamoji\Validation\EmojiRules;
use PianoTell\Flamoji\Models\Emoji;
use Tobyz\JsonApiServer\Context as BaseContext;

/**
 * @extends AbstractDatabaseResource<Emoji>
 */
class EmojiResource extends AbstractDatabaseResource
{
    public function __construct(
        protected ConnectionInterface $db
    ) {
    }

    public function type(): string
    {
        return 'flamojis';
    }

    public function model(): string
    {
        return Emoji::class;
    }

    public function endpoints(): array
    {
        return [
            // Unpaginated dump of all emojis — used by the forum picker
            // (needs full set for emoji-mart's custom category) and the
            // admin export flow.
            Endpoint\Endpoint::make('all')
                ->route('GET', '/all')
                ->action(function (Context $context) {
                    return Emoji::orderBy('id', 'desc')->get()->all();
                }),

            Endpoint\Index::make()
                ->paginate(23, 50)
                ->defaultSort('-id'),

            Endpoint\Show::make(),

            Endpoint\Create::make()
                ->authenticated()
                ->admin(),

            Endpoint\Update::make()
                ->authenticated()
                ->admin(),

            Endpoint\Delete::make()
                ->authenticated()
                ->admin(),

            // Bulk import: validates all rows first (all-or-nothing),
            // then persists in a transaction.
            Endpoint\Endpoint::make('import')
                ->route('POST', '/import')
                ->authenticated()
                ->admin()
                ->action(function (Context $context) {
                    $body = $context->body();
                    $data = Arr::get($body, 'data', []);
                    $mode = Arr::get($body, 'mode', 'append');

                    return $this->handleImport($data, $mode);
                })
                ->response(fn (Context $context, mixed $data) => new JsonResponse([
                    'legacyShortcodes' => $data,
                ], 200)),
        ];
    }

    public function fields(): array
    {
        return [
            Schema\Str::make('title')
                ->writable()
                ->nullable(),

            Schema\Str::make('text_to_replace')
                ->writable()
                ->requiredOnCreate(),

            Schema\Str::make('category')
                ->writable()
                ->nullable(),

            Schema\Str::make('path')
                ->writable()
                ->requiredOnCreate(),
        ];
    }

    public function sorts(): array
    {
        return [
            SortColumn::make('id'),
        ];
    }

    /**
     * Trim and validate attributes before save.
     */
    public function saving(object $model, BaseContext $context): ?object
    {
        if ($model->isDirty('title')) {
            $model->title = trim((string) $model->title);
        }

        if ($model->isDirty('category')) {
            $category = trim((string) $model->category);

            $err = EmojiRules::validateCategory($category);
            if ($err !== null) {
                throw new ValidationException(['category' => $err]);
            }

            $model->category = $category !== '' ? $category : null;
        }

        if ($model->isDirty('text_to_replace')) {
            $value = trim((string) $model->text_to_replace);
            $model->text_to_replace = $value;

            $err = EmojiRules::validateTextToReplace($value, true);
            if ($err !== null) {
                throw new ValidationException(['text_to_replace' => $err]);
            }

            // Enforce the canonical shortcode format for new or changed
            // triggers. The isDirty() guard grandfathers existing rows:
            // editing a legacy emoji's other fields leaves its trigger
            // untouched (not dirty) and so skips this check; only creating
            // or actually changing the trigger requires the new format.
            $err = EmojiRules::validateCanonicalShortcode($value);
            if ($err !== null) {
                throw new ValidationException(['text_to_replace' => $err]);
            }

            // Check for duplicate trigger text
            $existing = Emoji::where('text_to_replace', $value)
                ->where('id', '!=', $model->id ?? 0)
                ->first();
            if ($existing) {
                throw new ValidationException(['text_to_replace' => 'This shortcode is already used by another emoji.']);
            }
        }

        if ($model->isDirty('path')) {
            $value = trim((string) $model->path);
            $model->path = $value;

            $err = EmojiRules::validatePath($value, true);
            if ($err !== null) {
                throw new ValidationException(['path' => $err]);
            }
        }

        return $model;
    }

    /**
     * All-or-nothing bulk import. Validates every row before persisting
     * any, and wraps persistence in a DB transaction.
     *
     * @return list<string> the non-canonical ("legacy") shortcodes that were
     *                      imported as-is, for a non-blocking admin notice
     */
    private function handleImport(array $data, string $mode = 'append'): array
    {
        $errors = [];
        $normalized = [];
        $seenTriggers = [];
        $legacyShortcodes = [];

        // Pre-load existing triggers for duplicate detection
        $existingTriggers = $mode === 'override' ? [] : Emoji::pluck('text_to_replace')->filter()->all();

        foreach ($data as $i => $emojiData) {
            try {
                // Import is the backwards-compatibility surface: it validates
                // only the legacy floor (non-empty, no whitespace, unique),
                // NOT the canonical shortcode format, so JSON exported by an
                // older version (or a legacy install) still imports cleanly.
                $normalized[$i] = EmojiRules::validateCreate(
                    is_array($emojiData) ? $emojiData : [],
                    "data.$i."
                );

                $trigger = $normalized[$i]['text_to_replace'];

                // Check for duplicate within the import batch
                if (isset($seenTriggers[$trigger])) {
                    $errors["data.$i.text_to_replace"] = "Duplicate shortcode within import batch (same as row {$seenTriggers[$trigger]}).";
                }
                // Check against existing DB entries
                elseif (in_array($trigger, $existingTriggers, true)) {
                    $errors["data.$i.text_to_replace"] = 'This shortcode is already used by another emoji.';
                } else {
                    $seenTriggers[$trigger] = $i;
                    // Track non-canonical triggers so the admin gets a
                    // non-blocking heads-up (the import still succeeds).
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

        $this->db->transaction(function () use ($normalized, $mode) {
            if ($mode === 'override') {
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
