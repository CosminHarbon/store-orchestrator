import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const INSPIRATION = [
  'Minimal & premium',
  'Bold & colorful',
  'Editorial',
  'Luxury',
  'Clean & modern',
  'Playful',
  'Product-focused',
];

type Props = {
  prompt: string;
  onPromptChange: (v: string) => void;
  onGenerate: () => void;
  productCount: number;
  busy: boolean;
  onAddProducts?: () => void;
  missingImagesWarning?: boolean;
};

export default function EmptyState({
  prompt,
  onPromptChange,
  onGenerate,
  productCount,
  busy,
  onAddProducts,
  missingImagesWarning,
}: Props) {
  const zero = productCount <= 0;

  const appendChip = (chip: string) => {
    const next = prompt.trim()
      ? `${prompt.trim()} — ${chip.toLowerCase()} aesthetic`
      : `Create a ${chip.toLowerCase()} storefront for my brand`;
    onPromptChange(next);
  };

  return (
    <div className="sv-cursor-builder__empty">
      <div className="sv-cursor-builder__empty-card">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#6E3DFF]/22 bg-[#F4F0FF] px-3 py-1 text-xs font-medium text-[#6E3DFF]">
          <Sparkles className="h-3.5 w-3.5" />
          AI Store Builder
        </div>
        <h1>Build your store with AI</h1>
        <p>
          Describe the store you want. SpeedVendors AI will design and build it using your real
          products and images.
        </p>

        {zero ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Add your first products before generating your store.
            {onAddProducts && (
              <div className="mt-2">
                <Button size="sm" variant="outline" onClick={onAddProducts}>
                  Add products
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm font-medium text-[#6E3DFF]">
            We&apos;ll use your {productCount} product{productCount === 1 ? '' : 's'} and existing
            product images automatically.
          </p>
        )}

        {missingImagesWarning && !zero ? (
          <p className="text-xs text-amber-800">
            Some products don&apos;t have images yet. Your store may look better after adding
            product photos.
          </p>
        ) : null}

        <Textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Create a premium minimalist fashion store with large editorial photography, elegant typography and a clean mobile experience…"
          disabled={busy || zero}
          rows={4}
          aria-label="Describe your store"
        />

        <div className="sv-cursor-chips" role="group" aria-label="Inspiration">
          {INSPIRATION.map((chip) => (
            <button key={chip} type="button" disabled={busy || zero} onClick={() => appendChip(chip)}>
              {chip}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">Uses your existing SpeedVendors products automatically</p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="h-11 rounded-full bg-[#6E3DFF] px-6 hover:bg-[#5b30e0]"
            disabled={busy || zero || !prompt.trim()}
            onClick={onGenerate}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generate my store
          </Button>
          <Button variant="ghost" size="sm" disabled title="Coming soon">
            Attach image (coming soon)
          </Button>
        </div>
      </div>
    </div>
  );
}
