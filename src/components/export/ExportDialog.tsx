import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Download, Eye, FileSpreadsheet, LayoutTemplate, Printer, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { getDataset, resolveColumns } from '@/lib/export/datasets';
import { buildCsv, downloadCsv, exportFilename } from '@/lib/export/csv';
import { buildPremiumReportHtml, openPremiumReport } from '@/lib/export/reportHtml';
import {
  defaultPrefs,
  loadExportPrefs,
  saveExportPrefs,
} from '@/lib/export/prefs';
import type {
  ExportDatasetId,
  ExportPreferences,
  ExportPresetId,
  ExportRow,
  ExportSummaryItem,
  ReportStyleId,
} from '@/lib/export/types';
import '@/styles/export-dialog.css';

export type ExportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  datasetId: ExportDatasetId;
  rows: ExportRow[];
  storeName?: string;
  summary?: ExportSummaryItem[];
};

const STYLE_META: Record<
  ReportStyleId,
  { accent: string; preview: string }
> = {
  classic: {
    accent: 'from-[#6E3DFF]/20 to-transparent',
    preview: 'Clean table · brand header',
  },
  executive: {
    accent: 'from-[#4B21B6]/25 to-transparent',
    preview: 'Summary cards · spacious',
  },
  ledger: {
    accent: 'from-emerald-500/20 to-transparent',
    preview: 'Dense · accounting style',
  },
};

