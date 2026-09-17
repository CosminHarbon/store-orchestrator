/**
 * Phase 4 — Visual Critic + SiteOps mapping (edge).
 */
import { z } from 'https://esm.sh/zod@3.23.8'
import {
  buildCritiqueSchemas,
  meetsCritiqueStopThreshold,
  applyCritiqueCalibrationGuards,
  getActionableRecommendations,
  CRITIQUE_STOP_THRESHOLD,
  CRITIQUE_DIMENSION_KEYS,
  type CritiqueScoreCard,
  type ScreenshotMeta,
} from '../../../shared/ai-studio-v2/critiqueScoreCard.ts'
import {
  getVisualCriticSystemPrompt,
  getSiteOpsFromCritiqueSystemPrompt,
} from '../../../shared/ai-studio-v2/visualCriticPrompt.ts'
import { buildExpectedRenderManifest } from '../../../shared/ai-studio-v2/expectedRenderManifest.ts'
import { isValidLayout } from '../../../shared/ai-studio-v2/compositionLayouts.ts'
import {
  chatJsonForTask,
  chatVisionJsonForTask,
  insertMessage,
  ensureConversation,
  ensureStorefront,
  type LlmUsage,
} from './aiStudio.ts'

const COMPOSITION_VARIANTS = {
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

const {
  visualCritiqueOutputSchema,
  critiqueScoreCardSchema,
} = buildCritiqueSchemas(z)

const siteOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('insert'),
    afterId: z.string().max(64).optional(),
    node: z.object({
      id: z.string(),
      type: z.string(),
      variant: z.string(),
      visible: z.boolean().optional(),
      content: z.record(z.unknown()).optional(),
      design: z.record(z.unknown()).optional(),
      responsive: z.record(z.unknown()).optional(),
      dataBindings: z.record(z.unknown()).optional(),
    }),
  }),
  z.object({
    op: z.literal('update'),
    id: z.string(),
    patch: z.record(z.unknown()),
  }),
  z.object({
    op: z.literal('move'),
    id: z.string(),
    afterId: z.string().nullable().optional(),
  }),
  z.object({
    op: z.literal('delete'),
    id: z.string(),
  }),
  z.object({
    op: z.literal('replace'),
    id: z.string(),
    node: z.object({
      id: z.string(),
      type: z.string(),
      variant: z.string(),
      visible: z.boolean().optional(),
      content: z.record(z.unknown()).optional(),
      design: z.record(z.unknown()).optional(),
      responsive: z.record(z.unknown()).optional(),
      dataBindings: z.record(z.unknown()).optional(),
    }),
  }),
  z.object({
    op: z.literal('style'),
    id: z.string(),
    design: z.object({
      spacing: z.enum(['compact', 'cozy', 'airy', 'dramatic']).optional(),
      minHeight: z.enum(['auto', '60vh', '80vh', '100vh']).optional(),
      fullBleed: z.boolean().optional(),
    }),
  }),
])

const siteOpsResponseSchema = z.object({
  ops: z.array(siteOpSchema).max(12).default([]),
  rejected: z.array(z.object({
    reason: z.string(),
    recommendation: z.unknown().optional(),
  })).default([]),
})

function registryCatalogPrompt(): string {
  return Object.entries(COMPOSITION_VARIANTS)
    .map(([type, variants]) => `- ${type}: ${(variants as readonly string[]).join(' | ')}`)
    .join('\n')
}

function isValidComposition(type: string, variant: string): boolean {
  const allowed = COMPOSITION_VARIANTS[type as keyof typeof COMPOSITION_VARIANTS]
  if (!allowed) return false
  return (allowed as readonly string[]).includes(variant)
}

/** Same guard as siteOps.ts's applySiteOps, for the critique loop's independent SiteOps
 *  application path — a hallucinated content.layout or a cross-type mobile variant must
 *  not reach the live document from here either. */
function checkLayoutAndMobileVariant(
  type: string,
  variant: string,
  content?: Record<string, unknown>,
  responsive?: Record<string, unknown>
) {
  const layout = content?.layout
  if (!isValidLayout(type, variant, layout)) {
    throw new Error(`invalid content.layout ${JSON.stringify(layout)} for ${type}/${variant}`)
  }
  const mobileVariant = (responsive as { mobile?: { variant?: unknown } } | undefined)?.mobile?.variant
  if (mobileVariant !== undefined && !isValidComposition(type, mobileVariant as string)) {
    throw new Error(`invalid responsive.mobile.variant ${JSON.stringify(mobileVariant)} for type ${type}`)
  }
}

