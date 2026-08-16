import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export function SetupMaskedValue({
  label,
  value,
  revealed,
  onToggle,
  showLabel,
  hideLabel,
}: {
  label: string;
  value: string;
  revealed: boolean;
  onToggle: () => void;
  showLabel?: string;
  hideLabel?: string;
}) {
  const { t } = useTranslation('common');
  const show = showLabel ?? t('show', { defaultValue: 'Show' });
  const hide = hideLabel ?? t('hide', { defaultValue: 'Hide' });
  const display = revealed ? value : '•'.repeat(Math.min(Math.max(value.length, 16), 24));

  return (
    <div className="rounded-xl border bg-card px-4 py-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={onToggle}
          aria-pressed={revealed}
        >
          {revealed ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
          {revealed ? hide : show}
        </Button>
      </div>
      <p className="font-mono text-sm break-all select-all">{display || '—'}</p>
    </div>
  );
}
