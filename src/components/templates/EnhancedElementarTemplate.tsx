import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
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
import { Skeleton } from "@/components/ui/skeleton";
import LiveTemplateEditor from "./LiveTemplateEditor";
import BlockRenderer from "./BlockRenderer";
import type { TemplateBlock } from "./BlockEditor";
import { parseBuilderConfig } from "@/components/website-builder/types";
import { supabase } from "@/integrations/supabase/client";
import { useAbandonedCartAutosave } from "@/hooks/useAbandonedCartAutosave";
import { useTheme } from "next-themes";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { StorefrontReviewForm } from "@/components/templates/StorefrontReviewForm";
import { fetchStoreReviews } from "@/lib/storefront/api";
import type { StorefrontReview } from "@/lib/storefront/types";
import { LockerPicker } from "@/components/lockers/LockerPicker";
import { AddressLocalityFields } from "@/components/address/AddressLocalityFields";
import { CheckoutNotesField, CheckoutBillingFields, DeliveryQuoteDetails, deliveryQuoteSummary } from "@/components/storefront/CheckoutExtras";
import { applyStorefrontLanguage } from "@/i18n/LanguageProvider";
import { getDemoCatalog } from "@/lib/storefront/demoCatalog";
import { fetchDeliveryQuote } from "@/lib/storefront/api";
import { isBillingComplete, resolvedBilling } from "@/lib/storefront/billing";
import type { DeliveryQuote, StorefrontDeliveryConfig } from "@/lib/storefront/types";
import { isAppLanguage, type AppLanguage } from "@/i18n/types";
import { StorefrontDemoBanner } from "@/components/templates/StorefrontDemoBanner";
import { StorefrontLanguageToggle } from "@/components/templates/StorefrontLanguageToggle";

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  image: string;
  stock: number;
  category: string;
  collection_ids?: string[];
  show_stock_to_customers?: boolean;
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
  show_reviews?: boolean;
  builder_config?: unknown;
}

interface EnhancedElementarTemplateProps {
  apiKey: string;
  editMode?: boolean;
  demo?: boolean;
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
  show_reviews: true,
};

