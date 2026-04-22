// Side-effect: registers the initializer.
import './src/admin';

// Re-export named exports from the entry module so other extensions
// can import them via Flarum's own re-export pipeline.
export * from './src/admin';