export function ExportDialog({
  open,
  onOpenChange,
  datasetId,
  rows,
  storeName,
  summary,
}: ExportDialogProps) {
  const { t, i18n } = useTranslation('export');
  const dataset = getDataset(datasetId);
  const [prefs, setPrefs] = useState<ExportPreferences>(() => defaultPrefs(datasetId));
  const [customizeOpen, setCustomizeOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPrefs(loadExportPrefs(datasetId));
    setCustomizeOpen(false);
  }, [open, datasetId]);

  const columns = useMemo(
    () => resolveColumns(dataset, prefs.columnIds),
    [dataset, prefs.columnIds]
  );

  const labels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const col of dataset.columns) {
      map[col.id] = t(`columns.${datasetId}.${col.id}`);
    }
    return map;
  }, [dataset.columns, datasetId, t]);

  const updatePrefs = (next: ExportPreferences) => {
    setPrefs(next);
    saveExportPrefs(datasetId, next);
  };

  const onPreset = (presetId: ExportPresetId) => {
    const preset = dataset.presets.find((p) => p.id === presetId) || dataset.presets[0];
    updatePrefs({
      ...prefs,
      presetId: preset.id,
      columnIds: [...preset.columnIds],
    });
  };

  const toggleColumn = (id: string, checked: boolean) => {
    const nextIds = checked
      ? [...prefs.columnIds, id]
      : prefs.columnIds.filter((c) => c !== id);
    // Keep dataset column order
    const ordered = dataset.columns.map((c) => c.id).filter((c) => nextIds.includes(c));
    updatePrefs({
      ...prefs,
      presetId: 'detailed',
      columnIds: ordered.length ? ordered : prefs.columnIds,
    });
  };

  const buildPayload = () => {
    const csv = buildCsv(columns, rows, labels);
    const filename = exportFilename(dataset.filenamePrefix);
    const locale = (i18n.resolvedLanguage || i18n.language || 'ro').split('-')[0];
    const generatedAt = new Date().toLocaleString(locale === 'en' ? 'en-GB' : 'ro-RO');
    const meta = {
      title: t(`datasets.${datasetId}.title`),
      subtitle: t(`datasets.${datasetId}.subtitle`),
      storeName,
      generatedAt,
      rowCount: rows.length,
      summary: prefs.includeSummary ? summary : undefined,
      includeGeneratedAt: prefs.includeGeneratedAt,
    };
    return { csv, filename, meta };
  };

  const openReport = () => {
    if (!columns.length) {
      toast.error(t('toast.needColumns'));
      return false;
    }
    const { csv, filename, meta } = buildPayload();
    const html = buildPremiumReportHtml({
      style: prefs.reportStyle,
      styleLabel: t(`styles.${prefs.reportStyle}.name`),
      meta,
      columns,
      labels,
      rows,
      csvFilename: filename,
      csvContent: csv,
      labelsUi: {
        downloadCsv: t('actions.downloadCsv'),
        print: t('actions.print'),
        generated: t('meta.generated'),
        rows: t('meta.rows'),
        poweredBy: t('meta.poweredBy'),
        store: t('meta.store'),
        template: t('meta.template'),
      },
    });
    const win = openPremiumReport(html);
    if (!win) {
      toast.error(t('toast.allowPopups'));
      return false;
    }
    return true;
  };

  const handleDownloadCsv = () => {
    if (!columns.length) {
      toast.error(t('toast.needColumns'));
      return;
    }
    const { csv, filename } = buildPayload();
    downloadCsv(csv, filename);
    toast.success(t('toast.exported', { count: rows.length }));
  };

  const handleExport = () => {
    const opened = openReport();
    if (!opened) return;
    // Also offer the CSV immediately so "Export" always feels complete
    const { csv, filename } = buildPayload();
    downloadCsv(csv, filename);
    toast.success(t('toast.exportedWithReport', { count: rows.length }));
    onOpenChange(false);
  };

  const handlePreview = () => {
    if (!openReport()) return;
    toast.success(t('toast.previewOpened'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sv-export-dialog max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <div className="sv-export-dialog__hero border-b px-6 py-5">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="flex items-center gap-2 text-xl tracking-tight">
              <FileSpreadsheet className="h-5 w-5 text-[#6E3DFF]" />
              {t('dialog.title', { name: t(`datasets.${datasetId}.title`) })}
            </DialogTitle>
            <DialogDescription>{t('dialog.description')}</DialogDescription>
          </DialogHeader>
          <p className="mt-3 text-sm text-muted-foreground">
            {t('dialog.rowCount', { count: rows.length })}
          </p>
        </div>

        <div className="max-h-[min(70vh,640px)] space-y-6 overflow-y-auto px-6 py-5">
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <LayoutTemplate className="h-4 w-4 text-[#6E3DFF]" />
              {t('presets.title')}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {dataset.presets.map((preset) => {
                const active = prefs.presetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onPreset(preset.id)}
                    className={cn(
                      'rounded-2xl border px-3 py-3 text-left transition',
                      active
                        ? 'border-[#6E3DFF] bg-[#6E3DFF]/8 shadow-[0_0_0_1px_rgba(110,61,255,0.25)]'
                        : 'hover:border-[#6E3DFF]/40'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">
                        {t(`presets.${preset.id}.name`)}
                      </span>
                      {active && <Check className="h-4 w-4 text-[#6E3DFF]" />}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(`presets.${preset.id}.description`)}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Eye className="h-4 w-4 text-[#6E3DFF]" />
              {t('styles.title')}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {(['classic', 'executive', 'ledger'] as ReportStyleId[]).map((style) => {
                const active = prefs.reportStyle === style;
                return (
                  <button
                    key={style}
                    type="button"
                    onClick={() => updatePrefs({ ...prefs, reportStyle: style })}
                    className={cn(
                      'overflow-hidden rounded-2xl border text-left transition',
                      active
                        ? 'border-[#6E3DFF] shadow-[0_0_0_1px_rgba(110,61,255,0.25)]'
                        : 'hover:border-[#6E3DFF]/40'
                    )}
                  >
                    <div
                      className={cn(
                        'h-14 bg-gradient-to-br',
                        STYLE_META[style].accent,
                        'bg-muted/40'
                      )}
                    />
                    <div className="space-y-1 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{t(`styles.${style}.name`)}</span>
                        {active && <Check className="h-4 w-4 text-[#6E3DFF]" />}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t(`styles.${style}.description`)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border bg-muted/20 p-4">
            <button
              type="button"
              className="flex w-full items-center justify-between text-sm font-medium"
              onClick={() => setCustomizeOpen((v) => !v)}
            >
              <span className="inline-flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-[#6E3DFF]" />
                {t('customize.title')}
              </span>
              <span className="text-xs text-muted-foreground">
                {customizeOpen ? t('customize.hide') : t('customize.show')}
              </span>
            </button>

            {customizeOpen && (
              <div className="space-y-4 pt-1">
                <div className="grid gap-2 sm:grid-cols-2">
                  {dataset.columns.map((col) => {
                    const checked = prefs.columnIds.includes(col.id);
                    return (
                      <label
                        key={col.id}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggleColumn(col.id, v === true)}
                        />
                        {labels[col.id]}
                      </label>
                    );
                  })}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={prefs.includeSummary}
                      onCheckedChange={(v) =>
                        updatePrefs({ ...prefs, includeSummary: v })
                      }
                      id="export-summary"
                    />
                    <Label htmlFor="export-summary">{t('customize.includeSummary')}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={prefs.includeGeneratedAt}
                      onCheckedChange={(v) =>
                        updatePrefs({ ...prefs, includeGeneratedAt: v })
                      }
                      id="export-generated"
                    />
                    <Label htmlFor="export-generated">{t('customize.includeGeneratedAt')}</Label>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="gap-2 border-t bg-muted/15 px-6 py-4 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={handleDownloadCsv}>
              <Download className="mr-2 h-4 w-4" />
              {t('actions.csvOnly')}
            </Button>
            <Button type="button" variant="outline" onClick={handlePreview}>
              <Printer className="mr-2 h-4 w-4" />
              {t('actions.preview')}
            </Button>
            <Button
              type="button"
              className="bg-[#6E3DFF] hover:bg-[#4B21B6]"
              onClick={handleExport}
            >
              <Eye className="mr-2 h-4 w-4" />
              {t('actions.exportPremium')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
