import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { 
  X, Save, Eye, EyeOff, Palette, Type, Layout, Image, 
  Sparkles, ChevronDown, ChevronUp, Upload, Loader2, 
  RotateCcw, Settings2, Layers, Wand2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface ExtendedCustomization {
  id?: string;
  user_id: string;
  template_id: string;
  primary_color: string;
  background_color: string;
  text_color: string;
  accent_color: string;
  secondary_color: string;
  hero_image_url: string | null;
  logo_url: string | null;
  hero_title: string;
  hero_subtitle: string;
  hero_button_text: string;
  store_name: string;
  font_family: string;
  heading_font: string;
  border_radius: string;
  button_style: string;
  hero_layout: string;
  product_card_style: string;
  show_collection_images: boolean;
  show_hero_section: boolean;
  navbar_style: string;
  footer_text: string;
  gradient_enabled: boolean;
  animation_style: string;
}

interface LiveTemplateEditorProps {
  isOpen: boolean;
  onClose: () => void;
  customization: ExtendedCustomization;
  onCustomizationChange: (customization: ExtendedCustomization) => void;
}

const fontOptions = [
  { value: 'Inter', label: 'Inter (Modern)' },
  { value: 'Poppins', label: 'Poppins (Friendly)' },
  { value: 'Playfair Display', label: 'Playfair Display (Elegant)' },
  { value: 'Montserrat', label: 'Montserrat (Clean)' },
  { value: 'Space Grotesk', label: 'Space Grotesk (Tech)' },
  { value: 'DM Sans', label: 'DM Sans (Minimal)' },
  { value: 'Outfit', label: 'Outfit (Contemporary)' },
];

const borderRadiusOptions = [
  { value: 'rounded-none', label: 'Sharp (0px)' },
  { value: 'rounded-sm', label: 'Subtle (2px)' },
  { value: 'rounded', label: 'Small (4px)' },
  { value: 'rounded-md', label: 'Medium (6px)' },
  { value: 'rounded-lg', label: 'Large (8px)' },
  { value: 'rounded-xl', label: 'Extra Large (12px)' },
  { value: 'rounded-2xl', label: 'Huge (16px)' },
  { value: 'rounded-3xl', label: 'Maximum (24px)' },
];

const buttonStyles = [
  { value: 'solid', label: 'Solid Fill' },
  { value: 'outline', label: 'Outline' },
  { value: 'ghost', label: 'Ghost' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'glow', label: 'Glow Effect' },
];

const heroLayouts = [
  { value: 'center', label: 'Centered' },
  { value: 'left', label: 'Left Aligned' },
  { value: 'right', label: 'Right Aligned' },
  { value: 'split', label: 'Split Layout' },
];

const productCardStyles = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'card', label: 'Card Style' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'hover-info', label: 'Hover Info' },
];

const navbarStyles = [
  { value: 'transparent', label: 'Transparent' },
  { value: 'solid', label: 'Solid' },
  { value: 'glass', label: 'Glassmorphism' },
  { value: 'minimal', label: 'Minimal' },
];

const animationStyles = [
  { value: 'smooth', label: 'Smooth & Subtle' },
  { value: 'dynamic', label: 'Dynamic & Bold' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'none', label: 'No Animations' },
];

