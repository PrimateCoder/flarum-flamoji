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
            $path = (string) $emoji->path;
            $trigger = (string) $emoji->text_to_replace;

            // Skip incomplete rows: a blank trigger or path would register a
            // broken/zero-width emoticon (and a blank trigger could match
            // unexpectedly across posts).
            if ($trigger === '' || $path === '') {
                continue;
            }

            // Anchor the absolute-URL check to the start of the string
            // (mirrors urlChecker.js). An unanchored match would treat a
            // forum-relative path that merely contains "http://" later
            // (e.g. a query string) as absolute and skip prefixing.
            if (!preg_match('/^https?:\/\//i', $path)) {
                $path = $this->url->to('forum')->base() . $path;
            }

            // Expose the emoji's category on the rendered span so admins can
            // size/style per category from their own CSS, e.g.
            //   span.flamoji[data-flamoji-category="Memes"] img { height: 35px }
            // The value is the exact (freeform) category text — escaped like
            // the alt/title so it's safe inside the attribute. Uncategorized
            // emoji get no attribute (unchanged markup).
            $category = trim((string) $emoji->category);
            $categoryAttr = $category !== ''
                ? ' data-flamoji-category="' . htmlspecialchars($category, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '"'
                : '';

            $config->Emoticons->add(
                $trigger,
                '
                    <span class="flamoji"' . $categoryAttr . '>
                        <img src="' . htmlspecialchars($path, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '" alt="' . htmlspecialchars((string) $emoji->title, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '" />
                    </span>
                '
            );
        }
    }
}
