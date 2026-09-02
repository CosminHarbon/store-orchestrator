import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { uploadMedia } from '@/lib/media/uploadMedia';
import { deleteMediaAsset, deletePreviousMedia } from '@/lib/media/deleteMedia';
import { merchantMediaMessage } from '@/lib/media/errors';

interface CollectionImageUploadProps {
  collectionId?: string;
  currentImageUrl?: string;
  onImageChange: (imageUrl: string) => void;
  onImageRemove: () => void;
}

const CollectionImageUpload = ({
  collectionId,
  currentImageUrl,
  onImageChange,
  onImageRemove,
}: CollectionImageUploadProps) => {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [phase, setPhase] = useState<'optimizing' | 'uploading' | 'finalizing' | null>(null);

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!collectionId) throw new Error('collection_required');
      const previous = currentImageUrl;
      const uploaded = await uploadMedia({
        file,
        mediaType: 'collection',
        relatedEntityId: collectionId,
        onProgress: setPhase,
      });
      const { error } = await supabase
        .from('collections')
        .update({ image_url: uploaded.publicUrl })
        .eq('id', collectionId);
      if (error) {
        await deleteMediaAsset({ assetId: uploaded.assetId });
        throw error;
      }
      onImageChange(uploaded.publicUrl);
      if (previous && previous !== uploaded.publicUrl) {
        await deletePreviousMedia(previous);
      }
      return uploaded;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-usage'] });
      toast.success('Image uploaded successfully');
    },
    onError: (error) => {
      toast.error(merchantMediaMessage(error, t));
      console.error(error);
    },
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      await uploadImageMutation.mutateAsync(file);
    } finally {
      setUploading(false);
      setPhase(null);
    }
  };

  const handleRemoveImage = async () => {
    if (!collectionId) return;
    const previous = currentImageUrl;
    const { error } = await supabase
      .from('collections')
      .update({ image_url: null })
      .eq('id', collectionId);
    if (error) {
      toast.error(merchantMediaMessage(error, t));
      return;
    }
    onImageRemove();
    await deletePreviousMedia(previous);
    queryClient.invalidateQueries({ queryKey: ['media-usage'] });
    toast.success('Image removed');
  };

  const phaseLabel =
    phase === 'optimizing'
      ? t('media.optimizing')
      : phase === 'finalizing'
        ? t('media.finalizing')
        : t('media.uploading');

  if (currentImageUrl) {
    return (
      <div className="space-y-4">
        <div className="relative group">
          <div className="aspect-video w-full bg-muted rounded-lg overflow-hidden">
            <img src={currentImageUrl} alt="Collection" className="w-full h-full object-cover" />
          </div>
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => document.getElementById('collection-image-input')?.click()}
              disabled={uploading}
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? phaseLabel : 'Change'}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => void handleRemoveImage()}>
              <Trash2 className="h-4 w-4 mr-2" />
              Remove
            </Button>
          </div>
        </div>
        <input
          id="collection-image-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="aspect-video w-full border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group"
        onClick={() => document.getElementById('collection-image-input')?.click()}
      >
        <div className="text-center p-6">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
            <Plus className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-sm font-medium mb-2">Add Collection Image</h3>
          <p className="text-xs text-muted-foreground">{t('media.photoHint')}</p>
        </div>
        {uploading && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
            <span className="text-sm">{phaseLabel}</span>
          </div>
        )}
      </div>
      <input
        id="collection-image-input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileSelect}
        className="hidden"
        disabled={uploading}
      />
    </div>
  );
};

export default CollectionImageUpload;
