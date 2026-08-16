import { cellToString } from './datasets';
import type {
  ExportColumnDef,
  ExportMeta,
  ExportRow,
  ReportStyleId,
} from './types';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline brand mark (transparent) — works offline in report windows. */
const BRAND_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1200" aria-hidden="true"><defs>
<linearGradient id="svG1" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#D84CFF"/><stop offset=".45" stop-color="#963CFF"/><stop offset="1" stop-color="#4B21B6"/></linearGradient>
<linearGradient id="svG2" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#C84CFF"/><stop offset=".5" stop-color="#8338FF"/><stop offset="1" stop-color="#4B21B6"/></linearGradient></defs>
<g transform="translate(511 310)"><path d="M110 95 H220 C242 95 260 107 275 132 L392 330 C403 349 399 370 384 383 C369 396 348 399 329 389 C316 382 306 372 299 360 Z" fill="url(#svG1)"/>
<path d="M354 233 L420 132 C435 109 454 95 478 95 H578 L414 340 Z" fill="url(#svG2)"/></g></svg>`;

function styleCss(style: ReportStyleId): string {
  if (style === 'executive') {
    return `
      body {
        background:
          radial-gradient(ellipse 80% 50% at 10% -10%, rgba(138,43,255,0.35), transparent 55%),
          radial-gradient(ellipse 60% 40% at 90% 0%, rgba(110,61,255,0.22), transparent 50%),
          linear-gradient(165deg, #0D0717 0%, #1A0F2E 55%, #0D0717 100%);
        padding: 36px 18px 56px;
      }
      .report { border-radius: 28px; }
      .hero {
        padding: 36px 36px 28px;
        background:
          linear-gradient(135deg, rgba(110,61,255,0.14), transparent 50%),
          linear-gradient(180deg, #FFFFFF 0%, #FBF9FF 100%);
      }
      .hero h1 { font-size: 32px; letter-spacing: -0.04em; }
      .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 14px;
        padding: 22px 28px 8px;
        background: transparent;
        border: 0;
        margin-top: -8px;
      }
      .summary-card {
        border-radius: 18px;
        padding: 16px 18px;
        border: 1px solid rgba(110,61,255,0.12);
        background: linear-gradient(180deg, #FFFFFF, #F8F5FF);
        box-shadow: 0 10px 30px -18px rgba(75,33,182,0.45);
      }
      .summary-card .value { font-size: 22px; color: #4B21B6; }
      .table-wrap { padding: 12px 24px 28px; }
      th, td { padding: 14px 16px; font-size: 13px; }
      tbody tr:nth-child(even) { background: #F9F7FD; }
      tbody tr:hover { background: rgba(110,61,255,0.06); }
    `;
  }

  if (style === 'ledger') {
    return `
      body {
        background: #EDEAF3;
        padding: 24px 12px 40px;
      }
      .style-chip {
        background: #FFFFFF;
        border: 1px solid #D5CFE3;
        color: #1A0F2E;
      }
      .toolbar .btn-ghost {
        background: #1A0F2E;
        color: #fff;
        border: 0;
      }
      .toolbar .btn-primary { box-shadow: 0 8px 20px -10px rgba(110,61,255,0.7); }
      .report {
        border-radius: 4px;
        box-shadow: 0 1px 0 rgba(26,15,46,0.06), 0 18px 40px -28px rgba(26,15,46,0.35);
        border: 1px solid #D5CFE3;
      }
      .hero {
        padding: 20px 22px 16px;
        background: #FFFFFF;
        border-bottom: 2px solid #1A0F2E;
      }
      .hero h1 {
        font-size: 18px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        font-weight: 800;
      }
      .brand-lockup .wordmark { display: none; }
      .summary {
        display: flex;
        flex-wrap: wrap;
        gap: 0;
        padding: 0;
        background: #F3F0F8;
        border-bottom: 1px solid #D5CFE3;
      }
      .summary-card {
        flex: 1 1 140px;
        border: 0;
        border-right: 1px solid #D5CFE3;
        border-radius: 0;
        background: transparent;
        padding: 12px 16px;
        box-shadow: none;
      }
      .summary-card:last-child { border-right: 0; }
      .summary-card .label { letter-spacing: 0.12em; }
      .summary-card .value { font-size: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .table-wrap { padding: 0; }
      table { font-size: 11.5px; }
      th {
        background: #1A0F2E;
        color: #F7F5FB;
        border: 0;
        padding: 10px 12px;
        letter-spacing: 0.1em;
      }
      td {
        padding: 8px 12px;
        border-bottom: 1px solid #E4DFEE;
        font-variant-numeric: tabular-nums;
      }
      tbody tr:nth-child(even) { background: #F7F5FB; }
      .footer {
        background: #F3F0F8;
        border-top: 1px solid #D5CFE3;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
    `;
  }

  /* classic */
  return `
    body {
      background:
        radial-gradient(ellipse at top left, rgba(110,61,255,0.18), transparent 42%),
        linear-gradient(180deg, #0D0717 0%, #1A0F2E 100%);
      padding: 28px 16px 48px;
    }
    .report { border-radius: 24px; }
    .hero {
      padding: 28px 28px 22px;
      background:
        linear-gradient(135deg, rgba(110,61,255,0.1), transparent 55%),
        #FFFFFF;
    }
    .hero h1 { font-size: 24px; letter-spacing: -0.03em; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px;
      padding: 18px 28px;
      background: #F7F5FB;
      border-bottom: 1px solid #E8E4F0;
    }
    .summary-card {
      background: #FFFFFF;
      border: 1px solid #E8E4F0;
      border-radius: 16px;
      padding: 12px 14px;
    }
    .summary-card .value { font-size: 18px; }
    .table-wrap { padding: 8px 16px 20px; }
    th, td { padding: 11px 12px; font-size: 12.5px; }
    th { border-bottom: 1px solid #E8E4F0; color: #6B6478; }
    td { border-bottom: 1px solid #E8E4F0; }
    tbody tr:hover { background: #FAF8FF; }
  `;
}

function baseCss(style: ReportStyleId) {
  return `
    :root {
      --ink: #1A0F2E;
      --muted: #6B6478;
      --line: #E8E4F0;
      --brand: #6E3DFF;
      --brand-deep: #4B21B6;
      --paper: #FFFFFF;
      --mist: #F7F5FB;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Satoshi", "Segoe UI", Inter, system-ui, -apple-system, sans-serif;
      color: var(--ink);
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    .shell { max-width: 1120px; margin: 0 auto; }
    .toolbar {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .toolbar-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .style-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      color: rgba(255,255,255,0.85);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.04em;
    }
    .btn {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 11px 18px;
      font-weight: 650;
      font-size: 13px;
      cursor: pointer;
      transition: transform .15s ease, background .15s ease;
    }
    .btn:active { transform: scale(0.98); }
    .btn-primary { background: var(--brand); color: white; }
    .btn-primary:hover { background: var(--brand-deep); }
    .btn-ghost {
      background: rgba(255,255,255,0.08);
      color: white;
      border: 1px solid rgba(255,255,255,0.12);
    }
    .report {
      background: var(--paper);
      overflow: hidden;
      box-shadow: 0 40px 90px -48px rgba(0,0,0,0.75);
    }
    .brand-lockup {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 18px;
    }
    .brand-lockup .mark {
      width: 44px;
      height: 33px;
      flex-shrink: 0;
    }
    .brand-lockup .mark svg { width: 100%; height: 100%; display: block; }
    .brand-lockup .wordmark {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .brand-lockup .name {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ink);
    }
    .brand-lockup .tag {
      font-size: 10px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #8A2BFF;
      font-weight: 600;
    }
    .hero h1 {
      margin: 0;
      font-weight: 750;
      color: var(--ink);
    }
    .subtitle {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 13px;
      max-width: 52ch;
      line-height: 1.45;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 18px;
    }
    .meta-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(110,61,255,0.08);
      color: var(--ink);
      font-size: 12px;
      font-weight: 550;
    }
    .meta-pill span { color: var(--muted); font-weight: 500; }
    .summary-card .label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 6px;
      font-weight: 600;
    }
    .summary-card .value {
      font-weight: 750;
      letter-spacing: -0.02em;
      color: var(--ink);
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
      white-space: nowrap;
    }
    td { vertical-align: top; color: #2A2040; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .footer {
      padding: 14px 28px 18px;
      color: var(--muted);
      font-size: 11px;
      border-top: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }
    .footer-brand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      color: var(--ink);
    }
    .footer-brand .mark { width: 22px; height: 16px; }
    .footer-brand .mark svg { width: 100%; height: 100%; display: block; }
    @media print {
      body { background: white !important; padding: 0 !important; }
      .toolbar { display: none !important; }
      .report { box-shadow: none !important; border-radius: 0 !important; }
    }
    ${styleCss(style)}
  `;
}

export function buildPremiumReportHtml(opts: {
  style: ReportStyleId;
  styleLabel: string;
  meta: ExportMeta;
  columns: ExportColumnDef[];
  labels: Record<string, string>;
  rows: ExportRow[];
  csvFilename: string;
  csvContent: string;
  labelsUi: {
    downloadCsv: string;
    print: string;
    generated: string;
    rows: string;
    poweredBy: string;
    store: string;
    template: string;
  };
}): string {
  const { style, styleLabel, meta, columns, labels, rows, labelsUi } = opts;

  const summaryHtml =
    meta.summary && meta.summary.length
      ? `<div class="summary">${meta.summary
          .map(
            (s) => `<div class="summary-card"><div class="label">${escapeHtml(
              s.label
            )}</div><div class="value">${escapeHtml(s.value)}</div></div>`
          )
          .join('')}</div>`
      : '';

  const head = columns
    .map(
      (c) =>
        `<th class="${c.align === 'right' ? 'num' : ''}">${escapeHtml(
          labels[c.id] || c.id
        )}</th>`
    )
    .join('');

  const body = rows
    .map((row) => {
      const cells = columns
        .map((c) => {
          const text = escapeHtml(cellToString(row[c.id]));
          return `<td class="${c.align === 'right' ? 'num' : ''}">${text || '—'}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const safeCsv = opts.csvContent
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');

  const brandLockup = `
    <div class="brand-lockup">
      <div class="mark">${BRAND_MARK_SVG}</div>
      <div class="wordmark">
        <div class="name">Speed Vendors</div>
        <div class="tag">Build · Sell · Grow</div>
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(meta.title)} · SpeedVendors</title>
  <style>${baseCss(style)}</style>
</head>
<body>
  <div class="shell">
    <div class="toolbar">
      <div class="style-chip">${escapeHtml(labelsUi.template)}: ${escapeHtml(styleLabel)}</div>
      <div class="toolbar-actions">
        <button class="btn btn-primary" type="button" onclick="downloadCsv()">${escapeHtml(
          labelsUi.downloadCsv
        )}</button>
        <button class="btn btn-ghost" type="button" onclick="window.print()">${escapeHtml(
          labelsUi.print
        )}</button>
      </div>
    </div>
    <article class="report">
      <header class="hero">
        ${brandLockup}
        <h1>${escapeHtml(meta.title)}</h1>
        ${
          meta.subtitle
            ? `<p class="subtitle">${escapeHtml(meta.subtitle)}</p>`
            : ''
        }
        <div class="meta">
          ${
            meta.storeName
              ? `<div class="meta-pill"><span>${escapeHtml(
                  labelsUi.store
                )}</span>${escapeHtml(meta.storeName)}</div>`
              : ''
          }
          ${
            meta.includeGeneratedAt !== false
              ? `<div class="meta-pill"><span>${escapeHtml(
                  labelsUi.generated
                )}</span>${escapeHtml(meta.generatedAt)}</div>`
              : ''
          }
          <div class="meta-pill"><span>${escapeHtml(labelsUi.rows)}</span>${
            meta.rowCount
          }</div>
        </div>
      </header>
      ${summaryHtml}
      <div class="table-wrap">
        <table>
          <thead><tr>${head}</tr></thead>
          <tbody>${
            body ||
            `<tr><td colspan="${Math.max(columns.length, 1)}">—</td></tr>`
          }</tbody>
        </table>
      </div>
      <footer class="footer">
        <div class="footer-brand">
          <div class="mark">${BRAND_MARK_SVG}</div>
          <span>${escapeHtml(labelsUi.poweredBy)}</span>
        </div>
        <span>${escapeHtml(opts.csvFilename)}</span>
      </footer>
    </article>
  </div>
  <script>
    function downloadCsv() {
      const csvData = \`${safeCsv}\`;
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = ${JSON.stringify(opts.csvFilename)};
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>`;
}

/** Open the premium report in a new tab via blob URL (more reliable than document.write). */
export function openPremiumReport(html: string): Window | null {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    URL.revokeObjectURL(url);
    return null;
  }
  // Keep blob alive briefly while the tab loads
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return win;
}
