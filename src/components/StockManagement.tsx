import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Upload, Download, RefreshCw, Save, AlertTriangle, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Product {
  id: string;
  title: string;
  sku: string;
  stock: number;
  price: number;
  category: string;
}

interface StockUpdate {
  product_id: string;
  stock: number;
}

const StockManagement = () => {
  const [stockUpdates, setStockUpdates] = useState<{ [key: string]: number }>({});
  const [isUpdating, setIsUpdating] = useState(false);
  
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, title, sku, stock, price, category')
        .order('title');
      
      if (error) throw error;
      return data as Product[];
    }
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (updates: StockUpdate[]) => {
      const { data, error } = await supabase.rpc('bulk_update_stock', {
        updates: updates as any
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (results) => {
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success);
      
      if (failed.length > 0) {
        console.error('Failed updates:', failed);
        toast.error(`${failed.length} updates failed. Check console for details.`);
      }
      
      if (successful > 0) {
        toast.success(`Successfully updated stock for ${successful} products`);
        setStockUpdates({});
        queryClient.invalidateQueries({ queryKey: ['products'] });
      }
      
      setIsUpdating(false);
    },
    onError: (error: any) => {
      toast.error(`Failed to update stock: ${error.message}`);
      setIsUpdating(false);
    }
  });

  const handleStockChange = (productId: string, newStock: number) => {
    setStockUpdates(prev => ({
      ...prev,
      [productId]: newStock
    }));
  };

  const handleStockAdjustment = (productId: string, currentStock: number, adjustment: number) => {
    const newStock = Math.max(0, currentStock + adjustment);
    handleStockChange(productId, newStock);
  };

  const handleSaveChanges = async () => {
    const updates: StockUpdate[] = Object.entries(stockUpdates).map(([product_id, stock]) => ({
      product_id,
      stock
    }));

    if (updates.length === 0) {
      toast.info('No changes to save');
      return;
    }

    setIsUpdating(true);
    bulkUpdateMutation.mutate(updates);
  };

  const handleResetChanges = () => {
    setStockUpdates({});
    toast.info('Changes reset');
  };

  const exportStock = () => {
    if (!products) return;
    
    const csvContent = "Product,SKU,Current Stock,Price,Category\n" + 
      products.map(p => `"${p.title}","${p.sku || ''}",${p.stock},${p.price},"${p.category || ''}"`).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success('Stock data exported');
  };

  const getPendingChangesCount = () => {
    return Object.keys(stockUpdates).length;
  };

  const getStockBadge = (stock: number) => {
    if (stock <= 0) return <Badge variant="destructive">Out of Stock</Badge>;
    if (stock <= 5) return <Badge variant="secondary">Low Stock</Badge>;
    return <Badge variant="default">In Stock</Badge>;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Stock Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Stock Management
        </CardTitle>
        <CardDescription>
          Manage product inventory levels. Stock is automatically updated when orders are placed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 mb-6">
          <Button
            onClick={handleSaveChanges}
            disabled={getPendingChangesCount() === 0 || isUpdating}
            className="flex-1"
          >
            <Save className="h-4 w-4 mr-2" />
            Save Changes {getPendingChangesCount() > 0 && `(${getPendingChangesCount()})`}
          </Button>
          <Button
            onClick={handleResetChanges}
            variant="outline"
            disabled={getPendingChangesCount() === 0}
            className="flex-1"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset Changes
          </Button>
          <Button
            onClick={exportStock}
            variant="outline"
            className="flex-1"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Desktop Table */}
        <div className="hidden lg:block border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Current Stock</TableHead>
                <TableHead>New Stock</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Category</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products?.map((product) => {
                const hasChanges = stockUpdates[product.id] !== undefined;
                const newStock = stockUpdates[product.id] ?? product.stock;
                
                return (
                  <TableRow key={product.id} className={hasChanges ? 'bg-yellow-50' : ''}>
                    <TableCell className="font-medium">
                      {product.title}
                      {hasChanges && (
                        <div className="flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3 text-yellow-600" />
                          <span className="text-xs text-yellow-600">Modified</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{product.sku || '-'}</TableCell>
                    <TableCell>{getStockBadge(newStock)}</TableCell>
                    <TableCell>
                      <span className={hasChanges ? 'line-through text-gray-500' : ''}>
                        {product.stock}
                      </span>
                    </TableCell>
                     <TableCell>
                       <div className="flex items-center gap-1">
                         <Button
                           size="sm"
                           variant="outline"
                           onClick={() => handleStockAdjustment(product.id, newStock, -1)}
                           disabled={newStock <= 0}
                           className="h-8 w-8 p-0"
                         >
                           <Minus className="h-3 w-3" />
                         </Button>
                         <Input
                           type="number"
                           min="0"
                           value={newStock}
                           onChange={(e) => handleStockChange(product.id, parseInt(e.target.value) || 0)}
                           className="w-16 text-center"
                         />
                         <Button
                           size="sm"
                           variant="outline"
                           onClick={() => handleStockAdjustment(product.id, newStock, 1)}
                           className="h-8 w-8 p-0"
                         >
                           <Plus className="h-3 w-3" />
                         </Button>
                       </div>
                     </TableCell>
                    <TableCell>${product.price}</TableCell>
                    <TableCell>{product.category || '-'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Card View */}
        <div className="lg:hidden space-y-4">
          {products?.map((product) => {
            const hasChanges = stockUpdates[product.id] !== undefined;
            const newStock = stockUpdates[product.id] ?? product.stock;
            
            return (
              <Card key={product.id} className={`overflow-hidden ${hasChanges ? 'border-yellow-300 bg-yellow-50' : ''}`}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1 flex-1">
                      <CardTitle className="text-base font-medium">{product.title}</CardTitle>
                      <div className="flex flex-wrap gap-2 text-sm">
                        {product.sku && (
                          <span className="text-muted-foreground">SKU: {product.sku}</span>
                        )}
                        {product.category && (
                          <Badge variant="outline" className="text-xs">{product.category}</Badge>
                        )}
                      </div>
                      {hasChanges && (
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-yellow-600" />
                          <span className="text-xs text-yellow-600">Modified</span>
                        </div>
                      )}
                    </div>
                    <div className="text-right space-y-1">
                      <div className="text-lg font-semibold">${product.price}</div>
                      {getStockBadge(newStock)}
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {/* Stock Information */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Current Stock</label>
                      <div className={`text-lg font-medium ${hasChanges ? 'line-through text-gray-500' : ''}`}>
                        {product.stock}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">New Stock</label>
                      <div className="text-lg font-medium">
                        {newStock}
                      </div>
                    </div>
                  </div>
                  
                  {/* Stock Controls */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-muted-foreground">Update Stock</label>
                      {hasChanges && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const { [product.id]: _, ...rest } = stockUpdates;
                            setStockUpdates(rest);
                          }}
                          className="text-xs h-auto p-1"
                        >
                          Reset
                        </Button>
                      )}
                    </div>
                    
                    <div className="space-y-3">
                      {/* Direct input with simple +/- */}
                      <div className="flex items-center gap-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStockAdjustment(product.id, newStock, -1)}
                          disabled={newStock <= 0}
                          className="h-10 w-10 p-0 rounded-full"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <div className="flex-1">
                          <Input
                            type="number"
                            min="0"
                            value={newStock}
                            onChange={(e) => handleStockChange(product.id, parseInt(e.target.value) || 0)}
                            className="text-center text-lg h-10"
                            placeholder="Stock quantity"
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStockAdjustment(product.id, newStock, 1)}
                          className="h-10 w-10 p-0 rounded-full"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      {/* Quick action buttons */}
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleStockChange(product.id, 0)}
                          className="h-9 text-xs"
                        >
                          Set to 0
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleStockChange(product.id, 10)}
                          className="h-9 text-xs"
                        >
                          Set to 10
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleStockChange(product.id, 50)}
                          className="h-9 text-xs"
                        >
                          Set to 50
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {products?.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            No products found. Add some products first to manage their stock levels.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StockManagement;