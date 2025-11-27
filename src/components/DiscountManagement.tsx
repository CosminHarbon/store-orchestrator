import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Percent, DollarSign, Calendar, Package, Sparkles, Zap } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Discount {
  id: string;
  name: string;
  description: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

interface Product {
  id: string;
  title: string;
  price: number;
}

interface ProductDiscount {
  product_id: string;
  discount_id: string;
}

const DiscountManagement = () => {
  const isMobile = useIsMobile();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    discount_type: 'percentage' as 'percentage' | 'fixed_amount',
    discount_value: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    is_active: true
  });

  const queryClient = useQueryClient();

  // Fetch discounts
  const { data: discounts, isLoading: loadingDiscounts } = useQuery({
    queryKey: ['discounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('discounts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Discount[];
    }
  });

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['products-for-discounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, title, price')
        .order('title');
      
      if (error) throw error;
      return data as Product[];
    }
  });

  // Fetch product discounts
  const { data: productDiscounts } = useQuery({
    queryKey: ['product-discounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_discounts')
        .select('*');
      
      if (error) throw error;
      return data as ProductDiscount[];
    }
  });

  // Get products for a specific discount
  const getDiscountProducts = (discountId: string) => {
    if (!productDiscounts || !products) return [];
    const discountProductIds = productDiscounts
      .filter(pd => pd.discount_id === discountId)
      .map(pd => pd.product_id);
    return products.filter(p => discountProductIds.includes(p.id));
  };

  // Create discount mutation
  const createDiscountMutation = useMutation({
    mutationFn: async (discountData: any) => {
      const { data, error } = await supabase
        .from('discounts')
        .insert({
          ...discountData,
          discount_value: parseFloat(discountData.discount_value),
          user_id: (await supabase.auth.getUser()).data.user?.id,
          start_date: new Date(discountData.start_date).toISOString(),
          end_date: discountData.end_date ? new Date(discountData.end_date).toISOString() : null
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: async (discount) => {
      // Add selected products to the discount
      if (selectedProducts.length > 0) {
        const productDiscountInserts = selectedProducts.map(productId => ({
          product_id: productId,
          discount_id: discount.id
        }));

        const { error } = await supabase
          .from('product_discounts')
          .insert(productDiscountInserts);

        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      queryClient.invalidateQueries({ queryKey: ['product-discounts'] });
      toast.success('Discount created successfully');
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to create discount');
      console.error(error);
    }
  });

  // Update discount mutation
  const updateDiscountMutation = useMutation({
    mutationFn: async ({ id, discountData }: { id: string; discountData: any }) => {
      const { data, error } = await supabase
        .from('discounts')
        .update({
          ...discountData,
          discount_value: parseFloat(discountData.discount_value),
          start_date: new Date(discountData.start_date).toISOString(),
          end_date: discountData.end_date ? new Date(discountData.end_date).toISOString() : null
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: async (discount) => {
      // Update product associations - first delete existing ones, then add new ones
      await supabase
        .from('product_discounts')
        .delete()
        .eq('discount_id', discount.id);

      if (selectedProducts.length > 0) {
        const productDiscountInserts = selectedProducts.map(productId => ({
          product_id: productId,
          discount_id: discount.id
        }));

        const { error } = await supabase
          .from('product_discounts')
          .insert(productDiscountInserts);

        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      queryClient.invalidateQueries({ queryKey: ['product-discounts'] });
      toast.success('Discount updated successfully');
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to update discount');
      console.error(error);
    }
  });

  // Delete discount mutation
  const deleteDiscountMutation = useMutation({
    mutationFn: async (id: string) => {
      // First delete product_discounts
      await supabase
        .from('product_discounts')
        .delete()
        .eq('discount_id', id);

      // Then delete the discount
      const { error } = await supabase
        .from('discounts')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      queryClient.invalidateQueries({ queryKey: ['product-discounts'] });
      toast.success('Discount deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete discount');
      console.error(error);
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      discount_type: 'percentage',
      discount_value: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      is_active: true
    });
    setSelectedProducts([]);
    setEditingDiscount(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (discount: Discount) => {
    setEditingDiscount(discount);
    setFormData({
      name: discount.name,
      description: discount.description || '',
      discount_type: discount.discount_type,
      discount_value: discount.discount_value.toString(),
      start_date: new Date(discount.start_date).toISOString().split('T')[0],
      end_date: discount.end_date ? new Date(discount.end_date).toISOString().split('T')[0] : '',
      is_active: discount.is_active
    });
    
    // Set selected products for this discount
    const discountProducts = getDiscountProducts(discount.id);
    setSelectedProducts(discountProducts.map(p => p.id));
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingDiscount) {
      updateDiscountMutation.mutate({ id: editingDiscount.id, discountData: formData });
    } else {
      createDiscountMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this discount?')) {
      deleteDiscountMutation.mutate(id);
    }
  };

  const handleProductSelect = (productId: string, checked: boolean) => {
    if (checked) {
      setSelectedProducts([...selectedProducts, productId]);
    } else {
      setSelectedProducts(selectedProducts.filter(id => id !== productId));
    }
  };

  if (loadingDiscounts) {
    return <div>Loading discounts...</div>;
  }

  return (
    <div className={`space-y-6 ${isMobile ? 'mobile-futuristic-container' : ''}`}>
      {/* Header */}
      <div className={`text-center space-y-4 ${isMobile ? 'relative z-10' : ''}`}>
        <div className={`space-y-2 ${isMobile ? 'animate-fade-in' : ''}`}>
          <h2 className={`text-3xl font-bold ${isMobile ? 'text-gradient bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent' : ''}`}>
            {isMobile ? (
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="h-8 w-8 text-primary animate-pulse" />
                Discounts
                <Zap className="h-8 w-8 text-accent animate-pulse" />
              </div>
            ) : (
              'Discounts'
            )}
          </h2>
          <p className={`text-muted-foreground text-lg ${isMobile ? 'animate-fade-in delay-200' : ''}`}>
            Create and manage product discounts
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              onClick={() => resetForm()} 
              className={`${isMobile 
                ? 'fixed bottom-20 right-6 z-50 w-14 h-14 rounded-full p-0 bg-gradient-to-br from-primary via-primary-glow to-accent shadow-2xl border-0 hover:scale-110 hover:shadow-glow transition-all duration-300 hover:animate-pulse' 
                : 'bg-gradient-primary hover:shadow-elegant transition-all duration-200 border-0 px-8 py-3 text-lg rounded-full'
              }`}
            >
              <Plus className={`${isMobile ? 'h-8 w-8' : 'h-5 w-5 mr-2'}`} />
              {!isMobile && 'Create Discount'}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl bg-background/95 backdrop-blur-xl border border-border/50 max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">
                {editingDiscount ? 'Edit Discount' : 'Create New Discount'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">Discount Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="border-border/50 focus:border-primary"
                    placeholder="e.g. Summer Sale"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="border-border/50 focus:border-primary resize-none"
                    placeholder="Describe your discount..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="discount_type" className="text-sm font-medium">Discount Type</Label>
                    <Select value={formData.discount_type} onValueChange={(value: 'percentage' | 'fixed_amount') => setFormData({ ...formData, discount_type: value })}>
                      <SelectTrigger className="border-border/50 focus:border-primary">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                        <SelectItem value="fixed_amount">Fixed Amount (RON)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="discount_value" className="text-sm font-medium">
                      {formData.discount_type === 'percentage' ? 'Percentage' : 'Amount (RON)'}
                    </Label>
                    <Input
                      id="discount_value"
                      type="number"
                      step="0.01"
                      min="0"
                      max={formData.discount_type === 'percentage' ? '100' : undefined}
                      value={formData.discount_value}
                      onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                      className="border-border/50 focus:border-primary"
                      placeholder={formData.discount_type === 'percentage' ? '20' : '10.00'}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start_date" className="text-sm font-medium">Start Date</Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      className="border-border/50 focus:border-primary"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="end_date" className="text-sm font-medium">End Date (Optional)</Label>
                    <Input
                      id="end_date"
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      className="border-border/50 focus:border-primary"
                    />
                  </div>
                </div>

                {/* Product Selection */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Select Products</Label>
                  <div className="border border-border/50 rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                    {products && products.length > 0 ? (
                      products.map((product) => (
                        <div key={product.id} className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded">
                          <Checkbox
                            id={`product-${product.id}`}
                            checked={selectedProducts.includes(product.id)}
                            onCheckedChange={(checked) => handleProductSelect(product.id, checked as boolean)}
                          />
                          <div className="flex-1">
                            <Label htmlFor={`product-${product.id}`} className="text-sm font-medium cursor-pointer">
                              {product.title}
                            </Label>
                            <p className="text-xs text-muted-foreground">{product.price.toFixed(2)} RON</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No products available</p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 pt-4">
                <Button 
                  type="submit" 
                  disabled={createDiscountMutation.isPending || updateDiscountMutation.isPending}
                  className="flex-1 bg-gradient-primary hover:shadow-elegant transition-all duration-200 border-0"
                >
                  {editingDiscount ? 'Update Discount' : 'Create Discount'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm} className="border-border/50">
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Discounts List */}
      {discounts && discounts.length > 0 ? (
        <div className={`grid gap-4 ${isMobile ? 'gap-6 px-4' : ''}`}>
          {discounts.map((discount) => {
            const discountProducts = getDiscountProducts(discount.id);
            const isActive = discount.is_active && 
              new Date(discount.start_date) <= new Date() && 
              (!discount.end_date || new Date(discount.end_date) >= new Date());

            return (
              <Card 
                key={discount.id} 
                className={`${isMobile 
                  ? 'bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl hover:shadow-glow transition-all duration-500 hover:scale-[1.02] hover:bg-gradient-to-br hover:from-card/90 hover:to-card/50' 
                  : 'bg-gradient-subtle border-border/50'
                }`}
              >
                <CardHeader className={`${isMobile ? 'pb-3 pt-6 px-6' : 'pb-4'}`}>
                  <div className={`flex justify-between items-start ${isMobile ? 'gap-4' : ''}`}>
                    <div className={`space-y-2 ${isMobile ? 'flex-1' : ''}`}>
                      <div className={`flex items-center gap-3 ${isMobile ? 'flex-wrap' : ''}`}>
                        <CardTitle className={`${isMobile ? 'text-xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent' : 'text-lg'}`}>
                          {discount.name}
                        </CardTitle>
                        <Badge 
                          variant={isActive ? "default" : "secondary"} 
                          className={`${isMobile 
                            ? `text-xs px-3 py-1 rounded-full ${isActive 
                              ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg animate-pulse' 
                              : 'bg-gradient-to-r from-gray-400 to-gray-500 text-white'
                            }` 
                            : 'text-xs'
                          }`}
                        >
                          {isActive ? (
                            isMobile ? (
                              <div className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                                Live
                              </div>
                            ) : 'Active'
                          ) : 'Inactive'}
                        </Badge>
                      </div>
                      {discount.description && (
                        <CardDescription className={`${isMobile ? 'text-sm text-muted-foreground/80 leading-relaxed' : 'text-sm'}`}>
                          {discount.description}
                        </CardDescription>
                      )}
                    </div>
                    <div className={`flex gap-2 ${isMobile ? 'flex-col shrink-0' : ''}`}>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleEdit(discount)}
                        className={`${isMobile 
                          ? 'border-white/30 bg-white/10 backdrop-blur-sm hover:bg-white/20 hover:scale-105 transition-all duration-300 rounded-full w-10 h-10 p-0' 
                          : 'border-border/50'
                        }`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleDelete(discount.id)}
                        className={`${isMobile 
                          ? 'border-red-300/30 bg-red-500/10 backdrop-blur-sm hover:bg-red-500/20 hover:scale-105 transition-all duration-300 rounded-full w-10 h-10 p-0 text-red-400 hover:text-red-300' 
                          : 'border-border/50 text-destructive hover:text-destructive'
                        }`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className={`space-y-4 ${isMobile ? 'px-6 pb-6' : ''}`}>
                  <div className={`flex items-center gap-6 text-sm ${isMobile ? 'flex-col items-stretch gap-3' : ''}`}>
                    <div className={`flex items-center gap-2 ${isMobile ? 'bg-gradient-to-r from-primary/10 to-accent/10 backdrop-blur-sm rounded-2xl px-4 py-3 border border-primary/20 justify-center' : ''}`}>
                      <span className={`font-medium ${isMobile ? 'text-primary font-bold text-base' : ''}`}>
                        {discount.discount_type === 'percentage' 
                           ? `${discount.discount_value}% off` 
                           : `${discount.discount_value} RON off`}
                      </span>
                    </div>
                    <div className={`flex items-center gap-2 ${isMobile ? 'bg-gradient-to-r from-muted/20 to-muted/10 backdrop-blur-sm rounded-2xl px-4 py-3 border border-muted/30 justify-center' : ''}`}>
                      <Calendar className={`h-4 w-4 ${isMobile ? 'text-accent' : 'text-muted-foreground'}`} />
                      <span className={`${isMobile ? 'text-accent font-medium text-sm text-center' : 'text-muted-foreground'}`}>
                        {format(new Date(discount.start_date), 'MMM d, yyyy')}
                        {discount.end_date && ` - ${format(new Date(discount.end_date), 'MMM d, yyyy')}`}
                      </span>
                    </div>
                    <div className={`flex items-center gap-2 ${isMobile ? 'bg-gradient-to-r from-accent/10 to-primary/10 backdrop-blur-sm rounded-2xl px-4 py-3 border border-accent/20 justify-center' : ''}`}>
                      <Package className={`h-4 w-4 ${isMobile ? 'text-accent' : 'text-muted-foreground'}`} />
                      <span className={`${isMobile ? 'text-accent font-medium' : 'text-muted-foreground'}`}>
                        {discountProducts.length} product{discountProducts.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  
                  {discountProducts.length > 0 && (
                    <div className={`border-t pt-3 ${isMobile ? 'border-white/20' : 'border-border/50'}`}>
                      <p className={`text-sm mb-2 ${isMobile ? 'text-muted-foreground/80 font-medium' : 'text-muted-foreground'}`}>
                        Applied to:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {discountProducts.slice(0, 3).map((product) => (
                          <Badge 
                            key={product.id} 
                            variant="secondary" 
                            className={`${isMobile 
                              ? 'text-xs bg-gradient-to-r from-secondary/80 to-secondary/60 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1' 
                              : 'text-xs'
                            }`}
                          >
                            {product.title}
                          </Badge>
                        ))}
                        {discountProducts.length > 3 && (
                          <Badge 
                            variant="secondary" 
                            className={`${isMobile 
                              ? 'text-xs bg-gradient-to-r from-primary/20 to-accent/20 backdrop-blur-sm border border-primary/30 rounded-full px-3 py-1 text-primary' 
                              : 'text-xs'
                            }`}
                          >
                            +{discountProducts.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className={`flex flex-col items-center justify-center py-16 space-y-4 ${isMobile ? 'px-6 py-24' : ''}`}>
          <div className={`${isMobile 
            ? 'w-32 h-32 bg-gradient-to-br from-primary/20 via-accent/20 to-primary-glow/20 rounded-full flex items-center justify-center backdrop-blur-xl border border-white/20 shadow-2xl animate-pulse' 
            : 'w-24 h-24 bg-gradient-primary/10 rounded-full flex items-center justify-center'
          }`}>
            <Percent className={`${isMobile ? 'h-16 w-16 text-primary animate-bounce' : 'h-12 w-12 text-primary'}`} />
          </div>
          <div className={`text-center space-y-2 ${isMobile ? 'animate-fade-in delay-300' : ''}`}>
            <h3 className={`text-lg font-semibold ${isMobile ? 'text-2xl font-bold text-gradient bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent' : ''}`}>
              {isMobile ? '✨ No discounts yet ✨' : 'No discounts yet'}
            </h3>
            <p className={`text-muted-foreground max-w-md ${isMobile ? 'text-base leading-relaxed' : ''}`}>
              {isMobile 
                ? '🚀 Create your first futuristic discount to start offering special prices to your customers.'
                : 'Create your first discount to start offering special prices to your customers.'
              }
            </p>
          </div>
          {!isMobile && (
            <Button 
              onClick={() => setIsDialogOpen(true)} 
              className="bg-gradient-primary hover:shadow-elegant transition-all duration-200 border-0"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Discount
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default DiscountManagement;