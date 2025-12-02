import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, Trash2, GripVertical, Eye, EyeOff, Code, Image, 
  Type, Columns, ImageIcon, ChevronUp, ChevronDown, Save,
  Loader2, LayoutGrid, Quote, Video, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export interface TemplateBlock {
  id: string;
  user_id: string;
  template_id: string;
  block_type: string;
  block_order: number;
  title: string | null;
  content: BlockContent;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface BlockContent {
  // Text Block
  text?: string;
  textAlign?: 'left' | 'center' | 'right';
  fontSize?: string;
  
  // Image Block
  imageUrl?: string;
  imageAlt?: string;
  imageFit?: 'cover' | 'contain' | 'fill';
  
  // Text + Image Block
  layout?: 'image-left' | 'image-right';
  
  // Carousel Block
  images?: Array<{ url: string; alt?: string; caption?: string }>;
  
  // Custom HTML Block
  html?: string;
  css?: string;
  
  // Banner Block
  backgroundColor?: string;
  textColor?: string;
  buttonText?: string;
  buttonUrl?: string;
  
  // Video Block
  videoUrl?: string;
  videoType?: 'youtube' | 'vimeo' | 'url';
  
  // Testimonial Block
  quote?: string;
  author?: string;
  authorTitle?: string;
  authorImage?: string;
  
  // Spacer Block
  height?: number;
  
  // Divider Block
  style?: 'solid' | 'dashed' | 'dotted';
  color?: string;
}

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

interface BlockEditorProps {
  blocks: TemplateBlock[];
  onBlocksChange: (blocks: TemplateBlock[]) => void;
  customization: any;
}

export const BlockEditor = ({ blocks, onBlocksChange, customization }: BlockEditorProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingBlock, setEditingBlock] = useState<TemplateBlock | null>(null);
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [saving, setSaving] = useState(false);

  const saveBlocksMutation = useMutation({
    mutationFn: async (blocksToSave: TemplateBlock[]) => {
      // Delete all existing blocks for this user
      await supabase
        .from('template_blocks')
        .delete()
        .eq('user_id', user?.id);
      
      // Insert updated blocks
      if (blocksToSave.length > 0) {
        const blocksData = blocksToSave.map((block, index) => ({
          id: block.id,
          user_id: user?.id as string,
          template_id: 'elementar',
          block_type: block.block_type,
          block_order: index,
          title: block.title,
          content: JSON.parse(JSON.stringify(block.content)),
          is_visible: block.is_visible,
        }));
        
        const { error } = await supabase
          .from('template_blocks')
          .insert(blocksData as any);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-blocks'] });
      toast.success('Blocks saved successfully!');
    },
    onError: (error) => {
      toast.error('Failed to save blocks');
      console.error(error);
    }
  });

  const addBlock = (type: string) => {
    const newBlock: TemplateBlock = {
      id: crypto.randomUUID(),
      user_id: user?.id || '',
      template_id: 'elementar',
      block_type: type,
      block_order: blocks.length,
      title: `New ${BLOCK_TYPES.find(t => t.id === type)?.name || 'Block'}`,
      content: getDefaultContent(type),
      is_visible: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    onBlocksChange([...blocks, newBlock]);
    setShowAddBlock(false);
    setEditingBlock(newBlock);
  };

  const getDefaultContent = (type: string): BlockContent => {
    switch (type) {
      case 'text':
        return { text: 'Enter your text here...', textAlign: 'left', fontSize: 'base' };
      case 'image':
        return { imageUrl: '', imageAlt: '', imageFit: 'cover' };
      case 'text-image':
        return { text: 'Enter your text here...', imageUrl: '', layout: 'image-right' };
      case 'carousel':
        return { images: [] };
      case 'banner':
        return { text: 'Special Offer!', backgroundColor: customization.primary_color, textColor: '#FFFFFF', buttonText: 'Shop Now', buttonUrl: '#' };
      case 'testimonial':
        return { quote: 'Amazing products and service!', author: 'Happy Customer', authorTitle: 'Verified Buyer' };
      case 'video':
        return { videoUrl: '', videoType: 'youtube' };
      case 'custom-html':
        return { html: '<div class="custom-block">\n  <h3>Custom Block</h3>\n  <p>Your content here</p>\n</div>', css: '.custom-block {\n  padding: 20px;\n  background: #f5f5f5;\n  border-radius: 8px;\n}' };
      default:
        return {};
    }
  };

  const updateBlock = (id: string, updates: Partial<TemplateBlock>) => {
    onBlocksChange(blocks.map(b => b.id === id ? { ...b, ...updates, updated_at: new Date().toISOString() } : b));
  };

  const deleteBlock = (id: string) => {
    onBlocksChange(blocks.filter(b => b.id !== id));
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= blocks.length) return;
    
    const newBlocks = [...blocks];
    [newBlocks[index], newBlocks[newIndex]] = [newBlocks[newIndex], newBlocks[index]];
    onBlocksChange(newBlocks);
  };

  const toggleVisibility = (id: string) => {
    updateBlock(id, { is_visible: !blocks.find(b => b.id === id)?.is_visible });
  };

  const handleSave = async () => {
    setSaving(true);
    await saveBlocksMutation.mutateAsync(blocks);
    setSaving(false);
  };

  const BlockEditorModal = () => {
    if (!editingBlock) return null;

    return (
      <Dialog open={!!editingBlock} onOpenChange={() => setEditingBlock(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {BLOCK_TYPES.find(t => t.id === editingBlock.block_type)?.icon && (
                (() => {
                  const Icon = BLOCK_TYPES.find(t => t.id === editingBlock.block_type)?.icon;
                  return Icon ? <Icon className="h-5 w-5" /> : null;
                })()
              )}
              Edit {BLOCK_TYPES.find(t => t.id === editingBlock.block_type)?.name}
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Block Title (Internal)</Label>
                <Input
                  value={editingBlock.title || ''}
                  onChange={(e) => {
                    const updated = { ...editingBlock, title: e.target.value };
                    setEditingBlock(updated);
                    updateBlock(editingBlock.id, { title: e.target.value });
                  }}
                  placeholder="Block title"
                />
              </div>

              {/* Text Block */}
              {editingBlock.block_type === 'text' && (
                <>
                  <div className="space-y-2">
                    <Label>Text Content</Label>
                    <Textarea
                      value={editingBlock.content.text || ''}
                      onChange={(e) => {
                        const updated = { ...editingBlock, content: { ...editingBlock.content, text: e.target.value } };
                        setEditingBlock(updated);
                        updateBlock(editingBlock.id, { content: updated.content });
                      }}
                      rows={6}
                      placeholder="Enter your text..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Text Alignment</Label>
                    <div className="flex gap-2">
                      {['left', 'center', 'right'].map(align => (
                        <Button
                          key={align}
                          size="sm"
                          variant={editingBlock.content.textAlign === align ? 'default' : 'outline'}
                          onClick={() => {
                            const updated = { ...editingBlock, content: { ...editingBlock.content, textAlign: align as any } };
                            setEditingBlock(updated);
                            updateBlock(editingBlock.id, { content: updated.content });
                          }}
                        >
                          {align.charAt(0).toUpperCase() + align.slice(1)}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Image Block */}
              {editingBlock.block_type === 'image' && (
                <>
                  <div className="space-y-2">
                    <Label>Image URL</Label>
                    <Input
                      value={editingBlock.content.imageUrl || ''}
                      onChange={(e) => {
                        const updated = { ...editingBlock, content: { ...editingBlock.content, imageUrl: e.target.value } };
                        setEditingBlock(updated);
                        updateBlock(editingBlock.id, { content: updated.content });
                      }}
                      placeholder="https://example.com/image.jpg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Alt Text</Label>
                    <Input
                      value={editingBlock.content.imageAlt || ''}
                      onChange={(e) => {
                        const updated = { ...editingBlock, content: { ...editingBlock.content, imageAlt: e.target.value } };
                        setEditingBlock(updated);
                        updateBlock(editingBlock.id, { content: updated.content });
                      }}
                      placeholder="Image description"
                    />
                  </div>
                </>
              )}

              {/* Text + Image Block */}
              {editingBlock.block_type === 'text-image' && (
                <>
                  <div className="space-y-2">
                    <Label>Text Content</Label>
                    <Textarea
                      value={editingBlock.content.text || ''}
                      onChange={(e) => {
                        const updated = { ...editingBlock, content: { ...editingBlock.content, text: e.target.value } };
                        setEditingBlock(updated);
                        updateBlock(editingBlock.id, { content: updated.content });
                      }}
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Image URL</Label>
                    <Input
                      value={editingBlock.content.imageUrl || ''}
                      onChange={(e) => {
                        const updated = { ...editingBlock, content: { ...editingBlock.content, imageUrl: e.target.value } };
                        setEditingBlock(updated);
                        updateBlock(editingBlock.id, { content: updated.content });
                      }}
                      placeholder="https://example.com/image.jpg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Layout</Label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={editingBlock.content.layout === 'image-left' ? 'default' : 'outline'}
                        onClick={() => {
                          const updated = { ...editingBlock, content: { ...editingBlock.content, layout: 'image-left' as const } };
                          setEditingBlock(updated);
                          updateBlock(editingBlock.id, { content: updated.content });
                        }}
                      >
                        Image Left
                      </Button>
                      <Button
                        size="sm"
                        variant={editingBlock.content.layout === 'image-right' ? 'default' : 'outline'}
                        onClick={() => {
                          const updated = { ...editingBlock, content: { ...editingBlock.content, layout: 'image-right' as const } };
                          setEditingBlock(updated);
                          updateBlock(editingBlock.id, { content: updated.content });
                        }}
                      >
                        Image Right
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {/* Banner Block */}
              {editingBlock.block_type === 'banner' && (
                <>
                  <div className="space-y-2">
                    <Label>Banner Text</Label>
                    <Input
                      value={editingBlock.content.text || ''}
                      onChange={(e) => {
                        const updated = { ...editingBlock, content: { ...editingBlock.content, text: e.target.value } };
                        setEditingBlock(updated);
                        updateBlock(editingBlock.id, { content: updated.content });
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Background Color</Label>
                      <Input
                        type="color"
                        value={editingBlock.content.backgroundColor || '#000000'}
                        onChange={(e) => {
                          const updated = { ...editingBlock, content: { ...editingBlock.content, backgroundColor: e.target.value } };
                          setEditingBlock(updated);
                          updateBlock(editingBlock.id, { content: updated.content });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Text Color</Label>
                      <Input
                        type="color"
                        value={editingBlock.content.textColor || '#FFFFFF'}
                        onChange={(e) => {
                          const updated = { ...editingBlock, content: { ...editingBlock.content, textColor: e.target.value } };
                          setEditingBlock(updated);
                          updateBlock(editingBlock.id, { content: updated.content });
                        }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Button Text</Label>
                      <Input
                        value={editingBlock.content.buttonText || ''}
                        onChange={(e) => {
                          const updated = { ...editingBlock, content: { ...editingBlock.content, buttonText: e.target.value } };
                          setEditingBlock(updated);
                          updateBlock(editingBlock.id, { content: updated.content });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Button URL</Label>
                      <Input
                        value={editingBlock.content.buttonUrl || ''}
                        onChange={(e) => {
                          const updated = { ...editingBlock, content: { ...editingBlock.content, buttonUrl: e.target.value } };
                          setEditingBlock(updated);
                          updateBlock(editingBlock.id, { content: updated.content });
                        }}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Testimonial Block */}
              {editingBlock.block_type === 'testimonial' && (
                <>
                  <div className="space-y-2">
                    <Label>Quote</Label>
                    <Textarea
                      value={editingBlock.content.quote || ''}
                      onChange={(e) => {
                        const updated = { ...editingBlock, content: { ...editingBlock.content, quote: e.target.value } };
                        setEditingBlock(updated);
                        updateBlock(editingBlock.id, { content: updated.content });
                      }}
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Author Name</Label>
                      <Input
                        value={editingBlock.content.author || ''}
                        onChange={(e) => {
                          const updated = { ...editingBlock, content: { ...editingBlock.content, author: e.target.value } };
                          setEditingBlock(updated);
                          updateBlock(editingBlock.id, { content: updated.content });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Author Title</Label>
                      <Input
                        value={editingBlock.content.authorTitle || ''}
                        onChange={(e) => {
                          const updated = { ...editingBlock, content: { ...editingBlock.content, authorTitle: e.target.value } };
                          setEditingBlock(updated);
                          updateBlock(editingBlock.id, { content: updated.content });
                        }}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Video Block */}
              {editingBlock.block_type === 'video' && (
                <>
                  <div className="space-y-2">
                    <Label>Video URL</Label>
                    <Input
                      value={editingBlock.content.videoUrl || ''}
                      onChange={(e) => {
                        const updated = { ...editingBlock, content: { ...editingBlock.content, videoUrl: e.target.value } };
                        setEditingBlock(updated);
                        updateBlock(editingBlock.id, { content: updated.content });
                      }}
                      placeholder="https://youtube.com/watch?v=..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Video Type</Label>
                    <div className="flex gap-2">
                      {['youtube', 'vimeo'].map(type => (
                        <Button
                          key={type}
                          size="sm"
                          variant={editingBlock.content.videoType === type ? 'default' : 'outline'}
                          onClick={() => {
                            const updated = { ...editingBlock, content: { ...editingBlock.content, videoType: type as any } };
                            setEditingBlock(updated);
                            updateBlock(editingBlock.id, { content: updated.content });
                          }}
                        >
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Custom HTML Block */}
              {editingBlock.block_type === 'custom-html' && (
                <>
                  <div className="space-y-2">
                    <Label>HTML Code</Label>
                    <Textarea
                      value={editingBlock.content.html || ''}
                      onChange={(e) => {
                        const updated = { ...editingBlock, content: { ...editingBlock.content, html: e.target.value } };
                        setEditingBlock(updated);
                        updateBlock(editingBlock.id, { content: updated.content });
                      }}
                      rows={8}
                      className="font-mono text-sm"
                      placeholder="<div>Your HTML here</div>"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CSS Styles</Label>
                    <Textarea
                      value={editingBlock.content.css || ''}
                      onChange={(e) => {
                        const updated = { ...editingBlock, content: { ...editingBlock.content, css: e.target.value } };
                        setEditingBlock(updated);
                        updateBlock(editingBlock.id, { content: updated.content });
                      }}
                      rows={6}
                      className="font-mono text-sm"
                      placeholder=".custom-class { color: red; }"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ⚠️ Custom code is rendered as-is. Ensure your HTML/CSS is valid.
                  </p>
                </>
              )}

              {/* Carousel Block */}
              {editingBlock.block_type === 'carousel' && (
                <div className="space-y-4">
                  <Label>Carousel Images</Label>
                  {(editingBlock.content.images || []).map((img, idx) => (
                    <div key={idx} className="flex gap-2 items-start p-3 bg-muted rounded-lg">
                      <div className="flex-1 space-y-2">
                        <Input
                          value={img.url}
                          onChange={(e) => {
                            const images = [...(editingBlock.content.images || [])];
                            images[idx] = { ...images[idx], url: e.target.value };
                            const updated = { ...editingBlock, content: { ...editingBlock.content, images } };
                            setEditingBlock(updated);
                            updateBlock(editingBlock.id, { content: updated.content });
                          }}
                          placeholder="Image URL"
                        />
                        <Input
                          value={img.caption || ''}
                          onChange={(e) => {
                            const images = [...(editingBlock.content.images || [])];
                            images[idx] = { ...images[idx], caption: e.target.value };
                            const updated = { ...editingBlock, content: { ...editingBlock.content, images } };
                            setEditingBlock(updated);
                            updateBlock(editingBlock.id, { content: updated.content });
                          }}
                          placeholder="Caption (optional)"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          const images = (editingBlock.content.images || []).filter((_, i) => i !== idx);
                          const updated = { ...editingBlock, content: { ...editingBlock.content, images } };
                          setEditingBlock(updated);
                          updateBlock(editingBlock.id, { content: updated.content });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const images = [...(editingBlock.content.images || []), { url: '', caption: '' }];
                      const updated = { ...editingBlock, content: { ...editingBlock.content, images } };
                      setEditingBlock(updated);
                      updateBlock(editingBlock.id, { content: updated.content });
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Image
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditingBlock(null)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <LayoutGrid className="h-4 w-4" />
          Custom Blocks ({blocks.length})
        </h3>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Save
        </Button>
      </div>

      {/* Block List */}
      <div className="space-y-2">
        {blocks.map((block, index) => (
          <div
            key={block.id}
            className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
              block.is_visible ? 'bg-card' : 'bg-muted/50 opacity-60'
            }`}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{block.title}</p>
              <p className="text-xs text-muted-foreground">
                {BLOCK_TYPES.find(t => t.id === block.block_type)?.name}
              </p>
            </div>

            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => moveBlock(index, 'up')}
                disabled={index === 0}
              >
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => moveBlock(index, 'down')}
                disabled={index === blocks.length - 1}
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toggleVisibility(block.id)}
              >
                {block.is_visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingBlock(block)}
              >
                <Code className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => deleteBlock(block.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Block Button */}
      <Dialog open={showAddBlock} onOpenChange={setShowAddBlock}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Block
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Block</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-4">
            {BLOCK_TYPES.map(type => {
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => addBlock(type.id)}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:border-primary hover:bg-muted/50 transition-all"
                >
                  <Icon className="h-6 w-6 text-primary" />
                  <span className="font-medium text-sm">{type.name}</span>
                  <span className="text-xs text-muted-foreground text-center">{type.description}</span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <BlockEditorModal />
    </div>
  );
};

export default BlockEditor;
