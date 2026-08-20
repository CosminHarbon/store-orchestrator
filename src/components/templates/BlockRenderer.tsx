import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Quote } from 'lucide-react';
import type { TemplateBlock } from './BlockEditor';
import { SandboxedHtml } from './SandboxedHtml';

interface BlockRendererProps {
  block: TemplateBlock;
  customization: any;
}

export const BlockRenderer = ({ block, customization }: BlockRendererProps) => {
  const [carouselIndex, setCarouselIndex] = useState(0);
  
  if (!block.is_visible) return null;

  const content = block.content;
  const borderRadius = customization.border_radius || 'rounded-lg';

  const renderTextBlock = () => (
    <div 
      className={`py-12 px-4 ${borderRadius}`}
      style={{ textAlign: content.textAlign || 'left' }}
    >
      <div className="container mx-auto max-w-4xl">
        <p 
          className={`text-${content.fontSize || 'base'} leading-relaxed whitespace-pre-wrap`}
          style={{ color: customization.text_color }}
        >
          {content.text}
        </p>
      </div>
    </div>
  );

  const renderImageBlock = () => (
    <div className={`py-12 px-4`}>
      <div className="container mx-auto max-w-5xl">
        <div className={`${borderRadius} overflow-hidden`}>
          {content.imageUrl ? (
            <img
              src={content.imageUrl}
              alt={content.imageAlt || ''}
              className="w-full h-auto object-cover"
              style={{ maxHeight: '600px' }}
            />
          ) : (
            <div 
              className="w-full h-64 flex items-center justify-center"
              style={{ backgroundColor: customization.secondary_color }}
            >
              <span style={{ color: customization.accent_color }}>No image set</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderTextImageBlock = () => (
    <div className={`py-16 px-4`}>
      <div className="container mx-auto max-w-6xl">
        <div className={`grid md:grid-cols-2 gap-12 items-center ${content.layout === 'image-left' ? '' : 'md:flex-row-reverse'}`}>
          {content.layout === 'image-left' && (
            <>
              <div className={`${borderRadius} overflow-hidden`}>
                {content.imageUrl ? (
                  <img
                    src={content.imageUrl}
                    alt=""
                    className="w-full h-auto object-cover"
                  />
                ) : (
                  <div 
                    className="w-full aspect-square flex items-center justify-center"
                    style={{ backgroundColor: customization.secondary_color }}
                  >
                    <span style={{ color: customization.accent_color }}>No image</span>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <p 
                  className="text-lg leading-relaxed whitespace-pre-wrap"
                  style={{ color: customization.text_color }}
                >
                  {content.text}
                </p>
              </div>
            </>
          )}
          {content.layout !== 'image-left' && (
            <>
              <div className="space-y-4">
                <p 
                  className="text-lg leading-relaxed whitespace-pre-wrap"
                  style={{ color: customization.text_color }}
                >
                  {content.text}
                </p>
              </div>
              <div className={`${borderRadius} overflow-hidden`}>
                {content.imageUrl ? (
                  <img
                    src={content.imageUrl}
                    alt=""
                    className="w-full h-auto object-cover"
                  />
                ) : (
                  <div 
                    className="w-full aspect-square flex items-center justify-center"
                    style={{ backgroundColor: customization.secondary_color }}
                  >
                    <span style={{ color: customization.accent_color }}>No image</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const renderCarouselBlock = () => {
    const images = content.images || [];
    if (images.length === 0) return null;

    return (
      <div className={`py-12 px-4`}>
        <div className="container mx-auto max-w-5xl relative">
          <div className={`${borderRadius} overflow-hidden relative`}>
            <img
              src={images[carouselIndex]?.url || ''}
              alt={images[carouselIndex]?.alt || ''}
              className="w-full h-auto object-cover transition-opacity"
              style={{ maxHeight: '500px' }}
            />
            {images[carouselIndex]?.caption && (
              <div 
                className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent"
              >
                <p className="text-white text-center">{images[carouselIndex].caption}</p>
              </div>
            )}
          </div>
          
          {images.length > 1 && (
            <>
              <button
                onClick={() => setCarouselIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))}
                className={`absolute left-4 top-1/2 -translate-y-1/2 p-2 ${borderRadius}`}
                style={{ backgroundColor: `${customization.background_color}cc` }}
              >
                <ChevronLeft className="h-6 w-6" style={{ color: customization.text_color }} />
              </button>
              <button
                onClick={() => setCarouselIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))}
                className={`absolute right-4 top-1/2 -translate-y-1/2 p-2 ${borderRadius}`}
                style={{ backgroundColor: `${customization.background_color}cc` }}
              >
                <ChevronRight className="h-6 w-6" style={{ color: customization.text_color }} />
              </button>
              <div className="flex justify-center gap-2 mt-4">
                {images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCarouselIndex(idx)}
                    className={`w-2 h-2 rounded-full transition-all ${idx === carouselIndex ? 'w-6' : ''}`}
                    style={{ 
                      backgroundColor: idx === carouselIndex ? customization.primary_color : customization.accent_color 
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderBannerBlock = () => (
    <div 
      className={`py-16 px-4`}
      style={{ backgroundColor: content.backgroundColor || customization.primary_color }}
    >
      <div className="container mx-auto max-w-4xl text-center space-y-6">
        <h3 
          className="text-3xl md:text-4xl font-bold"
          style={{ color: content.textColor || '#FFFFFF', fontFamily: customization.heading_font }}
        >
          {content.text}
        </h3>
        {content.buttonText && (
          <a
            href={content.buttonUrl || '#'}
            className={`inline-block px-8 py-3 ${borderRadius} font-medium transition-all hover:opacity-90`}
            style={{ 
              backgroundColor: content.textColor || '#FFFFFF',
              color: content.backgroundColor || customization.primary_color
            }}
          >
            {content.buttonText}
          </a>
        )}
      </div>
    </div>
  );

  const renderTestimonialBlock = () => (
    <div className={`py-16 px-4`} style={{ backgroundColor: customization.secondary_color }}>
      <div className="container mx-auto max-w-3xl text-center space-y-6">
        <Quote className="h-12 w-12 mx-auto" style={{ color: customization.primary_color }} />
        <blockquote 
          className="text-xl md:text-2xl italic leading-relaxed"
          style={{ color: customization.text_color }}
        >
          "{content.quote}"
        </blockquote>
        <div className="space-y-1">
          <p className="font-semibold" style={{ color: customization.text_color }}>
            {content.author}
          </p>
          {content.authorTitle && (
            <p className="text-sm" style={{ color: customization.accent_color }}>
              {content.authorTitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const renderVideoBlock = () => {
    const getEmbedUrl = () => {
      const url = content.videoUrl || '';
      if (content.videoType === 'youtube') {
        const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)?.[1];
        return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
      }
      if (content.videoType === 'vimeo') {
        const videoId = url.match(/vimeo\.com\/(\d+)/)?.[1];
        return videoId ? `https://player.vimeo.com/video/${videoId}` : '';
      }
      return url;
    };

    const embedUrl = getEmbedUrl();
    if (!embedUrl) return null;

    return (
      <div className={`py-12 px-4`}>
        <div className="container mx-auto max-w-4xl">
          <div className={`${borderRadius} overflow-hidden aspect-video`}>
            <iframe
              src={embedUrl}
              className="w-full h-full"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
        </div>
      </div>
    );
  };

  const renderCustomHtmlBlock = () => (
    <div className="py-8 px-4">
      <div className={`container mx-auto max-w-5xl ${borderRadius} overflow-hidden`}>
        <SandboxedHtml html={content.html} css={content.css} />
      </div>
    </div>
  );

  const renderFaqBlock = () => {
    const items = content.faqItems || [];
    if (!items.length) return null;
    return (
      <div className="py-16 px-4">
        <div className="container mx-auto max-w-3xl space-y-3">
          {items.map((item) => (
            <details key={item.q} className="border-b py-3" style={{ borderColor: `${customization.text_color}22` }}>
              <summary className="cursor-pointer font-medium flex items-center justify-between">
                {item.q}
                <ChevronDown className="h-4 w-4" />
              </summary>
              <p className="mt-2 text-sm opacity-80 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    );
  };

  const renderAboutBlock = () => (
    <div className="py-16 px-4">
      <div className="container mx-auto max-w-3xl">
        {block.title && (
          <h3 className="text-3xl mb-4" style={{ fontFamily: customization.heading_font }}>
            {block.title}
          </h3>
        )}
        <p className="text-lg leading-relaxed whitespace-pre-wrap" style={{ color: customization.text_color }}>
          {content.text}
        </p>
      </div>
    </div>
  );

  const renderFeaturesBlock = () => {
    const features = content.features || [];
    if (!features.length) return null;
    return (
      <div className="py-12 px-4">
        <div className="container mx-auto max-w-5xl grid sm:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title}>
              <div className="font-medium">{f.title}</div>
              <p className="text-sm mt-1 opacity-70">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderLookbookBlock = () => {
    const images = content.images || [];
    if (!images.length) return null;
    return (
      <div className="py-12 px-4">
        <div className="container mx-auto max-w-6xl grid grid-cols-2 md:grid-cols-4 gap-3">
          {images.map((img, i) => (
            <div key={i} className={`${borderRadius} overflow-hidden`}>
              <img src={img.url} alt={img.alt || ''} className="w-full h-full object-cover aspect-square" />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMarqueeBlock = () => (
    <div className="overflow-hidden py-3 text-xs uppercase tracking-[0.2em] whitespace-nowrap border-y">
      <span>{`${content.marqueeText || content.text || ''}   ·   `.repeat(10)}</span>
    </div>
  );

  const renderAnnouncementBlock = () => (
    <div
      className="text-center text-xs tracking-[0.16em] uppercase py-2 px-4"
      style={{ backgroundColor: content.backgroundColor || customization.secondary_color, color: content.textColor || customization.text_color }}
    >
      {content.text}
    </div>
  );

  switch (block.block_type) {
    case 'text':
      return renderTextBlock();
    case 'image':
      return renderImageBlock();
    case 'text-image':
      return renderTextImageBlock();
    case 'carousel':
      return renderCarouselBlock();
    case 'banner':
    case 'newsletter':
      return renderBannerBlock();
    case 'testimonial':
      return renderTestimonialBlock();
    case 'video':
      return renderVideoBlock();
    case 'custom-html':
      return renderCustomHtmlBlock();
    case 'faq':
      return renderFaqBlock();
    case 'about':
      return renderAboutBlock();
    case 'features':
      return renderFeaturesBlock();
    case 'lookbook':
    case 'featured-collection':
      return renderLookbookBlock();
    case 'marquee':
      return renderMarqueeBlock();
    case 'announcement':
    case 'contact':
      return block.block_type === 'announcement' ? renderAnnouncementBlock() : renderAboutBlock();
    default:
      return null;
  }
};

export default BlockRenderer;
