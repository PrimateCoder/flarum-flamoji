<?php

namespace PianoTell\Flamoji\Api\Resource;

use Flarum\Api\Context;
use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Flarum\Api\Sort\SortColumn;
use Flarum\Foundation\ValidationException;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Arr;
use Laminas\Diactoros\Response\EmptyResponse;
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
                    $data = Arr::get($context->body(), 'data', []);
                    $this->handleImport($data);

                    return null;
                })
                ->response(fn (Context $context, mixed $data) => new EmptyResponse(204)),
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

        if ($model->isDirty('text_to_replace')) {
            $value = trim((string) $model->text_to_replace);
            $model->text_to_replace = $value;

            $err = EmojiRules::validateTextToReplace($value, true);
            if ($err !== null) {
                throw new ValidationException(['text_to_replace' => $err]);
            }

            // Check for duplicate trigger text
            $existing = Emoji::where('text_to_replace', $value)
                ->where('id', '!=', $model->id ?? 0)
                ->first();
            if ($existing) {
                throw new ValidationException(['text_to_replace' => 'This trigger text is already used by another emoji.']);
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
     */
    private function handleImport(array $data): void
    {
        $errors = [];
        $normalized = [];
        $seenTriggers = [];

        // Pre-load existing triggers for duplicate detection
        $existingTriggers = Emoji::pluck('text_to_replace')->filter()->all();

        foreach ($data as $i => $emojiData) {
            try {
                $normalized[$i] = EmojiRules::validateCreate(
                    is_array($emojiData) ? $emojiData : [],
                    "data.$i."
                );

                $trigger = $normalized[$i]['text_to_replace'];

                // Check for duplicate within the import batch
                if (isset($seenTriggers[$trigger])) {
                    $errors["data.$i.text_to_replace"] = "Duplicate trigger text within import batch (same as row {$seenTriggers[$trigger]}).";
                }
                // Check against existing DB entries
                elseif (in_array($trigger, $existingTriggers, true)) {
                    $errors["data.$i.text_to_replace"] = 'This trigger text is already used by another emoji.';
                } else {
                    $seenTriggers[$trigger] = $i;
                }
            } catch (ValidationException $e) {
                $errors = array_merge($errors, $e->getAttributes());
            }
        }

        if (! empty($errors)) {
            throw new ValidationException($errors);
        }

        $this->db->transaction(function () use ($normalized) {
            foreach ($normalized as $row) {
                $emoji = Emoji::build(
                    $row['title'],
                    $row['text_to_replace'],
                    $row['path']
                );
                $emoji->save();
            }
        });
    }
}
