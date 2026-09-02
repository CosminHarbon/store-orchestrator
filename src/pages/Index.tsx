import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileHeader } from '@/components/MobileHeader';
import { useAuth } from '@/hooks/useAuth';
import { useImpersonation } from '@/hooks/useImpersonation';
import { useMerchantAccessGate } from '@/hooks/useEntitlementGate';
import { useIsMobile } from '@/hooks/use-mobile';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import ProductManagement from '@/components/ProductManagement';
import OrderManagement from '@/components/OrderManagement';
import StoreSettings from '@/components/StoreSettings';
import StockManagement from '@/components/StockManagement';
import CustomerManagement from '@/components/CustomerManagement';
import PaymentStatistics from '@/components/PaymentStatistics';
import CollectionsManagement from '@/components/CollectionsManagement';
import TemplatesManagement from '@/components/TemplatesManagement';
import ReviewsManagement from '@/components/ReviewsManagement';
import { MessageCircle } from 'lucide-react';
import AIChat from '@/components/AIChat';
import DashboardHome from '@/components/DashboardHome';
import { BottomNavigation } from '@/components/BottomNavigation';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const Index = () => {
  const { t } = useTranslation('dashboard');
  const { t: tCommon } = useTranslation('common');
  const { user, loading } = useAuth();
  const {
    isImpersonating,
    impersonatedLabel,
    effectiveUserId,
    stopImpersonation,
  } = useImpersonation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab) return tab;
      return localStorage.getItem('activeTab') || 'dashboard';
    }
    return 'dashboard';
  });
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  // Stock management unsaved changes tracking
  const [hasStockPendingChanges, setHasStockPendingChanges] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const stockSaveRef = useRef<(() => void) | null>(null);

  // Handle tab change with unsaved changes check
  const handleTabChange = (newTab: string) => {
    if (activeTab === 'stock' && hasStockPendingChanges && newTab !== 'stock') {
      setPendingTab(newTab);
      setShowUnsavedWarning(true);
    } else {
      setActiveTab(newTab);
    }
  };

  const handleDiscardAndNavigate = () => {
    setShowUnsavedWarning(false);
    if (pendingTab) {
      setActiveTab(pendingTab);
      setPendingTab(null);
    }
  };

  const handleSaveAndNavigate = () => {
    if (stockSaveRef.current) {
      stockSaveRef.current();
    }
    setShowUnsavedWarning(false);
    if (pendingTab) {
      // Small delay to allow save to complete
      setTimeout(() => {
        setActiveTab(pendingTab);
        setPendingTab(null);
      }, 500);
    }
  };

  // Persist active tab to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('activeTab', activeTab);
    }
  }, [activeTab]);

  // Allow other surfaces (e.g. Netopia wizard, push tap) to switch tabs without remounting
  useEffect(() => {
    const onNavigateTab = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === 'string' && detail) {
        setActiveTab(detail);
      }
    };
    window.addEventListener('sv:navigate-tab', onNavigateTab);
    return () => window.removeEventListener('sv:navigate-tab', onNavigateTab);
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem('sv-open-order-id')) {
        setActiveTab('orders');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const { ready: entitlementReady, blocked: entitlementBlocked } = useMerchantAccessGate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  // Platform operators use /admin unless they are impersonating a merchant store
  useEffect(() => {
    const routeSuperadmin = async () => {
      if (!user) return;
      if (isImpersonating) return;
      const { data: isSuper } = await supabase.rpc('is_superadmin_user');
      if (isSuper) {
        navigate('/admin', { replace: true });
      }
    };
    void routeSuperadmin();
  }, [user, navigate, isImpersonating]);

  // Auto-open store setup only AFTER entitlement is confirmed.
  useEffect(() => {
    const checkSetup = async () => {
      if (!user || !effectiveUserId) return;
      if (isImpersonating) return;
      if (!entitlementReady || entitlementBlocked) return;
      const { data: isSuper } = await supabase.rpc('is_superadmin_user');
      if (isSuper) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('setup_completed, welcome_dismissed')
        .eq('user_id', effectiveUserId)
        .single();

      if (
        profile &&
        profile.setup_completed !== true &&
        profile.welcome_dismissed !== true
      ) {
        navigate('/setup');
      }
    };

    void checkSetup();
  }, [user, navigate, effectiveUserId, isImpersonating, entitlementReady, entitlementBlocked]);

  const { data: profileData } = useQuery({
    queryKey: ['dashboard-profile', effectiveUserId],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('store_name')
        .eq('user_id', effectiveUserId!)
        .single();
      return data;
    },
    enabled: !!effectiveUserId,
  });

  if (loading || (user && !entitlementReady) || entitlementBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-muted-foreground">{t('loadingStore')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const renderDashboard = () => (
    <DashboardHome onTabChange={handleTabChange} storeName={profileData?.store_name || undefined} />
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return renderDashboard();
      case 'products':
        return (
          <div className="p-3 md:p-6 pb-mobile-nav">
            <ProductManagement />
          </div>
        );
      case 'stock':
        return (
          <div className="p-3 md:p-6 pb-mobile-nav">
            <StockManagement 
              onPendingChangesChange={setHasStockPendingChanges}
              saveRef={stockSaveRef}
            />
          </div>
        );
      case 'orders':
        return (
          <div className="p-3 md:p-6 pb-mobile-nav">
            <OrderManagement />
          </div>
        );
      case 'customers':
        return (
          <div className="p-3 md:p-6 pb-mobile-nav">
            <CustomerManagement />
          </div>
        );
      case 'payments':
        return (
          <div className="p-3 md:p-6 pb-mobile-nav">
            <PaymentStatistics />
          </div>
        );
      case 'reviews':
        return (
          <div className="p-3 md:p-6 pb-mobile-nav">
            <ReviewsManagement />
          </div>
        );
      case 'settings':
        return (
          <div className="p-3 md:p-6 pb-mobile-nav">
            <StoreSettings />
          </div>
        );
      case 'templates':
        return (
          <div className="p-3 md:p-6 pb-mobile-nav">
            <TemplatesManagement />
          </div>
        );
      default:
        return renderDashboard();
    }
  };

  return (
    <SidebarProvider className="!min-h-0 h-[100dvh] max-h-[100dvh] overflow-hidden">
      <div className="mobile-viewport flex w-full bg-background safe-area-left safe-area-right">
        <AppSidebar activeTab={activeTab} onTabChange={handleTabChange} />
        
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {isImpersonating ? (
            <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 border-b bg-amber-500/15 px-3 py-2 text-sm shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="secondary">Superadmin</Badge>
                <span className="truncate">
                  Acting as {impersonatedLabel || profileData?.store_name || 'merchant store'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    stopImpersonation();
                    navigate('/admin');
                  }}
                >
                  Exit to platform admin
                </Button>
              </div>
            </div>
          ) : null}
          <MobileHeader 
            userEmail={user.email || undefined} 
            storeName={profileData?.store_name || t('defaultStoreName')}
            onTabChange={handleTabChange}
          />
          
          <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain hide-scrollbar">
            {renderContent()}
          </main>
        </div>
        
        {/* Bottom Navigation */}
        <BottomNavigation activeTab={activeTab} onTabChange={handleTabChange} />
        
        {/* AI Chat Button — sits above tab bar + home indicator */}
        <Button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-4 h-14 w-14 rounded-full bg-gradient-primary shadow-glow z-40 safe-area-right hover:shadow-elegant transition-all duration-200 border-0 md:bottom-6 md:right-6 md:h-16 md:w-16"
          size="sm"
        >
          <MessageCircle className="h-6 w-6 text-white md:h-7 md:w-7" />
        </Button>
        
        {/* AI Chat Modal */}
        <AIChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
        
        {/* Unsaved Changes Warning Dialog */}
        <AlertDialog open={showUnsavedWarning} onOpenChange={setShowUnsavedWarning}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('unsavedStockTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('unsavedStockDesc')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel onClick={() => setShowUnsavedWarning(false)}>
                {tCommon('cancel')}
              </AlertDialogCancel>
              <Button variant="destructive" onClick={handleDiscardAndNavigate}>
                {tCommon('discardChanges')}
              </Button>
              <AlertDialogAction onClick={handleSaveAndNavigate}>
                {tCommon('saveAndContinue')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SidebarProvider>
  );
};

export default Index;