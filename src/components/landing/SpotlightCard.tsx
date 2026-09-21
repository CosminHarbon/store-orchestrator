import type { HTMLAttributes, MouseEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type SpotlightCardProps = HTMLAttributes<HTMLDivElement> & { children: ReactNode };

/** Card whose border and surface glow follow the cursor (styles live in marketing.css). */
export function SpotlightCard({ className, children, onMouseMove, ...rest }: SpotlightCardProps) {
  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
    onMouseMove?.(e);
  };

  return (
    <div className={cn('sv-card sv-card--spot', className)} onMouseMove={handleMove} {...rest}>
      {children}
    </div>
  );
}
