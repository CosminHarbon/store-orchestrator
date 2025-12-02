import { useState, useEffect } from 'react';
import { 
  Code, Image, Type, Columns, ImageIcon, Quote, Video, Sparkles, LayoutGrid, Plus, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TemplateBlock, BlockContent } from './BlockEditor';

const BLOCK_TYPES = [
  { id: 'text', name: 'Text Block', icon: Type, description: 'Simple text content' },
  { id: 'image', name: 'Image', icon: ImageIcon, description: 'Single image with caption' },
  { id: 'text-image', name: 'Text + Image', icon: Columns, description: 'Text alongside an image' },
  { id: 'carousel', name: 'Image Carousel', icon: LayoutGrid, description: 'Multiple images in a slider' },
  { id: 'banner', name: 'Banner/CTA', icon: Sparkles, description: 'Call-to-action banner' },
  { id: 'testimonial', name: 'Testimonial', icon: Quote, description: 'Customer review or quote' },
  { id: 'video', name: 'Video Embed', icon: Video, description: 'YouTube or Vimeo video' },
  { id: 'custom-html', name: 'Custom Code', icon: Code, description: 'HTML & CSS code block' },
];

interface BlockEditorModalProps {
  block: TemplateBlock | null;
  onClose: () => void;
  onSave: (block: TemplateBlock) => void;
}

