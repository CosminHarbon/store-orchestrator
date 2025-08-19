import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus, Upload, Trash2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  onImageRemove 
}: CollectionImageUploadProps) => {
  const [uploading, setUploading] = useState(false);

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('Not authenticated');
      
      const fileExt = file.name.split('.').pop();
      const fileName = `collections/${user.data.user.id}/${collectionId || 'temp'}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file);
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);
      
      return publicUrl;
    },
    onSuccess: (publicUrl) => {
      onImageChange(publicUrl);
      toast.success('Image uploaded successfully');
    },
    onError: (error) => {
      toast.error('Failed to upload image');
      console.error(error);
    }
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
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

  const handleRemoveImage = () => {
    onImageRemove();
    toast.success('Image removed');
  };

  if (currentImageUrl) {
    return (
      <div className="space-y-4">
        <div className="relative group">
          <div className="aspect-video w-full bg-muted rounded-lg overflow-hidden">
            <img
              src={currentImageUrl}
              alt="Collection"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => document.getElementById('collection-image-input')?.click()}
              disabled={uploading}
            >
              <Upload className="h-4 w-4 mr-2" />
              Change
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleRemoveImage}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove
            </Button>
          </div>
        </div>
        <input
          id="collection-image-input"
          type="file"
          accept="image/*"
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
          <p className="text-xs text-muted-foreground">
            Click to upload an image for this collection
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            PNG, JPG, JPEG up to 5MB
          </p>
        </div>
        {uploading && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm">Uploading...</span>
            </div>
          </div>
        )}
      </div>
      <input
        id="collection-image-input"
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={uploading}
      />
    </div>
  );
};

export default CollectionImageUpload;