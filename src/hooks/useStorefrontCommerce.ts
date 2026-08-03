import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { applyStorefrontLanguage } from '@/i18n/LanguageProvider';
import {
  STORE_API_BASE,
  fetchStoreCollections,
  fetchStoreConfig,
  fetchStoreProducts,
  fetchStoreReviews,
  storeApiHeaders,
} from '@/lib/storefront/api';
import type {
  CartItem,
  CheckoutFormState,
  StorefrontCollection,
  StorefrontCustomization,
  StorefrontFeeSettings,
  StorefrontProduct,
  StorefrontReview,
  StorefrontView,
} from '@/lib/storefront/types';
import { emptyCheckoutForm } from '@/lib/storefront/types';
import { useAbandonedCartAutosave } from '@/hooks/useAbandonedCartAutosave';

const RECENT_KEY = 'premium_recently_viewed';

export function useStorefrontCommerce(apiKey: string) {
  const { t } = useTranslation('checkout');
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [collections, setCollections] = useState<StorefrontCollection[]>([]);
  const [reviews, setReviews] = useState<StorefrontReview[]>([]);
  const [mapboxToken, setMapboxToken] = useState('');
  const [fees, setFees] = useState<StorefrontFeeSettings>({
    cash_payment_enabled: true,
    cash_payment_fee: 0,
    home_delivery_fee: 0,
    locker_delivery_fee: 0,
    card_enabled: true,
  });
  const [customization, setCustomization] = useState<StorefrontCustomization>({
    store_name: 'Store',
    logo_url: null,
    hero_image_url: null,
    hero_title: 'Welcome',
    hero_subtitle: 'Discover our collection',
    hero_button_text: 'Shop now',
    show_reviews: true,
    footer_text: 'All rights reserved.',
  });

  const [view, setView] = useState<StorefrontView>('home');
  const [selectedProduct, setSelectedProduct] = useState<StorefrontProduct | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutForm, setCheckoutForm] = useState<CheckoutFormState>(emptyCheckoutForm);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('card');
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${RECENT_KEY}_${apiKey}`);
      if (raw) setRecentIds(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [apiKey]);

  const trackRecent = useCallback(
    (productId: string) => {
      setRecentIds((prev) => {
        const next = [productId, ...prev.filter((id) => id !== productId)].slice(0, 8);
        try {
          localStorage.setItem(`${RECENT_KEY}_${apiKey}`, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [apiKey]
  );

  const checkPaymentStatus = useCallback(
    async (refId: string) => {
      setLoading(true);
      try {
        await new Promise((r) => setTimeout(r, 2500));
        let attempts = 0;
        while (attempts < 8) {
          const statusResponse = await fetch(
            `${STORE_API_BASE}/payment-status?checkout_session_id=${refId}&payment_id=${refId}`,
            { headers: storeApiHeaders(apiKey) }
          );
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (
              statusData.payment_status === 'completed' ||
              statusData.payment_status === 'paid'
            ) {
              setCart([]);
              setView('home');
              setCartOpen(false);
              toast.success(t('toast.paymentSuccess'));
              return;
            }
          } else {
            const response = await fetch(`${STORE_API_BASE}/orders?order_id=${refId}`, {
              headers: storeApiHeaders(apiKey),
            });
            if (response.ok) {
              const data = await response.json();
              if (data.order?.payment_status === 'paid') {
                setCart([]);
                setView('home');
                setCartOpen(false);
                toast.success(t('toast.paymentSuccess'));
                return;
              }
            }
          }
          await new Promise((r) => setTimeout(r, 2000));
          attempts++;
        }
        toast.info(t('toast.paymentVerifyShort'));
        setView('home');
      } catch {
        toast.error(t('toast.paymentVerifyCharged'));
        setView('home');
      } finally {
        setLoading(false);
      }
    },
    [apiKey, t]
  );

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
      void checkPaymentStatus(checkoutSessionId || orderId!);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [cfg, prods, colsPayload, revs] = await Promise.all([
          fetchStoreConfig(apiKey),
          fetchStoreProducts(apiKey),
          fetchStoreCollections(apiKey),
          fetchStoreReviews(apiKey).catch(() => [] as StorefrontReview[]),
        ]);
        if (cancelled) return;
        void applyStorefrontLanguage(cfg.preferredLanguage);
        setMapboxToken(cfg.mapboxToken);
        setFees(cfg.fees);
        setCustomization(cfg.customization);
        const enriched = prods.map((p) => ({
          ...p,
          collection_ids: colsPayload.productCollectionMap[p.id] || p.collection_ids || [],
        }));
        setProducts(enriched);
        setCollections(colsPayload.collections);
        setReviews(revs);
        if (!cfg.fees.card_enabled && cfg.fees.cash_payment_enabled) {
          setPaymentMethod('cash');
        }
      } catch (e) {
        console.error(e);
        toast.error(t('toast.loadStoreFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiKey, checkPaymentStatus, t]);

  const addToCart = useCallback((product: StorefrontProduct, qty = 1) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        const nextQty = existing.quantity + qty;
        if (nextQty > product.stock) {
          toast.error(t('toast.maxStock', { stock: product.stock }));
          return prev;
        }
        toast.success(t('toast.updatedInCart', { title: product.title }));
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: nextQty } : i
        );
      }
      if (product.stock <= 0) {
        toast.error(t('toast.outOfStock'));
        return prev;
      }
      toast.success(t('toast.added', { title: product.title }));
      return [...prev, { product, quantity: Math.min(qty, product.stock) }];
    });
    setCartOpen(true);
  }, [t]);

  const updateQty = useCallback((productId: string, quantity: number) => {
    setCart((prev) => {
      const item = prev.find((i) => i.product.id === productId);
      if (!item) return prev;
      if (quantity <= 0) return prev.filter((i) => i.product.id !== productId);
      if (quantity > item.product.stock) {
        toast.error(t('toast.maxStock', { stock: item.product.stock }));
        return prev;
      }
      return prev.map((i) => (i.product.id === productId ? { ...i, quantity } : i));
    });
  }, [t]);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => {
      const item = prev.find((i) => i.product.id === productId);
      if (item) toast.success(t('toast.removed', { title: item.product.title }));
      return prev.filter((i) => i.product.id !== productId);
    });
  }, [t]);

  const openProduct = useCallback(
    (product: StorefrontProduct) => {
      setSelectedProduct(product);
      setView('product');
      trackRecent(product.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [trackRecent]
  );

  const openCatalog = useCallback((collectionId?: string | null) => {
    setSelectedCollectionId(collectionId || null);
    setView('catalog');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const cartSubtotal = useMemo(
    () => cart.reduce((s, i) => s + i.product.price * i.quantity, 0),
    [cart]
  );
  const deliveryFee =
    checkoutForm.delivery_type === 'home' ? fees.home_delivery_fee : fees.locker_delivery_fee;
  const paymentFee =
    paymentMethod === 'cash' && fees.cash_payment_enabled ? fees.cash_payment_fee : 0;
  const orderTotal = cartSubtotal + deliveryFee + paymentFee;
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const abandonedItems = useMemo(
    () =>
      cart.map((i) => ({
        product_id: i.product.id,
        title: i.product.title,
        price: i.product.price,
        quantity: i.quantity,
      })),
    [cart]
  );

  const abandonedView =
    view === 'checkout' ? 'checkout' : view === 'product' ? 'product' : cartOpen ? 'cart' : 'home';

  const { getSessionToken, markConvertedLocally } = useAbandonedCartAutosave({
    apiBase: STORE_API_BASE,
    apiKey,
    enabled: true,
    view: abandonedView,
    paymentMethod,
    checkoutForm,
    items: abandonedItems,
    cartSubtotal,
    estimatedTotal: orderTotal,
  });

  const placeOrder = useCallback(async () => {
    if (!checkoutForm.name || !checkoutForm.email) {
      toast.error(t('toast.fillRequired'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checkoutForm.email)) {
      toast.error(t('toast.invalidEmail'));
      return;
    }
    if (checkoutForm.delivery_type === 'home') {
      if (!checkoutForm.city || !checkoutForm.county || !checkoutForm.street) {
        toast.error(t('toast.fillAddress'));
        return;
      }
    } else if (!checkoutForm.selected_carrier_code || !checkoutForm.locker_id) {
      toast.error(t('toast.selectLocker'));
      return;
    }
    if (!cart.length) {
      toast.error(t('toast.cartEmpty'));
      return;
    }

    setPlacingOrder(true);
    try {
      const orderData = {
        customer_name: checkoutForm.name,
        customer_email: checkoutForm.email,
        customer_phone: checkoutForm.phone || null,
        customer_address:
          checkoutForm.delivery_type === 'home'
            ? `${checkoutForm.street} ${checkoutForm.street_number}${
                checkoutForm.block ? `, Block ${checkoutForm.block}` : ''
              }${checkoutForm.apartment ? `, Apt ${checkoutForm.apartment}` : ''}, ${checkoutForm.city}, ${checkoutForm.county}`
            : [checkoutForm.locker_name, checkoutForm.locker_address, checkoutForm.city, checkoutForm.county]
                .filter(Boolean)
                .join(', '),
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
        session_token: getSessionToken() || undefined,
        items: cart.map((item) => ({
          product_id: item.product.id,
          title: item.product.title,
          price: item.product.price,
          quantity: item.quantity,
        })),
      };

      const response = await fetch(`${STORE_API_BASE}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...storeApiHeaders(apiKey) },
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
            ? t('toast.orderSuccessLocker')
            : t('toast.orderSuccessCash')
        );
        setCart([]);
        setCartOpen(false);
        setView('home');
        setCheckoutForm(emptyCheckoutForm());
        setCheckoutStep(1);
      } else {
        toast.error(result.error || t('toast.createOrderFailed'));
      }
    } catch (e) {
      console.error(e);
      toast.error(t('toast.createOrderRetry'));
    } finally {
      setPlacingOrder(false);
    }
  }, [
    apiKey,
    cart,
    checkoutForm,
    getSessionToken,
    markConvertedLocally,
    orderTotal,
    paymentMethod,
    t,
  ]);

  const newestProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
  }, [products]);

  const bestSellers = useMemo(() => {
    // No sales metric on storefront API — prefer discounted / in-stock, else newest
    const discounted = products.filter((p) => p.has_discount && p.stock > 0);
    if (discounted.length >= 4) return discounted.slice(0, 8);
    return newestProducts.filter((p) => p.stock > 0).slice(0, 8);
  }, [products, newestProducts]);

  const recentProducts = useMemo(
    () =>
      recentIds
        .map((id) => products.find((p) => p.id === id))
        .filter(Boolean) as StorefrontProduct[],
    [recentIds, products]
  );

  return {
    apiKey,
    loading,
    products,
    collections,
    reviews,
    mapboxToken,
    fees,
    customization,
    view,
    setView,
    selectedProduct,
    setSelectedProduct,
    selectedCollectionId,
    setSelectedCollectionId,
    cartOpen,
    setCartOpen,
    cart,
    cartCount,
    cartSubtotal,
    deliveryFee,
    paymentFee,
    orderTotal,
    addToCart,
    updateQty,
    removeFromCart,
    openProduct,
    openCatalog,
    checkoutForm,
    setCheckoutForm,
    paymentMethod,
    setPaymentMethod,
    checkoutStep,
    setCheckoutStep,
    placeOrder,
    placingOrder,
    bestSellers,
    newestProducts,
    recentProducts,
  };
}

export type StorefrontCommerce = ReturnType<typeof useStorefrontCommerce>;
