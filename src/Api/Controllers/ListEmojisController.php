<?php

namespace PianoTell\Flamoji\Api\Controllers;

use Flarum\Api\Controller\AbstractListController;
use Flarum\Http\UrlGenerator;
use Illuminate\Support\Arr;
use PianoTell\Flamoji\Api\Serializers\EmojiSerializer;
use PianoTell\Flamoji\Models\Emoji;
use Psr\Http\Message\ServerRequestInterface;
use Tobscure\JsonApi\Document;

class ListEmojisController extends AbstractListController
{
    /**
     * {@inheritdoc}
     */
    public $serializer = EmojiSerializer::class;

    public $sortFields = ['id'];

    /**
     * @var UrlGenerator
     */
    protected $url;

    public function __construct(UrlGenerator $url)
    {
        $this->url = $url;
    }

    /**
     * @param \Psr\Http\Message\ServerRequestInterface $request
     * @param \Tobscure\JsonApi\Document               $document
     */
    protected function data(ServerRequestInterface $request, Document $document)
    {
        $params = $request->getQueryParams();

        // Escape hatch: ?filter[all]=1 returns every emoji in one shot,
        // used by the forum picker (which needs the full set to feed
        // into EmojiButton's "custom" category) and by the admin's
        // "export to JSON" flow. The list endpoint is public, and
        // walking pages would yield the same data, so this is not
        // permission-gated — it's just a round-trip optimization.
        if (Arr::get($params, 'filter.all')) {
            return Emoji::all();
        }

        $limit = $this->extractLimit($request);
        $offset = $this->extractOffset($request);

        $results = Emoji::skip($offset)->take($limit + 1)->orderBy('id', 'desc')->get();

        $hasMoreResults = $limit > 0 && $results->count() > $limit;

        if ($hasMoreResults) {
            $results->pop();
        }

        $document->addPaginationLinks(
            $this->url->to('api')->route('emojis.list'),
            $params,
            $offset,
            $limit,
            $hasMoreResults ? null : 0
        );

        return $results;
    }
}
