import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Percent, DollarSign, Calendar, Package } from 'lucide-react';
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
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold">Discounts</h2>
          <p className="text-muted-foreground text-lg">Create and manage product discounts</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              onClick={() => resetForm()} 
              className="bg-gradient-primary hover:shadow-elegant transition-all duration-200 border-0 px-8 py-3 text-lg rounded-full"
            >
              <Plus className="h-5 w-5 mr-2" />
              Create Discount
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
        <div className="grid gap-4">
          {discounts.map((discount) => {
            const discountProducts = getDiscountProducts(discount.id);
            const isActive = discount.is_active && 
              new Date(discount.start_date) <= new Date() && 
              (!discount.end_date || new Date(discount.end_date) >= new Date());

            return (
              <Card key={discount.id} className="bg-gradient-subtle border-border/50">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-lg">{discount.name}</CardTitle>
                        <Badge variant={isActive ? "default" : "secondary"} className="text-xs">
                          {isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      {discount.description && (
                        <CardDescription className="text-sm">{discount.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleEdit(discount)}
                        className="border-border/50"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleDelete(discount.id)}
                        className="border-border/50 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      {discount.discount_type === 'percentage' ? (
                        <Percent className="h-4 w-4 text-primary" />
                      ) : (
                        <DollarSign className="h-4 w-4 text-primary" />
                      )}
                      <span className="font-medium">
                        {discount.discount_type === 'percentage' 
                           ? `${discount.discount_value}% off` 
                           : `${discount.discount_value} RON off`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {format(new Date(discount.start_date), 'MMM d, yyyy')}
                        {discount.end_date && ` - ${format(new Date(discount.end_date), 'MMM d, yyyy')}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{discountProducts.length} products</span>
                    </div>
                  </div>
                  
                  {discountProducts.length > 0 && (
                    <div className="border-t border-border/50 pt-3">
                      <p className="text-sm text-muted-foreground mb-2">Applied to:</p>
                      <div className="flex flex-wrap gap-2">
                        {discountProducts.slice(0, 3).map((product) => (
                          <Badge key={product.id} variant="secondary" className="text-xs">
                            {product.title}
                          </Badge>
                        ))}
                        {discountProducts.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
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
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="w-24 h-24 bg-gradient-primary/10 rounded-full flex items-center justify-center">
            <Percent className="h-12 w-12 text-primary" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold">No discounts yet</h3>
            <p className="text-muted-foreground max-w-md">
              Create your first discount to start offering special prices to your customers.
            </p>
          </div>
          <Button 
            onClick={() => setIsDialogOpen(true)} 
            className="bg-gradient-primary hover:shadow-elegant transition-all duration-200 border-0"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Discount
          </Button>
        </div>
      )}
    </div>
  );
};

export default DiscountManagement;