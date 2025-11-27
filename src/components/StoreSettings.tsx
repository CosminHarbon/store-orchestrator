import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, RefreshCw, Eye, Code, TestTube, Settings, ChevronDown, FileText, CreditCard, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { EAWBConnectionTest } from './EAWBConnectionTest';
import { EAWBDiagnosis } from './EAWBDiagnosis';

interface Profile {
  id: string;
  store_name: string;
  store_api_key: string;
  invoicing_provider?: string;
  shipping_provider?: string;
  payment_provider?: string;
  oblio_api_key?: string;
  oblio_name?: string;
  oblio_email?: string;
  oblio_series_name?: string;
  oblio_first_number?: string;
  sameday_api_key?: string;
  sameday_name?: string;
  sameday_email?: string;
  netpopia_api_key?: string;
  netpopia_name?: string;
  netpopia_email?: string;
  netpopia_signature?: string;
  netpopia_sandbox?: boolean;
  woot_api_key?: string;
  woot_name?: string;
  woot_email?: string;
  eawb_api_key?: string;
  eawb_name?: string;
  eawb_email?: string;
  eawb_phone?: string;
  eawb_address?: string;
  eawb_billing_address_id?: number;
  eawb_default_carrier_id?: number;
  eawb_default_service_id?: number;
  cash_payment_enabled?: boolean;
  cash_payment_fee?: number;
  home_delivery_fee?: number;
  locker_delivery_fee?: number;
}

