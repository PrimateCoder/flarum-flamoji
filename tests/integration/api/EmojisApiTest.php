<?php

namespace PianoTell\Flamoji\Tests\integration\api;

use Flarum\Extension\ExtensionManager;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use PianoTell\Flamoji\Models\Emoji;

class EmojisApiTest extends TestCase
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
                ['id' => 1, 'title' => 'Wave',   'text_to_replace' => ':wave:',   'path' => '/wave.png'],
                ['id' => 2, 'title' => 'Smile',  'text_to_replace' => ':smile:',  'path' => '/smile.png'],
                ['id' => 3, 'title' => 'Frown',  'text_to_replace' => ':frown:',  'path' => '/frown.png'],
            ],
        ]);
    }

    /** @test */
    public function list_endpoint_is_publicly_accessible(): void
    {
        $response = $this->send($this->request('GET', '/api/pianotell/emojis'));

        $this->assertEquals(200, $response->getStatusCode());
        $body = json_decode($response->getBody()->getContents(), true);
        $this->assertCount(3, $body['data']);
    }

    /** @test */
    public function list_endpoint_orders_by_id_descending(): void
    {
        $response = $this->send($this->request('GET', '/api/pianotell/emojis'));
        $body = json_decode($response->getBody()->getContents(), true);

        $ids = array_map(fn ($r) => (int) $r['id'], $body['data']);
        $this->assertSame([3, 2, 1], $ids);
    }

    /** @test */
    public function list_endpoint_filter_all_returns_full_set_unpaginated(): void
    {
        // Used by the forum picker to feed every custom emoji into the
        // "Custom" category in one round-trip.
        $response = $this->send($this->request('GET', '/api/pianotell/emojis?filter[all]=1'));
        $body = json_decode($response->getBody()->getContents(), true);

        $this->assertCount(3, $body['data']);
    }

    /** @test */
    public function create_endpoint_rejects_anonymous_request(): void
    {
        $response = $this->send($this->request('POST', '/api/pianotell/emojis', [
            'json' => ['data' => ['attributes' => ['title' => 'X', 'text_to_replace' => ':x:', 'path' => '/x.png']]],
        ]));

        // Without auth, Flarum's CSRF middleware rejects with 400 before the
        // request reaches the controller. Either 400 (CSRF) or 401 (auth) is
        // acceptable evidence that anonymous create is blocked.
        $this->assertContains($response->getStatusCode(), [400, 401]);
        $this->assertNull(Emoji::where('text_to_replace', ':x:')->first());
    }

    /** @test */
    public function create_endpoint_rejects_normal_user(): void
    {
        $response = $this->send($this->request('POST', '/api/pianotell/emojis', [
            'authenticatedAs' => 2,
            'json' => ['data' => ['attributes' => ['title' => 'X', 'text_to_replace' => ':x:', 'path' => '/x.png']]],
        ]));

        $this->assertEquals(403, $response->getStatusCode());
    }

    /** @test */
    public function create_endpoint_persists_new_emoji_for_admin(): void
    {
        $response = $this->send($this->request('POST', '/api/pianotell/emojis', [
            'authenticatedAs' => 1,
            'json' => ['data' => ['attributes' => [
                'title' => 'Party',
                'text_to_replace' => ':party:',
                'path' => '/party.png',
            ]]],
        ]));

        $this->assertEquals(201, $response->getStatusCode());

        $emoji = Emoji::where('text_to_replace', ':party:')->first();
        $this->assertNotNull($emoji);
        $this->assertSame('Party', $emoji->title);
        $this->assertSame('/party.png', $emoji->path);
    }

    /** @test */
    public function create_endpoint_returns_422_on_validation_failure(): void
    {
        $response = $this->send($this->request('POST', '/api/pianotell/emojis', [
            'authenticatedAs' => 1,
            'json' => ['data' => ['attributes' => [
                'title' => 'No trigger',
                'text_to_replace' => '',
                'path' => '',
            ]]],
        ]));

        $this->assertEquals(422, $response->getStatusCode());
    }

    /** @test */
    public function update_endpoint_modifies_emoji_for_admin(): void
    {
        $response = $this->send($this->request('PATCH', '/api/pianotell/emojis/1', [
            'authenticatedAs' => 1,
            'json' => ['data' => ['attributes' => [
                'title' => 'Renamed Wave',
                'textToReplace' => ':hi:',
            ]]],
        ]));

        $this->assertEquals(200, $response->getStatusCode());

        $emoji = Emoji::find(1);
        $this->assertSame('Renamed Wave', $emoji->title);
        $this->assertSame(':hi:', $emoji->text_to_replace);
        $this->assertSame('/wave.png', $emoji->path); // unchanged
    }

    /** @test */
    public function update_endpoint_returns_422_when_changing_trigger_to_whitespace_value(): void
    {
        $response = $this->send($this->request('PATCH', '/api/pianotell/emojis/1', [
            'authenticatedAs' => 1,
            'json' => ['data' => ['attributes' => ['textToReplace' => ':bad trigger:']]],
        ]));

        $this->assertEquals(422, $response->getStatusCode());
        $this->assertSame(':wave:', Emoji::find(1)->text_to_replace);
    }

    /** @test */
    public function update_endpoint_rejects_normal_user(): void
    {
        $response = $this->send($this->request('PATCH', '/api/pianotell/emojis/1', [
            'authenticatedAs' => 2,
            'json' => ['data' => ['attributes' => ['title' => 'Hax']]],
        ]));

        $this->assertEquals(403, $response->getStatusCode());
    }

    /** @test */
    public function delete_endpoint_removes_emoji_for_admin(): void
    {
        $response = $this->send($this->request('DELETE', '/api/pianotell/emojis/1', [
            'authenticatedAs' => 1,
        ]));

        $this->assertEquals(204, $response->getStatusCode());
        $this->assertNull(Emoji::find(1));
    }

    /** @test */
    public function delete_endpoint_rejects_normal_user(): void
    {
        $response = $this->send($this->request('DELETE', '/api/pianotell/emojis/1', [
            'authenticatedAs' => 2,
        ]));

        $this->assertEquals(403, $response->getStatusCode());
        $this->assertNotNull(Emoji::find(1));
    }

    /** @test */
    public function import_endpoint_persists_all_rows_for_admin(): void
    {
        $response = $this->send($this->request('POST', '/api/pianotell/import-emojis', [
            'authenticatedAs' => 1,
            'json' => ['data' => [
                ['title' => 'A', 'text_to_replace' => ':a:', 'path' => '/a.png'],
                ['title' => 'B', 'text_to_replace' => ':b:', 'path' => '/b.png'],
            ]],
        ]));

        $this->assertEquals(204, $response->getStatusCode());
        $this->assertNotNull(Emoji::where('text_to_replace', ':a:')->first());
        $this->assertNotNull(Emoji::where('text_to_replace', ':b:')->first());
    }

    /** @test */
    public function import_endpoint_aborts_when_any_row_invalid_and_persists_nothing(): void
    {
        // Boot the app first via send() so Eloquent has a connection
        // resolver wired up. Reading the count before the import lets us
        // assert all-or-nothing semantics regardless of seeded row count.
        $this->send($this->request('GET', '/api/pianotell/emojis'));
        $countBefore = Emoji::count();

        $response = $this->send($this->request('POST', '/api/pianotell/import-emojis', [
            'authenticatedAs' => 1,
            'json' => ['data' => [
                ['title' => 'Good', 'text_to_replace' => ':good:', 'path' => '/g.png'],
                ['title' => 'Bad',  'text_to_replace' => '',       'path' => ''],   // invalid
            ]],
        ]));

        $this->assertEquals(422, $response->getStatusCode());
        // All-or-nothing semantic: even the valid row in front of the invalid
        // one must NOT have been persisted.
        $this->assertEquals($countBefore, Emoji::count());
        $this->assertNull(Emoji::where('text_to_replace', ':good:')->first());
    }

    /** @test */
    public function import_endpoint_rejects_normal_user(): void
    {
        $response = $this->send($this->request('POST', '/api/pianotell/import-emojis', [
            'authenticatedAs' => 2,
            'json' => ['data' => [['title' => 'X', 'text_to_replace' => ':x:', 'path' => '/x.png']]],
        ]));

        $this->assertEquals(403, $response->getStatusCode());
    }

    /** @test */
    public function forum_payload_exposes_has_emoji_extension_attribute(): void
    {
        $response = $this->send($this->request('GET', '/api'));
        $body = json_decode($response->getBody()->getContents(), true);

        $this->assertArrayHasKey('flamoji.has_emoji_extension', $body['data']['attributes']);
        $this->assertSame(
            resolve(ExtensionManager::class)->isEnabled('flarum-emoji'),
            $body['data']['attributes']['flamoji.has_emoji_extension']
        );
    }

    /** @test */
    public function forum_payload_exposes_settings_with_correct_types(): void
    {
        $response = $this->send($this->request('GET', '/api'));
        $body = json_decode($response->getBody()->getContents(), true);
        $attrs = $body['data']['attributes'];

        // Defaults from extend.php — see Extend\Settings()->default(...) calls.
        $this->assertTrue($attrs['flamoji.auto_hide']);
        $this->assertTrue($attrs['flamoji.show_preview']);
        $this->assertTrue($attrs['flamoji.show_search']);
        $this->assertTrue($attrs['flamoji.show_variants']);
        $this->assertSame('auto', $attrs['flamoji.picker_set']);
        $this->assertTrue($attrs['flamoji.show_category_buttons']);
        $this->assertTrue($attrs['flamoji.show_recents']);
        $this->assertSame(4, $attrs['flamoji.frequent_rows']);
        // specify_categories is shipped as a JSON-encoded string; the forum
        // bundle parses it client-side.
        $this->assertIsString($attrs['flamoji.specify_categories']);
        $this->assertSame(
            ['people', 'nature', 'foods', 'activity', 'places', 'objects', 'symbols', 'flags'],
            json_decode($attrs['flamoji.specify_categories'], true)
        );
    }
}
