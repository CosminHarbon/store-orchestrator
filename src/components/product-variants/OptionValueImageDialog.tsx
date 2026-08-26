import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export type AssignableProductImage = {
  id: string;
  image_url: string;
};

interface OptionValueImageDialogProps {
  open: boolean;
  valueLabel: string;
  images: AssignableProductImage[];
  selectedIds: string[];
  onChange: (imageIds: string[]) => void;
  onClose: () => void;
}

export function OptionValueImageDialog({
  open,
  valueLabel,
  images,
  selectedIds,
  onChange,
  onClose,
}: OptionValueImageDialogProps) {
  const { t } = useTranslation('products');
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const selected = selectedIds
    .map((id) => images.find((image) => image.id === id))
    .filter((image): image is AssignableProductImage => Boolean(image));

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((row) => row !== id));
      return;
    }
    onChange([...selectedIds, id]);
  };

  const move = (id: string, dir: -1 | 1) => {
    const index = selectedIds.indexOf(id);
    const next = index + dir;
    if (index < 0 || next < 0 || next >= selectedIds.length) return;
    const copy = [...selectedIds];
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    onChange(copy);
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="presentation"
      style={{ pointerEvents: 'auto' }}
    >
      <button
        type="button"
        className="absolute inset-0 z-0 bg-black/80"
        aria-label={t('variantImages.closeOverlay')}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-lg border bg-background p-6 shadow-lg"
        style={{ pointerEvents: 'auto' }}
      >
        <div className="flex flex-col space-y-1.5 text-left pr-8">
          <h2 id={titleId} className="text-lg font-semibold leading-none tracking-tight">
            {t('variantImages.assignTitle', { value: valueLabel })}
          </h2>
          <p className="text-sm text-muted-foreground">{t('variantImages.assignHint')}</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          onClick={onClose}
          aria-label={t('variantImages.done')}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mt-4">
          {images.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('variantImages.uploadFirst')}</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {images.map((image, index) => {
                  const checked = selectedIds.includes(image.id);
                  return (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => toggle(image.id)}
                      aria-pressed={checked}
                      aria-label={t('variantImages.thumbLabel', {
                        n: index + 1,
                        selected: checked
                          ? t('variantImages.selected')
                          : t('variantImages.notSelected'),
                      })}
                      className={cn(
                        'relative aspect-square rounded-md overflow-hidden border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                        checked ? 'border-foreground' : 'border-transparent'
                      )}
                    >
                      <img src={image.image_url} alt="" className="h-full w-full object-cover" />
                      {checked ? (
                        <span className="absolute top-1 left-1 h-5 min-w-5 px-1 rounded bg-background/90 text-[11px] font-medium tabular-nums">
                          {selectedIds.indexOf(image.id) + 1}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {selected.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('variantImages.order')}
                  </p>
                  <ol className="space-y-1">
                    {selected.map((image, index) => (
                      <li
                        key={image.id}
                        className="flex items-center gap-2 rounded-md border px-2 py-1"
                      >
                        <img
                          src={image.image_url}
                          alt=""
                          className="h-10 w-10 rounded object-cover shrink-0"
                        />
                        <span className="text-sm flex-1 truncate">
                          {t('variantImages.imageN', { n: index + 1 })}
                        </span>
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-muted disabled:opacity-30"
                          disabled={index === 0}
                          onClick={() => move(image.id, -1)}
                          aria-label={t('variantImages.moveEarlier')}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-muted disabled:opacity-30"
                          disabled={index === selected.length - 1}
                          onClick={() => move(image.id, 1)}
                          aria-label={t('variantImages.moveLater')}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <Button type="button" onClick={onClose}>
            {t('variantImages.done')}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function OptionValueImageTrigger({
  count,
  thumbs,
  onClick,
  disabled,
}: {
  count: number;
  thumbs: string[];
  onClick: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('products');
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted/50 disabled:opacity-50"
      aria-label={t('variantImages.assignAria', { count })}
    >
      {thumbs.length ? (
        <span className="inline-flex -space-x-1">
          {thumbs.slice(0, 3).map((src) => (
            <img
              key={src}
              src={src}
              alt=""
              className="h-5 w-5 rounded-sm object-cover border bg-muted"
            />
          ))}
        </span>
      ) : (
        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      <span className="tabular-nums text-muted-foreground">
        {count === 0 ? t('variantImages.none') : t('variantImages.count', { count })}
      </span>
    </button>
  );
}
