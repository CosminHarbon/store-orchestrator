/**
 * AI Studio V2 generation pipeline (Phase 3).
 * DesignSpec schema: shared/ai-studio-v2 (canonical — keep in sync via shared module).
 */
import { z } from 'https://esm.sh/zod@3.23.8'
import {
  buildDesignSpecSchemas,
  getDesignSpecSystemPrompt,
  getDesignSpecRepairPrompt,
} from '../../../shared/ai-studio-v2/designSpecSchema.ts'
import type { Zod as SharedZod } from '../../../shared/ai-studio-v2/zodType.ts'
import {
  buildArchitectureFingerprint,
  commerceEntryBandWarning,
  ensureCreativeStrategy,
  type ArchitectureFingerprint,
  type CreativeStrategy,
} from '../../../shared/ai-studio-v2/creativeStrategy.ts'
import { summarizeDesignSpecValidation } from '../../../shared/ai-studio-v2/designSpecValidation.ts'
import { applyStrategyDefaults, normalizeDesignSemantics, type StrategyNode } from '../../../shared/ai-studio-v2/strategyDefaults.ts'
import { isValidLayout } from '../../../shared/ai-studio-v2/compositionLayouts.ts'
import {
  buildMerchantFacts,
  getSiteArchitectProvenanceRules,
  getContentProvenanceRepairPrompt,
  scanDesignSpecForSuspiciousClaims,
  scanSiteTreeForSuspiciousClaims,
  type MerchantFacts,
  type ContentProvenanceFlag,
} from '../../../shared/ai-studio-v2/contentProvenance.ts'
import {
  chatJsonForTask,
  insertMessage,
  ensureConversation,
  ensureStorefront,
  llmConfigured,
  type LlmUsage,
} from './aiStudio.ts'

const {
  designSpecSchema,
  brandDesignSystemFromSpec,
  withCreativeStrategy,
} = buildDesignSpecSchemas(z as unknown as SharedZod)

export { designSpecSchema, brandDesignSystemFromSpec }

export type DesignSpec = ReturnType<(typeof designSpecSchema)['parse']>
export type BrandDesignSystem = ReturnType<typeof brandDesignSystemFromSpec>

export const COMPOSITION_VARIANTS = {
  nav: ['minimal', 'transparent'],
  hero: ['editorial_split', 'luxury_minimal', 'product_focus'],
  productGrid: ['editorial', 'luxury_image_first'],
  productRail: ['horizontal'],
  productSpotlight: ['feature'],
  editorialSplit: ['image_text'],
  brandStatement: ['large_type'],
  editorialMosaic: ['asymmetric'],
  testimonials: ['editorial'],
  reviews: ['wall'],
  footer: ['minimal_commerce', 'editorial_luxury'],
  newsletter: ['quiet'],
  announcement: ['slim'],
  collections: ['tiles'],
} as const

const COMPOSITION_TYPES = Object.keys(COMPOSITION_VARIANTS) as Array<keyof typeof COMPOSITION_VARIANTS>

const COMPOSITION_CATALOG_PROMPT = `
REGISTERED COMPOSITIONS (type/variant — execution vocabulary ONLY; never invent names):
- nav/minimal: compact solid chrome. Content: { storeName, tone?: dark|light }
- nav/transparent: overlay chrome over opening section. Content: { storeName, tone?: dark|light }
- hero/luxury_minimal: full-bleed atmospheric open (image + restrained type). Content: { title, subtitle, cta, imageUrl?, kicker?, layout?: quiet|cinematic }. cinematic = deeper veil + eyebrow kicker, slower/more atmospheric.
- hero/editorial_split: measured split open (copy + media). Content: { title, subtitle, cta, imageUrl?, align?, layout?: split|asymmetric }. asymmetric = media offset off-center instead of an even 50/50 split.
- hero/product_focus: product-as-artifact open. Content: { title, subtitle, cta, presentation: luxury|street|tech|editorial, layout?: stage|stacked }. stacked = image above copy, centered, app-like vertical rhythm.
- productGrid/editorial: catalog grid (layout?: featureFirst|standardEditorial|asymmetricFeature|dense). asymmetricFeature = one oversized anchor tile + a denser fill grid around it. dense = tighter multi-column grid, more items visible, no feature tile. Content: { title, presentation }
- productGrid/luxury_image_first: single oversized column of full-bleed product imagery, minimal metadata — a genuinely different silhouette from editorial, not a density variant of it. Use when the brand wants maximum imagery, minimum chrome. Content: { title? }
- productRail/horizontal: horizontal product discovery (layout?: uniform|alternatingOversized). alternatingOversized = every third tile breaks scale for a syncopated rhythm. Content: { title, presentation }
- productSpotlight/feature: single flagship product beat. Content: { title, body, cta, presentation }
- editorialSplit/image_text: image/text narrative beat. Content: { title, body, imageUrl?, imagePosition? }
- brandStatement/large_type: typography-led manifesto pause. Content: { statement, subtext? }
- editorialMosaic/asymmetric: multi-image mosaic (layout?: magazine|immersive). Content: { title? }
- testimonials/editorial: social proof (omit if wrong for brand). Content: { title?, layout?: quote|imageQuote }
- reviews/wall: aggregate ratings (layout?: index|grid). index = editorial vertical list (default). grid = dense card grid, better for catalogue_first/dense_campaign pages. Content: { title? }
- collections/tiles: collection discovery (layout?: editorial|stacked). stacked = full-width alternating rows instead of a 4-tile grid. Content: { title? }
- newsletter/quiet: list capture (omit if wrong for brand). Content: { title, subtitle?, cta? }
- announcement/slim: slim promo/shipping strip. Content: { text }
- footer/minimal_commerce: compact commerce close. Content: { storeName, text? }
- footer/editorial_luxury: editorial closing note. Content: { storeName, blurb?, text? }

PRODUCT PRESENTATION (content.presentation — tile chrome, NOT page architecture):
luxury | street | tech | editorial

DATA BINDINGS (optional on product nodes):
dataBindings: { products: featured|newest|bestsellers, limit: 1-12, showQuickAdd?: boolean }

DESIGN KNOBS (use deliberately to express creativeStrategy):
design.spacing: compact|cozy|airy|dramatic
design.minHeight: auto|60vh|80vh|100vh
design.fullBleed: boolean
design.alignment: start|center|end|stretch
design.emphasis: primary|secondary|quiet
design.measure: narrow|standard|wide|bleed

RESPONSIVE (optional per-node mobile override — omit unless mobile should genuinely differ):
responsive.mobile.variant: swap to a different registered variant of the same type on mobile
responsive.mobile.hide: drop this node entirely on mobile (e.g. a dense secondary rail)
responsive.mobile.spacing / minHeight: as above, mobile-only
Design knobs you leave unset are filled deterministically from creativeStrategy
(density/asymmetry/rhythm/typographyRole/imageryRole) — you do not have to set every field.
`.trim()

