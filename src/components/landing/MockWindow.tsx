import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type MockWindowProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

/** Browser-style chrome shared by every illustrative product preview on the landing page. */
export function MockWindow({ title, children, className }: MockWindowProps) {
  return (
    <div className={cn('sv-window', className)}>
      <div className="sv-window__bar" aria-hidden>
        <span className="sv-window__dots">
          <i />
          <i />
          <i />
        </span>
        <span className="sv-window__title">{title}</span>
        <span className="w-10 hidden sm:block" />
      </div>
      {children}
    </div>
  );
}
