// Side-effect: registers the initializer.
import './src/forum';

// Forward-compat with Flarum 2.x's Export Registry: re-export both the
// named exports and the default namespace from the entry module so that
// `ext:pianotell/flamoji/forum` resolves to our public surface.
export * from './src/forum';
export { default } from './src/forum';
