import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Upload, Download, RefreshCw, Save, AlertTriangle, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ExportDialog } from '@/components/export/ExportDialog';
import type { ExportRow } from '@/lib/export/types';

interface Product {
  id: string;
  title: string;
  sku: string;
  stock: number;
  price: number;
  category: string;
  low_stock_threshold: number;
}

interface StockUpdate {
  product_id: string;
  stock: number;
  low_stock_threshold?: number;
}

interface StockManagementProps {
  onPendingChangesChange?: (hasPendingChanges: boolean) => void;
  saveRef?: React.MutableRefObject<(() => void) | null>;
}

const StockManagement = ({ onPendingChangesChange, saveRef }: StockManagementProps = {}) => {
  const { t: tStock } = useTranslation('stock');
  const { t: tExport } = useTranslation('export');
  const [stockUpdates, setStockUpdates] = useState<{ [key: string]: number }>({});
  const [thresholdUpdates, setThresholdUpdates] = useState<{ [key: string]: number }>({});
  const [isUpdating, setIsUpdating] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, title, sku, stock, price, category, low_stock_threshold')
        .order('title');
      
      if (error) throw error;
      return data as Product[];
    }
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (updates: { stock: StockUpdate[], threshold: { product_id: string; low_stock_threshold: number }[] }) => {
      // Update stock using the existing RPC function
      if (updates.stock.length > 0) {
        const { error: stockError } = await supabase.rpc('bulk_update_stock', {
          updates: updates.stock as any
        });
        if (stockError) throw stockError;
      }

      // Update thresholds using regular update queries
      if (updates.threshold.length > 0) {
        const promises = updates.threshold.map(update => 
          supabase
            .from('products')
            .update({ low_stock_threshold: update.low_stock_threshold })
            .eq('id', update.product_id)
        );
        
        const results = await Promise.all(promises);
        const errors = results.filter(result => result.error);
        if (errors.length > 0) {
          throw new Error(`Failed to update ${errors.length} thresholds`);
        }
      }

      return { stock: updates.stock.length, threshold: updates.threshold.length };
    },
    onSuccess: (results) => {
      const totalUpdates = results.stock + results.threshold;
      if (totalUpdates > 0) {
        toast.success(tStock('toast.updated', { count: totalUpdates }));
        setStockUpdates({});
        setThresholdUpdates({});
        queryClient.invalidateQueries({ queryKey: ['products'] });
      }
      setIsUpdating(false);
    },
    onError: (error: any) => {
      toast.error(tStock('toast.updateFailed', { message: error.message }));
      setIsUpdating(false);
    }
  });

  const handleThresholdChange = (productId: string, newThreshold: number) => {
    setThresholdUpdates(prev => ({
      ...prev,
      [productId]: newThreshold
    }));
  };

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

  // Notify parent about pending changes
  const hasPendingChanges = Object.keys(stockUpdates).length > 0 || Object.keys(thresholdUpdates).length > 0;
  
  useEffect(() => {
    onPendingChangesChange?.(hasPendingChanges);
  }, [hasPendingChanges, onPendingChangesChange]);

  // Expose save function to parent via ref
  useEffect(() => {
    if (saveRef) {
      saveRef.current = handleSaveChanges;
    }
    return () => {
      if (saveRef) {
        saveRef.current = null;
      }
    };
  }, [stockUpdates, thresholdUpdates]);

  const handleSaveChanges = () => {
    const stockUpdatesArray = Object.entries(stockUpdates).map(([productId, stock]) => ({
      product_id: productId,
      stock
    }));

    const thresholdUpdatesArray = Object.entries(thresholdUpdates).map(([productId, threshold]) => ({
      product_id: productId,
      low_stock_threshold: threshold
    }));
    
    if (stockUpdatesArray.length === 0 && thresholdUpdatesArray.length === 0) {
      toast.error(tStock('toast.noChanges'));
      return;
    }
    
    setIsUpdating(true);
    bulkUpdateMutation.mutate({
      stock: stockUpdatesArray,
      threshold: thresholdUpdatesArray
    });
  };

  const handleResetChanges = () => {
    setStockUpdates({});
    setThresholdUpdates({});
    toast.success(tStock('toast.reset'));
  };

  const exportRows = useMemo<ExportRow[]>(() => {
    return (products || []).map((p) => {
      const status =
        p.stock <= 0
          ? tStock('badge.outOfStock')
          : p.stock <= p.low_stock_threshold
            ? tStock('badge.lowStock')
            : tStock('badge.inStock');
      return {
        title: p.title,
        sku: p.sku || '',
        stock: p.stock,
        low_stock_threshold: p.low_stock_threshold,
        price: Number(p.price).toFixed(2),
        category: p.category || '',
        status,
      };
    });
  }, [products, tStock]);

  const exportSummary = useMemo(() => {
    const list = products || [];
    const out = list.filter((p) => p.stock <= 0).length;
    const low = list.filter((p) => p.stock > 0 && p.stock <= p.low_stock_threshold).length;
    return [
      { label: tExport('summary.products'), value: String(list.length) },
      { label: tExport('summary.outOfStock'), value: String(out) },
      { label: tExport('summary.lowStock'), value: String(low) },
    ];
  }, [products, tExport]);

  const getPendingChangesCount = () => {
    return Object.keys(stockUpdates).length + Object.keys(thresholdUpdates).length;
  };

  const getStockBadge = (product: Product, newStock?: number, newThreshold?: number) => {
    const stockToCheck = newStock !== undefined ? newStock : product.stock;
    const thresholdToCheck = newThreshold !== undefined ? newThreshold : product.low_stock_threshold;
    if (stockToCheck <= 0) return <Badge variant="destructive">{tStock('badge.outOfStock')}</Badge>;
    if (stockToCheck <= thresholdToCheck) return <Badge variant="secondary">{tStock('badge.lowStock')}</Badge>;
    return <Badge variant="default">{tStock('badge.inStock')}</Badge>;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {tStock('title')}
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
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Stock Management
        </CardTitle>
        <CardDescription>
          {tStock('description')}
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
            {getPendingChangesCount() > 0
              ? tStock('saveChangesCount', { count: getPendingChangesCount() })
              : tStock('saveChanges')}
          </Button>
          <Button
            onClick={handleResetChanges}
            variant="outline"
            disabled={getPendingChangesCount() === 0}
            className="flex-1"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {tStock('resetChanges')}
          </Button>
          <Button
            onClick={() => setExportOpen(true)}
            variant="outline"
            className="flex-1"
          >
            <Download className="h-4 w-4 mr-2" />
            {tExport('open')}
          </Button>
        </div>

        {/* Desktop Table */}
        <div className="hidden lg:block border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tStock('table.product')}</TableHead>
                <TableHead>{tStock('table.sku')}</TableHead>
                <TableHead>{tStock('table.status')}</TableHead>
                <TableHead>{tStock('table.currentStock')}</TableHead>
                <TableHead>{tStock('table.newStock')}</TableHead>
                <TableHead>{tStock('table.lowStockAlert')}</TableHead>
                <TableHead>{tStock('table.price')}</TableHead>
                <TableHead>{tStock('table.category')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products?.map((product) => {
                const hasStockChanges = stockUpdates[product.id] !== undefined;
                const hasThresholdChanges = thresholdUpdates[product.id] !== undefined;
                const hasAnyChanges = hasStockChanges || hasThresholdChanges;
                const newStock = stockUpdates[product.id] ?? product.stock;
                const newThreshold = thresholdUpdates[product.id] ?? product.low_stock_threshold;
                
                return (
                  <TableRow key={product.id} className={hasAnyChanges ? 'bg-yellow-50' : ''}>
                    <TableCell className="font-medium">
                      {product.title}
                      {hasAnyChanges && (
                        <div className="flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3 text-yellow-600" />
                          <span className="text-xs text-yellow-600">{tStock('badge.modified')}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{product.sku || '-'}</TableCell>
                    <TableCell>{getStockBadge(product, newStock, newThreshold)}</TableCell>
                    <TableCell>
                      <span className={hasStockChanges ? 'line-through text-gray-500' : ''}>
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
                           type="text"
                           inputMode="numeric"
                           pattern="[0-9]*"
                           value={stockUpdates[product.id] !== undefined ? String(newStock) : String(product.stock)}
                           onChange={(e) => {
                             const val = e.target.value.replace(/^0+(?=\d)/, '');
                             handleStockChange(product.id, val === '' ? 0 : parseInt(val) || 0);
                           }}
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
                     <TableCell>
                     <Input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={thresholdUpdates[product.id] !== undefined ? String(newThreshold) : String(product.low_stock_threshold)}
                          onChange={(e) => {
                            const val = e.target.value.replace(/^0+(?=\d)/, '');
                            handleThresholdChange(product.id, val === '' ? 0 : parseInt(val) || 0);
                          }}
                          className="w-20"
                        />
                     </TableCell>
                     <TableCell>{Number(product.price).toFixed(2)} RON</TableCell>
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
            const hasStockChanges = stockUpdates[product.id] !== undefined;
            const hasThresholdChanges = thresholdUpdates[product.id] !== undefined;
            const hasAnyChanges = hasStockChanges || hasThresholdChanges;
            const newStock = stockUpdates[product.id] ?? product.stock;
            const newThreshold = thresholdUpdates[product.id] ?? product.low_stock_threshold;
            
            return (
              <Card key={product.id} className={`overflow-hidden ${hasAnyChanges ? 'border-yellow-300 bg-yellow-50' : ''}`}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1 flex-1">
                      <CardTitle className="text-base font-medium">{product.title}</CardTitle>
                      <div className="flex flex-wrap gap-2 text-sm">
                        {product.sku && (
                          <span className="text-muted-foreground">{tStock('label.skuPrefix', { sku: product.sku })}</span>
                        )}
                        {product.category && (
                          <Badge variant="outline" className="text-xs">{product.category}</Badge>
                        )}
                      </div>
                      {hasAnyChanges && (
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-yellow-600" />
                          <span className="text-xs text-yellow-600">{tStock('badge.modified')}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-right space-y-1">
                      <div className="text-lg font-semibold">
                        {Number(product.price).toFixed(2)} RON
                      </div>
                      {getStockBadge(product, newStock, newThreshold)}
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {/* Stock Information */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">{tStock('label.currentStock')}</label>
                      <div className={`text-lg font-medium ${hasStockChanges ? 'line-through text-gray-500' : ''}`}>
                        {product.stock}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">{tStock('label.alertThreshold')}</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={thresholdUpdates[product.id] !== undefined ? String(newThreshold) : String(product.low_stock_threshold)}
                          onChange={(e) => {
                            const val = e.target.value.replace(/^0+(?=\d)/, '');
                            handleThresholdChange(product.id, val === '' ? 0 : parseInt(val) || 0);
                          }}
                          className="w-20 h-8"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Stock Controls */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-muted-foreground">{tStock('label.updateStock')}</label>
                      {hasAnyChanges && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const { [product.id]: _, ...restStock } = stockUpdates;
                            const { [product.id]: __, ...restThreshold } = thresholdUpdates;
                            setStockUpdates(restStock);
                            setThresholdUpdates(restThreshold);
                          }}
                          className="text-xs h-auto p-1"
                        >
                          {tStock('reset')}
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
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={stockUpdates[product.id] !== undefined ? String(newStock) : String(product.stock)}
                            onChange={(e) => {
                              const val = e.target.value.replace(/^0+(?=\d)/, '');
                              handleStockChange(product.id, val === '' ? 0 : parseInt(val) || 0);
                            }}
                            className="text-center text-lg h-10"
                            placeholder={tStock('placeholder.quantity')}
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
                          {tStock('quickSet.zero')}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleStockChange(product.id, 10)}
                          className="h-9 text-xs"
                        >
                          {tStock('quickSet.ten')}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleStockChange(product.id, 50)}
                          className="h-9 text-xs"
                        >
                          {tStock('quickSet.fifty')}
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
            {tStock('empty.noProducts')}
          </div>
        )}
      </CardContent>
    </Card>
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        datasetId="stock"
        rows={exportRows}
        summary={exportSummary}
      />
    </>
  );
};

export default StockManagement;