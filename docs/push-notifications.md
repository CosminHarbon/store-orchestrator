# Push Notifications (FCM + Capacitor) — SpeedVendors

**Status:** infrastructure implemented in code.  
**Push delivery is NOT verified** until Firebase + APNs credentials are configured and tested on physical devices.

Canonical IDs (reconciled with App Store):

- **Capacitor `appId` / iOS Bundle ID:** `com.speedvendors` (existing App Store app, Apple ID 6756231707)
- **Android `applicationId`:** `com.speedvendors.app` (unchanged until Google Play usage is verified)

---

## Architecture

```
Mobile App (Capacitor)
  → @capacitor/push-notifications
  → Firebase Cloud Messaging
  → APNs (iOS) / FCM (Android)

Token registration
  → FCM token
  → Edge Function `register-push-token`
  → Supabase `push_tokens` (provider = fcm)

Server send (later / test)
  → Edge Function `send-push-notification` / `send-test-push`
  → FCM HTTP v1
  → Device
```

Legacy **OneSignal** (`usePushNotifications.ts`, `push-notification` function, `onesignal_player_id`) is **preserved** and not used by `App.tsx` anymore. Business callers in `store-api` / `netopia-payment` are **unchanged**.

---

## What you must provide (BLOCKERS)

### 1) Firebase iOS config

1. Firebase Console → add iOS app with Bundle ID **`com.speedvendors`**
2. Download **`GoogleService-Info.plist`**
3. Place it at:

```text
ios/App/App/GoogleService-Info.plist
```

Do **not** invent this file.

### 2) Firebase Android config

1. Firebase Console → add Android app with package **`com.speedvendors.app`**
2. Download **`google-services.json`**
3. Place it at:

```text
android/app/google-services.json
```

Gradle already applies the Google Services plugin **only if** this file exists.

### 3) APNs Authentication Key (iOS)

In Apple Developer → Keys → create APNs key → upload to Firebase Console → Project settings → Cloud Messaging → Apple app configuration.

iOS push requires a **physical iPhone**. Simulator is not enough for end-to-end delivery.

### 4) Supabase Edge Function secrets (FCM HTTP v1)

Set **one** of these options (never in `VITE_*`):

**Option A (preferred)**

```bash
supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...@....iam.gserviceaccount.com",...}'
```

**Option B**

```bash
supabase secrets set FIREBASE_PROJECT_ID='your-firebase-project-id'
supabase secrets set FIREBASE_CLIENT_EMAIL='firebase-adminsdk-...@....iam.gserviceaccount.com'
supabase secrets set FIREBASE_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n'
```

Optional internal sender secret (for future server jobs):

```bash
supabase secrets set PUSH_INTERNAL_SECRET='long-random-string'
```

How to get the service account: Firebase Console → Project settings → Service accounts → Generate new private key.

---

## Manual checklist after placing Firebase files

```bash
cd /Users/cosminharbon/Desktop/Aplicatie/store-orchestrator

# 1) Apply DB migration
supabase db push
# or run migration 20260817003000_push_tokens_fcm_fields.sql in the SQL editor

# 2) Deploy new Edge Functions
supabase functions deploy register-push-token
supabase functions deploy send-push-notification
supabase functions deploy send-test-push

# 3) Web build + Capacitor sync
npm run build
npx cap sync

# 4) iOS pods (run on your Mac — CocoaPods CDN may fail in CI sandboxes)
cd ios/App && pod install && cd ../..

# 5) Open native IDEs
npx cap open ios
npx cap open android
```

In Xcode:

- Confirm Bundle ID `com.speedvendors`
- Confirm **Push Notifications** capability (entitlements file is already linked: `App/App.entitlements`)
- Confirm `GoogleService-Info.plist` is in the App target
- For TestFlight/App Store, set `aps-environment` to `production` via Xcode signing/capabilities as appropriate

In Android Studio:

- Confirm `applicationId` `com.speedvendors.app`
- Confirm `google-services.json` is present
- Build & run on a physical device (API 33+ will prompt for notification permission)

---

## Client API

```ts
import {
  registerForPushNotifications,
  getPushPermissionStatus,
  requestPushPermission,
  getPushToken,
  unregisterPushToken,
  handleNotificationAction,
  sendTestPush,
} from '@/lib/notifications';
```

- Runs **only** on native Capacitor (web = no-op, no permission spam)
- Non-blocking — failures never stop dashboard/auth
- Registers after login; removes FCM token association on logout

### Deep-link payload shape (routing later)

```json
{
  "type": "order",
  "order_id": "uuid"
}
```

Supported `type` values (documented for future wiring):  
`order` | `payment` | `product` | `dashboard` | `settings` | `test`

---

## Database

Table: `public.push_tokens` (extended, not replaced)

| Column | Notes |
|--------|--------|
| user_id | auth user |
| device_token | FCM / legacy token (unique) |
| platform | ios / android / web (legacy) |
| onesignal_player_id | legacy, preserved |
| device_id | stable install id |
| provider | `onesignal` \| `fcm` |
| is_active | soft-deactivate invalid FCM tokens |
| created_at / updated_at | timestamps |

RLS: users manage **only their own** rows (unchanged).

---

## Edge Functions

| Function | Purpose |
|----------|---------|
| `register-push-token` | Auth user → upsert FCM token |
| `send-push-notification` | FCM HTTP v1 send (self / internal / service role) |
| `send-test-push` | Auth self-test only |
| `push-notification` | **Legacy OneSignal — unchanged** |

---

## How to test

### Web

1. `npm run dev`
2. Confirm no notification permission prompt
3. Confirm no crash from push code

### iOS (physical device)

1. Place `GoogleService-Info.plist`
2. `pod install`, open Xcode, run on device
3. Sign in → grant permission
4. Confirm logs: `[Push] Permission: granted`, `Token received`, `Token saved`
5. Check `push_tokens` row (`provider=fcm`, `platform=ios`)
6. After secrets are set: call `sendTestPush()` or invoke `send-test-push`

### Android (physical device)

1. Place `google-services.json`
2. Open Android Studio / `npx cap run android`
3. Sign in → grant POST_NOTIFICATIONS if prompted
4. Confirm token saved (`platform=android`)
5. Send test push

---

## Important honesty note

Until Firebase plists/JSON, APNs key, service account secrets, and a successful device notification exist:

- Code = **implemented**
- Delivery = **not verified**
