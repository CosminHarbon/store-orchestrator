import { Edit, Trash2, Images, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  image: string;
  category: string;
  stock: number;
  sku: string;
}

interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  is_primary: boolean;
  display_order: number;
}

interface ResponsiveProductTableProps {
  products: Product[];
  productImages: ProductImage[];
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  onManageImages: (product: Product) => void;
}

export function ResponsiveProductTable({ 
  products, 
  productImages, 
  onEdit, 
  onDelete, 
  onManageImages 
}: ResponsiveProductTableProps) {
  const getPrimaryImage = (productId: string) => {
    return productImages?.find(img => img.product_id === productId);
  };

  const getStockBadge = (stock: number) => {
    if (stock === 0) return <Badge variant="destructive" className="text-xs">Out of Stock</Badge>;
    if (stock < 5) return <Badge variant="secondary" className="text-xs">Low Stock</Badge>;
    return <Badge variant="outline" className="text-xs">{stock} in stock</Badge>;
  };

  return (
    <>
      {/* Desktop Grid View */}
      <div className="hidden lg:block">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products?.map((product) => {
            const primaryImage = getPrimaryImage(product.id);
            return (
              <Card key={product.id} className="group overflow-hidden bg-gradient-card border border-border/50 hover:shadow-elegant transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-0">
                  {/* Product Image */}
                  <div className="aspect-square relative overflow-hidden bg-gradient-subtle">
                    {primaryImage ? (
                      <img 
                        src={primaryImage.image_url} 
                        alt={product.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                      />
                    ) : product.image ? (
                      <img 
                        src={product.image} 
                        alt={product.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                      />
                    ) : (
                      <div className="w-full h-full bg-muted/50 flex items-center justify-center">
                        <Package className="h-16 w-16 text-muted-foreground/50" />
                      </div>
                    )}
                    
                    {/* Action Buttons Overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onManageImages(product)}
                          className="bg-white/90 hover:bg-white text-black border-0 shadow-lg"
                          title="Manage Images"
                        >
                          <Images className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onEdit(product)}
                          className="bg-white/90 hover:bg-white text-black border-0 shadow-lg"
                          title="Edit Product"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onDelete(product.id)}
                          className="bg-destructive/90 hover:bg-destructive text-white border-0 shadow-lg"
                          title="Delete Product"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Product Info */}
                  <div className="p-4 space-y-3">
                    <div className="space-y-1">
                      <h3 className="font-semibold text-base line-clamp-2 leading-tight">{product.title}</h3>
                      {product.category && (
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">{product.category}</p>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="text-xl font-bold text-primary">${product.price}</div>
                      {getStockBadge(product.stock)}
                    </div>
                    
                    {product.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                        {product.description}
                      </p>
                    )}
                    
                    {product.sku && (
                      <p className="text-xs text-muted-foreground font-mono">SKU: {product.sku}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Tablet Grid View */}
      <div className="hidden md:block lg:hidden">
        <div className="grid grid-cols-2 gap-4">
          {products?.map((product) => {
            const primaryImage = getPrimaryImage(product.id);
            return (
              <Card key={product.id} className="group overflow-hidden bg-gradient-card border border-border/50 hover:shadow-elegant transition-all duration-300">
                <CardContent className="p-0">
                  <div className="aspect-[4/3] relative overflow-hidden bg-gradient-subtle">
                    {primaryImage ? (
                      <img 
                        src={primaryImage.image_url} 
                        alt={product.title} 
                        className="w-full h-full object-cover" 
                      />
                    ) : product.image ? (
                      <img 
                        src={product.image} 
                        alt={product.title} 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="w-full h-full bg-muted/50 flex items-center justify-center">
                        <Package className="h-12 w-12 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  
                  <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm line-clamp-1">{product.title}</h3>
                        {product.category && (
                          <p className="text-xs text-muted-foreground">{product.category}</p>
                        )}
                      </div>
                      <div className="text-lg font-bold text-primary ml-2">${product.price}</div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      {getStockBadge(product.stock)}
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onManageImages(product)}
                          className="h-8 w-8 p-0"
                        >
                          <Images className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onEdit(product)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onDelete(product.id)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Mobile Grid View */}
      <div className="md:hidden">
        <div className="grid grid-cols-2 gap-3">
          {products?.map((product) => {
            const primaryImage = getPrimaryImage(product.id);
            return (
              <Card key={product.id} className="group overflow-hidden bg-gradient-card border border-border/50 hover:shadow-card transition-all duration-200">
                <CardContent className="p-0">
                  {/* Product Image */}
                  <div className="aspect-square relative overflow-hidden bg-gradient-subtle">
                    {primaryImage ? (
                      <img 
                        src={primaryImage.image_url} 
                        alt={product.title} 
                        className="w-full h-full object-cover" 
                      />
                    ) : product.image ? (
                      <img 
                        src={product.image} 
                        alt={product.title} 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="w-full h-full bg-muted/50 flex items-center justify-center">
                        <Package className="h-10 w-10 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  
                  {/* Product Info */}
                  <div className="p-3 space-y-2">
                    <div className="space-y-1">
                      <h3 className="font-semibold text-sm line-clamp-2 leading-tight">{product.title}</h3>
                      {product.category && (
                        <p className="text-xs text-muted-foreground truncate">{product.category}</p>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="text-lg font-bold text-primary">${product.price}</div>
                      {getStockBadge(product.stock)}
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="grid grid-cols-3 gap-1 pt-2 border-t border-border/50">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onManageImages(product)}
                        className="text-xs h-8 px-2"
                      >
                        <Images className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEdit(product)}
                        className="text-xs h-8 px-2"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(product.id)}
                        className="text-xs h-8 px-2 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}