import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSuperadminGate } from '@/hooks/useSuperadminGate';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useImpersonation } from '@/hooks/useImpersonation';

type MerchantRow = {
  user_id: string;
  store_name: string | null;
  email: string | null;
  setup_completed: boolean | null;
  active_template: string | null;
  shipping_provider: string | null;
  payment_provider: string | null;
  created_at: string;
  order_count: number;
  product_count: number;
};

type OrderRow = {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_address: string;
  customer_city: string | null;
  customer_county: string | null;
  billing_address: string | null;
  billing_city: string | null;
  billing_county: string | null;
  billing_same_as_delivery: boolean | null;
  total: number;
  payment_status: string;
  order_status: string | null;
  shipping_status: string;
  created_at: string;
  delivery_type: string | null;
  carrier_name: string | null;
  awb_number: string | null;
  tracking_url: string | null;
  locker_name: string | null;
  locker_address: string | null;
  invoice_number: string | null;
  invoice_series: string | null;
  invoice_link: string | null;
  customer_notes: string | null;
  delivery_fee: number | null;
  order_items: Array<{
    product_title: string;
    product_price: number;
    quantity: number;
  }> | null;
};

function money(n: number | null | undefined) {
  return `${Number(n || 0).toFixed(2)} RON`;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm break-words">{value || '—'}</div>
    </div>
  );
}

function MaskHint({ configured }: { configured: boolean }) {
  return configured ? (
    <Badge variant="secondary">configured</Badge>
  ) : (
    <span className="text-muted-foreground">not set</span>
  );
}

