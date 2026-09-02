import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  AuthError,
  corsHeaders,
  createAdmin,
  json,
  requireUser,
  sseResponse,
} from '../_shared/aiStudio.ts'
import { runVisualCritiqueCycle } from '../_shared/aiStudioV2Critique.ts'
import {
  isEntitlementRequiredError,
  requireSpeedVendorsEntitlement,
} from '../_shared/billingEntitlement.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const admin = createAdmin()
  try {
    const user = await requireUser(req, admin)
    await requireSpeedVendorsEntitlement(admin, user.id)
    const body = await req.json()

    const designSpec = body.designSpec
    const document = body.document
    const brandSystem = body.brandSystem
    const screenshots = Array.isArray(body.screenshots) ? body.screenshots : []
    const cycle = Math.max(1, Math.min(3, Number(body.cycle) || 1))
    const previousScorecard = body.previousScorecard ?? null

    if (!designSpec || !document || !brandSystem) {
      return json({ error: 'designSpec, document, and brandSystem are required' }, 400)
    }
    if (!screenshots.length) {
      return json({ error: 'screenshots required (desktop and/or mobile)' }, 400)
    }

    // Cap payload: reject absurd screenshot sizes (~4MB base64 each)
    for (const shot of screenshots) {
      if (!shot?.base64 || typeof shot.base64 !== 'string') {
        return json({ error: 'Each screenshot needs base64' }, 400)
      }
      if (shot.base64.length > 5_500_000) {
        return json({ error: 'Screenshot too large — compress before upload' }, 413)
      }
      if (shot.mimeType && typeof shot.mimeType === 'string' && !shot.mimeType.startsWith('image/')) {
        return json({ error: `Invalid mimeType: ${shot.mimeType}` }, 400)
      }
    }

    return sseResponse(async (send) => {
      try {
        await runVisualCritiqueCycle({
          designSpec,
          document,
          brandSystem,
          screenshots: screenshots.map((s: {
            viewport?: string
            mimeType?: string
            base64: string
            widthPx?: number
            heightPx?: number
            blankSuspect?: boolean
            meta?: { widthPx?: number; heightPx?: number; blankSuspect?: boolean }
          }) => ({
            viewport: s.viewport || 'desktop',
            mimeType: s.mimeType || 'image/jpeg',
            base64: s.base64,
            widthPx: s.widthPx ?? s.meta?.widthPx,
            heightPx: s.heightPx ?? s.meta?.heightPx,
            blankSuspect: s.blankSuspect ?? s.meta?.blankSuspect,
          })),
          cycle,
          previousScorecard,
          send,
          admin,
          userId: user.id,
          conversationId: body.conversationId,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        send('error', { step: 'error', error: message, message })
      }
    })
  } catch (err) {
    if (err instanceof AuthError) return json({ error: err.message }, 401)
    if (isEntitlementRequiredError(err)) return json({ error: 'entitlement_required' }, 403)
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
