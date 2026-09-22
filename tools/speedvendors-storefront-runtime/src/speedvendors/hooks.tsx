// PROTECTED: React bindings for the commerce interface. Cursor may not edit this file.
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { SpeedVendorsCommerce } from './commerce';
import type { Cart, Category, Merchant, Product, ProductQuery } from './types';

const CommerceContext = createContext<SpeedVendorsCommerce | null>(null);

export function CommerceProvider({ commerce, children }: { commerce: SpeedVendorsCommerce; children: ReactNode }) {
  return <CommerceContext.Provider value={commerce}>{children}</CommerceContext.Provider>;
}

export function useCommerce(): SpeedVendorsCommerce {
  const c = useContext(CommerceContext);
  if (!c) throw new Error('useCommerce must be used inside <CommerceProvider>');
  return c;
}

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
}

function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ data: s.data, loading: true }));
    load().then((data) => {
      if (!cancelled) setState({ data, loading: false });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function useMerchant(): AsyncState<Merchant> {
  const c = useCommerce();
  return useAsync(() => c.getMerchant(), [c]);
}

export function useCategories(): AsyncState<Category[]> {
  const c = useCommerce();
  return useAsync(() => c.listCategories(), [c]);
}

export function useProducts(query?: ProductQuery): AsyncState<Product[]> {
  const c = useCommerce();
  return useAsync(() => c.listProducts(query), [c, query?.categoryId, query?.search]);
}

export function useProduct(productId: string | null): AsyncState<Product | null> {
  const c = useCommerce();
  return useAsync(() => (productId ? c.getProduct(productId) : Promise.resolve(null)), [c, productId]);
}

export function useCart() {
  const c = useCommerce();
  const cart: Cart = useSyncExternalStore(
    useCallback((cb: () => void) => c.cart.subscribe(cb), [c]),
    () => c.cart.get(),
  );
  return {
    cart,
    addItem: c.cart.addItem,
    updateQuantity: c.cart.updateQuantity,
    removeItem: c.cart.removeItem,
    clear: c.cart.clear,
  };
}

export function useCheckout() {
  const c = useCommerce();
  return { submit: c.checkout.submit };
}
