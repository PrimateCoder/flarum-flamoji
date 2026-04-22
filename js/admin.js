// Side-effect: registers the initializer.
import './src/admin';

// Forward-compat with Flarum 2.x's Export Registry: re-export both the
// named exports and the default namespace from the entry module so that
// `ext:pianotell/flamoji/admin` resolves to our public surface.
export * from './src/admin';
export { default } from './src/admin';
