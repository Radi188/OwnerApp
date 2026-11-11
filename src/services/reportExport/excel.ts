import XLSX from 'xlsx-js-style';
import type { Column, ReportDoc, Row, Section } from './model';
import { formatters } from './model';
import type { TFunction } from 'i18next';

/**
 * Styled .xlsx built on the device (xlsx-js-style):
 *   title block → summary → per section: title, indigo header row, bordered zebra rows, totals row.
 * Money stays numeric with a $ format so the file still adds up in Excel.
 */

const INDIGO = '554ADF';
const INK = '17153B';
const GREY = '475569';
const MUTED = '94A3B8';
const BORDER = 'E2E8F0';
const ZEBRA = 'F8FAFC';
const TINT = 'F1F0FD';
const GOOD = '16A34A';
const BAD = 'DC2626';

const FONT = 'Calibri';
const thin = { style: 'thin', color: { rgb: BORDER } };
const box = { top: thin, bottom: thin, left: thin, right: thin };

const MONEY_FMT = '"$"#,##0.00;[Red]-"$"#,##0.00';
const NUMBER_FMT = '#,##0';
const PERCENT_FMT = '0.0%';

type Cell = { v: any; t: 's' | 'n'; s?: any; z?: string };

const text = (v: unknown, s?: any): Cell => ({ v: v == null ? '' : String(v), t: 's', s });

function valueCell(row: Row, col: Column, fmt: ReturnType<typeof formatters>, style: any): Cell {
  const v = row[col.key];
  const align = { vertical: 'center', horizontal: 'right' };
  if (v == null || v === '') return text('', { ...style, alignment: { vertical: 'center' } });
  switch (col.type) {
    case 'money': return { v: Number(v) || 0, t: 'n', z: MONEY_FMT, s: { ...style, numFmt: MONEY_FMT, alignment: align } };
    case 'number': return { v: Number(v) || 0, t: 'n', z: NUMBER_FMT, s: { ...style, numFmt: NUMBER_FMT, alignment: align } };
    case 'percent': return { v: (Number(v) || 0) / 100, t: 'n', z: PERCENT_FMT, s: { ...style, numFmt: PERCENT_FMT, alignment: align } };
    case 'date': case 'month': return text(fmt.format(v, col.type), { ...style, alignment: { vertical: 'center', horizontal: 'center' } });
    default: return text(v, { ...style, alignment: { vertical: 'center', wrapText: false } });
  }
}

