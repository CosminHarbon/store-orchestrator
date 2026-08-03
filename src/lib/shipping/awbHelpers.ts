/** Keys observed / documented across eAWB create-order responses for locker drop-off codes.
 *  Only extract if the API actually returns them — never invent values. */
const DEPOSIT_CODE_KEYS = [
  'locker_deposit_code',
  'deposit_code',
  'drop_off_code',
  'dropoff_code',
  'handover_code',
  'shipment_code',
  'parcel_code',
  'locker_pin',
  'pin_code',
  'pin',
  'easybox_code',
  'client_code',
  'pickup_code',
  'locker_code',
  'parcel_pin',
  'drop_code',
] as const;

export function isCashOnDeliveryOrder(order: {
  payment_status?: string | null;
  payment_method?: string | null;
}): boolean {
  const status = String(order.payment_status || '').toLowerCase();
  const method = String(order.payment_method || '').toLowerCase();
  return status === 'cash' || method === 'cash';
}

export function extractLockerDepositCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;

  const bags: Record<string, unknown>[] = [];
  const root = payload as Record<string, unknown>;
  bags.push(root);
  if (root.data && typeof root.data === 'object') bags.push(root.data as Record<string, unknown>);
  if (root.extra && typeof root.extra === 'object') bags.push(root.extra as Record<string, unknown>);
  const data = root.data as Record<string, unknown> | undefined;
  if (data?.extra && typeof data.extra === 'object') bags.push(data.extra as Record<string, unknown>);

  for (const bag of bags) {
    for (const key of DEPOSIT_CODE_KEYS) {
      const value = bag[key];
      if (value == null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
  }

  // Last resort: only keys whose name clearly indicates a deposit/PIN code
  for (const bag of bags) {
    for (const [key, value] of Object.entries(bag)) {
      if (typeof value === 'object') continue;
      const k = key.toLowerCase();
      if (
        (k.includes('deposit') || k.includes('drop_off') || k.includes('dropoff') || k.includes('handover')) &&
        (k.includes('code') || k.includes('pin'))
      ) {
        const text = String(value ?? '').trim();
        if (text) return text;
      }
    }
  }

  return null;
}

export function formatRon(amount: number | null | undefined): string {
  const n = Number(amount ?? 0);
  return `${n.toFixed(2)} RON`;
}
