/**
 * Pure V1/V2 publish + public selection helpers.
 * No I/O — safe for unit tests and Edge Functions.
 */

export type PublishEngine = 'v1' | 'v2';

export type AiStorefrontPublishRow = {
  schema_version?: number | null;
  draft_spec?: unknown;
  draft_document?: unknown;
  published_spec?: unknown;
  published_document?: unknown;
  design_spec?: unknown;
  brand_design_system?: unknown;
};

export type PublishResolution =
  | { ok: true; engine: 'v1' }
  | { ok: true; engine: 'v2' }
  | { ok: false; error: string; code: 'nothing_to_publish' | 'v2_draft_missing' | 'v2_draft_invalid' };

export type PublicAiContent =
  | {
      engine: 'v1';
      schemaVersion: 1;
      publishedSpec: unknown;
      publishedDocument: null;
      brandDesignSystem: null;
    }
  | {
      engine: 'v2';
      schemaVersion: 2;
      publishedSpec: null;
      publishedDocument: unknown;
      brandDesignSystem: unknown | null;
    }
  | null;

/** Decide which publish branch to run from the stored draft row. */
export function resolvePublishEngine(row: AiStorefrontPublishRow): PublishResolution {
  const schemaVersion = Number(row.schema_version ?? 1);

  if (schemaVersion === 2) {
    if (row.draft_document == null) {
      return {
        ok: false,
        error: 'V2 storefront has no draft_document to publish',
        code: 'v2_draft_missing',
      };
    }
    return { ok: true, engine: 'v2' };
  }

  if (row.draft_spec == null) {
    return {
      ok: false,
      error: 'Nothing to publish yet',
      code: 'nothing_to_publish',
    };
  }

  return { ok: true, engine: 'v1' };
}

/**
 * What the public `/templates/ai` route should render.
 * Prefer published V2 document when present; otherwise fall back to published V1 spec.
 * Never returns draft_* fields or internal design_spec generation data.
 */
export function selectPublicAiContent(row: AiStorefrontPublishRow): PublicAiContent {
  const schemaVersion = Number(row.schema_version ?? 1);

  if (schemaVersion === 2 && row.published_document != null) {
    return {
      engine: 'v2',
      schemaVersion: 2,
      publishedSpec: null,
      publishedDocument: row.published_document,
      brandDesignSystem: row.brand_design_system ?? null,
    };
  }

  if (row.published_spec != null) {
    return {
      engine: 'v1',
      schemaVersion: 1,
      publishedSpec: row.published_spec,
      publishedDocument: null,
      brandDesignSystem: null,
    };
  }

  return null;
}

/** Store name for profiles.active_template publish side-effects. */
export function storeNameForPublish(opts: {
  engine: PublishEngine;
  v1Spec?: { copy?: { storeName?: string } } | null;
  designSpec?: { brand?: { storeName?: string } } | null;
  document?: { pages?: { home?: { nodes?: Array<{ type?: string; content?: Record<string, unknown> }> } } } | null;
  fallback?: string;
}): string {
  if (opts.engine === 'v1') {
    return opts.v1Spec?.copy?.storeName || opts.fallback || 'Store';
  }
  const fromDesign = opts.designSpec?.brand?.storeName;
  if (fromDesign && String(fromDesign).trim()) return String(fromDesign).trim();
  const nav = opts.document?.pages?.home?.nodes?.find((n) => n.type === 'nav');
  const fromNav = nav?.content?.storeName;
  if (typeof fromNav === 'string' && fromNav.trim()) return fromNav.trim();
  return opts.fallback || 'Store';
}

/**
 * Fields V2 publish is allowed to set on template_customization.
 * Everything else on an existing row must be preserved (logo, hero image, builder_config, …).
 */
export const V2_CUSTOMIZATION_MERGE_KEYS = [
  'store_name',
  'primary_color',
  'background_color',
  'text_color',
  'accent_color',
  'secondary_color',
  'heading_font',
  'font_family',
] as const;

export type V2CustomizationPatch = {
  user_id: string;
  template_id: 'ai';
  store_name: string;
  primary_color?: string;
  background_color?: string;
  text_color?: string;
  accent_color?: string;
  secondary_color?: string;
  heading_font?: string;
  font_family?: string;
};

/**
 * Merge a V2 brand/token patch into an existing customization row.
 * Never drops unrelated keys (logo_url, hero_image_url, builder_config, …).
 */
export function mergeAiTemplateCustomization(
  existing: Record<string, unknown> | null | undefined,
  patch: V2CustomizationPatch,
): Record<string, unknown> {
  const base: Record<string, unknown> = existing ? { ...existing } : {};
  // Identity keys always win from the authenticated publish context.
  base.user_id = patch.user_id;
  base.template_id = patch.template_id;

  for (const key of V2_CUSTOMIZATION_MERGE_KEYS) {
    const value = patch[key];
    if (value !== undefined && value !== null && String(value).length > 0) {
      base[key] = value;
    } else if (!(key in base) && key === 'store_name') {
      base.store_name = patch.store_name || 'Store';
    }
  }

  // Defaults only when creating a brand-new row (no existing customization).
  if (!existing) {
    if (base.primary_color == null) base.primary_color = patch.primary_color || '#000000';
    if (base.background_color == null) base.background_color = patch.background_color || '#FFFFFF';
    if (base.text_color == null) base.text_color = patch.text_color || '#000000';
    if (base.accent_color == null) base.accent_color = patch.accent_color || '#666666';
    if (base.secondary_color == null) base.secondary_color = patch.secondary_color || '#F5F5F5';
    if (base.heading_font == null) base.heading_font = patch.heading_font || 'Inter';
    if (base.font_family == null) base.font_family = patch.font_family || 'Inter';
    if (base.show_reviews == null) base.show_reviews = true;
    if (base.footer_text == null) base.footer_text = 'All rights reserved.';
    if (base.hero_button_text == null) base.hero_button_text = 'Shop now';
  }

  return base;
}

/** Contract of public store-api/config AI fields (no drafts, no design_spec). */
export const PUBLIC_AI_CONFIG_FIELDS = [
  'ai_spec',
  'ai_schema_version',
  'ai_published_document',
  'ai_brand_design_system',
] as const;

export function assertNoDraftFieldsInPublicConfig(payload: Record<string, unknown>): string[] {
  const leaks: string[] = [];
  for (const key of Object.keys(payload)) {
    if (/draft/i.test(key)) leaks.push(key);
    if (key === 'ai_design_spec' || key === 'design_spec') leaks.push(key);
  }
  return leaks;
}

/** Expected ownership filters for publish DB writes (documented + tested). */
export function publishOwnershipFilters(userId: string, storefrontId: string) {
  return {
    storefront: { id: storefrontId, user_id: userId },
    profile: { user_id: userId },
    customization: { user_id: userId, template_id: 'ai' as const },
  };
}
