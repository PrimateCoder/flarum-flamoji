import Extend from 'flarum/common/extenders';

export default [
  // Settings are registered via app.registry.for().registerSetting() in index.js
  // because the settings UI is complex (custom category checkboxes, conditional
  // fields) and doesn't fit the simple Extend.Admin().setting() pattern.
];
