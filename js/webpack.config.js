const path = require('path');
const config = require('flarum-webpack-config')();

// flarum-webpack-config sets `output.library = 'module.exports'` so the
// extension bundle assigns to `module.exports`. Webpack derives the JSONP
// chunk-loading global from the library name, which means EVERY Flarum
// extension defaults to `webpackChunkmodule_exports`. When multiple
// extensions in the same forum each ship a webpack runtime, they fight over
// that single global and only the last-loaded extension's runtime can
// resolve dynamic `import()` chunks — silently dropping every other
// extension's lazy chunks (the chunk file fetches 200 OK, pushes to the
// global, and is then ignored).
//
// Give this extension its own chunk-loading global so our lazy emoji-mart
// and emoji-mart-data chunks reach our runtime.
config.output = {
  ...(config.output || {}),
  // Build directly into the extension's `assets/` directory, which is what
  // Flarum's Extension::copyAssetsTo() publishes recursively to
  // /public/assets/extensions/<id>/ at install/publish time. Building into
  // the default `js/dist/` and then mirroring is what previous maintainers
  // did, and the two copies drifted — keep one source of truth.
  // extend.php references `assets/dist/forum.js` accordingly.
  path: path.resolve(__dirname, '../assets/dist'),
  chunkLoadingGlobal: 'webpackChunkPianotellFlamoji',
  uniqueName: 'pianotell-flamoji',
  // Stable chunk filenames (no content hash). Webpack's default
  // [name].[contenthash].js is great for browser cache-busting, but
  // Flarum's `assets:publish` is a one-way copy: it never prunes the
  // destination directory. Every release with new chunk hashes leaves
  // the previous release's chunks orphaned in
  // /public/assets/extensions/pianotell-flamoji/dist/, accumulating
  // forever — and a partial upgrade (composer-update succeeded but
  // assets:publish hasn't run yet) leaves the new forum.js
  // referencing a hash that isn't on disk → 404 + ChunkLoadError.
  //
  // Stable names trade browser cache-busting for cleanup: each new
  // release overwrites the previous chunks in place, no orphans pile
  // up, and there's no hash mismatch window. Browsers may serve the
  // previous chunk from cache for the cache TTL after an upgrade,
  // but a hard-refresh recovers and the failure mode is "old code
  // runs briefly", not "feature is permanently broken".
  chunkFilename: '[name].js',
  clean: true,
};

// flarum-webpack-config registers babel-loader on every .js/.ts file with no
// `exclude`, which means it tries to re-transpile every dependency in
// node_modules. With `@babel/preset-env` defaulting to ES5 + `loose: true`,
// this turns ES6 classes into plain functions — fine for our own source, but
// fatal for emoji-mart whose `Picker` extends `HTMLElement` (a Web Component
// custom element). A function cannot extend HTMLElement; the browser
// throws "Failed to construct 'HTMLElement': Please use the 'new' operator".
//
// emoji-mart's published `dist/module.js` is already shipped as browser-
// targeted ES — skip babel for it (and any other already-compiled dep).
const babelRule = config.module.rules.find(
  (r) => r.loader === 'babel-loader'
);
if (babelRule) {
  babelRule.exclude = /node_modules\/(emoji-mart|@emoji-mart)\//;
}

module.exports = config;
