import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ShoppingCart, Plus, Minus, X, Package, Truck, CreditCard, 
  ArrowLeft, MapPin, Home as HomeIcon, Search, Menu, Sparkles, 
  Zap, Star, Heart, Share2, Filter, Grid3X3, List, Edit3
} from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/discountUtils";
import LockerMapSelector from "./LockerMapSelector";
import { Skeleton } from "@/components/ui/skeleton";
import LiveTemplateEditor from "./LiveTemplateEditor";

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

interface ExtendedCustomization {
  id?: string;
  user_id: string;
  template_id: string;
  primary_color: string;
  background_color: string;
  text_color: string;
  accent_color: string;
  secondary_color: string;
  hero_image_url: string | null;
  logo_url: string | null;
  hero_title: string;
  hero_subtitle: string;
  hero_button_text: string;
  store_name: string;
  font_family: string;
  heading_font: string;
  border_radius: string;
  button_style: string;
  hero_layout: string;
  product_card_style: string;
  show_collection_images: boolean;
  show_hero_section: boolean;
  navbar_style: string;
  footer_text: string;
  gradient_enabled: boolean;
  animation_style: string;
}

interface EnhancedElementarTemplateProps {
  apiKey: string;
  editMode?: boolean;
}

const defaultCustomization: ExtendedCustomization = {
  user_id: '',
  template_id: 'elementar',
  primary_color: '#000000',
  background_color: '#FFFFFF',
  text_color: '#000000',
  accent_color: '#666666',
  secondary_color: '#F5F5F5',
  hero_image_url: null,
  logo_url: null,
  hero_title: 'Welcome to Our Store',
  hero_subtitle: 'Discover amazing products crafted with passion and precision',
  hero_button_text: 'Explore Collection',
  store_name: 'My Store',
  font_family: 'Inter',
  heading_font: 'Inter',
  border_radius: 'rounded-xl',
  button_style: 'solid',
  hero_layout: 'center',
  product_card_style: 'minimal',
  show_collection_images: true,
  show_hero_section: true,
  navbar_style: 'glass',
  footer_text: 'All rights reserved.',
  gradient_enabled: true,
  animation_style: 'smooth',
};

