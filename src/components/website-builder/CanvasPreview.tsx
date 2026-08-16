import type { CSSProperties, MouseEvent } from 'react';
import { cn } from '@/lib/utils';
import BlockRenderer from '@/components/templates/BlockRenderer';
import type { TemplateBlock } from '@/components/templates/BlockEditor';
import type { BuilderSection, DeviceMode, WebsiteCustomization } from './types';

interface CanvasPreviewProps {
  customization: WebsiteCustomization;
  sections: BuilderSection[];
  blocks: TemplateBlock[];
  selectedSectionId: string | null;
  device: DeviceMode;
  products: Array<{ id: string; title: string; price: number; image: string | null }>;
  collections: Array<{ id: string; name: string; image_url: string | null }>;
  onSelectSection: (id: string) => void;
  onInlineHeroChange: (field: 'hero_title' | 'hero_subtitle' | 'hero_button_text', value: string) => void;
}

export function CanvasPreview({
  customization,
  sections,
  blocks,
  selectedSectionId,
  device,
  products,
  collections,
  onSelectSection,
  onInlineHeroChange,
}: CanvasPreviewProps) {
  const widthClass =
    device === 'mobile' ? 'max-w-[390px]' : device === 'tablet' ? 'max-w-[768px]' : 'max-w-[1100px]';

  const blockMap = new Map(blocks.map((b) => [b.id, b]));

  return (
    <div className="sv-builder-canvas-scroll">
      <div
        className={cn('sv-builder-device-frame mx-auto w-full overflow-hidden', widthClass)}
        style={{
          backgroundColor: customization.background_color,
          color: customization.text_color,
          fontFamily: customization.font_family,
        }}
      >
        {sections.map((section) => {
          if (!section.visible && section.type !== 'header' && section.type !== 'footer') {
            return null;
          }
          const selected = selectedSectionId === section.id;
          const common = {
            key: section.id,
            className: cn('sv-builder-section', selected && 'sv-builder-section--selected'),
            onClick: (e: MouseEvent) => {
              e.stopPropagation();
              onSelectSection(section.id);
            },
          };

          if (section.type === 'header') {
            return (
              <section {...common}>
                <div
                  className="flex items-center justify-between gap-3 px-4 py-3"
                  style={{
                    background:
                      customization.navbar_style === 'transparent'
                        ? 'transparent'
                        : customization.secondary_color,
                    borderBottom: `1px solid ${customization.accent_color}22`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    {customization.logo_url ? (
                      <img src={customization.logo_url} alt="" className="h-8 w-auto object-contain" />
                    ) : (
                      <div
                        className="text-sm font-semibold"
                        style={{ fontFamily: customization.heading_font }}
                      >
                        {customization.store_name}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs opacity-70">
                    <span>Shop</span>
                    <span>Cart</span>
                  </div>
                </div>
              </section>
            );
          }

          if (section.type === 'hero') {
            if (!section.visible) return null;
            return (
              <section
                {...common}
                className={cn(common.className, 'relative min-h-[320px] overflow-hidden')}
                style={{
                  backgroundImage: customization.hero_image_url
                    ? `url(${customization.hero_image_url})`
                    : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundColor: customization.secondary_color,
                }}
              >
                {customization.gradient_enabled && (
                  <div
                    className="absolute inset-0"
                    style={{
                      background: customization.hero_image_url
                        ? `linear-gradient(to bottom, ${customization.background_color}88, ${customization.background_color})`
                        : `linear-gradient(135deg, ${customization.background_color}, ${customization.secondary_color})`,
                    }}
                  />
                )}
                <div
                  className={cn(
                    'relative z-10 flex min-h-[320px] flex-col justify-center gap-3 px-6 py-12',
                    customization.hero_layout === 'left' && 'items-start text-left',
                    customization.hero_layout === 'right' && 'items-end text-right',
                    (!customization.hero_layout ||
                      customization.hero_layout === 'center' ||
                      customization.hero_layout === 'split') &&
                      'items-center text-center'
                  )}
                >
                  <EditableText
                    value={customization.hero_title}
                    className="max-w-xl text-3xl font-bold leading-tight md:text-5xl"
                    style={{ fontFamily: customization.heading_font, color: customization.text_color }}
                    onChange={(value) => onInlineHeroChange('hero_title', value)}
                  />
                  <EditableText
                    value={customization.hero_subtitle}
                    className="max-w-lg text-base md:text-lg"
                    style={{ color: customization.accent_color }}
                    onChange={(value) => onInlineHeroChange('hero_subtitle', value)}
                  />
                  <button
                    type="button"
                    className="mt-2 rounded-full px-5 py-2.5 text-sm font-medium"
                    style={{
                      backgroundColor: customization.primary_color,
                      color: customization.background_color,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSection(section.id);
                    }}
                  >
                    <EditableText
                      value={customization.hero_button_text}
                      onChange={(value) => onInlineHeroChange('hero_button_text', value)}
                    />
                  </button>
                </div>
              </section>
            );
          }

          if (section.type === 'collections') {
            if (!section.visible) return null;
            return (
              <section {...common} className={cn(common.className, 'px-4 py-10')}>
                <h3
                  className="mb-4 text-center text-xl font-semibold"
                  style={{ fontFamily: customization.heading_font }}
                >
                  Collections
                </h3>
                {collections.length === 0 ? (
                  <p className="text-center text-sm opacity-60">Add collections to show them here.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {collections.slice(0, 4).map((collection) => (
                      <div
                        key={collection.id}
                        className="overflow-hidden rounded-2xl"
                        style={{ backgroundColor: customization.secondary_color }}
                      >
                        <div className="aspect-square overflow-hidden">
                          {collection.image_url ? (
                            <img
                              src={collection.image_url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs opacity-50">
                              No image
                            </div>
                          )}
                        </div>
                        <div className="px-2 py-2 text-center text-xs font-medium">{collection.name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          }

          if (section.type === 'products') {
            if (!section.visible) return null;
            return (
              <section {...common} className={cn(common.className, 'px-4 py-10')}>
                <h3
                  className="mb-4 text-center text-xl font-semibold"
                  style={{ fontFamily: customization.heading_font }}
                >
                  Featured Products
                </h3>
                {products.length === 0 ? (
                  <p className="text-center text-sm opacity-60">Add products to preview this section.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {products.slice(0, 4).map((product) => (
                      <div key={product.id} className="space-y-2">
                        <div
                          className="aspect-square overflow-hidden rounded-2xl"
                          style={{ backgroundColor: customization.secondary_color }}
                        >
                          {product.image ? (
                            <img src={product.image} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="text-sm font-medium leading-tight">{product.title}</div>
                        <div className="text-xs opacity-70">{Number(product.price).toFixed(2)} RON</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          }

          if (section.type === 'reviews') {
            if (!section.visible) return null;
            return (
              <section {...common} className={cn(common.className, 'px-4 py-10')}>
                <h3
                  className="mb-2 text-center text-xl font-semibold"
                  style={{ fontFamily: customization.heading_font }}
                >
                  Customer reviews
                </h3>
                <p className="text-center text-sm opacity-60">
                  Approved store reviews appear here on your live website.
                </p>
              </section>
            );
          }

          if (section.type === 'footer') {
            return (
              <section
                {...common}
                className={cn(common.className, 'px-4 py-8')}
                style={{ backgroundColor: customization.secondary_color }}
              >
                <div className="text-center text-sm font-medium">{customization.store_name}</div>
                <div className="mt-2 text-center text-xs opacity-70">
                  {customization.footer_text || '© Your Store. All rights reserved.'}
                </div>
              </section>
            );
          }

          if (section.type === 'block' && section.blockId) {
            const block = blockMap.get(section.blockId);
            if (!block || !section.visible) return null;
            return (
              <section {...common}>
                <BlockRenderer block={block} customization={customization} />
              </section>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

function EditableText({
  value,
  onChange,
  className,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={cn('sv-builder-editable outline-none', className)}
      style={style}
      contentEditable
      suppressContentEditableWarning
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        const next = e.currentTarget.textContent || '';
        if (next !== value) onChange(next);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLElement).blur();
        }
      }}
    >
      {value}
    </span>
  );
}
