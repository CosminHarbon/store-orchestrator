import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Users, ShoppingBag, DollarSign, TrendingUp, ChevronDown, ChevronRight, Package, ChevronLeft } from "lucide-react";

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
  const [customerPages, setCustomerPages] = useState<Map<string, number>>(new Map());
  
  const ORDERS_PER_PAGE = 5;

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
      // Reset page when collapsing
      const newPages = new Map(customerPages);
      newPages.delete(email);
      setCustomerPages(newPages);
    } else {
      newExpanded.add(email);
      // Initialize to page 1 when expanding
      const newPages = new Map(customerPages);
      newPages.set(email, 1);
      setCustomerPages(newPages);
    }
    setExpandedCustomers(newExpanded);
  };

  const setCustomerPage = (email: string, page: number) => {
    const newPages = new Map(customerPages);
    newPages.set(email, page);
    setCustomerPages(newPages);
  };

  const getCurrentPage = (email: string) => customerPages.get(email) || 1;

  const getPaginatedOrders = (customer: CustomerDetails) => {
    const currentPage = getCurrentPage(customer.customer_email);
    const startIndex = (currentPage - 1) * ORDERS_PER_PAGE;
    const endIndex = startIndex + ORDERS_PER_PAGE;
    return customer.orders.slice(startIndex, endIndex);
  };

  const getTotalPages = (customer: CustomerDetails) => {
    return Math.ceil(customer.orders.length / ORDERS_PER_PAGE);
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
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
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
                                    {getPaginatedOrders(customer).map((order) => (
                                      <div key={order.id} className="border rounded-lg p-3 bg-background">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
                                          <div className="space-y-1">
                                            <div className="font-medium text-sm">Order #{order.id.slice(-8)}</div>
                                            <div className="text-xs text-muted-foreground">
                                              {formatDate(order.created_at)} • {order.customer_name}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                              {order.customer_address}
                                            </div>
                                          </div>
                                          <div className="flex flex-col sm:text-right gap-2">
                                            <div className="font-medium text-sm">{formatCurrency(order.total)}</div>
                                            <div className="flex flex-wrap gap-1">
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
                                        <div className="space-y-1 mt-3">
                                          {order.order_items.map((item, idx) => (
                                            <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                                              <span className="truncate mr-2">{item.quantity}x {item.product_title}</span>
                                              <span className="flex-shrink-0">{formatCurrency(item.product_price * item.quantity)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                    
                                    {/* Pagination */}
                                    {getTotalPages(customer) > 1 && (
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                                        <div className="text-sm text-muted-foreground text-center sm:text-left">
                                          Page {getCurrentPage(customer.customer_email)} of {getTotalPages(customer)}
                                        </div>
                                        <div className="flex justify-center gap-2">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCustomerPage(customer.customer_email, getCurrentPage(customer.customer_email) - 1)}
                                            disabled={getCurrentPage(customer.customer_email) === 1}
                                            className="h-8 px-2"
                                          >
                                            <ChevronLeft className="h-3 w-3" />
                                          </Button>
                                          
                                          {/* Page number buttons - limit to 3 on mobile */}
                                          {Array.from({ length: Math.min(getTotalPages(customer), 3) }, (_, i) => {
                                            const currentPage = getCurrentPage(customer.customer_email);
                                            const totalPages = getTotalPages(customer);
                                            let pageNum;
                                            
                                            if (totalPages <= 3) {
                                              pageNum = i + 1;
                                            } else if (currentPage === 1) {
                                              pageNum = i + 1;
                                            } else if (currentPage === totalPages) {
                                              pageNum = totalPages - 2 + i;
                                            } else {
                                              pageNum = currentPage - 1 + i;
                                            }
                                            
                                            return (
                                              <Button
                                                key={pageNum}
                                                variant={getCurrentPage(customer.customer_email) === pageNum ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => setCustomerPage(customer.customer_email, pageNum)}
                                                className="h-8 w-8 p-0"
                                              >
                                                {pageNum}
                                              </Button>
                                            );
                                          })}
                                          
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCustomerPage(customer.customer_email, getCurrentPage(customer.customer_email) + 1)}
                                            disabled={getCurrentPage(customer.customer_email) === getTotalPages(customer)}
                                            className="h-8 px-2"
                                          >
                                            <ChevronRight className="h-3 w-3" />
                                          </Button>
                                        </div>
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
          
          {/* Mobile Card View */}
          <div className="lg:hidden space-y-4">
            {customers?.map((customer) => (
              <Card key={customer.customer_email} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
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
                        <CardTitle className="text-base font-medium">{customer.unique_names[0]}</CardTitle>
                      </div>
                      <p className="text-sm text-muted-foreground">{customer.customer_email}</p>
                      {customer.unique_names.length > 1 && (
                        <p className="text-xs text-muted-foreground">
                          +{customer.unique_names.length - 1} other name{customer.unique_names.length > 2 ? 's' : ''}
                        </p>
                      )}
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-lg font-semibold">{formatCurrency(customer.total_spent)}</p>
                      <Badge variant={customer.total_orders > 1 ? "default" : "secondary"} className="text-xs">
                        {customer.total_orders} order{customer.total_orders > 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Avg Order:</span>
                      <div className="font-medium">{formatCurrency(customer.average_order_value)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">First Order:</span>
                      <div className="font-medium">{formatDate(customer.first_order_date)}</div>
                    </div>
                  </div>
                  
                  {/* Expanded mobile details */}
                  {expandedCustomers.has(customer.customer_email) && (
                    <div className="space-y-4 pt-3 border-t">
                      {/* Names and Addresses */}
                      <div className="space-y-3">
                        <div>
                          <h4 className="text-sm font-medium mb-2">Names Used</h4>
                          <div className="space-y-1">
                            {customer.unique_names.map((name, idx) => (
                              <div key={idx} className="text-sm bg-muted/50 p-2 rounded">{name}</div>
                            ))}
                          </div>
                        </div>
                        
                        <div>
                          <h4 className="text-sm font-medium mb-2">Addresses Used</h4>
                          <div className="space-y-1">
                            {customer.unique_addresses.map((address, idx) => (
                              <div key={idx} className="text-sm bg-muted/50 p-2 rounded break-words">{address}</div>
                            ))}
                          </div>
                        </div>
                      </div>
                      
                      {/* Order History */}
                      <div>
                        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Order History ({customer.orders.length} orders)
                        </h4>
                        <div className="space-y-3">
                          {getPaginatedOrders(customer).map((order) => (
                            <div key={order.id} className="border rounded-lg p-3 bg-background">
                              <div className="space-y-2">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <div className="font-medium text-sm">Order #{order.id.slice(-8)}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {formatDate(order.created_at)}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-medium text-sm">{formatCurrency(order.total)}</div>
                                  </div>
                                </div>
                                
                                <div className="flex flex-wrap gap-1">
                                  <Badge variant={order.payment_status === 'paid' ? 'default' : 'secondary'} className="text-xs">
                                    {order.payment_status}
                                  </Badge>
                                  <Badge variant={order.shipping_status === 'delivered' ? 'default' : 'secondary'} className="text-xs">
                                    {order.shipping_status}
                                  </Badge>
                                </div>
                                
                                {/* Products in order */}
                                <div className="space-y-1">
                                  {order.order_items.map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                                      <span className="truncate mr-2">{item.quantity}x {item.product_title}</span>
                                      <span className="flex-shrink-0">{formatCurrency(item.product_price * item.quantity)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                          
                          {/* Mobile Pagination */}
                          {getTotalPages(customer) > 1 && (
                            <div className="flex flex-col gap-3 pt-2">
                              <div className="text-sm text-muted-foreground text-center">
                                Page {getCurrentPage(customer.customer_email)} of {getTotalPages(customer)}
                              </div>
                              <div className="flex justify-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setCustomerPage(customer.customer_email, getCurrentPage(customer.customer_email) - 1)}
                                  disabled={getCurrentPage(customer.customer_email) === 1}
                                  className="h-8 px-3"
                                >
                                  <ChevronLeft className="h-3 w-3 mr-1" />
                                  Prev
                                </Button>
                                
                                <div className="flex gap-1">
                                  {Array.from({ length: Math.min(getTotalPages(customer), 3) }, (_, i) => {
                                    const currentPage = getCurrentPage(customer.customer_email);
                                    const totalPages = getTotalPages(customer);
                                    let pageNum;
                                    
                                    if (totalPages <= 3) {
                                      pageNum = i + 1;
                                    } else if (currentPage === 1) {
                                      pageNum = i + 1;
                                    } else if (currentPage === totalPages) {
                                      pageNum = totalPages - 2 + i;
                                    } else {
                                      pageNum = currentPage - 1 + i;
                                    }
                                    
                                    return (
                                      <Button
                                        key={pageNum}
                                        variant={getCurrentPage(customer.customer_email) === pageNum ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setCustomerPage(customer.customer_email, pageNum)}
                                        className="h-8 w-8 p-0"
                                      >
                                        {pageNum}
                                      </Button>
                                    );
                                  })}
                                </div>
                                
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setCustomerPage(customer.customer_email, getCurrentPage(customer.customer_email) + 1)}
                                  disabled={getCurrentPage(customer.customer_email) === getTotalPages(customer)}
                                  className="h-8 px-3"
                                >
                                  Next
                                  <ChevronRight className="h-3 w-3 ml-1" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerManagement;