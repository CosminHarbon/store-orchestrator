import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Star, StarOff, ArrowUp, ArrowDown, Trash2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mapPool, uploadMedia } from '@/lib/media/uploadMedia';
import { deleteMediaAsset } from '@/lib/media/deleteMedia';
import { merchantMediaMessage } from '@/lib/media/errors';
import { takeInputFiles } from '@/lib/media/inputFiles';

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
  const { t } = useTranslation('common');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [phase, setPhase] = useState<'optimizing' | 'uploading' | 'finalizing' | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);

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
    enabled: !!productId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['product-images', productId] });
    queryClient.invalidateQueries({ queryKey: ['all-product-images'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['media-usage'] });
    onImagesChange?.();
  };

  const uploadImageMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const medias = await mapPool(files, 2, async (file) =>
        uploadMedia({
          file,
          mediaType: 'product',
          relatedEntityId: productId,
          onProgress: setPhase,
        }),
      );
      let maxOrder = images && images.length > 0 ? Math.max(...images.map((img) => img.display_order)) : 0;
      let primaryNeeded = !images?.length;
      for (const uploaded of medias) {
        maxOrder += 1;
        const { error } = await supabase.from('product_images').insert({
          product_id: productId,
          image_url: uploaded.publicUrl,
          is_primary: primaryNeeded,
          display_order: maxOrder,
        });
        if (error) {
          await deleteMediaAsset({ assetId: uploaded.assetId });
          throw error;
        }
        primaryNeeded = false;
      }
      return medias;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Image uploaded successfully');
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast.error(merchantMediaMessage(error, t));
      console.error(error);
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (imageId: string) => {
      await supabase.from('product_images').update({ is_primary: false }).eq('product_id', productId);
      const { error } = await supabase.from('product_images').update({ is_primary: true }).eq('id', imageId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Primary image updated');
    },
    onError: (error) => {
      toast.error('Failed to update primary image');
      console.error(error);
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({ imageId, newOrder }: { imageId: string; newOrder: number }) => {
      const { error } = await supabase.from('product_images').update({ display_order: newOrder }).eq('id', imageId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-images', productId] });
      toast.success('Image order updated');
    },
    onError: (error) => {
      toast.error('Failed to update image order');
      console.error(error);
    },
  });

  const deleteImageMutation = useMutation({
    mutationFn: async (image: ProductImage) => {
      const { error } = await supabase.from('product_images').delete().eq('id', image.id);
      if (error) throw error;
      await deleteMediaAsset({ publicUrl: image.image_url });
    },
    onSuccess: () => {
      invalidate();
      toast.success('Image deleted successfully');
    },
    onError: (error) => {
      toast.error(merchantMediaMessage(error, t));
      console.error(error);
    },
  });

  const handleFileUpload = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/') || !f.type);
    if (!files.length) return;
    setUploading(true);
    try {
      await uploadImageMutation.mutateAsync(files);
    } catch {
      /* surfaced by the mutation's onError toast */
    } finally {
      setUploading(false);
      setPhase(null);
    }
  };

  const moveImage = (imageId: string, direction: 'up' | 'down') => {
    if (!images) return;
    const currentIndex = images.findIndex((img) => img.id === imageId);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;
    const currentImage = images[currentIndex];
    const targetImage = images[targetIndex];
    updateOrderMutation.mutate({ imageId: currentImage.id, newOrder: targetImage.display_order });
    updateOrderMutation.mutate({ imageId: targetImage.id, newOrder: currentImage.display_order });
  };

  if (isLoading) return <div>Loading images...</div>;

  const phaseLabel =
    phase === 'optimizing'
      ? t('media.optimizing')
      : phase === 'finalizing'
        ? t('media.finalizing')
        : t('media.uploading');

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
                <DialogTitle className="text-xl font-semibold">Upload image</DialogTitle>
              </DialogHeader>
              <div
                className={`relative border-2 border-dashed rounded-xl p-8 transition-all ${
                  dragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-border/50 hover:border-primary/50 hover:bg-muted/50'
                } ${uploading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const dropped = e.dataTransfer.files;
                  if (dropped?.length) void handleFileUpload(dropped);
                }}
                onClick={() => photoInputRef.current?.click()}
              >
                <div className="text-center space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium text-lg">{dragActive ? 'Drop your image here' : 'Upload photo'}</h3>
                  <p className="text-xs text-muted-foreground">{t('media.photoHint')}</p>
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  onChange={(e) => {
                    const files = takeInputFiles(e.target);
                    if (files.length) void handleFileUpload(files);
                  }}
                  className="hidden"
                  disabled={uploading}
                />
              </div>
              {uploading && (
                <div className="flex items-center justify-center gap-3 p-4 bg-muted/50 rounded-lg">
                  <span className="font-medium">{phaseLabel}</span>
                </div>
              )}
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
                    variant={image.is_primary ? 'default' : 'secondary'}
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
                      if (confirm('Delete this image?')) deleteImageMutation.mutate(image);
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
          <div className="text-center py-4 text-muted-foreground text-sm">No images uploaded yet</div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProductImageUpload;
