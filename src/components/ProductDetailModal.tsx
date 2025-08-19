import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Images, ChevronLeft, ChevronRight, Package, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  image: string;
  category: string;
  stock: number;
  sku: string;
  low_stock_threshold: number;
}

interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  is_primary: boolean;
  display_order: number;
}

interface ProductDetailModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (product: Product) => void;
  onManageImages: (product: Product) => void;
}

export function ProductDetailModal({ 
  product, 
  isOpen, 
  onClose, 
  onEdit, 
  onManageImages 
}: ProductDetailModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const { data: productImages } = useQuery({
    queryKey: ['product-images', product?.id],
    queryFn: async () => {
      if (!product?.id) return [];
      const { data, error } = await supabase
        .from('product_images')
        .select('*')
        .eq('product_id', product.id)
        .order('display_order', { ascending: true });
      
      if (error) throw error;
      return data as ProductImage[];
    },
    enabled: !!product?.id
  });

  if (!product) return null;

  const allImages = productImages && productImages.length > 0 
    ? productImages.map(img => img.image_url)
    : product.image 
      ? [product.image]
      : [];

  const currentImage = allImages[currentImageIndex];

  const nextImage = () => {
    if (allImages.length > 1) {
      setCurrentImageIndex((prev) => (prev + 1) % allImages.length);
    }
  };

  const prevImage = () => {
    if (allImages.length > 1) {
      setCurrentImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
    }
  };

  const getStockStatus = () => {
    if (product.stock === 0) return { text: 'Out of Stock', variant: 'destructive' as const };
    if (product.stock <= product.low_stock_threshold) return { text: 'Low Stock', variant: 'secondary' as const };
    return { text: 'In Stock', variant: 'default' as const };
  };

  const stockStatus = getStockStatus();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] bg-background/95 backdrop-blur-xl border border-border/50 p-0 overflow-hidden">
        {/* Close Button */}
        <Button
          onClick={onClose}
          variant="ghost"
          size="sm"
          className="absolute top-4 right-4 z-10 h-8 w-8 rounded-full bg-background/80 hover:bg-background"
        >
          <X className="h-4 w-4" />
        </Button>

        <div className="flex flex-col md:flex-row h-full">
          {/* Image Section */}
          <div className="flex-1 relative bg-gradient-subtle">
            {currentImage ? (
              <div className="relative h-64 md:h-full flex items-center justify-center p-4 md:p-8">
                <img 
                  src={currentImage} 
                  alt={product.title}
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
                
                {/* Image Navigation */}
                {allImages.length > 1 && (
                  <>
                    <Button
                      onClick={prevImage}
                      variant="secondary"
                      size="sm"
                      className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full h-10 w-10 bg-white/90 hover:bg-white shadow-lg"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      onClick={nextImage}
                      variant="secondary"
                      size="sm"
                      className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full h-10 w-10 bg-white/90 hover:bg-white shadow-lg"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </>
                )}

                {/* Image Dots Indicator */}
                {allImages.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                    {allImages.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentImageIndex(index)}
                        className={`w-2 h-2 rounded-full transition-all duration-200 ${
                          index === currentImageIndex 
                            ? 'bg-primary w-6' 
                            : 'bg-white/50 hover:bg-white/70'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-64 md:h-full flex items-center justify-center">
                <div className="text-center space-y-4">
                  <Package className="h-24 w-24 text-muted-foreground/30 mx-auto" />
                  <p className="text-muted-foreground">No image available</p>
                </div>
              </div>
            )}
          </div>

          {/* Product Details Section */}
          <div className="w-full md:w-96 lg:w-[28rem] bg-background border-t md:border-t-0 md:border-l border-border/50 flex flex-col">
            <div className="flex-1 p-6 md:p-8 overflow-y-auto space-y-6">
              {/* Price */}
              <div className="text-3xl md:text-4xl font-bold text-primary">
                ${product.price.toFixed(2)}
              </div>

              {/* Product Title */}
              <div>
                <h1 className="text-2xl md:text-3xl font-bold leading-tight mb-2">
                  {product.title}
                </h1>
                {product.category && (
                  <p className="text-sm text-muted-foreground uppercase tracking-wider">
                    {product.category}
                  </p>
                )}
              </div>

              {/* Stock Status */}
              <div className="flex items-center gap-3">
                <Badge variant={stockStatus.variant} className="text-sm">
                  {stockStatus.text}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {product.stock} units available
                </span>
              </div>

              {/* SKU */}
              {product.sku && (
                <div className="text-sm">
                  <span className="text-muted-foreground">SKU: </span>
                  <span className="font-mono">{product.sku}</span>
                </div>
              )}

              {/* Description */}
              {product.description && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">Description</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {product.description}
                  </p>
                </div>
              )}

              {/* Features/Specifications Placeholder */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Key Features</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                    <span className="text-sm text-muted-foreground">High-quality materials</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                    <span className="text-sm text-muted-foreground">Premium design</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                    <span className="text-sm text-muted-foreground">Excellent performance</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="p-6 md:p-8 border-t border-border/50 bg-muted/30 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={() => onManageImages(product)}
                  variant="outline"
                  className="flex items-center justify-center gap-2"
                >
                  <Images className="h-4 w-4" />
                  Images
                </Button>
                <Button
                  onClick={() => onEdit(product)}
                  variant="outline"
                  className="flex items-center justify-center gap-2"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
              </div>
              <Button
                onClick={onClose}
                className="w-full bg-gradient-primary hover:shadow-elegant transition-all duration-200 border-0"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}