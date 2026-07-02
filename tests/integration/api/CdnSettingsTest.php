<?php

namespace PianoTell\Flamoji\Tests\integration\api;

use Flarum\Testing\integration\TestCase;

class CdnSettingsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->extension('pianotell-flamoji');
    }

    /**
     * Read the forum-document attributes (where serializeToForum() lands).
     */
    private function forumAttributes(): array
    {
        $response = $this->send($this->request('GET', '/api'));
        $this->assertEquals(200, $response->getStatusCode());

        $body = json_decode($response->getBody()->getContents(), true);

        return $body['data']['attributes'] ?? [];
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function cdn_is_disabled_by_default(): void
    {
        $attrs = $this->forumAttributes();

        $this->assertArrayHasKey('flamoji.use_cdn', $attrs);
        $this->assertFalse($attrs['flamoji.use_cdn']);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function default_cdn_urls_point_at_the_pinned_immutable_artifacts(): void
    {
        $attrs = $this->forumAttributes();

        // The JS default must be the immutable, npm-published browser.js (not
        // jsDelivr's on-the-fly browser.min.js, whose SRI is not guaranteed
        // stable), so the shipped default SRI stays valid.
        $this->assertSame(
            'https://cdn.jsdelivr.net/npm/emoji-mart@5.6.0/dist/browser.js',
            $attrs['flamoji.cdn_js_url']
        );
        $this->assertSame(
            'https://cdn.jsdelivr.net/npm/@emoji-mart/data@1.2.1/sets/15/twitter.json',
            $attrs['flamoji.cdn_data_url']
        );
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function default_sri_hashes_are_present_for_both_js_and_data(): void
    {
        $attrs = $this->forumAttributes();

        // Both resources ship with a working default Subresource Integrity hash
        // so integrity checking is on out of the box.
        $this->assertArrayHasKey('flamoji.cdn_js_sri', $attrs);
        $this->assertArrayHasKey('flamoji.cdn_data_sri', $attrs);
        $this->assertStringStartsWith('sha384-', $attrs['flamoji.cdn_js_sri']);
        $this->assertStringStartsWith('sha384-', $attrs['flamoji.cdn_data_sri']);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function overridden_cdn_settings_are_serialized_to_the_forum(): void
    {
        $this->setting('pianotell-flamoji.use_cdn', '1');
        $this->setting('pianotell-flamoji.cdn_js_url', 'https://example.test/em.js');
        $this->setting('pianotell-flamoji.cdn_js_sri', 'sha384-CUSTOMJS');
        $this->setting('pianotell-flamoji.cdn_data_url', 'https://example.test/data.json');
        $this->setting('pianotell-flamoji.cdn_data_sri', 'sha384-CUSTOMDATA');

        $attrs = $this->forumAttributes();

        $this->assertTrue($attrs['flamoji.use_cdn']);
        $this->assertSame('https://example.test/em.js', $attrs['flamoji.cdn_js_url']);
        $this->assertSame('sha384-CUSTOMJS', $attrs['flamoji.cdn_js_sri']);
        $this->assertSame('https://example.test/data.json', $attrs['flamoji.cdn_data_url']);
        $this->assertSame('sha384-CUSTOMDATA', $attrs['flamoji.cdn_data_sri']);
    }
}
