<?php

/*
 * This file is part of pianotell/flarum-ext-flamoji.
 *
 * Bootstraps the Flarum integration test environment. Run via:
 *   composer test:setup
 * which delegates to flarum/testing's SetupScript (creates the test DB,
 * runs core migrations, configures storage paths, etc.). See
 * https://docs.flarum.org/extend/testing for env-var configuration.
 */

use Flarum\Testing\integration\Setup\SetupScript;

require __DIR__.'/../../vendor/autoload.php';

(new SetupScript())->run();