export default function AdminConsole() {
  const { user, loading, signOut } = useAuth();
  const { gate } = useSuperadminGate();
  const { startImpersonation } = useImpersonation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [tab, setTab] = useState('overview');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState('');

  useEffect(() => {
    if (loading || gate.status === 'loading') return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }
    if (gate.status === 'not_superadmin') {
      navigate('/app', { replace: true });
      return;
    }
    if (gate.status === 'needs_enroll') {
      navigate('/admin/mfa?mode=enroll', { replace: true });
      return;
    }
    if (gate.status === 'needs_challenge') {
      navigate('/admin/mfa?mode=challenge', { replace: true });
    }
  }, [user, loading, gate, navigate]);

  useEffect(() => {
    setTab('overview');
    setExpandedOrderId(null);
    setOrderSearch('');
  }, [selectedUserId]);

  const ready = gate.status === 'ready';

  const merchantsQuery = useQuery({
    queryKey: ['admin-merchants'],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_merchants');
      if (error) throw error;
      return (data || []) as MerchantRow[];
    },
  });

  const platformStatsQuery = useQuery({
    queryKey: ['admin-platform-stats'],
    enabled: ready,
    queryFn: async () => {
      const [orders, products, carts, reviews] = await Promise.all([
        supabase.from('orders').select('id, total, payment_status, created_at', { count: 'exact' }).limit(20).order('created_at', { ascending: false }),
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('abandoned_carts').select('id', { count: 'exact', head: true }),
        supabase.from('reviews').select('id', { count: 'exact', head: true }),
      ]);
      if (orders.error) throw orders.error;
      return {
        orderCount: orders.count || 0,
        productCount: products.count || 0,
        abandonedCount: carts.count || 0,
        reviewCount: reviews.count || 0,
        recentOrders: orders.data || [],
        revenue: (orders.data || []).reduce((s, o) => s + Number(o.total || 0), 0),
      };
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = merchantsQuery.data || [];
    if (!q) return rows;
    return rows.filter(
      (m) =>
        m.store_name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.user_id.toLowerCase().includes(q)
    );
  }, [merchantsQuery.data, search]);

  const selected =
    (merchantsQuery.data || []).find((m) => m.user_id === selectedUserId) || null;

  const openFullStoreAdmin = () => {
    if (!selected) return;
    const label = `${selected.store_name || 'Store'} · ${selected.email || selected.user_id}`;
    startImpersonation(selected.user_id, label);
    navigate('/app');
  };

  const profileQuery = useQuery({
    queryKey: ['admin-profile', selectedUserId],
    enabled: ready && !!selectedUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', selectedUserId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const ordersQuery = useQuery({
    queryKey: ['admin-orders', selectedUserId],
    enabled: ready && !!selectedUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          id, customer_name, customer_email, customer_phone, customer_address,
          customer_city, customer_county, billing_address, billing_city, billing_county,
          billing_same_as_delivery, total, payment_status, order_status, shipping_status,
          created_at, delivery_type, carrier_name, awb_number, tracking_url,
          locker_name, locker_address, invoice_number, invoice_series, invoice_link,
          customer_notes, delivery_fee,
          order_items ( product_title, product_price, quantity )
        `
        )
        .eq('user_id', selectedUserId!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as OrderRow[];
    },
  });

  const productsQuery = useQuery({
    queryKey: ['admin-products', selectedUserId],
    enabled: ready && !!selectedUserId && (tab === 'products' || tab === 'overview'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, title, price, stock, category, created_at, updated_at')
        .eq('user_id', selectedUserId!)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  const paymentsQuery = useQuery({
    queryKey: ['admin-payments', selectedUserId],
    enabled: ready && !!selectedUserId && tab === 'payments',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_transactions')
        .select(
          'id, amount, currency, payment_status, payment_method, payment_provider, netopia_payment_id, order_id, created_at, error_message'
        )
        .eq('user_id', selectedUserId!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const cartsQuery = useQuery({
    queryKey: ['admin-carts', selectedUserId],
    enabled: ready && !!selectedUserId && tab === 'carts',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('abandoned_carts')
        .select(
          'id, customer_email, customer_name, customer_phone, status, cart_subtotal, estimated_total, items, delivery_type, last_activity_at, created_at, checkout_step, payment_method'
        )
        .eq('user_id', selectedUserId!)
        .order('last_activity_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const reviewsQuery = useQuery({
    queryKey: ['admin-reviews', selectedUserId],
    enabled: ready && !!selectedUserId && tab === 'reviews',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('id, rating, review_text, customer_name, customer_email, is_approved, status, created_at, product_id, merchant_reply')
        .eq('user_id', selectedUserId!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const deliveryQuery = useQuery({
    queryKey: ['admin-delivery', selectedUserId],
    enabled: ready && !!selectedUserId && tab === 'delivery',
    queryFn: async () => {
      const [settings, rules, valueRules] = await Promise.all([
        supabase.from('delivery_pricing_settings').select('*').eq('user_id', selectedUserId!).maybeSingle(),
        supabase.from('delivery_pricing_rules').select('*').eq('user_id', selectedUserId!).order('created_at', { ascending: false }),
        supabase.from('delivery_order_value_rules').select('*').eq('user_id', selectedUserId!).order('created_at', { ascending: false }),
      ]);
      if (settings.error) throw settings.error;
      if (rules.error) throw rules.error;
      if (valueRules.error) throw valueRules.error;
      return {
        settings: settings.data,
        rules: rules.data || [],
        valueRules: valueRules.data || [],
      };
    },
  });

  const customers = useMemo(() => {
    const map = new Map<
      string,
      { email: string; name: string; phone: string | null; orders: number; spent: number; lastOrder: string }
    >();
    for (const o of ordersQuery.data || []) {
      const key = (o.customer_email || '').toLowerCase();
      if (!key) continue;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          email: o.customer_email,
          name: o.customer_name,
          phone: o.customer_phone,
          orders: 1,
          spent: Number(o.total || 0),
          lastOrder: o.created_at,
        });
      } else {
        prev.orders += 1;
        prev.spent += Number(o.total || 0);
        if (o.created_at > prev.lastOrder) prev.lastOrder = o.created_at;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.spent - a.spent);
  }, [ordersQuery.data]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    const rows = ordersQuery.data || [];
    if (!q) return rows;
    return rows.filter(
      (o) =>
        o.customer_name?.toLowerCase().includes(q) ||
        o.customer_email?.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.awb_number?.toLowerCase().includes(q) ||
        o.invoice_number?.toLowerCase().includes(q)
    );
  }, [ordersQuery.data, orderSearch]);

  const storeRevenue = useMemo(
    () => (ordersQuery.data || []).reduce((s, o) => s + Number(o.total || 0), 0),
    [ordersQuery.data]
  );

  const updateOrderField = async (
    orderId: string,
    patch: { order_status?: string; payment_status?: string; shipping_status?: string }
  ) => {
    const { error } = await supabase.from('orders').update(patch).eq('id', orderId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Order updated');
    void ordersQuery.refetch();
  };

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Could not copy');
    }
  };

  if (loading || gate.status === 'loading' || gate.status !== 'ready') {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading admin console…
      </div>
    );
  }

  const profile = profileQuery.data;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-4 py-3 flex items-center justify-between gap-3 sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          <BrandLogo className="h-7 w-auto shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold text-sm">Platform admin</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
          </div>
          <Badge variant="secondary">MFA</Badge>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="outline" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto p-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit lg:sticky lg:top-16">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">All businesses</CardTitle>
            <CardDescription>
              {merchantsQuery.data?.length ?? 0} stores
            </CardDescription>
            <Input
              placeholder="Search store, email, id…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-2"
            />
            {selectedUserId ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 justify-start px-0"
                onClick={() => setSelectedUserId(null)}
              >
                ← Platform overview
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-1 max-h-[70vh] overflow-y-auto p-2">
            {merchantsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground p-2">Loading…</p>
            ) : merchantsQuery.error ? (
              <p className="text-sm text-destructive p-2">
                {(merchantsQuery.error as Error).message}
              </p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground p-2">No stores match.</p>
            ) : (
              filtered.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => setSelectedUserId(m.user_id)}
                  className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${
                    selectedUserId === m.user_id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  <div className="font-medium truncate">{m.store_name || 'Unnamed store'}</div>
                  <div
                    className={`text-xs truncate ${
                      selectedUserId === m.user_id
                        ? 'text-primary-foreground/80'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {m.email}
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 ${
                      selectedUserId === m.user_id
                        ? 'text-primary-foreground/70'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {m.order_count} orders · {m.product_count} products
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 min-w-0">
          {!selected ? (
            <>
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Stores</CardDescription>
                    <CardTitle className="text-2xl">{merchantsQuery.data?.length ?? 0}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Orders (all)</CardDescription>
                    <CardTitle className="text-2xl">{platformStatsQuery.data?.orderCount ?? '—'}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Products (all)</CardDescription>
                    <CardTitle className="text-2xl">{platformStatsQuery.data?.productCount ?? '—'}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Abandoned carts</CardDescription>
                    <CardTitle className="text-2xl">{platformStatsQuery.data?.abandonedCount ?? '—'}</CardTitle>
                  </CardHeader>
                </Card>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Select a business</CardTitle>
                  <CardDescription>
                    Open any store to inspect orders, products, customers, payments, carts,
                    reviews, delivery config, and integration keys.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-sm font-medium">Latest orders across platform</div>
                  {(platformStatsQuery.data?.recentOrders || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No orders yet.</p>
                  ) : (
                    (platformStatsQuery.data?.recentOrders || []).map((o: any) => (
                      <div key={o.id} className="rounded-md border px-3 py-2 text-sm flex justify-between gap-2">
                        <span className="font-mono text-xs text-muted-foreground truncate">{o.id}</span>
                        <span>
                          {money(o.total)} · {o.payment_status}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle>{selected.store_name || 'Store'}</CardTitle>
                      <CardDescription className="mt-1">
                        {selected.email} ·{' '}
                        <button
                          type="button"
                          className="font-mono text-xs underline-offset-2 hover:underline"
                          onClick={() => void copyText('User id', selected.user_id)}
                        >
                          {selected.user_id}
                        </button>
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={openFullStoreAdmin}>
                        Open full store admin
                      </Button>
                      <Badge variant="outline">{selected.active_template || 'no template'}</Badge>
                      <Badge variant="outline">{selected.shipping_provider || 'no shipping'}</Badge>
                      <Badge variant="outline">{selected.payment_provider || 'no payment'}</Badge>
                      <Badge variant={selected.setup_completed ? 'secondary' : 'destructive'}>
                        {selected.setup_completed ? 'setup done' : 'setup incomplete'}
                      </Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs">Orders loaded</div>
                      <div className="font-semibold">{ordersQuery.data?.length ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Revenue (loaded)</div>
                      <div className="font-semibold">{money(storeRevenue)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Products</div>
                      <div className="font-semibold">{selected.product_count}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Customers</div>
                      <div className="font-semibold">{customers.length}</div>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="flex flex-wrap h-auto gap-1">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="orders">Orders</TabsTrigger>
                  <TabsTrigger value="products">Products</TabsTrigger>
                  <TabsTrigger value="customers">Customers</TabsTrigger>
                  <TabsTrigger value="payments">Payments</TabsTrigger>
                  <TabsTrigger value="carts">Carts</TabsTrigger>
                  <TabsTrigger value="reviews">Reviews</TabsTrigger>
                  <TabsTrigger value="delivery">Delivery</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Store profile & integrations</CardTitle>
                    </CardHeader>
                    <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <Field label="Store name" value={profile?.store_name} />
                      <Field label="Language" value={profile?.preferred_language} />
                      <Field label="Template" value={profile?.active_template} />
                      <Field label="Shipping provider" value={profile?.shipping_provider} />
                      <Field label="Payment provider" value={profile?.payment_provider} />
                      <Field label="Invoicing" value={profile?.invoicing_provider} />
                      <Field label="Home delivery fee" value={money(profile?.home_delivery_fee)} />
                      <Field label="Locker fee" value={money(profile?.locker_delivery_fee)} />
                      <Field label="Cash fee" value={money(profile?.cash_payment_fee)} />
                      <Field
                        label="Store API key"
                        value={
                          profile?.store_api_key ? (
                            <button
                              type="button"
                              className="font-mono text-xs underline-offset-2 hover:underline text-left"
                              onClick={() => void copyText('API key', String(profile.store_api_key))}
                            >
                              {String(profile.store_api_key)}
                            </button>
                          ) : (
                            '—'
                          )
                        }
                      />
                      <Field label="Oblio email" value={profile?.oblio_email} />
                      <Field label="Oblio series" value={profile?.oblio_series_name} />
                      <Field
                        label="eAWB API key"
                        value={<MaskHint configured={!!profile?.eawb_api_key} />}
                      />
                      <Field
                        label="Netopia API key"
                        value={<MaskHint configured={!!profile?.netpopia_api_key} />}
                      />
                      <Field
                        label="Netopia signature"
                        value={<MaskHint configured={!!profile?.netpopia_signature} />}
                      />
                      <Field
                        label="Oblio API key"
                        value={<MaskHint configured={!!profile?.oblio_api_key} />}
                      />
                      <Field label="eAWB shipping address id" value={profile?.eawb_shipping_address_id} />
                      <Field label="eAWB billing address id" value={profile?.eawb_billing_address_id} />
                      <Field label="Pickup locker" value={profile?.eawb_pickup_locker_name} />
                      <Field
                        label="Storefront URL"
                        value={
                          profile?.store_api_key && profile?.active_template ? (
                            <a
                              className="text-primary underline-offset-2 hover:underline break-all"
                              href={`/templates/${profile.active_template}?api_key=${profile.store_api_key}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              /templates/{profile.active_template}
                            </a>
                          ) : (
                            '—'
                          )
                        }
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Latest products</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {(productsQuery.data || []).slice(0, 8).map((p) => (
                        <div key={p.id} className="flex justify-between gap-2 text-sm border rounded-md px-3 py-2">
                          <span className="truncate font-medium">{p.title}</span>
                          <span className="text-muted-foreground shrink-0">
                            {money(p.price)} · stock {p.stock}
                          </span>
                        </div>
                      ))}
                      {(productsQuery.data || []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No products.</p>
                      ) : null}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="orders" className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search name, email, order id, AWB, invoice…"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                    />
                  </div>
                  {ordersQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading orders…</p>
                  ) : filteredOrders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No orders.</p>
                  ) : (
                    filteredOrders.map((o) => {
                      const open = expandedOrderId === o.id;
                      return (
                        <Card key={o.id}>
                          <CardHeader className="py-3">
                            <button
                              type="button"
                              className="w-full text-left"
                              onClick={() => setExpandedOrderId(open ? null : o.id)}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="font-medium">
                                    {o.customer_name} · {money(o.total)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {o.customer_email}
                                    {o.customer_phone ? ` · ${o.customer_phone}` : ''} ·{' '}
                                    {new Date(o.created_at).toLocaleString()}
                                  </div>
                                  <div className="font-mono text-[11px] text-muted-foreground mt-0.5">
                                    {o.id}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  <Badge variant="outline">{o.payment_status}</Badge>
                                  <Badge variant="outline">{o.order_status || '—'}</Badge>
                                  <Badge variant="outline">{o.shipping_status}</Badge>
                                  <Badge variant="secondary">{o.delivery_type || '—'}</Badge>
                                </div>
                              </div>
                            </button>
                          </CardHeader>
                          {open ? (
                            <CardContent className="space-y-4 border-t pt-4">
                              <div className="grid sm:grid-cols-3 gap-3">
                                <div>
                                  <div className="text-xs text-muted-foreground mb-1">Order status</div>
                                  <Select
                                    value={o.order_status || 'paid'}
                                    onValueChange={(v) => void updateOrderField(o.id, { order_status: v })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="draft">draft</SelectItem>
                                      <SelectItem value="awaiting_payment">awaiting_payment</SelectItem>
                                      <SelectItem value="paid">paid</SelectItem>
                                      <SelectItem value="cancelled">cancelled</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground mb-1">Payment status</div>
                                  <Select
                                    value={o.payment_status}
                                    onValueChange={(v) => void updateOrderField(o.id, { payment_status: v })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="pending">pending</SelectItem>
                                      <SelectItem value="paid">paid</SelectItem>
                                      <SelectItem value="cash">cash</SelectItem>
                                      <SelectItem value="failed">failed</SelectItem>
                                      <SelectItem value="cancelled">cancelled</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground mb-1">Shipping status</div>
                                  <Select
                                    value={o.shipping_status}
                                    onValueChange={(v) => void updateOrderField(o.id, { shipping_status: v })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="pending">pending</SelectItem>
                                      <SelectItem value="processing">processing</SelectItem>
                                      <SelectItem value="shipped">shipped</SelectItem>
                                      <SelectItem value="delivered">delivered</SelectItem>
                                      <SelectItem value="cancelled">cancelled</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                                <div className="space-y-2 rounded-md border p-3">
                                  <div className="font-medium">Delivery</div>
                                  <Field label="Type" value={o.delivery_type} />
                                  <Field label="Address" value={o.customer_address} />
                                  <Field
                                    label="City / county"
                                    value={[o.customer_city, o.customer_county].filter(Boolean).join(', ')}
                                  />
                                  <Field label="Locker" value={o.locker_name} />
                                  <Field label="Locker address" value={o.locker_address} />
                                  <Field label="Carrier" value={o.carrier_name} />
                                  <Field label="AWB" value={o.awb_number} />
                                  <Field
                                    label="Tracking"
                                    value={
                                      o.tracking_url ? (
                                        <a
                                          href={o.tracking_url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-primary underline-offset-2 hover:underline"
                                        >
                                          Open tracking
                                        </a>
                                      ) : null
                                    }
                                  />
                                  <Field label="Delivery fee" value={money(o.delivery_fee)} />
                                </div>
                                <div className="space-y-2 rounded-md border p-3">
                                  <div className="font-medium">Invoice / billing</div>
                                  <Field
                                    label="Same as delivery"
                                    value={
                                      o.billing_same_as_delivery && o.delivery_type !== 'locker'
                                        ? 'Yes'
                                        : 'No / separate'
                                    }
                                  />
                                  <Field label="Billing address" value={o.billing_address} />
                                  <Field
                                    label="Billing city / county"
                                    value={[o.billing_city, o.billing_county].filter(Boolean).join(', ')}
                                  />
                                  <Field
                                    label="Invoice"
                                    value={
                                      o.invoice_number
                                        ? `${o.invoice_series || ''} ${o.invoice_number}`.trim()
                                        : null
                                    }
                                  />
                                  <Field
                                    label="Invoice link"
                                    value={
                                      o.invoice_link ? (
                                        <a
                                          href={o.invoice_link}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-primary underline-offset-2 hover:underline"
                                        >
                                          Open invoice
                                        </a>
                                      ) : null
                                    }
                                  />
                                  <Field label="Customer notes" value={o.customer_notes} />
                                </div>
                              </div>

                              <div className="rounded-md border p-3">
                                <div className="font-medium text-sm mb-2">Line items</div>
                                {(o.order_items || []).length === 0 ? (
                                  <p className="text-sm text-muted-foreground">No items.</p>
                                ) : (
                                  <div className="space-y-1">
                                    {(o.order_items || []).map((item, idx) => (
                                      <div
                                        key={`${o.id}-${idx}`}
                                        className="flex justify-between gap-2 text-sm"
                                      >
                                        <span>
                                          {item.quantity}× {item.product_title}
                                        </span>
                                        <span className="text-muted-foreground shrink-0">
                                          {money(item.product_price * item.quantity)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          ) : null}
                        </Card>
                      );
                    })
                  )}
                </TabsContent>

                <TabsContent value="products" className="space-y-2">
                  {productsQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading products…</p>
                  ) : (productsQuery.data || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No products.</p>
                  ) : (
                    (productsQuery.data || []).map((p) => (
                      <div
                        key={p.id}
                        className="rounded-md border px-3 py-2 text-sm grid sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-center"
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">{p.title}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">{p.id}</div>
                        </div>
                        <div>{money(p.price)}</div>
                        <div>stock {p.stock}</div>
                        <div className="text-muted-foreground">{p.category || '—'}</div>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="customers" className="space-y-2">
                  {ordersQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : customers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No customers from orders yet.</p>
                  ) : (
                    customers.map((c) => (
                      <div
                        key={c.email}
                        className="rounded-md border px-3 py-2 text-sm flex flex-wrap justify-between gap-2"
                      >
                        <div>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-muted-foreground text-xs">
                            {c.email}
                            {c.phone ? ` · ${c.phone}` : ''}
                          </div>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <div>{c.orders} orders · {money(c.spent)}</div>
                          <div>Last: {new Date(c.lastOrder).toLocaleString()}</div>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="payments" className="space-y-2">
                  {paymentsQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading payments…</p>
                  ) : (paymentsQuery.data || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No payment transactions.</p>
                  ) : (
                    (paymentsQuery.data || []).map((p) => (
                      <div key={p.id} className="rounded-md border px-3 py-2 text-sm space-y-1">
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="font-medium">
                            {money(p.amount)} {p.currency || ''}
                          </span>
                          <div className="flex gap-1">
                            <Badge variant="outline">{p.payment_status}</Badge>
                            <Badge variant="secondary">{p.payment_provider}</Badge>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {p.payment_method || '—'} · {new Date(p.created_at).toLocaleString()}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          tx {p.id}
                          {p.order_id ? ` · order ${p.order_id}` : ''}
                          {p.netopia_payment_id ? ` · netopia ${p.netopia_payment_id}` : ''}
                        </div>
                        {p.error_message ? (
                          <div className="text-xs text-destructive">{p.error_message}</div>
                        ) : null}
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="carts" className="space-y-2">
                  {cartsQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading carts…</p>
                  ) : (cartsQuery.data || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No abandoned carts.</p>
                  ) : (
                    (cartsQuery.data || []).map((c: any) => (
                      <div key={c.id} className="rounded-md border px-3 py-2 text-sm">
                        <div className="flex flex-wrap justify-between gap-2">
                          <div>
                            <div className="font-medium">{c.customer_name || 'Anonymous'}</div>
                            <div className="text-xs text-muted-foreground">
                              {c.customer_email || 'no email'}
                              {c.customer_phone ? ` · ${c.customer_phone}` : ''}
                            </div>
                          </div>
                          <div className="text-right text-xs">
                            <div>
                              {money(c.estimated_total ?? c.cart_subtotal)} ·{' '}
                              {Array.isArray(c.items) ? c.items.length : 0} items
                            </div>
                            <div className="text-muted-foreground">
                              {c.status} · step {c.checkout_step || '—'}
                              {c.payment_method ? ` · ${c.payment_method}` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          Last activity:{' '}
                          {c.last_activity_at
                            ? new Date(c.last_activity_at).toLocaleString()
                            : '—'}
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="reviews" className="space-y-2">
                  {reviewsQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading reviews…</p>
                  ) : (reviewsQuery.data || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No reviews.</p>
                  ) : (
                    (reviewsQuery.data || []).map((r: any) => (
                      <div key={r.id} className="rounded-md border px-3 py-2 text-sm space-y-1">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium">
                            {r.customer_name || 'Customer'} · {r.rating}/5
                          </span>
                          <div className="flex gap-1">
                            <Badge variant="outline">{r.status || '—'}</Badge>
                            <Badge variant={r.is_approved ? 'secondary' : 'outline'}>
                              {r.is_approved ? 'approved' : 'pending'}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-muted-foreground whitespace-pre-wrap">{r.review_text || '—'}</p>
                        {r.merchant_reply ? (
                          <p className="text-xs border-l-2 pl-2">Merchant reply: {r.merchant_reply}</p>
                        ) : null}
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {r.customer_email || 'no email'} · product {r.product_id} ·{' '}
                          {new Date(r.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="delivery" className="space-y-4">
                  {deliveryQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading delivery config…</p>
                  ) : (
                    <>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Pricing settings</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {!deliveryQuery.data?.settings ? (
                            <p className="text-sm text-muted-foreground">No custom delivery settings.</p>
                          ) : (
                            <pre className="text-xs overflow-auto rounded-md bg-muted p-3 max-h-80">
                              {JSON.stringify(deliveryQuery.data.settings, null, 2)}
                            </pre>
                          )}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">
                            Area rules ({deliveryQuery.data?.rules.length || 0})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {(deliveryQuery.data?.rules || []).length === 0 ? (
                            <p className="text-sm text-muted-foreground">No area rules.</p>
                          ) : (
                            <pre className="text-xs overflow-auto rounded-md bg-muted p-3 max-h-80">
                              {JSON.stringify(deliveryQuery.data?.rules, null, 2)}
                            </pre>
                          )}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">
                            Order-value rules ({deliveryQuery.data?.valueRules.length || 0})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {(deliveryQuery.data?.valueRules || []).length === 0 ? (
                            <p className="text-sm text-muted-foreground">No order-value rules.</p>
                          ) : (
                            <pre className="text-xs overflow-auto rounded-md bg-muted p-3 max-h-80">
                              {JSON.stringify(deliveryQuery.data?.valueRules, null, 2)}
                            </pre>
                          )}
                        </CardContent>
                      </Card>
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
