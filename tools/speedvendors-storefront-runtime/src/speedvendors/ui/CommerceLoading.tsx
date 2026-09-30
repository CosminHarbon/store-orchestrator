// PROTECTED: accessible commerce loading state. Themes may supply visual skeletons via
// loadingFallback props on ProductGrid / FeaturedProducts / ProductDetail; this component
// always keeps a role="status" label for assistive technology.
import type { ReactNode } from 'react';

export interface CommerceLoadingProps {
  /** Accessible status text (may be visually hidden when a theme skeleton is present). */
  label?: string;
  /** When true, status text is clipped for sighted users but remains for AT. */
  visuallyHidden?: boolean;
  className?: string;
  children?: ReactNode;
}

export default function CommerceLoading({
  label = 'Loading…',
  visuallyHidden = false,
  className = '',
  children,
}: CommerceLoadingProps) {
  return (
    <div
      className={`sf-loading${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {children}
      <span className={visuallyHidden ? 'sf-visually-hidden' : 'sf-loading__label'}>{label}</span>
    </div>
  );
}
