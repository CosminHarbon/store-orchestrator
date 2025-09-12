interface Discount {
  id: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
}

interface ProductDiscount {
  product_id: string;
  discount_id: string;
}

export interface PriceInfo {
  originalPrice: number;
  discountedPrice: number | null;
  hasDiscount: boolean;
  discountPercentage?: number;
  savingsAmount?: number;
}

export const calculateProductPrice = (
  productId: string,
  originalPrice: number,
  discounts: Discount[],
  productDiscounts: ProductDiscount[]
): PriceInfo => {
  // Find active discounts for this product
  const productDiscountIds = productDiscounts
    .filter(pd => pd.product_id === productId)
    .map(pd => pd.discount_id);

  if (productDiscountIds.length === 0) {
    return {
      originalPrice,
      discountedPrice: null,
      hasDiscount: false
    };
  }

  // Find the best (highest discount) active discount
  const activeDiscounts = discounts.filter(discount => {
    const isInList = productDiscountIds.includes(discount.id);
    const isActive = discount.is_active;
    const isInDateRange = new Date(discount.start_date) <= new Date() && 
      (!discount.end_date || new Date(discount.end_date) >= new Date());
    
    return isInList && isActive && isInDateRange;
  });

  if (activeDiscounts.length === 0) {
    return {
      originalPrice,
      discountedPrice: null,
      hasDiscount: false
    };
  }

  // Calculate discount amounts and find the best one
  let bestDiscount = 0;
  let bestDiscountType: 'percentage' | 'fixed_amount' = 'percentage';

  activeDiscounts.forEach(discount => {
    let discountAmount = 0;
    
    if (discount.discount_type === 'percentage') {
      discountAmount = originalPrice * (discount.discount_value / 100);
    } else {
      discountAmount = Math.min(discount.discount_value, originalPrice);
    }

    if (discountAmount > bestDiscount) {
      bestDiscount = discountAmount;
      bestDiscountType = discount.discount_type;
    }
  });

  const discountedPrice = Math.max(0, originalPrice - bestDiscount);
  const discountPercentage = (bestDiscount / originalPrice) * 100;

  return {
    originalPrice,
    discountedPrice,
    hasDiscount: true,
    discountPercentage,
    savingsAmount: bestDiscount
  };
};

export const formatPrice = (price: number): string => {
  return `${price.toFixed(2)} RON`;
};

export const formatDiscount = (discountPercentage: number): string => {
  return `${Math.round(discountPercentage)}% OFF`;
};