import { useMemo, useState } from 'react';
import { Edit, Trash2, Images, Package, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { calculateProductPrice, formatPrice, formatDiscount } from '@/lib/discountUtils';
import { formatRon, type ProductMetrics } from '@/lib/productAnalytics';
import { cn } from '@/lib/utils';

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  image: string;
  category: string;
  stock: number;
  sku: string;
  low_stock_threshold: number;
  created_at?: string;
  updated_at?: string;
}

interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  is_primary: boolean;
}

interface Discount {
  id: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
}

interface ProductDiscount {
  product_id: string;
  discount_id: string;
}

type SortKey = 'title' | 'price' | 'stock' | 'orders' | 'revenue' | 'updated_at';

interface ProductCatalogTableProps {
  products: Product[];
  productImages: ProductImage[];
  metricsById: Record<string, ProductMetrics>;
  discounts?: Discount[];
  productDiscounts?: ProductDiscount[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (ids: string[]) => void;
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  onManageImages: (product: Product) => void;
  onProductClick: (product: Product) => void;
}

export function ProductCatalogTable({
  products,
  productImages,
  metricsById,
  discounts = [],
  productDiscounts = [],
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
  onDelete,
  onManageImages,
  onProductClick,
}: ProductCatalogTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const sorted = useMemo(() => {
    const list = [...products];
    list.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const ma = metricsById[a.id];
      const mb = metricsById[b.id];
      switch (sortKey) {
        case 'title':
          return a.title.localeCompare(b.title) * dir;
        case 'price':
          return (Number(a.price) - Number(b.price)) * dir;
        case 'stock':
          return (Number(a.stock) - Number(b.stock)) * dir;
        case 'orders':
          return ((ma?.orders || 0) - (mb?.orders || 0)) * dir;
        case 'revenue':
          return ((ma?.revenue || 0) - (mb?.revenue || 0)) * dir;
        case 'updated_at':
        default:
          return (
            (new Date(a.updated_at || a.created_at || 0).getTime() -
              new Date(b.updated_at || b.created_at || 0).getTime()) *
            dir
          );
      }
    });
    return list;
  }, [products, metricsById, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const rows = sorted.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);
  const allSelected = rows.length > 0 && rows.every((p) => selectedIds.has(p.id));

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'title' ? 'asc' : 'desc');
    }
  };

  const getImage = (product: Product) =>
    productImages.find((i) => i.product_id === product.id)?.image_url || product.image;

  const stockBadge = (product: Product) => {
    if (product.stock <= 0) {
      return <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100 border-0">Out of Stock</Badge>;
    }
    if (product.stock <= product.low_stock_threshold) {
      return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-0">Low Stock</Badge>;
    }
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0">Active</Badge>;
  };

  const priceCell = (product: Product) => {
    const info = calculateProductPrice(product.id, product.price, discounts, productDiscounts);
    if (!info.hasDiscount || !info.discountedPrice) {
      return <span className="font-medium tabular-nums">{formatPrice(product.price)}</span>;
    }
    return (
      <div>
        <div className="font-medium tabular-nums flex items-center gap-1">
          {formatPrice(info.discountedPrice)}
          <Badge variant="destructive" className="text-[10px] px-1">
            {formatDiscount(info.discountPercentage || 0)}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground line-through">{formatPrice(info.originalPrice)}</div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="hidden lg:block overflow-x-auto rounded-md border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => onToggleSelectAll(rows.map((r) => r.id))}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>
                <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('title')}>
                  Product <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>
                <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('price')}>
                  Price <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>
                <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('stock')}>
                  Stock <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('orders')}>
                  Orders <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>
                <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('revenue')}>
                  Revenue <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>
                <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('updated_at')}>
                  Updated <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((product) => {
              const metrics = metricsById[product.id];
              const img = getImage(product);
              return (
                <TableRow
                  key={product.id}
                  className={cn('cursor-pointer', selectedIds.has(product.id) && 'bg-muted/40')}
                  onClick={() => onProductClick(product)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(product.id)}
                      onCheckedChange={() => onToggleSelect(product.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-md overflow-hidden bg-muted flex items-center justify-center shrink-0">
                        {img ? (
                          <img src={img} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Package className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{product.title}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {metrics?.badges.includes('best_seller') && (
                            <Badge className="text-[10px] bg-amber-100 text-amber-900 border-0">Best Seller</Badge>
                          )}
                          {metrics?.badges.includes('never_sold') && (
                            <Badge className="text-[10px] bg-slate-100 text-slate-700 border-0">Never Sold</Badge>
                          )}
                          {metrics?.badges.includes('recently_added') && (
                            <Badge className="text-[10px] bg-sky-100 text-sky-800 border-0">New</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {product.sku || '—'}
                  </TableCell>
                  <TableCell>{product.category || '—'}</TableCell>
                  <TableCell>{priceCell(product)}</TableCell>
                  <TableCell className="tabular-nums">{product.stock}</TableCell>
                  <TableCell>{stockBadge(product)}</TableCell>
                  <TableCell className="tabular-nums">{metrics?.orders ?? 0}</TableCell>
                  <TableCell className="tabular-nums font-medium">
                    {formatRon(metrics?.revenue ?? 0)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {product.updated_at
                      ? new Date(product.updated_at).toLocaleDateString()
                      : '—'}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onManageImages(product)}>
                        <Images className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onEdit(product)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive"
                        onClick={() => onDelete(product.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="lg:hidden space-y-3">
        {rows.map((product) => {
          const metrics = metricsById[product.id];
          const img = getImage(product);
          return (
            <div
              key={product.id}
              className="rounded-lg border border-border/60 p-3 bg-gradient-to-br from-background to-muted/20"
            >
              <div className="flex gap-3">
                <Checkbox
                  checked={selectedIds.has(product.id)}
                  onCheckedChange={() => onToggleSelect(product.id)}
                  className="mt-1"
                />
                <button type="button" className="flex-1 text-left" onClick={() => onProductClick(product)}>
                  <div className="flex gap-3">
                    <div className="h-14 w-14 rounded-md overflow-hidden bg-muted flex items-center justify-center shrink-0">
                      {img ? (
                        <img src={img} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Package className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{product.title}</div>
                      <div className="text-sm text-muted-foreground">{formatPrice(product.price)}</div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {stockBadge(product)}
                        <Badge variant="outline" className="text-[10px]">
                          {metrics?.orders ?? 0} orders
                        </Badge>
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Showing {(pageSafe - 1) * pageSize + 1}–{Math.min(pageSafe * pageSize, sorted.length)} of{' '}
          {sorted.length}
        </p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" size="sm" disabled={pageSafe <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pageSafe >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
