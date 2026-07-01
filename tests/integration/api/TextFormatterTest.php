<?php

namespace PianoTell\Flamoji\Tests\integration\api;

use Flarum\Formatter\Formatter;
use Flarum\Testing\integration\TestCase;

class TextFormatterTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->extension('pianotell-flamoji');

        $this->prepareDatabase([
            'custom_emojis' => [
                // Relative path → base URL should be prepended.
                ['id' => 1, 'title' => 'Party', 'text_to_replace' => ':party:', 'path' => '/party.png', 'category' => 'Memes'],
                // Absolute URL → passed through unchanged.
                ['id' => 2, 'title' => 'Fox',   'text_to_replace' => ':fox:',   'path' => 'https://cdn.example/fox.png', 'category' => null],
                // Category with a double-quote → must be safely escaped in the attribute.
                ['id' => 3, 'title' => 'Quote', 'text_to_replace' => ':quote:', 'path' => '/quote.png', 'category' => 'Sa"y'],
            ],
        ]);
    }

    private function render(string $text): string
    {
        $formatter = $this->app()->getContainer()->make(Formatter::class);

        return $formatter->render($formatter->parse($text));
    }

    /** @test */
    public function renders_custom_emoji_span_with_category_data_attribute(): void
    {
        $html = $this->render('hello :party: world');

        $this->assertStringContainsString('class="flamoji"', $html);
        $this->assertStringContainsString('data-flamoji-category="Memes"', $html);
    }

    /** @test */
    public function prepends_base_url_to_relative_path(): void
    {
        $html = $this->render(':party:');

        $this->assertMatchesRegularExpression('#src="https?://[^"]+/party\.png"#', $html);
    }

    /** @test */
    public function passes_absolute_url_through_unchanged_and_omits_attribute_when_uncategorized(): void
    {
        $html = $this->render(':fox:');

        $this->assertStringContainsString('src="https://cdn.example/fox.png"', $html);
        $this->assertStringNotContainsString('data-flamoji-category', $html);
    }

    /** @test */
    public function escapes_category_value_in_the_attribute(): void
    {
        $html = $this->render(':quote:');

        $this->assertStringContainsString('data-flamoji-category="Sa&quot;y"', $html);
        $this->assertStringNotContainsString('data-flamoji-category="Sa"y"', $html);
    }
}
