import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { monthsShort, statusLabel } from '../i18n';
import { dashboardApi, propertiesApi, pickList, reportsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useBadges } from '../context/BadgeContext';
import { useApi } from '../hooks/useApi';
import {
  Badge, EmptyState, ErrorView, IconTile, ListRow, LoadingView,
  ProgressBar, Screen, SectionTitle, Sheet,
} from '../components/ui';
import DonutChart from '../components/DonutChart';
import { colors, radius, spacing } from '../theme';
import { initials, money, toNum, todayYMD } from '../utils/format';

const CHART_MONTHS = 12;

type Period = 'month' | 'year';
type SliceKey = 'rent' | 'water' | 'electricity' | 'other' | 'expense';

// `label` is an i18n key under `home.`
const SLICES: { key: SliceKey; label: string; color: string }[] = [
  { key: 'rent',        label: 'roomRent',    color: colors.primary },
  { key: 'water',       label: 'water',       color: colors.info },
  { key: 'electricity', label: 'electricity', color: colors.accent },
  { key: 'other',       label: 'otherIncome', color: colors.violet },
  { key: 'expense',     label: 'expenses',    color: colors.danger },
];

/** Map a report income category ("rent", "room_rent", "electricity", "Water bill"…) to a pie slice. */
function incomeSlice(category?: string | null): SliceKey {
  const c = String(category ?? '').toLowerCase();
  if (c.includes('rent')) return 'rent';
  if (c.includes('water')) return 'water';
  if (c.includes('electric')) return 'electricity';
  return 'other';
}

