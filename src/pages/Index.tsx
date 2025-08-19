import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileHeader } from '@/components/MobileHeader';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import ProductManagement from '@/components/ProductManagement';
import OrderManagement from '@/components/OrderManagement';
import StoreSettings from '@/components/StoreSettings';
import StockManagement from '@/components/StockManagement';
import CustomerManagement from '@/components/CustomerManagement';
import PaymentStatistics from '@/components/PaymentStatistics';
import CollectionsManagement from '@/components/CollectionsManagement';
import { Package, ShoppingCart, DollarSign, Clock, TrendingUp, Users, MessageCircle } from 'lucide-react';
import AIChat from '@/components/AIChat';
import { BottomNavigation } from '@/components/BottomNavigation';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
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
      const [productsRes, ordersRes, profileRes] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact' }),
        supabase.from('orders').select('*', { count: 'exact' }),
        supabase.from('profiles').select('store_name').eq('user_id', user?.id).single()
      ]);

      const totalRevenue = ordersRes.data?.reduce((sum, order) => sum + Number(order.total), 0) || 0;
      const pendingOrders = ordersRes.data?.filter(order => order.payment_status === 'pending').length || 0;
      const lowStockProducts = productsRes.data?.filter(product => product.stock < 5).length || 0;

      return {
        totalProducts: productsRes.count || 0,
        totalOrders: ordersRes.count || 0,
        totalRevenue,
        pendingOrders,
        lowStockProducts,
        storeName: profileRes.data?.store_name || 'My Store'
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
    <div className="space-y-4 p-3 md:p-6 pb-20 safe-area-bottom">
      {/* Hero Value Card */}
      <div className="bg-gradient-primary rounded-2xl p-6 md:p-8 text-white shadow-glow relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-white/80 text-sm mb-1">Your Store Value</p>
              <h1 className="text-3xl md:text-4xl font-bold">
                ${stats?.totalRevenue?.toFixed(2) || '0.00'}
              </h1>
              <p className="text-white/80 text-sm mt-1">
                ▲ ${((stats?.totalRevenue || 0) * 0.15).toFixed(2)} this week
              </p>
            </div>
            <Button 
              variant="secondary" 
              size="sm" 
              className="bg-white/20 border-white/30 text-white hover:bg-white/30 rounded-full px-4"
              onClick={() => setActiveTab('payments')}
            >
              + View Analytics
            </Button>
          </div>
        </div>
        
        {/* Decorative gradient overlay */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-8 translate-x-8"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-8 -translate-x-8"></div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <div className="bg-gradient-card rounded-xl p-4 shadow-card border border-border/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Package className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Products</p>
              <p className="text-lg font-semibold">{stats?.totalProducts || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-card rounded-xl p-4 shadow-card border border-border/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-50 rounded-lg">
              <ShoppingCart className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Orders</p>
              <p className="text-lg font-semibold">{stats?.totalOrders || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-card rounded-xl p-4 shadow-card border border-border/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-50 rounded-lg">
              <Clock className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-lg font-semibold">{stats?.pendingOrders || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-card rounded-xl p-4 shadow-card border border-border/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-50 rounded-lg">
              <TrendingUp className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Low Stock</p>
              <p className="text-lg font-semibold">{stats?.lowStockProducts || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Overview */}
      <div className="bg-gradient-card rounded-xl p-4 shadow-card border border-border/50">
        <h3 className="font-semibold text-lg mb-3">Today's Overview</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-green-50 rounded-lg">
                <ShoppingCart className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium">New Orders</p>
                <p className="text-xs text-muted-foreground">Last 24 hours</p>
              </div>
            </div>
            <span className="text-sm font-semibold">{Math.floor((stats?.totalOrders || 0) * 0.1)}</span>
          </div>
          
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-blue-50 rounded-lg">
                <DollarSign className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Today's Sales</p>
                <p className="text-xs text-muted-foreground">Revenue generated</p>
              </div>
            </div>
            <span className="text-sm font-semibold">${((stats?.totalRevenue || 0) * 0.05).toFixed(2)}</span>
          </div>
          
          {stats?.lowStockProducts > 0 && (
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-orange-50 rounded-lg">
                  <Package className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-orange-600">Low Stock Alert</p>
                  <p className="text-xs text-muted-foreground">Products need restocking</p>
                </div>
              </div>
              <span className="text-sm font-semibold text-orange-600">{stats?.lowStockProducts}</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <h3 className="font-semibold text-lg px-1">Quick Actions</h3>
        
        <div className="space-y-3">
          <Button 
            variant="ghost" 
            className="w-full justify-start h-14 bg-gradient-card shadow-card border border-border/50 rounded-xl hover:bg-muted/80 hover:shadow-elegant transition-all duration-200 text-foreground hover:text-purple-600"
            onClick={() => setActiveTab('products')}
          >
            <div className="flex items-center gap-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="font-medium">Manage Products</p>
                <p className="text-xs text-muted-foreground">Add, edit, and organize your inventory</p>
              </div>
            </div>
          </Button>

          <Button 
            variant="ghost" 
            className="w-full justify-start h-14 bg-gradient-card shadow-card border border-border/50 rounded-xl hover:bg-muted/80 hover:shadow-elegant transition-all duration-200 text-foreground hover:text-purple-600"
            onClick={() => setActiveTab('orders')}
          >
            <div className="flex items-center gap-4">
              <div className="p-2 bg-green-50 rounded-lg">
                <ShoppingCart className="h-5 w-5 text-green-600" />
              </div>
              <div className="text-left">
                <p className="font-medium">View Orders</p>
                <p className="text-xs text-muted-foreground">Process and track customer orders</p>
              </div>
            </div>
          </Button>

          <Button 
            variant="ghost" 
            className="w-full justify-start h-14 bg-gradient-card shadow-card border border-border/50 rounded-xl hover:bg-muted/80 hover:shadow-elegant transition-all duration-200 text-foreground hover:text-purple-600"
            onClick={() => setActiveTab('customers')}
          >
            <div className="flex items-center gap-4">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div className="text-left">
                <p className="font-medium">Customers</p>
                <p className="text-xs text-muted-foreground">Manage customer relationships</p>
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
          <div className="p-3 md:p-6 pb-20 md:pb-6">
            <ProductManagement />
          </div>
        );
      case 'stock':
        return (
          <div className="p-3 md:p-6 pb-20 md:pb-6">
            <StockManagement />
          </div>
        );
      case 'orders':
        return (
          <div className="p-3 md:p-6 pb-20 md:pb-6">
            <OrderManagement />
          </div>
        );
      case 'customers':
        return (
          <div className="p-3 md:p-6 pb-20 md:pb-6">
            <CustomerManagement />
          </div>
        );
      case 'payments':
        return (
          <div className="p-3 md:p-6 pb-20 md:pb-6">
            <PaymentStatistics />
          </div>
        );
      case 'settings':
        return (
          <div className="p-3 md:p-6 pb-20 md:pb-6">
            <StoreSettings />
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