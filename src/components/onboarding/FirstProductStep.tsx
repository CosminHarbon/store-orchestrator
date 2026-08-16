import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

type Props = {
  onCreated: () => void;
  onContinue: () => void;
  onSkip: () => void;
};

export function FirstProductStep({ onCreated, onContinue, onSkip }: Props) {
  const { t } = useTranslation('onboarding');
  const { t: tProducts } = useTranslation('products');
  const { user } = useAuth();
  const [created, setCreated] = useState(false);
  const [form, setForm] = useState({
    title: '',
    sku: '',
    price: '',
    stock: '10',
    description: '',
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const sku = form.sku.trim();
      if (!form.title.trim()) throw new Error(t('product.errors.title'));
      if (!sku) throw new Error(tProducts('toast.skuRequired'));
      if (!form.price || Number.isNaN(parseFloat(form.price))) {
        throw new Error(t('product.errors.price'));
      }

      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('sku', sku)
        .limit(1);
      if (existing?.length) throw new Error(tProducts('toast.skuTaken'));

      const { error } = await supabase.from('products').insert({
        title: form.title.trim(),
        sku,
        description: form.description.trim() || null,
        price: parseFloat(form.price),
        stock: parseInt(form.stock || '0', 10) || 0,
        low_stock_threshold: 5,
        user_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setCreated(true);
      onCreated();
      toast.success(tProducts('toast.created'));
    },
    onError: (error: Error) => {
      toast.error(error.message || tProducts('toast.createFailed'));
    },
  });

  if (created) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-7 w-7 text-emerald-500" />
        </div>
        <div>
          <h3 className="text-xl font-semibold tracking-tight">{t('product.successTitle')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('product.successBody')}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            variant="outline"
            onClick={() => {
              setCreated(false);
              setForm({ title: '', sku: '', price: '', stock: '10', description: '' });
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('product.addAnother')}
          </Button>
          <Button className="bg-[#6E3DFF] hover:bg-[#4B21B6]" onClick={onContinue}>
            {t('actions.continue')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        createMutation.mutate();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="onb-title">{t('product.fields.title')}</Label>
        <Input
          id="onb-title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder={t('product.placeholders.title')}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="onb-sku">{t('product.fields.sku')}</Label>
          <Input
            id="onb-sku"
            value={form.sku}
            onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
            placeholder={t('product.placeholders.sku')}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="onb-price">{t('product.fields.price')}</Label>
          <Input
            id="onb-price"
            type="number"
            min="0"
            step="0.01"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            placeholder="99.00"
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="onb-stock">{t('product.fields.stock')}</Label>
        <Input
          id="onb-stock"
          type="number"
          min="0"
          value={form.stock}
          onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="onb-desc">{t('product.fields.description')}</Label>
        <Textarea
          id="onb-desc"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder={t('product.placeholders.description')}
          rows={3}
        />
      </div>
      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" onClick={onSkip}>
          {t('actions.skip')}
        </Button>
        <Button type="submit" className="bg-[#6E3DFF] hover:bg-[#4B21B6]" disabled={createMutation.isPending}>
          {createMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('product.creating')}
            </>
          ) : (
            t('product.create')
          )}
        </Button>
      </div>
    </form>
  );
}
