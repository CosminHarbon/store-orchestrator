import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreditCard, TrendingUp, AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DateRangeFilter, useDateRangeFilter } from '@/components/DateRangeFilter';

interface PaymentTransaction {
  id: string;
  order_id: string;
  payment_status: string;
  amount: number;
  currency: string;
  payment_method?: string;
  created_at: string;
  updated_at: string;
}

interface PaymentStats {
  totalTransactions: number;
  totalAmount: number;
  completedAmount: number;
  pendingAmount: number;
  failedTransactions: number;
  completedTransactions: number;
  pendingTransactions: number;
}

const PaymentStatistics = () => {
  const { user } = useAuth();
  const { dateRange, setDateRange, preset, setPreset } = useDateRangeFilter('30days');

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['payment-transactions', dateRange.from, dateRange.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('user_id', user?.id)
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString())
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as PaymentTransaction[];
    },
    enabled: !!user
  });

  const stats: PaymentStats = {
    totalTransactions: transactions?.length || 0,
    totalAmount: transactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0,
    completedAmount: transactions?.filter(t => t.payment_status === 'completed').reduce((sum, t) => sum + Number(t.amount), 0) || 0,
    pendingAmount: transactions?.filter(t => t.payment_status === 'pending' || t.payment_status === 'processing').reduce((sum, t) => sum + Number(t.amount), 0) || 0,
    failedTransactions: transactions?.filter(t => t.payment_status === 'failed' || t.payment_status === 'cancelled').length || 0,
    completedTransactions: transactions?.filter(t => t.payment_status === 'completed').length || 0,
    pendingTransactions: transactions?.filter(t => t.payment_status === 'pending' || t.payment_status === 'processing').length || 0,
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'pending':
      case 'processing':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'failed':
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">Completed</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>;
      case 'processing':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">Processing</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="text-gray-600">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="bg-gradient-card shadow-card border border-border/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 lg:pb-3">
                <div className="h-3 lg:h-4 w-16 lg:w-20 bg-muted animate-pulse rounded"></div>
                <div className="h-3 w-3 lg:h-4 lg:w-4 bg-muted animate-pulse rounded flex-shrink-0"></div>
              </CardHeader>
              <CardContent className="pb-2 lg:pb-4">
                <div className="h-6 lg:h-8 w-12 lg:w-16 bg-muted animate-pulse rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Range Filter */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Payment Analytics</h2>
        <DateRangeFilter
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          preset={preset}
          onPresetChange={setPreset}
        />
      </div>

      {/* Payment Statistics Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="bg-gradient-card shadow-card border border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 lg:pb-3">
            <CardTitle className="text-xs lg:text-sm font-medium truncate">Total Revenue</CardTitle>
            <TrendingUp className="h-3 w-3 lg:h-4 lg:w-4 text-muted-foreground flex-shrink-0" />
          </CardHeader>
          <CardContent className="pb-2 lg:pb-4">
            <div className="text-lg lg:text-2xl font-bold truncate">
              {stats.completedAmount.toFixed(2)} RON
            </div>
            <p className="text-xs text-muted-foreground truncate">
              From {stats.completedTransactions} completed payments
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card shadow-card border border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 lg:pb-3">
            <CardTitle className="text-xs lg:text-sm font-medium truncate">Pending Revenue</CardTitle>
            <Clock className="h-3 w-3 lg:h-4 lg:w-4 text-muted-foreground flex-shrink-0" />
          </CardHeader>
          <CardContent className="pb-2 lg:pb-4">
            <div className="text-lg lg:text-2xl font-bold truncate">
              {stats.pendingAmount.toFixed(2)} RON
            </div>
            <p className="text-xs text-muted-foreground truncate">
              From {stats.pendingTransactions} pending payments
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card shadow-card border border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 lg:pb-3">
            <CardTitle className="text-xs lg:text-sm font-medium truncate">Total Transactions</CardTitle>
            <CreditCard className="h-3 w-3 lg:h-4 lg:w-4 text-muted-foreground flex-shrink-0" />
          </CardHeader>
          <CardContent className="pb-2 lg:pb-4">
            <div className="text-lg lg:text-2xl font-bold truncate">{stats.totalTransactions}</div>
            <p className="text-xs text-muted-foreground truncate">
              All payment attempts
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card shadow-card border border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 lg:pb-3">
            <CardTitle className="text-xs lg:text-sm font-medium truncate">Failed Payments</CardTitle>
            <AlertCircle className="h-3 w-3 lg:h-4 lg:w-4 text-muted-foreground flex-shrink-0" />
          </CardHeader>
          <CardContent className="pb-2 lg:pb-4">
            <div className="text-lg lg:text-2xl font-bold text-red-600 truncate">{stats.failedTransactions}</div>
            <p className="text-xs text-muted-foreground truncate">
              Failed or cancelled
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Payment Transactions</CardTitle>
          <CardDescription>Latest payment activity in your store</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {transactions && transactions.length > 0 ? (
              transactions.slice(0, 10).map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    {getStatusIcon(transaction.payment_status)}
                    <div>
                      <div className="font-medium">
                        {transaction.amount} {transaction.currency}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(transaction.created_at).toLocaleDateString()} at{' '}
                        {new Date(transaction.created_at).toLocaleTimeString()}
                      </div>
                      {transaction.payment_method && (
                        <div className="text-xs text-muted-foreground">
                          via {transaction.payment_method}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusBadge(transaction.payment_status)}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No payment transactions yet</p>
                <p className="text-sm">Payments will appear here once customers start purchasing</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment Success Rate */}
      {stats.totalTransactions > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Payment Success Rate</CardTitle>
            <CardDescription>Performance metrics for your payment processing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm">Success Rate</span>
                <span className="font-semibold">
                  {((stats.completedTransactions / stats.totalTransactions) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full" 
                  style={{ 
                    width: `${(stats.completedTransactions / stats.totalTransactions) * 100}%` 
                  }}
                ></div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-green-600 font-semibold">{stats.completedTransactions}</div>
                  <div className="text-muted-foreground">Completed</div>
                </div>
                <div>
                  <div className="text-yellow-600 font-semibold">{stats.pendingTransactions}</div>
                  <div className="text-muted-foreground">Pending</div>
                </div>
                <div>
                  <div className="text-red-600 font-semibold">{stats.failedTransactions}</div>
                  <div className="text-muted-foreground">Failed</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PaymentStatistics;