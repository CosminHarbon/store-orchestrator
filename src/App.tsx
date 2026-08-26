import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/hooks/useAuth';
import { ImpersonationProvider } from '@/hooks/useImpersonation';
import { useFcmPushNotifications } from '@/hooks/useFcmPushNotifications';
import { useStripeConnectReturn } from '@/hooks/useStripeConnectReturn';
import {
  AppThemeProvider,
  MarketingThemeProvider,
  StorefrontThemeProvider,
} from '@/components/theme/ThemeProvider';
import { LanguageProvider } from '@/i18n/LanguageProvider';
import Landing from './pages/Landing';
import Index from './pages/Index';
import Auth from './pages/Auth';
import Welcome from './pages/Welcome';
import AuthCallback from './pages/AuthCallback';
import NotFound from './pages/NotFound';
import TemplateViewer from './pages/TemplateViewer';
import SetupWizard from './pages/SetupWizard';
import PrivacyPolicy from './pages/PrivacyPolicy';
import AdminConsole from './pages/AdminConsole';
import AdminMfa from './pages/AdminMfa';

const AiStudioV2Showcase = import.meta.env.DEV
  ? lazy(() => import('./pages/ai-studio-v2/AiStudioV2Showcase'))
  : null;

const AiStudioV2GenerateLab = import.meta.env.DEV
  ? lazy(() => import('./pages/ai-studio-v2/AiStudioV2GenerateLab'))
  : null;

const PushNotificationInitializer = () => {
  // FCM + Capacitor Push (native only). Legacy OneSignal hook is preserved but unused here.
  useFcmPushNotifications();
  return null;
};

const StripeConnectReturnListener = () => {
  useStripeConnectReturn();
  return null;
};

const queryClient = new QueryClient();

/**
 * Theme isolation:
 * - `/` → MarketingThemeProvider (sv-marketing-theme)
 * - `/templates/*` → StorefrontThemeProvider (sv-storefront-theme)
 * - everything else → AppThemeProvider (sv-app-theme)
 * Each uses a separate localStorage key so Light/Dark never crosses surfaces.
 */
const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ImpersonationProvider>
      <LanguageProvider>
        <PushNotificationInitializer />
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <StripeConnectReturnListener />
            <Routes>
              <Route
                path="/"
                element={
                  <MarketingThemeProvider>
                    <Landing />
                  </MarketingThemeProvider>
                }
              />
              <Route
                path="/templates/:templateId"
                element={
                  <StorefrontThemeProvider>
                    <TemplateViewer />
                  </StorefrontThemeProvider>
                }
              />
              <Route
                path="/welcome"
                element={
                  <AppThemeProvider>
                    <Welcome />
                  </AppThemeProvider>
                }
              />
              <Route
                path="/app"
                element={
                  <AppThemeProvider>
                    <Index />
                  </AppThemeProvider>
                }
              />
              <Route
                path="/auth"
                element={
                  <AppThemeProvider>
                    <Auth />
                  </AppThemeProvider>
                }
              />
              <Route
                path="/auth/callback"
                element={
                  <AppThemeProvider>
                    <AuthCallback />
                  </AppThemeProvider>
                }
              />
              <Route
                path="/setup"
                element={
                  <AppThemeProvider>
                    <SetupWizard />
                  </AppThemeProvider>
                }
              />
              <Route
                path="/admin"
                element={
                  <AppThemeProvider>
                    <AdminConsole />
                  </AppThemeProvider>
                }
              />
              <Route
                path="/admin/mfa"
                element={
                  <AppThemeProvider>
                    <AdminMfa />
                  </AppThemeProvider>
                }
              />
              <Route
                path="/privacy"
                element={
                  <AppThemeProvider>
                    <PrivacyPolicy />
                  </AppThemeProvider>
                }
              />
              {import.meta.env.DEV && AiStudioV2Showcase ? (
                <Route
                  path="/ai-studio-v2-showcase"
                  element={
                    <StorefrontThemeProvider>
                      <Suspense fallback={<div style={{ padding: 24 }}>Loading V2 showcase…</div>}>
                        <AiStudioV2Showcase />
                      </Suspense>
                    </StorefrontThemeProvider>
                  }
                />
              ) : null}
              {import.meta.env.DEV && AiStudioV2GenerateLab ? (
                <Route
                  path="/ai-studio-v2-generate"
                  element={
                    <StorefrontThemeProvider>
                      <Suspense fallback={<div style={{ padding: 24 }}>Loading V2 generate lab…</div>}>
                        <AiStudioV2GenerateLab />
                      </Suspense>
                    </StorefrontThemeProvider>
                  }
                />
              ) : null}
              <Route
                path="*"
                element={
                  <AppThemeProvider>
                    <NotFound />
                  </AppThemeProvider>
                }
              />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </LanguageProvider>
      </ImpersonationProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
