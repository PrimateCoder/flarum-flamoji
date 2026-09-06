<?php

namespace PianoTell\Flamoji\Tests\integration\api;

use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use PianoTell\Flamoji\Models\Emoji;
use PHPUnit\Framework\Attributes\Test;

class ImportApiTest extends TestCase
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
            'custom_emojis' => [
                ['id' => 1, 'title' => 'Wave', 'text_to_replace' => ':wave:', 'path' => '/wave.png'],
                ['id' => 2, 'title' => 'Smile', 'text_to_replace' => ':smile:', 'path' => '/smile.png'],
                ['id' => 3, 'title' => 'Frown', 'text_to_replace' => ':frown:', 'path' => '/frown.png'],
            ],
        ]);
    }

    #[Test]
    public function import_endpoint_persists_all_rows_for_admin(): void
    {
        $response = $this->send($this->request('POST', '/api/flamojis/import', [
            'authenticatedAs' => 1,
            'json' => ['data' => [
                ['title' => 'A', 'text_to_replace' => ':a:', 'path' => '/a.png'],
                ['title' => 'B', 'text_to_replace' => ':b:', 'path' => '/b.png'],
            ]],
        ]));

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertNotNull(Emoji::where('text_to_replace', ':a:')->first());
        $this->assertNotNull(Emoji::where('text_to_replace', ':b:')->first());
    }

    #[Test]
    public function import_endpoint_persists_category_and_defaults_blank_to_null(): void
    {
        $response = $this->send($this->request('POST', '/api/flamojis/import', [
            'authenticatedAs' => 1,
            'json' => ['data' => [
                ['title' => 'A', 'text_to_replace' => ':a:', 'path' => '/a.png', 'category' => 'Memes'],
                ['title' => 'B', 'text_to_replace' => ':b:', 'path' => '/b.png'],
            ]],
        ]));

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertSame('Memes', Emoji::where('text_to_replace', ':a:')->first()->category);
        $this->assertNull(Emoji::where('text_to_replace', ':b:')->first()->category);
    }

    #[Test]
    public function import_endpoint_accepts_legacy_payload_without_category_field(): void
    {
        $response = $this->send($this->request('POST', '/api/flamojis/import', [
            'authenticatedAs' => 1,
            'json' => ['data' => [
                ['title' => 'Legacy One', 'text_to_replace' => ':legacy1:', 'path' => '/legacy1.png'],
                ['title' => 'Legacy Two', 'text_to_replace' => ':legacy2:', 'path' => '/legacy2.png'],
            ]],
        ]));

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertNull(Emoji::where('text_to_replace', ':legacy1:')->first()->category);
        $this->assertNull(Emoji::where('text_to_replace', ':legacy2:')->first()->category);
    }

    #[Test]
    public function import_endpoint_is_tolerant_of_non_canonical_and_reports_them(): void
    {
        $response = $this->send($this->request('POST', '/api/flamojis/import', [
            'authenticatedAs' => 1,
            'json' => ['data' => [
                ['title' => 'Good', 'text_to_replace' => ':good:', 'path' => '/good.png'],
                ['title' => 'Legacy', 'text_to_replace' => 'bareword', 'path' => '/bare.png'],
            ]],
        ]));

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertNotNull(Emoji::where('text_to_replace', ':good:')->first());
        $this->assertNotNull(Emoji::where('text_to_replace', 'bareword')->first());

        $body = json_decode($response->getBody()->getContents(), true);
        $this->assertSame(['bareword'], $body['legacyShortcodes']);
    }

    #[Test]
    public function import_endpoint_reports_no_legacy_shortcodes_when_all_canonical(): void
    {
        $response = $this->send($this->request('POST', '/api/flamojis/import', [
            'authenticatedAs' => 1,
            'json' => ['data' => [
                ['title' => 'A', 'text_to_replace' => ':a:', 'path' => '/a.png'],
            ]],
        ]));

        $this->assertEquals(200, $response->getStatusCode());
        $body = json_decode($response->getBody()->getContents(), true);
        $this->assertSame([], $body['legacyShortcodes']);
    }

    #[Test]
    public function import_endpoint_aborts_when_any_row_invalid_and_persists_nothing(): void
    {
        $this->send($this->request('GET', '/api/flamojis'));
        $countBefore = Emoji::count();

        $response = $this->send($this->request('POST', '/api/flamojis/import', [
            'authenticatedAs' => 1,
            'json' => ['data' => [
                ['title' => 'Good', 'text_to_replace' => ':good:', 'path' => '/g.png'],
                ['title' => 'Bad', 'text_to_replace' => '', 'path' => ''],
            ]],
        ]));

        $this->assertEquals(422, $response->getStatusCode());
        $this->assertEquals($countBefore, Emoji::count());
        $this->assertNull(Emoji::where('text_to_replace', ':good:')->first());
    }

    #[Test]
    public function import_endpoint_override_mode_wipes_database_and_inserts_new_rows(): void
    {
        $this->send($this->request('GET', '/api/flamojis'));
        $countBefore = Emoji::count();
        $this->assertGreaterThan(0, $countBefore);

        $response = $this->send($this->request('POST', '/api/flamojis/import', [
            'authenticatedAs' => 1,
            'json' => [
                'mode' => 'override',
                'data' => [
                    ['title' => 'New', 'text_to_replace' => ':new:', 'path' => '/new.png'],
                ]
            ],
        ]));

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertEquals(1, Emoji::count());
        $this->assertNotNull(Emoji::where('text_to_replace', ':new:')->first());
        $this->assertNull(Emoji::where('text_to_replace', ':wave:')->first());
    }

    #[Test]
    public function import_endpoint_append_mode_retains_existing_rows(): void
    {
        $this->send($this->request('GET', '/api/flamojis'));
        $countBefore = Emoji::count();
        $this->assertGreaterThan(0, $countBefore);

        $response = $this->send($this->request('POST', '/api/flamojis/import', [
            'authenticatedAs' => 1,
            'json' => [
                'mode' => 'append',
                'data' => [
                    ['title' => 'New', 'text_to_replace' => ':new:', 'path' => '/new.png'],
                ]
            ],
        ]));

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertEquals($countBefore + 1, Emoji::count());
        $this->assertNotNull(Emoji::where('text_to_replace', ':new:')->first());
        $this->assertNotNull(Emoji::where('text_to_replace', ':wave:')->first());
    }

    #[Test]
    public function import_endpoint_detects_duplicates_within_batch(): void
    {
        $this->send($this->request('GET', '/api/flamojis'));
        $countBefore = Emoji::count();

        $response = $this->send($this->request('POST', '/api/flamojis/import', [
            'authenticatedAs' => 1,
            'json' => [
                'mode' => 'append',
                'data' => [
                    ['title' => 'First', 'text_to_replace' => ':duplicate:', 'path' => '/a.png'],
                    ['title' => 'Second', 'text_to_replace' => ':duplicate:', 'path' => '/b.png'],
                ]
            ],
        ]));

        $this->assertEquals(422, $response->getStatusCode());
        $this->assertEquals($countBefore, Emoji::count());
    }

    #[Test]
    public function import_endpoint_rejects_normal_user(): void
    {
        $response = $this->send($this->request('POST', '/api/flamojis/import', [
            'authenticatedAs' => 2,
            'json' => ['data' => [['title' => 'X', 'text_to_replace' => ':x:', 'path' => '/x.png']]],
        ]));

        $this->assertEquals(403, $response->getStatusCode());
    }
}