function validateOpsAgainstTree(
  document: { pages: { home: { nodes: Array<{ id: string; type: string; variant: string; content?: Record<string, unknown> }> } } },
  ops: z.infer<typeof siteOpSchema>[]
): { ops: z.infer<typeof siteOpSchema>[]; rejected: Array<{ reason: string; op: unknown }> } {
  const ids = new Set(document.pages.home.nodes.map((n) => n.id))
  const valid: z.infer<typeof siteOpSchema>[] = []
  const rejected: Array<{ reason: string; op: unknown }> = []

  for (const op of ops) {
    try {
      if (op.op === 'insert') {
        if (ids.has(op.node.id)) throw new Error(`duplicate id ${op.node.id}`)
        if (!isValidComposition(op.node.type, op.node.variant)) {
          throw new Error(`invalid composition ${op.node.type}/${op.node.variant}`)
        }
        checkLayoutAndMobileVariant(op.node.type, op.node.variant, op.node.content, op.node.responsive)
        if (op.afterId && !ids.has(op.afterId)) throw new Error(`afterId missing ${op.afterId}`)
        ids.add(op.node.id)
        valid.push(op)
        continue
      }
      if (!ids.has(op.id)) throw new Error(`unknown node ${op.id}`)
      if (op.op === 'delete') {
        const n = document.pages.home.nodes.find((x) => x.id === op.id)
        if (n && (n.type === 'nav' || n.type === 'footer' || n.type === 'hero')) {
          throw new Error(`cannot delete required ${n.type}`)
        }
      }
      if (op.op === 'replace' || op.op === 'insert') {
        /* handled */
      }
      if (op.op === 'replace') {
        if (!isValidComposition(op.node.type, op.node.variant)) {
          throw new Error(`invalid composition ${op.node.type}/${op.node.variant}`)
        }
        checkLayoutAndMobileVariant(op.node.type, op.node.variant, op.node.content, op.node.responsive)
      }
      if (op.op === 'update') {
        const n = document.pages.home.nodes.find((x) => x.id === op.id)
        if (n?.content?.copyType === 'merchant' && op.patch.content) {
          throw new Error('refusing merchant content rewrite')
        }
        if (typeof op.patch.variant === 'string' && n) {
          const type = typeof op.patch.type === 'string' ? op.patch.type : n.type
          if (!isValidComposition(type, op.patch.variant)) {
            throw new Error(`invalid variant ${type}/${op.patch.variant}`)
          }
        }
        if (n) {
          const type = typeof op.patch.type === 'string' ? op.patch.type : n.type
          const variant = typeof op.patch.variant === 'string' ? op.patch.variant : n.variant
          const patchContent =
            op.patch.content && typeof op.patch.content === 'object'
              ? (op.patch.content as Record<string, unknown>)
              : undefined
          const patchResponsive =
            op.patch.responsive && typeof op.patch.responsive === 'object'
              ? (op.patch.responsive as Record<string, unknown>)
              : undefined
          if (patchContent && 'layout' in patchContent) {
            checkLayoutAndMobileVariant(type, variant, patchContent, undefined)
          }
          if (patchResponsive) {
            checkLayoutAndMobileVariant(type, variant, undefined, patchResponsive)
          }
        }
      }
      if (op.op === 'move' && op.afterId && !ids.has(op.afterId)) {
        throw new Error(`afterId missing ${op.afterId}`)
      }
      valid.push(op)
    } catch (err) {
      rejected.push({ reason: err instanceof Error ? err.message : String(err), op })
    }
  }
  return { ops: valid, rejected }
}

export type CritiqueCycleMeta = {
  cycle: number
  model: string
  promptTokens: number
  completionTokens: number
  costUsd: number
  latencyMs: number
  decision: string
  overall: number
  distinctiveness: number
  opsApplied: number
  beforeScore?: number
  afterScore?: number
  beforeDistinctiveness?: number
  afterDistinctiveness?: number
  distinctivenessGuardRejected?: boolean
}

