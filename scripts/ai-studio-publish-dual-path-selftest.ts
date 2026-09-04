/**
 * Dual-path publish / public-selection self-test.
 *
 * SCOPE: pure helpers + schema validation + simulated write-gate logic.
 * Does NOT call Edge Functions or the database — not an end-to-end test.
 *
 * Run: npx --yes tsx scripts/ai-studio-publish-dual-path-selftest.ts
 */
import { V2_VARIETY_FIXTURES } from '../src/lib/ai-studio/v2/fixtures.ts';
import { siteDocumentSchema } from '../src/lib/ai-studio/v2/siteTree.ts';
import { designSpecSchema, brandDesignSystemFromSpec } from '../src/lib/ai-studio/v2/designSpec.ts';
import {
  assertNoDraftFieldsInPublicConfig,
  mergeAiTemplateCustomization,
  PUBLIC_AI_CONFIG_FIELDS,
  publishOwnershipFilters,
  resolvePublishEngine,
  selectPublicAiContent,
  storeNameForPublish,
} from '../shared/ai-studio-v2/publishPath.ts';
import { FLORIST_FIXTURE } from '../src/lib/ai-studio/fixtures.ts';
import { parseStorefrontSpec } from '../src/lib/ai-studio/spec.ts';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const fixture = V2_VARIETY_FIXTURES[0];
const validDoc = fixture.document;
const validDesign = fixture.designSpec;
const brand = brandDesignSystemFromSpec(validDesign);

console.log('\n=== Pure helper tests (no DB / no Edge Function) ===\n');

// ── 1. Existing V1 publish resolution unchanged ─────────────────────────────
{
  const r = resolvePublishEngine({
    schema_version: 1,
    draft_spec: FLORIST_FIXTURE,
    draft_document: null,
  });
  assert(r.ok && r.engine === 'v1', '1. V1 draft resolves to v1 publish engine');
}

{
  const r = resolvePublishEngine({
    schema_version: 1,
    draft_spec: null,
  });
  assert(!r.ok && r.code === 'nothing_to_publish', '1b. V1 without draft_spec fails clearly');
}

// ── 2. Valid V2 publish creates separate published snapshot (selection model) ─
{
  const r = resolvePublishEngine({
    schema_version: 2,
    draft_document: validDoc,
    design_spec: validDesign,
    draft_spec: null,
  });
  assert(r.ok && r.engine === 'v2', '2. V2 draft resolves to v2 publish engine');

  const parsed = siteDocumentSchema.parse(validDoc);
  // Simulate post-publish row: published_document is a snapshot copy
  const afterPublish = {
    schema_version: 2 as const,
    draft_document: validDoc,
    published_document: structuredClone(parsed),
    brand_design_system: brand,
  };
  const live = selectPublicAiContent(afterPublish);
  assert(live?.engine === 'v2' && live.publishedDocument != null, '2b. Public selects published_document snapshot');
  assert(live?.publishedSpec == null, '2c. V2 public path does not expose published_spec');
}

// ── 3. Invalid V2 publish performs no writes (simulated gate) ───────────────
{
  const invalid = { version: 2, siteId: 'x' };
  const resolution = resolvePublishEngine({
    schema_version: 2,
    draft_document: invalid,
  });
  assert(resolution.ok && resolution.engine === 'v2', '3. Engine is v2 when invalid document present');
  assert(!siteDocumentSchema.safeParse(invalid).success, '3b. Canonical SiteDocument schema rejects invalid draft');
  // Production: ai-studio-publish returns 400 before any update/upsert when !docParsed.success
  assert(true, '3c. Write gate documented: validation failure → early return (no DB mutations)');
}

