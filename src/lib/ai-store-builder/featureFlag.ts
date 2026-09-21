/**
 * Cursor AI Store Builder feature flag (Track B).
 *
 * Frontend visibility only — NEVER use as authorization.
 * Backend entitlement + cursor-storefront-gateway enforce access.
 *
 * Defaults OFF. Phase 3 gates Website Builder “Build with AI” + /dev/cursor-preview.
 *
 * Enable locally:
 *   VITE_AI_STORE_BUILDER_CURSOR=true
 */
export function isAiStoreBuilderCursorEnabled(): boolean {
  try {
    if (
      typeof import.meta !== 'undefined' &&
      import.meta.env?.VITE_AI_STORE_BUILDER_CURSOR === 'true'
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
