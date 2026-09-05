import type {
  ArchetypeResult,
  CatalogProfile,
  ClarificationRequest,
  ClassifiedAsset,
  GrammarCompatibility,
  IntelligenceInput,
  PlanOutcome,
} from './types';
import { lifestyleAssets } from './grammarScore';

function request(
  id: string,
  question: string,
  reason: string,
  missingEvidence: string[],
  unlocks: string[],
  answerType: ClarificationRequest['answerType']
): ClarificationRequest {
  return { id, question, reason, missingEvidence, unlocks, answerType };
}

export function buildClarificationRequests(opts: {
  input: IntelligenceInput;
  catalog: CatalogProfile;
  archetype: ArchetypeResult;
  assets: ClassifiedAsset[];
  grammar: GrammarCompatibility[];
  outcome: PlanOutcome;
}): ClarificationRequest[] {
  const { input, catalog, archetype, assets, grammar, outcome } = opts;
  const out: ClarificationRequest[] = [];
  const taggedRoles = assets.some((a) => a.evidence.some((e) => e.provider === 'merchant_tag'));
  const lifestyle = lifestyleAssets(assets);
  const accepted = grammar.some((g) => g.accepted);

  if (!catalog.isDominantProduct && catalog.totalProducts > 1 && !input.merchant.featuredProductId) {
    out.push(
      request(
        'featured_product',
        'Which product should be featured?',
        'No product is explicitly featured and none is dominant enough for a single-product grammar.',
        ['featured_product_id', 'dominant_product'],
        ['primary_product', 'product_monument_eligibility', 'hero_assignment'],
        'product_id'
      )
    );
  }

  if (
    archetype.archetype === 'unknown' ||
    archetype.rawScore <= 1 ||
    (archetype.ambiguity && archetype.confidence < 0.55)
  ) {
    out.push(
      request(
        'store_archetype',
        'What type of brand/store is this?',
        archetype.ambiguity || 'Independent evidence groups are insufficient for a high-confidence archetype.',
        archetype.missing,
        ['archetype', 'grammar_shortlist', 'tone'],
        'archetype'
      )
    );
  }

  if (outcome !== 'selected' || grammar.filter((g) => g.accepted).length === 0) {
    out.push(
      request(
        'site_priority',
        'Should the site prioritize storytelling or browsing?',
        'No candidate grammar passed its mandatory gates, so narrative vs catalog intent is unresolved.',
        ['accepted_grammar', 'narrative_intent'],
        ['grammar_selection', 'page_composition'],
        'enum'
      )
    );
  }

  const packshotLed = assets.some((a) => a.role === 'product_packshot') && lifestyle.length === 0;
  if (packshotLed && !taggedRoles) {
    out.push(
      request(
        'image_roles',
        'Are these images packshots, lifestyle images or production details?',
        'Role inference is filename/gallery-based only; semantic role confidence is capped and lifestyle evidence is missing.',
        ['merchant_asset_tags', 'verified_image_roles'],
        ['cinematic_eligibility', 'editorial_imagery', 'usage_chapters'],
        'asset_role'
      )
    );
  } else if (packshotLed && taggedRoles && lifestyle.length === 0) {
    out.push(
      request(
        'campaign_image',
        'Do you have a hero/campaign image?',
        'Available tagged assets are packshots; cinematic and lifestyle chapters cannot be evidenced.',
        ['hero_lifestyle_asset'],
        ['cinematic_eligibility', 'lifestyle_chapter'],
        'boolean'
      )
    );
  }

  if (input.collections.length > 1 && !catalog.editorialStorySupport && !input.merchant.featuredProductId) {
    out.push(
      request(
        'highlight_collection',
        'Which collection should be highlighted?',
        'Multiple collections exist without a featured product or evidenced editorial focus.',
        ['featured_collection'],
        ['editorial_eligibility', 'collection_chapter'],
        'collection_id'
      )
    );
  }

  if (!accepted && catalog.heroSuitability < 0.55 && !lifestyle.length) {
    const already = out.some((r) => r.id === 'campaign_image');
    if (!already) {
      out.push(
        request(
          'hero_campaign_image',
          'Do you have a hero/campaign image?',
          'Hero suitability is low and no confident lifestyle/campaign frame is available.',
          ['full_bleed_hero'],
          ['hero_treatment', 'cinematic_eligibility'],
          'boolean'
        )
      );
    }
  }

  return out.slice(0, 6);
}
