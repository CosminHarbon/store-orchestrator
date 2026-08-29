import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSuperadminGate } from '@/hooks/useSuperadminGate';
import { getOrCreateDeviceId } from '@/lib/notifications/deviceId';
import {
  getPushPlatform,
  getPushRegistrationState,
  isNativePushAvailable,
  registerForPushNotifications,
  sendTestPush,
  type PushRegistrationState,
} from '@/lib/notifications';

function merchantStatusLabel(
  t: (key: string, opts?: Record<string, string | number>) => string,
  native: boolean,
  state: PushRegistrationState | null,
): string {
  if (!native) return t('notifications.statusUnsupported');
  if (!state) return t('notifications.statusChecking');
  if (state.permission === 'denied') return t('notifications.statusDisabled');
  if (state.permission === 'prompt') return t('notifications.statusPermissionRequired');
  if (state.permission === 'unavailable') return t('notifications.statusUnsupported');
  if (state.permission === 'granted') {
    // Permission alone is not enough — wait until token save succeeds when we know it failed.
    if (state.lastError && !state.tokenSaved) return t('notifications.statusChecking');
    return t('notifications.statusEnabled');
  }
  return t('notifications.statusChecking');
}

export function PushNotificationsCard() {
  const { t } = useTranslation('settings');
  const { gate } = useSuperadminGate();
  const isSuperAdmin = gate.status === 'ready';
  const native = isNativePushAvailable();
  const [state, setState] = useState<PushRegistrationState | null>(
    native
      ? null
      : {
          permission: 'unavailable',
          hasLocalToken: false,
          tokenSaved: false,
          lastError: null,
          tokenLength: null,
        },
  );
  const [sending, setSending] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [enabling, setEnabling] = useState(false);

  const refresh = useCallback(async () => {
    if (!native) {
      setState({
        permission: 'unavailable',
        hasLocalToken: false,
        tokenSaved: false,
        lastError: null,
        tokenLength: null,
      });
      return;
    }
    setState(await getPushRegistrationState());
  }, [native]);

  useEffect(() => {
    void refresh();
    if (!native) return;

    // Production registration for ALL authenticated native users.
    // Super Admin diagnostics must never be the only path that calls register().
    void registerForPushNotifications({ force: true }).finally(() => {
      window.setTimeout(() => {
        void refresh();
      }, 2000);
    });

    // Detailed polling only for Super Admin diagnostics UI.
    if (!isSuperAdmin) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [refresh, isSuperAdmin, native]);

  const handleEnable = async () => {
    setEnabling(true);
    try {
      await registerForPushNotifications({ force: true });
      window.setTimeout(() => {
        void refresh();
      }, 1500);
    } finally {
      setEnabling(false);
    }
  };

  const handleReRegister = async () => {
    setRegistering(true);
    try {
      await registerForPushNotifications({ force: true });
      window.setTimeout(() => {
        void refresh();
      }, 2000);
    } finally {
      setRegistering(false);
    }
  };

  const handleTest = async () => {
    setSending(true);
    try {
      const result = await sendTestPush();
      if (result.success) {
        toast.success(t('notifications.testSent'));
      } else {
        toast.error(result.error || t('notifications.testFailed'));
      }
    } finally {
      setSending(false);
    }
  };

  const platform = getPushPlatform() ?? Capacitor.getPlatform();
  const deviceId = isSuperAdmin && native ? getOrCreateDeviceId() : null;
  const canTest =
    isSuperAdmin &&
    native &&
    Capacitor.isNativePlatform() &&
    state?.permission === 'granted' &&
    state.tokenSaved;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4" />
          {t('notifications.title')}
        </CardTitle>
        <CardDescription>{t('notifications.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium">{t('notifications.statusLabel')}</p>
          <p className="text-sm text-muted-foreground">
            {merchantStatusLabel(t, native, state)}
          </p>
        </div>

        {native && state?.permission === 'denied' ? (
          <p className="text-sm text-muted-foreground">{t('notifications.deniedHelp')}</p>
        ) : null}

        {native && state?.permission === 'prompt' ? (
          <Button type="button" variant="outline" disabled={enabling} onClick={() => void handleEnable()}>
            {enabling ? t('notifications.enabling') : t('notifications.enableButton')}
          </Button>
        ) : null}

        {isSuperAdmin ? (
          <div className="space-y-3 rounded-md border border-dashed p-3">
            <div>
              <p className="text-sm font-medium">{t('notifications.diagnosticsTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('notifications.diagnosticsDesc')}</p>
            </div>

            <dl className="grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                <dt className="font-medium text-foreground">{t('notifications.diagPermission')}</dt>
                <dd>{state?.permission ?? '—'}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">{t('notifications.diagPlatform')}</dt>
                <dd>{platform}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">{t('notifications.diagProvider')}</dt>
                <dd>fcm</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">{t('notifications.diagTokenRegistered')}</dt>
                <dd>
                  {state?.tokenSaved
                    ? t('notifications.diagYes')
                    : t('notifications.diagNo')}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">{t('notifications.diagTokenLength')}</dt>
                <dd>{state?.tokenLength ?? '—'}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">{t('notifications.diagHasLocalToken')}</dt>
                <dd>
                  {state?.hasLocalToken
                    ? t('notifications.diagYes')
                    : t('notifications.diagNo')}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium text-foreground">{t('notifications.diagDeviceId')}</dt>
                <dd className="break-all font-mono">{deviceId ?? '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium text-foreground">{t('notifications.diagLastError')}</dt>
                <dd>{state?.lastError || t('notifications.diagNone')}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2">
              {native ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={registering}
                  onClick={() => void handleReRegister()}
                >
                  {registering
                    ? t('notifications.registering')
                    : t('notifications.registerButton')}
                </Button>
              ) : null}
              {canTest ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={sending}
                  onClick={() => void handleTest()}
                >
                  {sending ? t('notifications.testSending') : t('notifications.testButton')}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