function packTask(usage: LlmUsage, latencyMs: number, extra: Partial<CritiqueCycleMeta> = {}): CritiqueCycleMeta {
  return {
    cycle: extra.cycle ?? 1,
    model: usage.model,
    promptTokens: usage.prompt,
    completionTokens: usage.completion,
    costUsd: usage.cost,
    latencyMs,
    decision: extra.decision ?? 'refine',
    overall: extra.overall ?? 0,
    distinctiveness: extra.distinctiveness ?? 0,
    opsApplied: extra.opsApplied ?? 0,
    ...extra,
  }
}

function validateScreenshotPayloads(
  shots: Array<{
    viewport: string
    mimeType: string
    base64: string
    widthPx?: number
    heightPx?: number
    blankSuspect?: boolean
  }>
): ScreenshotMeta[] {
  const metas: ScreenshotMeta[] = []
  const viewports = new Set(shots.map((s) => s.viewport))
  if (!viewports.has('desktop') || !viewports.has('mobile')) {
    console.warn('[ai-studio-v2-critique] expected both desktop and mobile screenshots', [...viewports])
  }
  for (const s of shots) {
    const mimeType = s.mimeType || 'image/jpeg'
    if (!mimeType.startsWith('image/')) {
      throw new Error(`Invalid screenshot mimeType for ${s.viewport}: ${mimeType}`)
    }
    if (!s.base64 || s.base64.length < 800) {
      throw new Error(`Screenshot ${s.viewport} empty or too small (${s.base64?.length ?? 0} base64 chars)`)
    }
    const approxBytes = Math.floor((s.base64.length * 3) / 4)
    if (approxBytes < 2_000) {
      throw new Error(`Screenshot ${s.viewport} decoded payload too small (~${approxBytes}B)`)
    }
    if (s.blankSuspect) {
      throw new Error(`Screenshot ${s.viewport} flagged blankSuspect — refusing critic call`)
    }
    const meta: ScreenshotMeta = {
      viewport: s.viewport,
      mimeType,
      widthPx: s.widthPx,
      heightPx: s.heightPx,
      base64Chars: s.base64.length,
      approxBytes,
      blankSuspect: Boolean(s.blankSuspect),
    }
    console.info('[ai-studio-v2-critique] screenshot meta', {
      viewport: meta.viewport,
      dimensions:
        meta.widthPx && meta.heightPx ? `${meta.widthPx}×${meta.heightPx}` : 'client-unknown',
      approxBytes: meta.approxBytes,
      base64Chars: meta.base64Chars,
      mimeType: meta.mimeType,
    })
    metas.push(meta)
  }
  return metas
}

