import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Images, Folder, Package, Search, Grid, List, Percent } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ProductImageUpload from './ProductImageUpload';
import { ResponsiveProductTable } from './ResponsiveProductTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CollectionsManagement from './CollectionsManagement';
import { ProductDetailModal } from './ProductDetailModal';
import { ProductListView } from './ProductListView';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import DiscountManagement from './DiscountManagement';

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

const ProductManagement = () => {
  const isMobile = useIsMobile();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [imageDialogProduct, setImageDialogProduct] = useState<Product | null>(null);
  const [newProductForImages, setNewProductForImages] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    category: '',
    stock: '',
    sku: '',
    low_stock_threshold: '5'
  });
  
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Product[];
    }
  });

  const { data: productImages } = useQuery({
    queryKey: ['all-product-images'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_images')
        .select('*')
        .eq('is_primary', true);
      
      if (error) throw error;
      return data as ProductImage[];
    }
  });

  // Fetch discounts and product discounts
  const { data: discounts } = useQuery({
    queryKey: ['discounts-for-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('discounts')
        .select('*')
        .eq('is_active', true);
      
      if (error) throw error;
      return data as Array<{
        id: string;
        discount_type: 'percentage' | 'fixed_amount';
        discount_value: number;
        start_date: string;
        end_date: string | null;
        is_active: boolean;
      }>;
    }
  });

  const { data: productDiscounts } = useQuery({
    queryKey: ['product-discounts-for-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_discounts')
        .select('*');
      
      if (error) throw error;
      return data as Array<{
        product_id: string;
        discount_id: string;
      }>;
    }
  });

  // Filter products based on search query
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!searchQuery.trim()) return products;

    const query = searchQuery.toLowerCase();
    return products.filter(product => 
      product.title.toLowerCase().includes(query) ||
      product.description?.toLowerCase().includes(query) ||
      product.category?.toLowerCase().includes(query) ||
      product.sku?.toLowerCase().includes(query)
    );
  }, [products, searchQuery]);

  const createProductMutation = useMutation({
    mutationFn: async (productData: any) => {
      const { data, error } = await supabase
        .from('products')
        .insert({
          ...productData,
          price: parseFloat(productData.price),
          stock: parseInt(productData.stock),
          low_stock_threshold: parseInt(productData.low_stock_threshold || '5'),
          user_id: (await supabase.auth.getUser()).data.user?.id
        })
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product created successfully');
      const newProduct = data[0];
      if (newProduct) {
        setNewProductForImages(newProduct.id);
        setImageDialogProduct(newProduct);
      }
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to create product');
      console.error(error);
    }
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, ...productData }: any) => {
      const { data, error } = await supabase
        .from('products')
        .update({
          ...productData,
          price: parseFloat(productData.price),
          stock: parseInt(productData.stock),
          low_stock_threshold: parseInt(productData.low_stock_threshold || '5')
        })
        .eq('id', id)
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product updated successfully');
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to update product');
      console.error(error);
    }
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete product');
      console.error(error);
    }
  });

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      price: '',
      category: '',
      stock: '',
      sku: '',
      low_stock_threshold: '5'
    });
    setEditingProduct(null);
    setIsDialogOpen(false);
    setNewProductForImages(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, ...formData });
    } else {
      createProductMutation.mutate(formData);
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      title: product.title,
      description: product.description || '',
      price: product.price.toString(),
      category: product.category || '',
      stock: product.stock.toString(),
      sku: product.sku || '',
      low_stock_threshold: product.low_stock_threshold.toString()
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      deleteProductMutation.mutate(id);
    }
  };

  if (isLoading) {
    return <div>Loading products...</div>;
  }

  return (
    <div className="w-full">
      <Tabs defaultValue="products" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-background/80 backdrop-blur-lg border border-border/50 rounded-2xl shadow-lg">
          <TabsTrigger 
            value="products" 
            className="flex items-center gap-2 rounded-xl data-[state=active]:bg-primary-dark data-[state=active]:text-white transition-all duration-200 hover:bg-muted/50"
          >
            <Package className="h-4 w-4" />
            Products
          </TabsTrigger>
          <TabsTrigger 
            value="collections" 
            className="flex items-center gap-2 rounded-xl data-[state=active]:bg-primary-dark data-[state=active]:text-white transition-all duration-200 hover:bg-muted/50"
          >
            <Folder className="h-4 w-4" />
            Collections
          </TabsTrigger>
          <TabsTrigger 
            value="discounts" 
            className="flex items-center gap-2 rounded-xl data-[state=active]:bg-primary-dark data-[state=active]:text-white transition-all duration-200 hover:bg-muted/50"
          >
            <Percent className="h-4 w-4" />
            Discounts
          </TabsTrigger>
        </TabsList>
      
      <TabsContent value="products" className="space-y-6">
        {/* Apple-style Header Section */}
        <div className="relative overflow-hidden rounded-3xl p-6 md:p-8 text-white bg-gradient-apple shadow-xl">
          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/15 backdrop-blur-sm rounded-2xl">
                    <Package className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl md:text-4xl font-semibold tracking-tight">
                      Products
                    </h1>
                    <p className="text-white/75 text-sm md:text-base mt-1">
                      Manage your product catalog
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white/60 rounded-full"></div>
                    <span className="text-white/80">{products?.length || 0} Products</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-300 rounded-full"></div>
                    <span className="text-white/80">{products?.filter(p => p.stock > p.low_stock_threshold).length || 0} In Stock</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-orange-300 rounded-full"></div>
                    <span className="text-white/80">{products?.filter(p => p.stock <= p.low_stock_threshold && p.stock > 0).length || 0} Low Stock</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      onClick={() => resetForm()} 
                      size="lg"
                      className="bg-white/90 text-primary-dark hover:bg-white transition-all duration-200 border-0 px-6 py-3 rounded-2xl font-medium shadow-lg hover:shadow-xl hover:scale-105"
                    >
                      <Plus className="h-5 w-5 mr-2" />
                      Add Product
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md w-[calc(100vw-2rem)] sm:w-full max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-xl border border-border/20 rounded-3xl shadow-2xl">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-semibold text-primary-dark">
                        {editingProduct ? 'Edit Product' : 'Add New Product'}
                      </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="title" className="text-sm font-medium">Product Name</Label>
                        <Input
                          id="title"
                          value={formData.title}
                          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                          className="border-border/30 focus:border-primary-dark rounded-2xl bg-background/50 backdrop-blur-sm"
                          placeholder="Enter product name"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description" className="text-sm font-medium">Description</Label>
                        <Textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          className="border-border/30 focus:border-primary-dark resize-none rounded-2xl bg-background/50 backdrop-blur-sm"
                          placeholder="Product description..."
                          rows={3}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="price" className="text-sm font-medium">Price (RON)</Label>
                          <Input
                            id="price"
                            type="number"
                            step="0.01"
                            value={formData.price}
                            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                            className="border-border/30 focus:border-primary-dark rounded-2xl bg-background/50 backdrop-blur-sm"
                            placeholder="0.00"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="stock" className="text-sm font-medium">Stock</Label>
                          <Input
                            id="stock"
                            type="number"
                            value={formData.stock}
                            onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                            className="border-border/30 focus:border-primary-dark rounded-2xl bg-background/50 backdrop-blur-sm"
                            placeholder="0"
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="low_stock_threshold" className="text-sm font-medium">Low Stock Alert Threshold</Label>
                        <Input
                          id="low_stock_threshold"
                          type="number"
                          value={formData.low_stock_threshold}
                          onChange={(e) => setFormData({ ...formData, low_stock_threshold: e.target.value })}
                          className="border-border/30 focus:border-primary-dark rounded-2xl bg-background/50 backdrop-blur-sm"
                          placeholder="5"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="category" className="text-sm font-medium">Category</Label>
                        <Input
                          id="category"
                          value={formData.category}
                          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                          className="border-border/30 focus:border-primary-dark rounded-2xl bg-background/50 backdrop-blur-sm"
                          placeholder="e.g. Electronics, Clothing"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sku" className="text-sm font-medium">SKU</Label>
                        <Input
                          id="sku"
                          value={formData.sku}
                          onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                          className="border-border/30 focus:border-primary-dark rounded-2xl bg-background/50 backdrop-blur-sm"
                          placeholder="Product SKU"
                        />
                      </div>
                      <div className="flex gap-3 pt-4">
                        <Button 
                          type="submit" 
                          disabled={createProductMutation.isPending || updateProductMutation.isPending}
                          className="flex-1 bg-gradient-apple hover:shadow-elegant transition-all duration-200 border-0 rounded-2xl font-medium"
                        >
                          {editingProduct ? 'Update' : 'Create'} Product
                        </Button>
                        <Button type="button" variant="outline" onClick={resetForm} className="border-border/30 rounded-2xl bg-background/50 backdrop-blur-sm hover:bg-muted/50">
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </div>

        {/* Professional Control Panel */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 rounded-2xl border-border/30 bg-background/80 backdrop-blur-sm focus:border-primary-dark transition-colors"
                />
              </div>
            </div>
            <ToggleGroup type="single" value={viewMode} onValueChange={(value: 'grid' | 'list') => value && setViewMode(value)}>
              <ToggleGroupItem value="grid" aria-label="Grid view" className="rounded-xl">
                <Grid className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="List view" className="rounded-xl">
                <List className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Products Display */}
          {filteredProducts.length === 0 ? (
            <Card className="border-border/30 rounded-2xl bg-background/80 backdrop-blur-sm">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <CardTitle className="text-lg mb-2">No products found</CardTitle>
                <CardDescription>
                  {searchQuery ? 'Try adjusting your search terms' : 'Create your first product to get started'}
                </CardDescription>
              </CardContent>
            </Card>
          ) : (
            viewMode === 'grid' ? (
              <ResponsiveProductTable
                products={filteredProducts}
                productImages={productImages || []}
                discounts={discounts || []}
                productDiscounts={productDiscounts || []}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onManageImages={setImageDialogProduct}
                onProductClick={setSelectedProduct}
              />
            ) : (
              <ProductListView
                products={filteredProducts}
                discounts={discounts || []}
                productDiscounts={productDiscounts || []}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onManageImages={setImageDialogProduct}
                onProductClick={setSelectedProduct}
              />
            )
          )}
        </div>
      </TabsContent>

      <TabsContent value="collections" className="space-y-6">
        <CollectionsManagement />
      </TabsContent>

      <TabsContent value="discounts" className="space-y-6">
        <DiscountManagement />
      </TabsContent>
      </Tabs>

      {/* Product Images Management Modal */}
      {imageDialogProduct && (
        <Dialog open={!!imageDialogProduct} onOpenChange={(open) => !open && setImageDialogProduct(null)}>
          <DialogContent className="max-w-4xl bg-background/95 backdrop-blur-xl border border-border/20 rounded-3xl shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-primary-dark">
                Manage Product Images - {imageDialogProduct.title}
              </DialogTitle>
            </DialogHeader>
            <ProductImageUpload
              productId={imageDialogProduct.id}
              onImagesChange={() => queryClient.invalidateQueries({ queryKey: ['products'] })}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onEdit={handleEdit}
        onManageImages={setImageDialogProduct}
      />
    </div>
  );
};

export default ProductManagement;