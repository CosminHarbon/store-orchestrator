/**
 * Phase 5C.1 — Semantic Design Intelligence.
 *
 * Deterministic, inspectable analysis of catalog + assets. Does not call
 * LLMs or vision APIs. Not wired to production generation or publish.
 */

import type { CreativeStrategy } from '@shared/ai-studio-v2/creativeStrategy';
import type { LayoutGrammarId } from '@/lib/ai-studio/v2/layoutGrammar/types';

export const STORE_ARCHETYPES = [
  'fashion_editorial',
  'streetwear_campaign',
  'beauty_ritual',
  'technology_product',
  'home_interior',
  'food_artisan',
  'kids_playful',
  'general_catalog',
  'unknown',
] as const;
export type StoreArchetype = (typeof STORE_ARCHETYPES)[number];

export const ASSET_ROLES = [
  'hero_lifestyle',
  'hero_product',
  'product_packshot',
  'product_lifestyle',
  'product_detail',
  'material_detail',
  'process',
  'collection',
  'brand_story',
  'founder_or_team',
  'interior_or_environment',
  'texture_or_background',
  'decorative',
  'unknown',
] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

export const EVIDENCE_PROVIDERS = [
  'structured_metadata',
  'filename',
  'dimensions',
  'merchant_tag',
  'existing_asset_plan',
  'vision_classifier',
] as const;
export type EvidenceProvider = (typeof EVIDENCE_PROVIDERS)[number];

export const ASSET_SOURCES = [
  'product_gallery',
  'collection',
  'hero',
  'story',
  'brand',
  'unknown',
] as const;
export type AssetSource = (typeof ASSET_SOURCES)[number];

export const NARRATIVE_PURPOSES = [
  'chrome',
  'product_introduction',
  'feature',
  'form_design',
  'material',
  'process_making',
  'usage',
  'lifestyle',
  'collection',
  'comparison',
  'trust',
  'brand_story',
  'product_discovery',
] as const;
export type NarrativePurpose = (typeof NARRATIVE_PURPOSES)[number];

export const CLAIM_KINDS = [
  'handmade_artisan',
  'sustainability',
  'origin',
  'material',
  'durability',
  'warranty',
  'shipping',
  'returns',
  'scarcity',
  'medical_technical_performance',
  'discount',
] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export const INTELLIGENCE_WARNINGS = [
  'insufficient_hero_assets',
  'cross_product_story_asset',
  'low_resolution_for_full_bleed',
  'duplicate_asset_overuse',
  'unsupported_process_story',
  'inconsistent_catalog_imagery',
  'missing_primary_product',
  'grammar_asset_mismatch',
  'unsupported_claim',
  'unowned_brand_story_asset',
  'weak_archetype_evidence',
  'packshot_only_catalog',
  'insufficient_metadata',
  'mixed_category_narrative',
  'no_compatible_grammar',
  'needs_clarification',
  'redundant_chapter_omitted',
] as const;
export type IntelligenceWarningCode = (typeof INTELLIGENCE_WARNINGS)[number];

export const EVIDENCE_GROUPS = [
  'merchant_description',
  'categories_collections',
  'product_names',
  'product_descriptions',
  'tags',
  'catalog_distribution',
  'asset_metadata',
  'design_spec',
  'creative_strategy',
] as const;
export type EvidenceGroupId = (typeof EVIDENCE_GROUPS)[number];

export const CONFIDENCE_BANDS = ['unknown', 'weak', 'plausible', 'strong', 'multiple_independent'] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

export const PLAN_OUTCOMES = ['selected', 'needs_clarification', 'safe_fallback', 'no_compatible_grammar'] as const;
export type PlanOutcome = (typeof PLAN_OUTCOMES)[number];

export const SAFE_FALLBACKS = ['stable_renderer', 'general_catalog_plan', 'none'] as const;
export type SafeFallbackKind = (typeof SAFE_FALLBACKS)[number];

