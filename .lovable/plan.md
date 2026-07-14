## Goal

Move the app off the freshly-enabled Lovable Cloud backend and point it at your restored Supabase project (`mkkqbekhvcnwcheegjpy`), then redeploy every edge function and reconfigure secrets there so all functionality returns.

## Important caveat about Lovable Cloud

You just enabled Lovable Cloud, which provisioned a managed Supabase instance and wrote its URL/key into `.env`. Lovable Cloud cannot be uninstalled from a project once added — but we can still make the app talk to your external project by overriding the client config. The managed Cloud backend will remain provisioned in the background but unused.

The cleanest, fully-supported path is for you to do one manual step in the Lovable UI: **disconnect Lovable Cloud's Supabase link and connect your external Supabase project instead** (Connectors → Supabase → Connect, then paste your project ref). That regenerates `src/integrations/supabase/client.ts`, `types.ts`, and `.env` against `mkkqbekhvcnwcheegjpy` automatically. Once you've done that, I take over.

## Steps I'll do after you connect the new Supabase project

1. **Verify connection** — confirm `.env` and `src/integrations/supabase/client.ts` now point at `mkkqbekhvcnwcheegjpy`, and regenerate `types.ts` against your restored schema.

2. **Redeploy edge functions** to the new project. All source is already in `supabase/functions/`:
   - `store-api` — public storefront API (products, orders, reviews, checkout)
   - `netopia-payment` — card payment callbacks
   - `push-notification` — OneSignal sender
   - `oblio-invoice` — invoice generation
   - `eawb-quoting`, `eawb-delivery`, `diagnose-eawb`, `test-eawb-connection` — shipping
   - `ai-chat` — AI assistant

3. **Reconfigure edge function secrets** on the new project. Your old secrets don't carry over. I'll request:
   - `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`
   - `MAPBOX_PUBLIC_TOKEN`
   - Netopia credentials (signature, public key)
   - Oblio credentials (email, secret)
   - eAWB credentials (Sameday/Cargus API keys)
   - Any others surfaced when I open each function

   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are auto-injected on the new project.

4. **Verify auth configuration**:
   - Site URL + redirect URLs set to `https://www.speedvendors.com/auth/callback` and preview URL
   - Google OAuth provider re-enabled (you'll need to re-add the Google client ID/secret in your Supabase dashboard, since OAuth provider config lives in Supabase, not in code)
   - Email templates re-uploaded if you customized them

5. **Sanity-check the restored schema** — run the linter and read key tables (`profiles`, `products`, `orders`, `reviews`, `push_tokens`, `template_customization`) to confirm RLS policies and GRANTs came through the backup restore. Patch any missing GRANTs via migration.

6. **Test critical flows**:
   - Sign in / sign up
   - Load storefront via `store-api`
   - Place a cash order → push notification fires
   - Reviews submit + moderate

## What I need from you before I start building

- **Do the Cloud → external Supabase swap in the Lovable UI** (Connectors panel). Confirm here once done.
- Have your third-party API keys ready (OneSignal, Netopia, Oblio, eAWB, Mapbox) — I'll request them one at a time via the secure form.
- Re-add Google OAuth in your new Supabase dashboard (Authentication → Providers → Google) since that config isn't in code.

Reply "done, connected" once the Supabase swap is complete and I'll proceed with steps 1–6.
