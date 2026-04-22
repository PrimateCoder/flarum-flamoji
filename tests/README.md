# Flamoji backend tests

Two test suites, scaffolded with [`flarum/testing`](https://github.com/flarum/testing):

- **`tests/unit`** — pure PHP unit tests. No database required.
- **`tests/integration`** — full Flarum HTTP-stack tests. Boots a real Flarum
  app against a MySQL/MariaDB test database.

## Running

```bash
composer install                      # installs flarum/testing
composer test:unit                    # always works
```

For integration tests, point flarum/testing at a **dedicated** test database
(it will be wiped + re-seeded on every test):

```bash
export DB_HOST=127.0.0.1
export DB_PORT=3306
export DB_DATABASE=flamoji_test       # MUST be disposable
export DB_USERNAME=root
export DB_PASSWORD=root
export DB_PREFIX=

composer test:setup                   # one-time: creates schema + storage
composer test:integration
```

CI runs both suites automatically via the
[`flarum/framework` reusable backend workflow](../.github/workflows/backend.yml)
— no local DB setup needed for PRs.

## Layout

```
tests/
├── phpunit.unit.xml
├── phpunit.integration.xml
├── unit/
│   └── Commands/
│       └── EmojiRulesTest.php       # validation rule edge cases
├── integration/
│   ├── setup.php                    # bootstrap, runs Flarum SetupScript
│   └── api/
│       └── EmojisApiTest.php        # 5 endpoints + serializer + settings
└── ux/                              # Playwright frontend specs (separate)
```
