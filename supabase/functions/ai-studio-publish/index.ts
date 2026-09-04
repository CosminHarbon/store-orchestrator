import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  AuthError,
  coerceSpec,
  corsHeaders,
  createAdmin,
  ensureConversation,
  ensureStorefront,
  insertMessage,
  json,
  requireUser,
  specToBlocks,
  specToCustomization,
} from '../_shared/aiStudio.ts'
import {
  isEntitlementRequiredError,
  requireSpeedVendorsEntitlement,
} from '../_shared/billingEntitlement.ts'
import {
  brandDesignSystemFromSpec,
  designSpecSchema,
  siteDocumentSchema,
} from '../_shared/aiStudioV2.ts'
import {
  mergeAiTemplateCustomization,
  resolvePublishEngine,
  storeNameForPublish,
  type V2CustomizationPatch,
} from '../../../shared/ai-studio-v2/publishPath.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const admin = createAdmin()
  try {
    const user = await requireUser(req, admin)
    await requireSpeedVendorsEntitlement(admin, user.id)
    const storefront = await ensureStorefront(admin, user.id)

    const resolution = resolvePublishEngine({
      schema_version: storefront.schema_version,
      draft_spec: storefront.draft_spec,
      draft_document: storefront.draft_document,
    })
    if (!resolution.ok) {
      return json({ error: resolution.error, code: resolution.code }, 400)
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('store_api_key, store_name')
      .eq('user_id', user.id)
      .maybeSingle()

    const origin = req.headers.get('origin') || 'https://www.speedvendors.com'
    const liveUrl = `${origin}/templates/ai?api_key=${profile?.store_api_key || ''}`
    const version = Number(storefront.version || 1) + 1

    // ── V2: draft_document → published_document ─────────────────────────────
    if (resolution.engine === 'v2') {
      // Validate fully before any DB mutation.
      const docParsed = siteDocumentSchema.safeParse(storefront.draft_document)
      if (!docParsed.success) {
        return json(
          {
            error: 'V2 draft_document failed schema validation',
            code: 'v2_draft_invalid',
            details: docParsed.error.issues.slice(0, 8).map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
          400,
        )
      }

      const designParsed = designSpecSchema.safeParse(storefront.design_spec)
      let brandSystem = storefront.brand_design_system
      let designSpecToPersist = storefront.design_spec
      if (designParsed.success) {
        designSpecToPersist = designParsed.data
        brandSystem = brandDesignSystemFromSpec(designParsed.data)
      } else if (storefront.brand_design_system == null) {
        return json(
          {
            error: 'V2 publish requires a valid design_spec or brand_design_system',
            code: 'v2_draft_invalid',
          },
          400,
        )
      }

      const storeName = storeNameForPublish({
        engine: 'v2',
        designSpec: designParsed.success ? designParsed.data : null,
        document: docParsed.data,
        fallback: profile?.store_name || 'Store',
      })

      const tokens =
        (brandSystem as { tokens?: Record<string, string> } | null)?.tokens || {}
      const patch: V2CustomizationPatch = {
        user_id: user.id,
        template_id: 'ai',
        store_name: storeName,
        primary_color: tokens.primary || undefined,
        background_color: tokens.background || undefined,
        text_color: tokens.text || undefined,
        accent_color: tokens.accent || undefined,
        secondary_color: tokens.secondary || undefined,
        heading_font: tokens.headingFont || undefined,
        font_family: tokens.bodyFont || undefined,
      }

      const { data: existingCustomization } = await admin
        .from('template_customization')
        .select('*')
        .eq('user_id', user.id)
        .eq('template_id', 'ai')
        .maybeSingle()

      const customization = mergeAiTemplateCustomization(
        existingCustomization as Record<string, unknown> | null,
        patch,
      )

      // Snapshot publish first — failed write leaves previous published_* untouched.
      // Ownership filter is defense-in-depth beyond ensureStorefront(user).
      const { data: updatedStorefront, error: updateError } = await admin
        .from('ai_storefronts')
        .update({
          schema_version: 2,
          published_document: docParsed.data,
          design_spec: designSpecToPersist,
          brand_design_system: brandSystem,
          draft_customization: customization,
          active: true,
          status: 'ready',
          version,
          published_at: new Date().toISOString(),
        })
        .eq('id', storefront.id)
        .eq('user_id', user.id)
        .select('id')
        .maybeSingle()
      if (updateError) throw updateError
      if (!updatedStorefront) {
        return json({ error: 'Storefront not found or not owned by user' }, 403)
      }

      const { error: customError } = await admin.from('template_customization').upsert(customization, {
        onConflict: 'user_id,template_id',
      })
      if (customError) throw customError

      await admin
        .from('profiles')
        .update({
          active_template: 'ai',
          store_name: storeName,
        })
        .eq('user_id', user.id)

      const conversation = await ensureConversation(admin, user.id, storefront.id)
      await insertMessage(admin, {
        conversation_id: conversation.id,
        user_id: user.id,
        role: 'assistant',
        content: 'Published V2 storefront to your account.',
        spec_json: null,
        brief_json: { engine: 'v2', schema_version: 2 },
        kind: 'publish',
      })

      console.log('[ai-studio-publish] V2 draft_document → published_document', {
        userId: user.id,
        siteId: docParsed.data.siteId,
        version,
      })

      return json({ ok: true, version, liveUrl, engine: 'v2', schema_version: 2 })
    }

    // ── V1: draft_spec → published_spec (unchanged behavior) ────────────────
    if (!storefront.draft_spec) return json({ error: 'Nothing to publish yet' }, 400)

    const spec = coerceSpec(storefront.draft_spec, storefront.draft_spec)
    console.log('[ai-studio-publish] draft → published', {
      userId: user.id,
      layoutId: spec.layoutId,
      faq: spec.copy?.faq,
      primary: spec.tokens?.primary,
      heroTitle: spec.copy?.heroTitle,
    })
    const customization = specToCustomization(spec, user.id)
    const blocks = specToBlocks(spec, user.id)

    const { error: customError } = await admin.from('template_customization').upsert(customization, {
      onConflict: 'user_id,template_id',
    })
    if (customError) throw customError

    await admin.from('template_blocks').delete().eq('user_id', user.id).eq('template_id', 'ai')
    if (blocks.length) {
      const { error: blockError } = await admin.from('template_blocks').insert(blocks)
      if (blockError) throw blockError
    }

    const { data: updatedStorefront, error: updateError } = await admin
      .from('ai_storefronts')
      .update({
        published_spec: spec,
        draft_customization: customization,
        active: true,
        status: 'ready',
        version,
        published_at: new Date().toISOString(),
      })
      .eq('id', storefront.id)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle()
    if (updateError) throw updateError
    if (!updatedStorefront) {
      return json({ error: 'Storefront not found or not owned by user' }, 403)
    }

    await admin
      .from('profiles')
      .update({
        active_template: 'ai',
        store_name: storeNameForPublish({
          engine: 'v1',
          v1Spec: spec,
          fallback: profile?.store_name || 'Store',
        }),
      })
      .eq('user_id', user.id)

    const conversation = await ensureConversation(admin, user.id, storefront.id)
    await insertMessage(admin, {
      conversation_id: conversation.id,
      user_id: user.id,
      role: 'assistant',
      content: 'Published to your account.',
      spec_json: spec,
      kind: 'publish',
    })

    return json({ ok: true, version, liveUrl, engine: 'v1', schema_version: 1 })
  } catch (err) {
    if (err instanceof AuthError) return json({ error: err.message }, 401)
    if (isEntitlementRequiredError(err)) return json({ error: 'entitlement_required' }, 403)
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
