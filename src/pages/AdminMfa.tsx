import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSuperadminGate } from '@/hooks/useSuperadminGate';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BrandLogo } from '@/components/brand/BrandLogo';

type Mode = 'enroll' | 'challenge';

export default function AdminMfa() {
  const { user, loading, signOut } = useAuth();
  const { gate, refresh } = useSuperadminGate();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const modeParam = (params.get('mode') as Mode | null) || null;

  const [mode, setMode] = useState<Mode>('challenge');
  const [factorId, setFactorId] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [enrollStarted, setEnrollStarted] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }
    if (gate.status === 'loading') return;
    if (gate.status === 'not_superadmin') {
      navigate('/app', { replace: true });
      return;
    }
    if (gate.status === 'ready') {
      navigate('/admin', { replace: true });
      return;
    }
    setMode(modeParam || (gate.status === 'needs_enroll' ? 'enroll' : 'challenge'));
  }, [user, loading, gate, navigate, modeParam]);

  useEffect(() => {
    if (mode !== 'enroll' || enrollStarted || gate.status === 'loading') return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError('');
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Speed Vendors Superadmin',
      });
      if (cancelled) return;
      if (enrollError || !data) {
        setError(enrollError?.message || 'Could not start MFA enrollment');
        setBusy(false);
        return;
      }
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setEnrollStarted(true);
      setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, enrollStarted, gate.status]);

  const verify = async () => {
    if (code.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app');
      return;
    }
    setBusy(true);
    setError('');

    try {
      let id = factorId;
      if (mode === 'challenge') {
        const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
        if (listError) throw listError;
        const totp = factors.totp.find((f) => f.status === 'verified');
        if (!totp) throw new Error('No verified authenticator found. Enroll MFA first.');
        id = totp.id;
      }

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: id,
      });
      if (challengeError || !challenge) throw challengeError || new Error('Challenge failed');

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: id,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;

      await supabase.auth.refreshSession();
      await refresh();
      navigate('/admin', { replace: true });
    } catch (e: any) {
      setError(e?.message || 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading || gate.status === 'loading' || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Checking security…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <BrandLogo className="h-8 w-auto" />
          <CardTitle>
            {mode === 'enroll' ? 'Set up authenticator MFA' : 'Enter authenticator code'}
          </CardTitle>
          <CardDescription>
            Superadmin access requires a verified authenticator app (AAL2). This account
            can view every merchant’s data — protect it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {mode === 'enroll' && qr ? (
            <div className="space-y-3">
              {qr.startsWith('data:') || qr.startsWith('http') ? (
                <img src={qr} alt="MFA QR code" className="mx-auto w-48 h-48 bg-white rounded-md p-2" />
              ) : (
                <div
                  className="mx-auto w-48 h-48 bg-white rounded-md p-2 flex items-center justify-center overflow-hidden [&_svg]:w-full [&_svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: qr }}
                />
              )}
              <p className="text-xs text-muted-foreground break-all text-center">
                Secret: <span className="font-mono">{secret}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Scan the QR with Google Authenticator, 1Password, or Authy, then enter the
                6-digit code below.
              </p>
            </div>
          ) : null}

          <div className="flex justify-center">
            <InputOTP maxLength={6} value={code} onChange={setCode}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          <Button className="w-full" disabled={busy || code.length !== 6} onClick={() => void verify()}>
            {busy ? 'Verifying…' : mode === 'enroll' ? 'Confirm and continue' : 'Verify'}
          </Button>

          <Button variant="ghost" className="w-full" onClick={() => void signOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
