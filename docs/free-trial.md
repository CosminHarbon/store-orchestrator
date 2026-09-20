# SpeedVendors 7-day free trial

## How it fits the existing billing system

No second subscription system was added. The trial reuses:

| Existing piece | How the trial uses it |
| --- | --- |
| `billing_settings` (singleton) | Gains `trial_duration_days` (7) and `trial_program_started_at` (the **cutover**). |
| `entitlements` / `billing_subscriptions` | No rows are ever created for a trial. "Is subscribed" decisions (`/subscribe`, checkout, `has_entitlement`) use the new `user_has_paid_entitlement()` (the original logic), so trial users are still treated as unsubscribed. |
| `user_has_active_entitlement()` | The "may use the app" check that **already-deployed Edge Functions call**. It now also honours an active trial, so those functions need **no redeploy**. |
| `has_speedvendors_access()` + the 14 restrictive write policies | Now also allow an active trial (via `user_has_speedvendors_access`). Every existing RLS write guard therefore enforces the trial with no per-table changes. |
| SECURITY DEFINER write RPCs (`bulk_update_stock`, `save_product_variants`, `return_order_items`, `restore_order_stock`) | These bypass RLS and were callable by any signed-in user without an entitlement check. The migration injects `assert_entitlement_if_end_user()` (no-op for `service_role` / anonymous callers). |
| `requireSpeedVendorsEntitlement` (Edge) | Updated to call `user_has_speedvendors_access` (with a safe fallback). The 10 gated Functions do not need redeploying for trials to work (see above). |
| `notifyMerchant` → `send-push-notification` | Push channel for reminders (now returns a delivery result). |
| Superadmin (`is_superadmin()` = role + AAL2) | Authorises every admin RPC / Edge Function. |

New: `user_trials`, `trial_reminders`, `admin_audit_log`, `deleted_account_archive`
(migration `20260920120000_free_trial_system.sql`).

## Access rule (single source of truth, in Postgres)

`user_has_speedvendors_access(uid)`:

1. superadmin → allowed
2. active paid entitlement (Stripe, access code, manual…) → allowed
3. active trial (`trial_started_at <= now() < trial_ends_at`) → allowed
4. has a trial row but trial is over → **locked, even if `billing_settings.enforcement_enabled = false`**
5. no trial row (legacy user) → `not enforcement_enabled` (unchanged from today)

Rule 4 is what makes an expired trial lock without flipping the global flag for existing users.
The client never decides access; `trial_ends_at` is compared to the database clock.

`subscription_status` (`trialing | trial_expired | active | past_due | cancelled`) is materialised on
`user_trials` and recomputed by `compute_subscription_status()` on Stripe/entitlement changes (triggers),
by the hourly sweep, and lazily on reads. Access never reads the materialised column.

## Existing users are not granted trials

* Nothing is back-filled. The migration inserts **zero** rows.
* Only `auth.users` inserted after the migration get a row (AFTER INSERT trigger, `trial_started_at = created_at`).
* Self-heal (`get_my_trial_status`) only creates a row if `created_at >= trial_program_started_at`.
* A superadmin can explicitly grant/extend a trial for a legacy user (audited).

## Reminders

Windows are 24h wide so an hourly cron cannot skip one:

| Milestone | Remaining time | Note |
| --- | --- | --- |
| `3d` | 72h–48h | only if the trial is longer than 72h |
| `1d` | 48h–24h | only if the trial is longer than 48h |
| `final` | 24h–0 | |
| `expired` | ended < 72h ago, not converted | |

Each is claimed by `INSERT … ON CONFLICT DO NOTHING` under a unique index
`(user_id, milestone, trial_ends_at) WHERE trigger_source='cron'`, so overlapping cron runs or restarts
cannot double-send (delivery is at-most-once). Extending a trial changes `trial_ends_at`, which re-arms the
milestones for the new end date. Manual admin sends are stored separately and never consume a milestone.

Channels: **in-app** (the persisted row + server-driven banner/Settings card), **push** (existing FCM path),
**email** (optional — see below). Per-channel results are stored in `trial_reminders.channels`.

### Email

There is no transactional-email provider in the project today (Supabase Auth mails only). Email is sent
through Resend **only if** these Edge secrets are set; otherwise it is recorded as `skipped:not_configured`:

```
supabase secrets set RESEND_API_KEY=… TRIAL_EMAIL_FROM='SpeedVendors <billing@your-verified-domain>' APP_URL=https://www.speedvendors.com
```

## Scheduling (NOT applied automatically)

The project has no scheduler configured. After the migration and functions are deployed, enable
`pg_cron` + `pg_net` (Dashboard → Database → Extensions), store the service-role key in Vault as
`service_role_key`, then run once in the SQL editor:

