import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, Trash2, Eye, EyeOff, Code, 
  Type, Columns, ImageIcon, ChevronUp, ChevronDown, Save,
  Loader2, LayoutGrid, Quote, Video, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { BlockEditorModal } from './BlockEditorModal';

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
  text?: string;
  textAlign?: 'left' | 'center' | 'right';
  fontSize?: string;
  imageUrl?: string;
  imageAlt?: string;
  imageFit?: 'cover' | 'contain' | 'fill';
  layout?: 'image-left' | 'image-right';
  images?: Array<{ url: string; alt?: string; caption?: string }>;
  html?: string;
  css?: string;
  backgroundColor?: string;
  textColor?: string;
  buttonText?: string;
  buttonUrl?: string;
  videoUrl?: string;
  videoType?: 'youtube' | 'vimeo' | 'url';
  quote?: string;
  author?: string;
  authorTitle?: string;
  authorImage?: string;
  height?: number;
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
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [editingBlock, setEditingBlock] = useState<TemplateBlock | null>(null);
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [saving, setSaving] = useState(false);

  const saveBlocksMutation = useMutation({
    mutationFn: async (blocksToSave: TemplateBlock[]) => {
      // Get fresh session to ensure we have auth
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      
      if (!userId) {
        throw new Error('Please log in to save blocks');
      }
      
      const { error: deleteError } = await supabase
        .from('template_blocks')
        .delete()
        .eq('user_id', userId);
      
      if (deleteError) throw deleteError;
      
      if (blocksToSave.length > 0) {
        const blocksData = blocksToSave.map((block, index) => ({
          user_id: userId,
          template_id: 'elementar',
          block_type: block.block_type,
          block_order: index,
          title: block.title,
          content: JSON.parse(JSON.stringify(block.content)),
          is_visible: block.is_visible,
        }));
        
        const { error: insertError } = await supabase
          .from('template_blocks')
          .insert(blocksData as any);
        
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-blocks'] });
      toast.success('Blocks saved successfully!');
    },
    onError: (error) => {
      toast.error('Failed to save blocks: ' + (error as Error).message);
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

  const updateBlock = (updatedBlock: TemplateBlock) => {
    onBlocksChange(blocks.map(b => b.id === updatedBlock.id ? { ...updatedBlock, updated_at: new Date().toISOString() } : b));
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
    const block = blocks.find(b => b.id === id);
    if (block) {
      updateBlock({ ...block, is_visible: !block.is_visible });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveBlocksMutation.mutateAsync(blocks);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Block List */}
      <div className="space-y-2">
        {blocks.map((block, index) => {
          const blockType = BLOCK_TYPES.find(t => t.id === block.block_type);
          const Icon = blockType?.icon || Code;
          
          return (
            <div
              key={block.id}
              className={`flex items-center gap-2 p-3 bg-muted/50 rounded-lg border ${!block.is_visible ? 'opacity-50' : ''}`}
            >
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1 text-sm truncate">{block.title || blockType?.name}</span>
              
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => moveBlock(index, 'up')}
                  disabled={index === 0}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => moveBlock(index, 'down')}
                  disabled={index === blocks.length - 1}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => toggleVisibility(block.id)}
                >
                  {block.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setEditingBlock(block)}
                >
                  <Code className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => deleteBlock(block.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Block Dialog */}
      <Dialog open={showAddBlock} onOpenChange={setShowAddBlock}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full" size="sm">
            <Plus className="h-4 w-4 mr-2" /> Add Block
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Block</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-4">
            {BLOCK_TYPES.map(type => {
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => addBlock(type.id)}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-muted transition-colors text-center"
                >
                  <Icon className="h-6 w-6 text-primary" />
                  <span className="text-sm font-medium">{type.name}</span>
                  <span className="text-xs text-muted-foreground">{type.description}</span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full"
        size="sm"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Save className="h-4 w-4 mr-2" />
        )}
        Save Blocks
      </Button>

      {/* Edit Block Modal */}
      <BlockEditorModal
        block={editingBlock}
        onClose={() => setEditingBlock(null)}
        onSave={updateBlock}
      />
    </div>
  );
};

export default BlockEditor;
