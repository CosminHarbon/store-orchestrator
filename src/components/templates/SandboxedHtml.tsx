import { useEffect, useRef } from 'react';

interface SandboxedHtmlProps {
  html?: string;
  css?: string;
  className?: string;
  minHeight?: number;
}

/** Renders merchant HTML/CSS without scripts or access to the parent storefront. */
export function SandboxedHtml({ html = '', css = '', className, minHeight = 180 }: SandboxedHtmlProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  img { max-width: 100%; height: auto; }
  ${css}
</style>
</head><body>${html}</body></html>`;
    iframe.srcdoc = doc;
  }, [html, css]);

  return (
    <iframe
      ref={iframeRef}
      title="Custom section"
      sandbox=""
      referrerPolicy="no-referrer"
      className={className}
      style={{ width: '100%', minHeight, border: 0, background: 'transparent' }}
    />
  );
}
