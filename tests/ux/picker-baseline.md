# picker-baseline.spec.mjs

Structural + pixel baseline checks that catch unintended changes to
the user-facing picker UI in the all-defaults configuration.

## Contract

Forces `picker_set=twemoji` (deterministic across OSes — `auto`/
`native` is not) plus every other admin setting at its `extend.php`
default. Then opens the composer + picker as a normal user and runs
two snapshots.

### Structural snapshot

Captures the picker's user-visible shape from inside its Shadow DOM:

* picker visible
* search input present
* preview pane present
* skin-tone button present
* nav has 8+ category buttons (default 9 incl. Frequent)
* first tile uses a sprite background (Twemoji)
* nav labels (in render order) and category headings

Compared to `_baselines/picker-defaults.json`. A diff dumps the
exact key/expected/got tuples on failure for fast triage.

### Pixel snapshot

`page.screenshot({ clip: <picker bounding box> })` compared to
`_baselines/picker-twemoji-default.png` via [`pixelmatch`][pm]
(threshold `0.1`, `includeAA: false`). A 1% per-pixel drift budget
absorbs minor antialiasing noise; anything larger fails.

On failure the spec writes:

* `_picker_actual.png` — the screenshot just captured
* `_picker_baseline_diff.png` — pixelmatch's red-pixel overlay

[pm]: https://github.com/mapbox/pixelmatch

## Updating baselines

```sh
FLAMOJI_BASELINE_UPDATE=1 tests/ux/run.sh picker-baseline
```

Both files are regenerated. **Eyeball the resulting `git diff`** before
committing — the whole point of a baseline is that it changes only
when you mean it to.

## Why two checks

Structural snapshot:
* runs identically on any host
* catches DOM-shape regressions (missing nav button, swapped sprite
  source, missing preview pane)

Pixel snapshot:
* only meaningfully passes on the same browser/font stack used to
  generate the baseline (CI or your dev machine)
* catches CSS regressions and z-index/layout drift the structural
  check would miss

## Failure artifacts

* `tests/ux/_failure.png` — full-page screenshot on unhandled error
* `tests/ux/_failures.json` — structured list of failed checks
* `tests/ux/_picker_actual.png`, `_picker_baseline_diff.png` —
  pixel-snapshot triage images (only on diff failures)