const StoreSettings = () => {
  const [storeName, setStoreName] = useState('');
  const [isCodeDialogOpen, setIsCodeDialogOpen] = useState(false);
  const [openCollapsibles, setOpenCollapsibles] = useState({
    invoicing: false,
    payment: false,
    delivery: false
  });
  const [integrations, setIntegrations] = useState({
    invoicing: 'oblio.eu',
    shipping: 'sameday',
    payment: 'netpopia'
  });
  const [providerConfigs, setProviderConfigs] = useState({
    oblio: { api_key: '', name: '', email: '', series_name: '', first_number: '' },
    sameday: { api_key: '', name: '', email: '' },
    netpopia: { api_key: '', name: '', email: '', signature: '', sandbox: true },
    woot: { api_key: '', name: '', email: '' },
    eawb: { api_key: '', name: '', email: '', phone: '', address: '', billing_address_id: '', default_carrier_id: '', default_service_id: '' }
  });
  const [feeSettings, setFeeSettings] = useState({
    cash_payment_enabled: true,
    cash_payment_fee: 0,
    home_delivery_fee: 0,
    locker_delivery_fee: 0
  });
  const [testOrderData, setTestOrderData] = useState({
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+1234567890',
    address: '123 Main St, City, State 12345',
    items: '[{"product_id": "your-product-id", "quantity": 2}]',
    total: '29.99'
  });
  
  // eAWB fetch states
  const [eawbData, setEawbData] = useState({
    billingAddresses: [],
    carriers: [],
    services: [],
  });
  const [eawbLoading, setEawbLoading] = useState({
    billingAddresses: false,
    carriers: false,
    services: false,
  });
  const [selectedCarrierForServices, setSelectedCarrierForServices] = useState('');
  
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

  // Initialize provider configs when profile data loads
  useEffect(() => {
    if (profile) {
      setProviderConfigs({
        oblio: {
          api_key: profile.oblio_api_key || '',
          name: profile.oblio_name || '',
          email: profile.oblio_email || '',
          series_name: profile.oblio_series_name || '',
          first_number: profile.oblio_first_number || ''
        },
        sameday: {
          api_key: profile.sameday_api_key || '',
          name: profile.sameday_name || '',
          email: profile.sameday_email || ''
        },
        netpopia: {
          api_key: profile.netpopia_api_key || '',
          name: profile.netpopia_name || '',
          email: profile.netpopia_email || '',
          signature: profile.netpopia_signature || '',
          sandbox: profile.netpopia_sandbox ?? true
        },
        woot: {
          api_key: profile.woot_api_key || '',
          name: profile.woot_name || '',
          email: profile.woot_email || ''
        },
        eawb: {
          api_key: profile.eawb_api_key || '',
          name: profile.eawb_name || '',
          email: profile.eawb_email || '',
          phone: profile.eawb_phone || '',
          address: profile.eawb_address || '',
          billing_address_id: profile.eawb_billing_address_id?.toString() || '',
          default_carrier_id: profile.eawb_default_carrier_id?.toString() || '',
          default_service_id: profile.eawb_default_service_id?.toString() || ''
        }
      });
      
      setStoreName(profile.store_name || '');
      setIntegrations({
        invoicing: profile.invoicing_provider || 'oblio.eu',
        shipping: profile.shipping_provider || 'sameday',
        payment: profile.payment_provider || 'netpopia'
      });
      setFeeSettings({
        cash_payment_enabled: profile.cash_payment_enabled ?? true,
        cash_payment_fee: profile.cash_payment_fee || 0,
        home_delivery_fee: profile.home_delivery_fee || 0,
        locker_delivery_fee: profile.locker_delivery_fee || 0
      });
    }
  }, [profile]);

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
      payment_provider: integrations.payment,
      oblio_api_key: providerConfigs.oblio.api_key,
      oblio_name: providerConfigs.oblio.name,
      oblio_email: providerConfigs.oblio.email,
      oblio_series_name: providerConfigs.oblio.series_name,
      oblio_first_number: providerConfigs.oblio.first_number,
      sameday_api_key: providerConfigs.sameday.api_key,
      sameday_name: providerConfigs.sameday.name,
      sameday_email: providerConfigs.sameday.email,
      netpopia_api_key: providerConfigs.netpopia.api_key,
      netpopia_name: providerConfigs.netpopia.name,
      netpopia_email: providerConfigs.netpopia.email,
      netpopia_signature: providerConfigs.netpopia.signature,
      netpopia_sandbox: providerConfigs.netpopia.sandbox,
      woot_api_key: providerConfigs.woot.api_key,
      woot_name: providerConfigs.woot.name,
      woot_email: providerConfigs.woot.email,
      eawb_api_key: providerConfigs.eawb.api_key,
      eawb_name: providerConfigs.eawb.name,
      eawb_email: providerConfigs.eawb.email,
      eawb_phone: providerConfigs.eawb.phone,
      eawb_address: providerConfigs.eawb.address,
      eawb_billing_address_id: providerConfigs.eawb.billing_address_id ? parseInt(providerConfigs.eawb.billing_address_id) : null,
      eawb_default_carrier_id: providerConfigs.eawb.default_carrier_id ? parseInt(providerConfigs.eawb.default_carrier_id) : null,
      eawb_default_service_id: providerConfigs.eawb.default_service_id ? parseInt(providerConfigs.eawb.default_service_id) : null,
      cash_payment_enabled: feeSettings.cash_payment_enabled,
      cash_payment_fee: feeSettings.cash_payment_fee,
      home_delivery_fee: feeSettings.home_delivery_fee,
      locker_delivery_fee: feeSettings.locker_delivery_fee
    });
  };

  const updateProviderConfig = (provider: 'oblio' | 'sameday' | 'netpopia' | 'woot' | 'eawb', field: 'api_key' | 'name' | 'email' | 'series_name' | 'first_number' | 'signature' | 'sandbox' | 'phone' | 'address' | 'billing_address_id' | 'default_carrier_id' | 'default_service_id', value: string | boolean) => {
    setProviderConfigs(prev => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        [field]: value
      }
    }));
  };

  // eAWB note: API doesn't support fetching billing addresses, must be entered manually

  const fetchEawbCarriers = async () => {
    if (!providerConfigs.eawb?.api_key) {
      toast.error('Please enter your eAWB API key first');
      return;
    }

    setEawbLoading(prev => ({ ...prev, carriers: true }));
    
    try {
      const { data, error } = await supabase.functions.invoke('eawb-delivery', {
        body: { action: 'fetch_carriers' }
      });

      if (error) throw error;

      if (data.success) {
        setEawbData(prev => ({ ...prev, carriers: data.data.data || [] }));
        toast.success('Carriers fetched successfully');
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error fetching carriers:', error);
      toast.error('Failed to fetch carriers: ' + error.message);
    } finally {
      setEawbLoading(prev => ({ ...prev, carriers: false }));
    }
  };

  const fetchEawbServices = async (carrierId: string) => {
    if (!providerConfigs.eawb?.api_key) {
      toast.error('Please enter your eAWB API key first');
      return;
    }
    
    if (!carrierId) {
      toast.error('Please select a carrier first');
      return;
    }

    setEawbLoading(prev => ({ ...prev, services: true }));
    
    try {
      const { data, error } = await supabase.functions.invoke('eawb-delivery', {
        body: { action: 'fetch_services', carrier_id: carrierId }
      });

      if (error) throw error;

      if (data.success) {
        setEawbData(prev => ({ ...prev, services: data.data.data || [] }));
        toast.success('Services fetched successfully');
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error fetching services:', error);
      toast.error('Failed to fetch services: ' + error.message);
    } finally {
      setEawbLoading(prev => ({ ...prev, services: false }));
    }
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

// Function to create payment (redirects to Netpopia)
async function createPayment(orderData) {
  try {
    const response = await fetch(\`\${API_BASE_URL}/payments?api_key=\${STORE_API_KEY}\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        order_id: orderData.order_id,
        amount: parseFloat(orderData.total),
        currency: 'RON',
        description: \`Order \${orderData.order_id}\`,
        customer_name: orderData.customer_name,
        customer_email: orderData.customer_email,
        customer_phone: orderData.customer_phone,
        return_url: orderData.return_url || window.location.origin + '/payment-success',
        notify_url: orderData.notify_url || \`\${API_BASE_URL}/payment-webhook\`
      })
    });
    
    const result = await response.json();
    if (response.ok) {
      console.log('Payment created:', result);
      // Redirect to payment page
      if (result.payment_url) {
        window.location.href = result.payment_url;
      }
      return result;
    } else {
      console.error('Payment creation failed:', result);
      throw new Error(result.error || 'Failed to create payment');
    }
  } catch (error) {
    console.error('Error creating payment:', error);
    throw error;
  }
}

// Function to check payment status
async function checkPaymentStatus(paymentId) {
  try {
    const response = await fetch(\`\${API_BASE_URL}/payment-status?api_key=\${STORE_API_KEY}&payment_id=\${paymentId}\`);
    const result = await response.json();
    
    if (response.ok) {
      console.log('Payment status:', result);
      return result;
    } else {
      console.error('Failed to get payment status:', result);
      throw new Error(result.error || 'Failed to get payment status');
    }
  } catch (error) {
    console.error('Error checking payment status:', error);
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

  async createPayment(orderData) {
    const response = await fetch(\`\${this.baseUrl}/payments?api_key=\${this.apiKey}\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: orderData.order_id,
        amount: parseFloat(orderData.total),
        currency: 'RON',
        description: \`Order \${orderData.order_id}\`,
        customer_name: orderData.customer_name,
        customer_email: orderData.customer_email,
        customer_phone: orderData.customer_phone,
        return_url: orderData.return_url || window.location.origin + '/payment-success',
        notify_url: orderData.notify_url || \`\${this.baseUrl}/payment-webhook\`
      })
    });
    const result = await response.json();
    if (result.payment_url) {
      window.location.href = result.payment_url;
    }
    return result;
  }

  async checkPaymentStatus(paymentId) {
    const response = await fetch(\`\${this.baseUrl}/payment-status?api_key=\${this.apiKey}&payment_id=\${paymentId}\`);
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
              <div className="flex flex-col sm:flex-row gap-2">
                <Dialog open={isCodeDialogOpen} onOpenChange={setIsCodeDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full sm:w-auto text-sm">
                      <Code className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span className="truncate">View Integration Code</span>
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
                  className="w-full sm:w-auto text-sm"
                  variant="outline"
                  onClick={() => copyToClipboard(integrationCode)}
                >
                  <Copy className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">Copy Code</span>
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
              {/* Desktop View - Original Layout */}
              <div className="hidden md:block">
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
                    
                    {integrations.invoicing === 'oblio.eu' && (
                      <div className="mt-4 p-4 border rounded-lg space-y-4">
                        <h4 className="font-medium">Oblio.eu Configuration</h4>
                        <div className="grid gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="oblio-email">Oblio Email Address</Label>
                            <Input
                              id="oblio-email"
                              type="email"
                              value={providerConfigs.oblio.email}
                              onChange={(e) => updateProviderConfig('oblio', 'email', e.target.value)}
                              placeholder="Enter your Oblio.eu account email"
                            />
                            <p className="text-xs text-muted-foreground">
                              This is your Oblio.eu login email (client_id)
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="oblio-api-key">API Secret Key</Label>
                            <Input
                              id="oblio-api-key"
                              type="password"
                              value={providerConfigs.oblio.api_key}
                              onChange={(e) => updateProviderConfig('oblio', 'api_key', e.target.value)}
                              placeholder="Enter your Oblio.eu API secret key"
                            />
                            <p className="text-xs text-muted-foreground">
                              Found in Oblio.eu Settings → Account Data (client_secret)
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="oblio-series-name">Invoice Series</Label>
                            <Input
                              id="oblio-series-name"
                              value={providerConfigs.oblio.series_name}
                              onChange={(e) => updateProviderConfig('oblio', 'series_name', e.target.value)}
                              placeholder="e.g., APM"
                            />
                            <p className="text-xs text-muted-foreground">
                              Series prefix for your invoices (e.g., APM, FCT)
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="oblio-first-number">First Invoice Number</Label>
                            <Input
                              id="oblio-first-number"
                              value={providerConfigs.oblio.first_number}
                              onChange={(e) => updateProviderConfig('oblio', 'first_number', e.target.value)}
                              placeholder="e.g., 001"
                            />
                            <p className="text-xs text-muted-foreground">
                              Starting number for your invoices (e.g., 001, 0001)
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="oblio-name">Company Name</Label>
                            <Input
                              id="oblio-name"
                              value={providerConfigs.oblio.name}
                              onChange={(e) => updateProviderConfig('oblio', 'name', e.target.value)}
                              placeholder="Enter your company name"
                            />
                          </div>
                        </div>
                      </div>
                    )}
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
                          <SelectItem value="eawb">eAWB.ro</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      Manages shipping and delivery for your orders
                    </p>
                    
                     {integrations.shipping === 'sameday' && (
                       <div className="mt-4 p-4 border rounded-lg space-y-4">
                         <h4 className="font-medium">Sameday Configuration</h4>
                         <div className="grid gap-4">
                           <div className="space-y-2">
                             <Label htmlFor="sameday-api-key">API Key</Label>
                             <Input
                               id="sameday-api-key"
                               type="password"
                               value={providerConfigs.sameday.api_key}
                               onChange={(e) => updateProviderConfig('sameday', 'api_key', e.target.value)}
                               placeholder="Enter your Sameday API key"
                             />
                           </div>
                           <div className="space-y-2">
                             <Label htmlFor="sameday-name">Company Name</Label>
                             <Input
                               id="sameday-name"
                               value={providerConfigs.sameday.name}
                               onChange={(e) => updateProviderConfig('sameday', 'name', e.target.value)}
                               placeholder="Enter your company name"
                             />
                           </div>
                           <div className="space-y-2">
                             <Label htmlFor="sameday-email">Email Address</Label>
                             <Input
                               id="sameday-email"
                               type="email"
                               value={providerConfigs.sameday.email}
                               onChange={(e) => updateProviderConfig('sameday', 'email', e.target.value)}
                               placeholder="Enter your email address"
                             />
                           </div>
                         </div>
                       </div>
                     )}

                     {integrations.shipping === 'woot' && (
                       <div className="mt-4 p-4 border rounded-lg space-y-4">
                         <h4 className="font-medium">Woot.ro Configuration</h4>
                         <div className="grid gap-4">
                           <div className="space-y-2">
                             <Label htmlFor="woot-api-key">API Key</Label>
                             <Input
                               id="woot-api-key"
                               type="password"
                               value={providerConfigs.woot?.api_key || ''}
                               onChange={(e) => updateProviderConfig('woot', 'api_key', e.target.value)}
                               placeholder="Enter your Woot.ro API key"
                             />
                             <p className="text-xs text-muted-foreground">
                               Your Woot.ro API authentication key
                             </p>
                           </div>
                           <div className="space-y-2">
                             <Label htmlFor="woot-name">Company Name</Label>
                             <Input
                               id="woot-name"
                               value={providerConfigs.woot?.name || ''}
                               onChange={(e) => updateProviderConfig('woot', 'name', e.target.value)}
                               placeholder="Enter your company name"
                             />
                           </div>
                           <div className="space-y-2">
                             <Label htmlFor="woot-email">Email Address</Label>
                             <Input
                               id="woot-email"
                               type="email"
                               value={providerConfigs.woot?.email || ''}
                               onChange={(e) => updateProviderConfig('woot', 'email', e.target.value)}
                               placeholder="Enter your email address"
                             />
                           </div>
                         </div>
                        </div>
                      )}

                      {integrations.shipping === 'eawb' && (
                        <div className="mt-4 p-4 border rounded-lg space-y-4">
                          <h4 className="font-medium">eAWB.ro Configuration</h4>
                          <div className="grid gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="eawb-api-key">API Key</Label>
                              <Input
                                id="eawb-api-key"
                                type="password"
                                value={providerConfigs.eawb?.api_key || ''}
                                onChange={(e) => updateProviderConfig('eawb', 'api_key', e.target.value)}
                                placeholder="Enter your eAWB.ro API key"
                              />
                              <p className="text-xs text-muted-foreground">
                                Your eAWB.ro API authentication key from europarcel.com
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="eawb-name">Company Name</Label>
                              <Input
                                id="eawb-name"
                                value={providerConfigs.eawb?.name || ''}
                                onChange={(e) => updateProviderConfig('eawb', 'name', e.target.value)}
                                placeholder="Enter your company name"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="eawb-email">Email Address</Label>
                              <Input
                                id="eawb-email"
                                type="email"
                                value={providerConfigs.eawb?.email || ''}
                                onChange={(e) => updateProviderConfig('eawb', 'email', e.target.value)}
                                placeholder="Enter your email address"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="eawb-phone">Phone Number</Label>
                              <Input
                                id="eawb-phone"
                                type="tel"
                                value={providerConfigs.eawb?.phone || ''}
                                onChange={(e) => updateProviderConfig('eawb', 'phone', e.target.value)}
                                placeholder="Enter your phone number"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="eawb-address">Pickup Address</Label>
                              <Input
                                id="eawb-address"
                                value={providerConfigs.eawb?.address || ''}
                                onChange={(e) => updateProviderConfig('eawb', 'address', e.target.value)}
                                placeholder="Enter your pickup address"
                              />
                               <p className="text-xs text-muted-foreground">
                                 Default address for package pickup
                               </p>
                             </div>
                             <div className="space-y-2">
                               <Label htmlFor="eawb-billing-address-id">Billing Address ID</Label>
                               <Input
                                 id="eawb-billing-address-id"
                                 value={providerConfigs.eawb?.billing_address_id || ''}
                                 onChange={(e) => updateProviderConfig('eawb', 'billing_address_id', e.target.value)}
                                 placeholder="1"
                               />
                               <p className="text-xs text-muted-foreground">
                                 Your registered billing address ID (default: 1)
                               </p>
                             </div>
                             <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-2">
                                 <Label htmlFor="eawb-default-carrier">Default Carrier ID</Label>
                                 <Input
                                   id="eawb-default-carrier"
                                   value={providerConfigs.eawb?.default_carrier_id || ''}
                                   onChange={(e) => updateProviderConfig('eawb', 'default_carrier_id', e.target.value)}
                                   placeholder="Optional"
                                 />
                                 <p className="text-xs text-muted-foreground">
                                   Default carrier ID for pricing (optional)
                                 </p>
                               </div>
                               <div className="space-y-2">
                                 <Label htmlFor="eawb-default-service">Default Service ID</Label>
                                 <Input
                                   id="eawb-default-service"
                                   value={providerConfigs.eawb?.default_service_id || ''}
                                   onChange={(e) => updateProviderConfig('eawb', 'default_service_id', e.target.value)}
                                   placeholder="Optional"
                                 />
                                 <p className="text-xs text-muted-foreground">
                                   Default service ID for pricing (optional)
                                 </p>
                               </div>
                              </div>
                              <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                  <h5 className="font-medium text-sm">Billing Address ID</h5>
                                </div>
                                
                                <div className="grid gap-3">
                                  <div className="space-y-2">
                                    <Label htmlFor="billing_address_id">Billing Address ID</Label>
                                    <Input
                                      id="billing_address_id"
                                      type="number"
                                      placeholder="e.g., 12345"
                                      value={providerConfigs.eawb?.billing_address_id || ''}
                                      onChange={(e) => updateProviderConfig('eawb', 'billing_address_id', e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                      Find this ID in your{' '}
                                      <a 
                                        href="https://europarcel.com/dashboard" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline"
                                      >
                                        eAWB dashboard
                                      </a>
                                      {' '}under billing addresses
                                    </p>
                                  </div>
                                  
                                  <div className="flex items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={fetchEawbCarriers}
                                      disabled={eawbLoading.carriers || !providerConfigs.eawb?.api_key}
                                    >
                                      {eawbLoading.carriers ? 'Fetching...' : 'Fetch Carriers'}
                                    </Button>
                                    {eawbData.carriers.length > 0 && (
                                      <Select
                                        value={providerConfigs.eawb?.default_carrier_id || ''}
                                        onValueChange={(value) => {
                                          updateProviderConfig('eawb', 'default_carrier_id', value);
                                          setSelectedCarrierForServices(value);
                                          setEawbData(prev => ({ ...prev, services: [] })); // Clear services when carrier changes
                                        }}
                                      >
                                        <SelectTrigger className="w-[200px]">
                                          <SelectValue placeholder="Select default carrier" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {eawbData.carriers.map((carrier: any) => (
                                            <SelectItem key={carrier.id} value={carrier.id.toString()}>
                                              {carrier.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    )}
                                  </div>
                                  
                                  <div className="flex items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => fetchEawbServices(selectedCarrierForServices || providerConfigs.eawb?.default_carrier_id)}
                                      disabled={
                                        eawbLoading.services || 
                                        !providerConfigs.eawb?.api_key || 
                                        (!selectedCarrierForServices && !providerConfigs.eawb?.default_carrier_id)
                                      }
                                    >
                                      {eawbLoading.services ? 'Fetching...' : 'Fetch Services'}
                                    </Button>
                                    {eawbData.services.length > 0 && (
                                      <Select
                                        value={providerConfigs.eawb?.default_service_id || ''}
                                        onValueChange={(value) => updateProviderConfig('eawb', 'default_service_id', value)}
                                      >
                                        <SelectTrigger className="w-[200px]">
                                          <SelectValue placeholder="Select default service" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {eawbData.services.map((service: any) => (
                                            <SelectItem key={service.id} value={service.id.toString()}>
                                              {service.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    )}
                                  </div>
                                 </div>
                               </div>
                               
                               {/* Connection Test Section */}
                               <div className="border-t pt-4 mt-4 space-y-4">
                                 <EAWBConnectionTest />
                                 <EAWBDiagnosis />
                               </div>
                             </div>
                          </div>
                        )}
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
                    
                    {integrations.payment === 'netpopia' && (
                      <div className="mt-4 p-4 border rounded-lg space-y-4">
                        <h4 className="font-medium">Netpopia Configuration</h4>
                        <div className="grid gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="netpopia-api-key">API Key</Label>
                            <Input
                              id="netpopia-api-key"
                              type="password"
                              value={providerConfigs.netpopia.api_key}
                              onChange={(e) => updateProviderConfig('netpopia', 'api_key', e.target.value)}
                              placeholder="Enter your Netpopia API key"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="netpopia-name">Company Name</Label>
                            <Input
                              id="netpopia-name"
                              value={providerConfigs.netpopia.name}
                              onChange={(e) => updateProviderConfig('netpopia', 'name', e.target.value)}
                              placeholder="Enter your company name"
                            />
                          </div>
                           <div className="space-y-2">
                             <Label htmlFor="netpopia-email">Email Address</Label>
                             <Input
                               id="netpopia-email"
                               type="email"
                               value={providerConfigs.netpopia.email}
                               onChange={(e) => updateProviderConfig('netpopia', 'email', e.target.value)}
                               placeholder="Enter your email address"
                             />
                           </div>
                            <div className="space-y-2">
                              <Label htmlFor="netpopia-signature">POS Signature *</Label>
                              <Input
                                id="netpopia-signature"
                                type="password"
                                value={providerConfigs.netpopia.signature}
                                onChange={(e) => updateProviderConfig('netpopia', 'signature', e.target.value)}
                                placeholder="Enter your POS signature"
                                required
                              />
                              <p className="text-xs text-muted-foreground">
                                Required for payment processing. Found in your Netpopia admin panel.
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="netpopia-sandbox">Environment</Label>
                             <Select
                               value={providerConfigs.netpopia.sandbox ? 'sandbox' : 'live'}
                               onValueChange={(value) => updateProviderConfig('netpopia', 'sandbox', value === 'sandbox')}
                             >
                               <SelectTrigger>
                                 <SelectValue />
                               </SelectTrigger>
                               <SelectContent>
                                 <SelectItem value="sandbox">Sandbox (Testing)</SelectItem>
                                 <SelectItem value="live">Live (Production)</SelectItem>
                               </SelectContent>
                             </Select>
                             <p className="text-xs text-muted-foreground">
                               Use sandbox for testing, live for production
                             </p>
                           </div>
                         </div>
                       </div>
                      )}
                  </div>

                  {/* Payment Options */}
                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle className="text-base">Payment & Delivery Fees</CardTitle>
                      <CardDescription>Configure additional fees for cash payments and delivery options</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label>Enable Cash Payments</Label>
                            <p className="text-xs text-muted-foreground">Allow customers to pay with cash on delivery</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={feeSettings.cash_payment_enabled}
                            onChange={(e) => setFeeSettings({ ...feeSettings, cash_payment_enabled: e.target.checked })}
                            className="h-4 w-4"
                          />
                        </div>
                        {feeSettings.cash_payment_enabled && (
                          <div className="space-y-2">
                            <Label htmlFor="cash-fee">Cash Payment Fee (RON)</Label>
                            <Input
                              id="cash-fee"
                              type="number"
                              step="0.01"
                              min="0"
                              value={feeSettings.cash_payment_fee}
                              onChange={(e) => setFeeSettings({ ...feeSettings, cash_payment_fee: parseFloat(e.target.value) || 0 })}
                              placeholder="0.00"
                            />
                            <p className="text-xs text-muted-foreground">
                              Additional fee for cash on delivery (0 for free)
                            </p>
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label htmlFor="home-delivery-fee">Home Delivery Fee (RON)</Label>
                          <Input
                            id="home-delivery-fee"
                            type="number"
                            step="0.01"
                            min="0"
                            value={feeSettings.home_delivery_fee}
                            onChange={(e) => setFeeSettings({ ...feeSettings, home_delivery_fee: parseFloat(e.target.value) || 0 })}
                            placeholder="0.00"
                          />
                          <p className="text-xs text-muted-foreground">
                            Fee for home delivery
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="locker-delivery-fee">Locker Delivery Fee (RON)</Label>
                          <Input
                            id="locker-delivery-fee"
                            type="number"
                            step="0.01"
                            min="0"
                            value={feeSettings.locker_delivery_fee}
                            onChange={(e) => setFeeSettings({ ...feeSettings, locker_delivery_fee: parseFloat(e.target.value) || 0 })}
                            placeholder="0.00"
                          />
                          <p className="text-xs text-muted-foreground">
                            Fee for locker delivery
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Mobile View - Collapsible Sections */}
              <div className="md:hidden space-y-4">
                {/* Invoicing Section */}
                <Collapsible
                  open={openCollapsibles.invoicing}
                  onOpenChange={(isOpen) => setOpenCollapsibles(prev => ({ ...prev, invoicing: isOpen }))}
                >
                  <CollapsibleTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full justify-between h-auto p-4 bg-background/95 backdrop-blur-xl border border-border/50"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-primary" />
                        <div className="text-left">
                          <div className="font-medium">Invoicing</div>
                          <div className="text-sm text-muted-foreground">Oblio.eu Integration</div>
                        </div>
                      </div>
                      <ChevronDown className={`h-4 w-4 transition-transform ${openCollapsibles.invoicing ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-4 p-4 border rounded-lg bg-muted/30">
                    <div className="space-y-2">
                      <Label htmlFor="mobile-invoicing-provider">Invoicing Provider</Label>
                      <Select
                        value={integrations.invoicing}
                        onValueChange={(value) => setIntegrations({ ...integrations, invoicing: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select invoicing provider" />
                        </SelectTrigger>
                        <SelectContent className="z-50 bg-background border border-border/50">
                          <SelectItem value="oblio.eu">Oblio.eu</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground">
                        Handles automatic invoice generation for your orders
                      </p>
                    </div>
                    
                    {integrations.invoicing === 'oblio.eu' && (
                      <div className="space-y-4">
                        <h4 className="font-medium">Oblio.eu Configuration</h4>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="mobile-oblio-email">Oblio Email Address</Label>
                            <Input
                              id="mobile-oblio-email"
                              type="email"
                              value={providerConfigs.oblio.email}
                              onChange={(e) => updateProviderConfig('oblio', 'email', e.target.value)}
                              placeholder="Enter your Oblio.eu account email"
                            />
                            <p className="text-xs text-muted-foreground">
                              This is your Oblio.eu login email (client_id)
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="mobile-oblio-api-key">API Secret Key</Label>
                            <Input
                              id="mobile-oblio-api-key"
                              type="password"
                              value={providerConfigs.oblio.api_key}
                              onChange={(e) => updateProviderConfig('oblio', 'api_key', e.target.value)}
                              placeholder="Enter your Oblio.eu API secret key"
                            />
                            <p className="text-xs text-muted-foreground">
                              Found in Oblio.eu Settings → Account Data (client_secret)
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="mobile-oblio-series-name">Invoice Series</Label>
                            <Input
                              id="mobile-oblio-series-name"
                              value={providerConfigs.oblio.series_name}
                              onChange={(e) => updateProviderConfig('oblio', 'series_name', e.target.value)}
                              placeholder="e.g., APM"
                            />
                            <p className="text-xs text-muted-foreground">
                              Series prefix for your invoices (e.g., APM, FCT)
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="mobile-oblio-first-number">First Invoice Number</Label>
                            <Input
                              id="mobile-oblio-first-number"
                              value={providerConfigs.oblio.first_number}
                              onChange={(e) => updateProviderConfig('oblio', 'first_number', e.target.value)}
                              placeholder="e.g., 001"
                            />
                            <p className="text-xs text-muted-foreground">
                              Starting number for your invoices (e.g., 001, 0001)
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="mobile-oblio-name">Company Name</Label>
                            <Input
                              id="mobile-oblio-name"
                              value={providerConfigs.oblio.name}
                              onChange={(e) => updateProviderConfig('oblio', 'name', e.target.value)}
                              placeholder="Enter your company name"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>

                {/* Payment Section */}
                <Collapsible
                  open={openCollapsibles.payment}
                  onOpenChange={(isOpen) => setOpenCollapsibles(prev => ({ ...prev, payment: isOpen }))}
                >
                  <CollapsibleTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full justify-between h-auto p-4 bg-background/95 backdrop-blur-xl border border-border/50"
                    >
                      <div className="flex items-center gap-3">
                        <CreditCard className="h-5 w-5 text-primary" />
                        <div className="text-left">
                          <div className="font-medium">Payment</div>
                          <div className="text-sm text-muted-foreground">Netpopia Integration</div>
                        </div>
                      </div>
                      <ChevronDown className={`h-4 w-4 transition-transform ${openCollapsibles.payment ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-4 p-4 border rounded-lg bg-muted/30">
                    <div className="space-y-2">
                      <Label htmlFor="mobile-payment-provider">Payment Processor</Label>
                      <Select
                        value={integrations.payment}
                        onValueChange={(value) => setIntegrations({ ...integrations, payment: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select payment processor" />
                        </SelectTrigger>
                        <SelectContent className="z-50 bg-background border border-border/50">
                          <SelectItem value="netpopia">Netpopia Payments</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground">
                        Processes online payments from your customers
                      </p>
                    </div>
                    
                    {integrations.payment === 'netpopia' && (
                      <div className="space-y-4">
                        <h4 className="font-medium">Netpopia Configuration</h4>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="mobile-netpopia-api-key">API Key</Label>
                            <Input
                              id="mobile-netpopia-api-key"
                              type="password"
                              value={providerConfigs.netpopia.api_key}
                              onChange={(e) => updateProviderConfig('netpopia', 'api_key', e.target.value)}
                              placeholder="Enter your Netpopia API key"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="mobile-netpopia-name">Company Name</Label>
                            <Input
                              id="mobile-netpopia-name"
                              value={providerConfigs.netpopia.name}
                              onChange={(e) => updateProviderConfig('netpopia', 'name', e.target.value)}
                              placeholder="Enter your company name"
                            />
                          </div>
                           <div className="space-y-2">
                             <Label htmlFor="mobile-netpopia-email">Email Address</Label>
                             <Input
                               id="mobile-netpopia-email"
                               type="email"
                               value={providerConfigs.netpopia.email}
                               onChange={(e) => updateProviderConfig('netpopia', 'email', e.target.value)}
                               placeholder="Enter your email address"
                             />
                           </div>
                            <div className="space-y-2">
                              <Label htmlFor="mobile-netpopia-signature">POS Signature *</Label>
                              <Input
                                id="mobile-netpopia-signature"
                                type="password"
                                value={providerConfigs.netpopia.signature}
                                onChange={(e) => updateProviderConfig('netpopia', 'signature', e.target.value)}
                                placeholder="Enter your POS signature"
                                required
                              />
                              <p className="text-xs text-muted-foreground">
                                Required for payment processing. Found in your Netpopia admin panel.
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="mobile-netpopia-sandbox">Environment</Label>
                             <Select
                               value={providerConfigs.netpopia.sandbox ? 'sandbox' : 'live'}
                               onValueChange={(value) => updateProviderConfig('netpopia', 'sandbox', value === 'sandbox')}
                             >
                               <SelectTrigger>
                                 <SelectValue />
                               </SelectTrigger>
                               <SelectContent className="z-50 bg-background border border-border/50">
                                 <SelectItem value="sandbox">Sandbox (Testing)</SelectItem>
                                 <SelectItem value="live">Live (Production)</SelectItem>
                               </SelectContent>
                             </Select>
                             <p className="text-xs text-muted-foreground">
                               Use sandbox for testing, live for production
                             </p>
                           </div>
                         </div>
                       </div>
                     )}
                  </CollapsibleContent>
                </Collapsible>

                {/* Delivery Section */}
                <Collapsible
                  open={openCollapsibles.delivery}
                  onOpenChange={(isOpen) => setOpenCollapsibles(prev => ({ ...prev, delivery: isOpen }))}
                >
                  <CollapsibleTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full justify-between h-auto p-4 bg-background/95 backdrop-blur-xl border border-border/50"
                    >
                      <div className="flex items-center gap-3">
                        <Truck className="h-5 w-5 text-primary" />
                        <div className="text-left">
                          <div className="font-medium">Delivery</div>
                          <div className="text-sm text-muted-foreground">Sameday Integration</div>
                        </div>
                      </div>
                      <ChevronDown className={`h-4 w-4 transition-transform ${openCollapsibles.delivery ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-4 p-4 border rounded-lg bg-muted/30">
                    <div className="space-y-2">
                      <Label htmlFor="mobile-shipping-provider">Shipping Provider</Label>
                      <Select
                        value={integrations.shipping}
                        onValueChange={(value) => setIntegrations({ ...integrations, shipping: value })}
                      >
                         <SelectTrigger>
                           <SelectValue placeholder="Select shipping provider" />
                         </SelectTrigger>
                         <SelectContent className="z-50 bg-background border border-border/50">
                           <SelectItem value="eawb">eAWB.ro</SelectItem>
                         </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground">
                        Manages shipping and delivery for your orders
                      </p>
                    </div>
                    
                     {integrations.shipping === 'sameday' && (
                       <div className="space-y-4">
                         <h4 className="font-medium">Sameday Configuration</h4>
                         <div className="space-y-4">
                           <div className="space-y-2">
                             <Label htmlFor="mobile-sameday-api-key">API Key</Label>
                             <Input
                               id="mobile-sameday-api-key"
                               type="password"
                               value={providerConfigs.sameday.api_key}
                               onChange={(e) => updateProviderConfig('sameday', 'api_key', e.target.value)}
                               placeholder="Enter your Sameday API key"
                             />
                           </div>
                           <div className="space-y-2">
                             <Label htmlFor="mobile-sameday-name">Company Name</Label>
                             <Input
                               id="mobile-sameday-name"
                               value={providerConfigs.sameday.name}
                               onChange={(e) => updateProviderConfig('sameday', 'name', e.target.value)}
                               placeholder="Enter your company name"
                             />
                           </div>
                           <div className="space-y-2">
                             <Label htmlFor="mobile-sameday-email">Email Address</Label>
                             <Input
                               id="mobile-sameday-email"
                               type="email"
                               value={providerConfigs.sameday.email}
                               onChange={(e) => updateProviderConfig('sameday', 'email', e.target.value)}
                               placeholder="Enter your email address"
                             />
                           </div>
                         </div>
                       </div>
                     )}

                     {integrations.shipping === 'woot' && (
                       <div className="space-y-4">
                         <h4 className="font-medium">Woot.ro Configuration</h4>
                         <div className="space-y-4">
                           <div className="space-y-2">
                             <Label htmlFor="mobile-woot-api-key">API Key</Label>
                             <Input
                               id="mobile-woot-api-key"
                               type="password"
                               value={providerConfigs.woot?.api_key || ''}
                               onChange={(e) => updateProviderConfig('woot', 'api_key', e.target.value)}
                               placeholder="Enter your Woot.ro API key"
                             />
                             <p className="text-xs text-muted-foreground">
                               Your Woot.ro API authentication key
                             </p>
                           </div>
                           <div className="space-y-2">
                             <Label htmlFor="mobile-woot-name">Company Name</Label>
                             <Input
                               id="mobile-woot-name"
                               value={providerConfigs.woot?.name || ''}
                               onChange={(e) => updateProviderConfig('woot', 'name', e.target.value)}
                               placeholder="Enter your company name"
                             />
                           </div>
                           <div className="space-y-2">
                             <Label htmlFor="mobile-woot-email">Email Address</Label>
                             <Input
                               id="mobile-woot-email"
                               type="email"
                               value={providerConfigs.woot?.email || ''}
                               onChange={(e) => updateProviderConfig('woot', 'email', e.target.value)}
                               placeholder="Enter your email address"
                             />
                           </div>
                         </div>
                       </div>
                      )}
                      
                      {integrations.shipping === 'eawb' && (
                        <div className="space-y-4">
                          <h4 className="font-medium">eAWB.ro Configuration</h4>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="mobile-eawb-api-key">API Key</Label>
                              <Input
                                id="mobile-eawb-api-key"
                                type="password"
                                value={providerConfigs.eawb?.api_key || ''}
                                onChange={(e) => updateProviderConfig('eawb', 'api_key', e.target.value)}
                                placeholder="Enter your eAWB.ro API key"
                              />
                              <p className="text-xs text-muted-foreground">
                                Your eAWB.ro API authentication key from europarcel.com
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="mobile-eawb-name">Company Name</Label>
                              <Input
                                id="mobile-eawb-name"
                                value={providerConfigs.eawb?.name || ''}
                                onChange={(e) => updateProviderConfig('eawb', 'name', e.target.value)}
                                placeholder="Enter your company name"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="mobile-eawb-email">Email Address</Label>
                              <Input
                                id="mobile-eawb-email"
                                type="email"
                                value={providerConfigs.eawb?.email || ''}
                                onChange={(e) => updateProviderConfig('eawb', 'email', e.target.value)}
                                placeholder="Enter your email address"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="mobile-eawb-phone">Phone Number</Label>
                              <Input
                                id="mobile-eawb-phone"
                                type="tel"
                                value={providerConfigs.eawb?.phone || ''}
                                onChange={(e) => updateProviderConfig('eawb', 'phone', e.target.value)}
                                placeholder="Enter your phone number"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="mobile-eawb-address">Pickup Address</Label>
                              <Input
                                id="mobile-eawb-address"
                                value={providerConfigs.eawb?.address || ''}
                                onChange={(e) => updateProviderConfig('eawb', 'address', e.target.value)}
                                placeholder="Enter your pickup address"
                              />
                              <p className="text-xs text-muted-foreground">
                                Default address for package pickup
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="mobile-eawb-billing-address-id">Billing Address ID</Label>
                              <Input
                                id="mobile-eawb-billing-address-id"
                                value={providerConfigs.eawb?.billing_address_id || ''}
                                onChange={(e) => updateProviderConfig('eawb', 'billing_address_id', e.target.value)}
                                placeholder="1"
                              />
                              <p className="text-xs text-muted-foreground">
                                Your registered billing address ID (default: 1)
                              </p>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="mobile-eawb-default-carrier">Default Carrier ID</Label>
                                <Input
                                  id="mobile-eawb-default-carrier"
                                  value={providerConfigs.eawb?.default_carrier_id || ''}
                                  onChange={(e) => updateProviderConfig('eawb', 'default_carrier_id', e.target.value)}
                                  placeholder="Optional"
                                />
                                <p className="text-xs text-muted-foreground">
                                  Default carrier ID for pricing (optional)
                                </p>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="mobile-eawb-default-service">Default Service ID</Label>
                                <Input
                                  id="mobile-eawb-default-service"
                                  value={providerConfigs.eawb?.default_service_id || ''}
                                  onChange={(e) => updateProviderConfig('eawb', 'default_service_id', e.target.value)}
                                  placeholder="Optional"
                                />
                                <p className="text-xs text-muted-foreground">
                                  Default service ID for pricing (optional)
                                </p>
                              </div>
                            </div>
                            <div className="space-y-4">
                              <div className="flex items-center gap-2">
                                <h5 className="font-medium text-sm">Billing Address ID</h5>
                              </div>
                              
                              <div className="space-y-3">
                                <div className="flex flex-col gap-2">
                                  <Label htmlFor="billing_address_id_mobile">Billing Address ID</Label>
                                  <Input
                                    id="billing_address_id_mobile"
                                    type="number"
                                    placeholder="e.g., 12345"
                                    value={providerConfigs.eawb?.billing_address_id || ''}
                                    onChange={(e) => updateProviderConfig('eawb', 'billing_address_id', e.target.value)}
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Find this ID in your{' '}
                                    <a 
                                      href="https://europarcel.com/dashboard" 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-primary hover:underline"
                                    >
                                      eAWB dashboard
                                    </a>
                                    {' '}under billing addresses
                                  </p>
                                </div>
                                
                                <div className="flex flex-col gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={fetchEawbCarriers}
                                    disabled={eawbLoading.carriers || !providerConfigs.eawb?.api_key}
                                  >
                                    {eawbLoading.carriers ? 'Fetching...' : 'Fetch Carriers'}
                                  </Button>
                                  {eawbData.carriers.length > 0 && (
                                    <Select
                                      value={providerConfigs.eawb?.default_carrier_id || ''}
                                      onValueChange={(value) => {
                                        updateProviderConfig('eawb', 'default_carrier_id', value);
                                        setSelectedCarrierForServices(value);
                                        setEawbData(prev => ({ ...prev, services: [] }));
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select default carrier" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {eawbData.carriers.map((carrier: any) => (
                                          <SelectItem key={carrier.id} value={carrier.id.toString()}>
                                            {carrier.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </div>
                                
                                <div className="flex flex-col gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => fetchEawbServices(selectedCarrierForServices || providerConfigs.eawb?.default_carrier_id)}
                                    disabled={
                                      eawbLoading.services || 
                                      !providerConfigs.eawb?.api_key || 
                                      (!selectedCarrierForServices && !providerConfigs.eawb?.default_carrier_id)
                                    }
                                  >
                                    {eawbLoading.services ? 'Fetching...' : 'Fetch Services'}
                                  </Button>
                                  {eawbData.services.length > 0 && (
                                    <Select
                                      value={providerConfigs.eawb?.default_service_id || ''}
                                      onValueChange={(value) => updateProviderConfig('eawb', 'default_service_id', value)}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select default service" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {eawbData.services.map((service: any) => (
                                          <SelectItem key={service.id} value={service.id.toString()}>
                                            {service.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            <div className="border-t pt-4 mt-4 space-y-4">
                              <EAWBConnectionTest />
                              <EAWBDiagnosis />
                            </div>
                          </div>
                        </div>
                      )}
                  </CollapsibleContent>
                </Collapsible>
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