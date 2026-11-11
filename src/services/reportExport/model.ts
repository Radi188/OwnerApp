import type { TFunction } from 'i18next';

/**
 * One document model for every report, rendered by both the Excel and the PDF exporter so the two
 * files always match each other (and what the Reports screen shows).
 */

export type ColType = 'text' | 'money' | 'number' | 'percent' | 'date' | 'month';
export type Column = { key: string; label: string; type?: ColType; width?: number };
export type Row = Record<string, string | number | null | undefined>;
export type Section = { title?: string; columns: Column[]; rows: Row[]; totals?: Row };
export type SummaryItem = { label: string; value: string | number; type?: ColType; tone?: 'good' | 'bad' | 'neutral' };

export type ReportDoc = {
  title: string;
  description?: string;
  propertyName: string;
  periodLabel: string;
  generatedAt: string;
  summary: SummaryItem[];
  sections: Section[];
};

export type ExportLang = 'en' | 'kh';

/** The period the report covers — formatted in the export's language. */
export type ExportPeriod =
  | { type: 'month'; ym: string }
  | { type: 'months'; from: string; to: string }
  | { type: 'days'; from: string; to: string }
  | { type: 'asOf'; date: string };

export type ExportMeta = {
  /** i18n key under reports.tabs / reports.desc */
  tabKey: string;
  propertyName: string;
  period: ExportPeriod;
};

const n = (v: unknown): number => {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(x) ? x : 0;
};
const cap = (s?: string | null) => (s ? String(s).replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '');
const sum = (rows: Row[], key: string) => rows.reduce((s, r) => s + n(r[key]), 0);

// ─── Formatting (in the export's language, independent of the app language) ──

