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
use Laminas\Diactoros\Response\JsonResponse;
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

        $body = $request->getParsedBody();
        $data = Arr::get($body, 'data', []);
        $mode = Arr::get($body, 'mode', 'append');

        // The handler returns the non-canonical ("legacy") shortcodes that
        // were imported as-is, so the admin UI can surface a non-blocking
        // notice. Older clients ignore the body.
        $legacyShortcodes = $this->bus->dispatch(
            new ImportEmoji($data, $mode)
        );

        return new JsonResponse(['legacyShortcodes' => $legacyShortcodes], 200);
    }
}
