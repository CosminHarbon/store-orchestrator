import { useState } from 'react';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';
import type { TemplateBlock, BlockContent } from './BlockEditor';

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

  const renderCustomHtmlBlock = () => {
    // Sanitize and render custom HTML
    // Note: In production, you'd want to use a proper sanitizer like DOMPurify
    return (
      <div className={`py-8 px-4`}>
        <div className="container mx-auto max-w-5xl">
          {content.css && (
            <style dangerouslySetInnerHTML={{ __html: content.css }} />
          )}
          <div 
            className={`custom-html-block ${borderRadius}`}
            dangerouslySetInnerHTML={{ __html: content.html || '' }}
          />
        </div>
      </div>
    );
  };

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
      return renderBannerBlock();
    case 'testimonial':
      return renderTestimonialBlock();
    case 'video':
      return renderVideoBlock();
    case 'custom-html':
      return renderCustomHtmlBlock();
    default:
      return null;
  }
};

export default BlockRenderer;