const rowsOf = (res: any): any[] => {
  const x = res?.data ?? res;
  return Array.isArray(x) ? x : [];
};

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** "YYYY-MM" for each revenue row; falls back to position (last row = current month) if `key` isn't a date. */
function seriesKeys(rows: { key?: string }[]): string[] {
  const now = new Date();
  return rows.map((r, i) => {
    const m = String(r.key ?? '').match(/^(\d{4})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
    return ym(new Date(now.getFullYear(), now.getMonth() - (rows.length - 1 - i), 1));
  });
}

type Overview = {
  topCards: {
    totalRevenue: number; revenueGrowth: string; occupancyRate: string; currentTenants: number;
    newTenantsThisMonth: string; availableRooms: number; totalRooms: number;
  };
  revenueInsights: { key: string; month: string; revenue: number }[];
  unitDistribution: Record<string, number>;
  invoice: { id: number; unit: string; tenant: string; amount: string; date: string; status: string }[];
  maintenanceRequests: { id: number; unit: string; issue: string; date: string; priority: string; status: string }[];
  expiringContracts: any[];
};

type OwnerMobile = {
  performanceOverview: { totalRevenue: number; totalExpenses: number; netProfit: number; outstandingBalances: number };
  portfolioStatus: { totalUnits: number; occupiedUnits: number; vacantUnits: number; occupancyRate: string };
  needsAttention: { pendingMaintenance: any[]; expiringContracts: any[] };
};

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'home.goodMorning';
  if (h < 18) return 'home.goodAfternoon';
  return 'home.goodEvening';
}

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { user, propertyId, propertyName, switchProperty } = useAuth();
  const { notificationCount, requestCount, refreshBadges } = useBadges();
  const [picker, setPicker] = useState(false);

  const { data, loading, refreshing, error, refresh } = useApi(async () => {
    const now = new Date();
    const from = `${ym(new Date(now.getFullYear(), now.getMonth() - (CHART_MONTHS - 1), 1))}-01`;
    const [ov, om, ex] = await Promise.all([
      dashboardApi.overview(),
      dashboardApi.ownerMobile(),
      // Expenses are optional for the chart — never let them break the dashboard
      reportsApi.expenses(from, todayYMD()).catch(() => null),
    ]);
    const rows = ex?.data ?? ex;
    return { overview: ov?.data as Overview, owner: om?.data as OwnerMobile, expenses: Array.isArray(rows) ? rows : [] };
  }, [propertyId]);

  // Income by category + total expenses for the pie, for the selected period
  const [period, setPeriod] = useState<Period>('month');
  const breakdown = useApi(async () => {
    const now = new Date();
    const from = period === 'month' ? `${ym(now)}-01` : `${now.getFullYear()}-01-01`;
    const to = todayYMD();
    const [inc, exp] = await Promise.all([
      reportsApi.categoryBreakdown(from, to, 'income').catch(() => null),
      reportsApi.categoryBreakdown(from, to, 'expense').catch(() => null),
    ]);
    return { income: rowsOf(inc), expense: rowsOf(exp) };
  }, [propertyId, period]);

  const props = useApi(async () => pickList(await propertiesApi.list(), 'properties'), [], { refetchOnFocus: false });

  const onRefresh = () => {
    refresh();
    breakdown.refresh();
  };

  const onSwitch = async (p: any) => {
    setPicker(false);
    if (p.id === propertyId) return;
    try {
      await switchProperty(p.id, p.name);
      refreshBadges();
    } catch (e: any) {
      Alert.alert(t('home.switchFailed'), e?.message ?? t('home.tryAgain'));
    }
  };

  const ov = data?.overview;
  const om = data?.owner;
  const perf = om?.performanceOverview;
  const portfolio = om?.portfolioStatus;
  const dist = ov?.unitDistribution ?? {};
  const occupancy = toNum(portfolio?.occupancyRate ?? ov?.topCards?.occupancyRate);
  const totalUnits = portfolio?.totalUnits ?? ov?.topCards?.totalRooms ?? 0;
  const netProfit = toNum(perf?.netProfit);
  const growth = String(ov?.topCards?.revenueGrowth ?? '0%');
  const invoices = ov?.invoice ?? [];

  // Only list the unit states that actually have units, e.g. "1 occupied · 48 available · 1 maintenance"
  const unitBreakdown = (['Occupied', 'Available', 'Reserved', 'Maintenance'] as const)
    .filter(k => toNum(dist[k]) > 0)
    .map(k => t(`home.${k.toLowerCase()}Count`, { count: toNum(dist[k]) }))
    .join('  ·  ');
  const months = monthsShort();

  // Revenue vs expenses per month (revenue from the dashboard, expenses summed from the expenses report)
  const revenueRows = ov?.revenueInsights ?? [];
  const keys = seriesKeys(revenueRows);
  const expenseByMonth: Record<string, number> = {};
  (data?.expenses ?? []).forEach((e: any) => {
    const k = String(e.date ?? e.expenseDate ?? e.createdAt ?? '').slice(0, 7);
    if (k) expenseByMonth[k] = (expenseByMonth[k] ?? 0) + toNum(e.amount);
  });
  const series = revenueRows.map((r, i) => ({
    label: months[parseInt(keys[i].slice(5), 10) - 1] ?? r.month,
    revenue: toNum(r.revenue),
    expense: expenseByMonth[keys[i]] ?? 0,
  }));
  const seriesRevenue = series.reduce((s, x) => s + x.revenue, 0);
  const seriesExpense = series.reduce((s, x) => s + x.expense, 0);

  // Pie slices: income grouped into Room rent / Water / Electricity / Other, plus Expenses
  const sliceTotals: Record<SliceKey, number> = { rent: 0, water: 0, electricity: 0, other: 0, expense: 0 };
  (breakdown.data?.income ?? []).forEach((r: any) => { sliceTotals[incomeSlice(r.category)] += toNum(r.amount); });
  (breakdown.data?.expense ?? []).forEach((r: any) => { sliceTotals.expense += toNum(r.amount); });
  const pie = SLICES.map(s => ({ ...s, value: sliceTotals[s.key] }));
  const pieIncome = pie.filter(s => s.key !== 'expense').reduce((s, x) => s + x.value, 0);
  const pieNet = pieIncome - sliceTotals.expense;
  const pieEmpty = pie.every(s => s.value === 0);

  return (
    <Screen refreshing={refreshing || breakdown.refreshing} onRefresh={onRefresh} tabBarSpace contentStyle={{ paddingTop: insets.top + 8 }}>
      {/* Header — scrolls with the content */}
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.greet} numberOfLines={1}>
            {t(greetingKey())}, {user?.username ?? t('home.owner')}
          </Text>
          <TouchableOpacity style={styles.propBtn} onPress={() => setPicker(true)} activeOpacity={0.6}>
            <Text style={styles.propText} numberOfLines={1}>{propertyName || t('home.allProperties')}</Text>
            <Icon name="chevron-down" size={18} color={colors.muted} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={() => nav.navigate('Notifications')} activeOpacity={0.7}>
          <Icon name="notifications-outline" size={20} color={colors.ink} />
          {notificationCount > 0 ? <View style={styles.dot} /> : null}
        </TouchableOpacity>
        <TouchableOpacity style={styles.avatar} onPress={() => nav.navigate('Profile')} activeOpacity={0.7}>
          <Text style={styles.avatarText}>{initials(user?.username)}</Text>
        </TouchableOpacity>
      </View>

      {loading ? <LoadingView /> : error && !data ? <ErrorView message={error} onRetry={refresh} /> : (
        <>
          {/* Balance */}
          <View style={styles.card}>
            <Text style={styles.label}>{t('home.outstandingBalance')}</Text>
            <Text style={styles.hero}>{money(perf?.outstandingBalances ?? 0, { decimals: 2 })}</Text>
            <View style={styles.hr} />
            <View style={styles.row}>
              <Metric label={t('home.revenue')} value={money(perf?.totalRevenue ?? ov?.topCards?.totalRevenue ?? 0)} />
              <Metric label={t('home.expenses')} value={money(perf?.totalExpenses ?? 0)} />
              <Metric
                label={t('home.netProfit')}
                value={money(netProfit)}
                color={netProfit > 0 ? colors.success : netProfit < 0 ? colors.danger : undefined}
              />
            </View>
          </View>

          {/* Portfolio: occupancy + counts in one card */}
          <View style={[styles.card, { marginTop: spacing.lg }]}>
            <View style={styles.cardHead}>
              <Text style={styles.label}>{t('home.occupancy')}</Text>
              <TouchableOpacity onPress={() => nav.navigate('Units')} hitSlop={8}>
                <Text style={styles.link}>{t('home.viewUnits')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.big}>{occupancy.toFixed(1)}%</Text>
            <View style={{ marginTop: 12 }}>
              <ProgressBar value={occupancy / 100} height={6} />
            </View>
            {unitBreakdown ? <Text style={styles.sub}>{unitBreakdown}</Text> : null}
            <View style={styles.hr} />
            <View style={styles.row}>
              <Stat value={totalUnits} label={t('home.units')} onPress={() => nav.navigate('Units')} />
              <Stat value={ov?.topCards?.currentTenants ?? 0} label={t('home.tenants')} onPress={() => nav.navigate('Tenants')} />
              <Stat value={requestCount} label={t('home.requests')} onPress={() => nav.navigate('Requests')} />
            </View>
          </View>

          {/* Revenue vs expenses */}
          {series.length ? (
            <View style={[styles.card, { marginTop: spacing.lg }]}>
              <View style={styles.cardHead}>
                <Text style={styles.label}>{t('home.revenueExpenses')}</Text>
                <Text style={styles.floorMeta}>{t('home.lastMonths', { count: series.length })}</Text>
              </View>
              <View style={[styles.row, { marginTop: 12, marginBottom: 18 }]}>
                <View style={styles.col}>
                  <View style={styles.legend}>
                    <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                    <Text style={styles.metricLabel}>{t('home.revenue')}</Text>
                    <Text style={[styles.growth, { color: growth.startsWith('-') ? colors.danger : colors.success }]}>{growth}</Text>
                  </View>
                  <Text style={styles.chartTotal} numberOfLines={1} adjustsFontSizeToFit>{money(seriesRevenue)}</Text>
                </View>
                <View style={styles.col}>
                  <View style={styles.legend}>
                    <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
                    <Text style={styles.metricLabel}>{t('home.expenses')}</Text>
                  </View>
                  <Text style={styles.chartTotal} numberOfLines={1} adjustsFontSizeToFit>{money(seriesExpense)}</Text>
                </View>
              </View>
              {/* Khmer month names are long — label every 3rd month (always incl. the latest) */}
              <RevenueExpenseChart data={series} labelEvery={i18n.language === 'km' ? 3 : 1} />
            </View>
          ) : null}

          {/* Income & expense breakdown (pie) */}
          <View style={[styles.card, { marginTop: spacing.lg }]}>
            <View style={styles.cardHead}>
              <Text style={[styles.label, { flexShrink: 1 }]} numberOfLines={1}>{t('home.incomeExpenses')}</Text>
              <View style={styles.toggle}>
                {(['month', 'year'] as Period[]).map(p => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setPeriod(p)}
                    style={[styles.toggleItem, period === p && styles.toggleItemActive]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.toggleText, period === p && styles.toggleTextActive]}>
                      {p === 'month' ? t('home.thisMonth') : t('home.thisYear')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[styles.pieRow, breakdown.loading && breakdown.data ? { opacity: 0.5 } : null]}>
              <DonutChart
                data={pie.map(s => ({ key: s.key, value: s.value, color: s.color }))}
                center={
                  <>
                    <Text style={styles.metricLabel}>{t('home.net')}</Text>
                    <Text
                      style={[styles.pieNet, { color: pieNet < 0 ? colors.danger : colors.ink }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {money(pieNet)}
                    </Text>
                  </>
                }
              />
              <View style={styles.pieLegend}>
                {pie.map(s => (
                  <View key={s.key} style={[styles.pieItem, s.key === 'expense' && styles.pieItemExpense]}>
                    <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                    <Text style={styles.pieLabel} numberOfLines={1}>{t(`home.${s.label}`)}</Text>
                    <Text style={[styles.pieValue, s.value === 0 && { color: colors.muted }]} numberOfLines={1}>
                      {money(s.value)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
            {pieEmpty && !breakdown.loading ? (
              <Text style={styles.pieEmpty}>
                {period === 'month' ? t('home.noDataMonth') : t('home.noDataYear')}
              </Text>
            ) : null}
          </View>

          {/* Recent invoices */}
          <SectionTitle title={t('home.recentInvoices')} action={t('home.seeAll')} onAction={() => nav.navigate('Billing')} />
          <View style={[styles.card, styles.list]}>
            {invoices.length === 0 ? (
              <EmptyState icon="receipt-outline" title={t('home.noInvoices')} />
            ) : invoices.slice(0, 5).map((inv, i) => (
              <ListRow
                key={inv.id}
                style={i > 0 ? styles.sep : undefined}
                title={inv.tenant}
                subtitle={`${t('home.unit', { code: inv.unit })} · ${inv.date}`}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={styles.amount}>{money(inv.amount, { decimals: 2 })}</Text>
                    <Badge status={inv.status} label={statusLabel(inv.status)} />
                  </View>
                }
                onPress={() => nav.navigate('InvoiceDetail', { invoiceId: inv.id })}
                chevron={false}
              />
            ))}
          </View>
        </>
      )}

      <Sheet visible={picker} onClose={() => setPicker(false)} title={t('home.switchProperty')}>
        {(props.data ?? []).map((p: any) => {
          const active = p.id === propertyId;
          return (
            <ListRow
              key={p.id}
              left={<IconTile icon="business-outline" tone={active ? 'primary' : 'neutral'} />}
              title={p.name}
              subtitle={`${p.type ?? ''}${p.address ? ' · ' + p.address : ''}`}
              right={active ? <Icon name="checkmark-circle" size={22} color={colors.primary} /> : undefined}
              onPress={() => onSwitch(p)}
              chevron={false}
              style={{ borderRadius: radius.md, paddingHorizontal: 8 }}
            />
          );
        })}
      </Sheet>
    </Screen>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.col}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

/** Grouped bars: green revenue + red expense side by side for each month. */
function RevenueExpenseChart({ data, height = 120, labelEvery = 1 }: {
  data: { label: string; revenue: number; expense: number }[]; height?: number; labelEvery?: number;
}) {
  const last = data.length - 1;
  const max = Math.max(1, ...data.map(d => Math.max(d.revenue, d.expense)));
  const h = (v: number) => (v > 0 ? Math.max(3, (v / max) * height) : 0);
  return (
    <View>
      <View style={[styles.chart, { height }]}>
        {data.map((d, i) => (
          <View key={d.label + i} style={styles.chartCol}>
            <View style={[styles.chartBar, { height: h(d.revenue), backgroundColor: colors.success }]} />
            <View style={[styles.chartBar, { height: h(d.expense), backgroundColor: colors.danger }]} />
          </View>
        ))}
      </View>
      <View style={styles.chartLabels}>
        {data.map((d, i) => (
          <View key={d.label + i} style={styles.chartLabelCol}>
            {(last - i) % labelEvery === 0 ? (
              <Text style={styles.chartLabel} numberOfLines={1}>{d.label}</Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function Stat({ value, label, onPress }: { value: number | string; label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.col, pressed && { opacity: 0.5 }]} onPress={onPress}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.xl },
  greet: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  propBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, alignSelf: 'flex-start', maxWidth: '100%' },
  propText: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.4, flexShrink: 1 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center',
  },
  dot: {
    position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.danger, borderWidth: 1.5, borderColor: colors.surface,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontWeight: '700', fontSize: 14 },

  // Cards — flat, hairline border, no shadow
  card: {
    backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl,
    borderWidth: 1, borderColor: colors.divider,
  },
  list: { padding: 0, overflow: 'hidden' },
  sep: { borderTopWidth: 1, borderTopColor: colors.divider },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hr: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.lg },
  row: { flexDirection: 'row' },
  col: { flex: 1, minWidth: 0 },

  label: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  hero: { fontSize: 34, fontWeight: '700', color: colors.ink, letterSpacing: -1, marginTop: 4 },
  big: { fontSize: 26, fontWeight: '700', color: colors.ink, letterSpacing: -0.6, marginTop: 4 },
  sub: { fontSize: 12, color: colors.muted, marginTop: 10 },
  link: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  growth: { fontSize: 13, fontWeight: '600' },
  amount: { fontSize: 14, fontWeight: '600', color: colors.ink },

  metricLabel: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  metricValue: { fontSize: 15, fontWeight: '600', color: colors.ink, marginTop: 3 },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.ink, letterSpacing: -0.4, marginBottom: 2 },

  // Revenue vs expenses chart
  floorMeta: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  chartTotal: { fontSize: 20, fontWeight: '700', color: colors.ink, letterSpacing: -0.4, marginTop: 4 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: colors.divider },
  chartCol: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2 },
  chartBar: { width: 7, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  chartLabels: { flexDirection: 'row', marginTop: 6, height: 16 },
  chartLabelCol: { flex: 1 },
  // Absolutely centred under its column so it isn't clipped to the column width
  chartLabel: {
    position: 'absolute', width: 56, left: '50%', marginLeft: -28,
    textAlign: 'center', fontSize: 10, color: colors.muted, fontWeight: '500',
  },

  // Income & expenses pie
  toggle: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: radius.pill, padding: 3 },
  toggleItem: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  toggleItemActive: { backgroundColor: colors.surface },
  toggleText: { fontSize: 12, fontWeight: '500', color: colors.muted },
  toggleTextActive: { color: colors.ink, fontWeight: '600' },
  pieRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl, marginTop: spacing.xl },
  pieNet: { fontSize: 16, fontWeight: '700', marginTop: 2, maxWidth: 84 },
  pieLegend: { flex: 1, minWidth: 0, gap: 10 },
  pieItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pieItemExpense: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 10 },
  pieLabel: { flex: 1, fontSize: 13, color: colors.textSecondary },
  pieValue: { fontSize: 13, fontWeight: '600', color: colors.ink },
  pieEmpty: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: spacing.lg },
});
