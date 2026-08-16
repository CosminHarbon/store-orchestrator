import type {
  ExportCell,
  ExportColumnDef,
  ExportDatasetDef,
  ExportDatasetId,
  ExportPresetId,
  ExportRow,
  ReportStyleId,
} from './types';

const col = (id: string, align?: 'left' | 'right'): ExportColumnDef => ({
  id,
  labelKey: id,
  align,
});

export const EXPORT_DATASETS: Record<ExportDatasetId, ExportDatasetDef> = {
  products: {
    id: 'products',
    filenamePrefix: 'products',
    defaultPreset: 'essential',
    defaultStyle: 'classic',
    columns: [
      col('title'),
      col('sku'),
      col('category'),
      col('price', 'right'),
      col('stock', 'right'),
      col('low_stock_threshold', 'right'),
      col('orders', 'right'),
      col('revenue', 'right'),
      col('id'),
    ],
    presets: [
      { id: 'essential', columnIds: ['title', 'sku', 'price', 'stock'] },
      {
        id: 'detailed',
        columnIds: ['title', 'sku', 'category', 'price', 'stock', 'low_stock_threshold', 'orders', 'revenue'],
      },
      {
        id: 'accounting',
        columnIds: ['sku', 'title', 'price', 'stock', 'revenue', 'id'],
      },
    ],
  },
  stock: {
    id: 'stock',
    filenamePrefix: 'stock',
    defaultPreset: 'essential',
    defaultStyle: 'executive',
    columns: [
      col('title'),
      col('sku'),
      col('stock', 'right'),
      col('low_stock_threshold', 'right'),
      col('price', 'right'),
      col('category'),
      col('status'),
    ],
    presets: [
      { id: 'essential', columnIds: ['title', 'sku', 'stock', 'price'] },
      {
        id: 'detailed',
        columnIds: ['title', 'sku', 'stock', 'low_stock_threshold', 'price', 'category', 'status'],
      },
      {
        id: 'accounting',
        columnIds: ['sku', 'title', 'stock', 'price', 'category'],
      },
    ],
  },
  reviews: {
    id: 'reviews',
    filenamePrefix: 'reviews',
    defaultPreset: 'essential',
    defaultStyle: 'classic',
    columns: [
      col('customer'),
      col('email'),
      col('product'),
      col('rating', 'right'),
      col('review'),
      col('status'),
      col('created'),
      col('reply'),
    ],
    presets: [
      { id: 'essential', columnIds: ['customer', 'product', 'rating', 'status', 'created'] },
      {
        id: 'detailed',
        columnIds: ['customer', 'email', 'product', 'rating', 'review', 'status', 'created', 'reply'],
      },
      {
        id: 'accounting',
        columnIds: ['created', 'product', 'rating', 'status', 'customer'],
      },
    ],
  },
  orders: {
    id: 'orders',
    filenamePrefix: 'orders',
    defaultPreset: 'essential',
    defaultStyle: 'executive',
    columns: [
      col('id'),
      col('created'),
      col('customer'),
      col('email'),
      col('phone'),
      col('address'),
      col('city'),
      col('county'),
      col('total', 'right'),
      col('payment_status'),
      col('shipping_status'),
      col('delivery_type'),
      col('awb'),
      col('carrier'),
    ],
    presets: [
      {
        id: 'essential',
        columnIds: ['created', 'customer', 'total', 'payment_status', 'shipping_status'],
      },
      {
        id: 'detailed',
        columnIds: [
          'id',
          'created',
          'customer',
          'email',
          'phone',
          'address',
          'city',
          'total',
          'payment_status',
          'shipping_status',
          'delivery_type',
          'awb',
        ],
      },
      {
        id: 'accounting',
        columnIds: ['id', 'created', 'customer', 'email', 'total', 'payment_status', 'awb'],
      },
    ],
  },
  customers: {
    id: 'customers',
    filenamePrefix: 'customers',
    defaultPreset: 'essential',
    defaultStyle: 'classic',
    columns: [
      col('name'),
      col('email'),
      col('phone'),
      col('orders', 'right'),
      col('spent', 'right'),
      col('aov', 'right'),
      col('segment'),
      col('status'),
      col('first_order'),
      col('last_order'),
      col('payment_method'),
    ],
    presets: [
      { id: 'essential', columnIds: ['name', 'email', 'orders', 'spent', 'segment'] },
      {
        id: 'detailed',
        columnIds: [
          'name',
          'email',
          'phone',
          'orders',
          'spent',
          'aov',
          'segment',
          'status',
          'first_order',
          'last_order',
          'payment_method',
        ],
      },
      {
        id: 'accounting',
        columnIds: ['email', 'name', 'orders', 'spent', 'aov', 'last_order'],
      },
    ],
  },
  payments: {
    id: 'payments',
    filenamePrefix: 'payments',
    defaultPreset: 'essential',
    defaultStyle: 'ledger',
    columns: [
      col('id'),
      col('created'),
      col('customer'),
      col('email'),
      col('total', 'right'),
      col('payment_status'),
      col('method'),
      col('shipping_status'),
    ],
    presets: [
      {
        id: 'essential',
        columnIds: ['created', 'customer', 'total', 'payment_status', 'method'],
      },
      {
        id: 'detailed',
        columnIds: [
          'id',
          'created',
          'customer',
          'email',
          'total',
          'payment_status',
          'method',
          'shipping_status',
        ],
      },
      {
        id: 'accounting',
        columnIds: ['id', 'created', 'email', 'total', 'payment_status', 'method'],
      },
    ],
  },
};

export const REPORT_STYLES: ReportStyleId[] = ['classic', 'executive', 'ledger'];
export const PRESET_IDS: ExportPresetId[] = ['essential', 'detailed', 'accounting'];

export function getDataset(id: ExportDatasetId): ExportDatasetDef {
  return EXPORT_DATASETS[id];
}

export function resolveColumns(
  dataset: ExportDatasetDef,
  columnIds: string[]
): ExportColumnDef[] {
  const byId = new Map(dataset.columns.map((c) => [c.id, c]));
  return columnIds.map((id) => byId.get(id)).filter(Boolean) as ExportColumnDef[];
}

export function cellToString(value: ExportCell): string {
  if (value == null) return '';
  return String(value);
}

export function projectRows(rows: ExportRow[], columnIds: string[]): ExportRow[] {
  return rows.map((row) => {
    const next: ExportRow = {};
    for (const id of columnIds) next[id] = row[id] ?? '';
    return next;
  });
}
