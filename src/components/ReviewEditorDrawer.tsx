import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MessageSquare, Star, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  normalizeReviewStatus,
  relativeTime,
  statusBadgeClass,
  type ReviewRow,
  type ReviewStatus,
} from '@/lib/reviewAnalytics';
import { cn } from '@/lib/utils';

interface ReviewEditorDrawerProps {
  review: ReviewRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allReviews: ReviewRow[];
}

function Stars({ rating, size = 'h-4 w-4' }: { rating: number; size?: string }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn(size, s <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')}
        />
      ))}
    </div>
  );
}

export function ReviewEditorDrawer({
  review,
  open,
  onOpenChange,
  allReviews,
}: ReviewEditorDrawerProps) {
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const [notes, setNotes] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!review || !open) return;
    setReply(review.merchant_reply || '');
    setNotes(review.internal_notes || '');
    setDirty(false);
  }, [review?.id, open]);

  useEffect(() => {
    if (!review || !open || dirty) return;
    setReply(review.merchant_reply || '');
    setNotes(review.internal_notes || '');
  }, [review?.merchant_reply, review?.internal_notes, review?.status, open, dirty]);

  const status = review ? normalizeReviewStatus(review) : 'pending';

  const { data: productDetail } = useQuery({
    queryKey: ['review-product', review?.product_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, title, sku, price, image')
        .eq('id', review!.product_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!review?.product_id && open,
  });

  const customerReviews = useMemo(() => {
    if (!review) return [];
    return allReviews.filter(
      (r) =>
        r.id !== review.id &&
        ((review.customer_email && r.customer_email === review.customer_email) ||
          r.customer_name === review.customer_name)
    );
  }, [allReviews, review]);

  const productReviews = useMemo(() => {
    if (!review) return [];
    return allReviews.filter((r) => r.product_id === review.product_id && r.id !== review.id);
  }, [allReviews, review]);

  const productAvg = useMemo(() => {
    if (!review) return 0;
    const list = allReviews.filter((r) => r.product_id === review.product_id);
    if (!list.length) return 0;
    return list.reduce((s, r) => s + r.rating, 0) / list.length;
  }, [allReviews, review]);

  const setStatus = useMutation({
    mutationFn: async (next: ReviewStatus) => {
      const { error } = await supabase
        .from('reviews')
        .update({ status: next, is_approved: next === 'approved' })
        .eq('id', review!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('Review status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const saveReplyNotes = useMutation({
    mutationFn: async () => {
      const trimmed = reply.trim();
      const { error } = await supabase
        .from('reviews')
        .update({
          merchant_reply: trimmed || null,
          merchant_replied_at: trimmed ? new Date().toISOString() : null,
          internal_notes: notes.trim() || null,
        })
        .eq('id', review!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      setDirty(false);
      toast.success('Saved');
    },
    onError: () => toast.error('Failed to save'),
  });

  const deleteReview = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('reviews').delete().eq('id', review!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('Review deleted');
      onOpenChange(false);
    },
    onError: () => toast.error('Failed to delete'),
  });

  if (!review) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl p-0 [&>button]:hidden" />
      </Sheet>
    );
  }

  const initials = review.customer_name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const history = [
    { label: 'Created', at: review.created_at },
    status === 'approved' && { label: 'Approved', at: review.updated_at },
    status === 'rejected' && { label: 'Rejected', at: review.updated_at },
    status === 'spam' && { label: 'Marked spam', at: review.updated_at },
    review.merchant_replied_at && { label: 'Merchant replied', at: review.merchant_replied_at },
  ].filter(Boolean) as { label: string; at: string }[];

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o && dirty && !confirm('Discard unsaved reply/notes?')) return;
        onOpenChange(o);
      }}
    >
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col gap-0 overflow-hidden [&>button]:hidden">
        <div className="border-b px-4 py-3 flex items-start justify-between gap-3 shrink-0">
          <SheetHeader className="text-left space-y-1">
            <SheetTitle className="flex items-center gap-2">
              Review
              <Badge className={statusBadgeClass(status)}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Badge>
            </SheetTitle>
            <SheetDescription>{relativeTime(review.created_at)}</SheetDescription>
          </SheetHeader>
          <Button type="button" size="icon" variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
          <Tabs defaultValue="general">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="customer">Customer</TabsTrigger>
              <TabsTrigger value="product">Product</TabsTrigger>
              <TabsTrigger value="moderation">Moderation</TabsTrigger>
              <TabsTrigger value="reply">Reply</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 mt-4">
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <Stars rating={review.rating} size="h-5 w-5" />
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {review.review_text || 'No written review.'}
                </p>
                <div className="text-xs text-muted-foreground">
                  {new Date(review.created_at).toLocaleString()}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="customer" className="space-y-3 mt-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
                  {initials}
                </div>
                <div>
                  <div className="font-medium">{review.customer_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {review.customer_email || 'No email provided'}
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Previous reviews</h4>
                {customerReviews.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No other reviews from this customer.</p>
                ) : (
                  <div className="space-y-2">
                    {customerReviews.slice(0, 5).map((r) => (
                      <div key={r.id} className="rounded-md border p-2 text-sm">
                        <div className="flex justify-between gap-2">
                          <span className="truncate">{r.product?.title || 'Product'}</span>
                          <Stars rating={r.rating} />
                        </div>
                        <p className="text-muted-foreground line-clamp-2 mt-1">{r.review_text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="product" className="space-y-3 mt-4">
              <div className="flex gap-3">
                <div className="h-20 w-16 rounded-md overflow-hidden bg-muted shrink-0">
                  {(productDetail?.image || review.product?.image) && (
                    <img
                      src={productDetail?.image || review.product?.image || ''}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-medium">{productDetail?.title || review.product?.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    SKU {productDetail?.sku || review.product?.sku || '—'}
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-sm">
                    <Stars rating={Math.round(productAvg)} />
                    <span className="text-muted-foreground">{productAvg.toFixed(1)} avg</span>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Other reviews for this product</h4>
                {productReviews.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No other reviews yet.</p>
                ) : (
                  <div className="space-y-2">
                    {productReviews.slice(0, 5).map((r) => (
                      <div key={r.id} className="rounded-md border p-2 text-sm">
                        <div className="flex justify-between">
                          <span>{r.customer_name}</span>
                          <Stars rating={r.rating} />
                        </div>
                        <p className="text-muted-foreground line-clamp-2 mt-1">{r.review_text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="moderation" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={status === 'approved' ? 'default' : 'outline'}
                  onClick={() => setStatus.mutate('approved')}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Approve
                </Button>
                <Button
                  type="button"
                  variant={status === 'rejected' ? 'destructive' : 'outline'}
                  onClick={() => setStatus.mutate('rejected')}
                >
                  Reject
                </Button>
                <Button
                  type="button"
                  variant={status === 'spam' ? 'secondary' : 'outline'}
                  onClick={() => setStatus.mutate('spam')}
                >
                  Mark spam
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => {
                    if (confirm('Delete this review permanently?')) deleteReview.mutate();
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
              <div className="space-y-2">
                <Label>Internal notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="Private notes (not shown on storefront)"
                  className="min-h-[100px]"
                />
              </div>
            </TabsContent>

            <TabsContent value="reply" className="space-y-4 mt-4">
              {review.merchant_reply && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    <MessageSquare className="h-4 w-4" />
                    Published reply
                  </div>
                  <p className="whitespace-pre-wrap">{review.merchant_reply}</p>
                  {review.merchant_replied_at && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(review.merchant_replied_at).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label>Your reply</Label>
                <Textarea
                  value={reply}
                  onChange={(e) => {
                    setReply(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="Thank the customer or address their feedback…"
                  className="min-h-[120px]"
                />
              </div>
              {reply.trim() && (
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Preview</p>
                  <p className="whitespace-pre-wrap">{reply.trim()}</p>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={saveReplyNotes.isPending}
                  onClick={() => saveReplyNotes.mutate()}
                >
                  Save reply & notes
                </Button>
                {reply && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setReply('');
                      setDirty(true);
                    }}
                  >
                    Clear reply
                  </Button>
                )}
              </div>
            </TabsContent>

            <TabsContent value="history" className="space-y-3 mt-4">
              {history.map((h, i) => (
                <div key={`${h.label}-${i}`} className="flex gap-3 text-sm">
                  <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                  <div>
                    <div className="font-medium">{h.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(h.at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </div>

        <div className="shrink-0 border-t bg-background/95 backdrop-blur px-4 py-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={status === 'approved'}
            onClick={() => setStatus.mutate('approved')}
          >
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={status === 'rejected'}
            onClick={() => setStatus.mutate('rejected')}
          >
            Reject
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!dirty || saveReplyNotes.isPending}
            onClick={() => saveReplyNotes.mutate()}
          >
            Save
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
