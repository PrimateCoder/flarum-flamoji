<?php
/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace PianoTell\Flamoji\Api\Controllers;

use Flarum\Http\RequestUtil;
use PianoTell\Flamoji\Commands\ImportEmoji;
use Illuminate\Contracts\Bus\Dispatcher;
use Illuminate\Support\Arr;
use Laminas\Diactoros\Response\EmptyResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

class ImportEmojiController implements RequestHandlerInterface
{
    /**
     * @var Dispatcher
     */
    protected $bus;

    public function __construct(Dispatcher $bus)
    {
        $this->bus = $bus;
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        RequestUtil::getActor($request)->assertAdmin();

        $this->bus->dispatch(
            new ImportEmoji(Arr::get($request->getParsedBody(), 'data', []))
        );

        return new EmptyResponse(204);
    }
}