const siteNodeSchema = z.object({
  id: z.string().min(2).max(64).regex(/^[a-z][a-z0-9_]*$/i),
  type: z.enum(COMPOSITION_TYPES as unknown as [string, ...string[]]),
  variant: z.string().min(1).max(64),
  visible: z.boolean().default(true),
  content: z.record(z.unknown()).default({}),
  design: z.object({
    spacing: z.enum(['compact', 'cozy', 'airy', 'dramatic']).optional(),
    minHeight: z.enum(['auto', '60vh', '80vh', '100vh']).optional(),
    fullBleed: z.boolean().optional(),
    alignment: z.enum(['start', 'center', 'end', 'stretch']).optional(),
    emphasis: z.enum(['primary', 'secondary', 'quiet']).optional(),
    /** Tokenized content measure — opt into width differences without arbitrary CSS */
    measure: z.enum(['narrow', 'standard', 'wide', 'bleed']).optional(),
  }).default({}),
  responsive: z.object({
    // Additive widening (safe under existing defaults): the client renderer now actually
    // reads variant/hide/spacing, not just minHeight — see SiteTreeRenderer.tsx.
    mobile: z.object({
      variant: z.string().max(64).optional(),
      hide: z.boolean().optional(),
      spacing: z.enum(['compact', 'cozy', 'airy', 'dramatic']).optional(),
      minHeight: z.enum(['auto', '60vh', '80vh', '100vh']).optional(),
    }).optional(),
  }).default({}),
  dataBindings: z.object({
    products: z.enum(['featured', 'newest', 'bestsellers', 'collection']).optional(),
    limit: z.number().int().min(1).max(24).optional(),
    showQuickAdd: z.boolean().optional(),
  }).optional(),
})

const siteDocumentSchema = z.object({
  version: z.literal(2),
  siteId: z.string().min(1).max(64),
  designSystemId: z.string().min(1).max(64),
  pages: z.object({
    home: z.object({
      id: z.literal('home'),
      type: z.literal('home'),
      nodes: z.array(siteNodeSchema).min(4).max(20),
    }),
  }),
  meta: z.object({
    language: z.enum(['ro', 'en']),
    niche: z.string().max(80).optional(),
    updatedAt: z.string(),
  }),
}).superRefine((doc, ctx) => {
  const ids = doc.pages.home.nodes.map((n) => n.id)
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Node ids must be unique', path: ['pages', 'home', 'nodes'] })
  }
  const types = doc.pages.home.nodes.filter((n) => n.visible !== false).map((n) => n.type)
  if (!types.includes('nav')) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Home must include nav', path: ['pages', 'home', 'nodes'] })
  if (!types.includes('hero')) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Home must include hero', path: ['pages', 'home', 'nodes'] })
  if (!types.some((t) => t === 'productGrid' || t === 'productRail' || t === 'productSpotlight')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Home must include a product node', path: ['pages', 'home', 'nodes'] })
  }
  if (!types.includes('footer')) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Home must include footer', path: ['pages', 'home', 'nodes'] })
})

export type SiteDocument = z.infer<typeof siteDocumentSchema>
export { siteDocumentSchema }

