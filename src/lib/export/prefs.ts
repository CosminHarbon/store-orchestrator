import type {
  ExportColumnDef,
  ExportMeta,
  ExportPreferences,
  ExportDatasetId,
  ExportPresetId,
  ReportStyleId,
} from './types';
import { EXPORT_DATASETS } from './datasets';

const STORAGE_KEY = 'sv-export-prefs-v1';

type PrefsMap = Partial<Record<ExportDatasetId, ExportPreferences>>;

function readAll(): PrefsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PrefsMap;
  } catch {
    return {};
  }
}

function writeAll(map: PrefsMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function defaultPrefs(datasetId: ExportDatasetId): ExportPreferences {
  const def = EXPORT_DATASETS[datasetId];
  const preset = def.presets.find((p) => p.id === def.defaultPreset) || def.presets[0];
  return {
    presetId: preset.id,
    columnIds: [...preset.columnIds],
    reportStyle: def.defaultStyle,
    includeSummary: true,
    includeGeneratedAt: true,
  };
}

export function loadExportPrefs(datasetId: ExportDatasetId): ExportPreferences {
  const saved = readAll()[datasetId];
  if (!saved) return defaultPrefs(datasetId);
  const def = EXPORT_DATASETS[datasetId];
  const validIds = new Set(def.columns.map((c) => c.id));
  const columnIds = (saved.columnIds || []).filter((id) => validIds.has(id));
  return {
    ...defaultPrefs(datasetId),
    ...saved,
    columnIds: columnIds.length ? columnIds : defaultPrefs(datasetId).columnIds,
    presetId: (['essential', 'detailed', 'accounting'] as ExportPresetId[]).includes(
      saved.presetId
    )
      ? saved.presetId
      : def.defaultPreset,
    reportStyle: (['classic', 'executive', 'ledger'] as ReportStyleId[]).includes(
      saved.reportStyle
    )
      ? saved.reportStyle
      : def.defaultStyle,
  };
}

export function saveExportPrefs(datasetId: ExportDatasetId, prefs: ExportPreferences) {
  const all = readAll();
  all[datasetId] = prefs;
  writeAll(all);
}

export function applyPreset(
  datasetId: ExportDatasetId,
  presetId: ExportPresetId
): ExportPreferences {
  const def = EXPORT_DATASETS[datasetId];
  const preset = def.presets.find((p) => p.id === presetId) || def.presets[0];
  const current = loadExportPrefs(datasetId);
  return {
    ...current,
    presetId: preset.id,
    columnIds: [...preset.columnIds],
  };
}

export type { ExportColumnDef, ExportMeta };
