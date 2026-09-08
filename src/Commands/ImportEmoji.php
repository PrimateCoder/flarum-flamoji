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
     * The import mode ('append' or 'override').
     *
     * @var string
     */
    public $mode;

    /**
     * @param array $data The attributes of the new emoji.
     * @param string $mode The import mode ('append' or 'override').
     */
    public function __construct(array $data, string $mode = 'append')
    {
        $this->data = $data;
        $this->mode = $mode;
    }
}