const EnhancedElementarTemplate = ({ apiKey, editMode = false }: EnhancedElementarTemplateProps) => {
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
  const [customization, setCustomization] = useState<ExtendedCustomization>(defaultCustomization);
  const [showEditor, setShowEditor] = useState(editMode);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [feeSettings, setFeeSettings] = useState({
    cash_payment_enabled: true,
    cash_payment_fee: 0,
    home_delivery_fee: 0,
    locker_delivery_fee: 0
  });
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('card');

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

  // Dynamic CSS variables based on customization
  const cssVariables = useMemo(() => ({
    '--template-primary': customization.primary_color,
    '--template-background': customization.background_color,
    '--template-text': customization.text_color,
    '--template-accent': customization.accent_color,
    '--template-secondary': customization.secondary_color,
    '--template-font': customization.font_family,
    '--template-heading-font': customization.heading_font,
  } as React.CSSProperties), [customization]);

  // Animation classes based on style
  const animationClass = useMemo(() => {
    switch (customization.animation_style) {
      case 'dynamic': return 'transition-all duration-500 ease-out';
      case 'minimal': return 'transition-all duration-200';
      case 'none': return '';
      default: return 'transition-all duration-300 ease-in-out';
    }
  }, [customization.animation_style]);

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
          setCustomization(prev => ({ ...prev, ...data.customization }));
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

  const addToCart = (product: Product) => {
    const existingItem = cart.find((item) => item.product.id === product.id);
    if (existingItem) {
      if (existingItem.quantity < product.stock) {
        setCart(cart.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        ));
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
    setCart(cart.map((item) =>
      item.product.id === productId ? { ...item, quantity: newQuantity } : item
    ));
  };

  const removeFromCart = (productId: string) => {
    const item = cart.find((item) => item.product.id === productId);
    setCart(cart.filter((item) => item.product.id !== productId));
    if (item) {
      toast.success(`${item.product.title} removed from cart`);
    }
  };

  const toggleWishlist = (productId: string) => {
    setWishlist(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const deliveryFee = checkoutForm.delivery_type === 'home' ? feeSettings.home_delivery_fee : feeSettings.locker_delivery_fee;
  const paymentFee = paymentMethod === 'cash' && feeSettings.cash_payment_enabled ? feeSettings.cash_payment_fee : 0;
  const orderTotal = cartTotal + deliveryFee + paymentFee;
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const filteredProducts = products.filter((product) => {
    const matchesCollection = !selectedCollection || selectedCollection === "all" ||
      (productCollections[product.id] && productCollections[product.id].includes(selectedCollection));
    const matchesSearch = !searchQuery ||
      product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.description && product.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCollection && matchesSearch;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case "price-low": return a.price - b.price;
      case "price-high": return b.price - a.price;
      case "name": return a.title.localeCompare(b.title);
      default: return 0;
    }
  });

  const handleCheckout = async () => {
    if (!checkoutForm.name || !checkoutForm.email) {
      toast.error("Please fill in all required fields");
      return;
    }

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
        customer_address: checkoutForm.delivery_type === "home"
          ? `${checkoutForm.street} ${checkoutForm.street_number}${checkoutForm.block ? `, Block ${checkoutForm.block}` : ""}${checkoutForm.apartment ? `, Apt ${checkoutForm.apartment}` : ""}, ${checkoutForm.city}, ${checkoutForm.county}`
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
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify(orderData),
      });

      const result = await response.json();

      if (response.ok && result.payment_url) {
        window.location.href = result.payment_url;
      } else if (response.ok && paymentMethod === 'cash') {
        toast.success("Order created successfully! You will pay cash on delivery.");
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

  // Get button styles based on configuration
  const getButtonStyles = (variant: 'primary' | 'secondary' = 'primary') => {
    const base = `${customization.border_radius} font-medium ${animationClass}`;
    
    if (variant === 'primary') {
      switch (customization.button_style) {
        case 'outline':
          return `${base} border-2 bg-transparent hover:bg-[var(--template-primary)] hover:text-white`;
        case 'ghost':
          return `${base} bg-transparent hover:bg-[var(--template-primary)]/10`;
        case 'gradient':
          return `${base} bg-gradient-to-r from-[var(--template-primary)] to-[var(--template-accent)] text-white hover:opacity-90`;
        case 'glow':
          return `${base} bg-[var(--template-primary)] text-white shadow-lg shadow-[var(--template-primary)]/50 hover:shadow-xl`;
        default:
          return `${base} bg-[var(--template-primary)] text-white hover:opacity-90`;
      }
    }
    
    return `${base} bg-[var(--template-secondary)] hover:bg-[var(--template-secondary)]/80`;
  };

  // Get navbar styles
  const getNavbarStyles = () => {
    switch (customization.navbar_style) {
      case 'solid':
        return 'bg-[var(--template-background)] border-b';
      case 'glass':
        return 'bg-[var(--template-background)]/80 backdrop-blur-xl border-b border-border/50';
      case 'minimal':
        return 'bg-transparent';
      default:
        return 'bg-transparent backdrop-blur-sm';
    }
  };

  if (loading) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{ 
          ...cssVariables,
          backgroundColor: customization.background_color,
          fontFamily: customization.font_family
        }}
      >
        <div className="flex flex-col items-center gap-4">
          <Package className="h-16 w-16 animate-spin" style={{ color: customization.primary_color }} />
          <p className="text-sm font-light animate-pulse" style={{ color: customization.text_color }}>
            Loading your experience...
          </p>
        </div>
      </div>
    );
  }

  const Header = () => (
    <header 
      className={`sticky top-0 z-50 ${getNavbarStyles()} ${animationClass}`}
      style={{ borderColor: `${customization.primary_color}20` }}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <button className="p-2 hover:opacity-70 rounded-lg" style={{ color: customization.text_color }}>
            <Menu className="h-5 w-5" />
          </button>

          <button 
            onClick={() => { setView("home"); setSelectedCollection(null); }}
            className={`absolute left-1/2 transform -translate-x-1/2 flex items-center gap-2 ${animationClass} hover:scale-105`}
          >
            {customization.logo_url ? (
              <img src={customization.logo_url} alt={customization.store_name} className="h-8 w-auto" />
            ) : (
              <span 
                className="text-xl font-light tracking-widest"
                style={{ color: customization.primary_color, fontFamily: customization.heading_font }}
              >
                {customization.store_name}
              </span>
            )}
          </button>

          <div className="flex items-center gap-2">
            {editMode && (
              <button
                onClick={() => setShowEditor(!showEditor)}
                className={`p-2 ${customization.border_radius} ${animationClass}`}
                style={{ 
                  backgroundColor: showEditor ? customization.primary_color : 'transparent',
                  color: showEditor ? customization.background_color : customization.text_color
                }}
              >
                <Edit3 className="h-5 w-5" />
              </button>
            )}
            
            <button
              onClick={() => setView("cart")}
              className={`relative p-2 ${animationClass} hover:opacity-70`}
              style={{ color: customization.text_color }}
            >
              <ShoppingCart className="h-5 w-5" />
              {cartItemCount > 0 && (
                <span 
                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center text-xs font-medium animate-pulse"
                  style={{ backgroundColor: customization.primary_color, color: customization.background_color }}
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

  const ProductCard = ({ product, index }: { product: Product; index: number }) => {
    const isWishlisted = wishlist.includes(product.id);
    
    return (
      <div
        className={`group cursor-pointer ${animationClass}`}
        style={{ animationDelay: `${index * 0.05}s` }}
        onClick={() => { setSelectedProduct(product); setView("product"); }}
      >
        <div 
          className={`relative ${customization.border_radius} overflow-hidden ${animationClass}`}
          style={{ 
            backgroundColor: customization.secondary_color,
            border: `1px solid ${customization.primary_color}20`
          }}
        >
          <div className="aspect-square overflow-hidden">
            <img
              src={product.image || "/placeholder.svg"}
              alt={product.title}
              className={`w-full h-full object-cover ${animationClass} group-hover:scale-110`}
            />
          </div>
          
          {/* Wishlist button */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleWishlist(product.id); }}
            className={`absolute top-3 right-3 p-2 ${customization.border_radius} ${animationClass}`}
            style={{ 
              backgroundColor: `${customization.background_color}90`,
              color: isWishlisted ? '#ef4444' : customization.text_color
            }}
          >
            <Heart className={`h-4 w-4 ${isWishlisted ? 'fill-current' : ''}`} />
          </button>
          
          {/* Quick add button */}
          <button
            onClick={(e) => { e.stopPropagation(); addToCart(product); }}
            className={`absolute bottom-3 right-3 p-2 ${customization.border_radius} ${animationClass} opacity-0 group-hover:opacity-100`}
            style={{ backgroundColor: customization.primary_color, color: customization.background_color }}
          >
            <Plus className="h-4 w-4" />
          </button>
          
          <div className="p-4 space-y-2">
            <h3 
              className="font-semibold text-sm line-clamp-2"
              style={{ color: customization.text_color, fontFamily: customization.heading_font }}
            >
              {product.title}
            </h3>
            
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold" style={{ color: customization.primary_color }}>
                {formatPrice(product.price)}
              </p>
              
              {product.stock > 0 ? (
                <span 
                  className={`text-xs px-2 py-1 ${customization.border_radius}`}
                  style={{ backgroundColor: customization.secondary_color, color: customization.accent_color }}
                >
                  {product.stock < 5 ? `Only ${product.stock} left` : 'In Stock'}
                </span>
              ) : (
                <span 
                  className={`text-xs px-2 py-1 ${customization.border_radius}`}
                  style={{ backgroundColor: '#ef444420', color: '#ef4444' }}
                >
                  Out of Stock
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Main render based on view
  return (
    <div 
      className="min-h-screen"
      style={{ 
        ...cssVariables,
        backgroundColor: customization.background_color,
        color: customization.text_color,
        fontFamily: customization.font_family
      }}
    >
      {/* Live Editor Panel */}
      <LiveTemplateEditor
        isOpen={showEditor}
        onClose={() => setShowEditor(false)}
        customization={customization}
        onCustomizationChange={setCustomization}
      />

      {view === "home" && (
        <>
          <Header />
          
          {/* Hero Section */}
          {customization.show_hero_section && (
            <section 
              className="relative min-h-[80vh] flex items-center justify-center overflow-hidden"
              style={{
                backgroundImage: customization.hero_image_url ? `url(${customization.hero_image_url})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {/* Gradient Overlay */}
              {customization.gradient_enabled && (
                <>
                  <div 
                    className="absolute inset-0 bg-gradient-to-br opacity-90"
                    style={{
                      background: customization.hero_image_url 
                        ? `linear-gradient(to bottom, ${customization.background_color}80, ${customization.background_color})`
                        : `linear-gradient(135deg, ${customization.background_color}, ${customization.secondary_color})`
                    }}
                  />
                  <div 
                    className="absolute top-20 left-10 w-72 h-72 rounded-full blur-3xl animate-pulse"
                    style={{ backgroundColor: `${customization.primary_color}30` }}
                  />
                  <div 
                    className="absolute bottom-20 right-10 w-96 h-96 rounded-full blur-3xl animate-pulse"
                    style={{ backgroundColor: `${customization.accent_color}20`, animationDelay: '0.7s' }}
                  />
                </>
              )}
              
              <div className={`relative z-10 container mx-auto px-4 ${
                customization.hero_layout === 'center' ? 'text-center' :
                customization.hero_layout === 'left' ? 'text-left' :
                customization.hero_layout === 'right' ? 'text-right' : 'text-center'
              }`}>
                <div className="max-w-4xl mx-auto space-y-8">
                  <div 
                    className={`inline-flex items-center gap-2 px-4 py-2 ${customization.border_radius} backdrop-blur-sm mb-4`}
                    style={{ 
                      backgroundColor: `${customization.primary_color}10`,
                      border: `1px solid ${customization.primary_color}20`
                    }}
                  >
                    <Sparkles className="h-4 w-4 animate-pulse" style={{ color: customization.primary_color }} />
                    <span className="text-sm font-medium" style={{ color: customization.primary_color }}>
                      New Collection Available
                    </span>
                  </div>
                  
                  <h1 
                    className={`text-5xl md:text-7xl font-bold leading-tight ${animationClass}`}
                    style={{ 
                      fontFamily: customization.heading_font,
                      color: customization.text_color
                    }}
                  >
                    {customization.hero_title}
                  </h1>
                  
                  <p 
                    className="text-xl md:text-2xl font-light max-w-2xl mx-auto"
                    style={{ color: customization.accent_color }}
                  >
                    {customization.hero_subtitle}
                  </p>
                  
                  <div className="flex flex-wrap gap-4 justify-center">
                    <button
                      onClick={() => {
                        const productsSection = document.getElementById('products-section');
                        productsSection?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className={`px-8 py-4 ${getButtonStyles('primary')} flex items-center gap-2`}
                    >
                      {customization.hero_button_text}
                      <Zap className="h-4 w-4" />
                    </button>
                    
                    <button
                      onClick={() => setView("cart")}
                      className={`px-8 py-4 ${getButtonStyles('secondary')}`}
                    >
                      View Cart
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Collections Section */}
          {collections.length > 0 && customization.show_collection_images && (
            <section className="py-24">
              <div className="container mx-auto px-4">
                <div className="text-center mb-16 space-y-4">
                  <h2 
                    className="text-4xl font-bold tracking-tight"
                    style={{ fontFamily: customization.heading_font }}
                  >
                    Explore Collections
                  </h2>
                  <p style={{ color: customization.accent_color }}>Curated selections for every style</p>
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
                      className={`group relative aspect-square overflow-hidden ${customization.border_radius} ${animationClass}`}
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <img
                        src={collection.image_url || "/placeholder.svg"}
                        alt={collection.name}
                        className={`w-full h-full object-cover ${animationClass} group-hover:scale-110`}
                      />
                      <div 
                        className="absolute inset-0 opacity-80 group-hover:opacity-90 transition-opacity"
                        style={{ background: `linear-gradient(to top, ${customization.primary_color}cc, transparent)` }}
                      />
                      <div className="absolute inset-0 flex items-end justify-center p-6">
                        <div className="text-center space-y-2">
                          <h3 className="font-semibold text-lg tracking-wide text-white drop-shadow-lg">
                            {collection.name}
                          </h3>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Products Section */}
          <section id="products-section" className="py-24">
            <div className="container mx-auto px-4">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-12">
                <h2 
                  className="text-4xl font-bold tracking-tight"
                  style={{ fontFamily: customization.heading_font }}
                >
                  Featured Products
                </h2>
                
                <div className="flex items-center gap-4">
                  {/* View Toggle */}
                  <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: customization.secondary_color }}>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-2 ${customization.border_radius} ${animationClass}`}
                      style={{ 
                        backgroundColor: viewMode === 'grid' ? customization.primary_color : 'transparent',
                        color: viewMode === 'grid' ? customization.background_color : customization.text_color
                      }}
                    >
                      <Grid3X3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2 ${customization.border_radius} ${animationClass}`}
                      style={{ 
                        backgroundColor: viewMode === 'list' ? customization.primary_color : 'transparent',
                        color: viewMode === 'list' ? customization.background_color : customization.text_color
                      }}
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                  
                  {/* Sort */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className={`px-4 py-2 ${customization.border_radius} text-sm font-medium ${animationClass}`}
                    style={{ 
                      backgroundColor: customization.secondary_color,
                      color: customization.text_color,
                      border: `1px solid ${customization.primary_color}20`
                    }}
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
                  <Package className="h-16 w-16 mx-auto mb-4 opacity-50" style={{ color: customization.accent_color }} />
                  <p className="text-lg" style={{ color: customization.accent_color }}>No products found</p>
                </div>
              ) : (
                <div className={viewMode === 'grid' 
                  ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6" 
                  : "flex flex-col gap-4"
                }>
                  {sortedProducts.map((product, index) => (
                    <ProductCard key={product.id} product={product} index={index} />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Footer */}
          <footer 
            className="py-16 border-t"
            style={{ borderColor: `${customization.primary_color}20`, backgroundColor: customization.secondary_color }}
          >
            <div className="container mx-auto px-4 text-center">
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Sparkles className="h-5 w-5 animate-pulse" style={{ color: customization.primary_color }} />
                  <span className="text-xl font-bold tracking-wider">{customization.store_name}</span>
                  <Sparkles className="h-5 w-5 animate-pulse" style={{ color: customization.primary_color }} />
                </div>
                <p className="text-sm" style={{ color: customization.accent_color }}>
                  © {new Date().getFullYear()} {customization.store_name}. {customization.footer_text}
                </p>
              </div>
            </div>
          </footer>
        </>
      )}

      {view === "product" && selectedProduct && (
        <>
          <Header />
          <div className="container mx-auto px-4 py-12">
            <button
              onClick={() => setView("home")}
              className={`inline-flex items-center gap-2 mb-8 px-4 py-2 ${customization.border_radius} ${animationClass}`}
              style={{ backgroundColor: customization.secondary_color }}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to products
            </button>

            <div className="grid md:grid-cols-2 gap-12 items-start">
              <div className={`${customization.border_radius} overflow-hidden`} style={{ backgroundColor: customization.secondary_color }}>
                <img
                  src={selectedProduct.image || "/placeholder.svg"}
                  alt={selectedProduct.title}
                  className="w-full h-full object-cover aspect-square"
                />
              </div>

              <div className="space-y-8">
                <div className="space-y-4">
                  <h1 
                    className="text-4xl md:text-5xl font-bold tracking-tight"
                    style={{ fontFamily: customization.heading_font }}
                  >
                    {selectedProduct.title}
                  </h1>
                  <p className="text-3xl font-bold" style={{ color: customization.primary_color }}>
                    {formatPrice(selectedProduct.price)}
                  </p>
                </div>
                
                {selectedProduct.description && (
                  <p className="text-lg leading-relaxed" style={{ color: customization.accent_color }}>
                    {selectedProduct.description}
                  </p>
                )}

                <div className="flex items-center gap-3">
                  {selectedProduct.stock > 0 ? (
                    <span 
                      className={`text-sm px-3 py-1 ${customization.border_radius}`}
                      style={{ backgroundColor: customization.secondary_color }}
                    >
                      ✓ {selectedProduct.stock} in stock
                    </span>
                  ) : (
                    <span 
                      className={`text-sm px-3 py-1 ${customization.border_radius}`}
                      style={{ backgroundColor: '#ef444420', color: '#ef4444' }}
                    >
                      Out of stock
                    </span>
                  )}
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => toggleWishlist(selectedProduct.id)}
                    className={`p-4 ${customization.border_radius} ${animationClass}`}
                    style={{ 
                      backgroundColor: customization.secondary_color,
                      color: wishlist.includes(selectedProduct.id) ? '#ef4444' : customization.text_color
                    }}
                  >
                    <Heart className={`h-6 w-6 ${wishlist.includes(selectedProduct.id) ? 'fill-current' : ''}`} />
                  </button>
                  
                  <button
                    onClick={() => { addToCart(selectedProduct); setView("cart"); }}
                    disabled={selectedProduct.stock === 0}
                    className={`flex-1 py-4 ${getButtonStyles('primary')} flex items-center justify-center gap-2 disabled:opacity-50`}
                  >
                    {selectedProduct.stock === 0 ? "Out of Stock" : "Add to Cart"}
                    {selectedProduct.stock > 0 && <ShoppingCart className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {view === "cart" && (
        <>
          <Header />
          <div className="container mx-auto px-4 py-12 max-w-5xl">
            <h1 
              className="text-4xl font-bold mb-12 tracking-tight flex items-center gap-3"
              style={{ fontFamily: customization.heading_font }}
            >
              <ShoppingCart className="h-10 w-10" style={{ color: customization.primary_color }} />
              Shopping Cart
            </h1>

            {cart.length === 0 ? (
              <div className="text-center py-20">
                <ShoppingCart className="h-16 w-16 mx-auto mb-4 opacity-50" style={{ color: customization.accent_color }} />
                <p className="text-xl mb-4" style={{ color: customization.accent_color }}>Your cart is empty</p>
                <button
                  onClick={() => setView("home")}
                  className={`px-6 py-3 ${getButtonStyles('primary')}`}
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
                      className={`flex gap-4 p-4 ${customization.border_radius}`}
                      style={{ backgroundColor: customization.secondary_color }}
                    >
                      <img
                        src={item.product.image || "/placeholder.svg"}
                        alt={item.product.title}
                        className={`w-24 h-24 object-cover ${customization.border_radius}`}
                      />
                      <div className="flex-1">
                        <h3 className="font-semibold">{item.product.title}</h3>
                        <p style={{ color: customization.primary_color }}>{formatPrice(item.product.price)}</p>
                        
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                            className={`p-1 ${customization.border_radius}`}
                            style={{ backgroundColor: customization.background_color }}
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-8 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                            className={`p-1 ${customization.border_radius}`}
                            style={{ backgroundColor: customization.background_color }}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => removeFromCart(item.product.id)}
                            className="ml-auto p-1 text-red-500"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div 
                  className={`p-6 ${customization.border_radius} h-fit sticky top-24`}
                  style={{ backgroundColor: customization.secondary_color }}
                >
                  <h3 className="font-semibold text-lg mb-4">Order Summary</h3>
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between">
                      <span style={{ color: customization.accent_color }}>Subtotal</span>
                      <span>{formatPrice(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: customization.accent_color }}>Delivery</span>
                      <span>{formatPrice(deliveryFee)}</span>
                    </div>
                  </div>
                  <div className="border-t pt-4 mb-6" style={{ borderColor: `${customization.primary_color}20` }}>
                    <div className="flex justify-between text-lg font-semibold">
                      <span>Total</span>
                      <span style={{ color: customization.primary_color }}>{formatPrice(orderTotal)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setView("checkout")}
                    className={`w-full py-4 ${getButtonStyles('primary')}`}
                  >
                    Proceed to Checkout
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {view === "checkout" && (
        <>
          <Header />
          <div className="container mx-auto px-4 py-12 max-w-4xl">
            <button
              onClick={() => setView("cart")}
              className={`inline-flex items-center gap-2 mb-8 px-4 py-2 ${customization.border_radius}`}
              style={{ backgroundColor: customization.secondary_color }}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to cart
            </button>

            <h1 
              className="text-4xl font-bold mb-12"
              style={{ fontFamily: customization.heading_font }}
            >
              Checkout
            </h1>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Contact Info */}
              <div className={`p-6 ${customization.border_radius}`} style={{ backgroundColor: customization.secondary_color }}>
                <h2 className="text-xl font-semibold mb-4">Contact Information</h2>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Full Name *"
                    value={checkoutForm.name}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, name: e.target.value })}
                    className={`w-full p-3 ${customization.border_radius}`}
                    style={{ backgroundColor: customization.background_color, border: `1px solid ${customization.primary_color}20` }}
                  />
                  <input
                    type="email"
                    placeholder="Email *"
                    value={checkoutForm.email}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, email: e.target.value })}
                    className={`w-full p-3 ${customization.border_radius}`}
                    style={{ backgroundColor: customization.background_color, border: `1px solid ${customization.primary_color}20` }}
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={checkoutForm.phone}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, phone: e.target.value })}
                    className={`w-full p-3 ${customization.border_radius}`}
                    style={{ backgroundColor: customization.background_color, border: `1px solid ${customization.primary_color}20` }}
                  />
                </div>
              </div>

              {/* Delivery */}
              <div className={`p-6 ${customization.border_radius}`} style={{ backgroundColor: customization.secondary_color }}>
                <h2 className="text-xl font-semibold mb-4">Delivery</h2>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <button
                      onClick={() => setCheckoutForm({ ...checkoutForm, delivery_type: "home" })}
                      className={`flex-1 p-4 ${customization.border_radius} flex items-center gap-2 ${animationClass}`}
                      style={{ 
                        backgroundColor: checkoutForm.delivery_type === "home" ? customization.primary_color : customization.background_color,
                        color: checkoutForm.delivery_type === "home" ? customization.background_color : customization.text_color,
                        border: `1px solid ${customization.primary_color}20`
                      }}
                    >
                      <HomeIcon className="h-5 w-5" />
                      Home
                    </button>
                    <button
                      onClick={() => setCheckoutForm({ ...checkoutForm, delivery_type: "locker" })}
                      className={`flex-1 p-4 ${customization.border_radius} flex items-center gap-2 ${animationClass}`}
                      style={{ 
                        backgroundColor: checkoutForm.delivery_type === "locker" ? customization.primary_color : customization.background_color,
                        color: checkoutForm.delivery_type === "locker" ? customization.background_color : customization.text_color,
                        border: `1px solid ${customization.primary_color}20`
                      }}
                    >
                      <MapPin className="h-5 w-5" />
                      Locker
                    </button>
                  </div>

                  {checkoutForm.delivery_type === "home" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          placeholder="City *"
                          value={checkoutForm.city}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, city: e.target.value })}
                          className={`p-3 ${customization.border_radius}`}
                          style={{ backgroundColor: customization.background_color, border: `1px solid ${customization.primary_color}20` }}
                        />
                        <input
                          placeholder="County *"
                          value={checkoutForm.county}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, county: e.target.value })}
                          className={`p-3 ${customization.border_radius}`}
                          style={{ backgroundColor: customization.background_color, border: `1px solid ${customization.primary_color}20` }}
                        />
                      </div>
                      <input
                        placeholder="Street *"
                        value={checkoutForm.street}
                        onChange={(e) => setCheckoutForm({ ...checkoutForm, street: e.target.value })}
                        className={`w-full p-3 ${customization.border_radius}`}
                        style={{ backgroundColor: customization.background_color, border: `1px solid ${customization.primary_color}20` }}
                      />
                      <div className="grid grid-cols-3 gap-3">
                        <input
                          placeholder="Number"
                          value={checkoutForm.street_number}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, street_number: e.target.value })}
                          className={`p-3 ${customization.border_radius}`}
                          style={{ backgroundColor: customization.background_color, border: `1px solid ${customization.primary_color}20` }}
                        />
                        <input
                          placeholder="Block"
                          value={checkoutForm.block}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, block: e.target.value })}
                          className={`p-3 ${customization.border_radius}`}
                          style={{ backgroundColor: customization.background_color, border: `1px solid ${customization.primary_color}20` }}
                        />
                        <input
                          placeholder="Apt"
                          value={checkoutForm.apartment}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, apartment: e.target.value })}
                          className={`p-3 ${customization.border_radius}`}
                          style={{ backgroundColor: customization.background_color, border: `1px solid ${customization.primary_color}20` }}
                        />
                      </div>
                    </div>
                  )}

                  {checkoutForm.delivery_type === "locker" && mapboxToken && (
                    <LockerMapSelector
                      apiKey={apiKey}
                      mapboxToken={mapboxToken}
                      carrierId={6}
                      carrierName="Sameday"
                      carrierCode="sameday"
                      onLockerSelect={(locker) => {
                        setCheckoutForm({
                          ...checkoutForm,
                          selected_carrier_code: "sameday",
                          locker_id: locker.id,
                          locker_name: locker.name,
                          locker_address: locker.address,
                        });
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Payment */}
              <div className={`p-6 ${customization.border_radius}`} style={{ backgroundColor: customization.secondary_color }}>
                <h2 className="text-xl font-semibold mb-4">Payment Method</h2>
                <div className="flex gap-4">
                  <button
                    onClick={() => setPaymentMethod("card")}
                    className={`flex-1 p-4 ${customization.border_radius} flex items-center gap-2 ${animationClass}`}
                    style={{ 
                      backgroundColor: paymentMethod === "card" ? customization.primary_color : customization.background_color,
                      color: paymentMethod === "card" ? customization.background_color : customization.text_color,
                      border: `1px solid ${customization.primary_color}20`
                    }}
                  >
                    <CreditCard className="h-5 w-5" />
                    Card
                  </button>
                  {feeSettings.cash_payment_enabled && (
                    <button
                      onClick={() => setPaymentMethod("cash")}
                      className={`flex-1 p-4 ${customization.border_radius} flex items-center gap-2 ${animationClass}`}
                      style={{ 
                        backgroundColor: paymentMethod === "cash" ? customization.primary_color : customization.background_color,
                        color: paymentMethod === "cash" ? customization.background_color : customization.text_color,
                        border: `1px solid ${customization.primary_color}20`
                      }}
                    >
                      <Truck className="h-5 w-5" />
                      Cash
                    </button>
                  )}
                </div>
              </div>

              {/* Order Summary */}
              <div className={`p-6 ${customization.border_radius}`} style={{ backgroundColor: customization.secondary_color }}>
                <h2 className="text-xl font-semibold mb-4">Order Summary</h2>
                <div className="space-y-2 mb-4">
                  {cart.map((item) => (
                    <div key={item.product.id} className="flex justify-between text-sm">
                      <span>{item.product.title} x{item.quantity}</span>
                      <span>{formatPrice(item.product.price * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 mt-2" style={{ borderColor: `${customization.primary_color}20` }}>
                    <div className="flex justify-between">
                      <span style={{ color: customization.accent_color }}>Subtotal</span>
                      <span>{formatPrice(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: customization.accent_color }}>Delivery</span>
                      <span>{formatPrice(deliveryFee)}</span>
                    </div>
                    {paymentFee > 0 && (
                      <div className="flex justify-between">
                        <span style={{ color: customization.accent_color }}>Payment Fee</span>
                        <span>{formatPrice(paymentFee)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="border-t pt-4 mb-6" style={{ borderColor: `${customization.primary_color}20` }}>
                  <div className="flex justify-between text-xl font-bold">
                    <span>Total</span>
                    <span style={{ color: customization.primary_color }}>{formatPrice(orderTotal)}</span>
                  </div>
                </div>
                <button
                  onClick={handleCheckout}
                  className={`w-full py-4 ${getButtonStyles('primary')}`}
                >
                  {paymentMethod === 'card' ? 'Pay Now' : 'Place Order'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default EnhancedElementarTemplate;
