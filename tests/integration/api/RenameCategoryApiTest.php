<?php

/*
 * This file is part of pianotell/flarum-flamoji.
 *
 * TDD contract for the server-side bulk category rename endpoint that
 * the code review of the admin grouping feature calls for (findings #1
 * and #2): the admin UI currently renames categories by PATCHing every
 * loaded emoji individually — which silently misses emojis on unloaded
 * list pages and fails non-atomically. This test pins the endpoint the
 * fix should provide.
 *
 * ⚠️ EXPECTED TO FAIL (404) until `POST /api/flamojis/rename-category`
 * exists.
 */

namespace PianoTell\Flamoji\Tests\integration\api;

use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use PianoTell\Flamoji\Models\Emoji;
use PHPUnit\Framework\Attributes\Test;

class RenameCategoryApiTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    protected function setUp(): void
    {
        parent::setUp();

        $this->extension('pianotell-flamoji');

        $this->prepareDatabase([
            'users' => [
                $this->normalUser(),
            ],
            'custom_emojis' => $this->emojiFixtures(),
        ]);
    }

    /**
     * 30 emojis in 'Big' — deliberately more than the admin list's page
     * size (23) — plus 2 in 'Other' that must never be touched.
     */
    private function emojiFixtures(): array
    {
        $rows = [];
        for ($i = 1; $i <= 30; $i++) {
            $rows[] = [
                'id' => $i,
                'title' => "Big {$i}",
                'text_to_replace' => ":big{$i}:",
                'path' => "/big{$i}.png",
                'category' => 'Big',
            ];
        }
        $rows[] = [
            'id' => 31, 'title' => 'Other 1', 'text_to_replace' => ':other1:',
            'path' => '/other1.png', 'category' => 'Other',
        ];
        $rows[] = [
            'id' => 32, 'title' => 'Other 2', 'text_to_replace' => ':other2:',
            'path' => '/other2.png', 'category' => 'Other',
        ];

        return $rows;
    }

    private function renameCategory(string $as, string $from, string $to): \Psr\Http\Message\ResponseInterface
    {
        return $this->send($this->request('POST', '/api/flamojis/rename-category', [
            'authenticatedAs' => $as,
            'json' => ['from' => $from, 'to' => $to],
        ]));
    }

    #[Test]
    public function rename_endpoint_renames_every_emoji_regardless_of_pagination(): void
    {
        $response = $this->renameCategory(1, 'Big', 'Big Renamed');

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertSame(30, Emoji::where('category', 'Big Renamed')->count());
        $this->assertSame(0, Emoji::where('category', 'Big')->count());
        $this->assertSame(2, Emoji::where('category', 'Other')->count());
    }

    #[Test]
    public function rename_endpoint_is_admin_gated(): void
    {
        // Boot the app (the send() below also primes the DB connection
        // for the model resolver, following the ImportApiTest pattern).
        $this->send($this->request('GET', '/api/flamojis'));
        $countBefore = Emoji::where('category', 'Big')->count();

        $response = $this->renameCategory(2, 'Big', 'Big Renamed');

        $this->assertEquals(403, $response->getStatusCode());
        $this->assertSame($countBefore, Emoji::where('category', 'Big')->count());
        $this->assertSame(0, Emoji::where('category', 'Big Renamed')->count());
    }

    #[Test]
    public function rename_endpoint_requires_authentication(): void
    {
        $this->send($this->request('GET', '/api/flamojis'));

        $response = $this->send($this->request('POST', '/api/flamojis/rename-category', [
            'json' => ['from' => 'Big', 'to' => 'Big Renamed'],
        ]));

        $this->assertContains($response->getStatusCode(), [401, 403, 400]);
        $this->assertSame(30, Emoji::where('category', 'Big')->count());
    }

    #[Test]
    public function rename_endpoint_validates_new_category_length(): void
    {
        $response = $this->renameCategory(1, 'Big', str_repeat('x', 256));

        $this->assertEquals(422, $response->getStatusCode());
        $this->assertSame(30, Emoji::where('category', 'Big')->count());
        $this->assertSame(0, Emoji::where('category', str_repeat('x', 255))->count());
    }

    #[Test]
    public function rename_endpoint_to_empty_string_clears_category_to_null(): void
    {
        $response = $this->renameCategory(1, 'Big', '');

        $this->assertEquals(200, $response->getStatusCode());
        // All 30 'Big' rows are now uncategorized; 'Other' is untouched.
        $this->assertSame(30, Emoji::whereNull('category')->count());
        $this->assertSame(0, Emoji::where('category', 'Big')->count());
        $this->assertSame(2, Emoji::where('category', 'Other')->count());
    }

    #[Test]
    public function rename_endpoint_to_literal_uncategorized_stores_the_string_not_null(): void
    {
        // Review finding #4: the frontend coerces the literal
        // "Uncategorized" to null. The server-side contract must keep it
        // as real data so admins can have a category with that name.
        $response = $this->renameCategory(1, 'Big', 'Uncategorized');

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertSame(30, Emoji::where('category', 'Uncategorized')->count());
        $this->assertSame(0, Emoji::whereNull('category')->count());
    }

    #[Test]
    public function rename_endpoint_is_a_no_op_for_unknown_categories(): void
    {
        $response = $this->renameCategory(1, 'No Such Category', 'Whatever');

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertSame(30, Emoji::where('category', 'Big')->count());
        $this->assertSame(2, Emoji::where('category', 'Other')->count());
        $this->assertSame(0, Emoji::where('category', 'Whatever')->count());
    }
}