export function buildWorkbook(doc: ReportDoc, t: TFunction): string {
  const fmt = formatters(t);
  const width = Math.max(2, ...doc.sections.map(s => s.columns.length));
  const cells: Cell[][] = [];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  const heights: { hpt: number }[] = [];
  const pad = (row: Cell[]) => { while (row.length < width) row.push(text('')); return row; };
  const line = (row: Cell[], hpt = 18, mergeAll = false) => {
    const r = cells.length;
    cells.push(pad(row));
    heights[r] = { hpt };
    if (mergeAll) merges.push({ s: { r, c: 0 }, e: { r, c: width - 1 } });
    return r;
  };

  // ── Title block ──
  line([text(doc.title, { font: { name: FONT, sz: 18, bold: true, color: { rgb: INK } }, alignment: { vertical: 'center' } })], 30, true);
  line([text(`${doc.propertyName}  ·  ${doc.periodLabel}`, { font: { name: FONT, sz: 11, color: { rgb: GREY } } })], 18, true);
  line([text(`${t('reportExport.generated')}: ${doc.generatedAt}  ·  Pteah Manager`, { font: { name: FONT, sz: 9, italic: true, color: { rgb: MUTED } } })], 16, true);
  line([], 10);

  // ── Summary (label → value) ──
  if (doc.summary.length) {
    line([text(String(t('reportExport.summary')).toUpperCase(), { font: { name: FONT, sz: 10, bold: true, color: { rgb: INDIGO } } })], 18, true);
    doc.summary.forEach(s => {
      const color = s.tone === 'good' ? GOOD : s.tone === 'bad' ? BAD : INK;
      const labelStyle = { font: { name: FONT, sz: 11, color: { rgb: GREY } }, fill: { fgColor: { rgb: ZEBRA } }, border: box, alignment: { vertical: 'center', indent: 1 } };
      const valStyle = { font: { name: FONT, sz: 12, bold: true, color: { rgb: color } }, fill: { fgColor: { rgb: ZEBRA } }, border: box };
      const r = cells.length;
      const value = valueCell({ v: s.value as any }, { key: 'v', label: '', type: s.type }, fmt, valStyle);
      line([text(s.label, labelStyle), text('', labelStyle), value], 22);
      merges.push({ s: { r, c: 0 }, e: { r, c: 1 } });
    });
    line([], 12);
  }

  // ── Sections ──
  doc.sections.forEach((sec: Section, si) => {
    if (sec.title) {
      line([text(sec.title, { font: { name: FONT, sz: 13, bold: true, color: { rgb: INK } }, alignment: { vertical: 'bottom' } })], 24, true);
    }
    // Header row
    line(sec.columns.map(c => text(c.label, {
      font: { name: FONT, sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: INDIGO } },
      alignment: { vertical: 'center', horizontal: c.type && c.type !== 'text' ? 'center' : 'left', wrapText: true, indent: c.type && c.type !== 'text' ? 0 : 1 },
      border: { top: { style: 'thin', color: { rgb: INDIGO } }, bottom: { style: 'thin', color: { rgb: INDIGO } }, left: { style: 'thin', color: { rgb: '6F66E6' } }, right: { style: 'thin', color: { rgb: '6F66E6' } } },
    })), 26);
    // Data rows (zebra)
    sec.rows.forEach((row, i) => {
      const base = { font: { name: FONT, sz: 11, color: { rgb: INK } }, border: box, ...(i % 2 ? { fill: { fgColor: { rgb: ZEBRA } } } : {}) };
      line(sec.columns.map((c, ci) => {
        const cell = valueCell(row, c, fmt, base);
        if (ci === 0 && (!c.type || c.type === 'text')) cell.s = { ...cell.s, alignment: { ...cell.s.alignment, indent: 1 } };
        return cell;
      }), 20);
    });
    // Totals row
    if (sec.totals) {
      const tot = {
        font: { name: FONT, sz: 11, bold: true, color: { rgb: INK } },
        fill: { fgColor: { rgb: TINT } },
        border: { ...box, top: { style: 'medium', color: { rgb: INDIGO } } },
      };
      line(sec.columns.map((c, ci) => {
        const cell = valueCell(sec.totals!, c, fmt, tot);
        if (ci === 0) cell.s = { ...cell.s, alignment: { vertical: 'center', indent: 1 } };
        return cell;
      }), 22);
    }
    if (si < doc.sections.length - 1) line([], 14);
  });

  // ── Sheet ──
  const ws: any = {};
  cells.forEach((row, r) => row.forEach((cell, c) => { ws[XLSX.utils.encode_cell({ r, c })] = cell; }));
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: cells.length - 1, c: width - 1 } });
  ws['!merges'] = merges;
  ws['!rows'] = heights;

  // Column widths: the larger of the declared width and the longest value / header in that column
  const widths = Array.from({ length: width }, (_, ci) => {
    let w = 10;
    doc.sections.forEach(sec => {
      const col = sec.columns[ci];
      if (!col) return;
      w = Math.max(w, col.width ?? 0, Math.min(40, col.label.length + 4));
      [...sec.rows, ...(sec.totals ? [sec.totals] : [])].forEach(r => {
        w = Math.max(w, Math.min(44, fmt.format(r[col.key], col.type).length + 3));
      });
    });
    if (ci <= 1 && doc.summary.length) w = Math.max(w, 14);
    return { wch: w };
  });
  ws['!cols'] = widths;
  ws['!margins'] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };

  const wb = XLSX.utils.book_new();
  const sheetName = doc.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Report';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  wb.Props = { Title: doc.title, Author: 'Pteah Manager', Company: doc.propertyName, CreatedDate: new Date() };
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx', compression: true });
}
