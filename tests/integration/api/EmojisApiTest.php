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
    public function create_endpoint_persists_category_for_admin(): void
    {
        $response = $this->send($this->request('POST', '/api/pianotell/emojis', [
            'authenticatedAs' => 1,
            'json' => ['data' => ['attributes' => [
                'title' => 'Doge',
                'text_to_replace' => ':doge:',
                'path' => '/doge.png',
                'category' => '  Memes  ',
            ]]],
        ]));

        $this->assertEquals(201, $response->getStatusCode());
        $this->assertSame('Memes', Emoji::where('text_to_replace', ':doge:')->first()->category);
    }

    /** @test */
    public function create_endpoint_rejects_non_canonical_shortcode(): void
    {
        $response = $this->send($this->request('POST', '/api/pianotell/emojis', [
            'authenticatedAs' => 1,
            'json' => ['data' => ['attributes' => [
                'title' => 'Bare',
                'text_to_replace' => 'png',
                'path' => '/png.png',
            ]]],
        ]));

        $this->assertEquals(422, $response->getStatusCode());
        $this->assertFalse(Emoji::where('text_to_replace', 'png')->exists());
    }

    /** @test */
    public function create_endpoint_rejects_duplicate_trigger(): void
    {
        // :wave: is already seeded (id 1).
        $response = $this->send($this->request('POST', '/api/pianotell/emojis', [
            'authenticatedAs' => 1,
            'json' => ['data' => ['attributes' => [
                'title' => 'Dupe',
                'text_to_replace' => ':wave:',
                'path' => '/dupe.png',
            ]]],
        ]));

        $this->assertEquals(422, $response->getStatusCode());
        $this->assertSame(1, Emoji::where('text_to_replace', ':wave:')->count());
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
    public function update_endpoint_rejects_duplicate_trigger(): void
    {
        // Changing :smile: (id 2) to :wave: (id 1) must be rejected.
        $response = $this->send($this->request('PATCH', '/api/pianotell/emojis/2', [
            'authenticatedAs' => 1,
            'json' => ['data' => ['attributes' => ['textToReplace' => ':wave:']]],
        ]));

        $this->assertEquals(422, $response->getStatusCode());
        $this->assertSame(':smile:', Emoji::find(2)->text_to_replace);
    }

    /** @test */
    public function update_endpoint_allows_saving_emoji_with_its_own_unchanged_trigger(): void
    {
        $response = $this->send($this->request('PATCH', '/api/pianotell/emojis/1', [
            'authenticatedAs' => 1,
            'json' => ['data' => ['attributes' => [
                'title' => 'Wave Renamed',
                'textToReplace' => ':wave:',
            ]]],
        ]));

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertSame('Wave Renamed', Emoji::find(1)->title);
    }

    /** @test */
    public function update_endpoint_enforces_canonical_when_changing_trigger(): void
    {
        $response = $this->send($this->request('PATCH', '/api/pianotell/emojis/1', [
            'authenticatedAs' => 1,
            'json' => ['data' => ['attributes' => ['textToReplace' => 'png']]],
        ]));

        $this->assertEquals(422, $response->getStatusCode());
        $this->assertSame(':wave:', Emoji::find(1)->text_to_replace);
    }

    /** @test */
    public function update_endpoint_grandfathers_legacy_trigger_when_only_title_changes(): void
    {
        // Seed a row whose trigger predates the canonical rule (a bare word).
        $this->send($this->request('GET', '/api/pianotell/emojis'));
        Emoji::query()->insert([
            'id' => 99,
            'title' => 'Legacy',
            'text_to_replace' => 'legacyword',
            'path' => '/legacy.png',
        ]);

        $response = $this->send($this->request('PATCH', '/api/pianotell/emojis/99', [
            'authenticatedAs' => 1,
            'json' => ['data' => ['attributes' => ['title' => 'Legacy Renamed']]],
        ]));

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertSame('Legacy Renamed', Emoji::find(99)->title);
        $this->assertSame('legacyword', Emoji::find(99)->text_to_replace);
    }

    /** @test */
    public function update_endpoint_persists_category(): void
    {
        $response = $this->send($this->request('PATCH', '/api/pianotell/emojis/1', [
            'authenticatedAs' => 1,
            'json' => ['data' => ['attributes' => ['category' => '  Reactions  ']]],
        ]));

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertSame('Reactions', Emoji::find(1)->category);
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

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertNotNull(Emoji::where('text_to_replace', ':a:')->first());
        $this->assertNotNull(Emoji::where('text_to_replace', ':b:')->first());
    }

    /** @test */
    public function import_endpoint_persists_category(): void
    {
        $response = $this->send($this->request('POST', '/api/pianotell/import-emojis', [
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

    /** @test */
    public function import_endpoint_is_tolerant_of_non_canonical_and_reports_them(): void
    {
        $response = $this->send($this->request('POST', '/api/pianotell/import-emojis', [
            'authenticatedAs' => 1,
            'json' => ['data' => [
                ['title' => 'Good', 'text_to_replace' => ':good:', 'path' => '/good.png'],
                ['title' => 'Legacy', 'text_to_replace' => 'bareword', 'path' => '/bare.png'],
            ]],
        ]));

        $this->assertEquals(200, $response->getStatusCode());
        // Both persisted (tolerant import).
        $this->assertNotNull(Emoji::where('text_to_replace', ':good:')->first());
        $this->assertNotNull(Emoji::where('text_to_replace', 'bareword')->first());
        // Only the non-canonical trigger is reported.
        $body = json_decode($response->getBody()->getContents(), true);
        $this->assertSame(['bareword'], $body['legacyShortcodes']);
    }

    /** @test */
    public function import_endpoint_rejects_duplicate_against_existing(): void
    {
        // :wave: is already seeded.
        $this->send($this->request('GET', '/api/pianotell/emojis'));
        $countBefore = Emoji::count();

        $response = $this->send($this->request('POST', '/api/pianotell/import-emojis', [
            'authenticatedAs' => 1,
            'json' => ['data' => [
                ['title' => 'Dup', 'text_to_replace' => ':wave:', 'path' => '/d.png'],
            ]],
        ]));

        $this->assertEquals(422, $response->getStatusCode());
        $this->assertEquals($countBefore, Emoji::count());
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
