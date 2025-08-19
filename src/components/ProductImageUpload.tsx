import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Upload, Star, StarOff, ArrowUp, ArrowDown, Trash2, Camera, Video, FileText, ImageIcon } from 'lucide-react';
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
  const [dragActive, setDragActive] = useState(false);
  const [uploadType, setUploadType] = useState<'photo' | 'video' | 'file'>('photo');
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const fileName = `${user.data.user.id}/${productId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file);
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);
      
      const maxOrder = images && images.length > 0 ? Math.max(...images.map(img => img.display_order)) : 0;
      
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
      // Extract the full path from the URL for the new structure: user_id/product_id/filename
      const urlParts = image.image_url.split('/');
      const fileName = urlParts.slice(-3).join('/'); // Get the last 3 parts: user_id/product_id/filename
      
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

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    
    // File type validation based on upload type
    if (uploadType === 'photo' && !file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    
    if (uploadType === 'video' && !file.type.startsWith('video/')) {
      toast.error('Please select a video file');
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }
    
    setUploading(true);
    try {
      await uploadImageMutation.mutateAsync(file);
    } finally {
      setUploading(false);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const triggerFileInput = () => {
    if (uploadType === 'photo' && photoInputRef.current) {
      photoInputRef.current.click();
    } else if (uploadType === 'video' && videoInputRef.current) {
      videoInputRef.current.click();
    } else if (uploadType === 'file' && fileInputRef.current) {
      fileInputRef.current.click();
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
            <DialogContent className="max-w-2xl bg-background/95 backdrop-blur-xl border border-border/50">
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold">Upload Media</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                {/* Upload Type Selection */}
                <div className="flex gap-2 p-1 bg-muted rounded-lg">
                  <button
                    onClick={() => setUploadType('photo')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-all ${
                      uploadType === 'photo' 
                        ? 'bg-background shadow-sm text-foreground' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Camera className="h-4 w-4" />
                    Photo
                  </button>
                  <button
                    onClick={() => setUploadType('video')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-all ${
                      uploadType === 'video' 
                        ? 'bg-background shadow-sm text-foreground' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Video className="h-4 w-4" />
                    Video
                  </button>
                  <button
                    onClick={() => setUploadType('file')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-all ${
                      uploadType === 'file' 
                        ? 'bg-background shadow-sm text-foreground' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <FileText className="h-4 w-4" />
                    File
                  </button>
                </div>

                {/* Drag and Drop Area */}
                <div
                  className={`relative border-2 border-dashed rounded-xl p-8 transition-all ${
                    dragActive 
                      ? 'border-primary bg-primary/5 scale-102' 
                      : 'border-border/50 hover:border-primary/50 hover:bg-muted/50'
                  } ${uploading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={triggerFileInput}
                >
                  <div className="text-center space-y-4">
                    <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                      dragActive ? 'bg-primary text-primary-foreground scale-110' : 'bg-muted text-muted-foreground'
                    }`}>
                      {uploadType === 'photo' && <ImageIcon className="h-6 w-6" />}
                      {uploadType === 'video' && <Video className="h-6 w-6" />}
                      {uploadType === 'file' && <FileText className="h-6 w-6" />}
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="font-medium text-lg">
                        {dragActive ? 'Drop your file here' : `Upload ${uploadType}`}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Drag and drop or click to browse
                      </p>
                    </div>
                    
                    <div className="text-xs text-muted-foreground space-y-1">
                      {uploadType === 'photo' && (
                        <>
                          <p>Supported: JPG, PNG, GIF, WebP</p>
                          <p>Max size: 10MB</p>
                        </>
                      )}
                      {uploadType === 'video' && (
                        <>
                          <p>Supported: MP4, MOV, AVI, WebM</p>
                          <p>Max size: 10MB</p>
                        </>
                      )}
                      {uploadType === 'file' && (
                        <>
                          <p>Supported: PDF, DOC, DOCX, TXT</p>
                          <p>Max size: 10MB</p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Hidden file inputs */}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleInputChange}
                    className="hidden"
                    disabled={uploading}
                  />
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleInputChange}
                    className="hidden"
                    disabled={uploading}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleInputChange}
                    className="hidden"
                    disabled={uploading}
                  />
                </div>

                {/* Upload Progress */}
                {uploading && (
                  <div className="flex items-center justify-center gap-3 p-4 bg-muted/50 rounded-lg">
                    <Upload className="h-5 w-5 animate-spin text-primary" />
                    <span className="font-medium">Uploading your {uploadType}...</span>
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