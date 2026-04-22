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
  chunkLoadingGlobal: 'webpackChunkPianotellFlamoji',
  uniqueName: 'pianotell-flamoji',
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
