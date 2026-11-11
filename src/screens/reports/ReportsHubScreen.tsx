import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { monthLabel } from '../../i18n';
import { fileUrl, pickOne, propertiesApi, reportsApi } from '../../services/api';
import { exportReport, type ExportLang, type ExportMeta } from '../../services/reportExport';
import i18n from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { DateField, ErrorView, LoadingView, Screen } from '../../components/ui';
import Segments from '../../components/Segments';
import { Sheet } from '../../components/Sheet';
import { downloadAndOpen, MIME } from '../../services/files';
import { colors, spacing } from '../../theme';
import { thisMonthYM, todayYMD } from '../../utils/format';
import { ReportBody } from './ReportBodies';
import { toast } from '../../components/Toast';

export type ReportKind =
  | 'payment-status' | 'dashboard' | 'room-tenants' | 'expense-matrix'
  | 'monthly-summary' | 'category-breakdown' | 'expenses' | 'payment-methods'
  | 'unpaid-invoices' | 'delinquency' | 'tenant-balances'
  | 'occupancy-summary' | 'occupancy-trend' | 'rent-roll' | 'maintenance-summary';

/** Tab order; `key` is the i18n key under `reports.tabs` / `reports.desc`. */
export const REPORT_TABS: { kind: ReportKind; key: string }[] = [
  { kind: 'payment-status',      key: 'paymentStatus' },
  { kind: 'dashboard',           key: 'dashboard' },
  { kind: 'room-tenants',        key: 'roomTenants' },
  { kind: 'expense-matrix',      key: 'expenseMatrix' },
  { kind: 'monthly-summary',     key: 'monthlySummary' },
  { kind: 'category-breakdown',  key: 'categoryBreakdown' },
  { kind: 'expenses',            key: 'expenses' },
  { kind: 'payment-methods',     key: 'paymentMethods' },
  { kind: 'unpaid-invoices',     key: 'unpaidInvoices' },
  { kind: 'delinquency',         key: 'delinquency' },
  { kind: 'tenant-balances',     key: 'tenantBalances' },
  { kind: 'occupancy-summary',   key: 'occupancySummary' },
  { kind: 'occupancy-trend',     key: 'occupancyTrend' },
  { kind: 'rent-roll',           key: 'rentRoll' },
  { kind: 'maintenance-summary', key: 'maintenanceSummary' },
];

// ─── Ranges ──────────────────────────────────────────────────────────────────

