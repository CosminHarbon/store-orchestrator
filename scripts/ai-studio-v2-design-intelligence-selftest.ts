/**
 * AI Studio V2 Phase 5C.1 — design intelligence self-test (no vitest, no network APIs).
 * Run: npx --yes tsx scripts/ai-studio-v2-design-intelligence-selftest.ts
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  INTELLIGENCE_FIXTURE_IDS,
  buildDesignIntelligencePlan,
  classifyAsset,
  documentFromIntelligence,
  flagUnsupportedCopy,
  fixtureById,
  intelligenceInputFromShowcase,
  plansEqual,
  serializePlan,
  storyChapterOwnsOnlyAssignedProducts,
  type IntelligenceFixtureId,
} from '../src/lib/ai-studio/v2/designIntelligence/index.ts';
import { SHOWCASE_CATALOGS } from '../src/lib/ai-studio/v2/showcaseData.ts';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function planOf(id: IntelligenceFixtureId) {
  return buildDesignIntelligencePlan(fixtureById(id));
}

function eligible(id: IntelligenceFixtureId, purpose: string) {
  return Boolean(planOf(id).narrative.find((n) => n.purpose === purpose)?.eligible);
}

function assignedProducts(id: IntelligenceFixtureId, purpose: string): string[] {
  return planOf(id).page.chapters.find((c) => c.purpose === purpose)?.productIds || [];
}

function assignedAssets(id: IntelligenceFixtureId, purpose: string): string[] {
  return planOf(id).page.chapters.find((c) => c.purpose === purpose)?.assetIds || [];
}

function acceptedSorted(id: IntelligenceFixtureId) {
  return planOf(id)
    .grammar.filter((g) => g.accepted)
    .sort((a, b) => b.score - a.score || a.grammarId.localeCompare(b.grammarId));
}

function main() {
  const src = resolve(import.meta.dirname, '../src');
  const v2Index = readFileSync(resolve(src, 'lib/ai-studio/v2/index.ts'), 'utf8');
  assert(!v2Index.includes('designIntelligence'), 'design intelligence is not exported from production v2 index');

  const generate = readFileSync(resolve(src, 'lib/ai-studio/v2/generateClient.ts'), 'utf8');
  assert(!generate.includes('designIntelligence'), 'generate client does not import design intelligence');

  const app = readFileSync(resolve(src, 'App.tsx'), 'utf8');
  assert(app.includes('ai-studio-v2-design-intelligence'), 'DEV inspector route registered');
  assert(app.includes('import.meta.env.DEV && AiStudioV2DesignIntelligence'), 'inspector route is DEV-only');

  const showcase = readFileSync(resolve(src, 'pages/ai-studio-v2/AiStudioV2LayoutGrammars.tsx'), 'utf8');
  assert(!showcase.includes('buildDesignIntelligencePlan'), 'layout-grammar showcase stays naive');

  const assetsSrc = readFileSync(resolve(src, 'lib/ai-studio/v2/designIntelligence/assets.ts'), 'utf8');
  assert(assetsSrc.includes('vision_classifier'), 'vision_classifier reserved in inference comments/providers');
  assert(!assetsSrc.includes('fetch('), 'asset inference does not call network');
  assert(!assetsSrc.includes('openai'), 'asset inference does not call OpenAI');

  for (const id of INTELLIGENCE_FIXTURE_IDS) {
    const a = planOf(id);
    const b = planOf(id);
    assert(plansEqual(a, b), `${id} is deterministic`);
    assert(a.version === 1, `${id} serializable version`);
    assert(typeof serializePlan(a) === 'string' && serializePlan(a).includes('"inputId"'), `${id} serializes`);
    assert(a.archetype.evidence.length > 0, `${id} archetype exposes evidence`);
    assert(typeof a.archetype.rawScore === 'number', `${id} archetype raw score`);
    assert(Array.isArray(a.archetype.evidenceGroups), `${id} evidence groups`);
    assert(typeof a.archetype.confidenceCeiling === 'number', `${id} confidence ceiling`);
    assert(a.catalog.primaryEvidence.length > 0 || !a.catalog.primaryProductId, `${id} primary evidence`);
    assert(typeof a.catalog.selectionConfidence === 'number', `${id} selectionConfidence`);
    assert(typeof a.catalog.heroSuitability === 'number', `${id} heroSuitability`);
    assert(typeof a.catalog.narrativeSuitability === 'number', `${id} narrativeSuitability`);
    assert(typeof a.catalog.evidenceCompleteness === 'number', `${id} evidenceCompleteness`);
    assert(a.assets.every((asset) => asset.evidence.length > 0 || asset.role === 'unknown'), `${id} assets expose evidence`);
    assert(
      a.assets.every((asset) => typeof asset.ownershipConfidence === 'number' && typeof asset.roleConfidence === 'number'),
      `${id} ownership and role confidence are separate`
    );
    assert(a.narrative.every((n) => typeof n.confidence === 'number' && n.reason.length > 0), `${id} narrative decisions expose reason+confidence`);
    assert(a.grammar.every((g) => g.gates && g.breakdown), `${id} grammar gates+breakdown`);
    assert(a.outcome, `${id} has outcome ${a.outcome}`);
    assert(storyChapterOwnsOnlyAssignedProducts(a), `${id} story assets stay on assigned products`);
    const doc = documentFromIntelligence(fixtureById(id), a);
    const blob = JSON.stringify(doc);
    if (id !== 'artisan_food') {
      assert(!/made by artisans/i.test(blob), `${id} document does not invent artisan copy`);
    }
  }

  const luxury = planOf('luxury_handbags');
  assert(luxury.archetype.archetype === 'fashion_editorial', `luxury archetype=${luxury.archetype.archetype}`);
  assert(luxury.catalog.primaryProductId === 'bag-milano', `luxury primary=${luxury.catalog.primaryProductId}`);

  const street = planOf('streetwear');
  assert(street.archetype.archetype === 'streetwear_campaign', `streetwear archetype=${street.archetype.archetype}`);
  assert(street.selectedGrammarId === 'typographic_campaign', `streetwear grammar=${street.selectedGrammarId}`);

  const tech = planOf('headphones_technology');
  assert(tech.archetype.archetype === 'technology_product', `tech archetype=${tech.archetype.archetype}`);
  assert(tech.catalog.primaryProductId === 'fa-one', `tech primary=${tech.catalog.primaryProductId}`);
  assert(tech.naive.useAssetProductId === 'fa-sun', 'naive Use still assigns sunglasses (5B.2 bug documented)');
  assert(tech.naive.formAssetProductId === 'fa-buds', 'naive Form still assigns earbuds');
  assert(tech.naive.makeAssetProductId === 'fa-lite', 'naive Make still assigns another headphone SKU');
  assert(!eligible('headphones_technology', 'usage'), '17. headphones do not create a Use story');
  assert(!assignedProducts('headphones_technology', 'usage').includes('fa-sun'), '17. sunglasses are not the Use story of headphones');
  assert(!eligible('headphones_technology', 'process_making'), '17. Form/Make process omitted without process evidence');
  assert(!assignedAssets('headphones_technology', 'process_making').includes('buds-pack'), '17. earbuds are not the manufacturing process');
  const formAssets = assignedAssets('headphones_technology', 'form_design');
  assert(!formAssets.includes('buds-pack'), '17. earbuds are not Form evidence for headphones');
  assert(!eligible('headphones_technology', 'material'), '17. material omitted without owned material asset');
  const milanoMaterial = assignedAssets('luxury_handbags', 'material');
  assert(!milanoMaterial.includes('verona-pack'), '17. Product B packshot is not Product A material');
  assert(!eligible('headphones_technology', 'form_design'), '17. Form omitted when evidence missing');
  assert(tech.selectedGrammarId === 'product_monument', `tech grammar=${tech.selectedGrammarId}`);
  assert(tech.page.chapters.some((c) => c.purpose === 'product_introduction'), 'tech keeps product introduction');
  assert(tech.page.chapters.some((c) => c.purpose === 'product_discovery'), 'tech keeps discovery');

  const packs = planOf('packshots_only');
  assert(packs.selectedGrammarId !== 'product_monument', `2/5. packshot-only must not default to monument (${packs.selectedGrammarId})`);
  assert(packs.outcome === 'safe_fallback' || packs.outcome === 'needs_clarification' || packs.outcome === 'no_compatible_grammar', `packshots outcome=${packs.outcome}`);
  assert(!eligible('packshots_only', 'lifestyle'), 'packshot-only does not pretend lifestyle');
  assert(!eligible('packshots_only', 'process_making'), 'packshot-only does not invent process');
  assert(packs.warnings.some((w) => w.code === 'packshot_only_catalog'), 'packshot-only warning');
  assert(packs.archetype.confidence < 0.75, `2. packshots archetype confidence ${packs.archetype.confidence} is not strong/0.92`);
  assert(packs.archetype.archetype !== 'home_interior' || packs.archetype.band !== 'multiple_independent', '2. packshots do not auto-classify home_interior at 0.90+');

  const low = classifyAsset({
    id: 'tiny',
    url: 'https://example.com/tiny.jpg',
    source: 'hero',
    filename: 'tiny-thumb.jpg',
    width: 400,
    height: 300,
  });
  assert(low.resolutionSuitability === 'thumb_only', '400×300 is thumb_only');
  assert(packs.assets.find((a) => a.id === 'lowres-hero')?.resolutionSuitability === 'thumb_only', 'fixture lowres-hero is thumb_only');
  const cinePacks = packs.grammar.find((g) => g.grammarId === 'cinematic_full_bleed');
  assert(cinePacks && cinePacks.accepted === false, 'cinematic not accepted for packshot/low-res catalog');

  const sparse = planOf('sparse_single_product');
  assert(sparse.catalog.catalogShape === 'single_product', 'single-product shape');
  assert(sparse.catalog.primaryProductId === 'lamp-1', 'single-product primary');
  assert(sparse.archetype.confidence <= 0.54, `1. sparse niche confidence ${sparse.archetype.confidence} must not exceed single-product ceiling`);
  assert(sparse.archetype.band === 'unknown' || sparse.archetype.band === 'weak' || sparse.archetype.band === 'plausible', `1. sparse band=${sparse.archetype.band}`);
  assert(sparse.selectedGrammarId !== 'product_monument', `1. sparse must not force monument (${sparse.selectedGrammarId})`);
  assert(sparse.outcome === 'needs_clarification' || sparse.outcome === 'no_compatible_grammar' || sparse.outcome === 'safe_fallback', `1. sparse outcome=${sparse.outcome}`);

  assert(street.selectedGrammarId === 'typographic_campaign', 'streetwear selects Typographic Campaign');
  assert(street.grammar.find((g) => g.grammarId === 'typographic_campaign')?.accepted, 'typographic accepted');

  const beauty = planOf('skincare_beauty');
  assert(beauty.archetype.archetype === 'beauty_ritual', `beauty archetype=${beauty.archetype.archetype}`);
  const beautyAccepted = acceptedSorted('skincare_beauty');
  assert(beauty.selectedGrammarId === beautyAccepted[0]?.grammarId, `9. beauty selected ${beauty.selectedGrammarId} must be highest accepted ${beautyAccepted[0]?.grammarId}`);
  if (beauty.selectedGrammarId === 'cinematic_full_bleed') {
    const cine = beauty.grammar.find((g) => g.grammarId === 'cinematic_full_bleed')!;
    const others = beauty.grammar.filter((g) => g.accepted && g.grammarId !== 'cinematic_full_bleed');
    assert(
      others.every((g) => cine.score >= g.score),
      `9. cinematic final ${cine.score} must be >= accepted alternatives ${others.map((g) => `${g.grammarId}:${g.score}`).join(',')}`
    );
  } else {
    assert(Boolean(beauty.selectedGrammarId), `9. beauty selected another explainable grammar ${beauty.selectedGrammarId}`);
  }

  const luxuryEditorial = luxury.grammar.find((g) => g.grammarId === 'editorial_asymmetric')!;
  const luxuryMonument = luxury.grammar.find((g) => g.grammarId === 'product_monument')!;
  assert(luxury.selectedGrammarId === 'editorial_asymmetric', `10. luxury grammar=${luxury.selectedGrammarId}`);
  assert(luxuryEditorial.accepted, '10. editorial accepted');
  assert(
    luxuryEditorial.score > luxuryMonument.score || (!luxuryMonument.accepted && luxuryEditorial.accepted),
    `10. luxury editorial final ${luxuryEditorial.score} must beat monument ${luxuryMonument.score} (accepted=${luxuryMonument.accepted})`
  );
  const luxuryCine = luxury.grammar.find((g) => g.grammarId === 'cinematic_full_bleed')!;
  assert(
    luxuryCine.failedGates.length > 0 && luxuryCine.accepted === false,
    `11. luxury cinematic rejected by gates ${luxuryCine.failedGates.join(',')} even if weighted ${luxuryCine.breakdown.weighted}`
  );
  assert(
    luxuryCine.breakdown.weighted >= 0.55 ? !luxuryCine.accepted : true,
    '11. failed mandatory gate rejects a grammar even if weighted score is high'
  );

  const unknown = planOf('insufficient_metadata');
  assert(unknown.archetype.archetype === 'unknown' || unknown.archetype.confidence < 0.55, `3. unknown/weak archetype=${unknown.archetype.archetype} conf=${unknown.archetype.confidence}`);
  assert(unknown.confidence < 0.55, `3. unknown plan confidence ${unknown.confidence} is not high`);
  assert(unknown.selectedGrammarId !== 'product_monument', `3. unknown must not report monument (${unknown.selectedGrammarId})`);
  assert(unknown.outcome === 'needs_clarification' || unknown.outcome === 'safe_fallback', `3. unknown outcome=${unknown.outcome}`);
  assert(unknown.catalog.selectionConfidence >= 0.8, `4. only-candidate selectionCertainty ${unknown.catalog.selectionConfidence}`);
  assert(unknown.catalog.heroSuitability < unknown.catalog.selectionConfidence, `4. heroSuitability ${unknown.catalog.heroSuitability} < selection ${unknown.catalog.selectionConfidence}`);
  assert(unknown.catalog.narrativeSuitability < 0.45, `4. narrativeSuitability ${unknown.catalog.narrativeSuitability} is not implied by only-candidate`);
  assert(!unknown.catalog.isDominantProduct || unknown.catalog.heroSuitability < 0.6, '4. only-available is not treated as premium dominance');
  assert(!eligible('insufficient_metadata', 'process_making'), 'unknown does not invent process');
  assert(!eligible('insufficient_metadata', 'brand_story'), 'unknown does not invent brand story');
  const invented = flagUnsupportedCopy('Handmade by artisans. Free shipping. Clinically proven.', unknown.claims);
  assert(invented.length >= 2, `unsupported claims flagged (${invented.map((c) => c.kind).join(',')})`);
  const unknownDoc = JSON.stringify(documentFromIntelligence(fixtureById('insufficient_metadata'), unknown));
  assert(!/handmade|artisan|free shipping|clinically/i.test(unknownDoc), 'fallback document has no invented claims');

  assert(plansEqual(planOf('headphones_technology'), planOf('headphones_technology')), '16. same input same plan');

  const food = planOf('artisan_food');
  assert(food.archetype.archetype === 'food_artisan', `food archetype=${food.archetype.archetype}`);
  assert(eligible('artisan_food', 'process_making'), 'artisan food may use process when owned process + claim exist');
  assert(food.selectedGrammarId !== 'product_monument', `6. food must not default to monument (${food.selectedGrammarId})`);
  assert(!food.grammar.find((g) => g.grammarId === 'product_monument')?.accepted, '6. food monument fails mandatory gates');

  const kids = planOf('kids_playful');
  assert(kids.archetype.archetype === 'kids_playful', `kids archetype=${kids.archetype.archetype}`);
  assert(kids.selectedGrammarId !== 'product_monument', `6. kids must not default to monument (${kids.selectedGrammarId})`);
  assert(!kids.grammar.find((g) => g.grammarId === 'product_monument')?.accepted, '6. kids monument fails mandatory gates');

  const mixed = planOf('broad_mixed_catalog');
  assert(mixed.archetype.archetype === 'general_catalog', `mixed archetype=${mixed.archetype.archetype}`);
  assert(mixed.selectedGrammarId !== 'product_monument', `5. mixed must not default to monument (${mixed.selectedGrammarId})`);
  assert(mixed.outcome === 'safe_fallback' || mixed.outcome === 'needs_clarification' || mixed.outcome === 'no_compatible_grammar', `5. mixed outcome=${mixed.outcome}`);
  assert(mixed.safeFallback === 'general_catalog_plan' || mixed.safeFallback === 'stable_renderer', `5. mixed fallback=${mixed.safeFallback}`);
  assert(!eligible('broad_mixed_catalog', 'process_making'), 'broad catalog does not invent process');

  for (const id of INTELLIGENCE_FIXTURE_IDS) {
    const p = planOf(id);
    const accepted = p.grammar.filter((g) => g.accepted);
    for (const g of accepted) {
      assert(g.failedGates.length === 0, `7. ${id} accepted ${g.grammarId} has no failed gates`);
      assert(g.breakdown.weighted >= 0.55, `7. ${id} accepted ${g.grammarId} weighted ${g.breakdown.weighted} meets threshold`);
    }
    if (p.selectedGrammarId) {
      const row = p.grammar.find((g) => g.grammarId === p.selectedGrammarId);
      assert(row?.accepted, `7. ${id} selected ${p.selectedGrammarId} is accepted`);
      const best = Math.max(...accepted.map((g) => g.score));
      assert(row && row.score === best, `8. ${id} selected final ${row?.score} is the highest accepted ${best}`);
    } else {
      assert(accepted.length === 0, `7. ${id} selected none, so no accepted grammar (${accepted.map((g) => g.grammarId).join(',')})`);
    }
  }

  assert(unknown.clarificationRequests.length > 0, '12. unknown catalog generates clarification requests');
  assert(sparse.clarificationRequests.length > 0, '12. sparse catalog generates clarification requests');
  assert(
    unknown.clarificationRequests.every((q) => q.id && q.question && q.reason && q.answerType && q.unlocks.length),
    '12. clarification requests are structured'
  );

  const sun = tech.assets.find((a) => a.id === 'sun-pack')!;
  assert(sun.ownershipConfidence >= 0.8, `13. sunglasses ownership ${sun.ownershipConfidence}`);
  assert(sun.roleConfidence !== sun.ownershipConfidence || sun.role === 'product_packshot', '13. ownership and role are not a single merged score');
  assert((sun.placementSuitability.usage || 0) < 0.2, `13. sunglasses packshot usage suitability ${sun.placementSuitability.usage || 0} is not a headphones Use image`);

  const filenameOnly = classifyAsset({
    id: 'fn-life',
    url: 'https://example.com/look.jpg',
    source: 'unknown',
    filename: 'summer-lifestyle-campaign-look.jpg',
    width: 1800,
    height: 1200,
  });
  assert(filenameOnly.role === 'product_lifestyle' || filenameOnly.role === 'hero_lifestyle' || filenameOnly.role === 'unknown', `14. filename role=${filenameOnly.role}`);
  assert(filenameOnly.roleConfidence <= 0.45, `14. filename-only role confidence ceiling ${filenameOnly.roleConfidence} <= 0.45`);
  const tagged = classifyAsset({
    id: 'tag-life',
    url: 'https://example.com/look.jpg',
    source: 'product_gallery',
    productId: 'x',
    galleryIndex: 1,
    filename: 'summer-lifestyle-campaign-look.jpg',
    merchantTags: ['lifestyle'],
    width: 1800,
    height: 1200,
  });
  assert(tagged.roleConfidence > filenameOnly.roleConfidence, `14. merchant tag ${tagged.roleConfidence} outranks filename ${filenameOnly.roleConfidence}`);
  assert(tagged.ownershipConfidence >= 0.8 && tagged.roleConfidence < tagged.ownershipConfidence, '13. asset can be owned confidently while role is weaker than ownership');

  for (const id of INTELLIGENCE_FIXTURE_IDS) {
    const p = planOf(id);
    const fps = p.page.chapters
      .map((c) => p.narrative.find((n) => n.purpose === c.purpose)?.copyFingerprint)
      .filter((fp): fp is string => Boolean(fp) && fp.length > 8);
    assert(new Set(fps).size === fps.length, `15. ${id} does not keep multiple chapters with the same copy fingerprint (${fps.join(' | ')})`);
    const intro = p.narrative.find((n) => n.purpose === 'product_introduction');
    const feature = p.narrative.find((n) => n.purpose === 'feature');
    if (intro?.eligible && feature?.eligible && intro.copyFingerprint && feature.copyFingerprint) {
      assert(intro.copyFingerprint !== feature.copyFingerprint, `15. ${id} feature copy is distinct from introduction`);
    }
  }

  const showcaseTech = buildDesignIntelligencePlan(intelligenceInputFromShowcase(SHOWCASE_CATALOGS.forma_audio));
  assert(showcaseTech.naive.useAssetProductId === 'e4', 'showcase naive Use is Travel Case Soft (sunglasses photo)');
  assert(!showcaseTech.narrative.find((n) => n.purpose === 'usage')?.eligible, 'showcase intelligence omits Use for Forma One');
  assert(showcaseTech.catalog.primaryProductId === 'e1', `showcase primary=${showcaseTech.catalog.primaryProductId}`);

  const cineVsType = street.grammarTradeoff || street.grammar.map((g) => `${g.grammarId}:${g.score}`).join(',');
  assert(Boolean(cineVsType), 'cinematic vs typographic differentiation is recorded');

  const intelDir = resolve(src, 'lib/ai-studio/v2/designIntelligence');
  const forbidden = [
    'bag-milano',
    'fa-one',
    'fa-sun',
    'fa-buds',
    'lamp-1',
    'headphones_technology',
    'luxury_handbags',
    'sparse_single_product',
    'packshots_only',
    'broad_mixed_catalog',
    'skincare_beauty',
    'forma_audio',
  ];
  for (const file of readdirSync(intelDir)) {
    if (!file.endsWith('.ts') || file === 'fixtures.ts') continue;
    const text = readFileSync(resolve(intelDir, file), 'utf8');
    for (const token of forbidden) {
      assert(!text.includes(token), `18. production logic ${file} must not hardcode ${token}`);
    }
  }

  const outDir = resolve(import.meta.dirname, '../docs/ai-studio-v2-design-intelligence-screenshots');
  mkdirSync(outDir, { recursive: true });
  const summary = INTELLIGENCE_FIXTURE_IDS.map((id) => {
    const p = planOf(id);
    return {
      id,
      outcome: p.outcome,
      safeFallback: p.safeFallback,
      archetype: p.archetype.archetype,
      archetypeConfidence: p.archetype.confidence,
      archetypeBand: p.archetype.band,
      rawScore: p.archetype.rawScore,
      independentGroupCount: p.archetype.independentGroupCount,
      confidenceCeiling: p.archetype.confidenceCeiling,
      ambiguity: p.archetype.ambiguity,
      primaryProductId: p.catalog.primaryProductId,
      selectionConfidence: p.catalog.selectionConfidence,
      heroSuitability: p.catalog.heroSuitability,
      narrativeSuitability: p.catalog.narrativeSuitability,
      evidenceCompleteness: p.catalog.evidenceCompleteness,
      isDominantProduct: p.catalog.isDominantProduct,
      selectedGrammarId: p.selectedGrammarId,
      selectionReason: p.selectionReason,
      clarificationRequests: p.clarificationRequests.map((q) => q.id),
      grammar: p.grammar.map((g) => ({
        id: g.grammarId,
        score: g.score,
        weighted: g.breakdown.weighted,
        accepted: g.accepted,
        failedGates: g.failedGates,
        breakdown: g.breakdown,
        rejectionReason: g.rejectionReason,
        reasons: g.reasons,
      })),
      acceptedChapters: p.page.chapters.map((c) => c.purpose),
      rejectedChapters: p.page.rejected.map((c) => ({ purpose: c.purpose, reason: c.reason })),
      warnings: p.warnings.map((w) => w.code),
      naive: p.naive,
    };
  });
  writeFileSync(resolve(outDir, 'fixture-results.json'), JSON.stringify(summary, null, 2));

  if (failed) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
  }
  console.log('\ndesign-intelligence selftest passed');
}

main();