export const LiveTemplateEditor = ({ 
  isOpen, 
  onClose, 
  customization, 
  onCustomizationChange 
}: LiveTemplateEditorProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState({ hero: false, logo: false });
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    colors: true,
    typography: false,
    hero: false,
    layout: false,
    images: false,
  });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const updateCustomization = (updates: Partial<ExtendedCustomization>) => {
    onCustomizationChange({ ...customization, ...updates });
    setHasUnsavedChanges(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (data: ExtendedCustomization) => {
      const { error } = await supabase
        .from('template_customization')
        .upsert({
          ...data,
          user_id: user?.id,
          template_id: 'elementar'
        } as any);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-customization'] });
      toast.success('Changes saved successfully!');
      setHasUnsavedChanges(false);
    },
    onError: (error) => {
      toast.error('Failed to save changes');
      console.error(error);
    }
  });

  const uploadImage = async (file: File, type: 'hero' | 'logo') => {
    if (!user) return;
    
    setUploading(prev => ({ ...prev, [type]: true }));
    
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

      updateCustomization({
        [type === 'hero' ? 'hero_image_url' : 'logo_url']: publicUrl
      });

      toast.success(`${type === 'hero' ? 'Hero image' : 'Logo'} uploaded!`);
    } catch (error) {
      toast.error(`Failed to upload ${type}`);
      console.error(error);
    } finally {
      setUploading(prev => ({ ...prev, [type]: false }));
    }
  };

  const ColorPicker = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <div className="space-y-2">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="flex gap-2">
        <div 
          className="w-10 h-10 rounded-lg border-2 border-border cursor-pointer overflow-hidden"
          style={{ backgroundColor: value }}
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-full opacity-0 cursor-pointer"
          />
        </div>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 font-mono text-xs"
          placeholder="#000000"
        />
      </div>
    </div>
  );

  const Section = ({ 
    id, 
    title, 
    icon: Icon, 
    children 
  }: { 
    id: string; 
    title: string; 
    icon: React.ComponentType<{ className?: string }>; 
    children: React.ReactNode 
  }) => (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => toggleSection(id)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">{title}</span>
        </div>
        {expandedSections[id] ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {expandedSections[id] && (
        <div className="px-4 pb-4 space-y-4 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-80 md:w-96 bg-background/95 backdrop-blur-xl border-l border-border shadow-2xl z-[100] flex flex-col animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Live Editor</h2>
          {hasUnsavedChanges && (
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border/50">
          {/* Colors Section */}
          <Section id="colors" title="Colors" icon={Palette}>
            <ColorPicker 
              label="Primary Color" 
              value={customization.primary_color} 
              onChange={(v) => updateCustomization({ primary_color: v })} 
            />
            <ColorPicker 
              label="Background Color" 
              value={customization.background_color} 
              onChange={(v) => updateCustomization({ background_color: v })} 
            />
            <ColorPicker 
              label="Text Color" 
              value={customization.text_color} 
              onChange={(v) => updateCustomization({ text_color: v })} 
            />
            <ColorPicker 
              label="Accent Color" 
              value={customization.accent_color} 
              onChange={(v) => updateCustomization({ accent_color: v })} 
            />
            <ColorPicker 
              label="Secondary Color" 
              value={customization.secondary_color} 
              onChange={(v) => updateCustomization({ secondary_color: v })} 
            />
            <div className="flex items-center justify-between pt-2">
              <Label className="text-xs">Enable Gradients</Label>
              <Switch 
                checked={customization.gradient_enabled} 
                onCheckedChange={(v) => updateCustomization({ gradient_enabled: v })} 
              />
            </div>
          </Section>

          {/* Typography Section */}
          <Section id="typography" title="Typography" icon={Type}>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Body Font</Label>
              <Select 
                value={customization.font_family} 
                onValueChange={(v) => updateCustomization({ font_family: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fontOptions.map(font => (
                    <SelectItem key={font.value} value={font.value}>
                      {font.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Heading Font</Label>
              <Select 
                value={customization.heading_font} 
                onValueChange={(v) => updateCustomization({ heading_font: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fontOptions.map(font => (
                    <SelectItem key={font.value} value={font.value}>
                      {font.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Section>

          {/* Hero Section */}
          <Section id="hero" title="Hero Section" icon={Sparkles}>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Show Hero Section</Label>
              <Switch 
                checked={customization.show_hero_section} 
                onCheckedChange={(v) => updateCustomization({ show_hero_section: v })} 
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Store Name</Label>
              <Input
                value={customization.store_name}
                onChange={(e) => updateCustomization({ store_name: e.target.value })}
                placeholder="My Store"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Hero Title</Label>
              <Input
                value={customization.hero_title}
                onChange={(e) => updateCustomization({ hero_title: e.target.value })}
                placeholder="Welcome to Our Store"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Hero Subtitle</Label>
              <Textarea
                value={customization.hero_subtitle}
                onChange={(e) => updateCustomization({ hero_subtitle: e.target.value })}
                placeholder="Discover amazing products"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Button Text</Label>
              <Input
                value={customization.hero_button_text}
                onChange={(e) => updateCustomization({ hero_button_text: e.target.value })}
                placeholder="Shop now"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Hero Layout</Label>
              <Select 
                value={customization.hero_layout} 
                onValueChange={(v) => updateCustomization({ hero_layout: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {heroLayouts.map(layout => (
                    <SelectItem key={layout.value} value={layout.value}>
                      {layout.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Section>

          {/* Layout & Style Section */}
          <Section id="layout" title="Layout & Style" icon={Layout}>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Border Radius</Label>
              <Select 
                value={customization.border_radius} 
                onValueChange={(v) => updateCustomization({ border_radius: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {borderRadiusOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Button Style</Label>
              <Select 
                value={customization.button_style} 
                onValueChange={(v) => updateCustomization({ button_style: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {buttonStyles.map(style => (
                    <SelectItem key={style.value} value={style.value}>
                      {style.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Product Card Style</Label>
              <Select 
                value={customization.product_card_style} 
                onValueChange={(v) => updateCustomization({ product_card_style: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {productCardStyles.map(style => (
                    <SelectItem key={style.value} value={style.value}>
                      {style.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Navbar Style</Label>
              <Select 
                value={customization.navbar_style} 
                onValueChange={(v) => updateCustomization({ navbar_style: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {navbarStyles.map(style => (
                    <SelectItem key={style.value} value={style.value}>
                      {style.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Animation Style</Label>
              <Select 
                value={customization.animation_style} 
                onValueChange={(v) => updateCustomization({ animation_style: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {animationStyles.map(style => (
                    <SelectItem key={style.value} value={style.value}>
                      {style.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between pt-2">
              <Label className="text-xs">Show Collection Images</Label>
              <Switch 
                checked={customization.show_collection_images} 
                onCheckedChange={(v) => updateCustomization({ show_collection_images: v })} 
              />
            </div>
          </Section>

          {/* Images Section */}
          <Section id="images" title="Images" icon={Image}>
            <div className="space-y-3">
              <Label className="text-xs font-medium">Hero Image</Label>
              {customization.hero_image_url && (
                <div className="relative w-full h-24 rounded-lg overflow-hidden border border-border">
                  <img
                    src={customization.hero_image_url}
                    alt="Hero"
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => updateCustomization({ hero_image_url: null })}
                    className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-md"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div className="relative">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadImage(file, 'hero');
                  }}
                  disabled={uploading.hero}
                  className="cursor-pointer"
                />
                {uploading.hero && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />
                )}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-medium">Logo</Label>
              {customization.logo_url && (
                <div className="relative w-24 h-16 rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center">
                  <img
                    src={customization.logo_url}
                    alt="Logo"
                    className="max-w-full max-h-full object-contain"
                  />
                  <button
                    onClick={() => updateCustomization({ logo_url: null })}
                    className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-md"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div className="relative">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadImage(file, 'logo');
                  }}
                  disabled={uploading.logo}
                  className="cursor-pointer"
                />
                {uploading.logo && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />
                )}
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <Label className="text-xs font-medium">Footer Text</Label>
              <Input
                value={customization.footer_text}
                onChange={(e) => updateCustomization({ footer_text: e.target.value })}
                placeholder="All rights reserved."
              />
            </div>
          </Section>
        </div>
      </ScrollArea>

      {/* Footer Actions */}
      <div className="p-4 border-t border-border bg-muted/30 space-y-2">
        <Button
          onClick={() => saveMutation.mutate(customization)}
          disabled={saveMutation.isPending || !hasUnsavedChanges}
          className="w-full"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          Changes preview in real-time
        </p>
      </div>
    </div>
  );
};

export default LiveTemplateEditor;
