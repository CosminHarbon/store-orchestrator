import type { DesignIntelligencePlan, IntelligenceInput, IntelligenceWarning } from './types';
import { classifyArchetype } from './archetype';
import { classifyAssets, fullBleedEligible } from './assets';
import { profileCatalog } from './catalog';
import { collectSupportedClaims, flagUnsupportedCopy } from './claims';
import { naiveAssignment } from './naive';
import { evaluateNarrative } from './narrative';
import { validateOwnership } from './ownership';
import { scoreGrammars } from './grammarScore';
import { buildClarificationRequests } from './clarification';
import { buildPageNarrative } from './pagePlan';
import { canonicalJson, roundConfidence } from './stable';

export function buildDesignIntelligencePlan(input: IntelligenceInput): DesignIntelligencePlan {
  const assets = classifyAssets(input);
  const archetype = classifyArchetype(input);
  const catalog = profileCatalog(input, assets);
  const naive = naiveAssignment(input);
  const claims = collectSupportedClaims(input);
  const { violations, warnings: ownershipWarnings } = validateOwnership(assets, catalog.primaryProductId, naive);
  const narrative = evaluateNarrative({ input, catalog, assets, claims, archetype });
  const { rows: grammar, selected, outcome, safeFallback, selectionReason, tradeoff } = scoreGrammars({
    input,
    assets,
    catalog,
    archetype,
    narrative,
  });
  const page = buildPageNarrative({ eligibility: narrative, catalog, selectedGrammarId: selected });
  if (outcome !== 'selected') {
    page.fallbackStrategy = selectionReason;
  }

  const clarificationRequests = buildClarificationRequests({
    input,
    catalog,
    archetype,
    assets,
    grammar,
    outcome,
  });

  const warnings: IntelligenceWarning[] = [...ownershipWarnings];

  if (!catalog.primaryProductId) {
    warnings.push({ code: 'missing_primary_product', message: 'No primary product could be selected.' });
  }
  if (assets.filter((a) => a.role === 'hero_lifestyle' || a.role === 'hero_product').filter(fullBleedEligible).length === 0) {
    warnings.push({ code: 'insufficient_hero_assets', message: 'No full-bleed hero-quality asset is available.' });
  }
  const lifestyle = assets.filter((a) => a.role === 'hero_lifestyle' || a.role === 'product_lifestyle');
  if (lifestyle.length === 0 && assets.some((a) => a.role === 'product_packshot')) {
    warnings.push({ code: 'packshot_only_catalog', message: 'Catalog is packshot-led; lifestyle/craft chapters are suppressed.' });
  }
  if (!narrative.find((n) => n.purpose === 'process_making')?.eligible) {
    warnings.push({ code: 'unsupported_process_story', message: 'Process/making story is not evidenced.' });
  }
  if (catalog.visuallyInconsistentProductIds.length) {
    warnings.push({
      code: 'inconsistent_catalog_imagery',
      message: 'Some products have only thumb-resolution assets.',
      productIds: catalog.visuallyInconsistentProductIds,
    });
  }
  if (archetype.confidence < 0.45) {
    warnings.push({ code: 'weak_archetype_evidence', message: 'Store archetype confidence is low.' });
  }
  if (catalog.productDepth === 'sparse' || archetype.missing.includes('product_descriptions')) {
    warnings.push({ code: 'insufficient_metadata', message: 'Catalog metadata is too thin to invent narrative.' });
  }
  const selectedRow = selected ? grammar.find((g) => g.grammarId === selected) : undefined;
  if (selectedRow?.riskFlags.includes('packshot_only_catalog') || (selected === 'cinematic_full_bleed' && lifestyle.length === 0)) {
    warnings.push({
      code: 'grammar_asset_mismatch',
      message: `Selected ${selected} may not match available assets.`,
    });
  }
  if (outcome === 'no_compatible_grammar') {
    warnings.push({ code: 'no_compatible_grammar', message: 'No candidate grammar passed mandatory gates.' });
  }
  if (outcome === 'needs_clarification') {
    warnings.push({ code: 'needs_clarification', message: 'Plan is a hypothesis; structured clarification is required.' });
  }
  if (narrative.some((n) => !n.eligible && n.reason.toLowerCase().includes('repeat'))) {
    warnings.push({ code: 'redundant_chapter_omitted', message: 'Redundant or repeated-copy chapters were omitted.' });
  }
  const storyPurposes = new Set(['form_design', 'material', 'process_making', 'usage', 'lifestyle']);
  const cats = new Set(
    page.chapters.filter((c) => storyPurposes.has(c.purpose)).flatMap((c) => c.productIds)
  );
  const catNames = input.products.filter((p) => cats.has(p.id)).map((p) => p.category).filter(Boolean);
  if (new Set(catNames).size > 1) {
    warnings.push({
      code: 'mixed_category_narrative',
      message: 'Narrative chapters mix unrelated categories.',
      productIds: [...cats],
    });
  }

  const merchantCopy = [input.merchant.description, input.merchant.tagline, ...(input.merchant.explicitClaims || [])].join('\n');
  for (const bad of flagUnsupportedCopy(merchantCopy, claims)) {
    if (!claims.some((c) => c.kind === bad.kind && c.allowed)) {
      warnings.push({ code: 'unsupported_claim', message: `Unsupported claim “${bad.text}” (${bad.kind}).` });
    }
  }

  const reasons = [
    `Outcome ${outcome}.`,
    `Archetype ${archetype.archetype} (${archetype.confidence}, band ${archetype.band}, ${archetype.independentGroupCount} independent groups, ceiling ${archetype.confidenceCeiling}).`,
    catalog.primaryProductId
      ? `Primary ${catalog.primaryProductId}: selection ${catalog.selectionConfidence}, hero ${catalog.heroSuitability}, narrative ${catalog.narrativeSuitability}, completeness ${catalog.evidenceCompleteness}, dominant ${catalog.isDominantProduct}.`
      : 'No primary product.',
    selected ? `Selected grammar ${selected}.` : `No grammar selected; fallback ${safeFallback}.`,
    selectionReason,
  ];

  const confidence = selectedRow
    ? roundConfidence((archetype.confidence + catalog.evidenceCompleteness + selectedRow.score) / 3)
    : roundConfidence(Math.min(archetype.confidence, Math.max(0.12, catalog.evidenceCompleteness), 0.4));

  return {
    version: 1,
    inputId: input.id,
    archetype,
    catalog,
    assets,
    ownershipViolations: violations,
    claims,
    narrative,
    grammar,
    selectedGrammarId: selected,
    outcome,
    safeFallback,
    selectionReason,
    grammarTradeoff: tradeoff,
    clarificationRequests,
    page,
    warnings: dedupeWarnings(warnings),
    naive,
    confidence,
    reasons,
    clarificationValuable: clarificationRequests.length > 0 || outcome !== 'selected',
  };
}

function dedupeWarnings(list: IntelligenceWarning[]): IntelligenceWarning[] {
  const seen = new Set<string>();
  const out: IntelligenceWarning[] = [];
  for (const w of list) {
    const key = `${w.code}:${w.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

export function serializePlan(plan: DesignIntelligencePlan): string {
  return canonicalJson(plan);
}

export function plansEqual(a: DesignIntelligencePlan, b: DesignIntelligencePlan): boolean {
  return serializePlan(a) === serializePlan(b);
}
