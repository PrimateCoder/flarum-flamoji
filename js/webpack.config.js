const path = require('path');
const config = require('flarum-webpack-config')();

// Output chunks into assets/dist/ which Extension::copyAssetsTo()
// publishes to /public/assets/extensions/pianotell-flamoji/dist/.
// We can't use jsDirectory() because RegisterAsyncChunksPlugin only
// registers src/ modules, not node_modules chunks — so Flarum's
// flarum.reg.loadChunk won't find them. Instead we set
// __webpack_public_path__ at runtime to point to the published path
// and cache-bust via the Flarum forum.js revision hash.
config.output = {
  ...(config.output || {}),
  path: path.resolve(__dirname, '../assets/dist'),
  chunkLoadingGlobal: 'webpackChunkPianotellFlamoji',
  uniqueName: 'pianotell-flamoji',
  chunkFilename: '[name].js',
  clean: true,
};

// emoji-mart's published dist/module.js is already browser-targeted ES —
// skip babel for it. Without this, babel transforms ES6 classes into plain
// functions, breaking HTMLElement subclasses (Web Components).
const babelRule = config.module.rules.find(
  (r) => r.loader === 'babel-loader'
);
if (babelRule) {
  babelRule.exclude = /node_modules\/(emoji-mart|@emoji-mart)\//;
}

module.exports = config;
