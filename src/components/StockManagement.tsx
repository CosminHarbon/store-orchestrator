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
  low_stock_threshold: number;
}

interface StockUpdate {
  product_id: string;
  stock: number;
  low_stock_threshold?: number;
}

const StockManagement = () => {
  const [stockUpdates, setStockUpdates] = useState<{ [key: string]: number }>({});
  const [thresholdUpdates, setThresholdUpdates] = useState<{ [key: string]: number }>({});
  const [isUpdating, setIsUpdating] = useState(false);
  
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
        toast.success(`Successfully updated ${totalUpdates} product settings`);
        setStockUpdates({});
        setThresholdUpdates({});
        queryClient.invalidateQueries({ queryKey: ['products'] });
      }
      setIsUpdating(false);
    },
    onError: (error: any) => {
      toast.error(`Failed to update products: ${error.message}`);
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
      toast.error('No changes to save');
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
    toast.success('Changes reset');
  };

  const exportStock = () => {
    if (!products) return;
    
    const csvContent = "Product,SKU,Current Stock,Price,Category\n" + 
      products.map(p => `"${p.title}","${p.sku || ''}",${p.stock},${p.price},"${p.category || ''}"`).join('\n');
    
    const fileName = `stock-export-${new Date().toISOString().split('T')[0]}.csv`;
    
    // Check if we're on mobile and if Web Share API is available
    if (navigator.share && /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const file = new File([blob], fileName, { type: 'text/csv' });
      
      navigator.share({
        title: 'Stock Export',
        text: 'Stock data export',
        files: [file]
      }).then(() => {
        toast.success('Stock data shared');
      }).catch((error) => {
        // Fallback to download if sharing fails
        fallbackDownload(csvContent, fileName);
      });
    } else {
      // Desktop or browsers without Web Share API
      fallbackDownload(csvContent, fileName);
    }
  };

  const fallbackDownload = (csvContent: string, fileName: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Try modern approach first
    if (window.navigator && (window.navigator as any).msSaveOrOpenBlob) {
      // IE/Edge
      (window.navigator as any).msSaveOrOpenBlob(blob, fileName);
      toast.success('Stock data exported');
    } else {
      // Modern browsers
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      // For mobile browsers, try opening in new tab as fallback
      const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      if (isMobile) {
        // On mobile, create a beautiful HTML table
        const csvLines = csvContent.split('\n');
        const headers = csvLines[0].split(',').map(h => h.replace(/"/g, ''));
        const rows = csvLines.slice(1).filter(line => line.trim());
        
        const htmlContent = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Stock Export - ${fileName}</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                * { box-sizing: border-box; }
                body { 
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  margin: 0;
                  padding: 20px;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  min-height: 100vh;
                }
                .container {
                  background: white;
                  border-radius: 12px;
                  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
                  overflow: hidden;
                  margin-bottom: 20px;
                }
                .header {
                  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                  color: white;
                  padding: 20px;
                  text-align: center;
                }
                .header h1 {
                  margin: 0;
                  font-size: 24px;
                  font-weight: 600;
                }
                .header p {
                  margin: 8px 0 0 0;
                  opacity: 0.9;
                  font-size: 14px;
                }
                .table-container {
                  overflow-x: auto;
                }
                table {
                  width: 100%;
                  border-collapse: collapse;
                  margin: 0;
                }
                th {
                  background: #f8fafc;
                  color: #374151;
                  font-weight: 600;
                  padding: 16px 12px;
                  text-align: left;
                  border-bottom: 2px solid #e5e7eb;
                  font-size: 14px;
                  text-transform: uppercase;
                  letter-spacing: 0.5px;
                }
                td {
                  padding: 16px 12px;
                  border-bottom: 1px solid #f1f5f9;
                  color: #374151;
                  font-size: 14px;
                }
                tr:hover {
                  background: #f8fafc;
                }
                .stock-badge {
                  display: inline-block;
                  padding: 4px 8px;
                  border-radius: 6px;
                  font-weight: 500;
                  font-size: 12px;
                }
                .stock-high {
                  background: #dcfce7;
                  color: #166534;
                }
                .stock-medium {
                  background: #fef3c7;
                  color: #92400e;
                }
                .stock-low {
                  background: #fecaca;
                  color: #991b1b;
                }
                .price {
                  font-weight: 600;
                  color: #059669;
                }
                .category-badge {
                  background: #e0e7ff;
                  color: #3730a3;
                  padding: 4px 8px;
                  border-radius: 6px;
                  font-size: 12px;
                  font-weight: 500;
                }
                .download-section {
                  background: white;
                  border-radius: 12px;
                  padding: 20px;
                  text-align: center;
                  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                }
                .download-btn {
                  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                  color: white;
                  border: none;
                  padding: 12px 24px;
                  border-radius: 8px;
                  font-weight: 600;
                  cursor: pointer;
                  margin: 0 8px;
                  text-decoration: none;
                  display: inline-block;
                }
                @media (max-width: 640px) {
                  body { padding: 10px; }
                  th, td { padding: 12px 8px; font-size: 12px; }
                  .header h1 { font-size: 20px; }
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>📊 Stock Export Report</h1>
                  <p>Generated on ${new Date().toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</p>
                </div>
                <div class="table-container">
                  <table>
                    <thead>
                      <tr>
                        ${headers.map(header => `<th>${header}</th>`).join('')}
                      </tr>
                    </thead>
                    <tbody>
                      ${rows.map(row => {
                        const cells = row.split(',').map(cell => cell.replace(/"/g, ''));
                        const stock = parseInt(cells[2]) || 0;
                        const price = parseFloat(cells[3]) || 0;
                        
                        return `
                          <tr>
                            <td><strong>${cells[0]}</strong></td>
                            <td><code>${cells[1] || 'N/A'}</code></td>
                            <td>
                              <span class="stock-badge ${stock === 0 ? 'stock-low' : stock < 10 ? 'stock-medium' : 'stock-high'}">
                                ${stock} ${stock === 1 ? 'unit' : 'units'}
                              </span>
                            </td>
                            <td><span class="price">{price.toFixed(2)} RON</span></td>
                            <td><span class="category-badge">${cells[4] || 'Uncategorized'}</span></td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
              
              <div class="download-section">
                <h3 style="margin-top: 0; color: #374151;">Export Options</h3>
                <p style="color: #6b7280; margin-bottom: 16px;">Save this data to your device</p>
                <button class="download-btn" onclick="downloadRawCSV()">📄 Download CSV</button>
                <button class="download-btn" onclick="window.print()" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);">🖨️ Print Report</button>
              </div>

              <script>
                function downloadRawCSV() {
                  const csvData = \`${csvContent.replace(/`/g, '\\`')}\`;
                  const blob = new Blob([csvData], { type: 'text/csv' });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = '${fileName}';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  window.URL.revokeObjectURL(url);
                }
              </script>
            </body>
          </html>
        `;
        
        const csvWindow = window.open('', '_blank');
        if (csvWindow) {
          csvWindow.document.write(htmlContent);
          csvWindow.document.close();
          toast.success('Beautiful stock report opened!');
        } else {
          toast.error('Please allow popups to view the stock report');
        }
      } else {
        // Desktop download
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast.success('Stock data exported');
      }
    }
  };

  const getPendingChangesCount = () => {
    return Object.keys(stockUpdates).length + Object.keys(thresholdUpdates).length;
  };

  const getStockBadge = (product: Product, newStock?: number, newThreshold?: number) => {
    const stockToCheck = newStock !== undefined ? newStock : product.stock;
    const thresholdToCheck = newThreshold !== undefined ? newThreshold : product.low_stock_threshold;
    if (stockToCheck <= 0) return <Badge variant="destructive">Out of Stock</Badge>;
    if (stockToCheck <= thresholdToCheck) return <Badge variant="secondary">Low Stock</Badge>;
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
                <TableHead>Low Stock Alert</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Category</TableHead>
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
                          <span className="text-xs text-yellow-600">Modified</span>
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
                     <TableCell>
                       <Input
                         type="number"
                         min="0"
                         value={newThreshold}
                         onChange={(e) => handleThresholdChange(product.id, parseInt(e.target.value) || 0)}
                         className="w-20"
                       />
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
                          <span className="text-muted-foreground">SKU: {product.sku}</span>
                        )}
                        {product.category && (
                          <Badge variant="outline" className="text-xs">{product.category}</Badge>
                        )}
                      </div>
                      {hasAnyChanges && (
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-yellow-600" />
                          <span className="text-xs text-yellow-600">Modified</span>
                        </div>
                      )}
                    </div>
                    <div className="text-right space-y-1">
                      <div className="text-lg font-semibold">${product.price}</div>
                      {getStockBadge(product, newStock, newThreshold)}
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {/* Stock Information */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Current Stock</label>
                      <div className={`text-lg font-medium ${hasStockChanges ? 'line-through text-gray-500' : ''}`}>
                        {product.stock}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Alert Threshold</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          value={newThreshold}
                          onChange={(e) => handleThresholdChange(product.id, parseInt(e.target.value) || 0)}
                          className="w-20 h-8"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Stock Controls */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-muted-foreground">Update Stock</label>
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