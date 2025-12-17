import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Palette, Save, Eye, Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface TemplateCustomization {
  id?: string;
  user_id: string;
  template_id: string;
  primary_color: string;
  background_color: string;
  text_color: string;
  accent_color: string;
  hero_image_url: string | null;
  logo_url: string | null;
  hero_title: string;
  hero_subtitle: string;
  hero_button_text: string;
  store_name: string;
  show_reviews: boolean;
}

export const TemplateCustomizer = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState({ hero: false, logo: false });
  
  const [customization, setCustomization] = useState<TemplateCustomization>({
    user_id: user?.id || '',
    template_id: 'elementar',
    primary_color: '#000000',
    background_color: '#FFFFFF',
    text_color: '#000000',
    accent_color: '#666666',
    hero_image_url: null,
    logo_url: null,
    hero_title: 'Welcome to Our Store',
    hero_subtitle: 'Discover amazing products',
    hero_button_text: 'Shop now',
    store_name: 'My Store',
    show_reviews: true
  });

  const { data: existingCustomization, isLoading } = useQuery({
    queryKey: ['template-customization', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_customization')
        .select('*')
        .eq('user_id', user?.id)
        .eq('template_id', 'elementar')
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data as TemplateCustomization | null;
    },
    enabled: !!user
  });

  useEffect(() => {
    if (existingCustomization) {
      setCustomization(existingCustomization);
    }
  }, [existingCustomization]);

  const updateCustomizationMutation = useMutation({
    mutationFn: async (data: TemplateCustomization) => {
      const { error } = await supabase
        .from('template_customization')
        .upsert({
          ...data,
          user_id: user?.id,
          template_id: 'elementar'
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-customization'] });
      toast.success('Template settings saved successfully');
    },
    onError: (error) => {
      toast.error('Failed to save template settings');
      console.error(error);
    }
  });

  const uploadImage = async (file: File, type: 'hero' | 'logo') => {
    if (!user) return;
    
    setUploading({ ...uploading, [type]: true });
    
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${type}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('template-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('template-images')
        .getPublicUrl(fileName);

      setCustomization({
        ...customization,
        [type === 'hero' ? 'hero_image_url' : 'logo_url']: publicUrl
      });

      toast.success(`${type === 'hero' ? 'Hero image' : 'Logo'} uploaded successfully`);
    } catch (error) {
      toast.error(`Failed to upload ${type === 'hero' ? 'hero image' : 'logo'}`);
      console.error(error);
    } finally {
      setUploading({ ...uploading, [type]: false });
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>, type: 'hero' | 'logo') => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImage(file, type);
    }
  };

  const handleSave = () => {
    updateCustomizationMutation.mutate(customization);
  };

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('store_api_key')
        .eq('user_id', user?.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user
  });

  const getPreviewUrl = () => {
    const apiKey = profile?.store_api_key;
    return `/templates/elementar?api_key=${apiKey}`;
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Template Customization</h2>
          <p className="text-muted-foreground">Customize your Elementar template</p>
        </div>
        <div className="hidden sm:flex gap-2">
          <Button
            variant="outline"
            onClick={() => window.open(getPreviewUrl(), '_blank')}
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateCustomizationMutation.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Images
            </CardTitle>
            <CardDescription>Upload your hero image and logo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hero-image">Hero Image</Label>
              {customization.hero_image_url && (
                <div className="relative w-full h-32 rounded-lg overflow-hidden mb-2">
                  <img
                    src={customization.hero_image_url}
                    alt="Hero"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <Input
                id="hero-image"
                type="file"
                accept="image/*"
                onChange={(e) => handleFileInput(e, 'hero')}
                disabled={uploading.hero}
              />
              {uploading.hero && <p className="text-sm text-muted-foreground">Uploading...</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="logo">Logo</Label>
              {customization.logo_url && (
                <div className="relative w-32 h-16 rounded-lg overflow-hidden mb-2 bg-muted flex items-center justify-center">
                  <img
                    src={customization.logo_url}
                    alt="Logo"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              )}
              <Input
                id="logo"
                type="file"
                accept="image/*"
                onChange={(e) => handleFileInput(e, 'logo')}
                disabled={uploading.logo}
              />
              {uploading.logo && <p className="text-sm text-muted-foreground">Uploading...</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Colors
            </CardTitle>
            <CardDescription>Choose your brand colors</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="primary-color">Primary Color</Label>
              <div className="flex gap-2">
                <Input
                  id="primary-color"
                  type="color"
                  value={customization.primary_color}
                  onChange={(e) => setCustomization({ ...customization, primary_color: e.target.value })}
                  className="w-20 h-10"
                />
                <Input
                  type="text"
                  value={customization.primary_color}
                  onChange={(e) => setCustomization({ ...customization, primary_color: e.target.value })}
                  placeholder="#000000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="background-color">Background Color</Label>
              <div className="flex gap-2">
                <Input
                  id="background-color"
                  type="color"
                  value={customization.background_color}
                  onChange={(e) => setCustomization({ ...customization, background_color: e.target.value })}
                  className="w-20 h-10"
                />
                <Input
                  type="text"
                  value={customization.background_color}
                  onChange={(e) => setCustomization({ ...customization, background_color: e.target.value })}
                  placeholder="#FFFFFF"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="text-color">Text Color</Label>
              <div className="flex gap-2">
                <Input
                  id="text-color"
                  type="color"
                  value={customization.text_color}
                  onChange={(e) => setCustomization({ ...customization, text_color: e.target.value })}
                  className="w-20 h-10"
                />
                <Input
                  type="text"
                  value={customization.text_color}
                  onChange={(e) => setCustomization({ ...customization, text_color: e.target.value })}
                  placeholder="#000000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accent-color">Accent Color</Label>
              <div className="flex gap-2">
                <Input
                  id="accent-color"
                  type="color"
                  value={customization.accent_color}
                  onChange={(e) => setCustomization({ ...customization, accent_color: e.target.value })}
                  className="w-20 h-10"
                />
                <Input
                  type="text"
                  value={customization.accent_color}
                  onChange={(e) => setCustomization({ ...customization, accent_color: e.target.value })}
                  placeholder="#666666"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Hero Section Content</CardTitle>
            <CardDescription>Customize your homepage hero section</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="store-name">Store Name</Label>
              <Input
                id="store-name"
                value={customization.store_name}
                onChange={(e) => setCustomization({ ...customization, store_name: e.target.value })}
                placeholder="My Store"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hero-title">Hero Title</Label>
              <Input
                id="hero-title"
                value={customization.hero_title}
                onChange={(e) => setCustomization({ ...customization, hero_title: e.target.value })}
                placeholder="Welcome to Our Store"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hero-subtitle">Hero Subtitle</Label>
              <Textarea
                id="hero-subtitle"
                value={customization.hero_subtitle}
                onChange={(e) => setCustomization({ ...customization, hero_subtitle: e.target.value })}
                placeholder="Discover amazing products"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hero-button">Button Text</Label>
              <Input
                id="hero-button"
                value={customization.hero_button_text}
                onChange={(e) => setCustomization({ ...customization, hero_button_text: e.target.value })}
                placeholder="Shop now"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              Reviews Settings
            </CardTitle>
            <CardDescription>Control how customer reviews appear on your store</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="show-reviews">Show Reviews</Label>
                <p className="text-sm text-muted-foreground">
                  Display customer reviews and ratings on product pages
                </p>
              </div>
              <Switch
                id="show-reviews"
                checked={customization.show_reviews}
                onCheckedChange={(checked) => setCustomization({ ...customization, show_reviews: checked })}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mobile Action Buttons */}
      <div className="flex sm:hidden flex-col gap-3 sticky bottom-4 z-10">
        <Button
          onClick={handleSave}
          disabled={updateCustomizationMutation.isPending}
          size="lg"
          className="w-full shadow-lg"
        >
          <Save className="h-4 w-4 mr-2" />
          Save Changes
        </Button>
        <Button
          variant="outline"
          onClick={() => window.open(getPreviewUrl(), '_blank')}
          size="lg"
          className="w-full"
        >
          <Eye className="h-4 w-4 mr-2" />
          Preview
        </Button>
      </div>
    </div>
  );
};
