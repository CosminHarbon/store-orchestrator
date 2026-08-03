import { useState } from 'react';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { submitStoreReview } from '@/lib/storefront/api';
import { cn } from '@/lib/utils';

interface StorefrontReviewFormProps {
  apiKey: string;
  productId: string;
  productTitle: string;
  enabled?: boolean;
  onSubmitted?: () => void;
  /** Premium uses CSS vars; Elementar can pass inline styles via className */
  className?: string;
}

export function StorefrontReviewForm({
  apiKey,
  productId,
  productTitle,
  enabled = true,
  onSubmitted,
  className,
}: StorefrontReviewFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!enabled) return null;

  if (done) {
    return (
      <div className={cn('rounded-xl border p-4 text-sm', className)}>
        <p className="font-medium">Thanks for your review!</p>
        <p className="text-muted-foreground mt-1 opacity-80">
          It was submitted for {productTitle} and will appear after the store approves it.
        </p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter your name');
      return;
    }
    setSubmitting(true);
    try {
      await submitStoreReview(apiKey, {
        product_id: productId,
        customer_name: name.trim(),
        customer_email: email.trim() || undefined,
        rating,
        review_text: text.trim() || undefined,
      });
      setDone(true);
      toast.success('Review submitted — pending approval');
      onSubmitted?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className={cn('rounded-xl border p-4 space-y-3', className)}>
      <div>
        <h3 className="font-medium">Leave a review</h3>
        <p className="text-xs text-muted-foreground mt-0.5 opacity-80">
          Share your experience with {productTitle}
        </p>
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(s)}
            className="p-0.5"
            aria-label={`${s} stars`}
          >
            <Star
              className={cn(
                'h-6 w-6',
                s <= (hover || rating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'
              )}
            />
          </button>
        ))}
      </div>
      <input
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name *"
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email (optional)"
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write your review (optional)"
        rows={3}
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none"
      />
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-foreground text-background py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? 'Submitting…' : 'Submit review'}
      </button>
    </form>
  );
}
