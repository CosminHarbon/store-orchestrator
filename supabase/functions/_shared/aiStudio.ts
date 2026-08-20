import { z } from 'https://esm.sh/zod@3.23.8'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export const MAX_SECTIONS = 16
export const GENERATE_LIMIT = 5
export const REFINE_LIMIT = 30
export const DESIGN_REFINE_LIMIT = 10

export const LAYOUT_IDS = ['atelier', 'editorial', 'luxeDark', 'minimal', 'warmMarket'] as const
export type LayoutId = typeof LAYOUT_IDS[number]

const hex = z.string().regex(/^#([0-9a-fA-F]{6})$/).transform((v) => v.toUpperCase())
const fonts = z.enum([
  'Inter', 'DM Sans', 'Manrope', 'Outfit', 'Nunito Sans', 'Space Grotesk',
  'Playfair Display', 'Cormorant Garamond', 'Libre Baskerville', 'Lora', 'Fraunces', 'Source Serif 4',
])
const sectionTypes = z.enum([
  'header', 'hero', 'collections', 'products', 'reviews', 'footer',
  'announcement', 'split-hero', 'featured-collection', 'faq', 'about', 'features',
  'lookbook', 'marquee', 'contact', 'newsletter', 'banner', 'testimonial',
  'text', 'image', 'text-image', 'carousel', 'video', 'custom-html',
])

const homeSection = z.object({
  id: z.string(),
  type: sectionTypes,
  visible: z.boolean().optional().default(true),
  props: z.record(z.unknown()).optional().default({}),
})

const navSchema = z.object({
  style: z.enum(['glass', 'solid', 'transparent']).default('glass'),
  layout: z.enum(['logoCenter', 'logoLeft', 'split']).default('logoCenter'),
  showCollections: z.boolean().default(true),
  sticky: z.boolean().default(true),
}).default({ style: 'glass', layout: 'logoCenter', showCollections: true, sticky: true })

const productCardSchema = z.object({
  style: z.enum(['minimal', 'bordered', 'shadow', 'overlay']).default('minimal'),
  imageRatio: z.enum(['4/5', '1/1', '16/10']).default('4/5'),
  showQuickAdd: z.boolean().default(true),
  showRating: z.boolean().default(true),
}).default({ style: 'minimal', imageRatio: '4/5', showQuickAdd: true, showRating: true })

const heroVariantSchema = z.object({
  layout: z.enum(['center', 'left', 'right', 'split', 'fullBleed']).default('split'),
  overlay: z.enum(['none', 'soft', 'strong']).default('soft'),
  ctaStyle: z.enum(['solid', 'outline', 'pill']).default('solid'),
}).default({ layout: 'split', overlay: 'soft', ctaStyle: 'solid' })

export const storeBriefSchema = z.object({
  layoutId: z.enum(LAYOUT_IDS).optional(),
  density: z.enum(['cozy', 'airy', 'compact']).optional(),
  nav: navSchema.optional(),
  productCard: productCardSchema.optional(),
  hero: heroVariantSchema.optional(),
  sectionOrder: z.array(sectionTypes).optional(),
  niche: z.string().min(1),
  mood: z.string().min(1),
  language: z.enum(['ro', 'en']),
  storeName: z.string().optional(),
  colors: z.object({ primary: hex.optional(), background: hex.optional(), text: hex.optional() }).optional(),
  mustHaveSections: z.array(sectionTypes).optional(),
  notes: z.string().optional(),
  friendReply: z.string().min(1),
})

export const specSchema = z.object({
  version: z.literal(1),
  layoutId: z.enum(LAYOUT_IDS).default('atelier'),
  density: z.enum(['cozy', 'airy', 'compact']).default('airy'),
  nav: navSchema,
  productCard: productCardSchema,
  hero: heroVariantSchema,
  niche: z.string(),
  mood: z.string(),
  language: z.enum(['ro', 'en']),
  tokens: z.object({
    primary: hex, background: hex, text: hex, accent: hex, secondary: hex,
    headingFont: fonts, bodyFont: fonts,
    radius: z.string().optional(),
    buttonStyle: z.string().optional(),
    shadow: z.string().optional(),
    navbarStyle: z.string().optional(),
    heroLayout: z.string().optional(),
    productCardStyle: z.string().optional(),
  }),
  copy: z.object({
    storeName: z.string(),
    heroTitle: z.string(),
    heroSubtitle: z.string(),
    heroButtonText: z.string(),
    heroImageUrl: z.string().nullable().optional(),
    logoUrl: z.string().nullable().optional(),
    footer: z.string(),
    about: z.string().optional(),
    announcement: z.string().optional(),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
  }),
  pages: z.object({
    home: z.object({ sections: z.array(homeSection).min(4).max(MAX_SECTIONS) }),
    catalog: z.unknown().optional(),
    product: z.unknown().optional(),
  }),
  customCss: z.string().optional().default(''),
  renderMode: z.enum(['sections', 'document']).optional().default('sections'),
  documentHtml: z.string().max(48000).optional().default(''),
  documentCss: z.string().max(24000).optional().default(''),
})

export type StoreBrief = z.infer<typeof storeBriefSchema>
export type StorefrontSpec = z.infer<typeof specSchema>

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON in model response')
  return JSON.parse(text.slice(start, end + 1))
}

export async function requireUser(req: Request, supabaseAdmin: ReturnType<typeof createAdmin>) {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!jwt) throw new AuthError('Missing authorization')
  const { data, error } = await supabaseAdmin.auth.getUser(jwt)
  if (error || !data.user) throw new AuthError('Invalid session')
  return data.user
}

export class AuthError extends Error {}

export function createAdmin() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
}

export type LlmUsage = { model: string; prompt: number; completion: number; cost: number }

const COST: Record<string, { in: number; out: number }> = {
  'deepseek-chat': { in: 0.14 / 1e6, out: 0.28 / 1e6 },
  'gpt-4o': { in: 2.5 / 1e6, out: 10 / 1e6 },
  'claude-sonnet-4-5': { in: 3 / 1e6, out: 15 / 1e6 },
  'claude-sonnet-4-5-20250929': { in: 3 / 1e6, out: 15 / 1e6 },
}

