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
  // Cache-bust dynamically loaded chunks. Flarum's asset pipeline only
  // hashes the entry-point bundles (forum.js / admin.js); split chunks
  // (emoji-mart, emoji-mart-data) are served as plain static files from
  // /assets/extensions/pianotell-flamoji/dist/ with no version in their
  // URL, so browsers happily return the stale cached copy after a code
  // update. Baking a content hash into the chunk filename forces a fresh
  // URL whenever the chunk's contents change. `filename` is intentionally
  // left untouched so forum.js / admin.js keep the names Flarum expects.
  // `clean: true` removes orphan hashed chunks from previous builds so
  // the output dir doesn't accumulate.
  chunkFilename: '[name].[contenthash:8].js',
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
