import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, RefreshCw, Eye, Code, TestTube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface Profile {
  id: string;
  store_name: string;
  store_api_key: string;
}

const StoreSettings = () => {
  const [storeName, setStoreName] = useState('');
  const [isCodeDialogOpen, setIsCodeDialogOpen] = useState(false);
  const [testOrderData, setTestOrderData] = useState({
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+1234567890',
    address: '123 Main St, City, State 12345',
    items: '[{"product_id": "your-product-id", "quantity": 2}]',
    total: '29.99'
  });
  
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user?.id)
        .single();
      
      if (error) throw error;
      return data as Profile;
    },
    enabled: !!user
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: Partial<Profile>) => {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', user?.id)
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Settings updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update settings');
      console.error(error);
    }
  });

  const regenerateApiKey = () => {
    const newApiKey = crypto.randomUUID();
    updateProfileMutation.mutate({ store_api_key: newApiKey });
  };

  const updateStoreName = () => {
    updateProfileMutation.mutate({ store_name: storeName });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const createTestOrder = async () => {
    try {
      const orderData = {
        ...testOrderData,
        items: JSON.parse(testOrderData.items)
      };

      // This would typically be called from an external website
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${profile?.store_api_key}`
        },
        body: JSON.stringify(orderData)
      });

      if (response.ok) {
        toast.success('Test order created successfully');
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      } else {
        toast.error('Failed to create test order');
      }
    } catch (error) {
      toast.error('Invalid JSON in items field');
    }
  };

  if (isLoading) {
    return <div>Loading settings...</div>;
  }

  if (!profile) {
    return <div>Profile not found</div>;
  }

  const integrationCode = `<!-- Add this to your website -->
<script>
const STORE_API_KEY = "${profile.store_api_key}";
const API_BASE_URL = "${window.location.origin}";

// Function to create an order
async function createOrder(orderData) {
  try {
    const response = await fetch(\`\${API_BASE_URL}/api/orders\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${STORE_API_KEY}\`
      },
      body: JSON.stringify(orderData)
    });
    
    const result = await response.json();
    if (response.ok) {
      console.log('Order created:', result);
      // Redirect to payment or show success message
    } else {
      console.error('Order creation failed:', result);
    }
  } catch (error) {
    console.error('Error creating order:', error);
  }
}

// Function to get products
async function getProducts() {
  try {
    const response = await fetch(\`\${API_BASE_URL}/api/products?key=\${STORE_API_KEY}\`);
    const products = await response.json();
    console.log('Products:', products);
    return products;
  } catch (error) {
    console.error('Error fetching products:', error);
  }
}

// Example usage:
// createOrder({
//   name: "John Doe",
//   email: "john@example.com",
//   phone: "+1234567890",
//   address: "123 Main St, City, State 12345",
//   items: [
//     { product_id: "product-uuid", quantity: 2 }
//   ],
//   total: 29.99
// });
</script>`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Store Settings</CardTitle>
          <CardDescription>Configure your store information and API access</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="store-name">Store Name</Label>
            <div className="flex gap-2">
              <Input
                id="store-name"
                value={storeName || profile.store_name}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Enter store name"
              />
              <Button onClick={updateStoreName} disabled={!storeName || storeName === profile.store_name}>
                Save
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key">Store API Key</Label>
            <div className="flex gap-2">
              <Input
                id="api-key"
                value={profile.store_api_key}
                readOnly
                type="password"
              />
              <Button
                variant="outline"
                onClick={() => copyToClipboard(profile.store_api_key)}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={regenerateApiKey}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              This key is used to authenticate API requests from your website. Keep it secure!
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Website Integration</CardTitle>
          <CardDescription>Copy this code to integrate with your website</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Dialog open={isCodeDialogOpen} onOpenChange={setIsCodeDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Code className="h-4 w-4 mr-2" />
                  View Integration Code
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Website Integration Code</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="relative">
                    <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                      <code>{integrationCode}</code>
                    </pre>
                    <Button
                      className="absolute top-2 right-2"
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(integrationCode)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            
            <Button
              variant="outline"
              onClick={() => copyToClipboard(integrationCode)}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Code
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test Your Integration</CardTitle>
          <CardDescription>Create a test order to verify your setup</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="test-order" className="w-full">
            <TabsList>
              <TabsTrigger value="test-order">Test Order</TabsTrigger>
              <TabsTrigger value="api-endpoints">API Endpoints</TabsTrigger>
            </TabsList>
            <TabsContent value="test-order" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="test-name">Customer Name</Label>
                  <Input
                    id="test-name"
                    value={testOrderData.name}
                    onChange={(e) => setTestOrderData({ ...testOrderData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="test-email">Customer Email</Label>
                  <Input
                    id="test-email"
                    value={testOrderData.email}
                    onChange={(e) => setTestOrderData({ ...testOrderData, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="test-phone">Customer Phone</Label>
                  <Input
                    id="test-phone"
                    value={testOrderData.phone}
                    onChange={(e) => setTestOrderData({ ...testOrderData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="test-total">Total Amount</Label>
                  <Input
                    id="test-total"
                    type="number"
                    step="0.01"
                    value={testOrderData.total}
                    onChange={(e) => setTestOrderData({ ...testOrderData, total: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="test-address">Customer Address</Label>
                <Textarea
                  id="test-address"
                  value={testOrderData.address}
                  onChange={(e) => setTestOrderData({ ...testOrderData, address: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="test-items">Order Items (JSON)</Label>
                <Textarea
                  id="test-items"
                  value={testOrderData.items}
                  onChange={(e) => setTestOrderData({ ...testOrderData, items: e.target.value })}
                  placeholder='[{"product_id": "uuid", "quantity": 1}]'
                />
              </div>
              <Button onClick={createTestOrder}>
                <TestTube className="h-4 w-4 mr-2" />
                Create Test Order
              </Button>
            </TabsContent>
            <TabsContent value="api-endpoints" className="space-y-4">
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2">Get Products</h4>
                  <code className="text-sm bg-muted p-2 rounded block">
                    GET {window.location.origin}/api/products?key={profile.store_api_key}
                  </code>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2">Create Order</h4>
                  <code className="text-sm bg-muted p-2 rounded block">
                    POST {window.location.origin}/api/orders<br/>
                    Authorization: Bearer {profile.store_api_key}
                  </code>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default StoreSettings;