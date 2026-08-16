/**
 * Firebase Cloud Messaging HTTP v1 helpers for Supabase Edge Functions.
 * Credentials MUST come from Edge Function secrets — never from the client.
 */

export type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

export function loadFirebaseServiceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as ServiceAccount;
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          project_id: parsed.project_id,
          client_email: parsed.client_email,
          private_key: parsed.private_key.replace(/\\n/g, '\n'),
        };
      }
    } catch (error) {
      console.error('[FCM] Invalid FIREBASE_SERVICE_ACCOUNT_JSON', error);
      return null;
    }
  }

  const projectId = Deno.env.get('FIREBASE_PROJECT_ID');
  const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL');
  const privateKey = Deno.env.get('FIREBASE_PRIVATE_KEY');
  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
    };
  }

  return null;
}

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    binary.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

export async function getGoogleAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );

  const key = await importPrivateKey(sa.private_key);
  const signingInput = new TextEncoder().encode(`${header}.${claim}`);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, signingInput);
  const jwt = `${header}.${claim}.${base64UrlEncode(new Uint8Array(signature))}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const json = await response.json();
  if (!response.ok || !json.access_token) {
    throw new Error(`Failed to obtain Google access token: ${JSON.stringify(json)}`);
  }
  return json.access_token as string;
}

export type FcmSendResult = {
  token: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  shouldRemoveToken?: boolean;
};

export async function sendFcmMessage(params: {
  accessToken: string;
  projectId: string;
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<FcmSendResult> {
  const { accessToken, projectId, token, title, body, data } = params;

  const stringData: Record<string, string> = {};
  if (data) {
    for (const [k, v] of Object.entries(data)) {
      if (v != null) stringData[k] = String(v);
    }
  }

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: stringData,
          android: {
            priority: 'HIGH',
            notification: {
              channel_id: 'speedvendors_default',
              sound: 'default',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                'content-available': 1,
              },
            },
          },
        },
      }),
    }
  );

  const json = await response.json().catch(() => ({}));

  if (response.ok) {
    return { token, success: true };
  }

  const errorCode = json?.error?.details?.[0]?.errorCode || json?.error?.status || String(response.status);
  const errorMessage = json?.error?.message || 'FCM send failed';
  const shouldRemoveToken =
    errorCode === 'UNREGISTERED' ||
    errorCode === 'INVALID_ARGUMENT' ||
    String(errorMessage).toLowerCase().includes('not a valid fcm') ||
    String(errorMessage).toLowerCase().includes('requested entity was not found');

  return {
    token,
    success: false,
    errorCode: String(errorCode),
    errorMessage: String(errorMessage),
    shouldRemoveToken,
  };
}