```sql
select cron.schedule(
  'trial-reminders-hourly',
  '7 * * * *',
  $$
  select net.http_post(
    url     := 'https://mkkqbekhvcnwcheegjpy.supabase.co/functions/v1/trial-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

Without it nothing breaks: access, expiry locking and the UI are all computed live. Only reminders and the
materialised status refresh depend on the sweep (the status also refreshes on every admin read and on each
user's own status read).

## Account deletion

Edge Function `admin-delete-user` (service role, server-side only):

1. authenticate; Postgres must confirm role = superadmin **and** AAL2
2. recent MFA: JWT `amr` must contain a TOTP verification ≤ 5 minutes old (the dialog collects a fresh code)
3. re-verify server-side: typed email (exact), `DELETE`, acknowledgement
4. refuse: self, other superadmins, accounts with an open Stripe subscription
5. audit `user_delete_started` (fail closed — no audit, no delete)
6. snapshot retained records into `deleted_account_archive` (paid/invoiced/COD/refunded orders + items + payments + billing history)
7. remove storage objects listed in `media_assets`, then `auth.admin.deleteUser` (FKs cascade the rest), then delete rows from tables that have **no cascading FK** to `auth.users` (`collections`, `discounts`, `template_blocks`, `reviews`, `push_tokens` — verified against production; never financial tables)
8. re-count rows across every `user_id` table, audit `user_deleted` with leftovers

**Why the archive:** `orders.user_id → auth.users ON DELETE CASCADE`, so deleting the auth user would
otherwise destroy invoiced orders. Changing those FKs on a live table was judged too risky; the snapshot
keeps the legally relevant data without touching existing constraints. Stripe Connect accounts are
listed in the audit metadata but **not** disconnected (Standard accounts belong to the merchant).

## Production verification (2026-09-20)

Migrations `20260920120000` (trial system) and `20260920130000` (privilege hardening) were applied to project
`mkkqbekhvcnwcheegjpy`; `billing-entitlement-status`, `trial-reminders` and `admin-delete-user` were deployed.
A disposable merchant was driven through the real endpoints (signup trigger → 7-day trial → guarded writes →
forced expiry → lockout → cron reminders once-only → entitlement written → instant unlock) and then deleted:
57/57 checks passed and production was left with no test data. Not verifiable without an admin session +
authenticator code (verified only on a scratch database): superadmin list/extend/reminder and the delete flow.

Known, deliberate gaps: the hourly cron is not scheduled; email needs a provider; a user can still obtain a
second trial with a different email address (no card/phone signal exists to prevent that).

## Tests

```
# SQL: 184 checks on a scratch Postgres (real billing migration + both trial migrations, applied twice; stubs for auth/roles)
PGHOST=/tmp PGPORT=5432 PGUSER=postgres scripts/free-trial/run-selftest.sh

# Edge logic (Deno): 27 checks
deno run --allow-env --allow-net --no-lock scripts/free-trial/edge-selftest.ts
```

## Production notes (verified read-only against project `mkkqbekhvcnwcheegjpy` on 2026-09-20)

* `billing_settings.enforcement_enabled` was already **true** (since 2026-08-29): before this change every new signup is locked out until it pays. The trial is what unlocks them.
* The local `supabase/migrations` files and the remote migration history are **out of sync** (same changes applied under different versions). **Never run `supabase db push` / `migration up`** — apply this migration on its own (`supabase db query --linked -f`, inside a transaction) and record it with `supabase migration repair --status applied 20260920120000`.
* `ai-studio-publish` / `ai-studio-v2-critique` in production are newer than `origin/main` and cannot be downloaded for comparison, so they are deliberately **not redeployed** from this branch.

## Deploy order

1. Apply migration `20260920120000_free_trial_system.sql` (idempotent; runs in one transaction)
2. Deploy exactly three Edge Functions: `billing-entitlement-status` (changed), `trial-reminders` and `admin-delete-user` (new)
3. Deploy the frontend (web, then iOS/Android builds)
4. (Optional) set email secrets; create the cron schedule

The old client keeps working against the new backend (`has_access` is now true for a trial user). Deploying
`billing-entitlement-status` must follow the migration immediately: the *old* function recomputes `has_access`
without knowing about trials.

## Rollback

* Frontend/Edge: redeploy previous versions.
* DB: `drop trigger on_auth_user_created_trial on auth.users; drop trigger billing_subscriptions_refresh_trial on public.billing_subscriptions; drop trigger entitlements_refresh_trial on public.entitlements;`
  then restore the previous bodies of `has_speedvendors_access()` / `get_my_entitlement_status()`
  (20260827141430 / 20260830010000). Tables can be left in place.
