<?php
/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace PianoTell\Flamoji\Models;

use Flarum\Database\AbstractModel;

/**
 * @property int         $id
 * @property string|null $title
 * @property string|null $text_to_replace
 * @property string|null $category
 * @property string      $path
 */
class Emoji extends AbstractModel
{
    protected $table = 'custom_emojis';

    /**
     * Create a new emoji.
     *
     * @param  string      $title
     * @param  string      $textToReplace
     * @param  string      $path
     * @param  string|null $category
     * @return static
     */
    public static function build($title, $textToReplace, $path, $category = null)
    {
        $emoji = new static;

        $emoji->title = $title;
        $emoji->text_to_replace = $textToReplace;
        $emoji->path = $path;
        $emoji->category = $category;

        return $emoji;
    }
}
