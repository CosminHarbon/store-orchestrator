import { Edit, Trash2, Images, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { calculateProductPrice, formatPrice, formatDiscount } from '@/lib/discountUtils';

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

interface ProductListViewProps {
  products: Product[];
  discounts?: Discount[];
  productDiscounts?: ProductDiscount[];
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  onManageImages: (product: Product) => void;
  onProductClick: (product: Product) => void;
}

export function ProductListView({ 
  products,
  discounts = [],
  productDiscounts = [],
  onEdit, 
  onDelete, 
  onManageImages,
  onProductClick 
}: ProductListViewProps) {

  const getStockBadge = (stock: number) => {
    if (stock === 0) return <Badge variant="destructive" className="text-xs">Out of Stock</Badge>;
    if (stock < 5) return <Badge variant="secondary" className="text-xs">Low Stock</Badge>;
    return <Badge variant="outline" className="text-xs">{stock} in stock</Badge>;
  };

  const renderPriceDisplay = (product: Product) => {
    const priceInfo = calculateProductPrice(product.id, product.price, discounts, productDiscounts);
    
    if (!priceInfo.hasDiscount || !priceInfo.discountedPrice) {
      return (
        <div className="text-lg font-bold text-primary">
          {formatPrice(product.price)}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="text-lg font-bold text-primary">{formatPrice(priceInfo.discountedPrice)}</div>
          <Badge variant="destructive" className="text-xs px-2 py-1">
            {formatDiscount(priceInfo.discountPercentage || 0)}
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground line-through">
          {formatPrice(priceInfo.originalPrice)}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block border border-border/50 rounded-xl overflow-hidden bg-gradient-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/50">
              <TableHead className="font-semibold">Product</TableHead>
              <TableHead className="font-semibold">Category</TableHead>
              <TableHead className="font-semibold">Price</TableHead>
              <TableHead className="font-semibold">Stock</TableHead>
              <TableHead className="font-semibold">SKU</TableHead>
              <TableHead className="font-semibold text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products?.map((product, index) => (
              <TableRow 
                key={product.id}
                className={`hover:bg-muted/30 transition-colors cursor-pointer ${
                  index % 2 === 0 ? 'bg-background/50' : 'bg-muted/10'
                }`}
                onClick={() => onProductClick(product)}
              >
                <TableCell className="py-4">
                  <div className="space-y-1">
                    <p className="font-medium text-base hover:text-primary transition-colors">
                      {product.title}
                    </p>
                    {product.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1 max-w-md">
                        {product.description}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  {product.category ? (
                    <Badge variant="outline" className="text-xs">
                      {product.category}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
                <TableCell className="py-4">
                  {renderPriceDisplay(product)}
                </TableCell>
                <TableCell className="py-4">
                  {getStockBadge(product.stock)}
                </TableCell>
                <TableCell className="py-4">
                  <span className="text-sm font-mono text-muted-foreground">
                    {product.sku || '-'}
                  </span>
                </TableCell>
                <TableCell className="py-4">
                  <div className="flex justify-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onManageImages(product);
                      }}
                      className="h-8 w-8 p-0 hover:bg-primary/10"
                      title="Manage Images"
                    >
                      <Images className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(product);
                      }}
                      className="h-8 w-8 p-0 hover:bg-primary/10"
                      title="Edit Product"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(product.id);
                      }}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="Delete Product"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        
        {products?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Package className="h-12 w-12 text-muted-foreground/30" />
            <div className="text-center space-y-1">
              <h3 className="font-medium text-muted-foreground">No products found</h3>
              <p className="text-sm text-muted-foreground/70">
                Try adjusting your search criteria
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {products?.map((product) => (
          <Card 
            key={product.id} 
            className="bg-gradient-card border border-border/50 shadow-card hover:shadow-elegant transition-all duration-200 cursor-pointer"
            onClick={() => onProductClick(product)}
          >
            <CardContent className="p-4 space-y-3">
              {/* Product Title and Description */}
              <div className="space-y-1">
                <h3 className="font-medium text-base hover:text-primary transition-colors">
                  {product.title}
                </h3>
                {product.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {product.description}
                  </p>
                )}
              </div>

              {/* Price and Category Row */}
              <div className="flex items-center justify-between">
                {renderPriceDisplay(product)}
                {product.category && (
                  <Badge variant="outline" className="text-xs">
                    {product.category}
                  </Badge>
                )}
              </div>

              {/* Stock and SKU Row */}
              <div className="flex items-center justify-between">
                <div>
                  {getStockBadge(product.stock)}
                </div>
                {product.sku && (
                  <span className="text-xs font-mono text-muted-foreground">
                    SKU: {product.sku}
                  </span>
                )}
              </div>

              {/* Actions Row */}
              <div className="flex justify-end gap-2 pt-2 border-t border-border/20">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onManageImages(product);
                  }}
                  className="h-8 w-8 p-0 hover:bg-primary/10"
                  title="Manage Images"
                >
                  <Images className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(product);
                  }}
                  className="h-8 w-8 p-0 hover:bg-primary/10"
                  title="Edit Product"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(product.id);
                  }}
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  title="Delete Product"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {products?.length === 0 && (
          <Card className="bg-gradient-card border border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
              <Package className="h-12 w-12 text-muted-foreground/30" />
              <div className="text-center space-y-1">
                <h3 className="font-medium text-muted-foreground">No products found</h3>
                <p className="text-sm text-muted-foreground/70">
                  Try adjusting your search criteria
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}