function readSecret(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim().replace(/^["']|["']$/g, '')
    if (value) return value
  }
  return ''
}

export function llmConfigured() {
  return Boolean(
    readSecret('DEEPSEEK_API_KEY') ||
      readSecret('OPENAI_API_KEY') ||
      readSecret('ANTHROPIC_API_KEY')
  )
}

export function designLlmConfigured() {
  return Boolean(readSecret('ANTHROPIC_API_KEY') || readSecret('OPENAI_API_KEY'))
}

export type ChatMode = 'design' | 'micro' | 'studio' | 'fast'

export async function chatJson(opts: {
  quality?: 'fast' | 'studio'
  mode?: ChatMode
  system: string
  user: string
  temperature?: number
  maxTokens?: number
}): Promise<{ json: unknown; usage: LlmUsage; text: string }> {
  const mode: ChatMode = opts.mode || (opts.quality === 'studio' ? 'studio' : 'fast')
  const anthropic = readSecret('ANTHROPIC_API_KEY')
  const openai = readSecret('OPENAI_API_KEY')
  const deepseek = readSecret('DEEPSEEK_API_KEY')
  const maxTokens = opts.maxTokens ?? (mode === 'design' || mode === 'studio' ? 3500 : 1200)
  const temperature = opts.temperature ?? (mode === 'micro' ? 0.3 : 0.45)
  const errors: string[] = []

  const tryCall = async (label: string, fn: () => Promise<{ json: unknown; usage: LlmUsage; text: string }>) => {
    try {
      return await fn()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[ai-studio] ${label} failed`, message)
      errors.push(`${label}: ${message}`)
      return null
    }
  }

  // Design / studio: Claude → GPT-4o → DeepSeek
  if (mode === 'design' || mode === 'studio') {
    if (anthropic) {
      const ok = await tryCall('anthropic', () => anthropicChat(anthropic, opts.system, opts.user, temperature, maxTokens))
      if (ok) return ok
    }
    if (openai) {
      const ok = await tryCall('openai', () => openaiChat(openai, 'gpt-4o', opts.system, opts.user, temperature, maxTokens))
      if (ok) return ok
    }
    if (deepseek) {
      const ok = await tryCall('deepseek', () =>
        openaiCompat(
          'https://api.deepseek.com/chat/completions',
          deepseek,
          'deepseek-chat',
          opts.system,
          opts.user,
          temperature,
          maxTokens
        )
      )
      if (ok) return ok
    }
    throw new Error(errors[0] || 'All design LLM providers failed. Check Anthropic/OpenAI billing and keys.')
  }

  // Micro / fast: DeepSeek → GPT-4o-mini → Claude
  if (deepseek) {
    const ok = await tryCall('deepseek', () =>
      openaiCompat(
        'https://api.deepseek.com/chat/completions',
        deepseek,
        'deepseek-chat',
        opts.system,
        opts.user,
        temperature,
        maxTokens
      )
    )
    if (ok) return ok
  }
  if (openai) {
    const ok = await tryCall('openai', () => openaiChat(openai, 'gpt-4o-mini', opts.system, opts.user, temperature, maxTokens))
    if (ok) return ok
  }
  if (anthropic) {
    const ok = await tryCall('anthropic', () => anthropicChat(anthropic, opts.system, opts.user, temperature, maxTokens))
    if (ok) return ok
  }
  throw new Error(
    errors[0] ||
      'No LLM API key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY (and optionally DEEPSEEK_API_KEY) in Supabase → Edge Functions → Secrets.'
  )
}

export function classifyRefineIntent(prompt: string): 'micro' | 'design' {
  if (/redesign|refă|reface|layout|nav|navigation|card|hero|editorial|dark|luxe|minimal|atelier|warm|magazine|glass|overlay|section order|rearanje|reorder|look and feel|make it (look )?(like|premium|luxury)|from scratch|html|css|complet(e|ely)? new|pagină nouă|site nou/i.test(prompt)) {
    return 'design'
  }
  if (/faq|color|culoare|headline|title|titlu|subtitle|about|announcement|button|cta|text|copy|font/i.test(prompt)) {
    return 'micro'
  }
  return /don'?t like|better|improve|ugly|mai bine|change (the )?look|try again/i.test(prompt) ? 'design' : 'micro'
}

async function openaiCompat(
  url: string,
  key: string,
  model: string,
  system: string,
  user: string,
  temperature: number,
  maxTokens = 2200
) {
  const payload: Record<string, unknown> = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }
  const supportsJsonObject = model.startsWith('deepseek') || model.startsWith('gpt-')
  if (supportsJsonObject) payload.response_format = { type: 'json_object' }

  const post = () => fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  let res = await post()
  let raw = await res.text()
  if (!res.ok && supportsJsonObject && payload.response_format) {
    delete payload.response_format
    res = await post()
    raw = await res.text()
  }
  if (!res.ok) throw new Error(formatLlmHttpError(res.status, raw))
  const data = JSON.parse(raw)
  const text = data.choices?.[0]?.message?.content || ''
  if (!text.trim()) throw new Error('LLM returned an empty response')
  const usage = packUsage(model, data.usage)
  return { json: extractJson(text), usage, text }
}

async function openaiChat(
  key: string,
  model: string,
  system: string,
  user: string,
  temperature: number,
  maxTokens = 2200
) {
  return openaiCompat('https://api.openai.com/v1/chat/completions', key, model, system, user, temperature, maxTokens)
}

async function anthropicChat(
  key: string,
  system: string,
  user: string,
  temperature: number,
  maxTokens = 3500
) {
  // Prefer dated snapshot for stability; alias also works.
  const model = Deno.env.get('ANTHROPIC_MODEL')?.trim() || 'claude-sonnet-4-5-20250929'
  const keyHint = key.length > 12 ? `${key.slice(0, 10)}…${key.slice(-4)}` : '(short)'
  console.log('[ai-studio] anthropic request', { model, keyHint, maxTokens })
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) {
    const raw = await res.text()
    console.error('[ai-studio] anthropic HTTP', res.status, raw.slice(0, 400))
    throw new Error(formatLlmHttpError(res.status, raw))
  }
  const data = await res.json()
  const text = data.content?.map((c: { text?: string }) => c.text || '').join('') || ''
  const usage = packUsage(model, { prompt_tokens: data.usage?.input_tokens, completion_tokens: data.usage?.output_tokens })
  console.log('[ai-studio] anthropic ok', { model, input: usage.prompt, output: usage.completion })
  return { json: extractJson(text), usage, text }
}

function formatLlmHttpError(status: number, raw: string) {
  const snippet = raw.slice(0, 500)
  try {
    const parsed = JSON.parse(raw)
    const msg = String(parsed?.error?.message || parsed?.message || '')
    if (status === 402 || /insufficient balance/i.test(msg)) {
      return 'DeepSeek account has insufficient balance. Top up at https://platform.deepseek.com then try again.'
    }
    if (/credit balance is too low|Plans & Billing|billing/i.test(msg)) {
      return [
        'Anthropic API rejected the key (credit/billing).',
        'Console “Remaining balance” is often Claude.ai credits, not API workspace credits —',
        'check https://console.anthropic.com → Settings → Billing for the same org as your API key,',
        'or paste a fresh API key into Supabase secret ANTHROPIC_API_KEY.',
        `Detail: ${msg}`,
      ].join(' ')
    }
    if (msg) return `LLM error ${status}: ${msg}`
  } catch {
    /* not JSON */
  }
  if (status === 402) {
    return 'DeepSeek account has insufficient balance. Top up at https://platform.deepseek.com then try again.'
  }
  return `LLM error ${status}: ${snippet}`
}

function packUsage(model: string, usage?: { prompt_tokens?: number; completion_tokens?: number }): LlmUsage {
  const prompt = Number(usage?.prompt_tokens || 0)
  const completion = Number(usage?.completion_tokens || 0)
  const rates = COST[model] || COST['deepseek-chat']
  return { model, prompt, completion, cost: prompt * rates.in + completion * rates.out }
}

const HERO: Record<string, string> = {
  floral: 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1600&q=80',
  streetwear: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=1600&q=80',
  cosmetics: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1600&q=80',
  jewelry: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1600&q=80',
  kids: 'https://images.unsplash.com/photo-1515488044360-fb630819fd38?auto=format&fit=crop&w=1600&q=80',
  default: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&q=80',
}

const FLORAL_HERO = [
  'https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1487530811176-3780de880c2d?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1519378058457-4c29a0a2efac?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1468327768560-75b60c6f5e9c?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1508610048659-a06b669e3321?auto=format&fit=crop&w=1600&q=80',
]

function heroFor(niche: string, mood?: string) {
  const n = niche.toLowerCase()
  if (n.includes('floral') || n.includes('flower')) {
    const idx = Math.max(0, MOOD_CYCLE.indexOf(mood as (typeof MOOD_CYCLE)[number]))
    return FLORAL_HERO[idx] || FLORAL_HERO[0]
  }
  const key = Object.keys(HERO).find((k) => n.includes(k)) || 'default'
  return HERO[key]
}

type TokenLook = {
  primary: string
  background: string
  text: string
  accent: string
  secondary: string
  headingFont: 'Inter' | 'Cormorant Garamond' | 'Playfair Display' | 'Libre Baskerville' | 'Space Grotesk'
  bodyFont: 'Nunito Sans' | 'Inter' | 'DM Sans'
  radius: 'rounded-none' | 'rounded-xl' | 'rounded-lg'
  buttonStyle: 'pill' | 'solid' | 'outline'
  navbarStyle: 'glass' | 'solid' | 'transparent'
  heroLayout: 'left' | 'center' | 'split'
}

const MOOD_LOOKS: Record<string, TokenLook> = {
  'airy elegant': {
    primary: '#9E4F5A', background: '#FBF8F5', text: '#1F1714', accent: '#8A7D76', secondary: '#F3E4E0',
    headingFont: 'Cormorant Garamond', bodyFont: 'Nunito Sans', radius: 'rounded-xl', buttonStyle: 'pill',
    navbarStyle: 'glass', heroLayout: 'left',
  },
  'soft romantic': {
    primary: '#C97B84', background: '#FDF6F4', text: '#3B2424', accent: '#A9847F', secondary: '#F7E9E6',
    headingFont: 'Playfair Display', bodyFont: 'Nunito Sans', radius: 'rounded-xl', buttonStyle: 'pill',
    navbarStyle: 'transparent', heroLayout: 'split',
  },
  'dark luxury': {
    primary: '#C9A227', background: '#0F0F12', text: '#F5F5F5', accent: '#A1A1AA', secondary: '#1C1C22',
    headingFont: 'Cormorant Garamond', bodyFont: 'Nunito Sans', radius: 'rounded-lg', buttonStyle: 'outline',
    navbarStyle: 'solid', heroLayout: 'center',
  },
  'warm artisan': {
    primary: '#8B5E3C', background: '#FAF4EC', text: '#2A2118', accent: '#7C6A58', secondary: '#F0E4D4',
    headingFont: 'Libre Baskerville', bodyFont: 'Nunito Sans', radius: 'rounded-lg', buttonStyle: 'solid',
    navbarStyle: 'glass', heroLayout: 'left',
  },
  'minimal modern': {
    primary: '#171717', background: '#FFFFFF', text: '#171717', accent: '#525252', secondary: '#F5F5F5',
    headingFont: 'Inter', bodyFont: 'Inter', radius: 'rounded-none', buttonStyle: 'solid',
    navbarStyle: 'solid', heroLayout: 'center',
  },
}

const MOOD_CYCLE = ['airy elegant', 'soft romantic', 'dark luxury', 'warm artisan', 'minimal modern'] as const

const LAYOUT_LABELS: Record<LayoutId, { en: string; ro: string }> = {
  atelier: { en: 'Atelier', ro: 'Atelier' },
  editorial: { en: 'Editorial', ro: 'Editorial' },
  luxeDark: { en: 'Luxe Dark', ro: 'Luxe Dark' },
  minimal: { en: 'Minimal', ro: 'Minimal' },
  warmMarket: { en: 'Warm Market', ro: 'Piață caldă' },
}

const LAYOUT_CHROME: Record<LayoutId, {
  navbarStyle: TokenLook['navbarStyle']
  heroLayout: TokenLook['heroLayout']
  buttonStyle: TokenLook['buttonStyle']
  radius: TokenLook['radius']
  headingFont: TokenLook['headingFont']
  bodyFont: TokenLook['bodyFont']
}> = {
  atelier: { navbarStyle: 'glass', heroLayout: 'split', buttonStyle: 'pill', radius: 'rounded-xl', headingFont: 'Cormorant Garamond', bodyFont: 'Nunito Sans' },
  editorial: { navbarStyle: 'transparent', heroLayout: 'left', buttonStyle: 'outline', radius: 'rounded-none', headingFont: 'Playfair Display', bodyFont: 'Inter' },
  luxeDark: { navbarStyle: 'solid', heroLayout: 'center', buttonStyle: 'outline', radius: 'rounded-lg', headingFont: 'Cormorant Garamond', bodyFont: 'Nunito Sans' },
  minimal: { navbarStyle: 'solid', heroLayout: 'center', buttonStyle: 'solid', radius: 'rounded-none', headingFont: 'Inter', bodyFont: 'Inter' },
  warmMarket: { navbarStyle: 'glass', heroLayout: 'left', buttonStyle: 'solid', radius: 'rounded-lg', headingFont: 'Libre Baskerville', bodyFont: 'Nunito Sans' },
}

export function isLayoutId(value: unknown): value is LayoutId {
  return typeof value === 'string' && (LAYOUT_IDS as readonly string[]).includes(value)
}

export function layoutLabel(layoutId: LayoutId | undefined, language: 'ro' | 'en' = 'en') {
  const id = isLayoutId(layoutId) ? layoutId : 'atelier'
  return LAYOUT_LABELS[id][language]
}

export function inferLayoutId(niche: string, mood: string, prompt = ''): LayoutId {
  const p = `${niche} ${mood} ${prompt}`.toLowerCase()
  if (/dark|luxe|luxury|gold|negru|lux\b/.test(p)) return 'luxeDark'
  if (/editorial|magazine|lookbook|marquee/.test(p)) return 'editorial'
  if (/floral|flower|florist|flori|floare|blush|romantic|pink|roz/.test(p)) return 'atelier'
  if (/warm|artisan|coffee|cafe|bakery|food|home|market|paper|cafea/.test(p)) return 'warmMarket'
  if (/minimal|simple|clean|streetwear|sneaker|hoodie/.test(p)) return 'minimal'
  if (/jewel|bijuter/.test(p)) return 'editorial'
  return /boutique|store|shop/.test(p) ? 'minimal' : 'atelier'
}

function sectionCatalog(copy: StorefrontSpec['copy'], language: 'ro' | 'en') {
  const ro = language === 'ro'
  return {
    announcement: { id: 'announcement', type: 'announcement' as const, visible: true, props: { text: copy.announcement } },
    header: { id: 'header', type: 'header' as const, visible: true, props: {} },
    hero: { id: 'hero', type: 'hero' as const, visible: true, props: { title: copy.heroTitle, subtitle: copy.heroSubtitle, buttonText: copy.heroButtonText, imageUrl: copy.heroImageUrl } },
    features: { id: 'features', type: 'features' as const, visible: true, props: { features: ro
      ? [
        { title: 'Livrare rapidă', body: 'Acasă sau locker, în toată țara.', icon: 'truck' },
        { title: 'Plată flexibilă', body: 'Card sau ramburs.', icon: 'lock' },
        { title: 'Selecție îngrijită', body: 'Stoc actualizat, ales de mână.', icon: 'sparkles' },
      ]
      : [
        { title: 'Fast delivery', body: 'Home or locker, nationwide.', icon: 'truck' },
        { title: 'Flexible payment', body: 'Card or cash on delivery.', icon: 'lock' },
        { title: 'Edited selection', body: 'A tight catalog, always in stock.', icon: 'sparkles' },
      ] } },
    collections: { id: 'collections', type: 'collections' as const, visible: true, props: { title: ro ? 'Colecții' : 'Collections' } },
    products: { id: 'products', type: 'products' as const, visible: true, props: { title: ro ? 'Produse recomandate' : 'Featured' } },
    about: { id: 'about', type: 'about' as const, visible: true, props: { title: ro ? 'Povestea noastră' : 'Our story', text: copy.about } },
    reviews: { id: 'reviews', type: 'reviews' as const, visible: true, props: { title: ro ? 'Recenzii' : 'Reviews' } },
    faq: { id: 'faq', type: 'faq' as const, visible: true, props: { faqItems: copy.faq } },
    lookbook: { id: 'lookbook', type: 'lookbook' as const, visible: true, props: { title: 'Lookbook' } },
    marquee: { id: 'marquee', type: 'marquee' as const, visible: true, props: { marqueeText: copy.announcement || copy.storeName } },
    newsletter: {
      id: 'newsletter',
      type: 'newsletter' as const,
      visible: true,
      props: {
        text: ro ? 'Află primii de noutăți și oferte.' : 'Be first to know about drops and offers.',
        buttonText: ro ? 'Abonează-te' : 'Subscribe',
      },
    },
    footer: { id: 'footer', type: 'footer' as const, visible: true, props: {} },
  }
}

const DEFAULT_SECTION_ORDERS: Record<LayoutId, string[]> = {
  atelier: ['announcement', 'header', 'hero', 'features', 'collections', 'products', 'about', 'reviews', 'faq', 'footer'],
  editorial: ['header', 'marquee', 'hero', 'lookbook', 'products', 'collections', 'about', 'reviews', 'footer'],
  luxeDark: ['announcement', 'header', 'hero', 'products', 'collections', 'reviews', 'faq', 'footer'],
  minimal: ['header', 'hero', 'products', 'collections', 'reviews', 'footer'],
  warmMarket: ['announcement', 'header', 'hero', 'features', 'about', 'products', 'collections', 'reviews', 'faq', 'footer'],
}

function sectionsForLayout(layoutId: LayoutId, copy: StorefrontSpec['copy'], language: 'ro' | 'en', sectionOrder?: string[]) {
  const catalog = sectionCatalog(copy, language) as Record<string, { id: string; type: string; visible: boolean; props: Record<string, unknown> }>
  const order = (sectionOrder?.length ? sectionOrder : DEFAULT_SECTION_ORDERS[layoutId]) || DEFAULT_SECTION_ORDERS.atelier
  const required = ['header', 'hero', 'products', 'footer']
  const seen = new Set<string>()
  const sections: Array<{ id: string; type: string; visible: boolean; props: Record<string, unknown> }> = []
  for (const type of order) {
    const section = catalog[type]
    if (!section || seen.has(type)) continue
    seen.add(type)
    sections.push(section)
  }
  for (const type of required) {
    if (!seen.has(type) && catalog[type]) {
      sections.push(catalog[type])
      seen.add(type)
    }
  }
  return sections.slice(0, MAX_SECTIONS)
}

export function withLayout(spec: StorefrontSpec, layoutId: LayoutId): StorefrontSpec {
  const chrome = LAYOUT_CHROME[layoutId]
  const presets: Record<LayoutId, { density: string; nav: object; productCard: object; hero: object }> = {
    atelier: {
      density: 'airy',
      nav: { style: 'glass', layout: 'logoCenter', showCollections: true, sticky: true },
      productCard: { style: 'minimal', imageRatio: '4/5', showQuickAdd: true, showRating: true },
      hero: { layout: 'split', overlay: 'soft', ctaStyle: 'pill' },
    },
    editorial: {
      density: 'airy',
      nav: { style: 'transparent', layout: 'logoLeft', showCollections: true, sticky: true },
      productCard: { style: 'bordered', imageRatio: '4/5', showQuickAdd: false, showRating: true },
      hero: { layout: 'left', overlay: 'strong', ctaStyle: 'outline' },
    },
    luxeDark: {
      density: 'cozy',
      nav: { style: 'solid', layout: 'logoCenter', showCollections: false, sticky: true },
      productCard: { style: 'overlay', imageRatio: '4/5', showQuickAdd: true, showRating: false },
      hero: { layout: 'fullBleed', overlay: 'strong', ctaStyle: 'outline' },
    },
    minimal: {
      density: 'compact',
      nav: { style: 'solid', layout: 'logoLeft', showCollections: true, sticky: true },
      productCard: { style: 'minimal', imageRatio: '1/1', showQuickAdd: true, showRating: true },
      hero: { layout: 'center', overlay: 'soft', ctaStyle: 'solid' },
    },
    warmMarket: {
      density: 'cozy',
      nav: { style: 'glass', layout: 'split', showCollections: true, sticky: true },
      productCard: { style: 'shadow', imageRatio: '16/10', showQuickAdd: true, showRating: true },
      hero: { layout: 'left', overlay: 'none', ctaStyle: 'solid' },
    },
  }
  const preset = presets[layoutId]
  const orderHint = Array.isArray((spec as any).sectionOrder) ? (spec as any).sectionOrder as string[] : undefined
  const density = ['cozy', 'airy', 'compact'].includes(String((spec as any).density))
    ? (spec as any).density
    : preset.density
  const payload = {
    ...spec,
    layoutId,
    density,
    nav: sanitizeNavVariant({ ...preset.nav, ...((spec as any).nav || {}) }, preset.nav),
    productCard: sanitizeProductCardVariant({ ...preset.productCard, ...((spec as any).productCard || {}) }, preset.productCard),
    hero: sanitizeHeroVariant({ ...preset.hero, ...((spec as any).hero || {}) }, preset.hero),
    tokens: { ...spec.tokens, ...chrome },
    pages: {
      ...spec.pages,
      home: { sections: sectionsForLayout(layoutId, spec.copy, spec.language, orderHint) },
    },
  }
  const parsed = specSchema.safeParse(payload)
  if (parsed.success) return parsed.data
  console.warn('[ai-studio] withLayout safeParse failed — using preset chrome', parsed.error.issues?.slice(0, 3))
  return specSchema.parse({
    ...spec,
    layoutId,
    density: preset.density,
    nav: preset.nav,
    productCard: preset.productCard,
    hero: preset.hero,
    tokens: { ...spec.tokens, ...chrome },
    pages: {
      ...spec.pages,
      home: { sections: sectionsForLayout(layoutId, spec.copy, spec.language, orderHint) },
    },
  })
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

export function sanitizeNavVariant(input: any, fallback: any = {}) {
  const base = {
    style: 'glass',
    layout: 'logoCenter',
    showCollections: true,
    sticky: true,
    ...fallback,
  }
  // LLMs confuse layoutId "minimal" / hero "center" with nav fields
  let style = input?.style
  if (style === 'minimal' || style === 'overlay' || style === 'shadow' || style === 'bordered') style = 'solid'
  let layout = input?.layout
  if (layout === 'center' || layout === 'fullBleed') layout = 'logoCenter'
  if (layout === 'left' || layout === 'right') layout = 'logoLeft'
  return {
    style: pickEnum(style, ['glass', 'solid', 'transparent'] as const, base.style),
    layout: pickEnum(layout, ['logoCenter', 'logoLeft', 'split'] as const, base.layout),
    showCollections: typeof input?.showCollections === 'boolean' ? input.showCollections : base.showCollections,
    sticky: typeof input?.sticky === 'boolean' ? input.sticky : base.sticky,
  }
}

export function sanitizeProductCardVariant(input: any, fallback: any = {}) {
  const base = {
    style: 'minimal',
    imageRatio: '4/5',
    showQuickAdd: true,
    showRating: true,
    ...fallback,
  }
  return {
    style: pickEnum(input?.style, ['minimal', 'bordered', 'shadow', 'overlay'] as const, base.style),
    imageRatio: pickEnum(input?.imageRatio, ['4/5', '1/1', '16/10'] as const, base.imageRatio),
    showQuickAdd: typeof input?.showQuickAdd === 'boolean' ? input.showQuickAdd : base.showQuickAdd,
    showRating: typeof input?.showRating === 'boolean' ? input.showRating : base.showRating,
  }
}

export function sanitizeHeroVariant(input: any, fallback: any = {}) {
  const base = {
    layout: 'split',
    overlay: 'soft',
    ctaStyle: 'solid',
    ...fallback,
  }
  let layout = input?.layout
  if (layout === 'minimal' || layout === 'logoCenter' || layout === 'logoLeft') layout = 'center'
  return {
    layout: pickEnum(layout, ['center', 'left', 'right', 'split', 'fullBleed'] as const, base.layout),
    overlay: pickEnum(input?.overlay, ['none', 'soft', 'strong'] as const, base.overlay),
    ctaStyle: pickEnum(input?.ctaStyle, ['solid', 'outline', 'pill'] as const, base.ctaStyle),
  }
}

function relativeLuminance(hexColor: string) {
  const toLin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const r = toLin(parseInt(hexColor.slice(1, 3), 16))
  const g = toLin(parseInt(hexColor.slice(3, 5), 16))
  const b = toLin(parseInt(hexColor.slice(5, 7), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(a: string, b: string) {
  const L1 = relativeLuminance(a)
  const L2 = relativeLuminance(b)
  const hi = Math.max(L1, L2)
  const lo = Math.min(L1, L2)
  return (hi + 0.05) / (lo + 0.05)
}

export function ensureReadableTokens<T extends { text: string; background: string; primary: string }>(tokens: T): T {
  const next = { ...tokens }
  if (contrastRatio(next.text, next.background) < 4.5) {
    next.text = relativeLuminance(next.background) > 0.45 ? '#1A1512' : '#F7F4F0'
  }
  return next
}

export async function loadCatalogContext(admin: ReturnType<typeof createAdmin>, userId: string) {
  const [{ data: products }, { data: collections }] = await Promise.all([
    admin.from('products').select('title').eq('user_id', userId).limit(12),
    admin.from('collections').select('name').eq('user_id', userId).limit(8),
  ])
  return {
    productTitles: (products || []).map((p: { title?: string }) => p.title).filter(Boolean).slice(0, 12) as string[],
    collectionNames: (collections || []).map((c: { name?: string }) => c.name).filter(Boolean).slice(0, 8) as string[],
  }
}

export function inferBrief(prompt: string, storeName?: string): StoreBrief {
  const language = /[ăâîșț]|(\b(și|magazin|vreau|flori|floare|haine)\b)/i.test(prompt) ? 'ro' : 'en'
  const p = prompt.toLowerCase()
  let niche = 'boutique'
  if (/flower|flowers|florist|floral|bouquet|peony|flori|floare|florar/i.test(p)) niche = 'floral'
  else if (/streetwear|sneaker|hoodie|haine|fashion/i.test(p)) niche = 'streetwear'
  else if (/cosmetic|skincare|beauty|makeup|cosmetice/i.test(p)) niche = 'cosmetics'
  else if (/jewel|bijuter|goldsmith/i.test(p)) niche = 'jewelry'
  else if (/kid|kids|copii|toy|toys|jucarii|jucării/i.test(p)) niche = 'kids'
  else if (/coffee|cafe|bakery|food|cafea/i.test(p)) niche = 'food'
  else if (/home|casa|casă|interior|furniture/i.test(p)) niche = 'home'

  let mood = 'modern clean'
  if (/dark|negru|black/i.test(p)) mood = 'dark luxury'
  else if (/lux|premium|elegant|rafina/i.test(p)) mood = 'airy elegant'
  else if (/simple|minimal|clean/i.test(p) && niche === 'floral') mood = 'airy elegant'
  else if (/pink|roz|blush|romantic/i.test(p)) mood = 'soft romantic'
  else if (niche === 'floral') mood = 'airy elegant'

  const hex = prompt.match(/#([0-9a-fA-F]{6})/)
  const blush = /pink|roz|blush/i.test(p)
  const layoutId = inferLayoutId(niche, mood, prompt)
  return {
    layoutId,
    niche,
    mood,
    language,
    storeName: storeName || (niche === 'floral'
      ? (language === 'ro' ? 'Atelier Floral' : 'Bloom')
      : (language === 'ro' ? 'Magazinul meu' : 'My Store')),
    colors: hex
      ? { primary: `#${hex[1].toUpperCase()}` }
      : blush
        ? { primary: '#C97B84', background: '#FBF8F5' }
        : undefined,
    friendReply: language === 'ro'
      ? `Am înțeles — magazin ${niche}, ${mood}. Îl construiesc acum.`
      : `Got it — a ${mood} ${niche} shop. Building it now.`,
  }
}

export function mergeLlmBrief(heuristic: StoreBrief, raw: unknown): StoreBrief {
  if (!raw || typeof raw !== 'object') return heuristic
  const o = raw as Record<string, unknown>
  const nicheRaw = typeof o.niche === 'string' ? o.niche.trim().toLowerCase() : ''
  const generic = !nicheRaw || /^(boutique|store|shop|generic)$/i.test(nicheRaw)
  const colors = o.colors && typeof o.colors === 'object' ? o.colors as Record<string, unknown> : {}
  const hexish = (v: unknown) => typeof v === 'string' && /^#([0-9a-fA-F]{6})$/.test(v) ? v.toUpperCase() : undefined
  return {
    ...heuristic,
    layoutId: isLayoutId(o.layoutId) ? o.layoutId : heuristic.layoutId || inferLayoutId(nicheRaw || heuristic.niche, typeof o.mood === 'string' ? o.mood : heuristic.mood),
    niche: generic && heuristic.niche !== 'boutique' ? heuristic.niche : (nicheRaw || heuristic.niche),
    mood: typeof o.mood === 'string' && o.mood.trim() ? o.mood.trim() : heuristic.mood,
    language: o.language === 'ro' || o.language === 'en' ? o.language : heuristic.language,
    storeName: typeof o.storeName === 'string' && o.storeName.trim() ? o.storeName.trim() : heuristic.storeName,
    friendReply: typeof o.friendReply === 'string' && o.friendReply.trim() ? o.friendReply.trim() : heuristic.friendReply,
    colors: {
      primary: hexish(colors.primary) || heuristic.colors?.primary,
      background: hexish(colors.background) || heuristic.colors?.background,
      text: hexish(colors.text) || heuristic.colors?.text,
    },
  }
}

function asHex(value: unknown) {
  if (typeof value !== 'string') return undefined
  const m = value.trim().match(/^#?([0-9a-fA-F]{6})$/)
  return m ? `#${m[1].toUpperCase()}` : undefined
}

const FONT_SET = new Set([
  'Inter', 'DM Sans', 'Manrope', 'Outfit', 'Nunito Sans', 'Space Grotesk',
  'Playfair Display', 'Cormorant Garamond', 'Libre Baskerville', 'Lora', 'Fraunces', 'Source Serif 4',
])

function pickFont(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return FONT_SET.has(trimmed) ? trimmed : fallback
}

/**
 * Apply LLM design brief (layout + variants + tokens + copy + optional sectionOrder)
 * onto a curated layout skeleton. Does not accept freeform HTML.
 */
export function mergeLlmStoreDesign(base: StorefrontSpec, raw: unknown): {
  spec: StorefrontSpec
  friendReply: string
} {
  if (!raw || typeof raw !== 'object') {
    return {
      spec: base,
      friendReply: base.language === 'ro' ? 'Am pregătit magazinul.' : 'Storefront ready.',
    }
  }
  const o = raw as Record<string, unknown>
  const brief = mergeLlmBrief(
    {
      layoutId: isLayoutId(base.layoutId) ? base.layoutId : inferLayoutId(base.niche, base.mood),
      niche: base.niche,
      mood: base.mood,
      language: base.language,
      storeName: base.copy.storeName,
      friendReply:
        typeof o.friendReply === 'string'
          ? o.friendReply
          : base.language === 'ro'
            ? 'Am pregătit magazinul.'
            : 'Storefront ready.',
      colors: {
        primary: base.tokens.primary,
        background: base.tokens.background,
        text: base.tokens.text,
      },
    },
    o
  )

  let spec = specFromBrief(brief)
  const tokensIn = (o.tokens && typeof o.tokens === 'object' ? o.tokens : {}) as Record<string, unknown>
  const copyIn = (o.copy && typeof o.copy === 'object' ? o.copy : {}) as Record<string, unknown>
  const layoutId = isLayoutId(o.layoutId) ? o.layoutId : spec.layoutId

  spec = {
    ...spec,
    layoutId,
    tokens: ensureReadableTokens({
      ...spec.tokens,
      primary: asHex(tokensIn.primary) || asHex(brief.colors?.primary) || spec.tokens.primary,
      background: asHex(tokensIn.background) || asHex(brief.colors?.background) || spec.tokens.background,
      text: asHex(tokensIn.text) || asHex(brief.colors?.text) || spec.tokens.text,
      accent: asHex(tokensIn.accent) || spec.tokens.accent,
      secondary: asHex(tokensIn.secondary) || spec.tokens.secondary,
      headingFont: pickFont(tokensIn.headingFont, spec.tokens.headingFont) as StorefrontSpec['tokens']['headingFont'],
      bodyFont: pickFont(tokensIn.bodyFont, spec.tokens.bodyFont) as StorefrontSpec['tokens']['bodyFont'],
      navbarStyle: typeof tokensIn.navbarStyle === 'string' ? tokensIn.navbarStyle : spec.tokens.navbarStyle,
      heroLayout: typeof tokensIn.heroLayout === 'string' ? tokensIn.heroLayout : spec.tokens.heroLayout,
      buttonStyle: typeof tokensIn.buttonStyle === 'string' ? tokensIn.buttonStyle : spec.tokens.buttonStyle,
      radius: typeof tokensIn.radius === 'string' ? tokensIn.radius : spec.tokens.radius,
      productCardStyle:
        typeof tokensIn.productCardStyle === 'string' ? tokensIn.productCardStyle : spec.tokens.productCardStyle,
    }),
    copy: {
      ...spec.copy,
      storeName:
        typeof copyIn.storeName === 'string' && copyIn.storeName.trim()
          ? copyIn.storeName.trim()
          : brief.storeName || spec.copy.storeName,
      heroTitle:
        typeof copyIn.heroTitle === 'string' && copyIn.heroTitle.trim()
          ? copyIn.heroTitle.trim()
          : spec.copy.heroTitle,
      heroSubtitle:
        typeof copyIn.heroSubtitle === 'string' && copyIn.heroSubtitle.trim()
          ? copyIn.heroSubtitle.trim()
          : spec.copy.heroSubtitle,
      heroButtonText:
        typeof copyIn.heroButtonText === 'string' && copyIn.heroButtonText.trim()
          ? copyIn.heroButtonText.trim()
          : spec.copy.heroButtonText,
      footer:
        typeof copyIn.footer === 'string' && copyIn.footer.trim() ? copyIn.footer.trim() : spec.copy.footer,
      about: typeof copyIn.about === 'string' && copyIn.about.trim() ? copyIn.about.trim() : spec.copy.about,
      announcement:
        typeof copyIn.announcement === 'string' && copyIn.announcement.trim()
          ? copyIn.announcement.trim()
          : spec.copy.announcement,
      faq: Array.isArray(copyIn.faq) && copyIn.faq.length
        ? (copyIn.faq
            .map((item) => {
              if (!item || typeof item !== 'object') return null
              const row = item as Record<string, unknown>
              const q = typeof row.q === 'string' ? row.q.trim() : ''
              const a = typeof row.a === 'string' ? row.a.trim() : ''
              return q && a ? { q, a } : null
            })
            .filter(Boolean) as Array<{ q: string; a: string }>)
        : spec.copy.faq,
    },
  }

  spec = {
    ...spec,
    layoutId,
    density: ['cozy', 'airy', 'compact'].includes(String(o.density)) ? o.density as StorefrontSpec['density'] : spec.density,
    nav: o.nav && typeof o.nav === 'object'
      ? sanitizeNavVariant({ ...(spec.nav as object), ...(o.nav as object) }, spec.nav)
      : spec.nav,
    productCard: o.productCard && typeof o.productCard === 'object'
      ? sanitizeProductCardVariant({ ...(spec.productCard as object), ...(o.productCard as object) }, spec.productCard)
      : spec.productCard,
    hero: o.hero && typeof o.hero === 'object'
      ? sanitizeHeroVariant({ ...(spec.hero as object), ...(o.hero as object) }, spec.hero)
      : spec.hero,
  } as StorefrontSpec

  const order = Array.isArray(o.sectionOrder)
    ? (o.sectionOrder as string[]).filter((x): x is string => typeof x === 'string')
    : []
  spec = withLayout(spec, layoutId)
  if (order.length >= 4) {
    const catalogTypes = new Set(spec.pages.home.sections.map((s) => s.type))
    const byType = new Map(spec.pages.home.sections.map((s) => [s.type, s]))
    const nextSections = []
    for (const type of order) {
      const existing = byType.get(type as never)
      if (existing) {
        nextSections.push(existing)
        byType.delete(type as never)
      }
    }
    for (const leftover of byType.values()) nextSections.push(leftover)
    for (const required of ['header', 'hero', 'products', 'footer'] as const) {
      if (!nextSections.some((s) => s.type === required)) {
        const missing = spec.pages.home.sections.find((s) => s.type === required)
        if (missing) nextSections.push(missing)
      }
    }
    void catalogTypes
    spec = {
      ...spec,
      pages: { ...spec.pages, home: { sections: nextSections.slice(0, MAX_SECTIONS) } },
    }
  }
  spec = syncCopyIntoSections(spec)

  // Curated sections only — ignore freeform document payloads from the model
  spec = {
    ...spec,
    renderMode: 'sections',
    documentHtml: '',
    documentCss: '',
  } as StorefrontSpec

  return {
    spec: coerceSpec(spec, base),
    friendReply: brief.friendReply,
  }
}

export function sanitizeDocumentHtml(raw: string, maxLen = 48000): string {
  let html = String(raw || '').slice(0, maxLen)
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '')
  html = html.replace(/<\/?iframe\b[^>]*>/gi, '')
  html = html.replace(/<\/?object\b[^>]*>/gi, '')
  html = html.replace(/<\/?embed\b[^>]*>/gi, '')
  html = html.replace(/<\/?form\b[^>]*>/gi, '')
  html = html.replace(/\son\w+\s*=\s*(["'])[\s\S]*?\1/gi, '')
  html = html.replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
  html = html.replace(/(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '$1="#"')
  html = html.replace(/^\s*<!DOCTYPE[\s\S]*?>/i, '')
  html = html.replace(/<\/?(html|head|body)\b[^>]*>/gi, '')
  return html.trim()
}

export function sanitizeDocumentCss(raw: string, maxLen = 24000): string {
  let css = String(raw || '').slice(0, maxLen)
  css = css.replace(/@import\b[^;]+;/gi, '')
  css = css.replace(/expression\s*\(/gi, 'invalid(')
  css = css.replace(/javascript\s*:/gi, 'invalid:')
  return css.trim()
}

export function buildFallbackDocument(spec: StorefrontSpec): { html: string; css: string } {
  const c = spec.copy
  const ro = spec.language === 'ro'
  const html = `
<header class="ai-doc-nav">
  <div class="ai-doc-wrap ai-doc-nav-inner">
    <strong class="ai-doc-brand">${escapeHtml(c.storeName)}</strong>
    <nav class="ai-doc-links">
      <button type="button" data-ai-action="home">${ro ? 'Acasă' : 'Home'}</button>
      <button type="button" data-ai-action="shop">${ro ? 'Magazin' : 'Shop'}</button>
    </nav>
    <span data-ai-slot="cart"></span>
  </div>
</header>
<section class="ai-doc-hero">
  <div class="ai-doc-wrap">
    <p class="ai-doc-kicker">${escapeHtml(c.announcement || (ro ? 'Colecție nouă' : 'New collection'))}</p>
    <h1>${escapeHtml(c.heroTitle)}</h1>
    <p class="ai-doc-lead">${escapeHtml(c.heroSubtitle)}</p>
    <div class="ai-doc-cta">
      <button type="button" class="ai-doc-btn" data-ai-action="shop">${escapeHtml(c.heroButtonText)}</button>
      <span data-ai-slot="shop"></span>
    </div>
  </div>
</section>
<section class="ai-doc-section">
  <div class="ai-doc-wrap">
    <h2>${ro ? 'Produse' : 'Featured'}</h2>
    <div data-ai-slot="products"></div>
  </div>
</section>
<section class="ai-doc-section ai-doc-muted">
  <div class="ai-doc-wrap">
    <h2>${ro ? 'Colecții' : 'Collections'}</h2>
    <div data-ai-slot="collections"></div>
  </div>
</section>
<section class="ai-doc-section">
  <div class="ai-doc-wrap">
    <h2>${ro ? 'Poveste' : 'Our story'}</h2>
    <p class="ai-doc-lead">${escapeHtml(c.about || c.heroSubtitle)}</p>
  </div>
</section>
<footer class="ai-doc-footer">
  <div class="ai-doc-wrap">
    <p>${escapeHtml(c.footer)}</p>
  </div>
</footer>`.trim()
  const css = `
.ai-doc-wrap{width:min(1120px,calc(100% - 2rem));margin-inline:auto}
.ai-doc-nav{position:sticky;top:0;z-index:20;backdrop-filter:blur(12px);background:color-mix(in srgb,var(--ai-bg) 86%,transparent);border-bottom:1px solid color-mix(in srgb,var(--ai-text) 10%,transparent)}
.ai-doc-nav-inner{display:flex;align-items:center;gap:1rem;min-height:4rem}
.ai-doc-brand{font-family:var(--ai-heading),serif;font-size:1.35rem;letter-spacing:-.03em}
.ai-doc-links{display:flex;gap:1rem;margin-left:auto;margin-right:1rem}
.ai-doc-links button{background:none;border:0;cursor:pointer;font:inherit;opacity:.75}
.ai-doc-hero{padding:min(18vh,7rem) 0 4.5rem;background:linear-gradient(160deg,var(--ai-secondary),var(--ai-bg) 55%)}
.ai-doc-kicker{font-size:.7rem;letter-spacing:.28em;text-transform:uppercase;opacity:.55;margin-bottom:1rem}
.ai-doc-hero h1{font-family:var(--ai-heading),serif;font-size:clamp(2.6rem,7vw,5rem);line-height:.95;letter-spacing:-.04em;max-width:14ch;margin:0 0 1rem}
.ai-doc-lead{max-width:38ch;line-height:1.55;opacity:.78;margin:0}
.ai-doc-cta{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.75rem;align-items:center}
.ai-doc-btn{appearance:none;border:0;cursor:pointer;background:var(--ai-primary);color:#fff;padding:.95rem 1.5rem;font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;font-weight:600}
.ai-doc-section{padding:4.5rem 0}
.ai-doc-section h2{font-family:var(--ai-heading),serif;font-size:clamp(1.8rem,3vw,2.6rem);margin:0 0 1.5rem;letter-spacing:-.03em}
.ai-doc-muted{background:var(--ai-secondary)}
.ai-doc-footer{padding:3rem 0;border-top:1px solid color-mix(in srgb,var(--ai-text) 10%,transparent);opacity:.7;font-size:.9rem}
`.trim()
  return { html, css }
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizeMood(mood: string, floral: boolean) {
  if (MOOD_LOOKS[mood]) return mood
  const m = mood.toLowerCase()
  if (m.includes('dark')) return 'dark luxury'
  if (m.includes('romantic') || m.includes('blush') || m.includes('pink') || m.includes('soft')) return 'soft romantic'
  if (m.includes('warm') || m.includes('artisan')) return 'warm artisan'
  if (m.includes('minimal')) return 'minimal modern'
  if (m.includes('elegant') || floral) return 'airy elegant'
  if (m.includes('modern') || m.includes('clean')) return floral ? 'airy elegant' : 'minimal modern'
  return floral ? 'airy elegant' : 'minimal modern'
}

export function specFromBrief(brief: StoreBrief): StorefrontSpec {
  const ro = brief.language === 'ro'
  const floral = /floral|flower/i.test(brief.niche)
  const street = /street/i.test(brief.niche)
  const name = brief.storeName || (floral ? (ro ? 'Atelier Floral' : 'Bloom') : (ro ? 'Magazinul meu' : 'My Store'))
  const layoutId = isLayoutId(brief.layoutId) ? brief.layoutId : inferLayoutId(brief.niche, brief.mood)
  const mood = layoutId === 'luxeDark'
    ? 'dark luxury'
    : layoutId === 'minimal'
      ? 'minimal modern'
      : layoutId === 'warmMarket'
        ? 'warm artisan'
        : normalizeMood(brief.mood, floral)
  const look = MOOD_LOOKS[mood] || MOOD_LOOKS['airy elegant']
  const chrome = LAYOUT_CHROME[layoutId]
  const tokens = ensureReadableTokens({
    ...look,
    ...chrome,
    primary: brief.colors?.primary || (street && layoutId === 'minimal' ? '#111111' : look.primary),
    background: brief.colors?.background || look.background,
    text: brief.colors?.text || look.text,
    headingFont: chrome.headingFont,
    bodyFont: chrome.bodyFont,
    shadow: chrome.navbarStyle === 'solid' ? 'lift' : 'soft',
    productCardStyle: 'minimal' as const,
  })
  const copy = floral
    ? {
        storeName: name,
        heroTitle: ro ? 'Flori proaspete, livrate cu grijă' : 'Fresh flowers, delivered with care',
        heroSubtitle: ro
          ? 'Buchete de sezon, tije alese și cadouri împachetate de mână.'
          : 'Seasonal bouquets, cut stems, and gifts packed by hand.',
        heroButtonText: ro ? 'Comandă un buchet' : 'Order a bouquet',
        heroImageUrl: heroFor(brief.niche, mood),
        logoUrl: null,
        footer: `© ${name}.`,
        about: ro
          ? `${name} este un atelier floral ${mood} — buchete pentru fiecare zi și pentru zilele importante.`
          : `${name} is a ${mood} flower studio for everyday bouquets and special days.`,
        announcement: ro ? 'Livrare în aceeași zi în oraș' : 'Same-day delivery in the city',
        faq: [
          { q: ro ? 'Cât durează livrarea?' : 'How fast is shipping?', a: ro ? 'În aceeași zi în oraș, 24–48h în restul țării.' : 'Same day in the city, 24–48h nationwide.' },
        ],
      }
    : {
        storeName: name,
        heroTitle: ro ? `Bun venit la ${name}` : `Welcome to ${name}`,
        heroSubtitle: ro ? 'Produse alese cu grijă, livrate cu atenție.' : 'Thoughtful pieces, carefully packed.',
        heroButtonText: ro ? 'Cumpără acum' : 'Shop now',
        heroImageUrl: heroFor(brief.niche, mood),
        logoUrl: null,
        footer: `© ${name}.`,
        about: `${name} — ${mood} ${brief.niche}.`,
        announcement: ro ? 'Livrare în toată România' : 'Nationwide delivery',
        faq: [
          { q: ro ? 'Cât durează livrarea?' : 'How fast is shipping?', a: ro ? '24–48h, acasă sau locker.' : '24–48h, home or locker.' },
        ],
      }
  return withLayout(specSchema.parse({
    version: 1,
    layoutId,
    niche: brief.niche,
    mood,
    language: brief.language,
    tokens,
    copy,
    customCss: '',
    pages: {
      home: { sections: sectionsForLayout(layoutId, copy, brief.language) },
      catalog: { layout: 'grid', filters: true, cardStyle: 'minimal' },
      product: { gallery: 'stack', tabs: true, related: true },
    },
  }), layoutId)
}

export function coerceSpec(raw: unknown, fallback: StorefrontSpec): StorefrontSpec {
  const parsed = specSchema.safeParse(raw)
  if (parsed.success) {
    const types = parsed.data.pages.home.sections.map((s) => s.type)
    if (['header', 'hero', 'products', 'footer'].every((t) => types.includes(t as never))) {
      const spec = parsed.data.layoutId ? parsed.data : { ...parsed.data, layoutId: inferLayoutId(parsed.data.niche, parsed.data.mood) as LayoutId }
      return { ...spec, tokens: ensureReadableTokens(spec.tokens) }
    }
  }
  return fallback
}

function normalizePatchPath(path: string): string {
  let p = String(path || '').trim()
  if (!p) return ''
  if (!p.startsWith('/')) p = `/${p}`
  // Remap common LLM mistakes onto allowed copy paths
  if (p.startsWith('/pages/') && /\/faqItems$|\/faq$/i.test(p)) return '/copy/faq'
  if (p.startsWith('/pages/') && /announcement/i.test(p)) return '/copy/announcement'
  if (p.startsWith('/pages/') && /about/i.test(p)) return '/copy/about'
  if (/^\/copy\/faqItems$/i.test(p)) return '/copy/faq'
  return p
}

export function normalizeFaqItems(value: unknown): Array<{ q: string; a: string }> {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const q = String(row.q || row.question || row.title || '').trim()
      const a = String(row.a || row.answer || row.body || '').trim()
      if (!q) return null
      return { q: q.slice(0, 160), a: (a || '—').slice(0, 600) }
    })
    .filter(Boolean) as Array<{ q: string; a: string }>
}

export function sanitizeRefinePatches(patches: unknown[]): Array<{ op: string; path: string; value?: unknown }> {
  const out: Array<{ op: string; path: string; value?: unknown }> = []
  for (const p of patches) {
    if (!p || typeof p !== 'object') continue
    const rec = p as { op?: string; path?: string; value?: unknown }
    const path = normalizePatchPath(String(rec.path || ''))
    if (!(
      path === '/layoutId' ||
      path === '/density' ||
      path === '/customCss' ||
      path.startsWith('/tokens/') ||
      path.startsWith('/copy/') ||
      path.startsWith('/nav') ||
      path.startsWith('/productCard') ||
      path.startsWith('/hero') ||
      path === '/pages/home/sections'
    )) {
      console.log('[ai-studio] drop patch (disallowed path)', rec.path, '→', path)
      continue
    }
    const op = rec.op === 'add' || rec.op === 'remove' || rec.op === 'replace' ? rec.op : 'replace'
    let value = rec.value
    if (path === '/copy/faq') value = normalizeFaqItems(value)
    if (path === '/density') {
      value = pickEnum(value, ['cozy', 'airy', 'compact'] as const, 'airy')
    }
    if (path === '/layoutId') {
      if (!isLayoutId(value)) {
        console.log('[ai-studio] drop patch (bad layoutId)', value)
        continue
      }
    }
    if (path === '/nav') value = sanitizeNavVariant(value)
    if (path === '/nav/style') {
      value = sanitizeNavVariant({ style: value }).style
    }
    if (path === '/nav/layout') {
      value = sanitizeNavVariant({ layout: value }).layout
    }
    if (path === '/productCard') value = sanitizeProductCardVariant(value)
    if (path === '/productCard/style') {
      value = sanitizeProductCardVariant({ style: value }).style
    }
    if (path === '/productCard/imageRatio') {
      value = sanitizeProductCardVariant({ imageRatio: value }).imageRatio
    }
    if (path === '/hero') value = sanitizeHeroVariant(value)
    if (path === '/hero/layout') {
      value = sanitizeHeroVariant({ layout: value }).layout
    }
    if (path === '/hero/overlay') {
      value = sanitizeHeroVariant({ overlay: value }).overlay
    }
    if (path === '/hero/ctaStyle') {
      value = sanitizeHeroVariant({ ctaStyle: value }).ctaStyle
    }
    out.push({ op, path, value })
  }
  console.log('[ai-studio] sanitizeRefinePatches', { in: patches.length, out: out.length, paths: out.map((p) => p.path) })
  return out
}

export function syncCopyIntoSections(spec: StorefrontSpec): StorefrontSpec {
  const copy = spec.copy
  let sections = spec.pages.home.sections.map((section) => {
    if (section.type === 'faq') {
      return { ...section, props: { ...section.props, faqItems: copy.faq } }
    }
    if (section.type === 'about') {
      return { ...section, props: { ...section.props, text: copy.about } }
    }
    if (section.type === 'announcement') {
      return { ...section, props: { ...section.props, text: copy.announcement } }
    }
    if (section.type === 'hero') {
      return {
        ...section,
        props: {
          ...section.props,
          title: copy.heroTitle,
          subtitle: copy.heroSubtitle,
          buttonText: copy.heroButtonText,
          imageUrl: copy.heroImageUrl,
        },
      }
    }
    if (section.type === 'marquee') {
      return { ...section, props: { ...section.props, marqueeText: copy.announcement || copy.storeName } }
    }
    return section
  })

  // Ensure FAQ is visible when copy has FAQ items (minimal/editorial omit it by default)
  if (Array.isArray(copy.faq) && copy.faq.length > 0 && !sections.some((s) => s.type === 'faq')) {
    const faqSection = { id: 'faq', type: 'faq' as const, visible: true, props: { title: 'FAQ', faqItems: copy.faq } }
    const footerIdx = sections.findIndex((s) => s.type === 'footer')
    if (footerIdx >= 0) sections = [...sections.slice(0, footerIdx), faqSection, ...sections.slice(footerIdx)]
    else sections = [...sections, faqSection]
    console.log('[ai-studio] syncCopyIntoSections inserted missing faq section')
  }

  return {
    ...spec,
    pages: {
      ...spec.pages,
      home: { sections },
    },
  }
}

export function faqItemsFromPrompt(prompt: string, language: 'ro' | 'en'): Array<{ q: string; a: string }> | null {
  if (!/\bfaq\b|întrebăr|intrebari|questions?/i.test(prompt)) return null

  const questions: string[] = []
  for (const match of prompt.matchAll(/[„""']([^"'„”]{6,160})[„""']/g)) {
    questions.push(match[1].trim())
  }

  if (!questions.length) {
    const after = prompt.split(/\b(?:questions?|întrebări|intrebari)\b\s*:?\s*/i)[1]
    if (after) {
      const chunks = after
        .split(/\s*(?:,?\s*and another question\s*:?|și (?:încă |altă )?o? ?întrebare\s*:?|;|\n|\d+\.\s*)\s*/i)
        .map((s) => s.replace(/^[:\-–—\s]+/, '').replace(/\s+/g, ' ').trim())
        .filter((s) => s.length >= 6 && s.length <= 160 && !/^(only|doar|cu|with|2|two)\b/i.test(s))
      questions.push(...chunks)
    }
  }

  // Bare "care este … , … livrarea" style without the word "questions"
  if (!questions.length && /\bfaq\b/i.test(prompt)) {
    const afterFaq = prompt.split(/\bfaq\b/i)[1] || ''
    const chunks = afterFaq
      .split(/\s*(?:,?\s*and another question\s*:?|and\s+|și\s+|;\s*|\n)/i)
      .map((s) => s.replace(/^[^a-zăâîșțA-ZĂÂÎȘȚ]+/, '').replace(/\s+/g, ' ').trim())
      .filter((s) => s.length >= 8 && s.length <= 160 && /[?]|\b(care|cât|cat|cum|what|how|when|who)\b/i.test(s))
    questions.push(...chunks)
  }

  const unique = [...new Set(questions.map((q) => q.replace(/[?.,;:]+$/, '').trim()).filter(Boolean))]
  if (!unique.length) return null

  const items = unique.slice(0, 8).map((raw) => {
    const q = `${raw.charAt(0).toUpperCase()}${raw.slice(1)}?`.replace(/\?+$/, '?')
    return { q, a: answerForFaq(raw, language) }
  })
  console.log('[ai-studio] faqItemsFromPrompt', items)
  return items
}

function answerForFaq(question: string, language: 'ro' | 'en') {
  const p = question.toLowerCase()
  if (/livrar|shipping|delivery|cost[aă]|preț|pret|price|cât cost|cat cost/i.test(p)) {
    return language === 'ro'
      ? 'Livrarea se calculează la checkout — de obicei 15–25 lei în oraș, sau gratuit peste o valoare minimă a comenzii.'
      : 'Delivery is calculated at checkout — typically a small city fee, or free above a minimum order.'
  }
  if (/frumos|buchet|bouquet|best|recomand/i.test(p)) {
    return language === 'ro'
      ? 'Cel mai frumos buchet este cel de sezon, aranjat de mână în ziua livrării — îți recomandăm selecția din vitrină.'
      : 'The loveliest bouquet is the seasonal one, arranged by hand on the day of delivery.'
  }
  return language === 'ro'
    ? 'Scrie-ne un mesaj și îți răspundem cu detalii.'
    : 'Send us a message and we will get back with details.'
}

export function applyPatches(spec: StorefrontSpec, patches: Array<{ op: string; path: string; value?: unknown }>): StorefrontSpec {
  console.log('[ai-studio] applyPatches:in', {
    paths: patches.map((p) => p.path),
    beforeFaq: spec.copy?.faq,
    beforePrimary: spec.tokens?.primary,
    layoutId: spec.layoutId,
  })

  let current: any = JSON.parse(JSON.stringify(spec))
  for (const patch of patches) {
    const tokens = patch.path.split('/').filter(Boolean).map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
    if (!tokens.length) continue
    let parent: any = current
    for (let i = 0; i < tokens.length - 1; i++) {
      if (parent?.[tokens[i]] == null || typeof parent[tokens[i]] !== 'object') {
        parent[tokens[i]] = {}
      }
      parent = parent[tokens[i]]
    }
    const last = tokens[tokens.length - 1]
    if (!parent || typeof parent !== 'object') continue
    if (Array.isArray(parent)) {
      const idx = last === '-' ? parent.length : Number(last)
      if (patch.op === 'remove') parent.splice(idx, 1)
      else if (patch.op === 'add') parent.splice(idx, 0, patch.value)
      else parent[idx] = patch.value
    } else if (patch.op === 'remove') delete parent[last]
    else parent[last] = patch.value
  }

  if (current?.copy?.faq !== undefined) {
    current.copy.faq = normalizeFaqItems(current.copy.faq)
  }

  // Prefer a full schema parse, but never discard token/copy/layout patches if parse fails
  const parsed = specSchema.safeParse(current)
  let next: StorefrontSpec
  if (parsed.success) {
    const types = parsed.data.pages.home.sections.map((s) => s.type)
    if (['header', 'hero', 'products', 'footer'].every((t) => types.includes(t as never))) {
      next = parsed.data
    } else {
      console.warn('[ai-studio] applyPatches: coerce missing required sections — soft-merging')
      next = softMergePatchedFields(spec, current)
    }
  } else {
    console.warn('[ai-studio] applyPatches: coerce failed — soft-merging', parsed.error.issues?.slice(0, 5))
    next = softMergePatchedFields(spec, current)
  }

  if (isLayoutId(next.layoutId) && next.layoutId !== spec.layoutId) {
    console.log('[ai-studio] applyPatches: layout change', spec.layoutId, '→', next.layoutId)
    try {
      next = withLayout(next, next.layoutId)
    } catch (err) {
      console.error('[ai-studio] withLayout failed after layout change — keeping soft merge', err)
      next = { ...next, layoutId: next.layoutId }
    }
  }
  next = syncCopyIntoSections({ ...next, tokens: ensureReadableTokens(next.tokens) })

  console.log('[ai-studio] applyPatches:out', {
    afterFaq: next.copy?.faq,
    afterPrimary: next.tokens?.primary,
    layoutId: next.layoutId,
    hasFaqSection: next.pages.home.sections.some((s) => s.type === 'faq'),
  })
  return next
}

function softMergePatchedFields(base: StorefrontSpec, patched: any): StorefrontSpec {
  const copyIn = patched?.copy && typeof patched.copy === 'object' ? patched.copy : {}
  const tokensIn = patched?.tokens && typeof patched.tokens === 'object' ? patched.tokens : {}
  return {
    ...base,
    layoutId: isLayoutId(patched?.layoutId) ? patched.layoutId : base.layoutId,
    density: ['cozy', 'airy', 'compact'].includes(patched?.density) ? patched.density : base.density,
    nav: patched?.nav && typeof patched.nav === 'object'
      ? sanitizeNavVariant({ ...(base.nav as object), ...patched.nav }, base.nav)
      : base.nav,
    productCard: patched?.productCard && typeof patched.productCard === 'object'
      ? sanitizeProductCardVariant({ ...(base.productCard as object), ...patched.productCard }, base.productCard)
      : base.productCard,
    hero: patched?.hero && typeof patched.hero === 'object'
      ? sanitizeHeroVariant({ ...(base.hero as object), ...patched.hero }, base.hero)
      : base.hero,
    customCss: typeof patched?.customCss === 'string' ? patched.customCss : base.customCss,
    tokens: {
      ...base.tokens,
      ...Object.fromEntries(
        Object.entries(tokensIn).filter(([, v]) => v !== undefined && v !== null && v !== '')
      ),
    },
    copy: {
      ...base.copy,
      ...Object.fromEntries(
        Object.entries(copyIn).filter(([, v]) => v !== undefined && v !== null)
      ),
      faq: copyIn.faq !== undefined ? normalizeFaqItems(copyIn.faq) : base.copy.faq,
    },
    pages: patched?.pages?.home?.sections ? patched.pages : base.pages,
  }
}

export function verifySpec(spec: StorefrontSpec): string[] {
  const errors: string[] = []
  const types = spec.pages.home.sections.map((s) => s.type)
  for (const required of ['header', 'hero', 'products', 'footer'] as const) {
    if (!types.includes(required)) errors.push(`Missing required section: ${required}`)
  }
  if (contrastRatio(spec.tokens.text, spec.tokens.background) < 4.2) {
    errors.push('Text/background contrast is too low')
  }
  if (!spec.copy.heroTitle?.trim()) errors.push('Missing hero title')
  if (!spec.copy.storeName?.trim()) errors.push('Missing store name')
  if (Array.isArray(spec.copy.faq) && spec.copy.faq.length) {
    const faqSection = spec.pages.home.sections.find((s) => s.type === 'faq')
    if (!faqSection) errors.push('FAQ copy present but no faq section')
  }
  return errors
}

export function variantSummary(spec: StorefrontSpec, language: 'ro' | 'en' = 'en') {
  const nav = (spec as any).nav?.style || spec.tokens.navbarStyle
  const card = (spec as any).productCard?.style || spec.tokens.productCardStyle
  const hero = (spec as any).hero?.layout || spec.tokens.heroLayout
  const layout = layoutLabel(spec.layoutId, language)
  return language === 'ro'
    ? `${layout} · Nav ${nav} · Carduri ${card} · Hero ${hero}`
    : `${layout} · ${nav} nav · ${card} cards · ${hero} hero`
}

const SYSTEM_TYPES = new Set(['header', 'hero', 'collections', 'products', 'reviews', 'footer'])

export function specToCustomization(spec: StorefrontSpec, userId: string) {
  const t = spec.tokens
  const c = spec.copy
  const sections = spec.pages.home.sections
  const builderSections = sections.map((s) => {
    if (SYSTEM_TYPES.has(s.type)) return { id: s.id, type: s.type, visible: s.visible !== false }
    return { id: `block-${s.id}`, type: 'block', visible: s.visible !== false, blockId: s.id, blockType: s.type }
  })
  return {
    user_id: userId,
    template_id: 'ai',
    primary_color: t.primary,
    background_color: t.background,
    text_color: t.text,
    accent_color: t.accent,
    secondary_color: t.secondary,
    hero_image_url: c.heroImageUrl || heroFor(spec.niche, spec.mood),
    logo_url: c.logoUrl || null,
    hero_title: c.heroTitle,
    hero_subtitle: c.heroSubtitle,
    hero_button_text: c.heroButtonText,
    store_name: c.storeName,
    font_family: t.bodyFont,
    heading_font: t.headingFont,
    border_radius: t.radius || 'rounded-lg',
    button_style: t.buttonStyle || 'solid',
    hero_layout: t.heroLayout || 'center',
    product_card_style: t.productCardStyle || 'minimal',
    show_collection_images: sections.find((s) => s.type === 'collections')?.visible !== false,
    show_hero_section: sections.find((s) => s.type === 'hero')?.visible !== false,
    show_reviews: sections.find((s) => s.type === 'reviews')?.visible !== false,
    navbar_style: t.navbarStyle || 'glass',
    footer_text: c.footer,
    gradient_enabled: true,
    animation_style: 'smooth',
    builder_config: { version: 1, sections: builderSections },
  }
}

export function specToBlocks(spec: StorefrontSpec, userId: string) {
  return spec.pages.home.sections
    .filter((s) => !SYSTEM_TYPES.has(s.type))
    .map((s, i) => ({
      user_id: userId,
      template_id: 'ai',
      block_type: s.type,
      block_order: i,
      title: (s.props as { title?: string })?.title || s.type,
      content: s.props || {},
      is_visible: s.visible !== false,
    }))
}

export async function ensureStorefront(admin: ReturnType<typeof createAdmin>, userId: string) {
  const { data } = await admin.from('ai_storefronts').select('*').eq('user_id', userId).maybeSingle()
  if (data) return data
  const { data: created, error } = await admin.from('ai_storefronts').insert({ user_id: userId }).select('*').single()
  if (error) throw error
  return created
}

export async function ensureConversation(admin: ReturnType<typeof createAdmin>, userId: string, storefrontId: string, conversationId?: string) {
  if (conversationId) {
    const { data } = await admin.from('ai_conversations').select('*').eq('id', conversationId).eq('user_id', userId).maybeSingle()
    if (data) return data
  }
  const { data, error } = await admin.from('ai_conversations').insert({ user_id: userId, storefront_id: storefrontId }).select('*').single()
  if (error) throw error
  return data
}

export async function countToday(admin: ReturnType<typeof createAdmin>, userId: string, kind: string) {
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  const { count } = await admin
    .from('ai_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', kind)
    .gte('created_at', since.toISOString())
  return count || 0
}

export async function insertMessage(admin: ReturnType<typeof createAdmin>, row: Record<string, unknown>) {
  await admin.from('ai_messages').insert(row)
}

export function sseResponse(write: (send: (event: string, data: unknown) => void) => Promise<void>) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      try {
        await write(send)
      } catch (err) {
        send('error', { step: 'error', error: err instanceof Error ? err.message : 'Unknown error' })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })
}
