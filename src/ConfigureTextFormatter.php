<?php
/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace PianoTell\Flamoji;

use Flarum\Http\UrlGenerator;
use PianoTell\Flamoji\Models\Emoji;
use s9e\TextFormatter\Configurator;

class ConfigureTextFormatter
{
    protected UrlGenerator $url;

    /**
     * @param UrlGenerator $url
     */
    public function __construct(UrlGenerator $url)
    {
        $this->url = $url;
    }

    /**
     * Configure s9e/TextFormatter
     *
     * @param Configurator $config
     */
    public function __invoke(Configurator $config)
    {
        $customEmojis = Emoji::all();

        foreach ($customEmojis as $emoji) {
            // Skip rows missing the trigger or the image path. The DB column
            // for text_to_replace is nullable and path can be blank if a row
            // was inserted outside the API (the API requires both), so guard
            // defensively — otherwise we'd register an empty trigger or emit
            // an <img> with an empty/base-only src on every matching post.
            if (empty($emoji->text_to_replace) || empty($emoji->path)) {
                continue;
            }

            $path = $emoji->path;

            // Treat the path as absolute only when it actually starts with
            // http(s)://. Anchored to match urlChecker.js (^(http|https)://)
            // so the picker and post rendering agree; otherwise it's a
            // forum-relative path and we prepend the base URL.
            if (!preg_match('/^https?:\/\//i', $path)) {
                $path = $this->url->to('forum')->base() . $path;
            }

            $config->Emoticons->add(
                $emoji->text_to_replace,
                '
                    <span class="flamoji">
                        <img src="' . htmlspecialchars($path, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '" alt="' . htmlspecialchars((string) $emoji->title, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '" />
                    </span>
                '
            );
        }
    }
}
