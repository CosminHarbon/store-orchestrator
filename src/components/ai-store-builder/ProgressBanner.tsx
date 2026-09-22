import type { UiStage } from '@/lib/ai-store-builder/builderState';
import { Button } from '@/components/ui/button';

type Props = {
  stage: UiStage;
  busy: boolean;
  onCancel?: () => void;
};

export default function ProgressBanner({ stage, busy, onCancel }: Props) {
  if (!busy && stage.id === 'idle') return null;
  if (stage.id === 'ready' && !busy) return null;

  return (
    <div className="sv-cursor-progress" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <span className="sv-cursor-progress__label">{stage.label}</span>
        {busy && onCancel && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      <div className="sv-cursor-progress__bar">
        <span style={{ width: `${Math.round(stage.progress * 100)}%` }} />
      </div>
    </div>
  );
}