const ARCHITECTURE_NOTES_MAX = 1200
const SILHOUETTE_LABEL_MAX = 40
const SILHOUETTE_PLAN_MIN = 3
const SILHOUETTE_PLAN_MAX = 16

const siteArchitectureOutputSchema = z.object({
  siteId: z.string().min(1).max(64),
  designSystemId: z.string().min(1).max(64),
  architectureNotes: z.string().max(ARCHITECTURE_NOTES_MAX).optional(),
  /** Explicit visual silhouette plan before concrete compositions */
  silhouettePlan: z
    .array(z.string().min(1).max(SILHOUETTE_LABEL_MAX))
    .min(SILHOUETTE_PLAN_MIN)
    .max(SILHOUETTE_PLAN_MAX)
    .optional(),
  nodes: z.array(siteNodeSchema).min(4).max(20),
})

/**
 * architectureNotes and silhouettePlan are commentary — they never affect rendering.
 * An over-long note must not fail an otherwise valid tree, so clamp them before
 * validation and record the adjustment instead of rejecting the whole generation.
 */
function clampArchitectureCommentary(json: unknown, warnings: string[]): unknown {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return json
  const obj = { ...(json as Record<string, unknown>) }

  const notes = obj.architectureNotes
  if (typeof notes === 'string' && notes.length > ARCHITECTURE_NOTES_MAX) {
    obj.architectureNotes = notes.slice(0, ARCHITECTURE_NOTES_MAX)
    warnings.push(
      `architectureNotes truncated from ${notes.length} to ${ARCHITECTURE_NOTES_MAX} characters`
    )
  }

  if (Array.isArray(obj.silhouettePlan)) {
    const raw = obj.silhouettePlan
    const plan = raw
      .filter((label): label is string => typeof label === 'string')
      .map((label) => label.trim().slice(0, SILHOUETTE_LABEL_MAX))
      .filter((label) => label.length > 0)
      .slice(0, SILHOUETTE_PLAN_MAX)
    if (plan.length >= SILHOUETTE_PLAN_MIN) {
      obj.silhouettePlan = plan
    } else {
      delete obj.silhouettePlan
      warnings.push(
        `silhouettePlan dropped: only ${plan.length} usable labels (need ${SILHOUETTE_PLAN_MIN})`
      )
    }
  }

  return obj
}

export type GenerationTaskMeta = {
  task: string
  model: string
  promptTokens: number
  completionTokens: number
  costUsd: number
  latencyMs: number
  ok: boolean
  error?: string
}

export type V2GenerationMeta = {
  engine: 'v2'
  schemaVersion: 2
  startedAt: string
  completedAt?: string
  totalLatencyMs?: number
  tasks: GenerationTaskMeta[]
  retries: number
  validationWarnings: string[]
  contentProvenanceWarnings?: string[]
  architectureNotes?: string
  silhouettePlan?: string[]
  architectureFingerprint?: ArchitectureFingerprint
}

function isValidComposition(type: string, variant: string): boolean {
  const allowed = COMPOSITION_VARIANTS[type as keyof typeof COMPOSITION_VARIANTS]
  if (!allowed) return false
  return (allowed as readonly string[]).includes(variant)
}

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48) || 'store'
}

function inferPresentation(spec: DesignSpec): 'luxury' | 'street' | 'tech' | 'editorial' {
  if (spec.productPresentation) return spec.productPresentation
  const a = spec.artDirection.archetype.toLowerCase()
  const b = spec.brand.businessType.toLowerCase()
  if (/street|urban|youth|oversized/.test(a + b)) return 'street'
  if (/tech|audio|electronic|headphone|wireless|precision/.test(a + b)) return 'tech'
  if (/luxury|quiet|leather|handbag|atelier/.test(a + b)) return 'luxury'
  return 'editorial'
}

const PRODUCT_NODE_TYPES = ['productGrid', 'productRail', 'productSpotlight']

/**
 * Defaults for product nodes the architect left unbound. Rotating them keeps two product
 * sections on one page from resolving to an identical list; an explicit binding from the
 * architect always wins.
 */
const DEFAULT_PRODUCT_BINDINGS = ['featured', 'newest', 'bestsellers'] as const

function enrichNodes(nodes: z.infer<typeof siteNodeSchema>[], spec: DesignSpec) {
  const presentation = inferPresentation(spec)
  const storeName = spec.brand.storeName || 'Store'
  let productNodeIndex = 0
  return nodes.map((node) => {
    const content = { ...node.content }
    if ((node.type === 'nav') && !content.storeName) content.storeName = storeName
    if (node.type === 'footer' && !content.storeName) content.storeName = storeName
    if (['productGrid', 'productRail', 'productSpotlight'].includes(node.type) && !content.presentation) {
      content.presentation = presentation
    }
    if (node.type === 'hero' && node.variant === 'product_focus' && !content.presentation) {
      content.presentation = presentation
    }
    let dataBindings = node.dataBindings
    if (PRODUCT_NODE_TYPES.includes(node.type)) {
      dataBindings = {
        ...dataBindings,
        products:
          dataBindings?.products ??
          DEFAULT_PRODUCT_BINDINGS[productNodeIndex % DEFAULT_PRODUCT_BINDINGS.length],
        limit: dataBindings?.limit ?? (node.type === 'productSpotlight' ? 1 : 8),
      }
      productNodeIndex += 1
    }
    return { ...node, content, dataBindings }
  })
}

