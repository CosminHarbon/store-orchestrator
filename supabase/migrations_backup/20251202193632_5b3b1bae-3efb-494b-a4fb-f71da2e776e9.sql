-- Create table for custom template blocks
CREATE TABLE public.template_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  template_id TEXT NOT NULL DEFAULT 'elementar',
  block_type TEXT NOT NULL,
  block_order INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  content JSONB NOT NULL DEFAULT '{}',
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.template_blocks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own blocks" 
ON public.template_blocks FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own blocks" 
ON public.template_blocks FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own blocks" 
ON public.template_blocks FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own blocks" 
ON public.template_blocks FOR DELETE 
USING (auth.uid() = user_id);

-- Public read access for template viewing (via API key)
CREATE POLICY "Anyone can view blocks for template viewing"
ON public.template_blocks FOR SELECT
USING (true);

-- Add updated_at trigger
CREATE TRIGGER update_template_blocks_updated_at
BEFORE UPDATE ON public.template_blocks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();