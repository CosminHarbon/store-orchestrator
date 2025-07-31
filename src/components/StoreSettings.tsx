import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, RefreshCw, Eye, Code, TestTube, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface Profile {
  id: string;
  store_name: string;
  store_api_key: string;
  invoicing_provider?: string;
  shipping_provider?: string;
  payment_provider?: string;
}

const StoreSettings = () => {
  const [storeName, setStoreName] = useState('');
  const [isCodeDialogOpen, setIsCodeDialogOpen] = useState(false);
  const [integrations, setIntegrations] = useState({
    invoicing: 'oblio.eu',
    shipping: 'sameday',
    payment: 'netpopia'
  });
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

  const updateIntegrations = () => {
    updateProfileMutation.mutate({
      invoicing_provider: integrations.invoicing,
      shipping_provider: integrations.shipping,
      payment_provider: integrations.payment
    });
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
const API_BASE_URL = "https://uffmgvdtkoxkjolfrhab.supabase.co/functions/v1/store-api";

// Function to get products with images and stock information
async function getProducts() {
  try {
    const response = await fetch(\`\${API_BASE_URL}/products?api_key=\${STORE_API_KEY}\`);
    const result = await response.json();
    if (response.ok) {
      console.log('Products loaded:', result.products);
      // Each product now includes: id, title, description, price, stock, sku, category, image, images, primary_image, image_count
      result.products.forEach(product => {
        console.log(\`Product: \${product.title} - Price: $\${product.price} - Stock: \${product.stock} items\`);
        console.log(\`Primary Image: \${product.primary_image || 'No image'}\`);
        console.log(\`Total Images: \${product.image_count}\`);
        if (product.images && product.images.length > 0) {
          console.log('All images:', product.images.map(img => img.image_url));
        }
      });
      return result.products || [];
    } else {
      console.error('Failed to load products:', result);
      return [];
    }
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

// Function to check if product is in stock
function isInStock(product, requestedQuantity = 1) {
  return product.stock >= requestedQuantity;
}

// Function to create an order (includes stock validation)
async function createOrder(orderData) {
  try {
    // Validate stock before creating order
    const products = await getProducts();
    for (const item of orderData.items) {
      const product = products.find(p => p.id === item.product_id);
      if (product && !isInStock(product, item.quantity)) {
        throw new Error(\`Not enough stock for \${product.title}. Available: \${product.stock}, Requested: \${item.quantity}\`);
      }
    }

    const response = await fetch(\`\${API_BASE_URL}/orders?api_key=\${STORE_API_KEY}\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        customer_name: orderData.customer_name,
        customer_email: orderData.customer_email,
        customer_address: orderData.customer_address,
        customer_phone: orderData.customer_phone || null,
        total: parseFloat(orderData.total),
        items: orderData.items // Array of {product_id, title, price, quantity}
      })
    });
    
    const result = await response.json();
    if (response.ok) {
      console.log('Order created:', result);
      return result;
    } else {
      console.error('Order creation failed:', result);
      throw new Error(result.error || 'Failed to create order');
    }
  } catch (error) {
    console.error('Error creating order:', error);
    throw error;
  }
}

// Store API Class (Recommended approach)
class StoreAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://uffmgvdtkoxkjolfrhab.supabase.co/functions/v1/store-api';
  }

  async getProducts() {
    const response = await fetch(\`\${this.baseUrl}/products?api_key=\${this.apiKey}\`);
    const data = await response.json();
    return data.products || [];
  }

  isInStock(product, quantity = 1) {
    return product.stock >= quantity;
  }

  async createOrder(orderData) {
    // Check stock before creating order
    const products = await this.getProducts();
    for (const item of orderData.items) {
      const product = products.find(p => p.id === item.product_id);
      if (product && !this.isInStock(product, item.quantity)) {
        throw new Error(\`Insufficient stock for \${product.title}. Available: \${product.stock}\`);
      }
    }

    const response = await fetch(\`\${this.baseUrl}/orders?api_key=\${this.apiKey}\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
    return await response.json();
  }
}

// Usage Example:
// const store = new StoreAPI('${profile.store_api_key}');
// const products = await store.getProducts();
// 
// Display products with images and stock:
// products.forEach(product => {
//   console.log(\`\${product.title} - $\${product.price} - \${product.stock} in stock\`);
//   console.log(\`Primary Image: \${product.primary_image || 'No image'}\`);
//   console.log(\`Total Images: \${product.image_count}\`);
//   
//   // Display product with image in HTML
//   const productHTML = \`
//     <div class="product">
//       <img src="\${product.primary_image || '/placeholder.jpg'}" alt="\${product.title}" style="width: 200px; height: 200px; object-fit: cover;">
//       <h3>\${product.title}</h3>
//       <p>$\${product.price}</p>
//       <p>\${product.stock > 0 ? product.stock + ' in stock' : 'Out of stock'}</p>
//       \${product.images.length > 1 ? '<p>' + product.images.length + ' images available</p>' : ''}
//     </div>
//   \`;
//   
//   // Gallery view with all images
//   if (product.images && product.images.length > 0) {
//     product.images.forEach((img, index) => {
//       console.log(\`Image \${index + 1}: \${img.image_url} (Primary: \${img.is_primary})\`);
//     });
//   }
//   
//   if (product.stock === 0) {
//     console.log('OUT OF STOCK');
//   } else if (product.stock < 5) {
//     console.log('LOW STOCK WARNING');
//   }
// });
</script>`;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="store-settings" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="store-settings">Store Settings</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>
        
        <TabsContent value="store-settings" className="space-y-6">
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
                        GET https://uffmgvdtkoxkjolfrhab.supabase.co/functions/v1/store-api/products?api_key={profile.store_api_key}
                      </code>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-semibold mb-2">Create Order</h4>
                      <code className="text-sm bg-muted p-2 rounded block">
                        POST https://uffmgvdtkoxkjolfrhab.supabase.co/functions/v1/store-api/orders?api_key={profile.store_api_key}
                      </code>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Service Integrations</CardTitle>
              <CardDescription>Connect your store with invoicing, shipping, and payment providers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6">
                <div className="space-y-2">
                  <Label htmlFor="invoicing-provider">Invoicing Provider</Label>
                  <Select
                    value={integrations.invoicing}
                    onValueChange={(value) => setIntegrations({ ...integrations, invoicing: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select invoicing provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="oblio.eu">Oblio.eu</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Handles automatic invoice generation for your orders
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shipping-provider">Shipping Provider</Label>
                  <Select
                    value={integrations.shipping}
                    onValueChange={(value) => setIntegrations({ ...integrations, shipping: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select shipping provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sameday">Sameday</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Manages shipping and delivery for your orders
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment-provider">Payment Processor</Label>
                  <Select
                    value={integrations.payment}
                    onValueChange={(value) => setIntegrations({ ...integrations, payment: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment processor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="netpopia">Netpopia Payments</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Processes online payments from your customers
                  </p>
                </div>
              </div>

              <Button onClick={updateIntegrations} className="w-full">
                <Settings className="h-4 w-4 mr-2" />
                Save Integration Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StoreSettings;