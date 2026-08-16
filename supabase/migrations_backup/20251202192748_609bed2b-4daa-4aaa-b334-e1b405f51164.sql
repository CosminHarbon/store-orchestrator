-- Add more customization fields to template_customization table
ALTER TABLE public.template_customization
ADD COLUMN IF NOT EXISTS font_family text DEFAULT 'Inter',
ADD COLUMN IF NOT EXISTS heading_font text DEFAULT 'Inter',
ADD COLUMN IF NOT EXISTS border_radius text DEFAULT 'rounded-lg',
ADD COLUMN IF NOT EXISTS button_style text DEFAULT 'solid',
ADD COLUMN IF NOT EXISTS hero_layout text DEFAULT 'center',
ADD COLUMN IF NOT EXISTS product_card_style text DEFAULT 'minimal',
ADD COLUMN IF NOT EXISTS show_collection_images boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS show_hero_section boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS navbar_style text DEFAULT 'transparent',
ADD COLUMN IF NOT EXISTS footer_text text DEFAULT 'All rights reserved.',
ADD COLUMN IF NOT EXISTS secondary_color text DEFAULT '#F5F5F5',
ADD COLUMN IF NOT EXISTS gradient_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS animation_style text DEFAULT 'smooth';