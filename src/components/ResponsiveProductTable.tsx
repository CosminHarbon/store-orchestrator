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
    if (stock === 0) return <Badge variant="destructive">Out of Stock</Badge>;
    if (stock < 5) return <Badge variant="secondary">Low Stock</Badge>;
    return <Badge variant="default">{stock} in stock</Badge>;
  };

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Image</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products?.map((product) => {
              const primaryImage = getPrimaryImage(product.id);
              return (
                <TableRow key={product.id}>
                  <TableCell>
                    {primaryImage ? (
                      <img 
                        src={primaryImage.image_url} 
                        alt={product.title} 
                        className="w-12 h-12 object-cover rounded-md border" 
                      />
                    ) : product.image ? (
                      <img 
                        src={product.image} 
                        alt={product.title} 
                        className="w-12 h-12 object-cover rounded-md border" 
                      />
                    ) : (
                      <div className="w-12 h-12 bg-muted rounded-md flex items-center justify-center">
                        <Package className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium">{product.title}</p>
                      {product.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {product.description}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{product.category || '-'}</TableCell>
                  <TableCell className="font-medium">${product.price}</TableCell>
                  <TableCell>{getStockBadge(product.stock)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{product.sku || '-'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onManageImages(product)}
                        title="Manage Images"
                      >
                        <Images className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEdit(product)}
                        title="Edit Product"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(product.id)}
                        title="Delete Product"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {products?.map((product) => {
          const primaryImage = getPrimaryImage(product.id);
          return (
            <Card key={product.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    {primaryImage ? (
                      <img 
                        src={primaryImage.image_url} 
                        alt={product.title} 
                        className="w-16 h-16 object-cover rounded-md border" 
                      />
                    ) : product.image ? (
                      <img 
                        src={product.image} 
                        alt={product.title} 
                        className="w-16 h-16 object-cover rounded-md border" 
                      />
                    ) : (
                      <div className="w-16 h-16 bg-muted rounded-md flex items-center justify-center">
                        <Package className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <h3 className="font-medium text-base truncate">{product.title}</h3>
                      {product.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {product.description}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      <div className="text-lg font-semibold">${product.price}</div>
                      {getStockBadge(product.stock)}
                      {product.category && (
                        <Badge variant="outline">{product.category}</Badge>
                      )}
                    </div>
                    
                    {product.sku && (
                      <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                    )}
                    
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onManageImages(product)}
                        className="flex-1"
                      >
                        <Images className="h-4 w-4 mr-1" />
                        Images
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEdit(product)}
                        className="flex-1"
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onDelete(product.id)}
                        className="text-destructive hover:text-destructive"
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
    </>
  );
}