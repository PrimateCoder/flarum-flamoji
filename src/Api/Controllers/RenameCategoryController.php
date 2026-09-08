<?php
/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace PianoTell\Flamoji\Api\Controllers;

use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use PianoTell\Flamoji\Commands\RenameCategory;
use Illuminate\Contracts\Bus\Dispatcher;
use Illuminate\Support\Arr;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

class RenameCategoryController implements RequestHandlerInterface
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
        $from = Arr::get($body, 'from');
        $to = Arr::get($body, 'to');

        foreach (['from', 'to'] as $key) {
            $value = $$key;
            if ($value !== null && ! is_string($value)) {
                throw new ValidationException([$key => 'Must be a string or null.']);
            }
        }

        $updated = $this->bus->dispatch(
            new RenameCategory($from, $to)
        );

        return new JsonResponse(['updated' => $updated], 200);
    }
}
