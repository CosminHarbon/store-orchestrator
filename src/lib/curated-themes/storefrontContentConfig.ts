/**
 * Canonical validated storefront configuration shape.
 * Manual editor ↔ draft persistence ↔ runtime __SV_CONTENT__ ↔ future AI designer.
 * Do not invent a second format for AI.
 */
import {
  mergeThemeContent,
  type ContentSlots,
  type CuratedThemeSanitizeId,
} from './contentSlots';
import { NOVATEE_CONTENT_DEFAULTS } from './novatee';
import { FOUNDATION_CONTENT_DEFAULTS } from './foundation';
import type { CuratedThemeId } from './themeIds';

export const STOREFRONT_CONTENT_CONFIG_VERSION = 1 as const;

export type StorefrontContentConfig = {
  version: typeof STOREFRONT_CONTENT_CONFIG_VERSION;
  themeId: CuratedThemeId;
  /** draft | published — published reserved for a future safe publish workflow */
  status: 'draft' | 'published';
  content: ContentSlots;
  updatedAt?: string;
};

export type StorefrontRuntimeContentPayload = ContentSlots & {
  themeId: CuratedThemeId;
  /** Never set true for merchant-facing previews. */
  allowPreviewQueryHints?: boolean;
};

const THEME_IDS = new Set<CuratedThemeId>(['novatee', 'foundation']);

export function isCuratedThemeId(raw: unknown): raw is CuratedThemeId {
  return typeof raw === 'string' && THEME_IDS.has(raw as CuratedThemeId);
}

export function defaultsForTheme(themeId: CuratedThemeId): ContentSlots {
  if (themeId === 'foundation') return structuredClone(FOUNDATION_CONTENT_DEFAULTS);
  return structuredClone(NOVATEE_CONTENT_DEFAULTS);
}

/** Build a fresh draft config for a curated theme. */
export function createDraftConfig(themeId: CuratedThemeId): StorefrontContentConfig {
  return {
    version: STOREFRONT_CONTENT_CONFIG_VERSION,
    themeId,
    status: 'draft',
    content: defaultsForTheme(themeId),
    updatedAt: new Date().toISOString(),
  };
}

function asSanitizeId(themeId: CuratedThemeId): CuratedThemeSanitizeId {
  return themeId === 'foundation' ? 'foundation' : 'novatee';
}

/**
 * Parse unknown JSON (e.g. template_customization.builder_config) into a validated config.
 * Falls back to a fresh draft when invalid.
 */
export function parseStorefrontContentConfig(
  raw: unknown,
  fallbackThemeId: CuratedThemeId = 'novatee',
): StorefrontContentConfig {
  if (!raw || typeof raw !== 'object') {
    return createDraftConfig(fallbackThemeId);
  }
  const o = raw as Record<string, unknown>;
  const themeId = isCuratedThemeId(o.themeId) ? o.themeId : fallbackThemeId;
  const defaults = defaultsForTheme(themeId);
  const contentRaw =
    o.content && typeof o.content === 'object' ? o.content : o;
  const content = mergeThemeContent(asSanitizeId(themeId), defaults, contentRaw);
  const status = o.status === 'published' ? 'published' : 'draft';
  const version =
    o.version === STOREFRONT_CONTENT_CONFIG_VERSION
      ? STOREFRONT_CONTENT_CONFIG_VERSION
      : STOREFRONT_CONTENT_CONFIG_VERSION;
  return {
    version,
    themeId,
    status,
    content,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : undefined,
  };
}

/** Sanitize an in-progress editor config before save / preview inject. */
export function validateStorefrontContentConfig(
  config: StorefrontContentConfig,
): StorefrontContentConfig {
  const themeId = isCuratedThemeId(config.themeId) ? config.themeId : 'novatee';
  return {
    version: STOREFRONT_CONTENT_CONFIG_VERSION,
    themeId,
    status: config.status === 'published' ? 'published' : 'draft',
    content: mergeThemeContent(asSanitizeId(themeId), defaultsForTheme(themeId), config.content),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Flatten config into the runtime __SV_CONTENT__ payload (safe JSON only).
 * themeId is included so the runtime allowlist can resolve the theme.
 */
export function toRuntimeContentPayload(
  config: StorefrontContentConfig,
): StorefrontRuntimeContentPayload {
  const validated = validateStorefrontContentConfig(config);
  return {
    themeId: validated.themeId,
    ...validated.content,
    allowPreviewQueryHints: false,
  };
}
