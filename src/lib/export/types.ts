export type ExportDatasetId =
  | 'products'
  | 'stock'
  | 'reviews'
  | 'orders'
  | 'customers'
  | 'payments';

export type ExportPresetId = 'essential' | 'detailed' | 'accounting';

export type ReportStyleId = 'classic' | 'executive' | 'ledger';

export type ExportCell = string | number | null | undefined;

export type ExportRow = Record<string, ExportCell>;

export type ExportColumnDef = {
  id: string;
  /** i18n key under export.columns.<dataset>.<id> */
  labelKey: string;
  align?: 'left' | 'right';
};

export type ExportPresetDef = {
  id: ExportPresetId;
  columnIds: string[];
};

export type ExportDatasetDef = {
  id: ExportDatasetId;
  columns: ExportColumnDef[];
  presets: ExportPresetDef[];
  defaultPreset: ExportPresetId;
  defaultStyle: ReportStyleId;
  filenamePrefix: string;
};

export type ExportPreferences = {
  presetId: ExportPresetId;
  columnIds: string[];
  reportStyle: ReportStyleId;
  includeSummary: boolean;
  includeGeneratedAt: boolean;
};

export type ExportSummaryItem = {
  label: string;
  value: string;
};

export type ExportMeta = {
  title: string;
  subtitle?: string;
  storeName?: string;
  generatedAt: string;
  rowCount: number;
  summary?: ExportSummaryItem[];
  includeGeneratedAt?: boolean;
};
