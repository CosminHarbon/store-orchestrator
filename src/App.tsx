import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/hooks/useAuth';
import { useFcmPushNotifications } from '@/hooks/useFcmPushNotifications';
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

const PushNotificationInitializer = () => {
  // FCM + Capacitor Push (native only). Legacy OneSignal hook is preserved but unused here.
  useFcmPushNotifications();
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
      <LanguageProvider>
        <PushNotificationInitializer />
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
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
                path="/privacy"
                element={
                  <AppThemeProvider>
                    <PrivacyPolicy />
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
          </BrowserRouter>
        </TooltipProvider>
      </LanguageProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
