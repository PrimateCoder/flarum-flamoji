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

To add a new spec: drop it in this directory, write a sibling `*.md`
documenting the contract it enforces, and append its path to the
`SPECS=()` array in `run.sh`.

## Harness

The provisioner, env-var reference, and multi-user / teardown recipes
live in the shared submodule:
[`.pianotell/tests/ux/README.md`](../../.pianotell/tests/ux/README.md).
