import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Star, Trash2, Check, X, Loader2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface Review {
  id: string;
  product_id: string;
  customer_name: string;
  customer_email: string | null;
  rating: number;
  review_text: string | null;
  is_approved: boolean;
  created_at: string;
  product?: {
    title: string;
  };
}

const StarRating = ({ rating }: { rating: number }) => {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'
          }`}
        />
      ))}
    </div>
  );
};

export default function ReviewsManagement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');

  // Fetch reviews with product info
  const { data: reviews, isLoading } = useQuery({
    queryKey: ['reviews', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select(`
          *,
          product:products(title)
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Review[];
    },
    enabled: !!user
  });

  // Fetch template customization for show_reviews toggle
  const { data: customization } = useQuery({
    queryKey: ['template-customization-reviews', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_customization')
        .select('id, show_reviews')
        .eq('user_id', user?.id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user
  });

  // Toggle reviews visibility mutation
  const toggleReviewsMutation = useMutation({
    mutationFn: async (showReviews: boolean) => {
      if (customization?.id) {
        const { error } = await supabase
          .from('template_customization')
          .update({ show_reviews: showReviews })
          .eq('id', customization.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('template_customization')
          .insert({ 
            user_id: user?.id, 
            template_id: 'elementar',
            show_reviews: showReviews 
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-customization-reviews'] });
      toast.success('Reviews visibility updated');
    },
    onError: () => {
      toast.error('Failed to update reviews visibility');
    }
  });

  // Toggle review approval
  const toggleApprovalMutation = useMutation({
    mutationFn: async ({ reviewId, isApproved }: { reviewId: string; isApproved: boolean }) => {
      const { error } = await supabase
        .from('reviews')
        .update({ is_approved: isApproved })
        .eq('id', reviewId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('Review status updated');
    },
    onError: () => {
      toast.error('Failed to update review');
    }
  });

  // Delete review
  const deleteReviewMutation = useMutation({
    mutationFn: async (reviewId: string) => {
      const { error } = await supabase
        .from('reviews')
        .delete()
        .eq('id', reviewId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('Review deleted');
    },
    onError: () => {
      toast.error('Failed to delete review');
    }
  });

  // Calculate stats
  const stats = {
    total: reviews?.length || 0,
    approved: reviews?.filter(r => r.is_approved).length || 0,
    pending: reviews?.filter(r => !r.is_approved).length || 0,
    avgRating: reviews?.length 
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : '0.0'
  };

  const filteredReviews = reviews?.filter(review => {
    if (filter === 'approved') return review.is_approved;
    if (filter === 'pending') return !review.is_approved;
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Reviews</h2>
          <p className="text-muted-foreground">Manage customer reviews for your products</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="show-reviews"
              checked={customization?.show_reviews ?? true}
              onCheckedChange={(checked) => toggleReviewsMutation.mutate(checked)}
            />
            <Label htmlFor="show-reviews" className="text-sm">
              Show on storefront
            </Label>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total Reviews</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              <span className="text-2xl font-bold">{stats.avgRating}</span>
            </div>
            <p className="text-xs text-muted-foreground">Average Rating</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            <p className="text-xs text-muted-foreground">Approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-orange-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          All ({stats.total})
        </Button>
        <Button
          variant={filter === 'approved' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('approved')}
        >
          Approved ({stats.approved})
        </Button>
        <Button
          variant={filter === 'pending' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('pending')}
        >
          Pending ({stats.pending})
        </Button>
      </div>

      {/* Reviews List */}
      {filteredReviews?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">No reviews yet</h3>
            <p className="text-muted-foreground text-sm">
              Reviews from your customers will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredReviews?.map((review) => (
            <Card key={review.id}>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{review.customer_name}</span>
                      <StarRating rating={review.rating} />
                      <Badge variant={review.is_approved ? 'default' : 'secondary'}>
                        {review.is_approved ? 'Approved' : 'Pending'}
                      </Badge>
                    </div>
                    
                    {review.product?.title && (
                      <p className="text-sm text-muted-foreground">
                        Product: {review.product.title}
                      </p>
                    )}
                    
                    {review.review_text && (
                      <p className="text-sm mt-2">{review.review_text}</p>
                    )}
                    
                    <p className="text-xs text-muted-foreground">
                      {new Date(review.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                      {review.customer_email && ` • ${review.customer_email}`}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleApprovalMutation.mutate({
                        reviewId: review.id,
                        isApproved: !review.is_approved
                      })}
                    >
                      {review.is_approved ? (
                        <>
                          <X className="h-4 w-4 mr-1" />
                          Unapprove
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </>
                      )}
                    </Button>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Review</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this review? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteReviewMutation.mutate(review.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
