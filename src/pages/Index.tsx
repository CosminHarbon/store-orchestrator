import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileHeader } from '@/components/MobileHeader';
import { useAuth } from '@/hooks/useAuth';
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
import { Package, ShoppingCart, DollarSign, Clock, TrendingUp, Users, MessageCircle, Sparkles, Zap, Star } from 'lucide-react';
import AIChat from '@/components/AIChat';
import { BottomNavigation } from '@/components/BottomNavigation';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      
      const [productsRes, ordersRes, todayOrdersRes, profileRes] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact' }),
        supabase.from('orders').select('*', { count: 'exact' }),
        supabase
          .from('orders')
          .select('*')
          .gte('created_at', startOfDay.toISOString())
          .lt('created_at', endOfDay.toISOString()),
        supabase.from('profiles').select('store_name').eq('user_id', user?.id).single()
      ]);

      const totalRevenue = ordersRes.data?.reduce((sum, order) => sum + Number(order.total), 0) || 0;
      const pendingOrders = ordersRes.data?.filter(order => order.payment_status === 'pending').length || 0;
      const lowStockProducts = productsRes.data?.filter(product => product.stock < 5).length || 0;
      
      // Today's real data
      const todayOrders = todayOrdersRes.data || [];
      const todayRevenue = todayOrders.reduce((sum, order) => sum + Number(order.total), 0);
      const todayNewOrders = todayOrders.length;

      return {
        totalProducts: productsRes.count || 0,
        totalOrders: ordersRes.count || 0,
        totalRevenue,
        pendingOrders,
        lowStockProducts,
        storeName: profileRes.data?.store_name || 'My Store',
        todayOrders: todayNewOrders,
        todayRevenue: todayRevenue
      };
    },
    enabled: !!user
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading your store...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const renderDashboard = () => (
    <div className={`space-y-4 p-3 md:p-6 pb-24 safe-area-bottom ${isMobile ? 'mobile-futuristic-container' : ''}`}>
      {/* Hero Value Card */}
      <div className={`rounded-2xl p-6 md:p-8 text-white shadow-glow relative overflow-hidden ${isMobile 
        ? 'bg-gradient-to-br from-card/90 to-card/70 backdrop-blur-xl border border-white/10 shadow-xl' 
        : 'bg-gradient-primary'
      }`}>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div className={`${isMobile ? '' : ''}`}>
              {isMobile && (
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5 text-primary/70" />
                  <span className="text-foreground/80 font-medium">Your Store</span>
                </div>
              )}
              <p className={`text-sm mb-1 ${isMobile ? 'text-muted-foreground' : 'text-white/80'}`}>
                {isMobile ? 'Total Value' : 'Your Store Value'}
              </p>
              <h1 className={`text-3xl md:text-4xl font-bold ${isMobile ? 'text-foreground' : ''}`}>
                {stats?.totalRevenue?.toFixed(2) || '0.00'} RON
              </h1>
              <p className={`text-sm mt-1 ${isMobile ? 'text-muted-foreground' : 'text-white/80'}`}>
                ▲ {((stats?.totalRevenue || 0) * 0.15).toFixed(2)} RON this week
              </p>
            </div>
            <Button 
              variant="secondary" 
              size="sm" 
              className={`rounded-full px-4 ${isMobile 
                ? 'bg-primary/10 border-primary/20 text-primary hover:bg-primary/20' 
                : 'bg-white/20 border-white/30 text-white hover:bg-white/30'
              }`}
              onClick={() => setActiveTab('payments')}
            >
              {isMobile ? 'Analytics' : '+ View Analytics'}
            </Button>
          </div>
        </div>
        
        {/* Subtle decorative elements */}
        <div className={`absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8`}></div>
        <div className={`absolute bottom-0 left-0 w-24 h-24 bg-white/3 rounded-full translate-y-8 -translate-x-8`}></div>
      </div>

      {/* Quick Stats Grid */}
      <div className={`grid grid-cols-2 gap-3 md:gap-4`}>
        <div className={`rounded-xl p-4 shadow-card border ${isMobile 
          ? 'bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm border-border/30 hover:from-card/70 hover:to-card/50 transition-all duration-300' 
          : 'bg-gradient-card border-border/50'
        }`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${isMobile ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50'}`}>
              <Package className={`h-4 w-4 ${isMobile ? 'text-blue-500/80' : 'text-blue-600'}`} />
            </div>
            <div>
              <p className={`text-xs ${isMobile ? 'text-muted-foreground' : 'text-muted-foreground'}`}>Products</p>
              <p className={`text-lg font-semibold ${isMobile ? 'text-foreground' : ''}`}>
                {stats?.totalProducts || 0}
              </p>
            </div>
          </div>
        </div>

        <div className={`rounded-xl p-4 shadow-card border ${isMobile 
          ? 'bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm border-border/30 hover:from-card/70 hover:to-card/50 transition-all duration-300' 
          : 'bg-gradient-card border-border/50'
        }`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${isMobile ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50'}`}>
              <ShoppingCart className={`h-4 w-4 ${isMobile ? 'text-green-500/80' : 'text-green-600'}`} />
            </div>
            <div>
              <p className={`text-xs ${isMobile ? 'text-muted-foreground' : 'text-muted-foreground'}`}>Orders</p>
              <p className={`text-lg font-semibold ${isMobile ? 'text-foreground' : ''}`}>
                {stats?.totalOrders || 0}
              </p>
            </div>
          </div>
        </div>

        <div className={`rounded-xl p-4 shadow-card border ${isMobile 
          ? 'bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm border-border/30 hover:from-card/70 hover:to-card/50 transition-all duration-300' 
          : 'bg-gradient-card border-border/50'
        }`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${isMobile ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-orange-50'}`}>
              <Clock className={`h-4 w-4 ${isMobile ? 'text-orange-500/80' : 'text-orange-600'}`} />
            </div>
            <div>
              <p className={`text-xs ${isMobile ? 'text-muted-foreground' : 'text-muted-foreground'}`}>Pending</p>
              <p className={`text-lg font-semibold ${isMobile ? 'text-foreground' : ''}`}>
                {stats?.pendingOrders || 0}
              </p>
            </div>
          </div>
        </div>

        <div className={`rounded-xl p-4 shadow-card border ${isMobile 
          ? 'bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm border-border/30 hover:from-card/70 hover:to-card/50 transition-all duration-300' 
          : 'bg-gradient-card border-border/50'
        }`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${isMobile ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50'}`}>
              <TrendingUp className={`h-4 w-4 ${isMobile ? 'text-red-500/80' : 'text-red-600'}`} />
            </div>
            <div>
              <p className={`text-xs ${isMobile ? 'text-muted-foreground' : 'text-muted-foreground'}`}>Low Stock</p>
              <p className={`text-lg font-semibold ${isMobile ? 'text-foreground' : ''}`}>
                {stats?.lowStockProducts || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Overview */}
      <div className={`rounded-xl p-4 shadow-card border ${isMobile 
        ? 'bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm border-border/30' 
        : 'bg-gradient-card border-border/50'
      }`}>
        <h3 className={`font-semibold text-lg mb-3 ${isMobile ? 'text-foreground flex items-center gap-2' : ''}`}>
          {isMobile && <Zap className="h-5 w-5 text-primary/60" />}
          Today's Overview
        </h3>
        <div className="space-y-3">
          <div className={`flex items-center justify-between py-2 border-b ${isMobile ? 'border-border/20' : 'border-border/20'}`}>
            <div className="flex items-center gap-3">
              <div className={`p-1.5 rounded-lg ${isMobile ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50'}`}>
                <ShoppingCart className={`h-4 w-4 ${isMobile ? 'text-green-500/80' : 'text-green-600'}`} />
              </div>
              <div>
                <p className={`text-sm font-medium`}>New Orders</p>
                <p className={`text-xs text-muted-foreground`}>Last 24 hours</p>
              </div>
            </div>
            <span className={`text-sm font-semibold`}>{stats?.todayOrders || 0}</span>
          </div>
          
          <div className={`flex items-center justify-between py-2 border-b ${isMobile ? 'border-border/20' : 'border-border/20'}`}>
            <div className="flex items-center gap-3">
              <div className={`p-1.5 rounded-lg ${isMobile ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50'}`}>
                <DollarSign className={`h-4 w-4 ${isMobile ? 'text-blue-500/80' : 'text-blue-600'}`} />
              </div>
              <div>
                <p className={`text-sm font-medium`}>Today's Sales</p>
                <p className={`text-xs text-muted-foreground`}>Revenue generated</p>
              </div>
            </div>
            <span className={`text-sm font-semibold`}>{(stats?.todayRevenue || 0).toFixed(2)} RON</span>
          </div>
          
          {stats?.lowStockProducts > 0 && (
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-lg ${isMobile ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-orange-50'}`}>
                  <Package className={`h-4 w-4 ${isMobile ? 'text-orange-500/80' : 'text-orange-600'}`} />
                </div>
                <div>
                  <p className={`text-sm font-medium ${isMobile ? 'text-orange-500/80' : 'text-orange-600'}`}>Low Stock Alert</p>
                  <p className={`text-xs text-muted-foreground`}>Products need restocking</p>
                </div>
              </div>
              <span className={`text-sm font-semibold ${isMobile ? 'text-orange-500/80' : 'text-orange-600'}`}>{stats?.lowStockProducts}</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className={`space-y-3`}>
        <h3 className={`font-semibold text-lg px-1 ${isMobile ? 'text-foreground flex items-center gap-2' : ''}`}>
          {isMobile && <Star className="h-5 w-5 text-primary/60" />}
          Quick Actions
        </h3>
        
        <div className="space-y-3">
          <Button 
            variant="ghost" 
            className={`w-full justify-start h-14 rounded-xl transition-all duration-200 text-foreground ${isMobile 
              ? 'bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm border border-border/30 hover:from-card/70 hover:to-card/50 hover:text-primary' 
              : 'bg-gradient-card shadow-card border border-border/50 hover:bg-muted/80 hover:shadow-elegant hover:text-purple-600'
            }`}
            onClick={() => setActiveTab('products')}
          >
            <div className="flex items-center gap-4">
              <div className={`p-2 rounded-lg ${isMobile ? 'bg-primary/10 border border-primary/20' : 'bg-primary/10'}`}>
                <Package className={`h-5 w-5 ${isMobile ? 'text-primary/80' : 'text-primary'}`} />
              </div>
              <div className="text-left">
                <p className={`font-medium`}>
                  Manage Products
                </p>
                <p className={`text-xs text-muted-foreground`}>
                  Add, edit, and organize your inventory
                </p>
              </div>
            </div>
          </Button>

          <Button 
            variant="ghost" 
            className={`w-full justify-start h-14 rounded-xl transition-all duration-200 text-foreground ${isMobile 
              ? 'bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm border border-border/30 hover:from-card/70 hover:to-card/50 hover:text-green-600' 
              : 'bg-gradient-card shadow-card border border-border/50 hover:bg-muted/80 hover:shadow-elegant hover:text-purple-600'
            }`}
            onClick={() => setActiveTab('orders')}
          >
            <div className="flex items-center gap-4">
              <div className={`p-2 rounded-lg ${isMobile ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50'}`}>
                <ShoppingCart className={`h-5 w-5 ${isMobile ? 'text-green-500/80' : 'text-green-600'}`} />
              </div>
              <div className="text-left">
                <p className={`font-medium`}>
                  View Orders
                </p>
                <p className={`text-xs text-muted-foreground`}>
                  Process and track customer orders
                </p>
              </div>
            </div>
          </Button>

          <Button 
            variant="ghost" 
            className={`w-full justify-start h-14 rounded-xl transition-all duration-200 text-foreground ${isMobile 
              ? 'bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm border border-border/30 hover:from-card/70 hover:to-card/50 hover:text-blue-600' 
              : 'bg-gradient-card shadow-card border border-border/50 hover:bg-muted/80 hover:shadow-elegant hover:text-purple-600'
            }`}
            onClick={() => setActiveTab('customers')}
          >
            <div className="flex items-center gap-4">
              <div className={`p-2 rounded-lg ${isMobile ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50'}`}>
                <Users className={`h-5 w-5 ${isMobile ? 'text-blue-500/80' : 'text-blue-600'}`} />
              </div>
              <div className="text-left">
                <p className={`font-medium`}>
                  Customers
                </p>
                <p className={`text-xs text-muted-foreground`}>
                  Manage customer relationships
                </p>
              </div>
            </div>
          </Button>
        </div>
      </div>

      {/* Bottom Navigation Spacer - ensures content is not hidden behind nav */}
      <div className="h-20"></div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return renderDashboard();
      case 'products':
        return (
          <div className="p-3 md:p-6 pb-24 md:pb-6 safe-area-bottom">
            <ProductManagement />
          </div>
        );
      case 'stock':
        return (
          <div className="p-3 md:p-6 pb-24 md:pb-6 safe-area-bottom">
            <StockManagement />
          </div>
        );
      case 'orders':
        return (
          <div className="p-3 md:p-6 pb-24 md:pb-6 safe-area-bottom">
            <OrderManagement />
          </div>
        );
      case 'customers':
        return (
          <div className="p-3 md:p-6 pb-24 md:pb-6 safe-area-bottom">
            <CustomerManagement />
          </div>
        );
      case 'payments':
        return (
          <div className="p-3 md:p-6 pb-24 md:pb-6 safe-area-bottom">
            <PaymentStatistics />
          </div>
        );
      case 'settings':
        return (
          <div className="p-3 md:p-6 pb-24 md:pb-6 safe-area-bottom">
            <StoreSettings />
          </div>
        );
      case 'templates':
        return (
          <div className="p-3 md:p-6 pb-24 md:pb-6 safe-area-bottom">
            <TemplatesManagement />
          </div>
        );
      default:
        return renderDashboard();
    }
  };

  return (
    <SidebarProvider>
      <div className="mobile-viewport flex w-full bg-background safe-area-left safe-area-right">
        <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} />
        
        <div className="flex-1 flex flex-col min-w-0">
          <MobileHeader 
            userEmail={user.email || undefined} 
            storeName={stats?.storeName}
            onTabChange={setActiveTab}
          />
          
          <main className="flex-1 overflow-auto hide-scrollbar">
            {renderContent()}
          </main>
        </div>
        
        {/* Bottom Navigation */}
        <BottomNavigation activeTab={activeTab} onTabChange={setActiveTab} />
        
        {/* AI Chat Button */}
        <Button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-20 right-4 h-14 w-14 rounded-full bg-gradient-primary shadow-glow z-40 safe-area-right hover:shadow-elegant transition-all duration-200 border-0 md:bottom-6 md:right-6 md:h-16 md:w-16"
          size="sm"
        >
          <MessageCircle className="h-6 w-6 text-white md:h-7 md:w-7" />
        </Button>
        
        {/* AI Chat Modal */}
        <AIChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      </div>
    </SidebarProvider>
  );
};

export default Index;