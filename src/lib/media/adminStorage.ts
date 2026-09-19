/** Superadmin-only storage analytics maths. All inputs/outputs are integer bytes; format at the edge. */

export type ProductStorageRow = {
  product_id: string | null;
  product_title: string | null;
  asset_id: string;
  product_image_id: string | null;
  public_url: string | null;
  is_primary: boolean | null;
  display_order: number | null;
  original_size_bytes: number | null;
  stored_size_bytes: number;
  charged_bytes: number;
  saved_bytes: number;
  status: string;
};

export type ProductStorageGroup = {
  productId: string | null;
  title: string | null;
  images: ProductStorageRow[];
  chargedBytes: number;
  storedBytes: number;
  savedBytes: number;
  /** Rows whose original size was never recorded (legacy). */
  legacyImages: number;
  /** Charged/stored bytes limited to rows with a known original — basis for the compression %. */
  measuredChargedBytes: number;
  measuredStoredBytes: number;
};

export function compressionPercent(measuredChargedBytes: number, measuredStoredBytes: number): number | null {
  if (!(measuredChargedBytes > 0)) return null;
  const saved = Math.max(0, measuredChargedBytes - measuredStoredBytes);
  return Math.round((saved / measuredChargedBytes) * 1000) / 10;
}

export function groupProductStorage(rows: ProductStorageRow[]): ProductStorageGroup[] {
  const groups = new Map<string, ProductStorageGroup>();
  for (const row of rows) {
    const key = row.product_id ?? 'unattributed';
    let g = groups.get(key);
    if (!g) {
      g = {
        productId: row.product_id,
        title: row.product_title,
        images: [],
        chargedBytes: 0,
        storedBytes: 0,
        savedBytes: 0,
        legacyImages: 0,
        measuredChargedBytes: 0,
        measuredStoredBytes: 0,
      };
      groups.set(key, g);
    }
    g.images.push(row);
    g.chargedBytes += row.charged_bytes;
    g.storedBytes += row.stored_size_bytes;
    g.savedBytes += row.saved_bytes;
    if (row.original_size_bytes === null) {
      g.legacyImages += 1;
    } else {
      g.measuredChargedBytes += row.charged_bytes;
      g.measuredStoredBytes += row.stored_size_bytes;
    }
  }
  return [...groups.values()].sort((a, b) => b.chargedBytes - a.chargedBytes);
}