export const CATALOG_SHAPES = ['single_product', 'focused_collection', 'broad_catalog'] as const;
export type CatalogShape = (typeof CATALOG_SHAPES)[number];

export type Evidence = {
  provider: EvidenceProvider;
  signal: string;
  weight: number;
};

export type DecisionNote = {
  decision: string;
  confidence: number;
  evidence: Evidence[];
  missing: string[];
};

export type MerchantPolicies = {
  shipping?: string;
  returns?: string;
  warranty?: string;
  origin?: string;
  sustainability?: string;
};

export type MerchantContext = {
  storeName: string;
  description?: string;
  tagline?: string;
  featuredProductId?: string;
  policies?: MerchantPolicies;
  explicitClaims?: string[];
  designSpec?: unknown;
  strategy?: CreativeStrategy | null;
};

export type IntelligenceProductInput = {
  id: string;
  title: string;
  description: string;
  price: number;
  originalPrice?: number;
  category: string;
  collectionIds: string[];
  tags?: string[];
  sku?: string;
  stock: number;
  active?: boolean;
  featured?: boolean;
  position?: number;
  variantCount?: number;
  imageUrl?: string;
};

export type IntelligenceCollectionInput = {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
};

export type IntelligenceAssetInput = {
  id: string;
  url: string;
  alt?: string;
  caption?: string;
  filename?: string;
  width?: number;
  height?: number;
  productId?: string | null;
  collectionId?: string | null;
  source: AssetSource;
  galleryIndex?: number;
  merchantTags?: string[];
  existingRole?: string | null;
  containsReadableText?: boolean;
};

export type IntelligenceInput = {
  id: string;
  merchant: MerchantContext;
  products: IntelligenceProductInput[];
  collections: IntelligenceCollectionInput[];
  assets: IntelligenceAssetInput[];
  reviews?: Array<{ id: string; rating: number; comment: string; productId?: string }>;
  seed?: string;
};

export type PlacementSuitability = Partial<Record<NarrativePurpose, number>>;

export type ClassifiedAsset = {
  id: string;
  url: string;
  role: AssetRole;
  roleConfidence: number;
  ownershipConfidence: number;
  placementSuitability: PlacementSuitability;
  productId: string | null;
  collectionId: string | null;
  source: AssetSource;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  resolutionSuitability: 'full_bleed' | 'contained' | 'thumb_only' | 'unknown';
  evidence: Evidence[];
  permittedPlacements: NarrativePurpose[];
  prohibitedPlacements: NarrativePurpose[];
  reuseAllowed: boolean;
  containsReadableText: boolean | null;
  filename: string | null;
  alt: string | null;
};

export type CatalogProfile = {
  totalProducts: number;
  categories: string[];
  collections: string[];
  dominantCategory: string | null;
  categoryDistribution: Array<{ category: string; count: number; share: number }>;
  priceMin: number | null;
  priceMax: number | null;
  productDepth: 'sparse' | 'adequate' | 'rich';
  variantDensity: number;
  imageCoverage: number;
  catalogShape: CatalogShape;
  editorialStorySupport: boolean;
  primaryProductId: string | null;
  /** @deprecated alias of selectionConfidence — kept for serialization compatibility */
  primaryConfidence: number;
  selectionConfidence: number;
  heroSuitability: number;
  narrativeSuitability: number;
  evidenceCompleteness: number;
  isDominantProduct: boolean;
  primaryEvidence: Evidence[];
  supportingProductIds: string[];
  heroCandidateIds: string[];
  productsLackingImagery: string[];
  visuallyInconsistentProductIds: string[];
};

export type EvidenceGroup = {
  id: EvidenceGroupId;
  present: boolean;
  independent: boolean;
  hits: string[];
  weight: number;
};

