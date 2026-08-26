/**
 * Centralized AI Studio V2 feature flag.
 * When disabled, production behavior stays on V1 (StorefrontSpec + AiSections).
 *
 * Enable locally:
 *   VITE_AI_STUDIO_V2=true
 * Or per-session:
 *   localStorage.setItem('ai_studio_v2', '1')
 */
export function isAiStudioV2Enabled(): boolean {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_AI_STUDIO_V2 === 'true') {
      return true;
    }
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    try {
      const v = window.localStorage.getItem('ai_studio_v2');
      if (v === '1' || v === 'true') return true;
      if (v === '0' || v === 'false') return false;
    } catch {
      /* ignore */
    }
  }
  return false;
}

export function setAiStudioV2Enabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('ai_studio_v2', enabled ? '1' : '0');
}
