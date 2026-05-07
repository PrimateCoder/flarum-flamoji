<?php
/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace PianoTell\Flamoji\Commands;

class ImportEmoji
{
    /**
     * The attributes of the new emoji.
     *
     * @var array
     */
    public $data;

    /**
     * @param array $data The attributes of the new emoji.
     */
    public function __construct(array $data)
    {
        $this->data = $data;
    }
}
