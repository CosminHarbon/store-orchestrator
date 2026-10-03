import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/subscribe';
  return raw;
}

/**
 * Native → browser session handoff.
 * Expects Supabase tokens in the URL hash (never query string), then routes to `next`.
 */
const AuthWebSession = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const next = safeNextPath(searchParams.get('next'));
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const access_token = hashParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token');

      try {
        if (access_token && refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (sessionError) throw sessionError;
        }

        // Drop tokens from the address bar before navigating onward.
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);

        if (!cancelled) navigate(next, { replace: true });
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError('Could not restore your session. Please sign in on the website to choose a plan.');
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mb-4 flex justify-center">
            <BrandLogo variant="mark" imgClassName="h-16 w-16" />
          </div>
          <CardTitle>SpeedVendors</CardTitle>
          <CardDescription>
            {error ? 'Sign-in handoff failed' : 'Signing you in…'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button className="w-full" onClick={() => navigate('/auth', { replace: true })}>
                Go to Sign In
              </Button>
            </>
          ) : (
            <div className="flex justify-center py-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthWebSession;
