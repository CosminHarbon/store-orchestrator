import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  AuthError,
  DESIGN_REFINE_LIMIT,
  REFINE_LIMIT,
  applyPatches,
  chatJson,
  classifyRefineIntent,
  coerceSpec,
  corsHeaders,
  countToday,
  createAdmin,
  designLlmConfigured,
  ensureConversation,
  ensureStorefront,
  faqItemsFromPrompt,
  insertMessage,
  json,
  layoutLabel,
  llmConfigured,
  requireUser,
  sanitizeRefinePatches,
  specFromBrief,
  specToCustomization,
  sseResponse,
  syncCopyIntoSections,
  variantSummary,
  verifySpec,
} from '../_shared/aiStudio.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const admin = createAdmin()
  try {
    const user = await requireUser(req, admin)
    const body = await req.json()
    const prompt = String(body.prompt || '').trim()
    if (!prompt) return json({ error: 'Prompt required' }, 400)

    const intent = classifyRefineIntent(prompt)
    const used = await countToday(admin, user.id, 'refine')
    if (used >= REFINE_LIMIT) return json({ error: `Daily refine limit reached (${REFINE_LIMIT}).` }, 429)
    if (intent === 'design') {
      const designUsed = await countToday(admin, user.id, 'refine-design')
      if (designUsed >= DESIGN_REFINE_LIMIT) {
        return json({ error: `Daily design-refine limit reached (${DESIGN_REFINE_LIMIT}). Try a simpler copy/color tweak.` }, 429)
      }
    }

    const storefront = await ensureStorefront(admin, user.id)
    if (!storefront.draft_spec) return json({ error: 'Generate a store first' }, 400)

    const { data: origin } = await admin
      .from('ai_messages')
      .select('content')
      .eq('user_id', user.id)
      .eq('kind', 'generate')
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return sseResponse(async (send) => {
      send('status', { step: 'understanding' })
      const current = coerceSpec(storefront.draft_spec, specFromBrief({
        niche: 'floral',
        mood: 'airy elegant',
        language: 'en',
        layoutId: 'atelier',
        friendReply: 'Rebuilding.',
      }))

      let spec = current
      let reply = ''
      let usage = { model: 'heuristic', prompt: 0, completion: 0, cost: 0 }
      let patches: unknown[] = []
      let llmError: string | undefined
      let changed = false
      const mode = intent === 'design' && designLlmConfigured() ? 'design' : intent === 'design' ? 'studio' : 'micro'

      send('status', { step: 'designing' })

      if (llmConfigured()) {
        try {
          send('status', { step: 'building' })
          const result = await chatJson({
            mode: mode as 'design' | 'micro' | 'studio',
            system: `You refine a premium storefront without freeform HTML.
Reply JSON only:
{"friendReply":"what changed","patches":[{"op":"replace","path":"/copy/faq","value":[{"q":"...","a":"..."}]}]}
Allowed paths: /tokens/*, /copy/*, /layoutId, /density, /nav, /nav/*, /productCard, /productCard/*, /hero, /hero/*, /customCss, /pages/home/sections
For FAQ replace whole /copy/faq array with q+a items.
For redesign, change layoutId and/or nav/productCard/hero variants.
Never invent HTML. Never set documentHtml. If nothing can change, return patches: [].`,
            user: JSON.stringify({
              prompt,
              intent,
              originalRequest: origin?.content || null,
              layoutId: current.layoutId,
              density: current.density,
              nav: current.nav,
              productCard: current.productCard,
              hero: current.hero,
              tokens: current.tokens,
              copy: current.copy,
              sectionTypes: current.pages.home.sections.map((s) => s.type),
              niche: current.niche,
              mood: current.mood,
            }),
            temperature: intent === 'design' ? 0.45 : 0.3,
            maxTokens: intent === 'design' ? 2200 : 900,
          })
          const data = result.json as { friendReply?: string; patches?: unknown[] }
          if (data.friendReply) reply = data.friendReply
          const sanitized = sanitizeRefinePatches(Array.isArray(data.patches) ? data.patches : [])
          if (sanitized.length > 0) {
            patches = sanitized
            spec = applyPatches(current, sanitized)
            changed =
              JSON.stringify(spec.copy) !== JSON.stringify(current.copy) ||
              JSON.stringify(spec.tokens) !== JSON.stringify(current.tokens) ||
              JSON.stringify(spec.nav) !== JSON.stringify(current.nav) ||
              JSON.stringify(spec.productCard) !== JSON.stringify(current.productCard) ||
              JSON.stringify(spec.hero) !== JSON.stringify(current.hero) ||
              spec.layoutId !== current.layoutId ||
              spec.density !== current.density ||
              JSON.stringify(spec.pages.home.sections.map((s) => s.type)) !==
                JSON.stringify(current.pages.home.sections.map((s) => s.type))
          }
          usage = result.usage
        } catch (err) {
          llmError = err instanceof Error ? err.message : String(err)
          console.error('ai-studio-refine LLM failed', llmError)
        }
      } else {
        llmError = 'No LLM API key configured.'
      }

      if (!changed) {
        const localFaq = faqItemsFromPrompt(prompt, current.language)
        if (localFaq) {
          spec = applyPatches(current, [{ op: 'replace', path: '/copy/faq', value: localFaq }])
          patches = [{ op: 'replace', path: '/copy/faq', value: localFaq }]
          changed = JSON.stringify(spec.copy.faq) !== JSON.stringify(current.copy.faq)
          if (changed) {
            reply = current.language === 'ro' ? 'Am actualizat FAQ-ul cu întrebările tale.' : 'Updated the FAQ with your questions.'
          }
        }
      }

      if (!changed) {
        // Color hex heuristic
        const hex = prompt.match(/#([0-9a-fA-F]{6})/)
        if (hex) {
          const path = /background|bg|fundal/i.test(prompt) ? '/tokens/background' : '/tokens/primary'
          spec = applyPatches(current, [{ op: 'replace', path, value: `#${hex[1].toUpperCase()}` }])
          patches = [{ op: 'replace', path, value: `#${hex[1].toUpperCase()}` }]
          changed = true
          reply = current.language === 'ro' ? `Am actualizat culoarea ${path}.` : `Updated ${path}.`
        }
      }

      if (!changed) {
        spec = current
        reply = spec.language === 'ro'
          ? (llmError
            ? `Nu am putut aplica modificarea: ${llmError}`
            : 'Nu am aplicat nicio schimbare vizibilă. Spune clar ce vrei: FAQ, culoare, nav, carduri, hero sau redesign.')
          : (llmError
            ? `Could not apply the change: ${llmError}`
            : 'Nothing visible was applied. Be specific: FAQ, color, nav, cards, hero, or redesign.')
      } else {
        send('status', { step: 'verifying' })
        spec = syncCopyIntoSections(spec)
        const errors = verifySpec(spec)
        if (errors.length) {
          console.warn('refine verify warnings', errors)
        }
        if (spec.layoutId !== current.layoutId) {
          const note = spec.language === 'ro'
            ? ` Folosesc layout-ul ${layoutLabel(spec.layoutId, 'ro')}.`
            : ` Using ${layoutLabel(spec.layoutId, 'en')} layout.`
          if (!reply.includes(note.trim())) reply = `${reply}${note}`
        }
        if (!reply) reply = spec.language === 'ro' ? 'Am actualizat designul.' : 'Updated the design.'
        reply = `${reply} ${variantSummary(spec, spec.language)}.`
      }

      send('status', { step: 'building', message: reply, spec })

      const conversation = await ensureConversation(admin, user.id, storefront.id, body.conversationId)
      const customization = specToCustomization(spec, user.id)
      const { error: persistError } = await admin.from('ai_storefronts').update({
        draft_spec: spec,
        draft_customization: customization,
        status: 'ready',
      }).eq('id', storefront.id)
      if (persistError) {
        send('error', { step: 'error', error: `Failed to save draft: ${persistError.message}` })
        return
      }

      await insertMessage(admin, {
        conversation_id: conversation.id,
        user_id: user.id,
        role: 'user',
        content: prompt,
        kind: intent === 'design' ? 'refine-design' : 'refine',
      })
      await insertMessage(admin, {
        conversation_id: conversation.id,
        user_id: user.id,
        role: 'assistant',
        content: reply,
        spec_json: spec,
        patches_json: patches,
        model: usage.model,
        prompt_tokens: usage.prompt,
        completion_tokens: usage.completion,
        estimated_cost_usd: usage.cost,
        kind: intent === 'design' ? 'refine-design' : 'refine',
        status: llmError ? 'error' : 'ok',
      })

      send('ready', {
        step: 'ready',
        spec,
        message: reply,
        conversationId: conversation.id,
        llm: usage.model,
        llmError,
      })
    })
  } catch (err) {
    if (err instanceof AuthError) return json({ error: err.message }, 401)
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
