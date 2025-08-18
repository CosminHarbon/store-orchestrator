import { Edit, Trash2, Images, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

interface ProductListViewProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  onManageImages: (product: Product) => void;
  onProductClick: (product: Product) => void;
}

export function ProductListView({ 
  products, 
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

  return (
    <div className="border border-border/50 rounded-xl overflow-hidden bg-gradient-card">
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
                <div className="text-lg font-bold text-primary">
                  ${product.price.toFixed(2)}
                </div>
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
  );
}