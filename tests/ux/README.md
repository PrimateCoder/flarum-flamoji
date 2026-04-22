# UX tests

Black-box browser tests for `flarum-flamoji`. Each spec drives a real
Chromium against a running Flarum dev container via Playwright and
asserts on observed DOM behavior — no source imports.

## Running

```sh
tests/ux/run.sh                    # all specs
tests/ux/run.sh <spec-substring>   # one spec by basename match
```

The wrapper auto-inits the `.pianotell/` submodule on a fresh clone.

## Specs

| Spec                            | Doc                            |
| ------------------------------- | ------------------------------ |
| `picker-positioning.spec.mjs`   | [picker-positioning.md](picker-positioning.md) |
| `picker-features.spec.mjs`      | [picker-features.md](picker-features.md) |
| `admin-options.spec.mjs`        | [admin-options.md](admin-options.md) |
| `custom-emoji.spec.mjs`         | [custom-emoji.md](custom-emoji.md) |
| `import-export.spec.mjs`        | [import-export.md](import-export.md) |
| `picker-baseline.spec.mjs`      | [picker-baseline.md](picker-baseline.md) |

All admin-side mutation goes through the shared admin-UI helper module
[`_admin.mjs`](_admin.mjs), which drives the same buttons and modals a
human admin uses. There are no DB writes or REST shortcuts in any
spec — the admin panel is itself part of every test's surface area.

### Pixel baselines

`picker-baseline.spec.mjs` compares against committed PNG/JSON snapshots
in `_baselines/`. To refresh them after an intentional UI change:

```sh
FLAMOJI_BASELINE_UPDATE=1 tests/ux/run.sh picker-baseline
```

Review the resulting `_baselines/*.png` diff in `git` before committing.

### Extra deps

The pixel baseline spec uses `pixelmatch` + `pngjs`. They aren't part
of the harness's pinned deps yet; install them once into the harness:

```sh
(cd .pianotell/tests/ux && npm install --no-save pixelmatch pngjs)
```

To add a new spec: drop it in this directory, write a sibling `*.md`
documenting the contract it enforces, and append its path to the
`SPECS=()` array in `run.sh`.

## Harness

The provisioner, env-var reference, and multi-user / teardown recipes
live in the shared submodule:
[`.pianotell/tests/ux/README.md`](../../.pianotell/tests/ux/README.md).