export const BlockEditorModal = ({ block, onClose, onSave }: BlockEditorModalProps) => {
  const [localBlock, setLocalBlock] = useState<TemplateBlock | null>(null);

  useEffect(() => {
    if (block) {
      setLocalBlock({ ...block, content: { ...block.content } });
    } else {
      setLocalBlock(null);
    }
  }, [block]);

  if (!localBlock) return null;

  const updateContent = (updates: Partial<BlockContent>) => {
    setLocalBlock(prev => prev ? { ...prev, content: { ...prev.content, ...updates } } : null);
  };

  const handleSave = () => {
    if (localBlock) {
      onSave(localBlock);
      onClose();
    }
  };

  const Icon = BLOCK_TYPES.find(t => t.id === localBlock.block_type)?.icon;

  return (
    <Dialog open={!!block} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {Icon && <Icon className="h-5 w-5" />}
            Edit {BLOCK_TYPES.find(t => t.id === localBlock.block_type)?.name}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Block Title (Internal)</Label>
              <Input
                value={localBlock.title || ''}
                onChange={(e) => setLocalBlock(prev => prev ? { ...prev, title: e.target.value } : null)}
                placeholder="Block title"
              />
            </div>

            {/* Text Block */}
            {localBlock.block_type === 'text' && (
              <>
                <div className="space-y-2">
                  <Label>Text Content</Label>
                  <Textarea
                    value={localBlock.content.text || ''}
                    onChange={(e) => updateContent({ text: e.target.value })}
                    rows={6}
                    placeholder="Enter your text..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Text Alignment</Label>
                  <div className="flex gap-2">
                    {(['left', 'center', 'right'] as const).map(align => (
                      <Button
                        key={align}
                        size="sm"
                        variant={localBlock.content.textAlign === align ? 'default' : 'outline'}
                        onClick={() => updateContent({ textAlign: align })}
                      >
                        {align.charAt(0).toUpperCase() + align.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Image Block */}
            {localBlock.block_type === 'image' && (
              <>
                <div className="space-y-2">
                  <Label>Image URL</Label>
                  <Input
                    value={localBlock.content.imageUrl || ''}
                    onChange={(e) => updateContent({ imageUrl: e.target.value })}
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Alt Text</Label>
                  <Input
                    value={localBlock.content.imageAlt || ''}
                    onChange={(e) => updateContent({ imageAlt: e.target.value })}
                    placeholder="Image description"
                  />
                </div>
              </>
            )}

            {/* Text + Image Block */}
            {localBlock.block_type === 'text-image' && (
              <>
                <div className="space-y-2">
                  <Label>Text Content</Label>
                  <Textarea
                    value={localBlock.content.text || ''}
                    onChange={(e) => updateContent({ text: e.target.value })}
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Image URL</Label>
                  <Input
                    value={localBlock.content.imageUrl || ''}
                    onChange={(e) => updateContent({ imageUrl: e.target.value })}
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Layout</Label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={localBlock.content.layout === 'image-left' ? 'default' : 'outline'}
                      onClick={() => updateContent({ layout: 'image-left' })}
                    >
                      Image Left
                    </Button>
                    <Button
                      size="sm"
                      variant={localBlock.content.layout === 'image-right' ? 'default' : 'outline'}
                      onClick={() => updateContent({ layout: 'image-right' })}
                    >
                      Image Right
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* Banner Block */}
            {localBlock.block_type === 'banner' && (
              <>
                <div className="space-y-2">
                  <Label>Banner Text</Label>
                  <Input
                    value={localBlock.content.text || ''}
                    onChange={(e) => updateContent({ text: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Background Color</Label>
                    <Input
                      type="color"
                      value={localBlock.content.backgroundColor || '#000000'}
                      onChange={(e) => updateContent({ backgroundColor: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Text Color</Label>
                    <Input
                      type="color"
                      value={localBlock.content.textColor || '#FFFFFF'}
                      onChange={(e) => updateContent({ textColor: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Button Text</Label>
                    <Input
                      value={localBlock.content.buttonText || ''}
                      onChange={(e) => updateContent({ buttonText: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Button URL</Label>
                    <Input
                      value={localBlock.content.buttonUrl || ''}
                      onChange={(e) => updateContent({ buttonUrl: e.target.value })}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Testimonial Block */}
            {localBlock.block_type === 'testimonial' && (
              <>
                <div className="space-y-2">
                  <Label>Quote</Label>
                  <Textarea
                    value={localBlock.content.quote || ''}
                    onChange={(e) => updateContent({ quote: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Author Name</Label>
                    <Input
                      value={localBlock.content.author || ''}
                      onChange={(e) => updateContent({ author: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Author Title</Label>
                    <Input
                      value={localBlock.content.authorTitle || ''}
                      onChange={(e) => updateContent({ authorTitle: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Author Image URL (optional)</Label>
                  <Input
                    value={localBlock.content.authorImage || ''}
                    onChange={(e) => updateContent({ authorImage: e.target.value })}
                    placeholder="https://example.com/avatar.jpg"
                  />
                </div>
              </>
            )}

            {/* Video Block */}
            {localBlock.block_type === 'video' && (
              <>
                <div className="space-y-2">
                  <Label>Video URL</Label>
                  <Input
                    value={localBlock.content.videoUrl || ''}
                    onChange={(e) => updateContent({ videoUrl: e.target.value })}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Video Type</Label>
                  <div className="flex gap-2">
                    {(['youtube', 'vimeo'] as const).map(type => (
                      <Button
                        key={type}
                        size="sm"
                        variant={localBlock.content.videoType === type ? 'default' : 'outline'}
                        onClick={() => updateContent({ videoType: type })}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Carousel Block */}
            {localBlock.block_type === 'carousel' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Images</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const images = localBlock.content.images || [];
                      updateContent({ images: [...images, { url: '', alt: '', caption: '' }] });
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Image
                  </Button>
                </div>
                {(localBlock.content.images || []).map((img, idx) => (
                  <div key={idx} className="p-3 border rounded-lg space-y-2 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Image {idx + 1}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const images = [...(localBlock.content.images || [])];
                          images.splice(idx, 1);
                          updateContent({ images });
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <Input
                      value={img.url}
                      onChange={(e) => {
                        const images = [...(localBlock.content.images || [])];
                        images[idx] = { ...images[idx], url: e.target.value };
                        updateContent({ images });
                      }}
                      placeholder="Image URL"
                    />
                    <Input
                      value={img.caption || ''}
                      onChange={(e) => {
                        const images = [...(localBlock.content.images || [])];
                        images[idx] = { ...images[idx], caption: e.target.value };
                        updateContent({ images });
                      }}
                      placeholder="Caption (optional)"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Custom HTML Block */}
            {localBlock.block_type === 'custom-html' && (
              <>
                <div className="space-y-2">
                  <Label>HTML Code</Label>
                  <Textarea
                    value={localBlock.content.html || ''}
                    onChange={(e) => updateContent({ html: e.target.value })}
                    rows={8}
                    className="font-mono text-sm"
                    placeholder="<div>Your HTML here</div>"
                  />
                </div>
                <div className="space-y-2">
                  <Label>CSS Styles</Label>
                  <Textarea
                    value={localBlock.content.css || ''}
                    onChange={(e) => updateContent({ css: e.target.value })}
                    rows={6}
                    className="font-mono text-sm"
                    placeholder=".your-class { ... }"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Note: Custom CSS will be scoped to prevent conflicts with the main template styles.
                </p>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BlockEditorModal;
