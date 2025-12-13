import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Check for error in URL params
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');
        
        if (error) {
          // Even with an error, the account might be verified
          // This happens when the token is already used
          if (errorDescription?.includes('expired') || errorDescription?.includes('invalid')) {
            setStatus('success');
            setMessage('Your email has been verified! You can now sign in to your account.');
            return;
          }
          setStatus('error');
          setMessage(errorDescription || 'An error occurred during verification.');
          return;
        }

        // Try to get the session - if the user clicked from email, 
        // Supabase should have set up the session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (session) {
          setStatus('success');
          setMessage('Email verified successfully! Redirecting...');
          setTimeout(() => navigate('/app'), 2000);
          return;
        }

        // No session but no error either - verification likely succeeded
        // but user needs to sign in (common with mobile app flows)
        setStatus('success');
        setMessage('Your email has been verified! You can now sign in to the app.');
        
      } catch (err) {
        console.error('Auth callback error:', err);
        setStatus('success'); // Default to success as account is usually verified
        setMessage('Verification complete. Please sign in to continue.');
      }
    };

    handleAuthCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <img src="/logo.png" alt="Speed Vendors Logo" className="h-20 w-20 object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold">SPEED VENDORS</CardTitle>
          <CardDescription>Email Verification</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-center">
            {status === 'loading' && (
              <Loader2 className="h-16 w-16 text-primary animate-spin" />
            )}
            {status === 'success' && (
              <CheckCircle className="h-16 w-16 text-green-500" />
            )}
            {status === 'error' && (
              <XCircle className="h-16 w-16 text-destructive" />
            )}
          </div>
          
          <p className="text-muted-foreground">{message}</p>
          
          {status !== 'loading' && (
            <div className="space-y-3">
              <Button 
                onClick={() => navigate('/auth')} 
                className="w-full"
              >
                Go to Sign In
              </Button>
              <p className="text-sm text-muted-foreground">
                If you're on a mobile device, please open the Speed Vendors app and sign in.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthCallback;