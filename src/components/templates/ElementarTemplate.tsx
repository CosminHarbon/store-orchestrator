import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Plus, Minus, X, Package, Truck, CreditCard, ArrowLeft, MapPin, Home as HomeIcon } from "lucide-react";
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
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 10000]);
  const [sortBy, setSortBy] = useState<"default" | "price-low" | "price-high" | "name">("default");

  // Carrier ID mapping
  const carrierIdMap: { [key: string]: number } = {
    "sameday": 6,
    "fan": 3,
    "gls": 4,
    "dpd": 2,
    "cargus": 1
  };

  // Checkout form state
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

  // Get Supabase URL from environment or construct it
  const SUPABASE_URL = "https://uffmgvdtkoxkjolfrhab.supabase.co";
  const API_BASE = `${SUPABASE_URL}/functions/v1/store-api`;

  // Fetch Mapbox token
  useEffect(() => {
    const fetchMapboxToken = async () => {
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/store-api/config`, {
          headers: {
            'X-API-Key': apiKey,
          },
        });
        const data = await response.json();
        if (data.mapbox_token) {
          setMapboxToken(data.mapbox_token);
        }
      } catch (error) {
        console.error('Failed to fetch Mapbox token:', error);
      }
    };
    fetchMapboxToken();
  }, [apiKey]);

  useEffect(() => {
    fetchData();
  }, [apiKey]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const headers = { "X-API-Key": apiKey };

      console.log("Fetching store data from:", API_BASE);
      console.log("Using API key:", apiKey.substring(0, 10) + "...");

      const [productsRes, collectionsRes] = await Promise.all([
        fetch(`${API_BASE}/products`, { headers }),
        fetch(`${API_BASE}/collections`, { headers }),
      ]);

      console.log("Products response status:", productsRes.status);
      console.log("Collections response status:", collectionsRes.status);

      if (productsRes.ok) {
        const productsData = await productsRes.json();
        console.log("Raw products response:", productsData);
        
        // Handle both array and object responses
        const productsArray = Array.isArray(productsData) ? productsData : (productsData.products || []);
        console.log("Products loaded:", productsArray.length);
        
        // Map products to match our interface
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
        const errorText = await productsRes.text();
        console.error("Products fetch failed:", errorText);
        toast.error(`Failed to load products: ${productsRes.status}`);
        setProducts([]);
      }

      if (collectionsRes.ok) {
        const collectionsData = await collectionsRes.json();
        console.log("Raw collections response:", collectionsData);
        
        // Handle both array and object responses
        const collectionsArray = Array.isArray(collectionsData) ? collectionsData : (collectionsData.collections || []);
        console.log("Collections loaded:", collectionsArray.length);
        
        setCollections(collectionsArray);
      } else {
        const errorText = await collectionsRes.text();
        console.error("Collections fetch failed:", errorText);
        setCollections([]);
      }
    } catch (error) {
      console.error("Error loading store data:", error);
      toast.error("Failed to load store data: " + (error as Error).message);
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
        toast.success("Added to cart");
      } else {
        toast.error("Not enough stock");
      }
    } else {
      setCart([...cart, { product, quantity: 1 }]);
      toast.success("Added to cart");
    }
  };

  const updateCartQuantity = (productId: string, delta: number) => {
    setCart(cart.map((item) => {
      if (item.product.id === productId) {
        const newQuantity = item.quantity + delta;
        if (newQuantity <= 0) return item;
        if (newQuantity > item.product.stock) {
          toast.error("Not enough stock");
          return item;
        }
        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((item) => item.product.id !== productId));
    toast.success("Removed from cart");
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleCheckout = async () => {
    if (!checkoutForm.name || !checkoutForm.email) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (checkoutForm.delivery_type === "home" && (!checkoutForm.city || !checkoutForm.county)) {
      toast.error("Please provide delivery address");
      return;
    }

    if (checkoutForm.delivery_type === "locker" && !checkoutForm.locker_id) {
      toast.error("Please select a locker");
      return;
    }

    try {
      const orderData = {
        customer_name: checkoutForm.name,
        customer_email: checkoutForm.email,
        customer_phone: checkoutForm.phone,
        customer_address: checkoutForm.delivery_type === "home" 
          ? `${checkoutForm.street} ${checkoutForm.street_number}, ${checkoutForm.city}, ${checkoutForm.county}`
          : checkoutForm.locker_address,
        customer_city: checkoutForm.city,
        customer_county: checkoutForm.county,
        customer_street: checkoutForm.street,
        customer_street_number: checkoutForm.street_number,
        customer_block: checkoutForm.block,
        customer_apartment: checkoutForm.apartment,
        delivery_type: checkoutForm.delivery_type,
        selected_carrier_code: checkoutForm.selected_carrier_code,
        locker_id: checkoutForm.locker_id,
        locker_name: checkoutForm.locker_name,
        locker_address: checkoutForm.locker_address,
        items: cart.map((item) => ({
          product_id: item.product.id,
          title: item.product.title,
          quantity: item.quantity,
          price: item.product.price,
        })),
        total: cartTotal,
      };

      const response = await fetch(`${API_BASE}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) throw new Error("Failed to create order");

      const { order, payment_url } = await response.json();
      
      // Redirect to payment
      if (payment_url) {
        window.location.href = payment_url;
      } else {
        toast.success("Order created successfully!");
        setCart([]);
        setView("home");
      }
    } catch (error) {
      toast.error("Failed to create order");
    }
  };

  // Advanced product filtering and sorting
  const filteredProducts = products.filter((p) => {
    // Collection filter
    if (selectedCollection && p.category !== selectedCollection) return false;
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return p.title.toLowerCase().includes(query) || 
             p.description.toLowerCase().includes(query);
    }
    
    return true;
  });

  // Sorting
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case "price-low": return a.price - b.price;
      case "price-high": return b.price - a.price;
      case "name": return a.title.localeCompare(b.title);
      default: return 0;
    }
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground">Loading store...</p>
        </div>
      </div>
    );
  }

  // Home View
  if (view === "home") {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gradient">ELEMENTAR</h1>
            <Button
              variant="outline"
              size="sm"
              className="relative"
              onClick={() => setView("cart")}
            >
              <ShoppingCart className="h-5 w-5" />
              {cartItemCount > 0 && (
                <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0">
                  {cartItemCount}
                </Badge>
              )}
            </Button>
          </div>
        </header>

        {/* Hero Section */}
        <section className="relative py-24 px-4 bg-gradient-to-br from-primary/20 via-primary/10 to-background overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1441986300917-64674bd600d8')] bg-cover bg-center opacity-10" />
          <div className="container mx-auto text-center relative z-10">
            <h2 className="text-5xl md:text-6xl font-bold mb-6 animate-fade-in">Welcome to ELEMENTAR</h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto animate-fade-in">
              Discover our curated collection of premium products
            </p>
            <Button
              size="lg"
              onClick={() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" })}
              className="animate-scale-in shadow-lg hover:shadow-xl transition-shadow"
            >
              Shop Now
            </Button>
          </div>
        </section>

        {/* Collections */}
        {collections.length > 0 && (
          <section className="py-12 px-4">
            <div className="container mx-auto">
              <h3 className="text-2xl font-bold mb-6">Collections</h3>
              <div className="flex gap-3 overflow-x-auto pb-4 hide-scrollbar">
                <Button
                  variant={selectedCollection === null ? "default" : "outline"}
                  onClick={() => setSelectedCollection(null)}
                >
                  All Products
                </Button>
                {collections.map((collection) => (
                  <Button
                    key={collection.id}
                    variant={selectedCollection === collection.name ? "default" : "outline"}
                    onClick={() => setSelectedCollection(collection.name)}
                  >
                    {collection.name}
                  </Button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Products Grid */}
        <section id="products" className="py-12 px-4 bg-muted/30">
          <div className="container mx-auto">
            {/* Search and Sort Controls */}
            <div className="mb-8 flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background cursor-pointer"
              >
                <option value="default">Sort By: Default</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="name">Name: A-Z</option>
              </select>
            </div>

            {/* Results Info */}
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-2xl font-bold">
                {selectedCollection || "All Products"}
              </h3>
              <span className="text-sm text-muted-foreground">
                {sortedProducts.length} product{sortedProducts.length !== 1 ? 's' : ''} found
              </span>
            </div>

            {/* Products Grid */}
            {sortedProducts.length === 0 ? (
              <div className="text-center py-16">
                <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No products found matching your search</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {sortedProducts.map((product) => (
                <Card
                  key={product.id}
                  className="group hover:shadow-elegant transition-all duration-300 cursor-pointer overflow-hidden"
                  onClick={() => {
                    setSelectedProduct(product);
                    setView("product");
                  }}
                >
                  <div className="aspect-square overflow-hidden bg-muted">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="h-16 w-16 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h4 className="font-semibold mb-2 line-clamp-1">{product.title}</h4>
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {product.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-primary">
                        {formatPrice(product.price)}
                      </span>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(product);
                        }}
                        disabled={product.stock === 0}
                      >
                        {product.stock === 0 ? "Out of Stock" : "Add to Cart"}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  // Product Detail View
  if (view === "product" && selectedProduct) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setView("home")}>
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="relative"
              onClick={() => setView("cart")}
            >
              <ShoppingCart className="h-5 w-5" />
              {cartItemCount > 0 && (
                <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0">
                  {cartItemCount}
                </Badge>
              )}
            </Button>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="aspect-square bg-muted rounded-xl overflow-hidden">
              {selectedProduct.image ? (
                <img
                  src={selectedProduct.image}
                  alt={selectedProduct.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="h-32 w-32 text-muted-foreground" />
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div>
                <h1 className="text-4xl font-bold mb-2">{selectedProduct.title}</h1>
                {selectedProduct.category && (
                  <Badge variant="secondary">{selectedProduct.category}</Badge>
                )}
              </div>

              <p className="text-lg text-muted-foreground">{selectedProduct.description}</p>

              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-primary">
                  {formatPrice(selectedProduct.price)}
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Package className="h-4 w-4" />
                <span>
                  {selectedProduct.stock > 0
                    ? `${selectedProduct.stock} in stock`
                    : "Out of stock"}
                </span>
              </div>

              <Button
                size="lg"
                className="w-full"
                onClick={() => addToCart(selectedProduct)}
                disabled={selectedProduct.stock === 0}
              >
                <ShoppingCart className="h-5 w-5 mr-2" />
                {selectedProduct.stock === 0 ? "Out of Stock" : "Add to Cart"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Cart View
  if (view === "cart") {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setView("home")}>
              <ArrowLeft className="h-5 w-5 mr-2" />
              Continue Shopping
            </Button>
            <h1 className="text-xl font-bold">Shopping Cart</h1>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8">
          {cart.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Your cart is empty</h3>
              <p className="text-muted-foreground mb-6">Add some products to get started</p>
              <Button onClick={() => setView("home")}>Shop Now</Button>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                {cart.map((item) => (
                  <Card key={item.product.id} className="p-4">
                    <div className="flex gap-4">
                      <div className="w-24 h-24 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                        {item.product.image ? (
                          <img
                            src={item.product.image}
                            alt={item.product.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="h-8 w-8 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1">
                        <h4 className="font-semibold mb-1">{item.product.title}</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          {formatPrice(item.product.price)}
                        </p>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateCartQuantity(item.product.id, -1)}
                            disabled={item.quantity === 1}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-12 text-center font-medium">{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateCartQuantity(item.product.id, 1)}
                            disabled={item.quantity >= item.product.stock}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex flex-col items-end justify-between">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFromCart(item.product.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <span className="font-bold">
                          {formatPrice(item.product.price * item.quantity)}
                        </span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <div>
                <Card className="p-6 sticky top-24">
                  <h3 className="text-xl font-bold mb-4">Order Summary</h3>
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-medium">{formatPrice(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Shipping</span>
                      <span className="font-medium">Calculated at checkout</span>
                    </div>
                  </div>
                  <div className="border-t pt-4 mb-6">
                    <div className="flex justify-between text-lg font-bold">
                      <span>Total</span>
                      <span className="text-primary">{formatPrice(cartTotal)}</span>
                    </div>
                  </div>
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => setView("checkout")}
                  >
                    Proceed to Checkout
                  </Button>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Checkout View
  if (view === "checkout") {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setView("cart")}>
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back to Cart
            </Button>
            <h1 className="text-xl font-bold">Checkout</h1>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {/* Contact Information */}
              <Card className="p-6">
                <h3 className="text-lg font-bold mb-4">Contact Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Full Name *</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2 border rounded-lg"
                      value={checkoutForm.name}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Email *</label>
                    <input
                      type="email"
                      className="w-full px-4 py-2 border rounded-lg"
                      value={checkoutForm.email}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Phone</label>
                    <input
                      type="tel"
                      className="w-full px-4 py-2 border rounded-lg"
                      value={checkoutForm.phone}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, phone: e.target.value })}
                    />
                  </div>
                </div>
              </Card>

              {/* Delivery Type */}
              <Card className="p-6">
                <h3 className="text-lg font-bold mb-4">Delivery Method</h3>
                <div className="space-y-3">
                  <Button
                    variant={checkoutForm.delivery_type === "home" ? "default" : "outline"}
                    className="w-full justify-start h-auto py-4"
                    onClick={() => setCheckoutForm({ ...checkoutForm, delivery_type: "home" })}
                  >
                    <HomeIcon className="h-5 w-5 mr-3" />
                    <div className="text-left">
                      <div className="font-medium">Home Delivery</div>
                      <div className="text-xs opacity-80">Deliver to your address</div>
                    </div>
                  </Button>
                  <Button
                    variant={checkoutForm.delivery_type === "locker" ? "default" : "outline"}
                    className="w-full justify-start h-auto py-4"
                    onClick={() => setCheckoutForm({ ...checkoutForm, delivery_type: "locker" })}
                  >
                    <MapPin className="h-5 w-5 mr-3" />
                    <div className="text-left">
                      <div className="font-medium">Locker Delivery</div>
                      <div className="text-xs opacity-80">Pick up from a locker point</div>
                    </div>
                  </Button>
                </div>
              </Card>

              {/* Delivery Address / Locker Selection */}
              <Card className="p-6">
                <h3 className="text-lg font-bold mb-4">
                  {checkoutForm.delivery_type === "home" ? "Delivery Address" : "Locker Selection"}
                </h3>
                
                {checkoutForm.delivery_type === "home" ? (
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">County *</label>
                        <input
                          type="text"
                          className="w-full px-4 py-2 border rounded-lg"
                          value={checkoutForm.county}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, county: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">City *</label>
                        <input
                          type="text"
                          className="w-full px-4 py-2 border rounded-lg"
                          value={checkoutForm.city}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, city: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium mb-2">Street</label>
                        <input
                          type="text"
                          className="w-full px-4 py-2 border rounded-lg"
                          value={checkoutForm.street}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, street: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Number</label>
                        <input
                          type="text"
                          className="w-full px-4 py-2 border rounded-lg"
                          value={checkoutForm.street_number}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, street_number: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Block</label>
                        <input
                          type="text"
                          className="w-full px-4 py-2 border rounded-lg"
                          value={checkoutForm.block}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, block: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Apartment</label>
                        <input
                          type="text"
                          className="w-full px-4 py-2 border rounded-lg"
                          value={checkoutForm.apartment}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, apartment: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Select Carrier</label>
                      <select
                        className="w-full px-4 py-2 border rounded-lg"
                        value={checkoutForm.selected_carrier_code}
                        onChange={(e) => setCheckoutForm({ ...checkoutForm, selected_carrier_code: e.target.value })}
                      >
                        <option value="">Choose a carrier...</option>
                        <option value="cargus">Cargus</option>
                        <option value="dpd">DPD</option>
                        <option value="fan">FAN Courier</option>
                        <option value="gls">GLS</option>
                        <option value="sameday">Sameday</option>
                      </select>
                    </div>
                    
                    {checkoutForm.selected_carrier_code && mapboxToken ? (
                      <LockerMapSelector
                        carrierId={carrierIdMap[checkoutForm.selected_carrier_code]}
                        carrierCode={checkoutForm.selected_carrier_code}
                        carrierName={checkoutForm.selected_carrier_code.toUpperCase()}
                        apiKey={apiKey}
                        mapboxToken={mapboxToken}
                        onLockerSelect={(locker) => {
                          setCheckoutForm({
                            ...checkoutForm,
                            locker_id: locker.id,
                            locker_name: locker.name,
                            locker_address: locker.address
                          });
                        }}
                      />
                    ) : checkoutForm.selected_carrier_code && !mapboxToken ? (
                      <div className="bg-muted/50 p-4 rounded-lg">
                        <p className="text-sm text-muted-foreground">
                          Loading map...
                        </p>
                      </div>
                    ) : (
                      <div className="bg-muted/50 p-4 rounded-lg">
                        <p className="text-sm text-muted-foreground">
                          Please select a carrier to view available lockers
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>

            {/* Order Summary */}
            <div>
              <Card className="p-6 sticky top-24">
                <h3 className="text-xl font-bold mb-4">Order Summary</h3>
                <div className="space-y-3 mb-4">
                  {cart.map((item) => (
                    <div key={item.product.id} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {item.product.title} × {item.quantity}
                      </span>
                      <span className="font-medium">
                        {formatPrice(item.product.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t pt-4 mb-6">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span className="text-primary">{formatPrice(cartTotal)}</span>
                  </div>
                </div>
                <Button
                  size="lg"
                  className="w-full"
                  onClick={handleCheckout}
                >
                  <CreditCard className="h-5 w-5 mr-2" />
                  Complete Order
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-4">
                  You'll be redirected to a secure payment page
                </p>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default ElementarTemplate;
