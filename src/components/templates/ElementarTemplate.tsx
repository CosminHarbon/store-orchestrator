import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Plus, Minus, X, Package, Truck, CreditCard, ArrowLeft, MapPin, Home as HomeIcon, Search, Menu, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { calculateProductPrice, formatPrice, formatDiscount } from "@/lib/discountUtils";
import LockerMapSelector from "./LockerMapSelector";
import { Skeleton } from "@/components/ui/skeleton";

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  image: string;
  stock: number;
  category: string;
  collection_ids?: string[];
}

interface Collection {
  id: string;
  name: string;
  description: string;
  image_url: string;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface TemplateCustomization {
  primary_color: string;
  background_color: string;
  text_color: string;
  accent_color: string;
  hero_image_url: string | null;
  logo_url: string | null;
  hero_title: string;
  hero_subtitle: string;
  hero_button_text: string;
  store_name: string;
}

interface ElementarTemplateProps {
  apiKey: string;
}

const ElementarTemplate = ({ apiKey }: ElementarTemplateProps) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [view, setView] = useState<"home" | "product" | "cart" | "checkout">("home");
  const [loading, setLoading] = useState(true);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"default" | "price-low" | "price-high" | "name">("default");
  const [productCollections, setProductCollections] = useState<Record<string, string[]>>({});
  const [customization, setCustomization] = useState<TemplateCustomization>({
    primary_color: '#000000',
    background_color: '#FFFFFF',
    text_color: '#000000',
    accent_color: '#666666',
    hero_image_url: null,
    logo_url: null,
    hero_title: 'Welcome to Our Store',
    hero_subtitle: 'Discover amazing products',
    hero_button_text: 'Shop now',
    store_name: 'My Store'
  });
  const [feeSettings, setFeeSettings] = useState({
    cash_payment_enabled: true,
    cash_payment_fee: 0,
    home_delivery_fee: 0,
    locker_delivery_fee: 0
  });
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('card');

  const carrierIdMap: { [key: string]: number } = {
    "sameday": 6,
    "fan": 3,
    "gls": 4,
    "dpd": 2,
    "cargus": 1
  };

  const [checkoutForm, setCheckoutForm] = useState({
    name: "",
    email: "",
    phone: "",
    delivery_type: "home" as "home" | "locker",
    city: "",
    county: "",
    street: "",
    street_number: "",
    block: "",
    apartment: "",
    selected_carrier_code: "",
    locker_id: "",
    locker_name: "",
    locker_address: "",
  });

  const SUPABASE_URL = "https://uffmgvdtkoxkjolfrhab.supabase.co";
  const API_BASE = `${SUPABASE_URL}/functions/v1/store-api`;

  useEffect(() => {
    // Check for payment return from Netopia
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment_status');
    const orderId = urlParams.get('order_id');
    
    if (paymentStatus === 'checking' && orderId) {
      // Remove query params from URL
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search.split('?')[0]);
      
      // Check payment status
      checkPaymentStatus(orderId);
      return;
    }

    const fetchConfig = async () => {
      try {
        const response = await fetch(`${API_BASE}/config`, {
          headers: { 'X-API-Key': apiKey },
        });
        const data = await response.json();
        if (data.mapbox_token) {
          setMapboxToken(data.mapbox_token);
        }
        if (data.customization) {
          setCustomization(data.customization);
        }
        if (data.cash_payment_enabled !== undefined) {
          setFeeSettings({
            cash_payment_enabled: data.cash_payment_enabled,
            cash_payment_fee: data.cash_payment_fee || 0,
            home_delivery_fee: data.home_delivery_fee || 0,
            locker_delivery_fee: data.locker_delivery_fee || 0
          });
        }
      } catch (error) {
        console.error('Failed to fetch config:', error);
      }
    };
    fetchConfig();
    fetchData();
  }, [apiKey]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const headers = { "X-API-Key": apiKey };

      const [productsRes, collectionsRes] = await Promise.all([
        fetch(`${API_BASE}/products`, { headers }),
        fetch(`${API_BASE}/collections`, { headers }),
      ]);

