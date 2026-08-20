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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const admin = createAdmin()
  try {
    const user = await requireUser(req, admin)
    const storefront = await ensureStorefront(admin, user.id)
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

    const version = Number(storefront.version || 1) + 1
    await admin.from('ai_storefronts').update({
      published_spec: spec,
      draft_customization: customization,
      active: true,
      status: 'ready',
      version,
      published_at: new Date().toISOString(),
    }).eq('id', storefront.id)

    await admin.from('profiles').update({
      active_template: 'ai',
      store_name: spec.copy.storeName,
    }).eq('user_id', user.id)

    const conversation = await ensureConversation(admin, user.id, storefront.id)
    await insertMessage(admin, {
      conversation_id: conversation.id,
      user_id: user.id,
      role: 'assistant',
      content: 'Published to your account.',
      spec_json: spec,
      kind: 'publish',
    })

    const { data: profile } = await admin.from('profiles').select('store_api_key').eq('user_id', user.id).maybeSingle()
    const origin = req.headers.get('origin') || 'https://www.speedvendors.com'
    const liveUrl = `${origin}/templates/ai?api_key=${profile?.store_api_key || ''}`

    return json({ ok: true, version, liveUrl })
  } catch (err) {
    if (err instanceof AuthError) return json({ error: err.message }, 401)
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