type Preset = 'month' | '3m' | 'year' | 'all';
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function rangeFor(p: Preset): { from: string; to: string } {
  const now = new Date();
  if (p === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  if (p === '3m') return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to: ymd(now) };
  if (p === 'year') return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  return { from: '2000-01-01', to: todayYMD() };
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

const RANGED: ReportKind[] = ['category-breakdown', 'expenses', 'payment-methods', 'maintenance-summary', 'occupancy-trend'];

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const params = (useRoute<any>().params ?? {}) as { kind?: ReportKind };
  const { propertyId, propertyName } = useAuth();

  const [kind, setKind] = useState<ReportKind>(params.kind ?? 'payment-status');
  const [months, setMonths] = useState<'3' | '6' | '12'>('6');
  const [preset, setPreset] = useState<Preset>('month');
  const [yearMonth, setYearMonth] = useState(thisMonthYM());
  const [catType, setCatType] = useState<'expense' | 'income'>('expense');
  const [asOf, setAsOf] = useState(todayYMD());

  // Keep the active tab scrolled into view
  const tabScroll = useRef<ScrollView>(null);
  const tabX = useRef<Record<string, { x: number; w: number }>>({});
  const [barWidth, setBarWidth] = useState(0);
  useEffect(() => {
    const pos = tabX.current[kind];
    if (pos && barWidth) tabScroll.current?.scrollTo({ x: Math.max(0, pos.x - (barWidth - pos.w) / 2), animated: true });
  }, [kind, barWidth]);

  const selectTab = (k: ReportKind) => {
    setKind(k);
    // Trend reads better over a year; everything else defaults to this month
    setPreset(k === 'occupancy-trend' ? 'year' : 'month');
  };

  const { from, to } = rangeFor(preset);

  // ── Export: this report as a styled Excel / PDF built on the device, or the server's full workbook ──
  const [exportSheet, setExportSheet] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportLang, setExportLang] = useState<ExportLang>(i18n.language === 'km' ? 'kh' : 'en');
  const rangeStart = kind === 'dashboard' || kind === 'expense-matrix' ? shiftMonth(yearMonth, -(Number(months) - 1)) : yearMonth;

  /** The period the current report covers, plus a short tag for the file name. */
  const exportPeriod = (): { period: ExportMeta['period']; tag: string } => {
    if (kind === 'dashboard' || kind === 'expense-matrix') return { period: { type: 'months', from: rangeStart, to: yearMonth }, tag: `${rangeStart}_${yearMonth}` };
    if (kind === 'payment-status' || kind === 'room-tenants' || kind === 'monthly-summary') return { period: { type: 'month', ym: yearMonth }, tag: yearMonth };
    if (RANGED.includes(kind)) return { period: { type: 'days', from, to }, tag: `${from}_${to}` };
    if (kind === 'unpaid-invoices') return { period: { type: 'asOf', date: asOf }, tag: asOf };
    return { period: { type: 'asOf', date: todayYMD() }, tag: todayYMD() };
  };

  const exportThis = async (format: 'xlsx' | 'pdf') => {
    setExportSheet(false);
    if (!data) { toast.warning(t('reports.noData')); return; }
    setExporting(true);
    try {
      // Property logo for the PDF header (best effort)
      const logo = format === 'pdf' && propertyId
        ? await propertiesApi.get(propertyId).then(r => pickOne<any>(r, 'properties', 'property')?.logo).catch(() => null)
        : null;
      const { period, tag } = exportPeriod();
      await exportReport({
        kind,
        data,
        format,
        lang: exportLang,
        meta: { tabKey: active.key, propertyName: propertyName ?? t('billing.allProperties'), period },
        logoUrl: logo ? fileUrl(logo) : undefined,
        fileTag: tag,
      });
    } catch (e: any) {
      toast.error(e?.message ?? String(e), { title: t('reportExport.failed') });
    } finally {
      setExporting(false);
    }
  };

  /** The server's full monthly workbook (all client reports in one .xlsx). */
  const exportWorkbook = async () => {
    setExportSheet(false);
    setExporting(true);
    try {
      const path = reportsApi.excelPath('export', { from: rangeStart, to: yearMonth, lang: exportLang });
      await downloadAndOpen(path, `workbook-${rangeStart}_${yearMonth}${exportLang === 'kh' ? '-kh' : ''}.xlsx`, MIME.xlsx);
    } catch (e: any) {
      toast.error(e?.message ?? String(e), { title: t('reportExport.failed') });
    } finally {
      setExporting(false);
    }
  };

  const { data, loading, error, refresh, refreshing } = useApi(async () => {
    switch (kind) {
      case 'payment-status': return reportsApi.paymentStatus(yearMonth, yearMonth);
      case 'dashboard': return reportsApi.dashboard(shiftMonth(yearMonth, -(Number(months) - 1)), yearMonth);
      case 'room-tenants': return reportsApi.roomTenants(yearMonth, yearMonth);
      case 'expense-matrix': return reportsApi.expenseMatrix(shiftMonth(yearMonth, -(Number(months) - 1)), yearMonth, { hideEmpty: true });
      case 'monthly-summary': return (await reportsApi.monthlyFor(yearMonth)).data;
      case 'category-breakdown': return (await reportsApi.categoryBreakdown(from, to, catType)).data;
      case 'expenses': return (await reportsApi.expenses(from, to)).data;
      case 'payment-methods': return (await reportsApi.paymentMethods(from, to)).data;
      case 'unpaid-invoices': return (await reportsApi.unpaidInvoices(asOf)).data;
      case 'delinquency': return (await reportsApi.delinquency()).data;
      case 'tenant-balances': return (await reportsApi.tenantBalances()).data;
      case 'occupancy-summary': return (await reportsApi.occupancySummary()).data;
      case 'occupancy-trend': return (await reportsApi.occupancyTrend(from.slice(0, 7), to.slice(0, 7))).data;
      case 'rent-roll': return (await reportsApi.rentRoll()).data;
      case 'maintenance-summary': {
        // API treats `to` as exclusive timestamp — add a day like the web does
        const d = new Date(to + 'T00:00:00'); d.setDate(d.getDate() + 1);
        return (await reportsApi.maintenanceSummary(from, ymd(d))).data;
      }
    }
  }, [kind, preset, yearMonth, catType, asOf, propertyId, months], { refetchOnFocus: false });

  const active = REPORT_TABS.find(r => r.kind === kind)!;
  const isCurrentMonth = yearMonth >= thisMonthYM();

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        {nav.canGoBack() ? (
          <TouchableOpacity style={styles.iconBtn} onPress={() => nav.goBack()} hitSlop={6} accessibilityLabel="Back">
            <Icon name="chevron-back" size={20} color={colors.ink} />
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>{t('reports.title')}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{propertyName ?? t('billing.allProperties')}</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setExportSheet(true)} disabled={exporting} accessibilityLabel={t('reportExport.title')}>
          {exporting ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="download-outline" size={19} color={colors.ink} />}
        </TouchableOpacity>
      </View>

      {/* Report tabs */}
      <View style={styles.tabsWrap} onLayout={e => setBarWidth(e.nativeEvent.layout.width)}>
        <ScrollView ref={tabScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {REPORT_TABS.map(r => {
            const on = r.kind === kind;
            return (
              <Pressable
                key={r.kind}
                onPress={() => selectTab(r.kind)}
                onLayout={e => { tabX.current[r.kind] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width }; }}
                style={styles.tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.tabText, on && styles.tabTextActive]}>{t(`reports.tabs.${r.key}`)}</Text>
                <View style={[styles.tabLine, on && styles.tabLineActive]} />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <Screen header={header} refreshing={refreshing} onRefresh={refresh} contentStyle={{ paddingTop: spacing.md }}>
      <Text style={styles.desc}>{t(`reports.desc.${active.key}`)}</Text>

      {/* Per-report controls */}
      {kind === 'dashboard' || kind === 'expense-matrix' ? (
        <Segments<'3' | '6' | '12'>
          style={styles.control}
          value={months}
          onChange={setMonths}
          options={(['3', '6', '12'] as const).map(v => ({ value: v, label: t('reports.monthsN', { count: Number(v) }) }))}
        />
      ) : null}

      {kind === 'monthly-summary' || kind === 'payment-status' || kind === 'dashboard' || kind === 'room-tenants' || kind === 'expense-matrix' ? (
        <View style={styles.monthNav}>
          <TouchableOpacity style={styles.navBtn} onPress={() => setYearMonth(m => shiftMonth(m, -1))} hitSlop={6}>
            <Icon name="chevron-back" size={18} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.monthTitle} numberOfLines={1} adjustsFontSizeToFit>
            {kind === 'dashboard' || kind === 'expense-matrix' ? `${monthLabel(shiftMonth(yearMonth, -(Number(months) - 1)))} – ${monthLabel(yearMonth)}` : monthLabel(yearMonth)}
          </Text>
          <TouchableOpacity
            style={[styles.navBtn, isCurrentMonth && { opacity: 0.3 }]}
            onPress={() => setYearMonth(m => shiftMonth(m, 1))}
            disabled={isCurrentMonth}
            hitSlop={6}
          >
            <Icon name="chevron-forward" size={18} color={colors.ink} />
          </TouchableOpacity>
        </View>
      ) : null}

      {kind === 'category-breakdown' ? (
        <Segments
          style={styles.control}
          value={catType}
          onChange={setCatType}
          options={[{ value: 'expense', label: t('reports.expense') }, { value: 'income', label: t('reports.income') }]}
        />
      ) : null}

      {RANGED.includes(kind) ? (
        <Segments<Preset>
          style={styles.control}
          value={preset}
          onChange={setPreset}
          options={[
            { value: 'month', label: t('reports.period.month') },
            { value: '3m', label: t('reports.period.threeMonths') },
            { value: 'year', label: t('reports.period.year') },
            { value: 'all', label: t('reports.period.all') },
          ]}
        />
      ) : null}

      {kind === 'unpaid-invoices' ? (
        <View style={styles.control}>
          <DateField label={t('reports.asOf')} value={asOf} onChange={setAsOf} />
        </View>
      ) : null}

      <View style={{ marginTop: spacing.md }}>
        {loading ? <LoadingView /> : error ? <ErrorView message={error} onRetry={refresh} /> : (
          <ReportBody kind={kind} data={data} />
        )}
      </View>

      <Sheet visible={exportSheet} onClose={() => setExportSheet(false)} title={t('reportExport.title')}>
        <Text style={styles.exportLabelSmall}>{t('reportExport.language')}</Text>
        <Segments<ExportLang>
          value={exportLang}
          onChange={setExportLang}
          options={[{ value: 'en', label: 'English' }, { value: 'kh', label: 'ខ្មែរ' }]}
        />

        <Text style={[styles.exportLabelSmall, { marginTop: spacing.lg }]}>
          {t('reportExport.thisReport')} · {t(`reports.tabs.${active.key}`)}
        </Text>
        <View style={styles.exportCard}>
          <ExportRow icon="grid-outline" title={t('reportExport.excel')} subtitle={t('reportExport.excelSub')} badge="XLSX" onPress={() => exportThis('xlsx')} first />
          <ExportRow icon="document-text-outline" title={t('reportExport.pdf')} subtitle={t('reportExport.pdfSub')} badge="PDF" onPress={() => exportThis('pdf')} />
        </View>

        <Text style={[styles.exportLabelSmall, { marginTop: spacing.lg }]}>{t('reportExport.allReports')}</Text>
        <View style={styles.exportCard}>
          <ExportRow icon="albums-outline" title={t('reportExport.fullWorkbook')} subtitle={t('reportExport.fullWorkbookSub')} badge="XLSX" onPress={exportWorkbook} first />
        </View>
      </Sheet>
    </Screen>
  );
}

function ExportRow({ icon, title, subtitle, badge, onPress, first }: {
  icon: string; title: string; subtitle: string; badge: string; onPress: () => void; first?: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.exportRow, !first && styles.exportSep]} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.exportIcon}><Icon name={icon} size={19} color={colors.primary} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.exportTitleRow}>
          <Text style={styles.exportTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.exportBadge}>{badge}</Text>
        </View>
        <Text style={styles.exportSub} numberOfLines={2}>{subtitle}</Text>
      </View>
      <Icon name="download-outline" size={18} color={colors.primary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  exportLabelSmall: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 8, letterSpacing: 0.3 },
  exportCard: { borderWidth: 1, borderColor: colors.divider, borderRadius: 14, overflow: 'hidden' },
  exportRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  exportSep: { borderTopWidth: 1, borderTopColor: colors.divider },
  exportIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  exportTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  exportTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  exportBadge: {
    fontSize: 9, fontWeight: '800', color: colors.primary, backgroundColor: colors.primarySoft,
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: 'hidden', letterSpacing: 0.5,
  },
  exportSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  header: { backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, fontWeight: '500', marginTop: 2 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center',
  },

  tabsWrap: { marginTop: 14, marginHorizontal: -spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  tabs: { paddingHorizontal: spacing.lg, gap: 22 },
  tab: { paddingTop: 4 },
  tabText: { fontSize: 14, fontWeight: '500', color: colors.muted, paddingBottom: 10 },
  tabTextActive: { color: colors.ink, fontWeight: '700' },
  tabLine: { height: 2, borderRadius: 1, backgroundColor: 'transparent', marginBottom: -1 },
  tabLineActive: { backgroundColor: colors.primary },

  desc: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md, paddingHorizontal: 4 },
  control: { marginBottom: spacing.sm },

  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm,
    backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.divider, padding: 6,
  },
  navBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },

  footer: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: spacing.xxl },
});
