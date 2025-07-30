import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import ProductManagement from '@/components/ProductManagement';
import OrderManagement from '@/components/OrderManagement';
import StoreSettings from '@/components/StoreSettings';
import { Package, ShoppingCart, Settings, BarChart3 } from 'lucide-react';

const Index = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [productsRes, ordersRes] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact' }),
        supabase.from('orders').select('*', { count: 'exact' })
      ]);

      const totalRevenue = ordersRes.data?.reduce((sum, order) => sum + Number(order.total), 0) || 0;
      const pendingOrders = ordersRes.data?.filter(order => order.payment_status === 'pending').length || 0;

      return {
        totalProducts: productsRes.count || 0,
        totalOrders: ordersRes.count || 0,
        totalRevenue,
        pendingOrders
      };
    },
    enabled: !!user
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-xl">Loading...</h1>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to auth
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Ecommerce Admin</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <Button variant="outline" onClick={signOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Products
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Orders
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Products</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.totalProducts || 0}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.totalOrders || 0}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${stats?.totalRevenue.toFixed(2) || '0.00'}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.pendingOrders || 0}</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Welcome to Your Store Admin</CardTitle>
                <CardDescription>
                  Manage your products, orders, and store settings from this dashboard
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Button 
                    variant="outline" 
                    className="h-24 flex flex-col gap-2"
                    onClick={() => setActiveTab('products')}
                  >
                    <Package className="h-8 w-8" />
                    Manage Products
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-24 flex flex-col gap-2"
                    onClick={() => setActiveTab('orders')}
                  >
                    <ShoppingCart className="h-8 w-8" />
                    View Orders
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-24 flex flex-col gap-2"
                    onClick={() => setActiveTab('settings')}
                  >
                    <Settings className="h-8 w-8" />
                    Store Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products">
            <ProductManagement />
          </TabsContent>

          <TabsContent value="orders">
            <OrderManagement />
          </TabsContent>

          <TabsContent value="settings">
            <StoreSettings />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
