import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, ShoppingBag, DollarSign, TrendingUp } from "lucide-react";

interface CustomerStats {
  customer_email: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  total_orders: number;
  total_spent: number;
  average_order_value: number;
  first_order_date: string;
  last_order_date: string;
}

const CustomerManagement: React.FC = () => {
  const { data: customers, isLoading, error } = useQuery({
    queryKey: ['customer-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('customer_email, customer_name, customer_phone, customer_address, total, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by email and calculate statistics
      const customerMap = new Map<string, CustomerStats>();

      data.forEach(order => {
        const email = order.customer_email;
        const existing = customerMap.get(email);

        if (existing) {
          existing.total_orders += 1;
          existing.total_spent += parseFloat(order.total.toString());
          existing.average_order_value = existing.total_spent / existing.total_orders;
          
          // Update with most recent customer info
          if (new Date(order.created_at) > new Date(existing.last_order_date)) {
            existing.customer_name = order.customer_name;
            existing.customer_phone = order.customer_phone || existing.customer_phone;
            existing.customer_address = order.customer_address;
            existing.last_order_date = order.created_at;
          }
          
          // Update first order date if this is earlier
          if (new Date(order.created_at) < new Date(existing.first_order_date)) {
            existing.first_order_date = order.created_at;
          }
        } else {
          customerMap.set(email, {
            customer_email: email,
            customer_name: order.customer_name,
            customer_phone: order.customer_phone || '',
            customer_address: order.customer_address,
            total_orders: 1,
            total_spent: parseFloat(order.total.toString()),
            average_order_value: parseFloat(order.total.toString()),
            first_order_date: order.created_at,
            last_order_date: order.created_at,
          });
        }
      });

      return Array.from(customerMap.values()).sort((a, b) => b.total_spent - a.total_spent);
    },
  });

  const totalCustomers = customers?.length || 0;
  const totalRevenue = customers?.reduce((sum, customer) => sum + customer.total_spent, 0) || 0;
  const averageCustomerValue = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;
  const repeatCustomers = customers?.filter(customer => customer.total_orders > 1).length || 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-destructive">Error loading customers: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString();

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCustomers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Customer Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(averageCustomerValue)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Repeat Customers</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{repeatCustomers}</div>
            <p className="text-xs text-muted-foreground">
              {totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0}% retention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Customer Table */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Total Spent</TableHead>
                  <TableHead>Avg Order</TableHead>
                  <TableHead>First Order</TableHead>
                  <TableHead>Last Order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers?.map((customer) => (
                  <TableRow key={customer.customer_email}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{customer.customer_name}</div>
                        <div className="text-sm text-muted-foreground truncate max-w-48">
                          {customer.customer_address}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{customer.customer_email}</TableCell>
                    <TableCell>{customer.customer_phone || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={customer.total_orders > 1 ? "default" : "secondary"}>
                        {customer.total_orders}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(customer.total_spent)}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(customer.average_order_value)}
                    </TableCell>
                    <TableCell>{formatDate(customer.first_order_date)}</TableCell>
                    <TableCell>{formatDate(customer.last_order_date)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerManagement;