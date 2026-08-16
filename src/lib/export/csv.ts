import type { ExportCell, ExportColumnDef, ExportRow } from './types';
import { cellToString } from './datasets';

function escapeCsv(value: ExportCell): string {
  const raw = cellToString(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

/** UTF-8 BOM helps Excel open Romanian diacritics correctly. */
export function buildCsv(columns: ExportColumnDef[], rows: ExportRow[], labels: Record<string, string>): string {
  const header = columns.map((c) => escapeCsv(labels[c.id] || c.id)).join(',');
  const body = rows
    .map((row) => columns.map((c) => escapeCsv(row[c.id])).join(','))
    .join('\n');
  return `\uFEFF${header}\n${body}`;
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportFilename(prefix: string, date = new Date()) {
  return `${prefix}-export-${date.toISOString().slice(0, 10)}.csv`;
}