const EnhancedElementarTemplate = ({ apiKey, editMode = false, demo = false }: EnhancedElementarTemplateProps) => {
  const { t, i18n } = useTranslation(["checkout", "storefront"]);
  const lang: AppLanguage = isAppLanguage(i18n.language) ? i18n.language : "en";
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [reviews, setReviews] = useState<StorefrontReview[]>([]);
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
  const [blocks, setBlocks] = useState<TemplateBlock[]>([]);
  const [feeSettings, setFeeSettings] = useState({
    cash_payment_enabled: true,
    cash_payment_fee: 0,
    home_delivery_fee: 0,
    locker_delivery_fee: 0,
    card_enabled: true,
  });
  const [allowOrderNotes, setAllowOrderNotes] = useState(true);
  const [deliveryConfig, setDeliveryConfig] = useState<StorefrontDeliveryConfig>({
    custom_pricing_enabled: false,
    locker_enabled: true,
    coverage_mode: 'romania',
    covered_counties: [],
    covered_localities: [],
  });
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);
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
    notes: "",
    billing_same_as_delivery: true,
    billing_city: "",
    billing_county: "",
    billing_street: "",
    billing_street_number: "",
    billing_block: "",
    billing_apartment: "",
  });

  const SUPABASE_URL = "https://mkkqbekhvcnwcheegjpy.supabase.co";
  const API_BASE = `${SUPABASE_URL}/functions/v1/store-api`;

  const { resolvedTheme } = useTheme();

  // Soft dark remapping when merchant still uses default light palette
  const colors = useMemo(() => {
    if (resolvedTheme !== 'dark') return customization;
    const bg = (customization.background_color || '').toUpperCase();
    if (bg !== '#FFFFFF' && bg !== '#FFF') return customization;
    return {
      ...customization,
      background_color: '#0B0F14',
      text_color: (customization.text_color || '').toUpperCase() === '#000000' ? '#F3F4F6' : customization.text_color,
      secondary_color: '#161B22',
      accent_color: '#9CA3AF',
      primary_color: (customization.primary_color || '').toUpperCase() === '#000000' ? '#A78BFA' : customization.primary_color,
    };
  }, [customization, resolvedTheme]);

  // Dynamic CSS variables based on customization
  const cssVariables = useMemo(() => ({
    '--template-primary': colors.primary_color,
    '--template-background': colors.background_color,
    '--template-text': colors.text_color,
    '--template-accent': colors.accent_color,
    '--template-secondary': colors.secondary_color,
    '--template-font': colors.font_family,
    '--template-heading-font': colors.heading_font,
  } as React.CSSProperties), [colors]);

  // Animation classes based on style
  const animationClass = useMemo(() => {
    switch (colors.animation_style) {
      case 'dynamic': return 'transition-all duration-500 ease-out';
      case 'minimal': return 'transition-all duration-200';
      case 'none': return '';
      default: return 'transition-all duration-300 ease-in-out';
    }
  }, [colors.animation_style]);

  // Fetch blocks from database
  const fetchBlocks = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('template_blocks')
        .select('*')
        .eq('user_id', userId)
        .eq('template_id', 'elementar')
        .order('block_order', { ascending: true });
      
      if (error) throw error;
      if (data) {
        setBlocks(data.map(block => ({
          ...block,
          content: block.content as any
        })));
      }
    } catch (error) {
      console.error('Failed to fetch blocks:', error);
    }
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment_status');
    const orderId = urlParams.get('order_id');
    const checkoutSessionId = urlParams.get('checkout_session_id');

    if (paymentStatus === 'checking' && (checkoutSessionId || orderId)) {
      const apiKeyParam = urlParams.get('api_key');
      const clean = apiKeyParam
        ? `${window.location.pathname}?api_key=${apiKeyParam}`
        : window.location.pathname;
      window.history.replaceState({}, document.title, clean);
      checkPaymentStatus(checkoutSessionId || orderId!);
      return;
    }

    if (demo) {
      const catalog = getDemoCatalog('elementar', lang);
      setMapboxToken(catalog.mapboxToken);
      setCustomization((prev) => ({ ...prev, ...catalog.customization }));
      setFeeSettings({
        cash_payment_enabled: catalog.fees.cash_payment_enabled,
        cash_payment_fee: catalog.fees.cash_payment_fee,
        home_delivery_fee: catalog.fees.home_delivery_fee,
        locker_delivery_fee: catalog.fees.locker_delivery_fee,
        card_enabled: catalog.fees.card_enabled !== false,
      });
      setProducts(
        catalog.products.map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          price: p.price,
          image: p.image,
          stock: p.stock,
          category: p.category,
          collection_ids: p.collection_ids,
          show_stock_to_customers: p.show_stock_to_customers !== false,
        }))
      );
      const collectionMap: Record<string, string[]> = {};
      catalog.products.forEach((p) => {
        collectionMap[p.id] = p.collection_ids;
      });
      setProductCollections(collectionMap);
      setCollections(
        catalog.collections.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description || '',
          image_url: c.image_url || '',
        }))
      );
      setReviews(catalog.reviews);
      setLoading(false);
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
          setCustomization(prev => ({ ...prev, ...data.customization }));
          // Fetch blocks for this user
          if (data.user_id) {
            fetchBlocks(data.user_id);
          }
        }
        void applyStorefrontLanguage(data.preferred_language);
        if (data.cash_payment_enabled !== undefined || data.payment) {
          const cardEnabled = data.payment?.card_enabled !== false;
          const cashEnabled = data.payment?.cash_enabled ?? data.cash_payment_enabled ?? true;
          setFeeSettings({
            cash_payment_enabled: cashEnabled,
            cash_payment_fee: data.cash_payment_fee || data.payment?.cash_fee || 0,
            home_delivery_fee: data.home_delivery_fee || data.delivery?.home_fee || 0,
            locker_delivery_fee: data.locker_delivery_fee || data.delivery?.locker_fee || 0,
            card_enabled: cardEnabled,
          });
          if (!cardEnabled && cashEnabled) {
            setPaymentMethod('cash');
          }
        }
        setAllowOrderNotes(data.allow_order_notes !== false);
        setDeliveryConfig({
          custom_pricing_enabled: !!data.delivery?.custom_pricing_enabled,
          locker_enabled: data.delivery?.locker_enabled !== false,
          coverage_mode: data.delivery?.coverage_mode || 'romania',
          covered_counties: data.delivery?.covered_counties || [],
          covered_localities: data.delivery?.covered_localities || [],
        });
      } catch (error) {
        console.error('Failed to fetch config:', error);
      }
    };
    fetchConfig();
    fetchData();
  }, [apiKey, demo, lang]);

  const checkPaymentStatus = async (refId: string) => {
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      let attempts = 0;
      const maxAttempts = 8;

      while (attempts < maxAttempts) {
        const statusResponse = await fetch(
          `${API_BASE}/payment-status?checkout_session_id=${refId}&payment_id=${refId}`,
          { headers: { 'X-API-Key': apiKey } }
        );

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          if (statusData.payment_status === 'completed' || statusData.payment_status === 'paid') {
            setCart([]);
            setView('home');
            toast.success(t("toast.paymentSuccess"));
            setLoading(false);
            return;
          }
        } else {
          const response = await fetch(`${API_BASE}/orders?order_id=${refId}`, {
            headers: { 'X-API-Key': apiKey },
          });
          if (response.ok) {
            const data = await response.json();
            if (data.order?.payment_status === 'paid') {
              setCart([]);
              setView('home');
              toast.success(t("toast.paymentSuccess"));
              setLoading(false);
              return;
            }
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
        attempts++;
      }

      toast.info(t("toast.paymentVerifyShort"));
      setView('home');
    } catch (error) {
      console.error('Error checking payment:', error);
      toast.error(t("toast.paymentVerifyCharged"));
      setView('home');
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const headers = { "X-API-Key": apiKey };

      const [productsRes, collectionsRes, reviewsList] = await Promise.all([
        fetch(`${API_BASE}/products`, { headers }),
        fetch(`${API_BASE}/collections`, { headers }),
        fetchStoreReviews(apiKey).catch(() => [] as StorefrontReview[]),
      ]);

      setReviews(reviewsList);

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
          show_stock_to_customers: p.show_stock_to_customers !== false,
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
      toast.error(t("toast.loadStoreFailed"));
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
        toast.success(t("toast.addedAnother", { title: product.title }));
      } else {
        toast.error(t("toast.maxStock", { stock: product.stock }));
      }
    } else {
      if (product.stock > 0) {
        setCart([...cart, { product, quantity: 1 }]);
        toast.success(t("toast.added", { title: product.title }));
      } else {
        toast.error(t("toast.outOfStock"));
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
      toast.error(t("toast.maxStock", { stock: item.product.stock }));
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
      toast.success(t("toast.removed", { title: item.product.title }));
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
  const customHomePricing =
    deliveryConfig.custom_pricing_enabled && checkoutForm.delivery_type === 'home';
  const deliveryFee = customHomePricing
    ? deliveryQuote?.available
      ? Number(deliveryQuote.delivery_fee || 0)
      : 0
    : checkoutForm.delivery_type === 'home' ? feeSettings.home_delivery_fee : feeSettings.locker_delivery_fee;
  const paymentFee = paymentMethod === 'cash' && feeSettings.cash_payment_enabled ? feeSettings.cash_payment_fee : 0;
  const orderTotal = cartTotal + deliveryFee + paymentFee;
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    if (demo || !deliveryConfig.custom_pricing_enabled || checkoutForm.delivery_type !== 'home') {
      setDeliveryQuote(null);
      setDeliveryQuoteLoading(false);
      return;
    }
    const ready =
      !!checkoutForm.county &&
      !!checkoutForm.city &&
      !!checkoutForm.street &&
      !!checkoutForm.street_number &&
      cart.length > 0;
    if (!ready) {
      setDeliveryQuote(null);
      return;
    }
    let cancelled = false;
    setDeliveryQuoteLoading(true);
    const timer = window.setTimeout(() => {
      void fetchDeliveryQuote(apiKey, {
        county: checkoutForm.county,
        city: checkoutForm.city,
        street: checkoutForm.street,
        street_number: checkoutForm.street_number,
        items: cart.map((item) => ({ quantity: item.quantity, price: item.product.price })),
      })
        .then((quote) => {
          if (!cancelled) setDeliveryQuote(quote);
        })
        .catch(() => {
          if (!cancelled) {
            setDeliveryQuote({ enabled: true, available: false, error: 'DISTANCE_UNAVAILABLE' });
          }
        })
        .finally(() => {
          if (!cancelled) setDeliveryQuoteLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    apiKey,
    cart,
    checkoutForm.city,
    checkoutForm.county,
    checkoutForm.delivery_type,
    checkoutForm.street,
    checkoutForm.street_number,
    demo,
    deliveryConfig.custom_pricing_enabled,
  ]);

  const abandonedCartItems = useMemo(
    () =>
      cart.map((item) => ({
        product_id: item.product.id,
        title: item.product.title,
        price: item.product.price,
        quantity: item.quantity,
      })),
    [cart]
  );

  const homepageSections = useMemo(
    () => parseBuilderConfig(customization.builder_config, blocks, customization),
    [blocks, customization]
  );

  const renderBlocksBetween = (afterType: string, beforeType: string) => {
    const start = homepageSections.findIndex((section) => section.type === afterType);
    const end = homepageSections.findIndex((section) => section.type === beforeType);
    if (start < 0 || end < 0 || end <= start) return null;
    return homepageSections.slice(start + 1, end).flatMap((section) => {
      if (section.type !== 'block' || !section.visible || !section.blockId) return [];
      const block = blocks.find((item) => item.id === section.blockId);
      if (!block) return [];
      return [
        <BlockRenderer
          key={block.id}
          block={{ ...block, is_visible: true }}
          customization={customization}
        />,
      ];
    });
  };

  const sectionVisible = (type: 'hero' | 'collections' | 'products' | 'reviews') =>
    homepageSections.find((section) => section.type === type)?.visible !== false;

  const { getSessionToken, markConvertedLocally } = useAbandonedCartAutosave({
    apiBase: API_BASE,
    apiKey,
    enabled: !editMode && !demo,
    view,
    paymentMethod,
    checkoutForm,
    items: abandonedCartItems,
    cartSubtotal: cartTotal,
    estimatedTotal: orderTotal,
  });

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
    if (demo) {
      toast.info(t("storefront:demo.orderBlocked"));
      return;
    }
    if (!checkoutForm.name || !checkoutForm.email) {
      toast.error(t("toast.fillRequired"));
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(checkoutForm.email)) {
      toast.error(t("toast.invalidEmail"));
      return;
    }

    if (checkoutForm.delivery_type === "home") {
      if (!checkoutForm.city || !checkoutForm.county || !checkoutForm.street) {
        toast.error(t("toast.fillAddress"));
        return;
      }
      if (customHomePricing && (deliveryQuoteLoading || !deliveryQuote?.available)) {
        toast.error(deliveryQuote?.error_message || t("delivery.unavailable"));
        return;
      }
    } else {
      if (!checkoutForm.selected_carrier_code || !checkoutForm.locker_id) {
        toast.error(t("toast.selectLocker"));
        return;
      }
    }
    if (!isBillingComplete(checkoutForm)) {
      toast.error(t("toast.billingRequired"));
      return;
    }

    try {
      const orderData = {
        customer_name: checkoutForm.name,
        customer_email: checkoutForm.email,
        customer_phone: checkoutForm.phone || null,
        customer_address: checkoutForm.delivery_type === "home"
          ? `${checkoutForm.street} ${checkoutForm.street_number}${checkoutForm.block ? `, Block ${checkoutForm.block}` : ""}${checkoutForm.apartment ? `, Apt ${checkoutForm.apartment}` : ""}, ${checkoutForm.city}, ${checkoutForm.county}`
          : [checkoutForm.locker_name, checkoutForm.locker_address, checkoutForm.city, checkoutForm.county]
              .filter(Boolean)
              .join(", "),
        customer_city: checkoutForm.city,
        customer_county: checkoutForm.county,
        customer_street: checkoutForm.street,
        customer_street_number: checkoutForm.street_number,
        customer_block: checkoutForm.block || null,
        customer_apartment: checkoutForm.apartment || null,
        ...resolvedBilling(checkoutForm),
        delivery_type: checkoutForm.delivery_type,
        selected_carrier_code: checkoutForm.selected_carrier_code || null,
        locker_id: checkoutForm.locker_id || null,
        locker_name: checkoutForm.locker_name || null,
        locker_address: checkoutForm.locker_address || null,
        total: orderTotal,
        payment_method: paymentMethod,
        customer_notes: checkoutForm.notes || null,
        session_token: getSessionToken() || undefined,
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
        markConvertedLocally();
        window.location.href = result.payment_url;
      } else if (response.ok && paymentMethod === 'cash') {
        markConvertedLocally();
        toast.success(
          checkoutForm.delivery_type === 'locker'
            ? t("toast.orderSuccessLocker")
            : t("toast.orderSuccessCash")
        );
        setCart([]);
        setView("home");
      } else {
        toast.error(result.error || t("toast.createOrderFailed"));
      }
    } catch (error) {
      console.error("Error creating order:", error);
      toast.error(t("toast.createOrderRetry"));
    }
  };

  // Get button styles based on configuration
  const getButtonStyles = (variant: 'primary' | 'secondary' = 'primary') => {
    const base = `${colors.border_radius} font-medium ${animationClass}`;
    
    if (variant === 'primary') {
      switch (colors.button_style) {
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
    switch (colors.navbar_style) {
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
          backgroundColor: colors.background_color,
          fontFamily: colors.font_family
        }}
      >
        <div className="flex flex-col items-center gap-4">
          <Package className="h-16 w-16 animate-spin" style={{ color: colors.primary_color }} />
          <p className="text-sm font-light animate-pulse" style={{ color: colors.text_color }}>
            Loading your experience...
          </p>
        </div>
      </div>
    );
  }

  const Header = () => (
    <header 
      className={`sticky top-0 z-50 ${getNavbarStyles()} ${animationClass}`}
      style={{ borderColor: `${colors.primary_color}20` }}
    >
      {demo && (
        <StorefrontDemoBanner
          className="border-b"
          style={
            {
              borderColor: `${colors.primary_color}20`,
              backgroundColor: colors.secondary_color,
              color: colors.text_color,
            } as React.CSSProperties
          }
        />
      )}
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <button className="p-2 hover:opacity-70 rounded-lg" style={{ color: colors.text_color }}>
            <Menu className="h-5 w-5" />
          </button>

          <button 
            onClick={() => { setView("home"); setSelectedCollection(null); }}
            className={`absolute left-1/2 transform -translate-x-1/2 flex items-center gap-2 ${animationClass} hover:scale-105`}
          >
            {colors.logo_url ? (
              <img src={colors.logo_url} alt={colors.store_name} className="h-8 w-auto" />
            ) : (
              <span 
                className="text-xl font-light tracking-widest"
                style={{ color: colors.primary_color, fontFamily: colors.heading_font }}
              >
                {colors.store_name}
              </span>
            )}
          </button>

          <div className="flex items-center gap-2">
            <StorefrontLanguageToggle
              compact
              className="border"
              style={
                {
                  borderColor: `${colors.primary_color}30`,
                  color: colors.text_color,
                } as React.CSSProperties
              }
            />
            <ThemeToggle />
            {editMode && (
              <button
                onClick={() => setShowEditor(!showEditor)}
                className={`p-2 ${colors.border_radius} ${animationClass}`}
                style={{ 
                  backgroundColor: showEditor ? colors.primary_color : 'transparent',
                  color: showEditor ? colors.background_color : colors.text_color
                }}
              >
                <Edit3 className="h-5 w-5" />
              </button>
            )}
            
            <button
              onClick={() => setView("cart")}
              className={`relative p-2 ${animationClass} hover:opacity-70`}
              style={{ color: colors.text_color }}
            >
              <ShoppingCart className="h-5 w-5" />
              {cartItemCount > 0 && (
                <span 
                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center text-xs font-medium animate-pulse"
                  style={{ backgroundColor: colors.primary_color, color: colors.background_color }}
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
    const productReviews = reviews.filter((r) => r.product_id === product.id);
    const avgRating =
      productReviews.length > 0
        ? productReviews.reduce((s, r) => s + r.rating, 0) / productReviews.length
        : 0;
    
    return (
      <div
        className={`group cursor-pointer ${animationClass}`}
        style={{ animationDelay: `${index * 0.05}s` }}
        onClick={() => { setSelectedProduct(product); setView("product"); }}
      >
        <div 
          className={`relative ${colors.border_radius} overflow-hidden ${animationClass}`}
          style={{ 
            backgroundColor: colors.secondary_color,
            border: `1px solid ${colors.primary_color}20`
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
            className={`absolute top-3 right-3 p-2 ${colors.border_radius} ${animationClass}`}
            style={{ 
              backgroundColor: `${colors.background_color}90`,
              color: isWishlisted ? '#ef4444' : colors.text_color
            }}
          >
            <Heart className={`h-4 w-4 ${isWishlisted ? 'fill-current' : ''}`} />
          </button>
          
          {/* Quick add button */}
          <button
            onClick={(e) => { e.stopPropagation(); addToCart(product); }}
            className={`absolute bottom-3 right-3 p-2 ${colors.border_radius} ${animationClass} opacity-0 group-hover:opacity-100`}
            style={{ backgroundColor: colors.primary_color, color: colors.background_color }}
          >
            <Plus className="h-4 w-4" />
          </button>
          
          <div className="p-4 space-y-2">
            <h3 
              className="font-semibold text-sm line-clamp-2"
              style={{ color: colors.text_color, fontFamily: colors.heading_font }}
            >
              {product.title}
            </h3>

            {customization.show_reviews !== false && productReviews.length > 0 && (
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-3 w-3 ${i < Math.round(avgRating) ? 'fill-amber-400 text-amber-400' : 'opacity-25'}`}
                  />
                ))}
                <span className="text-[11px] ml-1" style={{ color: colors.accent_color }}>
                  ({productReviews.length})
                </span>
              </div>
            )}
            
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold" style={{ color: colors.primary_color }}>
                {formatPrice(product.price)}
              </p>
              
              {product.stock > 0 ? (
                <span 
                  className={`text-xs px-2 py-1 ${colors.border_radius}`}
                  style={{ backgroundColor: colors.secondary_color, color: colors.accent_color }}
                >
                  {product.show_stock_to_customers === false
                    ? t("product.inStock")
                    : product.stock < 5
                      ? `Only ${product.stock} left`
                      : 'In Stock'}
                </span>
              ) : (
                <span 
                  className={`text-xs px-2 py-1 ${colors.border_radius}`}
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
        backgroundColor: colors.background_color,
        color: colors.text_color,
        fontFamily: colors.font_family
      }}
    >
      {/* Live Editor Panel */}
      <LiveTemplateEditor
        isOpen={showEditor}
        onClose={() => setShowEditor(false)}
        customization={customization}
        onCustomizationChange={setCustomization}
        blocks={blocks}
        onBlocksChange={setBlocks}
      />

      {view === "home" && (
        <>
          <Header />
          {renderBlocksBetween('header', 'hero')}
          
          {/* Hero Section */}
          {sectionVisible('hero') && colors.show_hero_section && (
            <section 
              className="relative min-h-[80vh] flex items-center justify-center overflow-hidden"
              style={{
                backgroundImage: colors.hero_image_url ? `url(${colors.hero_image_url})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {/* Gradient Overlay */}
              {colors.gradient_enabled && (
                <>
                  <div 
                    className="absolute inset-0 bg-gradient-to-br opacity-90"
                    style={{
                      background: colors.hero_image_url 
                        ? `linear-gradient(to bottom, ${colors.background_color}80, ${colors.background_color})`
                        : `linear-gradient(135deg, ${colors.background_color}, ${colors.secondary_color})`
                    }}
                  />
                  <div 
                    className="absolute top-20 left-10 w-72 h-72 rounded-full blur-3xl animate-pulse"
                    style={{ backgroundColor: `${colors.primary_color}30` }}
                  />
                  <div 
                    className="absolute bottom-20 right-10 w-96 h-96 rounded-full blur-3xl animate-pulse"
                    style={{ backgroundColor: `${colors.accent_color}20`, animationDelay: '0.7s' }}
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
                    className={`inline-flex items-center gap-2 px-4 py-2 ${colors.border_radius} backdrop-blur-sm mb-4`}
                    style={{ 
                      backgroundColor: `${colors.primary_color}10`,
                      border: `1px solid ${colors.primary_color}20`
                    }}
                  >
                    <Sparkles className="h-4 w-4 animate-pulse" style={{ color: colors.primary_color }} />
                    <span className="text-sm font-medium" style={{ color: colors.primary_color }}>
                      New Collection Available
                    </span>
                  </div>
                  
                  <h1 
                    className={`text-5xl md:text-7xl font-bold leading-tight ${animationClass}`}
                    style={{ 
                      fontFamily: colors.heading_font,
                      color: colors.text_color
                    }}
                  >
                    {colors.hero_title}
                  </h1>
                  
                  <p 
                    className="text-xl md:text-2xl font-light max-w-2xl mx-auto"
                    style={{ color: colors.accent_color }}
                  >
                    {colors.hero_subtitle}
                  </p>
                  
                  <div className="flex flex-wrap gap-4 justify-center">
                    <button
                      onClick={() => {
                        const productsSection = document.getElementById('products-section');
                        productsSection?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className={`px-8 py-4 ${getButtonStyles('primary')} flex items-center gap-2`}
                    >
                      {colors.hero_button_text}
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

          {renderBlocksBetween('hero', 'collections')}

          {/* Collections Section */}
          {collections.length > 0 && sectionVisible('collections') && colors.show_collection_images && (
            <section className="py-24">
              <div className="container mx-auto px-4">
                <div className="text-center mb-16 space-y-4">
                  <h2 
                    className="text-4xl font-bold tracking-tight"
                    style={{ fontFamily: colors.heading_font }}
                  >
                    Explore Collections
                  </h2>
                  <p style={{ color: colors.accent_color }}>Curated selections for every style</p>
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
                      className={`group relative aspect-square overflow-hidden ${colors.border_radius} ${animationClass}`}
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <img
                        src={collection.image_url || "/placeholder.svg"}
                        alt={collection.name}
                        className={`w-full h-full object-cover ${animationClass} group-hover:scale-110`}
                      />
                      <div 
                        className="absolute inset-0 opacity-80 group-hover:opacity-90 transition-opacity"
                        style={{ background: `linear-gradient(to top, ${colors.primary_color}cc, transparent)` }}
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

          {renderBlocksBetween('collections', 'products')}

          {/* Products Section */}
          {sectionVisible('products') && (
          <section id="products-section" className="py-24">
            <div className="container mx-auto px-4">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-12">
                <h2 
                  className="text-4xl font-bold tracking-tight"
                  style={{ fontFamily: colors.heading_font }}
                >
                  Featured Products
                </h2>
                
                <div className="flex items-center gap-4">
                  {/* View Toggle */}
                  <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: colors.secondary_color }}>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-2 ${colors.border_radius} ${animationClass}`}
                      style={{ 
                        backgroundColor: viewMode === 'grid' ? colors.primary_color : 'transparent',
                        color: viewMode === 'grid' ? colors.background_color : colors.text_color
                      }}
                    >
                      <Grid3X3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2 ${colors.border_radius} ${animationClass}`}
                      style={{ 
                        backgroundColor: viewMode === 'list' ? colors.primary_color : 'transparent',
                        color: viewMode === 'list' ? colors.background_color : colors.text_color
                      }}
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                  
                  {/* Sort */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className={`px-4 py-2 ${colors.border_radius} text-sm font-medium ${animationClass}`}
                    style={{ 
                      backgroundColor: colors.secondary_color,
                      color: colors.text_color,
                      border: `1px solid ${colors.primary_color}20`
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
                  <Package className="h-16 w-16 mx-auto mb-4 opacity-50" style={{ color: colors.accent_color }} />
                  <p className="text-lg" style={{ color: colors.accent_color }}>No products found</p>
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
          )}

          {renderBlocksBetween('products', 'reviews')}

          {/* Customer Reviews */}
          {sectionVisible('reviews') && customization.show_reviews !== false && reviews.length > 0 && (
            <section className="py-24" style={{ backgroundColor: colors.secondary_color }}>
              <div className="container mx-auto px-4">
                <div className="text-center mb-12 space-y-3">
                  <h2
                    className="text-4xl font-bold tracking-tight"
                    style={{ fontFamily: colors.heading_font }}
                  >
                    What customers say
                  </h2>
                  <p style={{ color: colors.accent_color }}>
                    Real reviews from people who shopped here
                  </p>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {reviews.slice(0, 6).map((r) => (
                    <blockquote
                      key={r.id}
                      className={`p-6 ${colors.border_radius} ${animationClass}`}
                      style={{
                        backgroundColor: colors.background_color,
                        border: `1px solid ${colors.primary_color}15`,
                      }}
                    >
                      <div className="flex gap-0.5 mb-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-3.5 w-3.5 ${i < r.rating ? 'fill-amber-400 text-amber-400' : 'opacity-25'}`}
                          />
                        ))}
                      </div>
                      <p className="text-sm leading-relaxed min-h-[3rem]" style={{ color: colors.text_color }}>
                        {r.comment || 'Great experience shopping here.'}
                      </p>
                      {r.merchant_reply && (
                        <p className="mt-3 text-xs border-l-2 pl-3" style={{ borderColor: colors.primary_color, color: colors.accent_color }}>
                          Store: {r.merchant_reply}
                        </p>
                      )}
                      <footer className="mt-4 text-xs font-medium" style={{ color: colors.accent_color }}>
                        {r.customer_name}
                      </footer>
                    </blockquote>
                  ))}
                </div>
              </div>
            </section>
          )}

          {renderBlocksBetween('reviews', 'footer')}

          {/* Footer */}
          <footer 
            className="py-16 border-t"
            style={{ borderColor: `${colors.primary_color}20`, backgroundColor: colors.secondary_color }}
          >
            <div className="container mx-auto px-4 text-center">
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Sparkles className="h-5 w-5 animate-pulse" style={{ color: colors.primary_color }} />
                  <span className="text-xl font-bold tracking-wider">{colors.store_name}</span>
                  <Sparkles className="h-5 w-5 animate-pulse" style={{ color: colors.primary_color }} />
                </div>
                <p className="text-sm" style={{ color: colors.accent_color }}>
                  © {new Date().getFullYear()} {colors.store_name}. {colors.footer_text}
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
              className={`inline-flex items-center gap-2 mb-8 px-4 py-2 ${colors.border_radius} ${animationClass}`}
              style={{ backgroundColor: colors.secondary_color }}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to products
            </button>

            <div className="grid md:grid-cols-2 gap-12 items-start">
              <div className={`${colors.border_radius} overflow-hidden`} style={{ backgroundColor: colors.secondary_color }}>
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
                    style={{ fontFamily: colors.heading_font }}
                  >
                    {selectedProduct.title}
                  </h1>
                  <p className="text-3xl font-bold" style={{ color: colors.primary_color }}>
                    {formatPrice(selectedProduct.price)}
                  </p>
                </div>
                
                {selectedProduct.description && (
                  <p className="text-lg leading-relaxed" style={{ color: colors.accent_color }}>
                    {selectedProduct.description}
                  </p>
                )}

                <div className="flex items-center gap-3">
                  {selectedProduct.stock > 0 ? (
                    <span 
                      className={`text-sm px-3 py-1 ${colors.border_radius}`}
                      style={{ backgroundColor: colors.secondary_color }}
                    >
                      {selectedProduct.show_stock_to_customers === false
                        ? `✓ ${t("product.inStock")}`
                        : `✓ ${selectedProduct.stock} in stock`}
                    </span>
                  ) : (
                    <span 
                      className={`text-sm px-3 py-1 ${colors.border_radius}`}
                      style={{ backgroundColor: '#ef444420', color: '#ef4444' }}
                    >
                      Out of stock
                    </span>
                  )}
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => toggleWishlist(selectedProduct.id)}
                    className={`p-4 ${colors.border_radius} ${animationClass}`}
                    style={{ 
                      backgroundColor: colors.secondary_color,
                      color: wishlist.includes(selectedProduct.id) ? '#ef4444' : colors.text_color
                    }}
                  >
                    <Heart className={`h-6 w-6 ${wishlist.includes(selectedProduct.id) ? 'fill-current' : ''}`} />
                  </button>
                  
                  <button
                    onClick={() => { addToCart(selectedProduct); setView("cart"); }}
                    disabled={selectedProduct.stock === 0}
                    className={`flex-1 py-4 ${getButtonStyles('primary')} flex items-center justify-center gap-2 disabled:opacity-50`}
                  >
                    {selectedProduct.stock === 0 ? t("action.outOfStock") : t("action.addToCart")}
                    {selectedProduct.stock > 0 && <ShoppingCart className="h-5 w-5" />}
                  </button>
                </div>

                {customization.show_reviews !== false && (() => {
                  const productReviews = reviews.filter((r) => r.product_id === selectedProduct.id);
                  const avg =
                    productReviews.length > 0
                      ? productReviews.reduce((s, r) => s + r.rating, 0) / productReviews.length
                      : 0;
                  return (
                    <div className="space-y-4 pt-6 border-t" style={{ borderColor: `${colors.accent_color}33` }}>
                      <div className="flex items-end justify-between gap-3">
                        <h3 className="text-xl font-semibold" style={{ fontFamily: colors.heading_font }}>
                          Reviews
                        </h3>
                        {productReviews.length > 0 && (
                          <p className="text-sm tabular-nums" style={{ color: colors.accent_color }}>
                            {avg.toFixed(1)} · {productReviews.length} review{productReviews.length === 1 ? '' : 's'}
                          </p>
                        )}
                      </div>
                      {productReviews.length === 0 ? (
                        <p className="text-sm" style={{ color: colors.accent_color }}>
                          No reviews yet — be the first.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {productReviews.slice(0, 8).map((r) => (
                            <div key={r.id} className="space-y-1">
                              <div className="flex items-center gap-1">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <Star
                                    key={i}
                                    className={`h-3.5 w-3.5 ${i < r.rating ? 'fill-amber-400 text-amber-400' : 'opacity-30'}`}
                                  />
                                ))}
                                <span className="ml-2 text-sm font-medium">{r.customer_name}</span>
                              </div>
                              {r.comment && (
                                <p className="text-sm" style={{ color: colors.accent_color }}>{r.comment}</p>
                              )}
                              {r.merchant_reply && (
                                <div
                                  className="ml-2 pl-3 border-l text-sm"
                                  style={{ borderColor: `${colors.accent_color}44`, color: colors.accent_color }}
                                >
                                  <span className="text-xs font-medium" style={{ color: colors.text_color }}>
                                    Store reply
                                  </span>
                                  <p className="mt-0.5">{r.merchant_reply}</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <StorefrontReviewForm
                        apiKey={apiKey}
                        productId={selectedProduct.id}
                        productTitle={selectedProduct.title}
                        className="bg-transparent"
                      />
                    </div>
                  );
                })()}
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
              style={{ fontFamily: colors.heading_font }}
            >
              <ShoppingCart className="h-10 w-10" style={{ color: colors.primary_color }} />
              {t("cart.title")}
            </h1>

            {cart.length === 0 ? (
              <div className="text-center py-20">
                <ShoppingCart className="h-16 w-16 mx-auto mb-4 opacity-50" style={{ color: colors.accent_color }} />
                <p className="text-xl mb-4" style={{ color: colors.accent_color }}>{t("cart.empty")}</p>
                <button
                  onClick={() => setView("home")}
                  className={`px-6 py-3 ${getButtonStyles('primary')}`}
                >
                  {t("action.shopNow")}
                </button>
              </div>
            ) : (
              <div className="grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-4">
                  {cart.map((item) => (
                    <div 
                      key={item.product.id}
                      className={`flex gap-4 p-4 ${colors.border_radius}`}
                      style={{ backgroundColor: colors.secondary_color }}
                    >
                      <img
                        src={item.product.image || "/placeholder.svg"}
                        alt={item.product.title}
                        className={`w-24 h-24 object-cover ${colors.border_radius}`}
                      />
                      <div className="flex-1">
                        <h3 className="font-semibold">{item.product.title}</h3>
                        <p style={{ color: colors.primary_color }}>{formatPrice(item.product.price)}</p>
                        
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                            className={`p-1 ${colors.border_radius}`}
                            style={{ backgroundColor: colors.background_color }}
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-8 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                            className={`p-1 ${colors.border_radius}`}
                            style={{ backgroundColor: colors.background_color }}
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
                  className={`p-6 ${colors.border_radius} h-fit sticky top-24`}
                  style={{ backgroundColor: colors.secondary_color }}
                >
                  <h3 className="font-semibold text-lg mb-4">{t("summary.title")}</h3>
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between">
                      <span style={{ color: colors.accent_color }}>{t("summary.subtotal")}</span>
                      <span>{formatPrice(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: colors.accent_color }}>{t("summary.delivery")}</span>
                      <span>{formatPrice(deliveryFee)}</span>
                    </div>
                    {customHomePricing && deliveryQuote?.available && (
                      <p className="text-xs" style={{ color: colors.accent_color }}>
                        {deliveryQuoteSummary(deliveryQuote, t)}
                      </p>
                    )}
                  </div>
                  <div className="border-t pt-4 mb-6" style={{ borderColor: `${colors.primary_color}20` }}>
                    <div className="flex justify-between text-lg font-semibold">
                      <span>{t("summary.total")}</span>
                      <span style={{ color: colors.primary_color }}>{formatPrice(orderTotal)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setView("checkout")}
                    className={`w-full py-4 ${getButtonStyles('primary')}`}
                  >
                    {t("action.proceedCheckout")}
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
              className={`inline-flex items-center gap-2 mb-8 px-4 py-2 ${colors.border_radius}`}
              style={{ backgroundColor: colors.secondary_color }}
            >
              <ArrowLeft className="h-4 w-4" />
              {t("backToCart")}
            </button>

            <h1 
              className="text-4xl font-bold mb-12"
              style={{ fontFamily: colors.heading_font }}
            >
              {t("title")}
            </h1>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Contact Info */}
              <div className={`p-6 ${colors.border_radius}`} style={{ backgroundColor: colors.secondary_color }}>
                <h2 className="text-xl font-semibold mb-4">{t("contactInfo")}</h2>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder={t("placeholder.fullName")}
                    value={checkoutForm.name}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, name: e.target.value })}
                    className={`w-full p-3 ${colors.border_radius}`}
                    style={{ backgroundColor: colors.background_color, border: `1px solid ${colors.primary_color}20` }}
                  />
                  <input
                    type="email"
                    placeholder={t("placeholder.email")}
                    value={checkoutForm.email}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, email: e.target.value })}
                    className={`w-full p-3 ${colors.border_radius}`}
                    style={{ backgroundColor: colors.background_color, border: `1px solid ${colors.primary_color}20` }}
                  />
                  <input
                    type="tel"
                    placeholder={t("placeholder.phone")}
                    value={checkoutForm.phone}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, phone: e.target.value })}
                    className={`w-full p-3 ${colors.border_radius}`}
                    style={{ backgroundColor: colors.background_color, border: `1px solid ${colors.primary_color}20` }}
                  />
                </div>
              </div>

              {/* Delivery */}
              <div className={`p-6 ${colors.border_radius}`} style={{ backgroundColor: colors.secondary_color }}>
                <h2 className="text-xl font-semibold mb-4">{t("steps.delivery")}</h2>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <button
                      onClick={() => setCheckoutForm({ ...checkoutForm, delivery_type: "home" })}
                      className={`flex-1 p-4 ${colors.border_radius} flex items-center gap-2 ${animationClass}`}
                      style={{ 
                        backgroundColor: checkoutForm.delivery_type === "home" ? colors.primary_color : colors.background_color,
                        color: checkoutForm.delivery_type === "home" ? colors.background_color : colors.text_color,
                        border: `1px solid ${colors.primary_color}20`
                      }}
                    >
                      <HomeIcon className="h-5 w-5" />
                      {t("delivery.home")}
                    </button>
                    {deliveryConfig.locker_enabled !== false && (
                    <button
                      onClick={() => setCheckoutForm({ ...checkoutForm, delivery_type: "locker" })}
                      className={`flex-1 p-4 ${colors.border_radius} flex items-center gap-2 ${animationClass}`}
                      style={{ 
                        backgroundColor: checkoutForm.delivery_type === "locker" ? colors.primary_color : colors.background_color,
                        color: checkoutForm.delivery_type === "locker" ? colors.background_color : colors.text_color,
                        border: `1px solid ${colors.primary_color}20`
                      }}
                    >
                      <MapPin className="h-5 w-5" />
                      {t("delivery.locker")}
                    </button>
                    )}
                  </div>

                  {checkoutForm.delivery_type === "home" && (
                    <div className="space-y-3">
                      <AddressLocalityFields
                        apiKey={apiKey}
                        county={checkoutForm.county}
                        city={checkoutForm.city}
                        allowedCounties={
                          deliveryConfig.custom_pricing_enabled &&
                          deliveryConfig.coverage_mode === 'counties'
                            ? deliveryConfig.covered_counties
                            : deliveryConfig.custom_pricing_enabled &&
                                deliveryConfig.coverage_mode === 'localities'
                              ? deliveryConfig.covered_localities.map((item) => item.county)
                              : undefined
                        }
                        allowedLocalities={
                          deliveryConfig.custom_pricing_enabled &&
                          deliveryConfig.coverage_mode === 'localities'
                            ? deliveryConfig.covered_localities
                            : undefined
                        }
                        onCountyChange={(county) =>
                          setCheckoutForm({ ...checkoutForm, county, city: "" })
                        }
                        onLocalityChange={(loc) =>
                          setCheckoutForm({
                            ...checkoutForm,
                            city: loc.name,
                            county: loc.county || checkoutForm.county,
                          })
                        }
                      />
                      <input
                        placeholder={t("placeholder.street")}
                        value={checkoutForm.street}
                        onChange={(e) => setCheckoutForm({ ...checkoutForm, street: e.target.value })}
                        className={`w-full p-3 ${colors.border_radius}`}
                        style={{ backgroundColor: colors.background_color, border: `1px solid ${colors.primary_color}20` }}
                      />
                      <div className="grid grid-cols-3 gap-3">
                        <input
                          placeholder={t("field.numberShort")}
                          value={checkoutForm.street_number}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, street_number: e.target.value })}
                          className={`p-3 ${colors.border_radius}`}
                          style={{ backgroundColor: colors.background_color, border: `1px solid ${colors.primary_color}20` }}
                        />
                        <input
                          placeholder={t("field.block")}
                          value={checkoutForm.block}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, block: e.target.value })}
                          className={`p-3 ${colors.border_radius}`}
                          style={{ backgroundColor: colors.background_color, border: `1px solid ${colors.primary_color}20` }}
                        />
                        <input
                          placeholder={t("field.apt")}
                          value={checkoutForm.apartment}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, apartment: e.target.value })}
                          className={`p-3 ${colors.border_radius}`}
                          style={{ backgroundColor: colors.background_color, border: `1px solid ${colors.primary_color}20` }}
                        />
                      </div>
                      <DeliveryQuoteDetails
                        quote={deliveryQuote}
                        loading={deliveryQuoteLoading}
                        customEnabled={deliveryConfig.custom_pricing_enabled}
                        deliveryType={checkoutForm.delivery_type}
                      />
                    </div>
                  )}

                  {checkoutForm.delivery_type === "locker" && (
                    <LockerPicker
                      apiKey={apiKey}
                      mapboxToken={mapboxToken || undefined}
                      carrierCode="sameday"
                      carrierName="Sameday"
                      value={{
                        locker_id: checkoutForm.locker_id,
                        locker_name: checkoutForm.locker_name,
                        locker_address: checkoutForm.locker_address,
                        city: checkoutForm.city,
                        county: checkoutForm.county,
                      }}
                      onSelect={(locker) => {
                        setCheckoutForm({
                          ...checkoutForm,
                          delivery_type: "locker",
                          selected_carrier_code: locker.carrier_code || "sameday",
                          locker_id: locker.fixed_location_id,
                          locker_name: locker.locker_name,
                          locker_address: locker.address,
                          city: locker.locality,
                          county: locker.county,
                          street: "",
                          street_number: "",
                          block: "",
                          apartment: "",
                        });
                      }}
                    />
                  )}
                  <CheckoutBillingFields
                    form={checkoutForm}
                    onChange={setCheckoutForm}
                    apiKey={apiKey}
                    inputClassName={`mt-1 w-full p-3 ${colors.border_radius}`}
                  />
                </div>
              </div>

              {allowOrderNotes && (
                <div className={`p-6 ${colors.border_radius}`} style={{ backgroundColor: colors.secondary_color }}>
                  <CheckoutNotesField
                    value={checkoutForm.notes}
                    onChange={(notes) => setCheckoutForm({ ...checkoutForm, notes })}
                    inputClassName={`mt-1 w-full p-3 ${colors.border_radius}`}
                  />
                </div>
              )}

              {/* Payment */}
              <div className={`p-6 ${colors.border_radius}`} style={{ backgroundColor: colors.secondary_color }}>
                <h2 className="text-xl font-semibold mb-4">{t("payment.method")}</h2>
                <div className="flex gap-4">
                  {feeSettings.card_enabled && (
                  <button
                    onClick={() => setPaymentMethod("card")}
                    className={`flex-1 p-4 ${colors.border_radius} flex items-center gap-2 ${animationClass}`}
                    style={{ 
                      backgroundColor: paymentMethod === "card" ? colors.primary_color : colors.background_color,
                      color: paymentMethod === "card" ? colors.background_color : colors.text_color,
                      border: `1px solid ${colors.primary_color}20`
                    }}
                  >
                    <CreditCard className="h-5 w-5" />
                    {t("payment.card")}
                  </button>
                  )}
                  {feeSettings.cash_payment_enabled && (
                    <button
                      onClick={() => setPaymentMethod("cash")}
                      className={`flex-1 p-4 ${colors.border_radius} flex items-center gap-2 ${animationClass}`}
                      style={{ 
                        backgroundColor: paymentMethod === "cash" ? colors.primary_color : colors.background_color,
                        color: paymentMethod === "cash" ? colors.background_color : colors.text_color,
                        border: `1px solid ${colors.primary_color}20`
                      }}
                    >
                      <Truck className="h-5 w-5" />
                      {checkoutForm.delivery_type === "locker" ? t("payment.cardAtLocker") : t("payment.cash")}
                    </button>
                  )}
                </div>
              </div>

              {/* Order Summary */}
              <div className={`p-6 ${colors.border_radius}`} style={{ backgroundColor: colors.secondary_color }}>
                <h2 className="text-xl font-semibold mb-4">{t("summary.title")}</h2>
                <div className="space-y-2 mb-4">
                  {cart.map((item) => (
                    <div key={item.product.id} className="flex justify-between text-sm">
                      <span>{item.product.title} x{item.quantity}</span>
                      <span>{formatPrice(item.product.price * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 mt-2" style={{ borderColor: `${colors.primary_color}20` }}>
                    <div className="flex justify-between">
                      <span style={{ color: colors.accent_color }}>{t("summary.subtotal")}</span>
                      <span>{formatPrice(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: colors.accent_color }}>{t("summary.delivery")}</span>
                      <span>{formatPrice(deliveryFee)}</span>
                    </div>
                    {customHomePricing && deliveryQuote?.available && (
                      <p className="text-xs" style={{ color: colors.accent_color }}>
                        {deliveryQuoteSummary(deliveryQuote, t)}
                      </p>
                    )}
                    {paymentFee > 0 && (
                      <div className="flex justify-between">
                        <span style={{ color: colors.accent_color }}>{t("payment.fee")}</span>
                        <span>{formatPrice(paymentFee)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="border-t pt-4 mb-6" style={{ borderColor: `${colors.primary_color}20` }}>
                  <div className="flex justify-between text-xl font-bold">
                    <span>{t("summary.total")}</span>
                    <span style={{ color: colors.primary_color }}>{formatPrice(orderTotal)}</span>
                  </div>
                </div>
                <button
                  onClick={handleCheckout}
                  disabled={customHomePricing && (deliveryQuoteLoading || !deliveryQuote?.available)}
                  className={`w-full py-4 ${getButtonStyles('primary')} disabled:opacity-50`}
                >
                  {paymentMethod === 'card' ? t("payNow") : t("action.placeOrder")}
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
