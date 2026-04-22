<?php

namespace PianoTell\Flamoji\Api\Controllers;

use Flarum\Api\Controller\AbstractCreateController;
use Flarum\Http\RequestUtil;
use PianoTell\Flamoji\Api\Serializers\EmojiSerializer;
use PianoTell\Flamoji\Commands\CreateEmoji;
use Illuminate\Contracts\Bus\Dispatcher;
use Illuminate\Support\Arr;
use Psr\Http\Message\ServerRequestInterface;
use Tobscure\JsonApi\Document;

class CreateEmojiController extends AbstractCreateController
{
    /**
     * {@inheritdoc}
     */
    public $serializer = EmojiSerializer::class;

    /**
     * @var Dispatcher
     */
    protected $bus;

    /**
     * @param Dispatcher $bus
     */
    public function __construct(Dispatcher $bus)
    {
        $this->bus = $bus;
    }

    /**
     * {@inheritdoc}
     */
    protected function data(ServerRequestInterface $request, Document $document)
    {
        RequestUtil::getActor($request)->assertAdmin();

        return $this->bus->dispatch(
            new CreateEmoji(Arr::get($request->getParsedBody(), 'data', []))
        );
    }
}