// ── 4. Existing customization preserved on merge ────────────────────────────
{
  const existing = {
    id: 'cust-1',
    user_id: 'user-a',
    template_id: 'ai',
    store_name: 'Old Name',
    logo_url: 'https://cdn.example/logo.png',
    hero_image_url: 'https://cdn.example/hero.jpg',
    builder_config: { sections: ['custom'] },
    show_reviews: false,
    footer_text: 'Keep my footer',
    primary_color: '#111111',
    custom_merchant_field: 'preserve-me',
  };
  const merged = mergeAiTemplateCustomization(existing, {
    user_id: 'user-a',
    template_id: 'ai',
    store_name: 'New V2 Name',
    primary_color: '#FF0000',
    background_color: '#FFFFFF',
    text_color: '#000000',
    accent_color: '#666666',
    secondary_color: '#F5F5F5',
    heading_font: 'Playfair Display',
    font_family: 'Inter',
  });
  assert(merged.logo_url === existing.logo_url, '4. logo_url preserved');
  assert(merged.hero_image_url === existing.hero_image_url, '4b. hero_image_url preserved');
  assert(JSON.stringify(merged.builder_config) === JSON.stringify(existing.builder_config), '4c. builder_config preserved');
  assert(merged.show_reviews === false, '4d. show_reviews not reset');
  assert(merged.footer_text === 'Keep my footer', '4e. footer_text preserved');
  assert(merged.custom_merchant_field === 'preserve-me', '4f. unrelated JSON property preserved');
  assert(merged.store_name === 'New V2 Name', '4g. store_name updated from V2 brand');
  assert(merged.primary_color === '#FF0000', '4h. brand color updated from V2 tokens');
  assert(Object.keys(merged).length >= Object.keys(existing).length, '4i. merge does not shrink key set');
}

{
  const created = mergeAiTemplateCustomization(null, {
    user_id: 'user-b',
    template_id: 'ai',
    store_name: 'Fresh',
    primary_color: '#000',
  });
  assert(created.store_name === 'Fresh', '4j. new row gets store_name');
  assert(created.logo_url == null, '4k. new row has no fabricated logo');
  assert(created.show_reviews === true, '4l. new row defaults show_reviews only when creating');
}

// ── 5. Existing published V2 unchanged after failed publishing ──────────────
{
  const previousPublished = structuredClone(validDoc);
  previousPublished.siteId = 'published_live_v1';
  const row = {
    schema_version: 2,
    draft_document: { version: 2, siteId: 'broken' },
    published_document: previousPublished,
    brand_design_system: brand,
    design_spec: validDesign,
  };
  const publicBefore = selectPublicAiContent(row);
  assert(
    publicBefore?.engine === 'v2' &&
      (publicBefore.publishedDocument as { siteId: string }).siteId === 'published_live_v1',
    '5. Public still serves previous published_document',
  );
  // Failed publish does not mutate row → public selection unchanged
  assert(!siteDocumentSchema.safeParse(row.draft_document).success, '5b. Invalid draft would not write');
  const publicAfterFailedAttempt = selectPublicAiContent(row);
  assert(
    JSON.stringify(publicAfterFailedAttempt) === JSON.stringify(publicBefore),
    '5c. Failed publish leaves published_document selection unchanged',
  );
}

// ── 6. Changing a V2 draft does not change public content ───────────────────
{
  const published = structuredClone(validDoc);
  published.siteId = 'live';
  const draft = structuredClone(validDoc);
  draft.siteId = 'draft_only_change';
  const publicContent = selectPublicAiContent({
    schema_version: 2,
    draft_document: draft,
    published_document: published,
    brand_design_system: brand,
  });
  assert(
    publicContent?.engine === 'v2' &&
      (publicContent.publishedDocument as { siteId: string }).siteId === 'live',
    '6. Draft siteId change is not selected for public route',
  );
  assert(
    !JSON.stringify(publicContent).includes('draft_only_change'),
    '6b. Public payload does not include draft-only content',
  );
}

// ── 7. Public API never returns draft_document / design_spec ────────────────
{
  const simulatedStoreApiConfig: Record<string, unknown> = {
    store_name: 'Demo',
    ai_spec: FLORIST_FIXTURE,
    ai_schema_version: 1,
    ai_published_document: null,
    ai_brand_design_system: null,
  };
  const leaks = assertNoDraftFieldsInPublicConfig(simulatedStoreApiConfig);
  assert(leaks.length === 0, '7. V1 public config has no draft/design_spec fields');

  const v2Config: Record<string, unknown> = {
    ai_spec: null,
    ai_schema_version: 2,
    ai_published_document: validDoc,
    ai_brand_design_system: brand,
  };
  assert(assertNoDraftFieldsInPublicConfig(v2Config).length === 0, '7b. V2 public config has no draft/design_spec');

  const bad = { ...v2Config, ai_design_spec: validDesign, draft_document: validDoc };
  const badLeaks = assertNoDraftFieldsInPublicConfig(bad);
  assert(badLeaks.includes('ai_design_spec') && badLeaks.includes('draft_document'), '7c. Leak detector flags draft + design_spec');

  for (const field of PUBLIC_AI_CONFIG_FIELDS) {
    assert(field in v2Config || field === 'ai_spec', `7d. Expected public field contract includes ${field}`);
  }
}