export function formatters(t: TFunction) {
  const months = String(t('common.monthsShort')).split(',');
  const month = (ym?: string | null) => {
    const m = String(ym ?? '').match(/^(\d{4})-(\d{2})/);
    return m ? `${months[parseInt(m[2], 10) - 1] ?? m[2]} ${m[1]}` : String(ym ?? '');
  };
  const date = (d?: string | null) => {
    const m = String(d ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${months[parseInt(m[2], 10) - 1] ?? m[2]} ${parseInt(m[3], 10)}, ${m[1]}` : String(d ?? '');
  };
  const money = (v: unknown) =>
    `${n(v) < 0 ? '-' : ''}$${Math.abs(n(v)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const status = (s?: string | null) => (s ? String(t(`status.${String(s).toLowerCase().replace(/[\s-]+/g, '_')}`, { defaultValue: cap(s) })) : '');
  const format = (v: unknown, type: ColType = 'text') => {
    if (v == null || v === '') return '';
    switch (type) {
      case 'money': return money(v);
      case 'number': return n(v).toLocaleString('en-US');
      case 'percent': return `${n(v).toFixed(1)}%`;
      case 'date': return date(String(v));
      case 'month': return month(String(v));
      default: return String(v);
    }
  };
  return { month, date, money, status, format };
}

// ─── Report → document ───────────────────────────────────────────────────────

export function buildReportDoc(kind: string, data: any, t: TFunction, meta: ExportMeta): ReportDoc {
  const f = formatters(t);
  const L = (k: string, o?: any) => String(t(`reportExport.col.${k}`, o));
  const list = (): any[] => (Array.isArray(data) ? data : []);
  const doc: ReportDoc = {
    title: String(t(`reports.tabs.${meta.tabKey}`)),
    description: String(t(`reports.desc.${meta.tabKey}`, { defaultValue: '' })) || undefined,
    propertyName: meta.propertyName,
    periodLabel:
      meta.period.type === 'month' ? f.month(meta.period.ym)
        : meta.period.type === 'months' ? (meta.period.from === meta.period.to ? f.month(meta.period.to) : `${f.month(meta.period.from)} – ${f.month(meta.period.to)}`)
          : meta.period.type === 'days' ? `${f.date(meta.period.from)} – ${f.date(meta.period.to)}`
            : `${t('reportExport.asOf')} ${f.date(meta.period.date)}`,
    generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    summary: [],
    sections: [],
  };

  switch (kind) {
    case 'payment-status': {
      const s = data?.summary ?? {};
      doc.summary = [
        { label: L('invoiced'), value: s.invoiced, type: 'money' },
        { label: L('collected'), value: s.collected, type: 'money', tone: 'good' },
        { label: L('remaining'), value: s.remaining, type: 'money', tone: n(s.remaining) > 0 ? 'bad' : 'neutral' },
        { label: L('collectionRate'), value: s.collectionRate, type: 'percent' },
      ];
      const rows: Row[] = (data?.rows ?? []).map((r: any) => ({
        unit: r.unitCode, tenant: r.tenant?.name ?? '—', invoice: r.invoiceNumber ?? '', due: r.dueDate,
        invoiced: n(r.invoiced), paid: n(r.paid), remaining: n(r.remaining),
        status: r.isOverdue ? L('daysLate', { count: r.daysOverdue }) : f.status(r.paymentStatus),
      }));
      doc.sections.push({
        columns: [
          { key: 'unit', label: L('unit'), width: 8 }, { key: 'tenant', label: L('tenant'), width: 22 },
          { key: 'invoice', label: L('invoice'), width: 24 }, { key: 'due', label: L('dueDate'), type: 'date', width: 13 },
          { key: 'invoiced', label: L('invoiced'), type: 'money' }, { key: 'paid', label: L('paid'), type: 'money' },
          { key: 'remaining', label: L('remaining'), type: 'money' }, { key: 'status', label: L('status'), width: 14 },
        ],
        rows,
        totals: { unit: L('total'), invoiced: sum(rows, 'invoiced'), paid: sum(rows, 'paid'), remaining: sum(rows, 'remaining') },
      });
      break;
    }

    case 'dashboard': {
      const tot = data?.totals ?? {};
      doc.summary = [
        { label: L('income'), value: tot.totalIncome, type: 'money', tone: 'good' },
        { label: L('expenses'), value: tot.expenses, type: 'money', tone: 'bad' },
        { label: L('net'), value: tot.netIncome, type: 'money', tone: n(tot.netIncome) < 0 ? 'bad' : 'good' },
        { label: L('avgOccupancy'), value: tot.averageOccupancyRate, type: 'percent' },
      ];
      const rows: Row[] = (data?.months ?? []).map((m: any) => ({
        month: m.month, income: n(m.totalIncome), expenses: n(m.expenses), net: n(m.netIncome),
        outstanding: n(m.outstanding), units: `${m.occupiedUnits ?? 0} / ${m.totalUnits ?? 0}`, occupancy: n(m.occupancyRate),
      }));
      doc.sections.push({
        columns: [
          { key: 'month', label: L('month'), type: 'month', width: 12 }, { key: 'income', label: L('income'), type: 'money' },
          { key: 'expenses', label: L('expenses'), type: 'money' }, { key: 'net', label: L('net'), type: 'money' },
          { key: 'outstanding', label: L('outstanding'), type: 'money' }, { key: 'units', label: L('occupiedUnits'), width: 12 },
          { key: 'occupancy', label: L('occupancy'), type: 'percent' },
        ],
        rows,
        totals: {
          month: L('total'), income: n(tot.totalIncome), expenses: n(tot.expenses), net: n(tot.netIncome),
          outstanding: n(tot.outstanding), occupancy: n(tot.averageOccupancyRate),
        },
      });
      break;
    }

    case 'room-tenants': {
      const m0 = data?.totals?.months?.[0] ?? {};
      doc.summary = [
        { label: L('invoiced'), value: m0.invoiced, type: 'money' },
        { label: L('collected'), value: m0.paid, type: 'money', tone: 'good' },
        { label: L('outstanding'), value: m0.outstanding, type: 'money', tone: n(m0.outstanding) > 0 ? 'bad' : 'neutral' },
        { label: L('monthlyRent'), value: data?.totals?.monthlyRent, type: 'money' },
      ];
      const rows: Row[] = (data?.rows ?? []).map((r: any) => {
        const m = r.months?.[0] ?? {};
        return {
          unit: r.unitCode, status: f.status(r.status), tenant: r.tenant?.name ?? L('vacant'), phone: r.tenant?.phoneNumber ?? '',
          rent: n(r.monthlyRent), electricity: n(m.electricityUsage), water: n(m.waterUsage),
          invoiced: n(m.invoiced), paid: n(m.paid), outstanding: n(m.outstanding),
        };
      });
      doc.sections.push({
        columns: [
          { key: 'unit', label: L('unit'), width: 8 }, { key: 'status', label: L('status'), width: 12 },
          { key: 'tenant', label: L('tenant'), width: 20 }, { key: 'phone', label: L('phone'), width: 13 },
          { key: 'rent', label: L('monthlyRent'), type: 'money' }, { key: 'electricity', label: L('electricityKwh'), type: 'number' },
          { key: 'water', label: L('waterM3'), type: 'number' }, { key: 'invoiced', label: L('invoiced'), type: 'money' },
          { key: 'paid', label: L('paid'), type: 'money' }, { key: 'outstanding', label: L('outstanding'), type: 'money' },
        ],
        rows,
        totals: {
          unit: L('total'), rent: sum(rows, 'rent'), electricity: sum(rows, 'electricity'), water: sum(rows, 'water'),
          invoiced: sum(rows, 'invoiced'), paid: sum(rows, 'paid'), outstanding: sum(rows, 'outstanding'),
        },
      });
      break;
    }

    case 'expense-matrix': {
      const months: string[] = data?.period?.months ?? [];
      doc.summary = [{ label: L('totalExpenses'), value: data?.totals?.total, type: 'money', tone: 'bad' }];
      const rows: Row[] = [...(data?.rows ?? [])]
        .sort((a: any, b: any) => n(b.total) - n(a.total))
        .map((r: any) => ({ category: cap(r.category), ...Object.fromEntries(months.map(m => [m, n(r.amounts?.[m])])), total: n(r.total) }));
      doc.sections.push({
        title: L('byCategory'),
        columns: [
          { key: 'category', label: L('category'), width: 20 },
          ...months.map(m => ({ key: m, label: f.month(m), type: 'money' as ColType })),
          { key: 'total', label: L('total'), type: 'money' },
        ],
        rows,
        totals: { category: L('total'), ...Object.fromEntries(months.map(m => [m, n(data?.totals?.amounts?.[m])])), total: n(data?.totals?.total) },
      });
      const details: Row[] = (data?.details ?? []).map((d: any) => ({
        date: d.date, category: cap(d.category), description: d.description ?? '', vendor: d.vendor ?? '', unit: d.unitCode ?? '', amount: n(d.amount),
      }));
      if (details.length) {
        doc.sections.push({
          title: L('expenseLines'),
          columns: [
            { key: 'date', label: L('date'), type: 'date', width: 13 }, { key: 'category', label: L('category'), width: 16 },
            { key: 'description', label: L('description'), width: 28 }, { key: 'vendor', label: L('vendor'), width: 18 },
            { key: 'unit', label: L('unit'), width: 8 }, { key: 'amount', label: L('amount'), type: 'money' },
          ],
          rows: details,
          totals: { date: L('total'), amount: sum(details, 'amount') },
        });
      }
      break;
    }

    case 'monthly-summary': {
      const fin = data?.finance ?? {};
      const occ = data?.occupancy ?? {};
      doc.summary = [
        { label: L('invoiced'), value: fin.totalInvoiced, type: 'money' },
        { label: L('collected'), value: fin.totalRevenue, type: 'money', tone: 'good' },
        { label: L('expenses'), value: fin.totalExpenses, type: 'money', tone: 'bad' },
        { label: L('profit'), value: fin.profit, type: 'money', tone: n(fin.profit) < 0 ? 'bad' : 'good' },
      ];
      doc.sections.push({
        columns: [{ key: 'item', label: L('item'), width: 28 }, { key: 'value', label: L('value'), width: 20 }],
        rows: [
          { item: L('invoiceIncome'), value: f.money(fin.invoiceIncome) },
          { item: L('manualIncome'), value: f.money(fin.manualIncome) },
          { item: L('collectionRate'), value: f.format(fin.collectionRate, 'percent') },
          { item: L('occupancy'), value: f.format(occ.rate, 'percent') },
          { item: L('occupiedUnits'), value: `${occ.occupied ?? 0} / ${occ.total ?? 0}` },
        ],
      });
      break;
    }

    case 'category-breakdown': {
      const rows: Row[] = list().map((r: any) => ({ category: r.category === 'unknown' ? L('uncategorized') : cap(r.category), amount: n(r.amount), share: n(r.percentage) }));
      doc.summary = [{ label: L('total'), value: sum(rows, 'amount'), type: 'money' }];
      doc.sections.push({
        columns: [{ key: 'category', label: L('category'), width: 24 }, { key: 'amount', label: L('amount'), type: 'money' }, { key: 'share', label: L('share'), type: 'percent' }],
        rows,
        totals: { category: L('total'), amount: sum(rows, 'amount'), share: 100 },
      });
      break;
    }

    case 'expenses': {
      const rows: Row[] = list().map((r: any) => ({ date: r.date, category: cap(r.category), description: r.description ?? '', unit: r.unitCode ?? '', amount: n(r.amount) }));
      doc.summary = [
        { label: L('totalExpenses'), value: sum(rows, 'amount'), type: 'money', tone: 'bad' },
        { label: L('count'), value: rows.length, type: 'number' },
      ];
      doc.sections.push({
        columns: [
          { key: 'date', label: L('date'), type: 'date', width: 13 }, { key: 'category', label: L('category'), width: 16 },
          { key: 'description', label: L('description'), width: 30 }, { key: 'unit', label: L('unit'), width: 8 },
          { key: 'amount', label: L('amount'), type: 'money' },
        ],
        rows,
        totals: { date: L('total'), amount: sum(rows, 'amount') },
      });
      break;
    }

    case 'payment-methods': {
      const rows: Row[] = list().map((r: any) => ({ method: cap(r.method ?? r.paymentMethod ?? r.label ?? 'other'), count: n(r.count), amount: n(r.amount) }));
      const total = sum(rows, 'amount');
      rows.forEach(r => { r.share = total ? (n(r.amount) / total) * 100 : 0; });
      doc.summary = [{ label: L('collected'), value: total, type: 'money', tone: 'good' }];
      doc.sections.push({
        columns: [
          { key: 'method', label: L('method'), width: 20 }, { key: 'count', label: L('payments'), type: 'number' },
          { key: 'amount', label: L('amount'), type: 'money' }, { key: 'share', label: L('share'), type: 'percent' },
        ],
        rows,
        totals: { method: L('total'), count: sum(rows, 'count'), amount: total, share: 100 },
      });
      break;
    }

    case 'unpaid-invoices': {
      doc.summary = [
        { label: L('totalUnpaid'), value: data?.total, type: 'money', tone: 'bad' },
        { label: L('avgDaysOverdue'), value: data?.averageOverdueDays ?? 0, type: 'number' },
      ];
      const buckets: Row[] = (data?.buckets ?? []).map((b: any) => ({ range: b.range, count: n(b.count), amount: n(b.amount) }));
      if (buckets.length) {
        doc.sections.push({
          title: L('aging'),
          columns: [{ key: 'range', label: L('daysOverdue'), width: 16 }, { key: 'count', label: L('invoices'), type: 'number' }, { key: 'amount', label: L('amount'), type: 'money' }],
          rows: buckets,
          totals: { range: L('total'), count: sum(buckets, 'count'), amount: sum(buckets, 'amount') },
        });
      }
      const details: Row[] = (data?.details ?? []).map((d: any) => ({ invoice: d.invoiceNumber, tenant: d.tenant, unit: d.unit, due: d.dueDate, amount: n(d.amount) }));
      doc.sections.push({
        title: L('invoices'),
        columns: [
          { key: 'invoice', label: L('invoice'), width: 24 }, { key: 'tenant', label: L('tenant'), width: 20 },
          { key: 'unit', label: L('unit'), width: 8 }, { key: 'due', label: L('dueDate'), type: 'date', width: 13 },
          { key: 'amount', label: L('amount'), type: 'money' },
        ],
        rows: details,
        totals: { invoice: L('total'), amount: sum(details, 'amount') },
      });
      break;
    }

    case 'delinquency': {
      const rows: Row[] = [...list()].sort((a: any, b: any) => n(b.daysOverdue) - n(a.daysOverdue))
        .map((r: any) => ({ tenant: r.tenantName, unit: r.unitCode, invoice: r.invoiceNumber ?? '', due: r.dueDate, days: n(r.daysOverdue), amount: n(r.amount) }));
      doc.summary = [
        { label: L('totalOverdue'), value: sum(rows, 'amount'), type: 'money', tone: 'bad' },
        { label: L('tenants'), value: rows.length, type: 'number' },
      ];
      doc.sections.push({
        columns: [
          { key: 'tenant', label: L('tenant'), width: 20 }, { key: 'unit', label: L('unit'), width: 8 },
          { key: 'invoice', label: L('invoice'), width: 24 }, { key: 'due', label: L('dueDate'), type: 'date', width: 13 },
          { key: 'days', label: L('daysOverdue'), type: 'number' }, { key: 'amount', label: L('amount'), type: 'money' },
        ],
        rows,
        totals: { tenant: L('total'), amount: sum(rows, 'amount') },
      });
      break;
    }

    case 'tenant-balances': {
      const rows: Row[] = [...list()].sort((a: any, b: any) => n(b.balance) - n(a.balance)).map((r: any) => ({ tenant: r.name, units: r.units, balance: n(r.balance) }));
      doc.summary = [{ label: L('totalOwed'), value: sum(rows, 'balance'), type: 'money', tone: 'bad' }];
      doc.sections.push({
        columns: [{ key: 'tenant', label: L('tenant'), width: 24 }, { key: 'units', label: L('units'), width: 16 }, { key: 'balance', label: L('balance'), type: 'money' }],
        rows,
        totals: { tenant: L('total'), balance: sum(rows, 'balance') },
      });
      break;
    }

    case 'occupancy-summary': {
      const all = list();
      const rows: Row[] = all.filter((r: any) => r.label !== 'Total').map((r: any) => ({ status: f.status(r.label), units: n(r.value), share: n(r.percentage) }));
      const total = all.find((r: any) => r.label === 'Total')?.value ?? sum(rows, 'units');
      doc.summary = [{ label: L('totalUnits'), value: total, type: 'number' }];
      doc.sections.push({
        columns: [{ key: 'status', label: L('status'), width: 18 }, { key: 'units', label: L('units'), type: 'number' }, { key: 'share', label: L('share'), type: 'percent' }],
        rows,
        totals: { status: L('total'), units: n(total), share: 100 },
      });
      break;
    }

    case 'occupancy-trend': {
      const rows: Row[] = list().map((r: any) => ({ month: r.month, rate: n(r.occupancyRate), contracts: n(r.activeContracts) }));
      const avg = rows.length ? sum(rows, 'rate') / rows.length : 0;
      doc.summary = [{ label: L('average'), value: avg, type: 'percent' }];
      doc.sections.push({
        columns: [{ key: 'month', label: L('month'), type: 'month', width: 12 }, { key: 'rate', label: L('occupancy'), type: 'percent' }, { key: 'contracts', label: L('activeContracts'), type: 'number' }],
        rows,
        totals: { month: L('average'), rate: avg },
      });
      break;
    }

    case 'rent-roll': {
      const rows: Row[] = list().map((r: any) => {
        const vacant = r.tenant === 'Vacant';
        return {
          unit: r.unitCode, status: vacant ? f.status(r.status) : f.status('occupied'), tenant: vacant ? L('vacant') : r.tenant,
          start: vacant ? '' : r.startDate, end: vacant ? '' : r.endDate, rent: n(r.monthlyRent),
        };
      });
      doc.summary = [
        { label: L('units'), value: rows.length, type: 'number' },
        { label: L('rentFromOccupied'), value: rows.filter(r => r.tenant !== L('vacant')).reduce((s, r) => s + n(r.rent), 0), type: 'money', tone: 'good' },
      ];
      doc.sections.push({
        columns: [
          { key: 'unit', label: L('unit'), width: 8 }, { key: 'status', label: L('status'), width: 12 },
          { key: 'tenant', label: L('tenant'), width: 22 }, { key: 'start', label: L('startDate'), type: 'date', width: 13 },
          { key: 'end', label: L('endDate'), type: 'date', width: 13 }, { key: 'rent', label: L('monthlyRent'), type: 'money' },
        ],
        rows,
        totals: { unit: L('total'), rent: sum(rows, 'rent') },
      });
      break;
    }

    case 'maintenance-summary': {
      doc.summary = [
        { label: L('totalCost'), value: data?.totalCost, type: 'money', tone: 'bad' },
        { label: L('billable'), value: data?.billableCost, type: 'money', tone: 'good' },
      ];
      const counts: Row[] = (data?.statusCounts ?? []).map((c: any) => ({ status: f.status(c.status), count: n(c.count) }));
      if (counts.length) {
        doc.sections.push({
          title: L('byStatus'),
          columns: [{ key: 'status', label: L('status'), width: 18 }, { key: 'count', label: L('requests'), type: 'number' }],
          rows: counts,
          totals: { status: L('total'), count: sum(counts, 'count') },
        });
      }
      const details: Row[] = (data?.details ?? []).map((d: any) => ({ date: d.date, type: cap(d.type), description: d.description ?? '', status: f.status(d.status), cost: n(d.cost) }));
      doc.sections.push({
        title: L('requests'),
        columns: [
          { key: 'date', label: L('date'), type: 'date', width: 13 }, { key: 'type', label: L('type'), width: 14 },
          { key: 'description', label: L('description'), width: 30 }, { key: 'status', label: L('status'), width: 13 },
          { key: 'cost', label: L('cost'), type: 'money' },
        ],
        rows: details,
        totals: { date: L('total'), cost: sum(details, 'cost') },
      });
      break;
    }
  }

  // Never export an empty file without saying so
  if (!doc.sections.length || doc.sections.every(s => !s.rows.length)) {
    doc.sections = [{ columns: [{ key: 'note', label: '', width: 40 }], rows: [{ note: String(t('reports.noData')) }] }];
  }
  return doc;
}

/** Plain-text value of a cell for widths / PDF. */
export const cellText = (row: Row, col: Column, fmt: ReturnType<typeof formatters>['format']) => fmt(row[col.key], col.type);
