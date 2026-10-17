// Public surface for features that embed the library.
export { MediaPicker } from "./media-picker";
export { DurationBadge, Thumbnail } from "./media-tile";
export { repairOnError, repairVideoPoster } from "./poster-repair";
export { uploadFiles, useLibrary, refreshLibrary } from "./store";
export {
  mediaUseHref,
  parseAssetRefKey,
  type AssetRef,
  type MediaItem,
  type MediaKind,
  type MediaRole,
} from "./model";
