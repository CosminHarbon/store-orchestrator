/**
 * Allowlisted SpeedVendors storefront theme registry.
 * Never resolve themes from arbitrary paths or user-supplied module URLs.
 */
import type { ComponentType } from 'react';
import type { ContentSlots, HeroMediaMode } from './contentSlots';
import { novateeContentDefaults } from './themes/novatee/defaults';
import { novateeManifest } from './themes/novatee/manifest';
import NovateeStorefront from './themes/novatee/NovateeStorefront';

export type ThemeId = 'novatee';

export type ThemeManifest = {
  id: ThemeId;
  name: string;
  shortDescription: string;
  categoryTags: string[];
  /** Public path under the storefront artifact (e.g. /themes/novatee/preview.svg). */
  previewImage: string;
  availableContentSlots: string[];
  supportedHeroMediaModes: HeroMediaMode[];
};

export type StorefrontTheme = {
  id: ThemeId;
  manifest: ThemeManifest;
  defaultContent: ContentSlots;
  Root: ComponentType<{ content?: ContentSlots }>;
};

const NOVATEE: StorefrontTheme = {
  id: 'novatee',
  manifest: {
    id: novateeManifest.id,
    name: novateeManifest.name,
    shortDescription: novateeManifest.shortDescription,
    categoryTags: [...novateeManifest.categoryTags],
    previewImage: novateeManifest.previewImage,
    availableContentSlots: [...novateeManifest.availableContentSlots],
    supportedHeroMediaModes: [...novateeManifest.supportedHeroMediaModes],
  },
  defaultContent: novateeContentDefaults,
  Root: NovateeStorefront,
};

/** Explicit allowlist — add future themes here only. */
const THEME_REGISTRY: Record<ThemeId, StorefrontTheme> = {
  novatee: NOVATEE,
};

export const DEFAULT_THEME_ID: ThemeId = 'novatee';

export function isThemeId(raw: unknown): raw is ThemeId {
  return typeof raw === 'string' && Object.prototype.hasOwnProperty.call(THEME_REGISTRY, raw);
}

/** Resolve a known theme ID; unknown/missing → Novatee. */
export function resolveTheme(id?: string | null): StorefrontTheme {
  if (id && isThemeId(id)) return THEME_REGISTRY[id];
  return THEME_REGISTRY[DEFAULT_THEME_ID];
}

/** Safe catalogue list (metadata only). */
export function listThemeManifests(): ThemeManifest[] {
  return Object.values(THEME_REGISTRY).map((t) => t.manifest);
}

/**
 * Read theme id from sanitized window config only — never from URL query in production.
 * Optional `window.__SV_THEME__` or `__SV_CONTENT__.themeId` when allowlisted.
 */
export function readConfiguredThemeId(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  const win = window as Window & {
    __SV_THEME__?: unknown;
    __SV_CONTENT__?: unknown;
  };
  if (isThemeId(win.__SV_THEME__)) return win.__SV_THEME__;
  const content = win.__SV_CONTENT__;
  if (content && typeof content === 'object') {
    const tid = (content as Record<string, unknown>).themeId;
    if (isThemeId(tid)) return tid;
  }
  return DEFAULT_THEME_ID;
}
