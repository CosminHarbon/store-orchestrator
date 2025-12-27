import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'reset_password'>('loading');
  const [message, setMessage] = useState('Verifying...');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    // Check URL hash FIRST before Supabase processes it
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      setStatus('reset_password');
      setMessage('Enter your new password');
      return;
    }

    const handleAuthCallback = async () => {
      try {
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');
        
        if (error) {
          if (errorDescription?.includes('expired') || errorDescription?.includes('invalid')) {
            setStatus('success');
            setMessage('Your email has been verified! You can now sign in to your account.');
            return;
          }
          setStatus('error');
          setMessage(errorDescription || 'An error occurred during verification.');
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          setStatus('success');
          setMessage('Email verified successfully! Redirecting...');
          setTimeout(() => navigate('/app'), 2000);
          return;
        }

        setStatus('success');
        setMessage('Your email has been verified! You can now sign in to the app.');
        
      } catch (err) {
        console.error('Auth callback error:', err);
        setStatus('success');
        setMessage('Verification complete. Please sign in to continue.');
      }
    };

    // Listen for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setStatus('reset_password');
        setMessage('Enter your new password');
      }
    });

    handleAuthCallback();

    return () => subscription.unsubscribe();
  }, [searchParams, navigate]);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setUpdatingPassword(true);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setPasswordError(error.message);
      setUpdatingPassword(false);
    } else {
      toast.success('Password updated successfully!');
      navigate('/app');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <img src="/logo.png" alt="Speed Vendors Logo" className="h-20 w-20 object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold">Speed Vendors</CardTitle>
          <CardDescription>
            {status === 'reset_password' ? 'Reset Your Password' : 'Email Verification'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {status === 'reset_password' ? (
            <form onSubmit={handleUpdatePassword} className="space-y-4 text-left">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              {passwordError && (
                <Alert variant="destructive">
                  <AlertDescription>{passwordError}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={updatingPassword}>
                {updatingPassword ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          ) : (
            <>
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthCallback;