      if (productsRes.ok) {
        const productsData = await productsRes.json();
        const productsArray = Array.isArray(productsData) ? productsData : (productsData.products || []);
        
        // Build product-collection mapping
        const collectionMap: Record<string, string[]> = {};
        productsArray.forEach((p: any) => {
          if (p.collection_ids && Array.isArray(p.collection_ids)) {
            collectionMap[p.id] = p.collection_ids;
          }
        });
        setProductCollections(collectionMap);
        
        const mappedProducts = productsArray.map((p: any) => ({
          id: p.id,
          title: p.title,
          description: p.description || "",
          price: typeof p.final_price === "number" ? p.final_price : p.price,
          image: p.primary_image || p.image || "",
          stock: p.stock || 0,
          category: p.category || "",
          collection_ids: p.collection_ids || [],
        }));
        
        setProducts(mappedProducts);
      } else {
        toast.error(`Failed to load products`);
        setProducts([]);
      }

      if (collectionsRes.ok) {
        const collectionsData = await collectionsRes.json();
        const collectionsArray = Array.isArray(collectionsData) ? collectionsData : (collectionsData.collections || []);
        setCollections(collectionsArray);
      }
      
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load store data");
    } finally {
      setLoading(false);
    }
  };

  // Cart management functions

  const addToCart = (product: Product) => {
    const existingItem = cart.find((item) => item.product.id === product.id);

    if (existingItem) {
      if (existingItem.quantity < product.stock) {
        setCart(
          cart.map((item) =>
            item.product.id === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          )
        );
        toast.success(`Added another ${product.title} to cart`);
      } else {
        toast.error(`Maximum stock (${product.stock}) reached`);
      }
    } else {
      if (product.stock > 0) {
        setCart([...cart, { product, quantity: 1 }]);
        toast.success(`${product.title} added to cart`);
      } else {
        toast.error("Product is out of stock");
      }
    }
  };

  const updateCartQuantity = (productId: string, newQuantity: number) => {
    const item = cart.find((item) => item.product.id === productId);
    if (!item) return;

    if (newQuantity <= 0) {
      removeFromCart(productId);
      return;
    }

    if (newQuantity > item.product.stock) {
      toast.error(`Maximum stock (${item.product.stock}) reached`);
      return;
    }

    setCart(
      cart.map((item) =>
        item.product.id === productId ? { ...item, quantity: newQuantity } : item
      )
    );
  };

  const removeFromCart = (productId: string) => {
    const item = cart.find((item) => item.product.id === productId);
    setCart(cart.filter((item) => item.product.id !== productId));
    if (item) {
      toast.success(`${item.product.title} removed from cart`);
    }
  };

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  const deliveryFee = checkoutForm.delivery_type === 'home' 
    ? feeSettings.home_delivery_fee 
    : feeSettings.locker_delivery_fee;
  
  const paymentFee = paymentMethod === 'cash' && feeSettings.cash_payment_enabled 
    ? feeSettings.cash_payment_fee 
    : 0;
  
  const orderTotal = cartTotal + deliveryFee + paymentFee;

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const checkPaymentStatus = async (orderId: string) => {
    setLoading(true);
    try {
      // Poll for payment status - wait a bit for webhook to process
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      let attempts = 0;
      const maxAttempts = 8;
      
      while (attempts < maxAttempts) {
        const response = await fetch(`${API_BASE}/orders?order_id=${orderId}`, {
          headers: { 'X-API-Key': apiKey },
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.order?.payment_status === 'paid') {
            setView("home");
            setCart([]);
            setCheckoutForm({
              name: "",
              email: "",
              phone: "",
              delivery_type: "home",
              city: "",
              county: "",
              street: "",
              street_number: "",
              block: "",
              apartment: "",
              selected_carrier_code: "",
              locker_id: "",
              locker_name: "",
              locker_address: "",
            });
            toast.success("Payment successful! Thank you for your order.");
            setLoading(false);
            return;
          }
        }
        
        // Wait 2 seconds before next attempt
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }
      
      // If we get here, payment is still pending
      toast.info("Payment verification in progress. Please check your email for order confirmation.");
      setView("home");
    } catch (error) {
      console.error("Error checking payment:", error);
      toast.error("Error verifying payment. Please contact support with your order details.");
      setView("home");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (!checkoutForm.name || !checkoutForm.email) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(checkoutForm.email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    if (checkoutForm.delivery_type === "home") {
      if (!checkoutForm.city || !checkoutForm.county || !checkoutForm.street) {
        toast.error("Please fill in address details");
        return;
      }
    } else {
      if (!checkoutForm.selected_carrier_code || !checkoutForm.locker_id) {
        toast.error("Please select a locker");
        return;
      }
    }

    try {
      const orderData = {
        customer_name: checkoutForm.name,
        customer_email: checkoutForm.email,
        customer_phone: checkoutForm.phone || null,
        customer_address:
          checkoutForm.delivery_type === "home"
            ? `${checkoutForm.street} ${checkoutForm.street_number}${
                checkoutForm.block ? `, Block ${checkoutForm.block}` : ""
              }${
                checkoutForm.apartment ? `, Apt ${checkoutForm.apartment}` : ""
              }, ${checkoutForm.city}, ${checkoutForm.county}`
            : checkoutForm.locker_address,
        customer_city: checkoutForm.city,
        customer_county: checkoutForm.county,
        customer_street: checkoutForm.street,
        customer_street_number: checkoutForm.street_number,
        customer_block: checkoutForm.block || null,
        customer_apartment: checkoutForm.apartment || null,
        delivery_type: checkoutForm.delivery_type,
        selected_carrier_code: checkoutForm.selected_carrier_code || null,
        locker_id: checkoutForm.locker_id || null,
        locker_name: checkoutForm.locker_name || null,
        locker_address: checkoutForm.locker_address || null,
        total: orderTotal,
        payment_method: paymentMethod,
        items: cart.map((item) => ({
          product_id: item.product.id,
          title: item.product.title,
          price: item.product.price,
          quantity: item.quantity,
        })),
      };

      const response = await fetch(`${API_BASE}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify(orderData),
      });

      const result = await response.json();

      if (response.ok && result.payment_url) {
        // Redirect to payment page
        window.location.href = result.payment_url;
      } else if (response.ok && result.error) {
        // Order created but payment initiation failed
        toast.error(result.error || "Failed to initiate payment. Please contact support.");
      } else if (response.ok && paymentMethod === 'cash') {
        // Cash payment - order created successfully without payment URL
        toast.success("Order created successfully! You will pay cash on delivery.");
        setCart([]);
        setView("home");
      } else if (response.ok) {
        // This shouldn't happen for card payments
        toast.error("Payment setup failed. Please contact support.");
      } else {
        toast.error(result.error || "Failed to create order");
      }
    } catch (error) {
      console.error("Error creating order:", error);
      toast.error("Failed to create order. Please try again.");
    }
  };

  const filteredProducts = products.filter((product) => {
    const matchesCollection =
      !selectedCollection ||
      selectedCollection === "all" ||
      (productCollections[product.id] && productCollections[product.id].includes(selectedCollection));
    const matchesSearch =
      !searchQuery ||
      product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.description &&
        product.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCollection && matchesSearch;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case "price-low":
        return a.price - b.price;
      case "price-high":
        return b.price - a.price;
      case "name":
        return a.title.localeCompare(b.title);
      default:
        return 0;
    }
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/5 [mask-image:radial-gradient(white,transparent_85%)]" />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="relative">
            <Package className="h-16 w-16 animate-spin text-primary" />
            <div className="absolute inset-0 animate-pulse">
              <Sparkles className="h-16 w-16 text-primary/30" />
            </div>
          </div>
          <p className="text-sm font-light text-muted-foreground animate-pulse">Loading your experience...</p>
        </div>
      </div>
    );
  }

  // Futuristic header with glassmorphism
  const Header = () => (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/50 shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Menu Icon */}
          <button className="p-2 hover:bg-primary/10 rounded-lg transition-all duration-300 hover:scale-110">
            <Menu className="h-5 w-5 text-foreground" />
          </button>

          {/* Logo - Centered with glow */}
          <button 
            onClick={() => {
              setView("home");
              setSelectedCollection(null);
            }}
            className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-2 hover:scale-105 transition-transform duration-300"
          >
            {customization.logo_url ? (
              <img 
                src={customization.logo_url} 
                alt={customization.store_name}
                className="h-8 w-auto drop-shadow-glow"
              />
            ) : (
              <span className="text-xl font-light tracking-widest text-gradient bg-gradient-to-r from-primary via-primary/80 to-primary bg-clip-text">
                {customization.store_name}
              </span>
            )}
          </button>

          {/* Right Side Icons */}
          <div className="flex items-center gap-2">
            <button className="p-2 hidden md:block hover:bg-primary/10 rounded-lg transition-all duration-300 hover:scale-110">
              <Search className="h-5 w-5 text-foreground" />
            </button>
            
            <button
              onClick={() => setView("cart")}
              className="relative p-2 hover:bg-primary/10 rounded-lg transition-all duration-300 hover:scale-110 group"
            >
              <ShoppingCart className="h-5 w-5 text-foreground group-hover:text-primary transition-colors" />
              {cartItemCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium animate-pulse">
                  {cartItemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );

  if (view === "home") {
    return (
      <div className="bg-gradient-to-br from-background via-background to-primary/5 text-foreground">
        <Header />

        {/* Futuristic Hero Section */}
        <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
          {/* Animated Background Grid */}
          <div className="absolute inset-0 bg-grid-white/5 [mask-image:radial-gradient(white,transparent_85%)]" />
          
          {/* Gradient Orbs */}
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary/30 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse delay-700" />
          
          {/* Hero Content */}
          <div className="relative z-10 container mx-auto px-4 text-center">
            <div className="max-w-4xl mx-auto space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm mb-4">
                <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                <span className="text-sm font-medium text-primary">Next-Gen Shopping Experience</span>
              </div>
              
              <h1 className="text-5xl md:text-7xl font-bold leading-tight bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent animate-fade-in">
                {customization.hero_title}
              </h1>
              
              <p className="text-xl md:text-2xl text-muted-foreground font-light max-w-2xl mx-auto animate-fade-in" style={{ animationDelay: '0.2s' }}>
                {customization.hero_subtitle}
              </p>
              
              <div className="flex flex-wrap gap-4 justify-center animate-fade-in" style={{ animationDelay: '0.4s' }}>
                <button
                  onClick={() => {
                    const productsSection = document.getElementById('products-section');
                    productsSection?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="group relative px-8 py-4 bg-primary text-primary-foreground rounded-lg font-medium hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-primary/50"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {customization.hero_button_text}
                    <Zap className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                  </span>
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/50 to-accent/50 opacity-0 group-hover:opacity-100 transition-opacity blur" />
                </button>
                
                <button
                  onClick={() => setView("cart")}
                  className="px-8 py-4 bg-background/50 backdrop-blur-sm border border-border rounded-lg font-medium hover:bg-background hover:scale-105 transition-all duration-300"
                >
                  View Cart
                </button>
              </div>
            </div>
          </div>
          
          {/* Floating Elements */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
            <div className="w-6 h-10 rounded-full border-2 border-primary/30 flex items-start justify-center p-2">
              <div className="w-1 h-2 bg-primary rounded-full animate-pulse" />
            </div>
          </div>
        </section>

        {/* Futuristic Collections Section */}
        {collections.length > 0 && (
          <section className="py-24 relative">
            <div className="container mx-auto px-4">
              <div className="text-center mb-16 space-y-4">
                <h2 className="text-4xl font-bold tracking-tight">
                  Explore Collections
                </h2>
                <p className="text-muted-foreground">Curated selections for every style</p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {collections.map((collection, index) => (
                  <button
                    key={collection.id}
                    onClick={() => {
                      setSelectedCollection(collection.id);
                      const productsSection = document.getElementById('products-section');
                      productsSection?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="group relative aspect-square overflow-hidden rounded-2xl animate-fade-in hover-scale"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <img
                      src={collection.image_url || "/placeholder.svg"}
                      alt={collection.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
                    <div className="absolute inset-0 flex items-end justify-center p-6">
                      <div className="text-center space-y-2">
                        <h3 className="font-semibold text-lg tracking-wide text-white drop-shadow-lg">
                          {collection.name}
                        </h3>
                        <div className="h-1 w-12 bg-primary rounded-full mx-auto transform scale-0 group-hover:scale-100 transition-transform" />
                      </div>
                    </div>
                    <div className="absolute inset-0 border-2 border-primary/0 group-hover:border-primary/50 rounded-2xl transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Futuristic Products Section */}
        <section id="products-section" className="py-24 relative">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16 space-y-6">
              <h2 className="text-4xl font-bold tracking-tight">
                Featured Products
              </h2>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                {selectedCollection && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                    <span className="text-sm font-medium">Filtered by collection</span>
                    <button
                      onClick={() => setSelectedCollection(null)}
                      className="p-1 hover:bg-primary/20 rounded-full transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-6 py-2 bg-background/50 backdrop-blur-sm border border-border rounded-lg text-sm font-medium hover:bg-background transition-colors"
                >
                  <option value="default">✨ Featured</option>
                  <option value="price-low">💰 Price: Low to High</option>
                  <option value="price-high">💎 Price: High to Low</option>
                  <option value="name">🔤 Name: A-Z</option>
                </select>
              </div>
            </div>

            {sortedProducts.length === 0 ? (
              <div className="text-center py-20">
                <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-lg text-muted-foreground">No products found in this collection</p>
                {selectedCollection && (
                  <button
                    onClick={() => setSelectedCollection(null)}
                    className="mt-4 text-primary hover:underline"
                  >
                    View all products
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {sortedProducts.map((product, index) => (
                  <div
                    key={product.id}
                    className="group cursor-pointer animate-fade-in"
                    style={{ animationDelay: `${index * 0.05}s` }}
                    onClick={() => {
                      setSelectedProduct(product);
                      setView("product");
                    }}
                  >
                    <div className="relative rounded-2xl overflow-hidden bg-card border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/20">
                      <div className="aspect-square overflow-hidden bg-muted">
                        <img
                          src={product.image || "/placeholder.svg"}
                          alt={product.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                      </div>
                      
                      <div className="p-4 space-y-2">
                        <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">
                          {product.title}
                        </h3>
                        
                        <div className="flex items-center justify-between">
                          <p className="text-lg font-bold text-primary">
                            {formatPrice(product.price)}
                          </p>
                          
                          {product.stock > 0 ? (
                            <Badge variant="secondary" className="text-xs">
                              {product.stock < 5 ? `Only ${product.stock} left` : 'In Stock'}
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              Out of Stock
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {/* Hover Glow Effect */}
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Futuristic Footer */}
        <footer className="relative py-16 border-t border-border/50 bg-gradient-to-b from-background to-muted/20">
          <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(to_bottom,transparent,white,transparent)]" />
          <div className="container mx-auto px-4 text-center relative z-10">
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-primary animate-pulse" />
                <span className="text-xl font-bold tracking-wider">{customization.store_name}</span>
                <Sparkles className="h-5 w-5 text-primary animate-pulse" />
              </div>
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} {customization.store_name}. All rights reserved.
              </p>
              <p className="text-xs text-muted-foreground/60">
                Powered by next-generation technology ⚡
              </p>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  if (view === "product" && selectedProduct) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header />
        
        <div className="container mx-auto px-4 py-12">
          <button
            onClick={() => setView("home")}
            className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-lg bg-background/50 backdrop-blur-sm border border-border hover:bg-background transition-all hover:scale-105"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to products</span>
          </button>

          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div className="relative group">
              <div className="aspect-square rounded-2xl overflow-hidden bg-card border border-border shadow-2xl">
                <img
                  src={selectedProduct.image || "/placeholder.svg"}
                  alt={selectedProduct.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>

            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                  {selectedProduct.title}
                </h1>
                <p className="text-3xl font-bold text-primary">
                  {formatPrice(selectedProduct.price)}
                </p>
              </div>
              
              {selectedProduct.description && (
                <p className="text-lg leading-relaxed text-muted-foreground">
                  {selectedProduct.description}
                </p>
              )}

              <div className="flex items-center gap-3">
                {selectedProduct.stock > 0 ? (
                  <>
                    <Badge variant="secondary" className="text-sm">
                      ✓ {selectedProduct.stock} in stock
                    </Badge>
                    {selectedProduct.stock < 5 && (
                      <Badge variant="outline" className="text-sm border-primary/50">
                        🔥 Low stock
                      </Badge>
                    )}
                  </>
                ) : (
                  <Badge variant="destructive" className="text-sm">
                    Out of stock
                  </Badge>
                )}
              </div>

              <button
                onClick={() => {
                  addToCart(selectedProduct);
                  setView("cart");
                }}
                disabled={selectedProduct.stock === 0}
                className="group relative w-full py-4 bg-primary text-primary-foreground rounded-xl font-semibold hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-primary/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {selectedProduct.stock === 0 ? "Out of Stock" : "Add to Cart"}
                  {selectedProduct.stock > 0 && <ShoppingCart className="h-5 w-5" />}
                </span>
                {selectedProduct.stock > 0 && (
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/50 to-accent/50 opacity-0 group-hover:opacity-100 transition-opacity blur" />
                )}
              </button>
              
              <button
                onClick={() => setView("home")}
                className="w-full py-4 bg-background/50 backdrop-blur-sm border border-border rounded-xl font-medium hover:bg-background transition-all hover:scale-105"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === "cart") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header />
        
        <div className="container mx-auto px-4 py-12 max-w-5xl">
          <h1 className="text-4xl font-bold mb-12 tracking-tight flex items-center gap-3">
            <ShoppingCart className="h-10 w-10 text-primary" />
            Shopping Cart
          </h1>

          {cart.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-primary/10 mb-6">
                <ShoppingCart className="h-12 w-12 text-primary/30" />
              </div>
              <h2 className="text-2xl font-semibold mb-4">Your cart is empty</h2>
              <p className="text-muted-foreground mb-8">Start adding some amazing products!</p>
              <button
                onClick={() => setView("home")}
                className="px-8 py-4 bg-primary text-primary-foreground rounded-xl font-semibold hover:scale-105 transition-all shadow-lg hover:shadow-primary/50"
              >
                Start Shopping
              </button>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                {cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="group flex gap-6 p-6 bg-card border border-border rounded-2xl hover:shadow-xl hover:border-primary/50 transition-all"
                  >
                    <div className="relative w-32 h-32 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                      <img
                        src={item.product.image || "/placeholder.svg"}
                        alt={item.product.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      />
                    </div>
                    
                    <div className="flex-1 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold text-lg mb-1">
                            {item.product.title}
                          </h3>
                          <p className="text-primary font-bold">
                            {formatPrice(item.product.price)}
                          </p>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="p-2 hover:bg-destructive/10 rounded-lg transition-colors group/btn"
                        >
                          <X className="h-5 w-5 text-muted-foreground group-hover/btn:text-destructive" />
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() =>
                            updateCartQuantity(item.product.id, item.quantity - 1)
                          }
                          className="p-2 border border-border hover:border-primary rounded-lg transition-all hover:scale-110"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-12 text-center font-semibold text-lg">{item.quantity}</span>
                        <button
                          onClick={() =>
                            updateCartQuantity(item.product.id, item.quantity + 1)
                          }
                          className="p-2 border border-border hover:border-primary rounded-lg transition-all hover:scale-110"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <span className="text-sm text-muted-foreground ml-auto">
                          Subtotal: <span className="font-semibold text-foreground">{formatPrice(item.product.price * item.quantity)}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Order Summary Sidebar */}
              <div className="lg:sticky lg:top-24 space-y-6">
                <div className="p-6 bg-card border border-border rounded-2xl shadow-xl">
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                    <Package className="h-6 w-6 text-primary" />
                    Order Summary
                  </h2>
                  
                  <div className="space-y-4 mb-6">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-semibold">{formatPrice(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Delivery ({checkoutForm.delivery_type})</span>
                      <span className="font-semibold">{formatPrice(deliveryFee)}</span>
                    </div>
                    {paymentFee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Payment Fee</span>
                        <span className="font-semibold">{formatPrice(paymentFee)}</span>
                      </div>
                    )}
                    <div className="h-px bg-border" />
                    <div className="flex justify-between text-lg">
                      <span className="font-bold">Total</span>
                      <span className="font-bold text-primary">{formatPrice(orderTotal)}</span>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => setView("checkout")}
                    className="group relative w-full py-4 bg-primary text-primary-foreground rounded-xl font-semibold hover:scale-105 transition-all shadow-lg hover:shadow-primary/50"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      Proceed to Checkout
                      <CreditCard className="h-5 w-5" />
                    </span>
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/50 to-accent/50 opacity-0 group-hover:opacity-100 transition-opacity blur" />
                  </button>
                  
                  <button
                    onClick={() => setView("home")}
                    className="w-full mt-3 py-3 bg-background/50 backdrop-blur-sm border border-border rounded-xl font-medium hover:bg-background transition-all"
                  >
                    Continue Shopping
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === "checkout") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header />
        
        <div className="container mx-auto px-4 py-12 max-w-6xl">
          <button
            onClick={() => setView("cart")}
            className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-lg bg-background/50 backdrop-blur-sm border border-border hover:bg-background transition-all hover:scale-105"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to cart</span>
          </button>

          <h1 className="text-4xl font-bold mb-12 tracking-tight flex items-center gap-3">
            <CreditCard className="h-10 w-10 text-primary" />
            Checkout
          </h1>

          <div className="grid lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="p-6 bg-card border border-border rounded-2xl shadow-xl">
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  Contact Information
                </h2>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Full Name *"
                    value={checkoutForm.name}
                    onChange={(e) =>
                      setCheckoutForm({ ...checkoutForm, name: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                  <input
                    type="email"
                    placeholder="Email *"
                    value={checkoutForm.email}
                    onChange={(e) =>
                      setCheckoutForm({ ...checkoutForm, email: e.target.value })
                    }
                    required
                    pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={checkoutForm.phone}
                    onChange={(e) =>
                      setCheckoutForm({ ...checkoutForm, phone: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="p-6 bg-card border border-border rounded-2xl shadow-xl">
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary" />
                  Delivery
                </h2>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <button
                    onClick={() =>
                      setCheckoutForm({ ...checkoutForm, delivery_type: "home" })
                    }
                    className={`flex flex-col items-center gap-2 p-4 border-2 rounded-xl transition-all hover:scale-105 ${
                      checkoutForm.delivery_type === "home" 
                        ? "border-primary bg-primary/10" 
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <HomeIcon className="h-6 w-6" />
                    <span className="font-medium text-sm">Home Delivery</span>
                  </button>
                  <button
                    onClick={() =>
                      setCheckoutForm({ ...checkoutForm, delivery_type: "locker" })
                    }
                    className={`flex flex-col items-center gap-2 p-4 border-2 rounded-xl transition-all hover:scale-105 ${
                      checkoutForm.delivery_type === "locker" 
                        ? "border-primary bg-primary/10" 
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <MapPin className="h-6 w-6" />
                    <span className="font-medium text-sm">Locker Delivery</span>
                  </button>
                </div>

                {checkoutForm.delivery_type === "home" ? (
                  <div className="space-y-4">
                    <input
                      type="text"
                      placeholder="City *"
                      value={checkoutForm.city}
                      onChange={(e) =>
                        setCheckoutForm({ ...checkoutForm, city: e.target.value })
                      }
                      className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                    <input
                      type="text"
                      placeholder="County *"
                      value={checkoutForm.county}
                      onChange={(e) =>
                        setCheckoutForm({ ...checkoutForm, county: e.target.value })
                      }
                      className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <input
                        type="text"
                        placeholder="Street *"
                        value={checkoutForm.street}
                        onChange={(e) =>
                          setCheckoutForm({ ...checkoutForm, street: e.target.value })
                        }
                        className="px-4 py-3 bg-background border border-border rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      />
                      <input
                        type="text"
                        placeholder="Number *"
                        value={checkoutForm.street_number}
                        onChange={(e) =>
                          setCheckoutForm({
                            ...checkoutForm,
                            street_number: e.target.value,
                          })
                        }
                        className="px-4 py-3 bg-background border border-border rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <input
                        type="text"
                        placeholder="Block"
                        value={checkoutForm.block}
                        onChange={(e) =>
                          setCheckoutForm({ ...checkoutForm, block: e.target.value })
                        }
                        className="px-4 py-3 bg-background border border-border rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      />
                      <input
                        type="text"
                        placeholder="Apartment"
                        value={checkoutForm.apartment}
                        onChange={(e) =>
                          setCheckoutForm({
                            ...checkoutForm,
                            apartment: e.target.value,
                          })
                        }
                        className="px-4 py-3 bg-background border border-border rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <select
                      value={checkoutForm.selected_carrier_code}
                      onChange={(e) =>
                        setCheckoutForm({
                          ...checkoutForm,
                          selected_carrier_code: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    >
                      <option value="">Choose a carrier...</option>
                      <option value="cargus">Cargus</option>
                      <option value="dpd">DPD</option>
                      <option value="fan">FAN Courier</option>
                      <option value="gls">GLS</option>
                      <option value="sameday">Sameday</option>
                    </select>

                  {checkoutForm.selected_carrier_code && mapboxToken && apiKey && (
                      <LockerMapSelector
                        carrierId={carrierIdMap[checkoutForm.selected_carrier_code]}
                        carrierName={checkoutForm.selected_carrier_code.toUpperCase()}
                        carrierCode={checkoutForm.selected_carrier_code}
                        apiKey={apiKey}
                        mapboxToken={mapboxToken}
                        onLockerSelect={(locker) => {
                          // Parse city and county from address if included
                          const addressParts = locker.address.split(',');
                          const city = addressParts.length > 1 ? addressParts[addressParts.length - 2]?.trim() : "";
                          const county = addressParts.length > 2 ? addressParts[addressParts.length - 1]?.trim() : "";
                          
                          setCheckoutForm({
                            ...checkoutForm,
                            locker_id: locker.id,
                            locker_name: locker.name,
                            locker_address: locker.address,
                            city: city,
                            county: county,
                          });
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="border p-6" style={{ borderColor: `${customization.text_color}20` }}>
                <h2 className="text-xl font-semibold mb-6" style={{ color: customization.text_color }}>
                  Order Summary
                </h2>
                
                {/* Payment Method */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium mb-3" style={{ color: customization.text_color }}>Payment Method</h3>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setPaymentMethod('card')}
                      className={`flex-1 px-4 py-2 border text-sm ${paymentMethod === 'card' ? '' : 'opacity-50'}`}
                      style={{
                        borderColor: paymentMethod === 'card' ? customization.primary_color : `${customization.text_color}30`,
                        backgroundColor: paymentMethod === 'card' ? `${customization.primary_color}10` : 'transparent'
                      }}
                    >
                      Card
                    </button>
                    {feeSettings.cash_payment_enabled && (
                      <button
                        onClick={() => setPaymentMethod('cash')}
                        className={`flex-1 px-4 py-2 border text-sm ${paymentMethod === 'cash' ? '' : 'opacity-50'}`}
                        style={{
                          borderColor: paymentMethod === 'cash' ? customization.primary_color : `${customization.text_color}30`,
                          backgroundColor: paymentMethod === 'cash' ? `${customization.primary_color}10` : 'transparent'
                        }}
                      >
                        Cash {feeSettings.cash_payment_fee > 0 && `(+${formatPrice(feeSettings.cash_payment_fee)})`}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  {cart.map((item) => (
                    <div key={item.product.id} className="flex justify-between text-sm">
                      <span style={{ color: customization.accent_color }}>
                        {item.product.title} × {item.quantity}
                      </span>
                      <span style={{ color: customization.text_color }}>
                        {formatPrice(item.product.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t pt-4 space-y-2" style={{ borderColor: `${customization.text_color}20` }}>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: customization.accent_color }}>Subtotal</span>
                    <span style={{ color: customization.text_color }}>{formatPrice(cartTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: customization.accent_color }}>Delivery Fee</span>
                    <span style={{ color: customization.text_color }}>{formatPrice(deliveryFee)}</span>
                  </div>
                  {paymentFee > 0 && (
                    <div className="flex justify-between text-sm">
                      <span style={{ color: customization.accent_color }}>Payment Fee</span>
                      <span style={{ color: customization.text_color }}>{formatPrice(paymentFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xl font-bold pt-2 border-t" style={{ borderColor: `${customization.text_color}20` }}>
                    <span style={{ color: customization.text_color }}>Total</span>
                    <span style={{ color: customization.text_color }}>
                      {formatPrice(orderTotal)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleCheckout}
                  className="w-full py-4 text-sm font-medium tracking-wide transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: customization.primary_color,
                    color: customization.background_color,
                  }}
                >
                  Complete Order
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default ElementarTemplate;