function validateRegistry(nodes: z.infer<typeof siteNodeSchema>[]): string[] {
  const errors: string[] = []
  for (const node of nodes) {
    if (!isValidComposition(node.type, node.variant)) {
      errors.push(`Invalid composition ${node.type}/${node.variant} on node ${node.id}`)
    }
    const layout = (node.content as Record<string, unknown> | undefined)?.layout
    if (!isValidLayout(node.type, node.variant, layout)) {
      errors.push(`Invalid content.layout ${JSON.stringify(layout)} for ${node.type}/${node.variant} on node ${node.id}`)
    }
    const mobileVariant = node.responsive?.mobile?.variant
    if (mobileVariant !== undefined && !isValidComposition(node.type, mobileVariant)) {
      errors.push(`Invalid responsive.mobile.variant ${JSON.stringify(mobileVariant)} for type ${node.type} on node ${node.id}`)
    }
  }
  return errors
}

function buildDocument(
  arch: z.infer<typeof siteArchitectureOutputSchema>,
  spec: DesignSpec
): SiteDocument {
  const enriched = enrichNodes(arch.nodes, spec)
  // Fill design knobs the architect left unset from creativeStrategy, deterministically —
  // see strategyDefaults.ts. Explicit architect choices are never touched.
  const strategy = spec.creativeStrategy ?? ensureCreativeStrategy(spec)
  const withDefaults = applyStrategyDefaults(enriched as unknown as StrategyNode[], strategy) as unknown as typeof enriched
  const nodes = withDefaults.map((node) =>
    node.design
      ? {
          ...node,
          design: normalizeDesignSemantics(node.type, typeof node.content?.layout === 'string' ? node.content.layout as string : undefined, node.design),
        }
      : node
  )
  const registryErrors = validateRegistry(nodes)
  if (registryErrors.length) throw new Error(registryErrors.join('; '))
  return siteDocumentSchema.parse({
    version: 2,
    siteId: arch.siteId,
    designSystemId: arch.designSystemId,
    pages: { home: { id: 'home', type: 'home', nodes } },
    meta: {
      language: spec.brand.language,
      niche: spec.brand.businessType,
      updatedAt: new Date().toISOString(),
    },
  })
}

const DESIGN_SPEC_SYSTEM = getDesignSpecSystemPrompt()

