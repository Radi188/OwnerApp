import { generatePDF } from 'react-native-html-to-pdf';
import ReactNativeBlobUtil from 'react-native-blob-util';
import i18n from '../../i18n';
import { MIME, openFile, writeCacheFile } from '../files';
import { buildReportDoc, type ExportLang, type ExportMeta } from './model';
import { buildWorkbook } from './excel';
import { buildPdfHtml, pageSize } from './pdf';

export type { ExportLang, ExportMeta } from './model';

const slug = (s: string) =>
  s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'report';

/**
 * Build a report as a styled Excel workbook or PDF on the device and open it
 * (the system viewer offers Share / Save to Files / Print).
 */
export async function exportReport(opts: {
  kind: string;
  data: any;
  format: 'xlsx' | 'pdf';
  lang: ExportLang;
  meta: ExportMeta;
  /** Full URL of the property logo for the PDF header. */
  logoUrl?: string;
  /** Short period for the file name, e.g. "2026-11" or "2026-06_2026-11". */
  fileTag: string;
}): Promise<void> {
  const t = i18n.getFixedT(opts.lang === 'kh' ? 'km' : 'en');
  const doc = buildReportDoc(opts.kind, opts.data, t, opts.meta);
  const base = `${slug(String(i18n.getFixedT('en')(`reports.tabs.${opts.meta.tabKey}`)))}-${opts.fileTag}${opts.lang === 'kh' ? '-kh' : ''}`;

  if (opts.format === 'xlsx') {
    const path = await writeCacheFile(`${base}.xlsx`, buildWorkbook(doc, t));
    await openFile(path, MIME.xlsx);
    return;
  }

  const { width, height } = pageSize(doc);
  const res = await generatePDF({
    html: buildPdfHtml(doc, t, { logoUrl: opts.logoUrl }),
    fileName: base,
    width,
    height,
    padding: 24,
    bgColor: '#FFFFFF',
    shouldPrintBackgrounds: true,
  });
  let path = res.filePath.replace(/^file:\/\//, '');
  // Give the file a friendly name (the share sheet shows it)
  const target = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${base}.pdf`;
  if (path !== target) {
    try {
      if (await ReactNativeBlobUtil.fs.exists(target)) await ReactNativeBlobUtil.fs.unlink(target);
      await ReactNativeBlobUtil.fs.mv(path, target);
      path = target;
    } catch { /* keep the generated path */ }
  }
  await openFile(path, MIME.pdf);
}
