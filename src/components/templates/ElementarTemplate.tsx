import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Plus, Minus, X, Package, Truck, CreditCard, ArrowLeft, MapPin, Home as HomeIcon, Search, Menu } from "lucide-react";
import { toast } from "sonner";
import { calculateProductPrice, formatPrice, formatDiscount } from "@/lib/discountUtils";
import LockerMapSelector from "./LockerMapSelector";

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  image: string;
  stock: number;
  category: string;
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
        
        const mappedProducts = productsArray.map((p: any) => ({
          id: p.id,
          title: p.title,
          description: p.description || "",
          price: typeof p.final_price === "number" ? p.final_price : p.price,
          image: p.primary_image || p.image || "",
          stock: p.stock || 0,
          category: p.category || "",
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

  const handleCheckout = async () => {
    if (!checkoutForm.name || !checkoutForm.email) {
      toast.error("Please fill in all required fields");
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
        window.location.href = result.payment_url;
      } else if (response.ok) {
        toast.success("Order created successfully!");
        setCart([]);
        setView("home");
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
      product.category === selectedCollection;
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
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: customization.background_color }}
      >
        <Package className="h-12 w-12 animate-spin" style={{ color: customization.primary_color }} />
      </div>
    );
  }

  // Line-inspired header
  const Header = () => (
    <header 
      className="sticky top-0 z-50"
      style={{ 
        backgroundColor: customization.background_color,
        borderBottom: `1px solid ${customization.text_color}10`
      }}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Menu Icon */}
          <button className="p-2">
            <Menu className="h-5 w-5" style={{ color: customization.text_color }} />
          </button>

          {/* Logo - Centered */}
          <button 
            onClick={() => setView("home")}
            className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-2"
          >
            {customization.logo_url ? (
              <img 
                src={customization.logo_url} 
                alt={customization.store_name}
                className="h-6 w-auto"
              />
            ) : (
              <span className="text-lg font-light tracking-wider" style={{ color: customization.text_color }}>
                {customization.store_name}
              </span>
            )}
          </button>

          {/* Right Side Icons */}
          <div className="flex items-center gap-4">
            <button className="p-2 hidden md:block">
              <Search className="h-5 w-5" style={{ color: customization.text_color }} />
            </button>
            
            <button
              onClick={() => setView("cart")}
              className="relative p-2"
            >
              <ShoppingCart className="h-5 w-5" style={{ color: customization.text_color }} />
              {cartItemCount > 0 && (
                <span 
                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center text-xs font-light"
                  style={{ 
                    backgroundColor: customization.text_color,
                    color: customization.background_color 
                  }}
                >
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
      <div style={{ backgroundColor: customization.background_color, color: customization.text_color }}>
        <Header />

        {/* Hero Section - Line-inspired Split Design */}
        <section className="grid md:grid-cols-2 h-[70vh]">
          {/* Left Hero Panel */}
          <div 
            className="relative flex items-center justify-center px-8 md:px-12"
            style={{
              backgroundImage: customization.hero_image_url 
                ? `url(${customization.hero_image_url})`
                : '#F5F5F5',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div className="relative z-10 text-center max-w-xl">
              <h1 
                className="text-3xl md:text-5xl font-light mb-6 leading-tight"
                style={{ color: customization.hero_image_url ? '#FFFFFF' : customization.text_color }}
              >
                {customization.hero_title}
              </h1>
              <button
                onClick={() => {
                  const productsSection = document.getElementById('products-section');
                  productsSection?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-10 py-3 text-sm font-normal tracking-wider uppercase transition-all hover:opacity-70"
                style={{
                  backgroundColor: customization.hero_image_url ? 'rgba(255,255,255,0.9)' : customization.background_color,
                  color: customization.text_color,
                  border: `1px solid ${customization.text_color}20`,
                }}
              >
                {customization.hero_button_text}
              </button>
            </div>
          </div>

          {/* Right Hero Panel */}
          <div 
            className="relative flex items-center justify-center px-8 md:px-12"
            style={{
              backgroundColor: '#E8F4F8',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div className="text-center max-w-xl">
              <h2 
                className="text-2xl md:text-4xl font-light leading-relaxed"
                style={{ color: customization.text_color }}
              >
                {customization.hero_subtitle}
              </h2>
            </div>
          </div>
        </section>

        {/* Collections Section */}
        {collections.length > 0 && (
          <section className="py-20">
            <div className="container mx-auto px-4">
              <h2 className="text-2xl font-light text-center mb-16 tracking-wide" style={{ color: customization.text_color }}>
                Shop by Collection
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {collections.map((collection) => (
                  <button
                    key={collection.id}
                    onClick={() => {
                      setSelectedCollection(collection.id);
                      const productsSection = document.getElementById('products-section');
                      productsSection?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="relative aspect-square overflow-hidden group"
                  >
                    <img
                      src={collection.image_url || "/placeholder.svg"}
                      alt={collection.name}
                      className="w-full h-full object-cover transition-opacity duration-300 group-hover:opacity-90"
                    />
                    <div className="absolute inset-0 flex items-end justify-center p-6">
                      <h3 
                        className="font-light text-lg tracking-wide"
                        style={{ 
                          color: '#FFFFFF',
                          textShadow: '0 2px 8px rgba(0,0,0,0.3)'
                        }}
                      >
                        {collection.name}
                      </h3>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Products Section */}
        <section id="products-section" className="py-20 bg-white">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-2xl font-light tracking-wide mb-4" style={{ color: customization.text_color }}>
                Enjoy our featured Product
              </h2>
              <div className="flex items-center justify-center gap-4 mt-6">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-6 py-2 border text-sm font-light"
                  style={{
                    backgroundColor: customization.background_color,
                    color: customization.text_color,
                    borderColor: `${customization.text_color}20`
                  }}
                >
                  <option value="default">Featured</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="name">Name: A-Z</option>
                </select>
              </div>
            </div>

            {selectedCollection && (
              <div className="mb-8 text-center">
                <button
                  onClick={() => setSelectedCollection(null)}
                  className="text-sm underline font-light"
                  style={{ color: customization.accent_color }}
                >
                  Clear filter
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 md:gap-12">
              {sortedProducts.map((product) => (
                <div
                  key={product.id}
                  className="group cursor-pointer"
                  onClick={() => {
                    setSelectedProduct(product);
                    setView("product");
                  }}
                >
                  <div className="aspect-square overflow-hidden mb-4 bg-gray-50">
                    <img
                      src={product.image || "/placeholder.svg"}
                      alt={product.title}
                      className="w-full h-full object-cover transition-opacity duration-300 group-hover:opacity-80"
                    />
                  </div>
                  <h3 className="font-light mb-2 text-center" style={{ color: customization.text_color }}>
                    {product.title}
                  </h3>
                  <p className="text-sm text-center font-light" style={{ color: customization.accent_color }}>
                    {formatPrice(product.price)}
                  </p>
                  {product.stock < 5 && product.stock > 0 && (
                    <p className="text-xs mt-2 text-center" style={{ color: '#DC2626' }}>
                      Only {product.stock} left
                    </p>
                  )}
                  {product.stock === 0 && (
                    <p className="text-xs mt-2 text-center" style={{ color: '#DC2626' }}>
                      Out of stock
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 border-t" style={{ borderColor: `${customization.text_color}10`, backgroundColor: '#FAFAFA' }}>
          <div className="container mx-auto px-4 text-center">
            <p className="text-sm font-light tracking-wide" style={{ color: customization.accent_color }}>
              © {new Date().getFullYear()} {customization.store_name}. All rights reserved.
            </p>
          </div>
        </footer>
      </div>
    );
  }

  if (view === "product" && selectedProduct) {
    return (
      <div style={{ backgroundColor: customization.background_color, color: customization.text_color, minHeight: '100vh' }}>
        <Header />
        
        <div className="container mx-auto px-4 py-8">
          <button
            onClick={() => setView("home")}
            className="flex items-center gap-2 mb-6 text-sm"
            style={{ color: customization.accent_color }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to products
          </button>

          <div className="grid md:grid-cols-2 gap-12">
            <div className="aspect-square">
              <img
                src={selectedProduct.image || "/placeholder.svg"}
                alt={selectedProduct.title}
                className="w-full h-full object-cover"
              />
            </div>

            <div>
              <h1 className="text-3xl md:text-4xl font-light mb-4 tracking-wide" style={{ color: customization.text_color }}>
                {selectedProduct.title}
              </h1>
              <p className="text-2xl font-light mb-8" style={{ color: customization.text_color }}>
                {formatPrice(selectedProduct.price)}
              </p>
              
              {selectedProduct.description && (
                <p className="mb-8 leading-relaxed font-light" style={{ color: customization.accent_color }}>
                  {selectedProduct.description}
                </p>
              )}

              <div className="mb-8">
                {selectedProduct.stock > 0 ? (
                  <p className="text-sm font-light" style={{ color: customization.accent_color }}>
                    {selectedProduct.stock} in stock
                  </p>
                ) : (
                  <p className="text-sm font-light" style={{ color: '#DC2626' }}>
                    Out of stock
                  </p>
                )}
              </div>

              <button
                onClick={() => addToCart(selectedProduct)}
                disabled={selectedProduct.stock === 0}
                className="w-full py-4 text-sm font-light tracking-wider uppercase transition-opacity hover:opacity-70 disabled:opacity-50"
                style={{
                  backgroundColor: customization.background_color,
                  color: customization.text_color,
                  border: `1px solid ${customization.text_color}`,
                }}
              >
                {selectedProduct.stock === 0 ? "Out of Stock" : "Add to Cart"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === "cart") {
    return (
      <div style={{ backgroundColor: customization.background_color, color: customization.text_color, minHeight: '100vh' }}>
        <Header />
        
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          <h1 className="text-3xl font-light mb-12 tracking-wide" style={{ color: customization.text_color }}>
            Shopping Cart
          </h1>

          {cart.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingCart className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="mb-8 font-light" style={{ color: customization.accent_color }}>Your cart is empty</p>
              <button
                onClick={() => setView("home")}
                className="px-10 py-3 text-sm font-light tracking-wider uppercase transition-opacity hover:opacity-70"
                style={{
                  backgroundColor: customization.background_color,
                  color: customization.text_color,
                  border: `1px solid ${customization.text_color}`,
                }}
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-6 mb-12">
                {cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex gap-6 pb-6 border-b"
                    style={{ borderColor: `${customization.text_color}10` }}
                  >
                    <img
                      src={item.product.image || "/placeholder.svg"}
                      alt={item.product.title}
                      className="w-32 h-32 object-cover bg-gray-50"
                    />
                    <div className="flex-1">
                      <h3 className="font-light text-lg mb-2" style={{ color: customization.text_color }}>
                        {item.product.title}
                      </h3>
                      <p className="text-sm font-light mb-4" style={{ color: customization.accent_color }}>
                        {formatPrice(item.product.price)}
                      </p>
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() =>
                            updateCartQuantity(item.product.id, item.quantity - 1)
                          }
                          className="p-2 border transition-opacity hover:opacity-60"
                          style={{ borderColor: `${customization.text_color}20` }}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-10 text-center font-light">{item.quantity}</span>
                        <button
                          onClick={() =>
                            updateCartQuantity(item.product.id, item.quantity + 1)
                          }
                          className="p-2 border transition-opacity hover:opacity-60"
                          style={{ borderColor: `${customization.text_color}20` }}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-between">
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="p-2 hover:opacity-60 transition-opacity"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <p className="font-light" style={{ color: customization.text_color }}>
                        {formatPrice(item.product.price * item.quantity)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

                <div className="border-t pt-4 mb-6" style={{ borderColor: `${customization.text_color}10` }}>
                  <div className="flex justify-between text-sm mb-2">
                    <span style={{ color: customization.accent_color }}>Delivery ({checkoutForm.delivery_type})</span>
                    <span style={{ color: customization.text_color }}>{formatPrice(deliveryFee)}</span>
                  </div>
                  {paymentFee > 0 && (
                    <div className="flex justify-between text-sm">
                      <span style={{ color: customization.accent_color }}>Payment Fee</span>
                      <span style={{ color: customization.text_color }}>{formatPrice(paymentFee)}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setView("checkout")}
                  className="w-full py-4 text-sm font-light tracking-wider uppercase transition-opacity hover:opacity-70"
                  style={{
                    backgroundColor: customization.background_color,
                    color: customization.text_color,
                    border: `1px solid ${customization.text_color}`,
                  }}
                >
                  Proceed to Checkout
                </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (view === "checkout") {
    return (
      <div style={{ backgroundColor: customization.background_color, color: customization.text_color, minHeight: '100vh' }}>
        <Header />
        
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <button
            onClick={() => setView("cart")}
            className="flex items-center gap-2 mb-6 text-sm"
            style={{ color: customization.accent_color }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to cart
          </button>

          <h1 className="text-3xl font-bold mb-8" style={{ color: customization.text_color }}>
            Checkout
          </h1>

          <div className="grid md:grid-cols-2 gap-12">
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-4" style={{ color: customization.text_color }}>
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
                    className="w-full px-4 py-3 border rounded-none text-sm"
                    style={{
                      backgroundColor: customization.background_color,
                      color: customization.text_color,
                      borderColor: `${customization.text_color}30`
                    }}
                  />
                  <input
                    type="email"
                    placeholder="Email *"
                    value={checkoutForm.email}
                    onChange={(e) =>
                      setCheckoutForm({ ...checkoutForm, email: e.target.value })
                    }
                    className="w-full px-4 py-3 border rounded-none text-sm"
                    style={{
                      backgroundColor: customization.background_color,
                      color: customization.text_color,
                      borderColor: `${customization.text_color}30`
                    }}
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={checkoutForm.phone}
                    onChange={(e) =>
                      setCheckoutForm({ ...checkoutForm, phone: e.target.value })
                    }
                    className="w-full px-4 py-3 border rounded-none text-sm"
                    style={{
                      backgroundColor: customization.background_color,
                      color: customization.text_color,
                      borderColor: `${customization.text_color}30`
                    }}
                  />
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4" style={{ color: customization.text_color }}>
                  Delivery
                </h2>
                <div className="flex gap-4 mb-4">
                  <button
                    onClick={() =>
                      setCheckoutForm({ ...checkoutForm, delivery_type: "home" })
                    }
                    className={`flex-1 px-4 py-3 border text-sm font-medium ${
                      checkoutForm.delivery_type === "home" ? "" : "opacity-50"
                    }`}
                    style={{
                      borderColor: checkoutForm.delivery_type === "home" 
                        ? customization.primary_color 
                        : `${customization.text_color}30`,
                      backgroundColor: checkoutForm.delivery_type === "home"
                        ? `${customization.primary_color}10`
                        : 'transparent'
                    }}
                  >
                    <HomeIcon className="h-5 w-5 mx-auto mb-1" />
                    Home Delivery
                  </button>
                  <button
                    onClick={() =>
                      setCheckoutForm({ ...checkoutForm, delivery_type: "locker" })
                    }
                    className={`flex-1 px-4 py-3 border text-sm font-medium ${
                      checkoutForm.delivery_type === "locker" ? "" : "opacity-50"
                    }`}
                    style={{
                      borderColor: checkoutForm.delivery_type === "locker" 
                        ? customization.primary_color 
                        : `${customization.text_color}30`,
                      backgroundColor: checkoutForm.delivery_type === "locker"
                        ? `${customization.primary_color}10`
                        : 'transparent'
                    }}
                  >
                    <MapPin className="h-5 w-5 mx-auto mb-1" />
                    Locker Delivery
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
                      className="w-full px-4 py-3 border rounded-none text-sm"
                      style={{
                        backgroundColor: customization.background_color,
                        color: customization.text_color,
                        borderColor: `${customization.text_color}30`
                      }}
                    />
                    <input
                      type="text"
                      placeholder="County *"
                      value={checkoutForm.county}
                      onChange={(e) =>
                        setCheckoutForm({ ...checkoutForm, county: e.target.value })
                      }
                      className="w-full px-4 py-3 border rounded-none text-sm"
                      style={{
                        backgroundColor: customization.background_color,
                        color: customization.text_color,
                        borderColor: `${customization.text_color}30`
                      }}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <input
                        type="text"
                        placeholder="Street *"
                        value={checkoutForm.street}
                        onChange={(e) =>
                          setCheckoutForm({ ...checkoutForm, street: e.target.value })
                        }
                        className="px-4 py-3 border rounded-none text-sm"
                        style={{
                          backgroundColor: customization.background_color,
                          color: customization.text_color,
                          borderColor: `${customization.text_color}30`
                        }}
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
                        className="px-4 py-3 border rounded-none text-sm"
                        style={{
                          backgroundColor: customization.background_color,
                          color: customization.text_color,
                          borderColor: `${customization.text_color}30`
                        }}
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
                        className="px-4 py-3 border rounded-none text-sm"
                        style={{
                          backgroundColor: customization.background_color,
                          color: customization.text_color,
                          borderColor: `${customization.text_color}30`
                        }}
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
                        className="px-4 py-3 border rounded-none text-sm"
                        style={{
                          backgroundColor: customization.background_color,
                          color: customization.text_color,
                          borderColor: `${customization.text_color}30`
                        }}
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
                      className="w-full px-4 py-3 border rounded-none text-sm"
                      style={{
                        backgroundColor: customization.background_color,
                        color: customization.text_color,
                        borderColor: `${customization.text_color}30`
                      }}
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
