import { Platform } from 'react-native';
import type { TFunction } from 'i18next';
import type { Column, ReportDoc, Row } from './model';
import { formatters } from './model';

/**
 * Print-ready HTML for a report, turned into a PDF by the OS print engine
 * (react-native-html-to-pdf). The OS engine shapes Khmer correctly; Kantumruy Pro is used when
 * available (app font on iOS, android_asset on Android).
 */

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const isNum = (c: Column) => c.type === 'money' || c.type === 'number' || c.type === 'percent';

/** A4 in points. */
export function pageSize(doc: ReportDoc): { width: number; height: number; landscape: boolean } {
  const landscape = Math.max(0, ...doc.sections.map(s => s.columns.length)) > 6;
  return landscape ? { width: 842, height: 595, landscape } : { width: 595, height: 842, landscape };
}

export function buildPdfHtml(doc: ReportDoc, t: TFunction, opts: { logoUrl?: string } = {}): string {
  const fmt = formatters(t);
  const fontSrc = (file: string) => (Platform.OS === 'android' ? `url('file:///android_asset/fonts/${file}')` : `local('${file.replace('.ttf', '')}')`);
  const initials = doc.propertyName.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || 'P';

  // Zero amounts in data rows read as a quiet dash (totals keep their real value)
  const cell = (row: Row, c: Column, total = false) => {
    const raw = row[c.key];
    const zero = !total && isNum(c) && raw !== '' && raw != null && Number(raw) === 0;
    const v = zero ? '–' : fmt.format(raw, c.type);
    const neg = c.type === 'money' && Number(raw) < 0;
    return `<td class="${isNum(c) ? 'num' : ''}${zero ? ' zero' : ''}${neg ? ' neg' : ''}">${esc(v)}</td>`;
  };

  const sections = doc.sections.map(sec => `
    ${sec.title ? `<h2>${esc(sec.title)}</h2>` : ''}
    <table>
      <thead><tr>${sec.columns.map(c => `<th class="${isNum(c) ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>
        ${sec.rows.map(r => `<tr>${sec.columns.map(c => cell(r, c)).join('')}</tr>`).join('')}
        ${sec.totals ? `<tr class="total">${sec.columns.map(c => cell(sec.totals!, c, true)).join('')}</tr>` : ''}
      </tbody>
    </table>`).join('');

  const tones = { good: '#16A34A', bad: '#DC2626', neutral: '#17153B' };
  const summary = doc.summary.length ? `
    <div class="summary" style="grid-template-columns: repeat(${Math.min(4, doc.summary.length)}, 1fr)">
      ${doc.summary.map(s => `
        <div class="tile">
          <div class="l">${esc(s.label)}</div>
          <div class="v" style="color:${tones[s.tone ?? 'neutral']}">${esc(fmt.format(s.value, s.type))}</div>
        </div>`).join('')}
    </div>` : '';

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  @font-face { font-family: 'Kantumruy Pro'; font-weight: 400; src: ${fontSrc('KantumruyPro-Regular.ttf')}; }
  @font-face { font-family: 'Kantumruy Pro'; font-weight: 500; src: ${fontSrc('KantumruyPro-Medium.ttf')}; }
  @font-face { font-family: 'Kantumruy Pro'; font-weight: 600; src: ${fontSrc('KantumruyPro-SemiBold.ttf')}; }
  @font-face { font-family: 'Kantumruy Pro'; font-weight: 700; src: ${fontSrc('KantumruyPro-Bold.ttf')}; }
  @page { margin: 26px; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: 'Kantumruy Pro', -apple-system, 'Helvetica Neue', Roboto, Arial, sans-serif; color: #17153B; font-size: 10.5px; line-height: 1.5; }

  .header { display: flex; align-items: center; justify-content: space-between; gap: 16px;
            padding-bottom: 14px; margin-bottom: 18px; border-bottom: 3px solid #554ADF; }
  .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .logo { width: 46px; height: 46px; border-radius: 12px; object-fit: cover; border: 1px solid #E2E8F0; flex-shrink: 0; }
  .logo-fallback { width: 46px; height: 46px; border-radius: 12px; background: #F1F0FD; color: #554ADF; font-weight: 700;
                   font-size: 17px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .prop { font-size: 14px; font-weight: 700; }
  .app { font-size: 9px; color: #94A3B8; letter-spacing: .4px; }
  .title { text-align: right; }
  h1 { font-size: 21px; margin: 0; font-weight: 700; letter-spacing: -0.2px; }
  .period { color: #475569; font-size: 11px; margin-top: 2px; }
  .desc { color: #64748B; font-size: 10px; margin: -6px 0 14px; }

  .summary { display: grid; gap: 10px; margin-bottom: 18px; }
  .tile { border: 1px solid #E2E8F0; border-radius: 10px; padding: 10px 12px; background: #F8FAFC; }
  .tile .l { font-size: 9px; color: #64748B; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; }
  .tile .v { font-size: 16px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }

  h2 { font-size: 12.5px; font-weight: 700; margin: 20px 0 8px; color: #17153B; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #E2E8F0; }
  thead { display: table-header-group; }   /* repeat the header on every page */
  tr { page-break-inside: avoid; break-inside: avoid; }
  th { background: #554ADF; color: #fff; font-weight: 600; font-size: 10px; letter-spacing: .1px;
       padding: 8px 9px; text-align: left; white-space: nowrap; }
  td { padding: 7px 9px; border-top: 1px solid #EEF2F6; vertical-align: middle; }
  tbody tr:nth-child(even) td { background: #F8FAFC; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .neg { color: #DC2626; }
  .zero { color: #CBD5E1; }
  tr.total td { background: #F1F0FD !important; font-weight: 700; border-top: 2px solid #554ADF; }

  .footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #E2E8F0; color: #94A3B8; font-size: 9px;
            display: flex; justify-content: space-between; }
</style></head>
<body>
  <div class="header">
    <div class="brand">
      ${opts.logoUrl ? `<img class="logo" src="${esc(opts.logoUrl)}" />` : `<div class="logo-fallback">${esc(initials)}</div>`}
      <div>
        <div class="prop">${esc(doc.propertyName)}</div>
        <div class="app">PTEAH MANAGER</div>
      </div>
    </div>
    <div class="title">
      <h1>${esc(doc.title)}</h1>
      <div class="period">${esc(doc.periodLabel)}</div>
    </div>
  </div>
  ${doc.description ? `<div class="desc">${esc(doc.description)}</div>` : ''}
  ${summary}
  ${sections}
  <div class="footer">
    <span>${esc(t('reportExport.generated'))}: ${esc(doc.generatedAt)}</span>
    <span>Pteah Manager · ${esc(doc.propertyName)}</span>
  </div>
</body></html>`;
}
