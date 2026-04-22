// emoji-mart category IDs. See @emoji-mart/data sets/*/native.json -> categories[].id.
// Note: emoji-mart merges what emoji-button called "smileys" + "people" into a single
// "people" category. Other IDs differ from the legacy emoji-button names; the
// settings migration rewrites stored values from the old IDs to these.
export default function getEmojiCategories() {
  return ['people', 'nature', 'foods', 'activity', 'places', 'objects', 'symbols', 'flags'];
}
