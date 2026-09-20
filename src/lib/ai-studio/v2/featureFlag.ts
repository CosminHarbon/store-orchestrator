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

/**
 * Merchant-entry Beta flag — separate from isAiStudioV2Enabled().
 *
 * isAiStudioV2Enabled() participates in PUBLIC storefront rendering fallback
 * (which renderer a live /templates/ai page uses) and must never be touched by
 * a rollout decision about the merchant-facing builder entry point: turning
 * this flag off must not make an already-published V2 storefront disappear.
 *
 * This flag controls ONLY which component WebsiteBuilder's "studio" view
 * renders (AIStudioV2 vs the existing V1 AIStudio). It is a rollout switch,
 * not a security boundary — ownership/auth is enforced server-side regardless.
 *
 * Enable in an environment (e.g. Vercel preview/production env vars):
 *   VITE_AI_STUDIO_V2_MERCHANT_BETA=true
 *
 * Defaults OFF when unset, so a fresh/misconfigured environment keeps the
 * existing V1 merchant experience unchanged.
 */
export function isAiStudioV2MerchantBetaEnabled(): boolean {
  try {
    if (
      typeof import.meta !== 'undefined' &&
      import.meta.env?.VITE_AI_STUDIO_V2_MERCHANT_BETA === 'true'
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
