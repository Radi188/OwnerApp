import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { reportsApi } from '../services/api';
import DateRangeSheet, { DateRange } from '../components/DateRangeSheet';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportType =
  | 'financial'
  | 'monthly'
  | 'occupancy'
  | 'maintenance'
  | 'invoices'
  | 'tenants'
  | 'payments';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function ymToISO(ym: string, lastDay = false): string {
  const [y, m] = ym.split('-').map(Number);
  if (lastDay) {
    return new Date(y, m, 0).toISOString().split('T')[0];
  }
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

function displayDate(iso: string): string {
  const [yr, mo, dy] = iso.split('-');
  return `${dy}/${mo}/${yr}`;
}

function defaultRange(): DateRange {
  const now  = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const ym   = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  return { fromYM: ym, toYM: ym, label: 'Last Month' };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReportHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[hdr.container, { paddingTop: insets.top + 14 }]}>
      <TouchableOpacity onPress={onBack} style={hdr.backBtn} activeOpacity={0.7}>
        <Icon name="chevron-back" size={22} color="#374151" />
      </TouchableOpacity>
      <Text style={hdr.title}>{title}</Text>
      <View style={hdr.placeholder} />
    </View>
  );
}

function StatCard({
  icon, iconColor, iconBg, label, value, sub,
}: {
  icon: string; iconColor: string; iconBg: string;
  label: string; value: string; sub?: string;
}) {
  return (
    <View style={s.statCard}>
      <View style={[s.statIcon, { backgroundColor: iconBg }]}>
        <Icon name={icon} size={18} color={iconColor} />
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {!!sub && <Text style={s.statSub}>{sub}</Text>}
    </View>
  );
}

