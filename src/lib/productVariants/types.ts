export type DraftOptionValue = {
  clientId: string;
  serverId: string | null;
  value: string;
  position: number;
  swatchHex: string | null;
  /** Staged product_images.id order for this option value. */
  imageIds: string[];
};

export type DraftOption = {
  clientId: string;
  serverId: string | null;
  name: string;
  position: number;
  values: DraftOptionValue[];
};

export type DraftVariant = {
  /** Sorted value client-ids in option-position order. */
  key: string;
  serverId: string | null;
  optionKey: string | null;
  label: string;
  valueClientIds: string[];
  sku: string;
  /** Empty string means inherit the product price. */
  priceOverride: string;
  stock: string;
  active: boolean;
  position: number;
};

export type VariantDraft = {
  enabled: boolean;
  options: DraftOption[];
  variants: DraftVariant[];
  /** Server ids the merchant confirmed should be hard-deleted. */
  permanentlyRemoveValueIds: string[];
  missingAction: 'deactivate' | 'delete';
};

export type CombinationPreview = {
  count: number;
  expression: string;
  namesExpression: string;
  blocked: boolean;
  warning: boolean;
};

export type SaveProductVariantsResult = {
  ok: boolean;
  error?: string;
  message?: string;
  expression?: string;
  count?: number;
  maximum?: number;
  has_variants?: boolean;
  parent_stock?: number;
  created_count?: number;
  deactivated_count?: number;
  deleted_count?: number;
};
