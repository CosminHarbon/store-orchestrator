export type { CuratedThemeId } from './themeIds';
export { NOVATEE_MANIFEST, NOVATEE_CONTENT_DEFAULTS, NOVATEE_RUNTIME_BASE } from './novatee';
export {
  FOUNDATION_MANIFEST,
  FOUNDATION_CONTENT_DEFAULTS,
  FOUNDATION_RUNTIME_BASE,
} from './foundation';
export type {
  ContentSlots,
  FoundationContentSlots,
  FoundationExtensionSlots,
  FoundationMarketingSectionId,
  HeroContentSlots,
  HeroMediaMode,
  HeroStatSlot,
  MarketingSectionId,
  MediaSlot,
  NavLabelsSlot,
  NovateeContentSlots,
  NovateeMarketingSectionId,
  SectionSlots,
  SharedContentSlots,
  SocialLinkSlot,
  WhyCardSlot,
} from './contentSlots';
export {
  isSafeMediaUrl,
  mergeContentSlots,
  mergeThemeContent,
  sanitizeMediaSlot,
} from './contentSlots';
export type { StorefrontContentConfig, StorefrontRuntimeContentPayload } from './storefrontContentConfig';
export {
  STOREFRONT_CONTENT_CONFIG_VERSION,
  createDraftConfig,
  defaultsForTheme,
  isCuratedThemeId,
  parseStorefrontContentConfig,
  toRuntimeContentPayload,
  validateStorefrontContentConfig,
} from './storefrontContentConfig';
export {
  ensureCuratedThemeDraft,
  loadCuratedThemeDraft,
  saveCuratedThemeDraft,
} from './draftPersistence';
export {
  buildCuratedPreviewSrcDoc,
  CURATED_PREVIEW_IFRAME_SANDBOX,
} from './previewSrcDoc';
export type { CuratedThemeEditorSchema, EditorFieldSchema, EditorFieldType } from './editorSchema';
export { NOVATEE_EDITOR_SCHEMA } from './novateeEditorSchema';
export { FOUNDATION_EDITOR_SCHEMA } from './foundationEditorSchema';
export { validateCuratedThemeContract } from './validateThemeContract';
export { getContentPath, setContentPath, softCapText } from './contentPath';
export { isInteractiveKeyboardTarget } from './isInteractiveKeyboardTarget';
