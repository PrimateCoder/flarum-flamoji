<?php

namespace PianoTell\Flamoji\Tests\unit\Commands;

use Flarum\Foundation\ValidationException;
use Flarum\Testing\unit\TestCase;
use PianoTell\Flamoji\Commands\EmojiRules;

class EmojiRulesTest extends TestCase
{
    /** @test */
    public function validate_create_returns_trimmed_attributes_on_success(): void
    {
        $result = EmojiRules::validateCreate([
            'title' => '  My Title  ',
            'text_to_replace' => '  :wave:  ',
            'path' => '  https://cdn/wave.png  ',
        ]);

        $this->assertSame([
            'title' => 'My Title',
            'text_to_replace' => ':wave:',
            'path' => 'https://cdn/wave.png',
        ], $result);
    }

    /** @test */
    public function validate_create_accepts_camelcase_text_to_replace_alias(): void
    {
        // Edit handler uses `textToReplace` while list/create handlers use
        // `text_to_replace`. EmojiRules normalizes both into one shape.
        $result = EmojiRules::validateCreate([
            'title' => 'A',
            'textToReplace' => ':a:',
            'path' => '/a.png',
        ]);

        $this->assertSame(':a:', $result['text_to_replace']);
    }

    /** @test */
    public function validate_create_treats_title_as_optional(): void
    {
        $result = EmojiRules::validateCreate([
            'text_to_replace' => ':x:',
            'path' => '/x.png',
        ]);

        $this->assertSame('', $result['title']);
    }

    /** @test */
    public function validate_create_rejects_missing_required_fields(): void
    {
        try {
            EmojiRules::validateCreate([]);
            $this->fail('Expected ValidationException for empty payload');
        } catch (ValidationException $e) {
            $errors = $e->getAttributes();
            $this->assertArrayHasKey('text_to_replace', $errors);
            $this->assertArrayHasKey('path', $errors);
        }
    }

    /** @test */
    public function validate_create_rejects_whitespace_in_text_to_replace(): void
    {
        try {
            EmojiRules::validateCreate([
                'text_to_replace' => ':my emoji:',
                'path' => '/x.png',
            ]);
            $this->fail('Expected ValidationException');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('text_to_replace', $e->getAttributes());
        }
    }

    /** @test */
    public function validate_create_rejects_unicode_whitespace_in_text_to_replace(): void
    {
        // \s in PCRE with the /u flag must catch non-breaking space etc.
        try {
            EmojiRules::validateCreate([
                'text_to_replace' => ":my\u{00A0}emoji:",
                'path' => '/x.png',
            ]);
            $this->fail('Expected ValidationException');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('text_to_replace', $e->getAttributes());
        }
    }

    /** @test */
    public function validate_create_applies_error_key_prefix_for_bulk_import(): void
    {
        try {
            EmojiRules::validateCreate(['text_to_replace' => '', 'path' => ''], 'data.7.');
            $this->fail('Expected ValidationException');
        } catch (ValidationException $e) {
            $errors = $e->getAttributes();
            $this->assertArrayHasKey('data.7.text_to_replace', $errors);
            $this->assertArrayHasKey('data.7.path', $errors);
        }
    }

    /** @test */
    public function validate_text_to_replace_returns_null_for_optional_empty(): void
    {
        $this->assertNull(EmojiRules::validateTextToReplace('', false));
    }

    /** @test */
    public function validate_text_to_replace_returns_error_for_required_empty(): void
    {
        $this->assertNotNull(EmojiRules::validateTextToReplace('', true));
    }

    /** @test */
    public function validate_text_to_replace_accepts_valid_input(): void
    {
        $this->assertNull(EmojiRules::validateTextToReplace(':wave:', true));
    }

    /** @test */
    public function validate_path_returns_null_for_optional_empty(): void
    {
        // Empty + not-required is "no change" semantics for the edit path.
        $this->assertNull(EmojiRules::validatePath('', false));
    }

    /** @test */
    public function validate_path_returns_error_for_required_empty(): void
    {
        $this->assertNotNull(EmojiRules::validatePath('', true));
    }

    /** @test */
    public function validate_path_accepts_any_non_empty_value(): void
    {
        // Path is intentionally unconstrained: it covers absolute URLs, app
        // resource paths, and Flarum-relative refs.
        $this->assertNull(EmojiRules::validatePath('https://cdn/x.png', true));
        $this->assertNull(EmojiRules::validatePath('/assets/x.png', true));
        $this->assertNull(EmojiRules::validatePath('x.png', true));
    }
}
