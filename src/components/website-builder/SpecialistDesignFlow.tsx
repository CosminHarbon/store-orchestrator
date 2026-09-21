import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useImpersonation } from '@/hooks/useImpersonation';
import { supabase } from '@/integrations/supabase/client';
import { uploadMedia } from '@/lib/media/uploadMedia';
import {
  DESIGN_STYLE_OPTIONS,
  type DesignStyleOption,
} from '@/lib/website-builder/templateCatalog';
import {
  fetchLatestDesignRequest,
  MERCHANT_STATUS_LABEL,
  parseInspirationUrls,
  submitDesignRequest,
  updateSubmittedDesignRequest,
  type MerchantDesignRequest,
} from '@/lib/website-builder/designRequests';
import { trackWebsiteBuilderEvent } from '@/lib/website-builder/analytics';

const STYLE_LABELS: Record<DesignStyleOption, string> = {
  minimal: 'Minimal',
  luxury: 'Luxury',
  modern: 'Modern',
  bold: 'Bold',
  editorial: 'Editorial',
  playful: 'Playful',
};

type Props = {
  onBack: () => void;
};

export function SpecialistDesignFlow({ onBack }: Props) {
  const { effectiveUserId } = useImpersonation();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const requestQuery = useQuery({
    queryKey: ['design-request', effectiveUserId],
    enabled: !!effectiveUserId,
    queryFn: () => fetchLatestDesignRequest(effectiveUserId!),
  });

  const profileQuery = useQuery({
    queryKey: ['profile-design-context', effectiveUserId],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('store_name, store_api_key')
        .eq('user_id', effectiveUserId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const productCountQuery = useQuery({
    queryKey: ['design-request-products', effectiveUserId],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', effectiveUserId!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const existing = requestQuery.data;
  const canEdit = !existing || existing.status === 'submitted';
  const showStatus = !!existing && existing.status !== 'cancelled';

  const [styles, setStyles] = useState<string[]>([]);
  const [inspirationText, setInspirationText] = useState('');
  const [inspirationUrlsRaw, setInspirationUrlsRaw] = useState('');
  const [notes, setNotes] = useState('');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [forceNew, setForceNew] = useState(false);

  useEffect(() => {
    trackWebsiteBuilderEvent('specialist_design_started');
  }, []);

  useEffect(() => {
    if (!existing || forceNew) return;
    setStyles(existing.selected_styles || []);
    setInspirationText(existing.inspiration_text || '');
    setInspirationUrlsRaw((existing.inspiration_urls || []).join('\n'));
    setNotes(existing.notes || '');
    setMediaUrls(existing.inspiration_media_urls || []);
  }, [existing, forceNew]);

  const formVisible = !showStatus || editing || forceNew;
  const updatingExisting = !!existing && existing.status === 'submitted' && !forceNew;

  const toggleStyle = (s: string) => {
    setStyles((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveUserId) throw new Error('Not signed in');
      if (styles.length === 0) throw new Error('Pick at least one design style');
      const payload = {
        selectedStyles: styles,
        inspirationText,
        inspirationUrls: parseInspirationUrls(inspirationUrlsRaw),
        notes,
        inspirationMediaUrls: mediaUrls,
      };
      if (updatingExisting && existing) {
        return updateSubmittedDesignRequest(existing.id, effectiveUserId, payload);
      }
      return submitDesignRequest({
        userId: effectiveUserId,
        storeName: profileQuery.data?.store_name ?? null,
        ...payload,
      });
    },
    onSuccess: (row) => {
      trackWebsiteBuilderEvent('specialist_design_submitted', { request_id: row.id });
      toast.success(updatingExisting ? 'Design request updated' : 'Design request submitted');
      setEditing(false);
      setForceNew(false);
      void qc.invalidateQueries({ queryKey: ['design-request', effectiveUserId] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not submit request'),
  });

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const result = await uploadMedia({
        file,
        mediaType: 'builder',
        relatedEntityId: existing?.id,
      });
      setMediaUrls((prev) => [...prev, result.publicUrl].slice(0, 6));
      toast.success('Inspiration image added');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const productCount = productCountQuery.data ?? 0;

  return (
    <div className="sv-builder-home mx-auto max-w-2xl space-y-6 px-1 pb-10">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Website Builder
      </button>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6E3DFF]">
          Professional design
        </p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Get a store designed for your business
        </h1>
        <p className="text-sm text-muted-foreground md:text-base">
          Designed by a SpeedVendors specialist — not automated AI generation.
        </p>
      </div>

      {showStatus && !editing && !forceNew ? (
        <StatusCard
          request={existing!}
          onEdit={canEdit ? () => setEditing(true) : undefined}
          onNewRequest={
            existing!.status === 'completed' || existing!.status === 'cancelled'
              ? () => {
                  setForceNew(true);
                  setEditing(true);
                  setStyles([]);
                  setInspirationText('');
                  setInspirationUrlsRaw('');
                  setNotes('');
                  setMediaUrls([]);
                }
              : undefined
          }
        />
      ) : null}

      {formVisible ? (
        <div className="space-y-6 rounded-3xl border bg-card p-5 shadow-sm md:p-7">
          <section className="space-y-3">
            <Label className="text-sm font-semibold">Design style</Label>
            <p className="text-xs text-muted-foreground">Select one or more directions.</p>
            <div className="flex flex-wrap gap-2">
              {DESIGN_STYLE_OPTIONS.map((s) => {
                const on = styles.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={!canEdit && !!existing}
                    onClick={() => toggleStyle(s)}
                    className={`rounded-full border px-3.5 py-2 text-sm transition ${
                      on
                        ? 'border-[#6E3DFF] bg-[#F4F0FF] text-[#6E3DFF]'
                        : 'border-border bg-white text-foreground hover:border-[#6E3DFF]/40'
                    }`}
                  >
                    {STYLE_LABELS[s]}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2 rounded-2xl border border-[#6E3DFF]/15 bg-[#F4F0FF]/50 p-4">
            <p className="text-sm font-medium text-[#1A0F2E]">
              We&apos;ll automatically use your existing products and product images.
            </p>
            <p className="text-xs text-muted-foreground">
              Store: <span className="font-medium text-foreground">{profileQuery.data?.store_name || '—'}</span>
              {' · '}
              {productCount} product{productCount === 1 ? '' : 's'} available for your specialist.
            </p>
          </section>

          <section className="space-y-2">
            <Label htmlFor="inspiration">Are there any websites or brands whose style you like?</Label>
            <Textarea
              id="inspiration"
              value={inspirationText}
              onChange={(e) => setInspirationText(e.target.value)}
              placeholder="e.g. clean like Aesop, warm like a local flower shop…"
              rows={3}
              disabled={!canEdit && !!existing && !editing}
            />
            <Label htmlFor="urls" className="text-xs text-muted-foreground">
              Optional URLs (one per line)
            </Label>
            <Textarea
              id="urls"
              value={inspirationUrlsRaw}
              onChange={(e) => setInspirationUrlsRaw(e.target.value)}
              placeholder="https://…"
              rows={2}
              disabled={!canEdit && !!existing && !editing}
            />
          </section>

          <section className="space-y-2">
            <Label htmlFor="notes">Tell us anything else you&apos;d like us to know about your store</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tone of voice, must-have sections, competitors to avoid…"
              rows={4}
              disabled={!canEdit && !!existing && !editing}
            />
          </section>

          <section className="space-y-3">
            <Label>Inspiration images (optional)</Label>
            <p className="text-xs text-muted-foreground">
              Upload moodboard photos using your existing media library.
            </p>
            <div className="flex flex-wrap gap-2">
              {mediaUrls.map((url) => (
                <div key={url} className="relative h-20 w-20 overflow-hidden rounded-xl border">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  {(canEdit || editing) && (
                    <button
                      type="button"
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                      onClick={() => setMediaUrls((prev) => prev.filter((u) => u !== url))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              {(canEdit || editing) && mediaUrls.length < 6 ? (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-muted-foreground hover:border-[#6E3DFF] hover:text-[#6E3DFF]"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  <span className="text-[10px]">Add</span>
                </button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
                e.target.value = '';
              }}
            />
          </section>

          <Button
            className="h-12 w-full rounded-full bg-[#6E3DFF] text-base hover:bg-[#5b30e0]"
            disabled={saveMutation.isPending || styles.length === 0}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : updatingExisting && editing ? (
              'Update my request'
            ) : (
              'Request my design'
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function StatusCard({
  request,
  onEdit,
  onNewRequest,
}: {
  request: MerchantDesignRequest;
  onEdit?: () => void;
  onNewRequest?: () => void;
}) {
  const label = MERCHANT_STATUS_LABEL[request.status] || request.status;
  return (
    <div className="rounded-3xl border border-[#6E3DFF]/20 bg-gradient-to-br from-[#F4F0FF] to-white p-5 shadow-sm md:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6E3DFF]">
        Design request
      </p>
      <h2 className="mt-2 text-xl font-semibold tracking-tight">
        Your design request has been submitted
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Status: <span className="font-medium text-foreground">{label}</span>
      </p>
      <div className="mt-4 space-y-2 text-sm">
        <p>
          <span className="text-muted-foreground">Styles: </span>
          {(request.selected_styles || []).join(', ') || '—'}
        </p>
        {request.inspiration_text ? (
          <p className="line-clamp-3">
            <span className="text-muted-foreground">Inspiration: </span>
            {request.inspiration_text}
          </p>
        ) : null}
        {request.notes ? (
          <p className="line-clamp-3">
            <span className="text-muted-foreground">Notes: </span>
            {request.notes}
          </p>
        ) : null}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {onEdit ? (
          <Button variant="outline" className="rounded-full" onClick={onEdit}>
            Edit request
          </Button>
        ) : null}
        {onNewRequest ? (
          <Button className="rounded-full bg-[#6E3DFF] hover:bg-[#5b30e0]" onClick={onNewRequest}>
            Start a new request
          </Button>
        ) : null}
      </div>
    </div>
  );
}
