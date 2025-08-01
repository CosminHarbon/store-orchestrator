import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Users, ShoppingBag, DollarSign, TrendingUp, ChevronDown, ChevronRight, Package } from "lucide-react";

interface CustomerOrder {
  id: string;
  customer_name: string;
  customer_address: string;
  total: number;
  created_at: string;
  payment_status: string;
  shipping_status: string;
  order_items: {
    product_title: string;
    quantity: number;
    product_price: number;
  }[];
}

interface CustomerDetails {
  customer_email: string;
  total_orders: number;
  total_spent: number;
  average_order_value: number;
  first_order_date: string;
  last_order_date: string;
  orders: CustomerOrder[];
  unique_names: string[];
  unique_addresses: string[];
}

const CustomerManagement: React.FC = () => {
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  const { data: customers, isLoading, error } = useQuery({
    queryKey: ['customer-details'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          customer_email,
          customer_name,
          customer_address,
          total,
          created_at,
          payment_status,
          shipping_status,
          order_items(
            product_title,
            quantity,
            product_price
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by email and collect all order details
      const customerMap = new Map<string, CustomerDetails>();

      data.forEach(order => {
        const email = order.customer_email;
        const existing = customerMap.get(email);

        if (existing) {
          existing.total_orders += 1;
          existing.total_spent += parseFloat(order.total.toString());
          existing.average_order_value = existing.total_spent / existing.total_orders;
          
          // Add unique names and addresses
          if (!existing.unique_names.includes(order.customer_name)) {
            existing.unique_names.push(order.customer_name);
          }
          if (!existing.unique_addresses.includes(order.customer_address)) {
            existing.unique_addresses.push(order.customer_address);
          }
          
          // Add order details
          existing.orders.push(order);
          
          // Update date ranges
          if (new Date(order.created_at) > new Date(existing.last_order_date)) {
            existing.last_order_date = order.created_at;
          }
          if (new Date(order.created_at) < new Date(existing.first_order_date)) {
            existing.first_order_date = order.created_at;
          }
        } else {
          customerMap.set(email, {
            customer_email: email,
            total_orders: 1,
            total_spent: parseFloat(order.total.toString()),
            average_order_value: parseFloat(order.total.toString()),
            first_order_date: order.created_at,
            last_order_date: order.created_at,
            orders: [order],
            unique_names: [order.customer_name],
            unique_addresses: [order.customer_address],
          });
        }
      });

      return Array.from(customerMap.values()).sort((a, b) => b.total_spent - a.total_spent);
    },
  });

  const toggleCustomerExpansion = (email: string) => {
    const newExpanded = new Set(expandedCustomers);
    if (newExpanded.has(email)) {
      newExpanded.delete(email);
    } else {
      newExpanded.add(email);
    }
    setExpandedCustomers(newExpanded);
  };

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
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Total Spent</TableHead>
                  <TableHead>Avg Order</TableHead>
                  <TableHead>First Order</TableHead>
                  <TableHead>Last Order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers?.map((customer) => (
                  <React.Fragment key={customer.customer_email}>
                    <TableRow className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleCustomerExpansion(customer.customer_email)}
                          className="p-0 h-6 w-6"
                        >
                          {expandedCustomers.has(customer.customer_email) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{customer.unique_names[0]}</div>
                          {customer.unique_names.length > 1 && (
                            <div className="text-sm text-muted-foreground">
                              +{customer.unique_names.length - 1} other name{customer.unique_names.length > 2 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{customer.customer_email}</TableCell>
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
                    
                    {/* Expanded customer details */}
                    {expandedCustomers.has(customer.customer_email) && (
                      <TableRow>
                        <TableCell colSpan={8} className="p-0">
                          <div className="p-4 bg-muted/30 border-t">
                            <div className="space-y-4">
                              {/* Names and Addresses Used */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Card>
                                  <CardHeader className="pb-2">
                                    <CardTitle className="text-sm">Names Used</CardTitle>
                                  </CardHeader>
                                  <CardContent className="pt-0">
                                    <div className="space-y-1">
                                      {customer.unique_names.map((name, idx) => (
                                        <div key={idx} className="text-sm">{name}</div>
                                      ))}
                                    </div>
                                  </CardContent>
                                </Card>
                                
                                <Card>
                                  <CardHeader className="pb-2">
                                    <CardTitle className="text-sm">Addresses Used</CardTitle>
                                  </CardHeader>
                                  <CardContent className="pt-0">
                                    <div className="space-y-1">
                                      {customer.unique_addresses.map((address, idx) => (
                                        <div key={idx} className="text-sm">{address}</div>
                                      ))}
                                    </div>
                                  </CardContent>
                                </Card>
                              </div>
                              
                              {/* Order History */}
                              <Card>
                                <CardHeader className="pb-2">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <Package className="h-4 w-4" />
                                    Order History ({customer.orders.length} orders)
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0">
                                  <div className="space-y-3">
                                    {customer.orders.slice(0, 5).map((order) => (
                                      <div key={order.id} className="border rounded-lg p-3 bg-background">
                                        <div className="flex justify-between items-start mb-2">
                                          <div>
                                            <div className="font-medium text-sm">Order #{order.id.slice(-8)}</div>
                                            <div className="text-xs text-muted-foreground">
                                              {formatDate(order.created_at)} • {order.customer_name}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                              {order.customer_address}
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <div className="font-medium text-sm">{formatCurrency(order.total)}</div>
                                            <div className="flex gap-1 mt-1">
                                              <Badge variant={order.payment_status === 'paid' ? 'default' : 'secondary'} className="text-xs">
                                                {order.payment_status}
                                              </Badge>
                                              <Badge variant={order.shipping_status === 'delivered' ? 'default' : 'secondary'} className="text-xs">
                                                {order.shipping_status}
                                              </Badge>
                                            </div>
                                          </div>
                                        </div>
                                        
                                        {/* Products in order */}
                                        <div className="space-y-1">
                                          {order.order_items.map((item, idx) => (
                                            <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                                              <span>{item.quantity}x {item.product_title}</span>
                                              <span>{formatCurrency(item.product_price * item.quantity)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                    
                                    {customer.orders.length > 5 && (
                                      <div className="text-center text-sm text-muted-foreground">
                                        And {customer.orders.length - 5} more orders...
                                      </div>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
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