const SITE_ARCHITECT_SYSTEM_TEMPLATE = `You are a premium ecommerce site architect.
You EXPRESS DesignSpec.creativeStrategy using ONLY registered compositions.
The registry is an execution vocabulary — NOT the source of creative direction.

${COMPOSITION_CATALOG_PROMPT}

Reasoning order (MANDATORY — do this before picking concrete types):
1. Read DesignSpec.creativeStrategy (+ creativeMode, designIntent, artDirection, pageIntent).
2. Decide first-viewport dominance from heroPhilosophy.
3. Decide commerce entry beat from commerceEntry + commerceModel.
4. Decide page rhythm/density/asymmetry from strategy.
5. Draft silhouettePlan — 3 to 16 short labels, 1-3 words each (visual silhouettes, not type names), e.g.
   chrome → full_bleed → statement → editorial_pause → spotlight → rail → chrome
   OR chrome → split → dense_grid → statement → mosaic → grid → chrome
   OR chrome → product_artifact → editorial_pause → statement → delayed rail → chrome
6. Decide what to omit and what must NOT repeat.
7. ONLY THEN map silhouettePlan onto registered compositions + design knobs.

Return JSON ONLY:
{
  "siteId": "brand_slug",
  "designSystemId": "archetype_slug",
  "silhouettePlan": ["chrome", "full_bleed", "statement", "..."],
  "architectureNotes": "Explain how the tree EXPRESS creativeStrategy (pageComposition, heroPhilosophy, commerceEntry, rhythm, typographyRole, imageryRole, distinctivenessBrief). Mention omissions. BUDGET: 800 characters max — terse clauses, not paragraphs.",
  "nodes": [
    {
      "id": "nav_01",
      "type": "nav",
      "variant": "minimal|transparent",
      "visible": true,
      "content": { ... },
      "design": {
        "spacing"?: "compact|cozy|airy|dramatic",
        "minHeight"?: "auto|60vh|80vh|100vh",
        "fullBleed"?: boolean,
        "alignment"?: "start|center|end|stretch",
        "emphasis"?: "primary|secondary|quiet",
        "measure"?: "narrow|standard|wide|bleed"
      },
      "responsive": {},
      "dataBindings"?: { "products": "featured|newest|bestsellers", "limit": number }
    }
  ]
}

HARD CONSTRAINTS (schema — still required in Phase 5A):
- Stable ids: nav_01, hero_01, products_01, story_01, … — never random UUIDs
- nav first, footer last
- Include hero + ≥1 product node (productGrid|productRail|productSpotlight) + footer
- Never invent type/variant names outside the registry
- 4–14 nodes typical (strategy density may push sparse or dense)

STRATEGY EXPRESSION (required):
- heroPhilosophy → hero variant + design (NOT category lookup):
  atmosphere_first → prefer luxury_minimal + fullBleed/measure=bleed + dramatic spacing when imageryRole=dominant
  typography_first → prefer editorial_split or luxury_minimal with brandStatement early when typographyRole=dominant_structural
  product_as_artifact → prefer product_focus
  split_editorial → prefer editorial_split
  immediate_offer → product_focus and/or product node immediately after hero
- commerceEntry must affect product node position:
  immediate → product/offer in first major content beat (hero product_focus and/or product node right after hero)
  early → product shortly after hero (≤ ~1 narrative beat)
  mid → brand/story establishes before first product discovery
  delayed → multiple meaningful storytelling beats before first productGrid/Rail/Spotlight
- commerceModel maps to product presentation choices (spotlight vs grid vs rail vs collections) — do not always use flagship_then_rail
- rhythm:
  sparse_pause → fewer sections, dramatic/airy spacing, avoid repeated commerce
  rapid_contrast → shorter alternating silhouettes, stronger type/image switches
  long_short_long → alternate heavy and light section weights via spacing/minHeight/measure
  even → controlled regular pacing
- typographyRole=dominant_structural → include brandStatement/large_type and let type lead; do not ship a photo-only site with merely larger headings
- imageryRole=dominant → favor fullBleed/bleed heroes, mosaics, editorial imagery; supporting → let type/product info structure more
- navigationBehavior → nav variant (quiet_overlay/minimal_chrome → transparent; solid_compact/bold_campaign → minimal)
- Apply design.measure / fullBleed / spacing / alignment / emphasis so strategy is visible in layout — not only in copy
- OMIT sections that fight the strategy (e.g. skip testimonials/newsletter when distinctivenessBrief or mustAvoid says so)
- Do NOT default to Hero→Products→Features→Testimonials→FAQ→Footer
- Do NOT choose hero by niche cheat-sheet (luxury→luxury_minimal, tech→product_focus). Derive from creativeStrategy.
- Optimize brandFit + designQuality + intentionalDistinctiveness — never novelty for its own sake
- Write on-brand copy; use productPresentation on product nodes for tile chrome only

{{CONTENT_PROVENANCE_RULES}}`

function buildSiteArchitectSystem(facts: MerchantFacts): string {
  return SITE_ARCHITECT_SYSTEM_TEMPLATE.replace(
    '{{CONTENT_PROVENANCE_RULES}}',
    getSiteArchitectProvenanceRules(facts)
  )
}

const REPAIR_SYSTEM = `Fix the SiteTree JSON to pass validation.
Return JSON ONLY with the same shape: { siteId, designSystemId, architectureNotes?, silhouettePlan?, nodes: [...] }
Use ONLY registered compositions. Fix invalid type/variant pairs, duplicate ids, missing required nodes.
Fix invalid content.layout values by using only the layout options documented below for that node's
exact (type, variant), or by omitting content.layout entirely — never invent a layout name.
Preserve silhouettePlan when present. Do not change creative intent unnecessarily — repair structure only.

${COMPOSITION_CATALOG_PROMPT}`

async function runTask(
  task: 'design_spec' | 'site_architecture' | 'site_ops',
  system: string,
  user: string,
  temperature: number,
  maxTokens: number
): Promise<{ json: unknown; usage: LlmUsage; latencyMs: number }> {
  const started = Date.now()
  const result = await chatJsonForTask(task, { system, user, temperature, maxTokens })
  return { ...result, latencyMs: Date.now() - started }
}

function parseDesignSpecPayload(json: unknown) {
  return designSpecSchema.safeParse({ version: 1, ...(json as object) })
}

/** Compact trace of the authored strategy — no prompts, no merchant data. */
function phase5aStrategyTrace(spec: { creativeStrategy?: CreativeStrategy | undefined }) {
  const cs = spec.creativeStrategy
  if (!cs) return 'absent (will be inferred by ensureCreativeStrategy)'
  return `${cs.pageComposition}/${cs.heroPhilosophy}/${cs.commerceEntry}/${cs.rhythm}/exp=${cs.experimentationLevel}`
}

async function generateDesignSpecWithRepair(opts: {
  prompt: string
  profileStoreName?: string
  catalog: { productTitles: string[]; collectionNames: string[] }
  merchantFacts: MerchantFacts
  send: (event: string, data: unknown) => void
  taskMetas: GenerationTaskMeta[]
  onRetry: () => void
}): Promise<DesignSpec> {
  const userPrompt = [
    `Brand brief: ${opts.prompt}`,
    opts.profileStoreName ? `Existing store name hint: ${opts.profileStoreName}` : '',
    opts.catalog.productTitles.length
      ? `Live products (do not invent SKUs): ${opts.catalog.productTitles.join(', ')}`
      : 'Live products: none yet',
    opts.catalog.collectionNames.length ? `Live collections: ${opts.catalog.collectionNames.join(', ')}` : '',
    '',
    'MERCHANT FACTS (authoritative — do not invent beyond these):',
    ...opts.merchantFacts.authorizedSummary.map((line) => `- ${line}`),
  ]
    .filter(Boolean)
    .join('\n')

  const designResult = await runTask('design_spec', DESIGN_SPEC_SYSTEM, userPrompt, 0.55, 3200)
  opts.taskMetas.push({
    task: 'design_spec',
    model: designResult.usage.model,
    promptTokens: designResult.usage.prompt,
    completionTokens: designResult.usage.completion,
    costUsd: designResult.usage.cost,
    latencyMs: designResult.latencyMs,
    ok: true,
  })

  let parsed = parseDesignSpecPayload(designResult.json)
  if (parsed.success) {
    console.log('[Phase5A] creativeStrategy after design spec parse:', phase5aStrategyTrace(parsed.data))
    return parsed.data
  }

  const summary = summarizeDesignSpecValidation(parsed.error.issues)
  opts.onRetry()
  opts.send('status', {
    step: 'designing',
    message: summary.userMessage,
    validationRetry: true,
    validationSummary: summary,
  })

  const repairResult = await runTask(
    'design_spec',
    getDesignSpecRepairPrompt(summary.technicalMessage),
    JSON.stringify({ draft: designResult.json, errors: parsed.error.issues.map((i) => ({ path: i.path, message: i.message, code: i.code })) }),
    0.25,
    3200
  )
  opts.taskMetas.push({
    task: 'design_spec_repair',
    model: repairResult.usage.model,
    promptTokens: repairResult.usage.prompt,
    completionTokens: repairResult.usage.completion,
    costUsd: repairResult.usage.cost,
    latencyMs: repairResult.latencyMs,
    ok: true,
  })

  parsed = parseDesignSpecPayload(repairResult.json)
  if (!parsed.success) {
    const repairSummary = summarizeDesignSpecValidation(parsed.error.issues)
    throw new Error(
      `DesignSpec validation failed after repair: ${repairSummary.technicalMessage}`
    )
  }
  console.log('[Phase5A] creativeStrategy after repair:', phase5aStrategyTrace(parsed.data))
  return parsed.data
}

function formatContentFlags(flags: ContentProvenanceFlag[]): string[] {
  return flags.map((f) =>
    f.nodeId === 'designSpec'
      ? `DesignSpec ${f.field}: "${f.excerpt}" — ${f.reason}`
      : `Copy ${f.nodeId}.${f.field}: "${f.excerpt}" — ${f.reason}`
  )
}

async function repairSiteTreeContent(
  arch: z.infer<typeof siteArchitectureOutputSchema>,
  flags: ContentProvenanceFlag[],
  designSpec: DesignSpec,
  taskMetas: GenerationTaskMeta[],
  warnings: string[]
): Promise<z.infer<typeof siteArchitectureOutputSchema>> {
  const repairResult = await runTask(
    'site_ops',
    getContentProvenanceRepairPrompt(flags),
    JSON.stringify({ current: arch, designSpec: { storeName: designSpec.brand.storeName, archetype: designSpec.artDirection.archetype } }),
    0.25,
    3500
  )
  taskMetas.push({
    task: 'site_ops_content',
    model: repairResult.usage.model,
    promptTokens: repairResult.usage.prompt,
    completionTokens: repairResult.usage.completion,
    costUsd: repairResult.usage.cost,
    latencyMs: repairResult.latencyMs,
    ok: true,
  })
  const parsed = siteArchitectureOutputSchema.safeParse(
    clampArchitectureCommentary(repairResult.json, warnings)
  )
  if (!parsed.success) return arch
  return parsed.data
}

function mergeUsage(tasks: GenerationTaskMeta[]): { prompt: number; completion: number; cost: number; model: string } {
  return {
    prompt: tasks.reduce((s, t) => s + t.promptTokens, 0),
    completion: tasks.reduce((s, t) => s + t.completionTokens, 0),
    cost: tasks.reduce((s, t) => s + t.costUsd, 0),
    model: tasks.map((t) => t.model).filter(Boolean).join(' → ') || 'none',
  }
}

