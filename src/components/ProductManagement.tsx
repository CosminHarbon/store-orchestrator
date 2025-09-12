import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Images, Folder, Package, Search, Grid, List, Percent } from 'lucide-react';
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
    <Tabs defaultValue="products" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="products" className="flex items-center gap-2">
          <Package className="h-4 w-4" />
          Products
        </TabsTrigger>
        <TabsTrigger value="collections" className="flex items-center gap-2">
          <Folder className="h-4 w-4" />
          Collections
        </TabsTrigger>
        <TabsTrigger value="discounts" className="flex items-center gap-2">
          <Percent className="h-4 w-4" />
          Discounts
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="products" className="space-y-6">
        {/* Hero Header Section */}
        <div className="relative overflow-hidden bg-gradient-primary rounded-2xl p-8 text-white shadow-glow">
          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                    <Package className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Product Manager</h1>
                    <p className="text-white/80 text-base lg:text-lg">Build and organize your inventory</p>
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
                      className="bg-white text-primary hover:bg-white/90 transition-all duration-300 border-0 px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl"
                    >
                      <Plus className="h-5 w-5 mr-2" />
                      Add Product
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border border-border/50 rounded-2xl">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-semibold">
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
                          className="border-border/50 focus:border-primary rounded-xl"
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
                          className="border-border/50 focus:border-primary resize-none rounded-xl text-base md:text-sm"
                          placeholder="Product description..."
                          rows={3}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="price" className="text-sm font-medium">Price ($)</Label>
                          <Input
                            id="price"
                            type="number"
                            step="0.01"
                            value={formData.price}
                            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                            className="border-border/50 focus:border-primary rounded-xl"
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
                            className="border-border/50 focus:border-primary rounded-xl"
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
                          className="border-border/50 focus:border-primary rounded-xl"
                          placeholder="5"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="category" className="text-sm font-medium">Category</Label>
                        <Input
                          id="category"
                          value={formData.category}
                          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                          className="border-border/50 focus:border-primary rounded-xl"
                          placeholder="e.g. Electronics, Clothing"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sku" className="text-sm font-medium">SKU</Label>
                        <Input
                          id="sku"
                          value={formData.sku}
                          onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                          className="border-border/50 focus:border-primary rounded-xl"
                          placeholder="Product SKU"
                        />
                      </div>
                      <div className="flex gap-3 pt-4">
                        <Button 
                          type="submit" 
                          disabled={createProductMutation.isPending || updateProductMutation.isPending}
                          className="flex-1 bg-gradient-primary hover:shadow-elegant transition-all duration-200 border-0 rounded-xl"
                        >
                          {editingProduct ? 'Update' : 'Create'} Product
                        </Button>
                        <Button type="button" variant="outline" onClick={resetForm} className="border-border/50 rounded-xl">
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
          
          {/* Decorative Elements */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-8 translate-x-8"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-8 -translate-x-8"></div>
          <div className="absolute top-1/2 right-1/4 w-16 h-16 bg-white/5 rounded-full"></div>
        </div>

        {/* Controls Section */}
        <div className="bg-gradient-card rounded-xl p-6 shadow-card border border-border/50">
          <div className="flex flex-col lg:flex-row gap-6 lg:items-center lg:justify-between">
            {/* Search Section */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search products by name, category, or SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 pr-4 h-12 border-border/50 focus:border-primary rounded-xl bg-background/50 backdrop-blur-sm"
                />
              </div>
              {searchQuery && (
                <p className="text-sm text-muted-foreground mt-2 ml-1">
                  {filteredProducts?.length || 0} products found
                </p>
              )}
            </div>

            {/* View Controls */}
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-foreground">View Mode</span>
              <div className="flex items-center bg-muted/30 backdrop-blur-sm rounded-xl p-1 border border-border/50">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="h-9 px-4 rounded-lg transition-all duration-200 font-medium"
                >
                  <Grid className="h-4 w-4 mr-2" />
                  Grid
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="h-9 px-4 rounded-lg transition-all duration-200 font-medium"
                >
                  <List className="h-4 w-4 mr-2" />
                  List
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Products View */}
        {filteredProducts && filteredProducts.length > 0 ? (
          <ProductListView
            products={filteredProducts}
            discounts={discounts}
            productDiscounts={productDiscounts}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onManageImages={(product) => setImageDialogProduct(product)}
            onProductClick={(product) => setSelectedProduct(product)}
          />
        ) : (
          <div className="text-center py-12">
            <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground mb-2">
              {searchQuery ? 'No products found' : 'No products yet'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery ? 'Try adjusting your search terms' : 'Get started by adding your first product'}
            </p>
            {!searchQuery && (
              <Button onClick={() => setIsDialogOpen(true)} className="bg-gradient-primary hover:shadow-elegant border-0 rounded-xl">
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            )}
          </div>
        )}

        {/* Product Image Management Dialog */}
        {imageDialogProduct && (
          <Dialog open={!!imageDialogProduct} onOpenChange={() => setImageDialogProduct(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Manage Images - {imageDialogProduct.title}</DialogTitle>
              </DialogHeader>
              <ProductImageUpload 
                productId={imageDialogProduct.id}
                onImagesChange={() => {
                  queryClient.invalidateQueries({ queryKey: ['all-product-images'] });
                }}
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
      </TabsContent>

      <TabsContent value="collections">
        <CollectionsManagement />
      </TabsContent>

      <TabsContent value="discounts">
        <DiscountManagement />
      </TabsContent>
    </Tabs>
  );
};

export default ProductManagement;