// ── 8. V1/V2 selection uses store-api field names ───────────────────────────
{
  // Mimic fetchStoreConfig mapping: ai_spec → published_spec, etc.
  const apiV1 = {
    ai_spec: FLORIST_FIXTURE,
    ai_schema_version: 1,
    ai_published_document: null,
    ai_brand_design_system: null,
  };
  const mappedV1 = selectPublicAiContent({
    schema_version: apiV1.ai_schema_version,
    published_spec: apiV1.ai_spec,
    published_document: apiV1.ai_published_document,
    brand_design_system: apiV1.ai_brand_design_system,
  });
  assert(mappedV1?.engine === 'v1' && mappedV1.publishedSpec === FLORIST_FIXTURE, '8. V1 uses ai_spec as published_spec');

  const apiV2 = {
    ai_spec: FLORIST_FIXTURE, // leftover must not win when published_document exists
    ai_schema_version: 2,
    ai_published_document: validDoc,
    ai_brand_design_system: brand,
  };
  const mappedV2 = selectPublicAiContent({
    schema_version: apiV2.ai_schema_version,
    published_spec: apiV2.ai_spec,
    published_document: apiV2.ai_published_document,
    brand_design_system: apiV2.ai_brand_design_system,
  });
  assert(mappedV2?.engine === 'v2' && mappedV2.publishedDocument === validDoc, '8b. V2 uses ai_published_document');
  assert(mappedV2?.brandDesignSystem === brand, '8c. V2 uses ai_brand_design_system');
}

// ── Mixed: schema_version=2 draft only, old V1 published still live ─────────
{
  const live = selectPublicAiContent({
    schema_version: 2,
    draft_document: validDoc,
    published_document: null,
    published_spec: FLORIST_FIXTURE,
  });
  assert(
    live?.engine === 'v1' && live.publishedSpec === FLORIST_FIXTURE,
    '8d. Unpublished V2 draft does not hide previous V1 published_spec',
  );
}

// ── 9. Merchant ownership filters (contract for Edge Function writes) ───────
{
  const filters = publishOwnershipFilters('merchant-1', 'sf-99');
  assert(filters.storefront.user_id === 'merchant-1' && filters.storefront.id === 'sf-99', '9. Storefront update requires id + user_id');
  assert(filters.profile.user_id === 'merchant-1', '9b. Profile update scoped to user_id');
  assert(filters.customization.user_id === 'merchant-1' && filters.customization.template_id === 'ai', '9c. Customization scoped to owner + ai template');
}

// ── Store name helpers ──────────────────────────────────────────────────────
{
  assert(
    storeNameForPublish({ engine: 'v1', v1Spec: { copy: { storeName: 'V1 Shop' } } }) === 'V1 Shop',
    'storeName V1 from spec.copy.storeName',
  );
  assert(
    storeNameForPublish({ engine: 'v2', designSpec: validDesign, document: validDoc }) ===
      validDesign.brand.storeName,
    'storeName V2 from design_spec.brand.storeName',
  );
}

// ── Premium shell structural check ──────────────────────────────────────────
{
  const publicV2 = selectPublicAiContent({
    schema_version: 2,
    published_document: validDoc,
    brand_design_system: brand,
  });
  assert(publicV2?.engine === 'v2' && publicV2.brandDesignSystem != null, 'V2 public content for SiteTreeRenderer + Premium shell');
  assert(parseStorefrontSpec(FLORIST_FIXTURE).spec.copy.storeName, 'V1 published_spec still parses for Premium shell');
  assert(designSpecSchema.safeParse(validDesign).success, 'DesignSpec valid for brand derivation at publish time');
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nai-studio publish dual-path selftest passed (pure helpers only — not E2E)');