export async function generateV2Storefront(opts: {
  prompt: string
  catalog: { productTitles: string[]; collectionNames: string[] }
  profileStoreName?: string
  quality: 'fast' | 'studio'
  send: (event: string, data: unknown) => void
  admin: ReturnType<typeof import('./aiStudio.ts').createAdmin>
  userId: string
  conversationId?: string
}) {
  const { prompt, catalog, profileStoreName, quality, send, admin, userId, conversationId } = opts
  const startedAt = new Date().toISOString()
  const taskMetas: GenerationTaskMeta[] = []
  let retries = 0
  const validationWarnings: string[] = []
  const contentProvenanceWarnings: string[] = []
  let llmError: string | undefined

  let merchantFacts = buildMerchantFacts({
    prompt,
    productTitles: catalog.productTitles,
    collectionNames: catalog.collectionNames,
    profileStoreName,
  })

  send('status', { step: 'understanding', message: 'Understanding your brand…' })

  if (!llmConfigured()) {
    throw new Error(
      'No LLM API key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY in Supabase Edge Function secrets.'
    )
  }

  let designSpec: DesignSpec
  try {
    send('status', { step: 'designing', message: 'Creating the visual direction…' })
    designSpec = await generateDesignSpecWithRepair({
      prompt,
      profileStoreName,
      catalog,
      merchantFacts,
      send,
      taskMetas,
      onRetry: () => {
        retries += 1
      },
    })
    if (!designSpec.brand.storeName && profileStoreName) {
      designSpec = { ...designSpec, brand: { ...designSpec.brand, storeName: profileStoreName } }
    }
    designSpec = withCreativeStrategy(designSpec)
    merchantFacts = buildMerchantFacts({
      prompt,
      productTitles: catalog.productTitles,
      collectionNames: catalog.collectionNames,
      profileStoreName,
      storeName: designSpec.brand.storeName,
    })
    const specContentFlags = scanDesignSpecForSuspiciousClaims(designSpec, merchantFacts)
    if (specContentFlags.length) {
      contentProvenanceWarnings.push(...formatContentFlags(specContentFlags))
      validationWarnings.push(...formatContentFlags(specContentFlags))
    }
    send('status', { step: 'designing', message: 'Visual direction ready.', designSpec })
  } catch (err) {
    llmError = err instanceof Error ? err.message : String(err)
    taskMetas.push({
      task: 'design_spec',
      model: 'error',
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      latencyMs: 0,
      ok: false,
      error: llmError,
    })
    send('error', {
      step: 'error',
      error: llmError,
      message: llmError.startsWith('DesignSpec validation failed')
        ? 'Design direction could not be validated. Try again or shorten your brief.'
        : `Design direction failed: ${llmError}`,
    })
    return
  }

  const brandSystem = brandDesignSystemFromSpec(designSpec)
  send('status', { step: 'designing', designSpec, brandSystem })

  send('status', { step: 'planning', message: 'Planning your storefront…' })

  let document: SiteDocument
  let architectureNotes: string | undefined
  let silhouettePlan: string[] | undefined
  let architectureFingerprint: ArchitectureFingerprint | undefined

  try {
    send('status', { step: 'composing', message: 'Composing the homepage…' })
    const archResult = await runTask(
      'site_architecture',
      buildSiteArchitectSystem(merchantFacts),
      [
        `DesignSpec:\n${JSON.stringify(designSpec, null, 2)}`,
        `Brand design system archetype: ${brandSystem.archetype}`,
        `Product presentation mode: ${inferPresentation(designSpec)}`,
        catalog.productTitles.length ? `Reference product names for copy only: ${catalog.productTitles.slice(0, 6).join(', ')}` : '',
        '',
        'REMINDER: Use only merchant-provided facts above. All other copy must be creative marketing without invented verifiable claims.',
      ].filter(Boolean).join('\n\n'),
      0.45,
      4000
    )
    taskMetas.push({
      task: 'site_architecture',
      model: archResult.usage.model,
      promptTokens: archResult.usage.prompt,
      completionTokens: archResult.usage.completion,
      costUsd: archResult.usage.cost,
      latencyMs: archResult.latencyMs,
      ok: true,
    })

    let archParsed = siteArchitectureOutputSchema.safeParse(
      clampArchitectureCommentary(archResult.json, validationWarnings)
    )
    if (!archParsed.success) {
      validationWarnings.push(...archParsed.error.issues.map((i) => i.message))
      throw new Error(`Site architecture schema invalid: ${archParsed.error.issues[0]?.message}`)
    }

    let arch = archParsed.data
    architectureNotes = arch.architectureNotes
    silhouettePlan = arch.silhouettePlan
    console.log(
      '[Phase5A] silhouettePlan after architecture parse:',
      silhouettePlan?.length ? silhouettePlan.join(' → ') : 'absent (architect omitted it)'
    )

    try {
      document = buildDocument(arch, designSpec)
    } catch (buildErr) {
      validationWarnings.push(buildErr instanceof Error ? buildErr.message : String(buildErr))
      send('status', { step: 'verifying', message: 'Repairing structure…' })
      retries += 1
      const repairResult = await runTask(
        'site_ops',
        REPAIR_SYSTEM,
        JSON.stringify({
          errors: [buildErr instanceof Error ? buildErr.message : String(buildErr)],
          designSpec: { storeName: designSpec.brand.storeName, archetype: designSpec.artDirection.archetype, productPresentation: inferPresentation(designSpec) },
          current: arch,
        }),
        0.2,
        3500
      )
      taskMetas.push({
        task: 'site_ops',
        model: repairResult.usage.model,
        promptTokens: repairResult.usage.prompt,
        completionTokens: repairResult.usage.completion,
        costUsd: repairResult.usage.cost,
        latencyMs: repairResult.latencyMs,
        ok: true,
      })
      archParsed = siteArchitectureOutputSchema.safeParse(
        clampArchitectureCommentary(repairResult.json, validationWarnings)
      )
      if (!archParsed.success) throw buildErr
      arch = archParsed.data
      document = buildDocument(arch, designSpec)
    }

    let contentFlags = scanSiteTreeForSuspiciousClaims(document, merchantFacts)
    if (contentFlags.length) {
      contentProvenanceWarnings.push(...formatContentFlags(contentFlags))
      validationWarnings.push(...formatContentFlags(contentFlags))
      send('status', { step: 'verifying', message: 'Refining copy for factual accuracy…' })
      retries += 1
      arch = await repairSiteTreeContent(arch, contentFlags, designSpec, taskMetas, validationWarnings)
      document = buildDocument(arch, designSpec)
      contentFlags = scanSiteTreeForSuspiciousClaims(document, merchantFacts)
      if (contentFlags.length) {
        contentProvenanceWarnings.push(...formatContentFlags(contentFlags))
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    llmError = llmError || msg
    taskMetas.push({
      task: 'site_architecture',
      model: 'error',
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      latencyMs: 0,
      ok: false,
      error: msg,
    })
    throw new Error(`SiteTree generation failed: ${msg}`)
  }

  send('status', { step: 'verifying', message: 'Finalizing the experience…' })

  const completedAt = new Date().toISOString()
  const totalLatencyMs = taskMetas.reduce((s, t) => s + t.latencyMs, 0)
  const usageTotal = mergeUsage(taskMetas)

  // Phase 5A — observation-only architecture fingerprint (no hard reject)
  try {
    architectureFingerprint = buildArchitectureFingerprint({
      designSpec,
      nodes: document.pages.home.nodes,
      silhouettePlan: silhouettePlan || null,
    })
    const strategy = designSpec.creativeStrategy ?? ensureCreativeStrategy(designSpec)
    const bandWarn = commerceEntryBandWarning(
      strategy.commerceEntry,
      architectureFingerprint.commerceEntryIndex
    )
    if (bandWarn) validationWarnings.push(bandWarn)
    console.log('[Phase5A] architectureFingerprint computed:', JSON.stringify(architectureFingerprint))
  } catch (fpErr) {
    validationWarnings.push(
      `architectureFingerprint skipped: ${fpErr instanceof Error ? fpErr.message : String(fpErr)}`
    )
  }

  const generationMeta: V2GenerationMeta = {
    engine: 'v2',
    schemaVersion: 2,
    startedAt,
    completedAt,
    totalLatencyMs,
    tasks: taskMetas,
    retries,
    validationWarnings,
    contentProvenanceWarnings: contentProvenanceWarnings.length ? contentProvenanceWarnings : undefined,
    architectureNotes,
    silhouettePlan,
    architectureFingerprint,
  }

  const storefront = await ensureStorefront(admin, userId)
  const conversation = await ensureConversation(admin, userId, storefront.id, conversationId)

  const storeName = designSpec.brand.storeName || profileStoreName || 'Store'
  const message = designSpec.brand.language === 'ro'
    ? `${storeName} — direcție ${designSpec.artDirection.archetype.replace(/_/g, ' ')}. ${architectureNotes || designSpec.designIntent.coreConcept.slice(0, 120)}…`
    : `${storeName} — ${designSpec.artDirection.archetype.replace(/_/g, ' ')} direction. ${architectureNotes || designSpec.designIntent.coreConcept.slice(0, 120)}…`

  const { error: persistError } = await admin.from('ai_storefronts').update({
    schema_version: 2,
    draft_document: document,
    design_spec: designSpec,
    brand_design_system: brandSystem,
    creative_mode: designSpec.creativeMode,
    status: 'ready',
    quality,
  }).eq('id', storefront.id)

  if (persistError) {
    send('error', { step: 'error', error: persistError.message })
    return
  }

  await insertMessage(admin, {
    conversation_id: conversation.id,
    user_id: userId,
    role: 'user',
    content: prompt,
    kind: 'generate',
    quality,
    brief_json: { engine: 'v2', briefId: slugify(storeName) },
  })

  await insertMessage(admin, {
    conversation_id: conversation.id,
    user_id: userId,
    role: 'assistant',
    content: message,
    brief_json: generationMeta,
    spec_json: designSpec,
    model: usageTotal.model,
    prompt_tokens: usageTotal.prompt,
    completion_tokens: usageTotal.completion,
    estimated_cost_usd: usageTotal.cost,
    kind: 'generate',
    quality,
    status: 'ok',
  })

  send('ready', {
    step: 'ready',
    message,
    conversationId: conversation.id,
    designSpec,
    document,
    brandSystem,
    generationMeta,
    llm: usageTotal.model,
    llmError,
  })
}
