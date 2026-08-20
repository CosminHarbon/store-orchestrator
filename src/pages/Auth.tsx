import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { resolvePostLoginPath } from '@/hooks/useSuperadminGate';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

const Auth = () => {
  const { t } = useTranslation('auth');
  const { t: tValidation } = useTranslation('validation');
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') === 'signup' ? 'signup' : 'signin');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const { signIn, signUp, resendSignupEmail, user } = useAuth();
  const navigate = useNavigate();
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    // On native platforms, redirect to welcome if user hasn't seen it
    if (Capacitor.isNativePlatform()) {
      const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');
      if (!hasSeenWelcome) {
        navigate('/welcome', { replace: true });
        return;
      }
    }
    
    if (user) {
      void resolvePostLoginPath().then((path) => navigate(path, { replace: true }));
    }
  }, [user, navigate]);

  const validateEmail = (value: string) => {
    if (!value.trim()) {
      return tValidation('required');
    }
    if (!EMAIL_PATTERN.test(value)) {
      return tValidation('email');
    }
    return '';
  };

  const validatePassword = (value: string) => {
    if (!value) {
      return tValidation('required');
    }
    if (value.length < MIN_PASSWORD_LENGTH) {
      return tValidation('passwordMin', { min: MIN_PASSWORD_LENGTH });
    }
    return '';
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      setLoading(false);
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      setLoading(false);
      return;
    }

    const { error } = await signIn(email, password);
    
    if (error) {
      setError(error.message);
    } else {
      toast.success(t('toast.signedIn'));
      const path = await resolvePostLoginPath();
      navigate(path, { replace: true });
    }
    
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      setLoading(false);
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      setLoading(false);
      return;
    }

    const { error } = await signUp(email, password);
    
    if (error) {
      if (
        error.message?.includes('User already registered') ||
        error.code === 'user_already_registered'
      ) {
        setError(t('error.alreadyRegistered'));
        setCanResend(false);
      } else {
        setError(error.message);
      }
    } else {
      toast.success(t('toast.accountCreated'));
      setCanResend(true);
      setPassword('');
      setError('');
      setActiveTab('signin');
    }
    
    setLoading(false);
  };

  const handleResendConfirmation = async () => {
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    setLoading(true);
    setError('');
    const { error } = await resendSignupEmail(email);
    if (error) {
      setError(error.message);
    } else {
      toast.success(t('toast.confirmationResent'));
    }
    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const emailError = validateEmail(resetEmail);
    if (emailError) {
      setError(emailError);
      setLoading(false);
      return;
    }

    const redirectUrl = 'https://www.speedvendors.com/auth/callback';
    
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: redirectUrl,
    });

    if (error) {
      setError(error.message);
    } else {
      toast.success(t('toast.resetSent'));
      setShowResetPassword(false);
      setResetEmail('');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <BrandLogo variant="mark" imgClassName="h-20 w-20" />
          </div>
          <CardTitle className="text-2xl font-bold">{t('title')}</CardTitle>
          <CardDescription>
            {showResetPassword ? t('resetSubtitle') : t('subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showResetPassword ? (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">{t('field.email')}</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder={t('placeholder.email')}
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('action.sending') : t('action.sendReset')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setShowResetPassword(false);
                  setError('');
                }}
              >
                {t('action.backToSignIn')}
              </Button>
            </form>
          ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">{t('tab.signIn')}</TabsTrigger>
              <TabsTrigger value="signup">{t('tab.signUp')}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">{t('field.email')}</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder={t('placeholder.email')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">{t('field.password')}</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder={t('placeholder.password')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t('action.signingIn') : t('action.signIn')}
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className="w-full text-sm"
                  onClick={() => {
                    setShowResetPassword(true);
                    setError('');
                  }}
                >
                  {t('action.forgotPassword')}
                </Button>
                {canResend && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={loading}
                    onClick={handleResendConfirmation}
                  >
                    {t('action.resendConfirmation')}
                  </Button>
                )}
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">{t('field.email')}</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder={t('placeholder.email')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">{t('field.password')}</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder={t('placeholder.createPassword')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                  />
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t('action.creatingAccount') : t('action.createAccount')}
                </Button>
                {canResend && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={loading}
                    onClick={handleResendConfirmation}
                  >
                    {t('action.resendConfirmation')}
                  </Button>
                )}
              </form>
            </TabsContent>
          </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