/** Soft-fill fields models often omit so Zod + calibration can run */
function normalizeCritiqueJson(raw: unknown): unknown {
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const scorecardRaw =
    root.scorecard && typeof root.scorecard === 'object'
      ? (root.scorecard as Record<string, unknown>)
      : root
  const scorecard = { ...scorecardRaw }

  for (const key of CRITIQUE_DIMENSION_KEYS) {
    const dim = scorecard[key]
    if (!dim || typeof dim !== 'object') continue
    const d = { ...(dim as Record<string, unknown>) }
    if (!Array.isArray(d.observations) || d.observations.length === 0) {
      d.observations = ['(model omitted observations)']
    }
    if (!Array.isArray(d.evidence)) d.evidence = []
    if (!Array.isArray(d.issues)) d.issues = []
    if (!Array.isArray(d.recommendations)) d.recommendations = []
    scorecard[key] = d
  }
  if (!scorecard.renderIntentMismatch || typeof scorecard.renderIntentMismatch !== 'object') {
    scorecard.renderIntentMismatch = { mismatches: [] }
  }
  if (!scorecard.renderVerification || typeof scorecard.renderVerification !== 'object') {
    scorecard.renderVerification = {
      nodes: [],
      summary: '(model omitted renderVerification)',
    }
  } else {
    const rv = { ...(scorecard.renderVerification as Record<string, unknown>) }
    if (!Array.isArray(rv.nodes)) rv.nodes = []
    if (typeof rv.summary !== 'string' || !rv.summary.trim()) {
      rv.summary = '(model omitted renderVerification summary)'
    }
    scorecard.renderVerification = rv
  }
  if (!Array.isArray(scorecard.rhythmNotes)) scorecard.rhythmNotes = []
  if (!Array.isArray(scorecard.genericnessNotes)) scorecard.genericnessNotes = []
  if (
    scorecard.decision !== 'pass' &&
    scorecard.decision !== 'refine' &&
    scorecard.decision !== 'limited_by_registry'
  ) {
    scorecard.decision = 'refine'
  }
  if (typeof scorecard.decisionReason !== 'string' || scorecard.decisionReason.length < 20) {
    scorecard.decisionReason =
      (typeof scorecard.decisionReason === 'string' ? scorecard.decisionReason : '') +
      ' Further refinement may still improve execution fidelity against the DesignSpec.'
  }

  const recommendations = Array.isArray(root.recommendations)
    ? root.recommendations.map((raw) => {
        if (!raw || typeof raw !== 'object') return raw
        const r = { ...(raw as Record<string, unknown>) }
        if (typeof r.problem !== 'string' || !r.problem.trim()) {
          r.problem = typeof r.reason === 'string' ? r.reason : 'Visual issue observed'
        }
        if (typeof r.desiredOutcome !== 'string' || !r.desiredOutcome.trim()) {
          r.desiredOutcome = 'Improve visual execution for this node'
        }
        if (typeof r.actionable !== 'boolean') {
          r.actionable = Boolean(r.property) && r.suggestedValue !== undefined
        }
        return r
      })
    : []

  return { scorecard, recommendations }
}