function SectionTitle({ label }: { label: string }) {
  return <Text style={s.sectionTitle}>{label}</Text>;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ReportScreen() {
  const navigation = useNavigation<any>();
  const { t }      = useTranslation();

  const [reportType,   setReportType]   = useState<ReportType>('financial');
  const [dateRange,    setDateRange]    = useState<DateRange>(() => defaultRange());
  const [sheetVisible, setSheetVisible] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [data,         setData]         = useState<any>(null);

  const fmtMoney = (n: number) =>
    n >= 1_000_000
      ? (n / 1_000_000).toFixed(1) + 'M ៛'
      : (n ?? 0).toLocaleString() + ' ៛';

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchReport = useCallback(async (type: ReportType, range: DateRange) => {
    setLoading(true);
    setData(null);
    try {
      const { fromYM, toYM } = range;
      const from = ymToISO(fromYM);
      const to   = ymToISO(toYM, true);
      let res: any = null;
      switch (type) {
        case 'financial':
          res = await reportsApi.financialSummary(from, to).catch(() => null);
          break;
        case 'monthly':
          res = await reportsApi.monthlySummary(fromYM, toYM).catch(() => null);
          break;
        case 'occupancy': {
          const [summary, trend] = await Promise.all([
            reportsApi.occupancySummary().catch(() => null),
            reportsApi.occupancyTrend(fromYM, toYM).catch(() => null),
          ]);
          res = {
            summary: summary?.data ?? summary ?? null,
            trend:   trend?.data   ?? trend   ?? null,
          };
          setData(res);
          return; // skip generic setData below; finally still runs
        }
        case 'maintenance':
          res = await reportsApi.maintenanceSummary().catch(() => null);
          break;
        case 'invoices': {
          const [unpaid, cats] = await Promise.all([
            reportsApi.unpaidInvoices().catch(() => null),
            reportsApi.categoryBreakdown().catch(() => null),
          ]);
          res = {
            total:      unpaid?.data?.total   ?? unpaid?.total   ?? 0,
            buckets:    unpaid?.data?.buckets ?? unpaid?.buckets ?? {},
            categories: cats?.data ?? cats ?? null,
          };
          setData(res);
          return; // skip generic setData below; finally still runs
        }
        case 'tenants':
          res = await reportsApi.tenantBalances().catch(() => null);
          break;
        case 'payments':
          res = await reportsApi.paymentMethods().catch(() => null);
          break;
      }
      setData(res?.data ?? res ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport(reportType, dateRange);
  }, [fetchReport, reportType, dateRange]);

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const REPORT_TABS: { key: ReportType; label: string; icon: string }[] = [
    { key: 'financial',   label: t('report.financial'),   icon: 'cash-outline' },
    { key: 'monthly',     label: t('report.monthly'),     icon: 'bar-chart-outline' },
    { key: 'occupancy',   label: t('report.occupancy'),   icon: 'home-outline' },
    { key: 'maintenance', label: t('report.maintenance'), icon: 'construct-outline' },
    { key: 'invoices',    label: t('report.invoices'),    icon: 'receipt-outline' },
    { key: 'tenants',     label: t('report.tenants'),     icon: 'people-outline' },
    { key: 'payments',    label: t('report.payments'),    icon: 'card-outline' },
  ];

  // ── Render content ────────────────────────────────────────────────────────

  function renderContent() {
    if (loading) {
      return <ActivityIndicator color="#6366F1" style={{ marginTop: 40 }} />;
    }
    if (!data) {
      return (
        <View style={s.emptyBox}>
          <Icon name="bar-chart-outline" size={36} color="#D1D5DB" />
          <Text style={s.emptyText}>{t('report.noData')}</Text>
        </View>
      );
    }

    // ── Financial Summary ─────────────────────────────────────────────────
    if (reportType === 'financial') {
      const sum = data.summary ?? data;
      if (sum?.totalRevenue == null && sum?.totalIncome == null) {
        return renderEmpty();
      }
      const revenue  = sum.totalRevenue  ?? sum.totalIncome  ?? 0;
      const expenses = sum.totalExpenses ?? sum.totalCost    ?? 0;
      const net      = sum.netProfit     ?? sum.netIncome    ?? (revenue - expenses);
      const invoiceIncome = sum.invoiceIncome ?? sum.rentalIncome ?? 0;
      return (
        <>
          <View style={s.statsGrid}>
            <StatCard icon="cash"          iconColor="#16A34A" iconBg="#F0FDF4" label={t('report.totalRevenue')}   value={fmtMoney(revenue)}       />
            <StatCard icon="receipt"       iconColor="#2563EB" iconBg="#DBEAFE" label={t('report.invoiceIncome')}  value={fmtMoney(invoiceIncome)}  />
            <StatCard icon="trending-down" iconColor="#DC2626" iconBg="#FEF2F2" label={t('report.totalExpenses')}  value={fmtMoney(expenses)}       />
            <StatCard icon="stats-chart"   iconColor="#6366F1" iconBg="#EEF2FF" label={t('report.netProfit')}      value={fmtMoney(net)}            />
          </View>
          {renderBalanceRows(sum)}
        </>
      );
    }

    // ── Monthly Summary ───────────────────────────────────────────────────
    // Response: { period:{start,end}, invoiceIncome, manualIncome, totalRevenue, totalExpenses, profit }
    if (reportType === 'monthly') {
      if (data.totalRevenue == null && data.profit == null) return renderEmpty();
      const invoiceIncome = data.invoiceIncome  ?? 0;
      const manualIncome  = data.manualIncome   ?? 0;
      const totalRevenue  = data.totalRevenue   ?? 0;
      const totalExpenses = data.totalExpenses  ?? 0;
      const profit        = data.profit         ?? (totalRevenue - totalExpenses);
      const periodStart   = data.period?.start;
      const periodEnd     = data.period?.end;
      return (
        <>
          {/* Period badge */}
          {periodStart && periodEnd && (
            <View style={s.periodBadge}>
              <Icon name="calendar-outline" size={13} color="#6366F1" />
              <Text style={s.periodBadgeText}>
                {displayDate(periodStart)} – {displayDate(periodEnd)}
              </Text>
            </View>
          )}

          {/* Stats */}
          <View style={s.statsGrid}>
            <StatCard icon="cash"          iconColor="#16A34A" iconBg="#F0FDF4" label={t('report.totalRevenue')}  value={fmtMoney(totalRevenue)}  />
            <StatCard icon="stats-chart"   iconColor="#6366F1" iconBg="#EEF2FF" label={t('report.netProfit')}     value={fmtMoney(profit)}        />
            <StatCard icon="trending-down" iconColor="#DC2626" iconBg="#FEF2F2" label={t('report.totalExpenses')} value={fmtMoney(totalExpenses)} />
            <StatCard icon="receipt"       iconColor="#2563EB" iconBg="#DBEAFE" label={t('report.invoiceIncome')} value={fmtMoney(invoiceIncome)} />
          </View>

          {/* Income breakdown */}
          <View style={s.card}>
            <View style={s.summaryRow}>
              <View style={s.summaryLabelWrap}>
                <View style={[s.summaryDot, { backgroundColor: '#2563EB' }]} />
                <Text style={s.summaryLabel}>{t('report.invoiceIncome')}</Text>
              </View>
              <Text style={[s.summaryVal, { color: '#2563EB' }]}>{fmtMoney(invoiceIncome)}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.summaryRow}>
              <View style={s.summaryLabelWrap}>
                <View style={[s.summaryDot, { backgroundColor: '#10B981' }]} />
                <Text style={s.summaryLabel}>{t('report.manualIncome')}</Text>
              </View>
              <Text style={[s.summaryVal, { color: '#10B981' }]}>{fmtMoney(manualIncome)}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.summaryRow}>
              <View style={s.summaryLabelWrap}>
                <View style={[s.summaryDot, { backgroundColor: '#DC2626' }]} />
                <Text style={s.summaryLabel}>{t('report.totalExpenses')}</Text>
              </View>
              <Text style={[s.summaryVal, { color: '#DC2626' }]}>-{fmtMoney(totalExpenses)}</Text>
            </View>
            <View style={[s.divider, { backgroundColor: '#E5E7EB', height: 1 }]} />
            <View style={[s.summaryRow, { backgroundColor: profit >= 0 ? '#F0FDF4' : '#FEF2F2', borderRadius: 10, margin: 8 }]}>
              <Text style={[s.summaryLabel, { fontWeight: '700', color: '#111827' }]}>{t('report.netProfit')}</Text>
              <Text style={[s.summaryVal, { color: profit >= 0 ? '#16A34A' : '#DC2626' }]}>{fmtMoney(profit)}</Text>
            </View>
          </View>
        </>
      );
    }

    // ── Occupancy ─────────────────────────────────────────────────────────
    if (reportType === 'occupancy') {
      const occ   = data.summary ?? data.occupancy ?? data;
      const trend: any[] = data.trend?.months ?? data.trend?.data ?? (Array.isArray(data.trend) ? data.trend : []);
      if (occ?.total == null && occ?.totalUnits == null) return renderEmpty();
      const total    = occ.total    ?? occ.totalUnits   ?? 0;
      const occupied = occ.occupied ?? occ.occupiedUnits ?? 0;
      const vacant   = total - occupied;
      const rateRaw  = occ.rate ?? occ.occupancyRate ?? (total > 0 ? Math.round((occupied / total) * 100) + '%' : '0%');
      const ratePct  = parseFloat(String(rateRaw)) || 0;
      return (
        <>
          <View style={s.statsGrid}>
            <StatCard icon="home"         iconColor="#6366F1" iconBg="#EEF2FF" label={t('report.totalUnits')}   value={String(total)}    />
            <StatCard icon="person"       iconColor="#16A34A" iconBg="#F0FDF4" label={t('report.occupied')}     value={String(occupied)} />
            <StatCard icon="home-outline" iconColor="#9CA3AF" iconBg="#F3F4F6" label={t('report.vacant')}       value={String(vacant)}   />
            <StatCard icon="pie-chart"    iconColor="#CA8A04" iconBg="#FEF9C3" label={t('report.occupancyRate')} value={String(rateRaw)}  />
          </View>
          <View style={[s.card, { padding: 16 }]}>
            <View style={s.progressLabelRow}>
              <Text style={s.progressLabel}>{t('report.occupancyRate')}</Text>
              <Text style={s.progressValue}>{rateRaw}</Text>
            </View>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${Math.min(ratePct, 100)}%` }]} />
            </View>
          </View>
          {trend.length > 0 && (
            <>
              <SectionTitle label={t('report.occupancyTrend')} />
              <View style={s.card}>
                {trend.map((row: any, i: number) => {
                  const tRate = parseFloat(row.rate ?? row.occupancyRate ?? '0') || 0;
                  return (
                    <View key={row.month ?? i}>
                      <View style={s.trendRow}>
                        <Text style={s.trendMonth}>{row.month ?? row.period ?? `#${i + 1}`}</Text>
                        <View style={s.trendBarWrap}>
                          <View style={[s.trendBar, { width: `${Math.min(tRate, 100)}%` }]} />
                        </View>
                        <Text style={s.trendRate}>{row.rate ?? row.occupancyRate ?? `${tRate}%`}</Text>
                      </View>
                      {i < trend.length - 1 && <View style={s.divider} />}
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </>
      );
    }

    // ── Maintenance Summary ───────────────────────────────────────────────
    // Response: { period:{start,end}, statusCounts:{pending,assigned,in_progress,completed,cancelled}, totalCost, billableCost }
    if (reportType === 'maintenance') {
      const sc           = data.statusCounts ?? {};
      const totalCost    = data.totalCost    ?? 0;
      const billableCost = data.billableCost ?? 0;
      const periodStart  = data.period?.start;
      const periodEnd    = data.period?.end;
      const total = Object.values(sc).reduce((s: number, v) => s + (v as number), 0);
      const pending    = sc.pending    ?? 0;
      const assigned   = sc.assigned   ?? 0;
      const inProgress = sc.in_progress ?? 0;
      const completed  = sc.completed  ?? 0;
      const cancelled  = sc.cancelled  ?? 0;
      return (
        <>
          {periodStart && periodEnd && (
            <View style={s.periodBadge}>
              <Icon name="calendar-outline" size={13} color="#6366F1" />
              <Text style={s.periodBadgeText}>
                {displayDate(periodStart)} – {displayDate(periodEnd)}
              </Text>
            </View>
          )}

          <View style={s.statsGrid}>
            <StatCard icon="list-outline"             iconColor="#6366F1" iconBg="#EEF2FF" label={t('report.totalRequests')} value={String(total)}      />
            <StatCard icon="time-outline"             iconColor="#D97706" iconBg="#FEF9C3" label={t('report.pending')}       value={String(pending)}    />
            <StatCard icon="sync-outline"             iconColor="#2563EB" iconBg="#DBEAFE" label={t('report.inProgress')}    value={String(inProgress)} />
            <StatCard icon="checkmark-circle-outline" iconColor="#16A34A" iconBg="#F0FDF4" label={t('report.completed')}     value={String(completed)}  />
          </View>

          {/* Status breakdown */}
          <View style={s.card}>
            {[
              { label: t('report.pending'),    count: pending,    color: '#D97706', bg: '#FEF9C3' },
              { label: t('report.assigned'),   count: assigned,   color: '#6366F1', bg: '#EEF2FF' },
              { label: t('report.inProgress'), count: inProgress, color: '#2563EB', bg: '#DBEAFE' },
              { label: t('report.completed'),  count: completed,  color: '#16A34A', bg: '#F0FDF4' },
              { label: t('report.cancelled'),  count: cancelled,  color: '#9CA3AF', bg: '#F3F4F6' },
            ].map((row, i, arr) => (
              <View key={row.label}>
                <View style={s.statusRow}>
                  <View style={[s.statusBadge, { backgroundColor: row.bg }]}>
                    <Text style={[s.statusBadgeText, { color: row.color }]}>{row.label}</Text>
                  </View>
                  <View style={s.statusBarWrap}>
                    <View style={[
                      s.statusBar,
                      { width: total > 0 ? `${Math.round((row.count / total) * 100)}%` : '0%', backgroundColor: row.color },
                    ]} />
                  </View>
                  <Text style={[s.statusCount, { color: row.color }]}>{row.count}</Text>
                </View>
                {i < arr.length - 1 && <View style={s.divider} />}
              </View>
            ))}
          </View>

          {/* Cost summary */}
          <View style={s.card}>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>{t('report.totalCost')}</Text>
              <Text style={[s.summaryVal, { color: totalCost > 0 ? '#DC2626' : '#9CA3AF' }]}>{fmtMoney(totalCost)}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>{t('report.billableCost')}</Text>
              <Text style={[s.summaryVal, { color: billableCost > 0 ? '#D97706' : '#9CA3AF' }]}>{fmtMoney(billableCost)}</Text>
            </View>
          </View>
        </>
      );
    }

    // ── Invoices / Unpaid ─────────────────────────────────────────────────
    // Response: { total: 405, buckets: { current, "1-30", "31-60", "61-90", "91+" } }
    if (reportType === 'invoices') {
      const totalUnpaid = data.total ?? 0;
      const buckets     = data.buckets ?? {};
      const bucketDefs = [
        { key: 'current', label: 'Current',  color: '#6366F1', bg: '#EEF2FF' },
        { key: '1-30',    label: '1–30 days', color: '#D97706', bg: '#FEF9C3' },
        { key: '31-60',   label: '31–60 days', color: '#F59E0B', bg: '#FFFBEB' },
        { key: '61-90',   label: '61–90 days', color: '#EF4444', bg: '#FEF2F2' },
        { key: '91+',     label: '91+ days',  color: '#DC2626', bg: '#FEF2F2' },
      ];
      const hasAnyBucket = Object.values(buckets).some((v) => (v as number) > 0);
      return (
        <>
          {/* Total unpaid hero card */}
          <View style={s.heroCard}>
            <View style={s.heroIconWrap}>
              <Icon name="alert-circle" size={28} color="#DC2626" />
            </View>
            <Text style={s.heroLabel}>{t('report.unpaidAmount')}</Text>
            <Text style={s.heroValue}>{fmtMoney(totalUnpaid)}</Text>
          </View>

          {/* Aging buckets */}
          <SectionTitle label={t('report.agingBuckets')} />
          <View style={s.card}>
            {bucketDefs.map((b, i) => {
              const val = buckets[b.key] ?? 0;
              const pct = totalUnpaid > 0 ? Math.round((val / totalUnpaid) * 100) : 0;
              return (
                <View key={b.key}>
                  <View style={s.bucketRow}>
                    <View style={[s.bucketBadge, { backgroundColor: b.bg }]}>
                      <Text style={[s.bucketBadgeText, { color: b.color }]}>{b.label}</Text>
                    </View>
                    <View style={s.bucketBarWrap}>
                      <View style={[s.bucketBar, { width: `${pct}%`, backgroundColor: b.color }]} />
                    </View>
                    <Text style={[s.bucketAmt, { color: val > 0 ? b.color : '#D1D5DB' }]}>
                      {fmtMoney(val)}
                    </Text>
                  </View>
                  {i < bucketDefs.length - 1 && <View style={s.divider} />}
                </View>
              );
            })}
          </View>

          {!hasAnyBucket && totalUnpaid === 0 && (
            <View style={s.allClearBox}>
              <Icon name="checkmark-circle" size={40} color="#10B981" />
              <Text style={s.allClearText}>All invoices are paid!</Text>
            </View>
          )}
        </>
      );
    }

    // ── Tenant Balances ───────────────────────────────────────────────────
    if (reportType === 'tenants') {
      const tenants: any[] = data.tenants ?? data.data ?? (Array.isArray(data) ? data : []);
      if (!tenants.length) return renderEmpty();
      const totalOwed = tenants.reduce((s: number, t: any) => s + (t.balance ?? t.outstanding ?? t.owedAmount ?? 0), 0);
      return (
        <>
          <View style={s.statsGrid}>
            <StatCard icon="people"     iconColor="#6366F1" iconBg="#EEF2FF" label={t('report.totalTenants')}  value={String(tenants.length)} />
            <StatCard icon="cash-outline" iconColor="#DC2626" iconBg="#FEF2F2" label={t('report.totalOwed')}   value={fmtMoney(totalOwed)}    />
          </View>
          <SectionTitle label={t('report.tenantBalances')} />
          <View style={s.card}>
            {tenants.map((tenant: any, i: number) => {
              const balance = tenant.balance ?? tenant.outstanding ?? tenant.owedAmount ?? 0;
              return (
                <View key={tenant.id ?? i}>
                  <View style={s.listRow}>
                    <View style={s.tenantAvatar}>
                      <Text style={s.tenantAvatarText}>
                        {(tenant.name ?? tenant.tenantName ?? '?').substring(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.listTitle} numberOfLines={1}>{tenant.name ?? tenant.tenantName ?? `Tenant #${tenant.id}`}</Text>
                      <Text style={s.listMeta}>{tenant.unit?.unitCode ? `Unit ${tenant.unit.unitCode}` : (tenant.unitCode ?? '')}</Text>
                    </View>
                    <Text style={[s.summaryVal, { color: balance > 0 ? '#DC2626' : '#16A34A', fontSize: 13 }]}>
                      {balance > 0 ? fmtMoney(balance) : '✓'}
                    </Text>
                  </View>
                  {i < tenants.length - 1 && <View style={s.divider} />}
                </View>
              );
            })}
          </View>
        </>
      );
    }

    // ── Payment Methods / Balance ─────────────────────────────────────────
    // Response: { cash: 255, bank_transfer: 50 }  (flat key→amount object)
    if (reportType === 'payments') {
      // Convert flat object { cash: 255, bank_transfer: 50 } → array
      const methods = Object.entries(data)
        .filter(([, v]) => typeof v === 'number')
        .map(([key, amount]) => ({ key, amount: amount as number }));

      if (!methods.length) return renderEmpty();
      const grandTotal = methods.reduce((s, m) => s + m.amount, 0);

      return (
        <>
          {/* Hero total */}
          <View style={s.heroCard}>
            <View style={[s.heroIconWrap, { backgroundColor: '#EEF2FF' }]}>
              <Icon name="card" size={28} color="#6366F1" />
            </View>
            <Text style={s.heroLabel}>{t('report.totalCollected')}</Text>
            <Text style={[s.heroValue, { color: '#6366F1' }]}>{fmtMoney(grandTotal)}</Text>
          </View>

          <SectionTitle label={t('report.paymentMethods')} />
          <View style={s.card}>
            {methods.map((pm, i) => {
              const pct = grandTotal > 0 ? Math.round((pm.amount / grandTotal) * 100) : 0;
              const label = pm.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              return (
                <View key={pm.key}>
                  <View style={s.pmRow}>
                    <View style={s.pmLeft}>
                      <View style={[s.pmIconWrap, { backgroundColor: PM_COLORS[i % PM_COLORS.length].bg }]}>
                        <Icon name={pmIcon(pm.key)} size={18} color={PM_COLORS[i % PM_COLORS.length].fg} />
                      </View>
                      <Text style={s.pmName}>{label}</Text>
                    </View>
                    <View style={s.pmRight}>
                      <Text style={s.pmAmount}>{fmtMoney(pm.amount)}</Text>
                      <Text style={s.pmPct}>{pct}%</Text>
                    </View>
                  </View>
                  <View style={s.pmBarWrap}>
                    <View style={[s.pmBar, { width: `${pct}%`, backgroundColor: PM_COLORS[i % PM_COLORS.length].fg }]} />
                  </View>
                  {i < methods.length - 1 && <View style={s.divider} />}
                </View>
              );
            })}
          </View>
        </>
      );
    }

    return null;
  }

  function renderEmpty() {
    return (
      <View style={s.emptyBox}>
        <Icon name="bar-chart-outline" size={36} color="#D1D5DB" />
        <Text style={s.emptyText}>{t('report.noData')}</Text>
      </View>
    );
  }

  function renderBalanceRows(sum: any) {
    const rows = [
      { label: t('report.maintenanceCost'), value: sum.maintenanceCost ?? sum.maintenanceExpenses, color: '#DC2626' },
      { label: t('report.collectedAmount'), value: sum.collectedAmount ?? sum.collected,           color: '#16A34A' },
      { label: t('report.pendingAmount'),   value: sum.pendingAmount   ?? sum.pending,             color: '#D97706' },
    ].filter(r => r.value != null);
    if (!rows.length) return null;
    return (
      <View style={s.card}>
        {rows.map((r, i) => (
          <View key={r.label}>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>{r.label}</Text>
              <Text style={[s.summaryVal, { color: r.color }]}>{fmtMoney(r.value)}</Text>
            </View>
            {i < rows.length - 1 && <View style={s.divider} />}
          </View>
        ))}
      </View>
    );
  }

  const needsDateFilter = reportType === 'financial' || reportType === 'monthly' || reportType === 'occupancy';

  return (
    <SafeAreaView style={s.container} edges={[]}>
      <ReportHeader title={t('report.title')} onBack={() => navigation.goBack()} />

      {/* Report type tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabsScroll}
        contentContainerStyle={s.tabsContent}
      >
        {REPORT_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tab, reportType === tab.key && s.tabActive]}
            onPress={() => setReportType(tab.key)}
            activeOpacity={0.7}
          >
            <Icon
              name={tab.icon}
              size={13}
              color={reportType === tab.key ? '#FFFFFF' : '#6B7280'}
              style={{ marginRight: 4 }}
            />
            <Text style={[s.tabText, reportType === tab.key && s.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Period trigger button */}
        {needsDateFilter && (
          <TouchableOpacity
            style={s.periodBtn}
            activeOpacity={0.75}
            onPress={() => setSheetVisible(true)}
          >
            <View style={s.periodLeft}>
              <View style={s.periodIconWrap}>
                <Icon name="calendar" size={16} color="#6366F1" />
              </View>
              <View>
                <Text style={s.periodSmall}>{t('report.period')}</Text>
                <Text style={s.periodLabel}>{dateRange.label}</Text>
              </View>
            </View>
            <View style={s.periodRight}>
              <Text style={s.periodRange}>
                {dateRange.fromYM === dateRange.toYM
                  ? dateRange.fromYM
                  : `${dateRange.fromYM}  →  ${dateRange.toYM}`}
              </Text>
              <Icon name="chevron-forward" size={16} color="#6366F1" />
            </View>
          </TouchableOpacity>
        )}

        {renderContent()}
      </ScrollView>

      <DateRangeSheet
        visible={sheetVisible}
        value={dateRange}
        onApply={(range) => { setDateRange(range); }}
        onClose={() => setSheetVisible(false)}
      />
    </SafeAreaView>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CAT_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899'];
const PM_COLORS  = [
  { fg: '#16A34A', bg: '#F0FDF4' },
  { fg: '#2563EB', bg: '#DBEAFE' },
  { fg: '#6366F1', bg: '#EEF2FF' },
  { fg: '#D97706', bg: '#FEF9C3' },
  { fg: '#EC4899', bg: '#FDF2F8' },
];

function pmIcon(method?: string): string {
  const m = (method ?? '').toLowerCase();
  if (m.includes('cash'))   return 'cash-outline';
  if (m.includes('card') || m.includes('credit') || m.includes('debit')) return 'card-outline';
  if (m.includes('bank') || m.includes('transfer')) return 'business-outline';
  if (m.includes('aba') || m.includes('acleda') || m.includes('wing')) return 'phone-portrait-outline';
  return 'wallet-outline';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const hdr = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 4,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  title:       { fontSize: 17, fontWeight: '700', color: '#111827', letterSpacing: -0.3 },
  placeholder: { width: 40 },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scroll:    { flex: 1 },
  content:   { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 16 },

  // Tabs
  tabsScroll:   { backgroundColor: '#FFFFFF', maxHeight: 52 },
  tabsContent:  { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row', alignItems: 'center' },
  tab: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  tabActive:     { backgroundColor: '#6366F1' },
  tabText:       { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  tabTextActive: { color: '#FFFFFF' },

  // Period trigger button
  periodBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    borderWidth: 1.5, borderColor: '#E0E7FF',
  },
  periodLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  periodIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
  },
  periodSmall: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', marginBottom: 2 },
  periodLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  periodRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  periodRange: { fontSize: 12, fontWeight: '600', color: '#6366F1' },

  // Stats grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    width: '47%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  statIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  statValue: { fontSize: 20, fontWeight: '700', color: '#111827', letterSpacing: -0.5 },
  statLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginTop: 2 },
  statSub:   { fontSize: 11, color: '#9CA3AF', marginTop: 2 },

  // Section title
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', letterSpacing: -0.2 },

  // Card
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#F3F4F6', marginHorizontal: 16 },

  // List rows
  listRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  listTitle: { fontSize: 13, fontWeight: '600', color: '#111827' },
  listMeta:  { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  pill:     { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, flexShrink: 0 },
  pillText: { fontSize: 11, fontWeight: '700' },

  catDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },

  // Monthly rows
  monthRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  monthLeft:    { gap: 2 },
  monthRight:   { alignItems: 'flex-end', gap: 2 },
  monthLabel:   { fontSize: 14, fontWeight: '700', color: '#111827' },
  monthSub:     { fontSize: 11, color: '#9CA3AF' },
  monthIncome:  { fontSize: 14, fontWeight: '700', color: '#16A34A' },
  monthExpense: { fontSize: 11, color: '#DC2626' },

  // Occupancy trend
  trendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  trendMonth:   { fontSize: 12, fontWeight: '600', color: '#374151', width: 56 },
  trendBarWrap: { flex: 1, height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  trendBar:     { height: 8, backgroundColor: '#6366F1', borderRadius: 4 },
  trendRate:    { fontSize: 12, fontWeight: '700', color: '#6366F1', width: 40, textAlign: 'right' },

  // Tenant balances
  tenantAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center',
  },
  tenantAvatarText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  // Payment methods
  pmRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
  },
  pmLeft:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pmRight:   { alignItems: 'flex-end' },
  pmName:    { fontSize: 13, fontWeight: '600', color: '#111827' },
  pmCount:   { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  pmAmount:  { fontSize: 14, fontWeight: '700', color: '#111827' },
  pmPct:     { fontSize: 11, color: '#6366F1', fontWeight: '600' },
  pmBarWrap: { marginHorizontal: 16, height: 5, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
  pmBar:     { height: 5, backgroundColor: '#6366F1', borderRadius: 3 },

  // Alert banner
  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12,
  },
  alertText: { fontSize: 13, color: '#DC2626', fontWeight: '600', flex: 1 },

  // Occupancy progress
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressLabel:    { fontSize: 13, fontWeight: '600', color: '#374151' },
  progressValue:    { fontSize: 13, fontWeight: '700', color: '#6366F1' },
  progressTrack:    { height: 10, backgroundColor: '#F3F4F6', borderRadius: 6, overflow: 'hidden' },
  progressFill:     { height: 10, backgroundColor: '#6366F1', borderRadius: 6 },

  // Summary rows
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  summaryLabel: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  summaryVal:   { fontSize: 15, fontWeight: '700' },

  // Period badge (inside content)
  periodBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EEF2FF', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start',
  },
  periodBadgeText: { fontSize: 12, fontWeight: '600', color: '#6366F1' },

  // Hero card (big centered stat)
  heroCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24,
    alignItems: 'center', gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  heroIconWrap: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  heroLabel: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  heroValue: { fontSize: 32, fontWeight: '800', color: '#DC2626', letterSpacing: -1 },

  // Summary label with dot
  summaryLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryDot:       { width: 8, height: 8, borderRadius: 4 },

  // Status rows (maintenance)
  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  statusBadge:     { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, minWidth: 90, alignItems: 'center' },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  statusBarWrap:   { flex: 1, height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  statusBar:       { height: 6, borderRadius: 3 },
  statusCount:     { fontSize: 14, fontWeight: '800', width: 28, textAlign: 'right' },

  // Bucket rows (invoices aging)
  bucketRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  bucketBadge:     { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, minWidth: 90, alignItems: 'center' },
  bucketBadgeText: { fontSize: 12, fontWeight: '700' },
  bucketBarWrap:   { flex: 1, height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  bucketBar:       { height: 6, borderRadius: 3 },
  bucketAmt:       { fontSize: 13, fontWeight: '700', width: 72, textAlign: 'right' },

  // All-clear box
  allClearBox:  { alignItems: 'center', paddingVertical: 40, gap: 10 },
  allClearText: { fontSize: 15, fontWeight: '700', color: '#10B981' },

  // Payment method icon wrap
  pmIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  // Empty
  emptyBox:  { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 13, color: '#9CA3AF' },
});
