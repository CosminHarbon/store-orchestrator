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

// Landing stays in the entry chunk (it is the first paint for most visitors);
// every other route is split so marketing traffic never downloads the dashboard.
const Index = lazy(() => import('./pages/Index'));
const Auth = lazy(() => import('./pages/Auth'));
const Welcome = lazy(() => import('./pages/Welcome'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const NotFound = lazy(() => import('./pages/NotFound'));
const TemplateViewer = lazy(() => import('./pages/TemplateViewer'));
const SetupWizard = lazy(() => import('./pages/SetupWizard'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const AdminConsole = lazy(() => import('./pages/AdminConsole'));
const AdminMfa = lazy(() => import('./pages/AdminMfa'));
const Subscribe = lazy(() => import('./pages/Subscribe'));
const BillingSuccess = lazy(() => import('./pages/BillingSuccess'));

const AiStudioV2Showcase = import.meta.env.DEV
  ? lazy(() => import('./pages/ai-studio-v2/AiStudioV2Showcase'))
  : null;

const AiStudioV2GenerateLab = import.meta.env.DEV
  ? lazy(() => import('./pages/ai-studio-v2/AiStudioV2GenerateLab'))
  : null;

const AiStudioV2FixturePreview = import.meta.env.DEV
  ? lazy(() => import('./pages/ai-studio-v2/AiStudioV2FixturePreview'))
  : null;

const CursorStorefrontPreview = lazy(() => import('./pages/CursorStorefrontPreview'));
const HostedCheckout = lazy(() => import('./pages/HostedCheckout'));

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-label="Loading">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const PushNotificationInitializer = () => {
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
            <Suspense fallback={<RouteFallback />}>
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
                path="/checkout"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <HostedCheckout />
                  </Suspense>
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
                path="/subscribe"
                element={
                  <AppThemeProvider>
                    <Subscribe />
                  </AppThemeProvider>
                }
              />
              <Route
                path="/billing/success"
                element={
                  <AppThemeProvider>
                    <BillingSuccess />
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
              {import.meta.env.DEV && AiStudioV2FixturePreview ? (
                <Route
                  path="/ai-studio-v2-fixtures"
                  element={
                    <StorefrontThemeProvider>
                      <Suspense fallback={<div style={{ padding: 24 }}>Loading V2 fixture preview…</div>}>
                        <AiStudioV2FixturePreview />
                      </Suspense>
                    </StorefrontThemeProvider>
                  }
                />
              ) : null}
              <Route
                path="/dev/cursor-preview"
                element={
                  <AppThemeProvider>
                    <Suspense fallback={<div style={{ padding: 24 }}>Loading Cursor preview…</div>}>
                      <CursorStorefrontPreview />
                    </Suspense>
                  </AppThemeProvider>
                }
              />
              <Route
                path="*"
                element={
                  <AppThemeProvider>
                    <NotFound />
                  </AppThemeProvider>
                }
              />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </LanguageProvider>
      </ImpersonationProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