export type ArchetypeResult = {
  archetype: StoreArchetype;
  rawScore: number;
  confidence: number;
  band: ConfidenceBand;
  evidenceGroups: EvidenceGroup[];
  independentGroupCount: number;
  confidenceCeiling: number;
  evidence: Evidence[];
  alternatives: Array<{ archetype: StoreArchetype; confidence: number; independentGroupCount: number }>;
  contradictions: string[];
  ambiguity: string | null;
  missing: string[];
  clarificationValuable: boolean;
};

export type OwnershipViolation = {
  code: IntelligenceWarningCode;
  assetId: string;
  productId: string | null;
  expectedProductId: string | null;
  message: string;
};

export type ClaimRecord = {
  kind: ClaimKind;
  text: string;
  source: 'merchant' | 'product' | 'collection' | 'policy' | 'unsupported';
  allowed: boolean;
  productId?: string;
};

export type ChapterEligibility = {
  purpose: NarrativePurpose;
  eligible: boolean;
  confidence: number;
  requiredEvidence: string[];
  availableEvidence: string[];
  missingEvidence: string[];
  assignedProductIds: string[];
  assignedAssetIds: string[];
  fallback: NarrativePurpose | null;
  reason: string;
  copyFingerprint: string | null;
};

export type GrammarGate = {
  id: string;
  passed: boolean;
  detail: string;
};

export type GrammarScoreBreakdown = {
  structural: number;
  semantic: number;
  asset: number;
  brand: number;
  commerce: number;
  penalties: number;
  weighted: number;
  final: number;
};

export type GrammarCompatibility = {
  grammarId: LayoutGrammarId;
  score: number;
  breakdown: GrammarScoreBreakdown;
  gates: GrammarGate[];
  failedGates: string[];
  accepted: boolean;
  reasons: string[];
  missingRequirements: string[];
  riskFlags: string[];
  experimental: boolean;
  rejectionReason: string | null;
};

export type ClarificationRequest = {
  id: string;
  question: string;
  reason: string;
  missingEvidence: string[];
  unlocks: string[];
  answerType: 'product_id' | 'archetype' | 'enum' | 'asset_role' | 'collection_id' | 'boolean';
};

export type PageNarrativeChapter = {
  id: string;
  purpose: NarrativePurpose;
  productIds: string[];
  assetIds: string[];
  copySource: 'merchant' | 'product' | 'collection' | 'document' | 'none';
  copyRef: string;
  allowedGrammarTreatments: LayoutGrammarId[];
  ecommerceAction: 'none' | 'open_product' | 'add_to_cart' | 'open_catalog' | 'open_cart';
  confidence: number;
  evidence: Evidence[];
  fallback: NarrativePurpose | null;
  aiMayRewriteCopy: boolean;
  independentlyReplaceable: boolean;
};

export type PageNarrativePlan = {
  chapters: PageNarrativeChapter[];
  rejected: ChapterEligibility[];
  fallbackStrategy: string;
};

export type IntelligenceWarning = {
  code: IntelligenceWarningCode;
  message: string;
  assetIds?: string[];
  productIds?: string[];
};

export type NaiveAssignment = {
  primaryProductId: string | null;
  formAssetProductId: string | null;
  makeAssetProductId: string | null;
  useAssetProductId: string | null;
  formAssetId: string | null;
  makeAssetId: string | null;
  useAssetId: string | null;
  notes: string[];
};

export type DesignIntelligencePlan = {
  version: 1;
  inputId: string;
  archetype: ArchetypeResult;
  catalog: CatalogProfile;
  assets: ClassifiedAsset[];
  ownershipViolations: OwnershipViolation[];
  claims: ClaimRecord[];
  narrative: ChapterEligibility[];
  grammar: GrammarCompatibility[];
  selectedGrammarId: LayoutGrammarId | null;
  outcome: PlanOutcome;
  safeFallback: SafeFallbackKind;
  selectionReason: string;
  grammarTradeoff: string | null;
  clarificationRequests: ClarificationRequest[];
  page: PageNarrativePlan;
  warnings: IntelligenceWarning[];
  naive: NaiveAssignment;
  confidence: number;
  reasons: string[];
  clarificationValuable: boolean;
};
