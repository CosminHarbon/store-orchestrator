import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  AuthError,
  GENERATE_LIMIT,
  chatJson,
  corsHeaders,
  countToday,
  createAdmin,
  designLlmConfigured,
  ensureConversation,
  ensureStorefront,
  inferBrief,
  insertMessage,
  json,
  llmConfigured,
  loadCatalogContext,
  mergeLlmStoreDesign,
  requireUser,
  specFromBrief,
  specToCustomization,
  sseResponse,
  syncCopyIntoSections,
  variantSummary,
  verifySpec,
} from '../_shared/aiStudio.ts'

const GENERATE_SYSTEM = `You are a premium ecommerce storefront design director.
Return JSON only with:
{
  "friendReply": "one friendly sentence",
  "layoutId": "atelier|editorial|luxeDark|minimal|warmMarket",
  "density": "cozy|airy|compact",
  "nav": { "style": "glass|solid|transparent", "layout": "logoCenter|logoLeft|split", "showCollections": true, "sticky": true },
  "productCard": { "style": "minimal|bordered|shadow|overlay", "imageRatio": "4/5|1/1|16/10", "showQuickAdd": true, "showRating": true },
  "hero": { "layout": "center|left|right|split|fullBleed", "overlay": "none|soft|strong", "ctaStyle": "solid|outline|pill" },
  "sectionOrder": ["announcement","header","hero","features","collections","products","about","reviews","faq","footer"],
  "niche": "floral|streetwear|cosmetics|jewelry|kids|food|home|boutique",
  "mood": "short mood",
  "language": "ro" or "en",
  "storeName": "brand",
  "tokens": {
    "primary":"#RRGGBB","background":"#RRGGBB","text":"#RRGGBB","accent":"#RRGGBB","secondary":"#RRGGBB",
    "headingFont":"Playfair Display|Cormorant Garamond|Libre Baskerville|Inter|Space Grotesk|Lora|Fraunces",
    "bodyFont":"Nunito Sans|Inter|DM Sans",
    "navbarStyle":"glass|solid|transparent",
    "heroLayout":"left|center|split",
    "buttonStyle":"pill|solid|outline",
    "radius":"rounded-none|rounded-lg|rounded-xl",
    "productCardStyle":"minimal|bordered|shadow"
  },
  "copy": {
    "storeName":"brand","heroTitle":"...","heroSubtitle":"...","heroButtonText":"...",
    "announcement":"...","about":"...","footer":"© Brand.",
    "faq":[{"q":"...","a":"..."},{"q":"...","a":"..."}]
  }
}
Rules:
- Flowers/florist => niche floral, prefer layoutId atelier, blush-friendly colors.
- Match language to the prompt.
- Strong text/background contrast.
- sectionOrder must include header, hero, products, footer.
- Choose nav/productCard/hero variants deliberately for a premium look.
- Use live catalog names when provided.
- No HTML. No questions.`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const admin = createAdmin()
  try {
    const user = await requireUser(req, admin)
    const body = await req.json()
    const prompt = String(body.prompt || '').trim()
    const quality = body.quality === 'fast' ? 'fast' : 'studio'
    if (!prompt) return json({ error: 'Prompt required' }, 400)

    const used = await countToday(admin, user.id, 'generate')
    if (used >= GENERATE_LIMIT) {
      return json({ error: `Daily generate limit reached (${GENERATE_LIMIT}). Try a refinement instead.` }, 429)
    }

    const { data: profile } = await admin.from('profiles').select('store_name').eq('user_id', user.id).maybeSingle()
    let catalog = { productTitles: [] as string[], collectionNames: [] as string[] }
    try {
      catalog = await loadCatalogContext(admin, user.id)
    } catch (err) {
      console.error('catalog context failed', err)
    }

    return sseResponse(async (send) => {
      send('status', { step: 'understanding' })
      const heuristic = inferBrief(prompt, profile?.store_name || undefined)
      let baseSpec = specFromBrief(heuristic)
      let friendReply = heuristic.friendReply
      let usageTotal = { prompt: 0, completion: 0, cost: 0, model: 'heuristic' }
      let llmError: string | undefined

      send('status', { step: 'designing', message: friendReply })

      const mode = quality === 'studio' && designLlmConfigured()
        ? 'design'
        : quality === 'studio' && !designLlmConfigured()
          ? (llmConfigured() ? 'studio' : 'fast')
          : 'fast'
      if (!llmConfigured()) {
        llmError = 'No LLM API key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY (and optionally DEEPSEEK_API_KEY).'
      } else {
        try {
          send('status', { step: 'building', message: mode === 'design' ? 'Claude/GPT is designing…' : 'AI is designing…' })
          const designed = await chatJson({
            mode: mode as 'design' | 'fast' | 'studio',
            system: GENERATE_SYSTEM,
            user: [
              `Store owner request: ${prompt}`,
              profile?.store_name ? `Existing store name: ${profile.store_name}` : '',
              catalog.productTitles.length ? `Live products: ${catalog.productTitles.join(', ')}` : 'Live products: none yet',
              catalog.collectionNames.length ? `Live collections: ${catalog.collectionNames.join(', ')}` : '',
              `Heuristic: ${heuristic.niche} / ${heuristic.mood} / ${heuristic.layoutId} / ${heuristic.language}`,
            ].filter(Boolean).join('\n'),
            temperature: 0.45,
            maxTokens: 2800,
          })
          const merged = mergeLlmStoreDesign(baseSpec, designed.json)
          baseSpec = merged.spec
          friendReply = merged.friendReply
          usageTotal = {
            prompt: designed.usage.prompt,
            completion: designed.usage.completion,
            cost: designed.usage.cost,
            model: designed.usage.model,
          }
        } catch (err) {
          llmError = err instanceof Error ? err.message : String(err)
          console.error('ai-studio-generate LLM failed', llmError)
        }
      }

      send('status', { step: 'verifying' })
      // Always use curated sections mode (not freeform HTML)
      baseSpec = {
        ...baseSpec,
        renderMode: 'sections',
        documentHtml: '',
        documentCss: '',
      } as typeof baseSpec
      baseSpec = syncCopyIntoSections(baseSpec)
      let errors = verifySpec(baseSpec)
      if (errors.length && llmConfigured()) {
        try {
          const repair = await chatJson({
            mode: 'micro',
            system: 'Fix this storefront JSON brief. Return the same JSON shape with repairs only. JSON only. No HTML.',
            user: JSON.stringify({ errors, current: { layoutId: baseSpec.layoutId, tokens: baseSpec.tokens, copy: baseSpec.copy, nav: baseSpec.nav, productCard: baseSpec.productCard, hero: baseSpec.hero } }),
            maxTokens: 1200,
          })
          const merged = mergeLlmStoreDesign(baseSpec, repair.json)
          baseSpec = syncCopyIntoSections({
            ...merged.spec,
            renderMode: 'sections',
            documentHtml: '',
            documentCss: '',
          } as typeof baseSpec)
          errors = verifySpec(baseSpec)
          usageTotal = {
            prompt: usageTotal.prompt + repair.usage.prompt,
            completion: usageTotal.completion + repair.usage.completion,
            cost: usageTotal.cost + repair.usage.cost,
            model: repair.usage.model,
          }
        } catch (err) {
          console.error('verify repair failed', err)
        }
      }

      const summary = variantSummary(baseSpec, baseSpec.language)
      let message = `${friendReply} ${summary}.`
      if (llmError) {
        message = baseSpec.language === 'ro'
          ? `AI nu a răspuns complet (${llmError}). Am construit totuși un magazin premium din ce ai scris. ${summary}.`
          : `AI did not fully respond (${llmError}). A premium storefront was still composed from your prompt. ${summary}.`
      }

      send('status', { step: 'building', message, spec: baseSpec })

      const storefront = await ensureStorefront(admin, user.id)
      const conversation = await ensureConversation(admin, user.id, storefront.id, body.conversationId)
      const customization = specToCustomization(baseSpec, user.id)
      const { error: persistError } = await admin.from('ai_storefronts').update({
        draft_spec: baseSpec,
        draft_customization: customization,
        status: 'ready',
        quality,
      }).eq('id', storefront.id)
      if (persistError) {
        send('error', { step: 'error', error: persistError.message })
        return
      }

      await insertMessage(admin, {
        conversation_id: conversation.id,
        user_id: user.id,
        role: 'user',
        content: prompt,
        kind: 'generate',
        quality,
      })
      await insertMessage(admin, {
        conversation_id: conversation.id,
        user_id: user.id,
        role: 'assistant',
        content: message,
        brief_json: heuristic,
        spec_json: baseSpec,
        model: usageTotal.model,
        prompt_tokens: usageTotal.prompt,
        completion_tokens: usageTotal.completion,
        estimated_cost_usd: usageTotal.cost,
        kind: 'generate',
        quality,
        status: llmError ? 'error' : 'ok',
      })

      send('ready', {
        step: 'ready',
        spec: baseSpec,
        message,
        conversationId: conversation.id,
        llm: usageTotal.model,
        llmError,
      })
    })
  } catch (err) {
    if (err instanceof AuthError) return json({ error: err.message }, 401)
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