export async function runVisualCritiqueCycle(opts: {
  designSpec: unknown
  document: {
    version: number
    siteId: string
    designSystemId: string
    pages: { home: { nodes: Array<{ id: string; type: string; variant: string; content?: Record<string, unknown> }> } }
    meta?: unknown
  }
  brandSystem: unknown
  screenshots: Array<{
    viewport: string
    mimeType: string
    base64: string
    widthPx?: number
    heightPx?: number
    blankSuspect?: boolean
  }>
  cycle: number
  previousScorecard?: CritiqueScoreCard | null
  send: (event: string, data: unknown) => void
  admin: ReturnType<typeof import('./aiStudio.ts').createAdmin>
  userId: string
  conversationId?: string
}) {
  const { designSpec, document, brandSystem, screenshots, cycle, previousScorecard, send, admin, userId, conversationId } = opts

  if (!screenshots.length) throw new Error('At least one screenshot is required')
  const screenshotMetas = validateScreenshotPayloads(screenshots)

  send('status', {
    step: 'critiquing',
    message: 'Evaluating the rendered storefront…',
    cycle,
    screenshotMetas,
  })

  const started = Date.now()
  const designSummary = {
    archetype: (designSpec as { artDirection?: { archetype?: string } })?.artDirection?.archetype,
    density: (designSpec as { artDirection?: { density?: string } })?.artDirection?.density,
    designIntent: (designSpec as { designIntent?: unknown })?.designIntent,
    productPresentation: (designSpec as { productPresentation?: string })?.productPresentation,
    brand: (designSpec as { brand?: unknown })?.brand,
  }

  const expectedRenderManifest = buildExpectedRenderManifest(document)
  const nodeSummary = document.pages.home.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    variant: n.variant,
    copyType: n.content?.copyType,
    spacing: (n as { design?: { spacing?: string } }).design?.spacing,
    presentation: n.content?.presentation,
  }))

  const vision = await chatVisionJsonForTask('visual_critique', {
    system: getVisualCriticSystemPrompt(),
    userText: [
      'STAGE 1: Verify expectedRenderManifest against the screenshots (desktop + mobile).',
      'STAGE 2: Critique design quality only after render verification.',
      'STAGE 3: Propose actionable recommendations only when SiteOps can express the fix.',
      'PIXELS are the source of truth. DesignSpec is intent only — never override what you see.',
      'Do NOT invent DEV fault IDs, injected CSS, or fixture answers.',
      '',
      `Cycle: ${cycle}`,
      `Viewports attached: ${screenshots.map((s) => s.viewport).join(', ')}`,
      `Screenshot metadata (no image bytes): ${JSON.stringify(screenshotMetas)}`,
      '',
      `DesignSpec summary:\n${JSON.stringify(designSummary, null, 2)}`,
      '',
      `expectedRenderManifest:\n${JSON.stringify(expectedRenderManifest, null, 2)}`,
      '',
      `Brand system:\n${JSON.stringify(brandSystem, null, 2)}`,
    ].join('\n'),
    images: screenshots.map((s) => ({
      mimeType: s.mimeType || 'image/jpeg',
      base64: s.base64,
      label: s.viewport,
    })),
    temperature: 0.25,
    maxTokens: 6000,
  })

  const critiqueLatency = Date.now() - started
  const normalized = normalizeCritiqueJson(vision.json)
  let critiqueParsed = visualCritiqueOutputSchema.safeParse(normalized)
  if (!critiqueParsed.success) {
    throw new Error(`Critic output invalid: ${critiqueParsed.error.issues[0]?.message}`)
  }

  let { scorecard, recommendations } = critiqueParsed.data
  const guarded = applyCritiqueCalibrationGuards(
    scorecard as CritiqueScoreCard,
    recommendations
  )
  scorecard = guarded.scorecard
  recommendations = guarded.recommendations
  const calibrationNotes = guarded.calibrationNotes

  if (calibrationNotes.length) {
    console.info('[ai-studio-v2-critique] calibration guards', calibrationNotes)
  }

  const decisionMessage =
    scorecard.decision === 'pass'
      ? 'Visual critic: pass — no further changes needed.'
      : scorecard.decision === 'limited_by_registry'
        ? 'Visual critic: limited_by_registry — stopping (no safe SiteOps vocabulary).'
        : `Visual critic: refine (overall ${scorecard.overall.score}/10).`

  send('status', {
    step: 'critiquing',
    message: decisionMessage,
    scorecard,
    calibrationNotes,
    screenshotMetas,
    expectedRenderManifest,
    cycle,
  })

  const cycleMetas: CritiqueCycleMeta[] = [
    packTask(vision.usage, critiqueLatency, {
      cycle,
      decision: scorecard.decision,
      overall: scorecard.overall.score,
      distinctiveness: scorecard.distinctiveness.score,
      opsApplied: 0,
      beforeScore: previousScorecard?.overall.score,
      beforeDistinctiveness: previousScorecard?.distinctiveness.score,
    }),
  ]

  let ops: z.infer<typeof siteOpSchema>[] = []
  let rejected: Array<{ reason: string; op?: unknown }> = []

  const actionableRecs = getActionableRecommendations(recommendations)
  const limitedByRegistry = scorecard.decision === 'limited_by_registry'
  const passOrThreshold =
    scorecard.decision === 'pass' ||
    meetsCritiqueStopThreshold(scorecard as CritiqueScoreCard)

  // Only map SiteOps when refine + actionable recommendations exist
  if (!passOrThreshold && !limitedByRegistry && actionableRecs.length > 0) {
    send('status', { step: 'refining', message: 'Mapping critique to targeted SiteOps…', cycle })
    const opsStarted = Date.now()
    const opsResult = await chatJsonForTask('site_ops', {
      system: getSiteOpsFromCritiqueSystemPrompt(registryCatalogPrompt()),
      user: JSON.stringify({
        recommendations: actionableRecs,
        nodes: nodeSummary,
        expectedRenderManifest,
        designIntent: designSummary.designIntent,
        scorecard: {
          decision: scorecard.decision,
          criticalIssues: scorecard.criticalIssues,
          priorityFixes: scorecard.priorityFixes,
          renderVerification: scorecard.renderVerification,
        },
      }),
      temperature: 0.2,
      maxTokens: 3000,
    })
    const opsLatency = Date.now() - opsStarted
    const opsParsed = siteOpsResponseSchema.safeParse(opsResult.json)
    if (opsParsed.success) {
      const validated = validateOpsAgainstTree(document, opsParsed.data.ops)
      ops = validated.ops
      rejected = [...opsParsed.data.rejected, ...validated.rejected]
    } else {
      rejected.push({ reason: `SiteOps JSON invalid: ${opsParsed.error.issues[0]?.message}` })
    }

    cycleMetas.push(
      packTask(opsResult.usage, opsLatency, {
        cycle,
        decision: scorecard.decision,
        overall: scorecard.overall.score,
        distinctiveness: scorecard.distinctiveness.score,
        opsApplied: ops.length,
      })
    )
  }

  // Distinctiveness guard vs previous cycle is enforced on the client after apply.
  const distinctivenessGuardRejected = false

  // Mandatory stop: pass / threshold / limited_by_registry / zero validated ops
  let stop = passOrThreshold || limitedByRegistry
  let stopReason: string
  if (scorecard.decision === 'pass') {
    stopReason = 'critic_pass'
    stop = true
  } else if (limitedByRegistry) {
    stopReason = 'limited_by_registry'
    stop = true
  } else if (passOrThreshold) {
    stopReason = 'threshold_met'
    stop = true
  } else if (ops.length === 0) {
    stopReason = 'no_safe_ops'
    stop = true
  } else {
    stopReason = 'continue'
    stop = false
  }

  send('status', {
    step: 'verifying',
    message: stop
      ? stopReason === 'no_safe_ops'
        ? 'No safe SiteOps — stopping (will not re-critique unchanged render).'
        : stopReason === 'limited_by_registry'
          ? 'Limited by registry — stopping without inventing SiteOps.'
          : 'Refinement complete for this cycle.'
      : `Applying ${ops.length} targeted SiteOps…`,
    cycle,
    stop,
    stopReason,
  })

  // Persist metadata only (no screenshots) on conversation message
  const storefront = await ensureStorefront(admin, userId)
  const conversation = await ensureConversation(admin, userId, storefront.id, conversationId)

  const usageTotal = cycleMetas.reduce(
    (acc, m) => ({
      prompt: acc.prompt + m.promptTokens,
      completion: acc.completion + m.completionTokens,
      cost: acc.cost + m.costUsd,
      model: acc.model ? `${acc.model} → ${m.model}` : m.model,
    }),
    { prompt: 0, completion: 0, cost: 0, model: '' }
  )

  await insertMessage(admin, {
    conversation_id: conversation.id,
    user_id: userId,
    role: 'assistant',
    content:
      scorecard.decision === 'pass'
        ? `Visual critic: pass (overall ${scorecard.overall.score}, distinctiveness ${scorecard.distinctiveness.score}).`
        : scorecard.decision === 'limited_by_registry'
          ? `Visual critic cycle ${cycle}: limited_by_registry (overall ${scorecard.overall.score}/10) — stopped.`
          : `Visual critic cycle ${cycle}: overall ${scorecard.overall.score}/10, ${ops.length} SiteOps proposed.`,
    brief_json: {
      engine: 'v2',
      phase: 4,
      calibration: true,
      cycle,
      scorecard,
      recommendations,
      ops,
      rejected,
      cycleMetas,
      calibrationNotes,
      screenshotMetas,
      expectedRenderManifest,
      stop,
      stopReason,
      // no raw screenshot bytes
    },
    spec_json: designSpec,
    model: usageTotal.model,
    prompt_tokens: usageTotal.prompt,
    completion_tokens: usageTotal.completion,
    estimated_cost_usd: usageTotal.cost,
    kind: 'refine',
    quality: 'studio',
    status: 'ok',
  })

  // Persist draft only when client confirms apply — edge returns ops; client applies + saves.
  // Optional: if client sent apply:true we could save — keep apply on client for safety.

  send('ready', {
    step: 'ready',
    cycle,
    scorecard,
    recommendations,
    ops,
    rejected,
    stop,
    stopReason,
    stopThreshold: CRITIQUE_STOP_THRESHOLD,
    cycleMetas,
    calibrationNotes,
    screenshotMetas,
    expectedRenderManifest,
    conversationId: conversation.id,
    llm: usageTotal.model,
    costUsd: usageTotal.cost,
    latencyMs: cycleMetas.reduce((s, m) => s + m.latencyMs, 0),
    distinctivenessGuardRejected,
  })

  return {
    scorecard: scorecard as CritiqueScoreCard,
    ops,
    stop,
    stopReason,
  }
}

export {
  critiqueScoreCardSchema,
  meetsCritiqueStopThreshold,
  applyCritiqueCalibrationGuards,
  CRITIQUE_STOP_THRESHOLD,
}
