import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Upload, Star, StarOff, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  is_primary: boolean;
  display_order: number;
}

interface ProductImageUploadProps {
  productId: string;
  onImagesChange?: () => void;
}

const ProductImageUpload = ({ productId, onImagesChange }: ProductImageUploadProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  const { data: images, isLoading } = useQuery({
    queryKey: ['product-images', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_images')
        .select('*')
        .eq('product_id', productId)
        .order('display_order', { ascending: true });
      
      if (error) throw error;
      return data as ProductImage[];
    },
    enabled: !!productId
  });

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('Not authenticated');
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.data.user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file);
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);
      
      const maxOrder = Math.max(...(images?.map(img => img.display_order) || [0]));
      
      const { data, error } = await supabase
        .from('product_images')
        .insert({
          product_id: productId,
          image_url: publicUrl,
          is_primary: images?.length === 0,
          display_order: maxOrder + 1
        })
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-images', productId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onImagesChange?.();
      toast.success('Image uploaded successfully');
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast.error('Failed to upload image');
      console.error(error);
    }
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (imageId: string) => {
      // First, unset all primary images for this product
      await supabase
        .from('product_images')
        .update({ is_primary: false })
        .eq('product_id', productId);
      
      // Then set the selected image as primary
      const { error } = await supabase
        .from('product_images')
        .update({ is_primary: true })
        .eq('id', imageId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-images', productId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onImagesChange?.();
      toast.success('Primary image updated');
    },
    onError: (error) => {
      toast.error('Failed to update primary image');
      console.error(error);
    }
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({ imageId, newOrder }: { imageId: string; newOrder: number }) => {
      const { error } = await supabase
        .from('product_images')
        .update({ display_order: newOrder })
        .eq('id', imageId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-images', productId] });
      toast.success('Image order updated');
    },
    onError: (error) => {
      toast.error('Failed to update image order');
      console.error(error);
    }
  });

  const deleteImageMutation = useMutation({
    mutationFn: async (image: ProductImage) => {
      // Delete from storage
      const urlParts = image.image_url.split('/');
      const fileName = `${urlParts[urlParts.length - 2]}/${urlParts[urlParts.length - 1]}`;
      
      await supabase.storage
        .from('product-images')
        .remove([fileName]);
      
      // Delete from database
      const { error } = await supabase
        .from('product_images')
        .delete()
        .eq('id', image.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-images', productId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onImagesChange?.();
      toast.success('Image deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete image');
      console.error(error);
    }
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }
    
    setUploading(true);
    try {
      await uploadImageMutation.mutateAsync(file);
    } finally {
      setUploading(false);
    }
  };

  const moveImage = (imageId: string, direction: 'up' | 'down') => {
    if (!images) return;
    
    const currentIndex = images.findIndex(img => img.id === imageId);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (targetIndex < 0 || targetIndex >= images.length) return;
    
    const currentImage = images[currentIndex];
    const targetImage = images[targetIndex];
    
    updateOrderMutation.mutate({ imageId: currentImage.id, newOrder: targetImage.display_order });
    updateOrderMutation.mutate({ imageId: targetImage.id, newOrder: currentImage.display_order });
  };

  if (isLoading) {
    return <div>Loading images...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm">Product Images</CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                Add Image
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Product Image</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="image-upload" className="block text-sm font-medium">
                    Select Image
                  </label>
                  <Input
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Max file size: 5MB. Supported formats: JPG, PNG, GIF, WebP
                  </p>
                </div>
                {uploading && (
                  <div className="flex items-center gap-2">
                    <Upload className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Uploading...</span>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {images && images.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {images.map((image, index) => (
              <div key={image.id} className="relative group">
                <img
                  src={image.image_url}
                  alt={`Product image ${index + 1}`}
                  className="w-full h-24 object-cover rounded border"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center gap-1">
                  <Button
                    size="sm"
                    variant={image.is_primary ? "default" : "secondary"}
                    onClick={() => setPrimaryMutation.mutate(image.id)}
                    className="h-6 w-6 p-0"
                  >
                    {image.is_primary ? <Star className="h-3 w-3" /> : <StarOff className="h-3 w-3" />}
                  </Button>
                  {index > 0 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => moveImage(image.id, 'up')}
                      className="h-6 w-6 p-0"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                  )}
                  {index < images.length - 1 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => moveImage(image.id, 'down')}
                      className="h-6 w-6 p-0"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (confirm('Delete this image?')) {
                        deleteImageMutation.mutate(image);
                      }
                    }}
                    className="h-6 w-6 p-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                {image.is_primary && (
                  <div className="absolute top-1 left-1 bg-primary text-primary-foreground px-1 py-0.5 rounded text-xs">
                    Primary
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No images uploaded yet
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProductImageUpload;