import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { dayLabel, monthLabel, monthsShort } from '../../i18n';
import Segments from '../../components/Segments';
import {
  formOptionsApi, invoicesApi, paymentsApi, pickList, unitsApi, utilityApi,
  type GroupedMeterReading, type GroupedReadingRow, type MeterType,
} from '../../services/api';
import { PaymentsView } from './PaymentsScreen';
import { activeContract } from '../units/UnitsScreen';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { confirmAction, EmptyState, ErrorView, FilterChips, LoadingView, ProgressBar, Screen, SearchBar, Sheet } from '../../components/ui';
import { toast } from '../../components/Toast';
import { colors, radius, spacing, toneColors } from '../../theme';
import { errMsg, money, thisMonthYM, toNum } from '../../utils/format';
import {
  byNewest, editableMeters, hasLockedMeter, isRowBilled, METER, METER_TYPES, newestRowKeys, rowInvoice,
} from '../../utils/readings';

type Tab = 'invoices' | 'payments' | 'readings';
type InvoiceFilter = 'all' | 'unpaid' | 'overdue' | 'paid';

type PayState = 'paid' | 'partial' | 'unpaid' | 'cancelled';

/** "Who paid what" comes from the server's balance fields; fall back to `status` on older responses. */
function payState(i: any): PayState {
  if (i.paymentStatus) return i.paymentStatus;
  const s = String(i.status ?? '').toLowerCase();
  if (s === 'paid') return 'paid';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'partial') return 'partial';
  return 'unpaid';
}
const isOverdue = (i: any) => (i.isOverdue != null ? !!i.isOverdue : String(i.status).toLowerCase() === 'overdue');
const remainingOf = (i: any) => (i.remainingAmount != null ? toNum(i.remainingAmount) : payState(i) === 'paid' ? 0 : toNum(i.totalAmount));
const paidOf = (i: any) => (i.paidAmount != null ? toNum(i.paidAmount) : payState(i) === 'paid' ? toNum(i.totalAmount) : 0);
const PAY_TONE: Record<PayState, { fg: string; bg: string }> = {
  paid: toneColors.success, partial: toneColors.warning, unpaid: toneColors.danger, cancelled: toneColors.neutral,
};

const YM = /^\d{4}-\d{2}/;
/** The invoice's month: `billingMonth` when it is a real YYYY-MM(-DD), else the due / created date. */
const invoiceMonth = (i: any): string | undefined =>
  [i.billingMonth, i.dueDate, i.createdAt].map(v => String(v ?? '')).find(v => YM.test(v));

/** Group rows by "YYYY-MM", newest month first. */
function byMonth<T>(rows: T[], key: (r: T) => string | null | undefined): [string, T[]][] {
  const map = new Map<string, T[]>();
  rows.forEach(r => {
    const raw = String(key(r) ?? '');
    const k = YM.test(raw) ? raw.slice(0, 7) : '—';
    map.set(k, [...(map.get(k) ?? []), r]);
  });
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function BillingScreen() {
  const route = useRoute<any>();
  const [tab, setTab] = useState<Tab>(route.params?.tab ?? 'invoices');
  // e.g. a payment_pending notification opens Billing → Payments
  React.useEffect(() => { if (route.params?.tab) setTab(route.params.tab); }, [route.params?.tab]);
  if (tab === 'payments') {
    return <PaymentsView header={<BillingHeader tab={tab} onTab={setTab} />} tabBarSpace onChanged={pendingCountChanged} />;
  }
  return tab === 'invoices' ? <InvoicesTab tab={tab} onTab={setTab} /> : <ReadingsTab tab={tab} onTab={setTab} />;
}

// "To verify" badge on the Payments tab — shared so verifying in the tab updates it right away
const pendingListeners = new Set<() => void>();
const pendingCountChanged = () => pendingListeners.forEach(l => l());

function usePendingPayments(enabled: boolean): number {
  const { propertyId } = useAuth();
  const q = useApi(() => paymentsApi.pendingCount(), [propertyId], { enabled });
  React.useEffect(() => {
    pendingListeners.add(q.reload);
    return () => { pendingListeners.delete(q.reload); };
  }, [q.reload]);
  return q.data ?? 0;
}

function BillingHeader({ tab, onTab, subtitle }: { tab: Tab; onTab: (t: Tab) => void; subtitle?: string }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { propertyName, can } = useAuth();
  const canPayments = can('view', 'payment');
  const pending = usePendingPayments(canPayments);
  const tabs: Tab[] = canPayments ? ['invoices', 'payments', 'readings'] : ['invoices', 'readings'];
  const tabLabel = (k: Tab) => (k === 'invoices' ? t('billing.invoices') : k === 'payments' ? t('payments.title') : t('billing.readings'));
  const canAddReading = tab === 'readings' && can('create', 'utility reading');

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>{t('billing.title')}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle ?? propertyName ?? t('billing.allProperties')}</Text>
        </View>
        {canAddReading ? (
          <TouchableOpacity
            style={[styles.iconBtn, styles.addBtn]}
            onPress={() => nav.navigate('UtilityForm', {})}
            activeOpacity={0.7}
            accessibilityLabel={t('billing.recordReading')}
          >
            <Icon name="add" size={22} color={colors.white} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Underline tabs */}
      <View style={styles.tabs}>
        {tabs.map(k => {
          const active = tab === k;
          return (
            <Pressable key={k} onPress={() => onTab(k)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: active }}>
              <View style={styles.tabLabelRow}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tabLabel(k)}</Text>
                {k === 'payments' && pending > 0 ? (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{pending > 99 ? '99+' : pending}</Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.tabLine, active && styles.tabLineActive]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Invoices ────────────────────────────────────────────────────────────────

function InvoicesTab({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const { propertyId, propertyName } = useAuth();
  const [filter, setFilter] = useState<InvoiceFilter>('all');
  // Current property by default, like the Payments tab (FRONTEND_UPDATE §9); "All properties" is
  // one tap away and then every row shows its property name.
  const [scope, setScope] = useState<'all' | 'current'>('current');
  const props = useApi(async () => pickList<any>(await formOptionsApi.get(['properties']), 'properties'), [], { refetchOnFocus: false });
  const propertyCount = props.data?.length ?? 0;
  const multi = propertyCount > 1;
  const allScope = scope === 'all' && multi;
  const [month, setMonth] = useState<string | null>(null);
  const [monthSheet, setMonthSheet] = useState(false);
  const [q, setQ] = useState('');

  const { data, loading, error, refreshing, refresh } = useApi(
    // All pages — the list endpoint is paginated (`total` > first page when there are many invoices)
    async () => (await invoicesApi.listAll({ sort: '-createdAt', billingMonth: month ?? undefined, allProperties: allScope })).rows,
    [propertyId, month, allScope],
  );

  const all = useMemo(() => data ?? [], [data]);
  const inGroup = (i: any, f: InvoiceFilter) => {
    const ps = payState(i);
    if (f === 'all') return true;
    if (f === 'paid') return ps === 'paid';
    if (f === 'overdue') return ps !== 'cancelled' && isOverdue(i);
    return ps === 'unpaid' || ps === 'partial';
  };

  const totals = useMemo(() => {
    const live = all.filter(i => payState(i) !== 'cancelled');
    const outstanding = live.reduce((s, i) => s + remainingOf(i), 0);
    const collected = live.reduce((s, i) => s + paidOf(i), 0);
    const base = outstanding + collected;
    return { outstanding, collected, pct: base > 0 ? collected / base : 0 };
  }, [all]);

  const counts = useMemo(() => ({
    all: all.length,
    unpaid: all.filter(i => inGroup(i, 'unpaid')).length,
    overdue: all.filter(i => inGroup(i, 'overdue')).length,
    paid: all.filter(i => inGroup(i, 'paid')).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [all]);

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = all.filter(i =>
      inGroup(i, filter) &&
      (!s || [i.invoiceNumber, i.tenant?.name, i.unit?.unitCode].some(x => String(x ?? '').toLowerCase().includes(s))),
    );
    return byMonth(list, invoiceMonth);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, filter, q]);

  return (
    <Screen
      tabBarSpace
      refreshing={refreshing}
      onRefresh={refresh}
      header={<BillingHeader tab={tab} onTab={onTab} subtitle={allScope ? t('billing.allProperties') : undefined} />}
      contentStyle={{ paddingTop: spacing.md }}
    >
      {multi ? (
        <FilterChips<'all' | 'current'>
          value={scope}
          onChange={setScope}
          style={{ marginBottom: spacing.md }}
          options={[
            { label: propertyName ?? t('billing.thisProperty'), value: 'current' },
            { label: t('billing.allProperties'), value: 'all', count: propertyCount },
          ]}
        />
      ) : null}
      {/* Summary */}
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>{t('billing.outstanding')}</Text>
            <Text style={[styles.big, totals.outstanding > 0 && { color: colors.danger }]} numberOfLines={1} adjustsFontSizeToFit>
              {money(totals.outstanding, { decimals: 2 })}
            </Text>
          </View>
          <View style={[styles.col, { alignItems: 'flex-end' }]}>
            <Text style={styles.label}>{t('billing.collected')}</Text>
            <Text style={[styles.big, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit>
              {money(totals.collected, { decimals: 2 })}
            </Text>
          </View>
        </View>
        <View style={{ marginTop: 14 }}>
          <ProgressBar value={totals.pct} height={6} color={colors.success} />
        </View>
        <Text style={styles.sub}>
          {t('billing.collectedPct', { pct: Math.round(totals.pct * 100) })}  ·  {t('billing.invoiceCount', { count: all.length })}
          {month ? `  ·  ${monthLabel(month)}` : ''}
        </Text>
      </View>

      {/* Search + month */}
      <View style={styles.searchRow}>
        <View style={{ flex: 1 }}>
          <SearchBar value={q} onChangeText={setQ} placeholder={t('billing.searchInvoices')} style={styles.search} />
        </View>
        <TouchableOpacity
          style={[styles.monthBtn, month && styles.monthBtnActive]}
          onPress={() => setMonthSheet(true)}
          activeOpacity={0.7}
          accessibilityLabel={t('billing.selectMonth')}
        >
          <Icon name="calendar-outline" size={18} color={month ? colors.primary : colors.ink} />
          {month ? <Text style={styles.monthBtnText} numberOfLines={1}>{monthLabel(month)}</Text> : null}
        </TouchableOpacity>
      </View>

      <Segments<InvoiceFilter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('billing.all'), count: counts.all },
          { value: 'unpaid', label: t('billing.unpaid'), count: counts.unpaid },
          { value: 'overdue', label: t('billing.overdue'), count: counts.overdue },
          { value: 'paid', label: t('billing.paid'), count: counts.paid },
        ]}
      />

      {loading ? <LoadingView /> : error ? <ErrorView message={error} onRetry={refresh} /> : groups.length === 0 ? (
        <EmptyState icon="receipt-outline" title={t('billing.noInvoices')} message={q || filter !== 'all' ? t('billing.tryDifferent') : t('billing.noInvoicesHint')} />
      ) : groups.map(([ym, list]) => (
        <View key={ym}>
          <View style={styles.groupHead}>
            <Text style={styles.groupTitle}>{monthLabel(ym)}</Text>
            <Text style={styles.groupMeta}>{money(list.reduce((s, i) => s + toNum(i.totalAmount), 0))}</Text>
          </View>
          <View style={styles.listCard}>
            {list.map((inv, i) => {
              const ps = payState(inv);
              const overdue = ps !== 'cancelled' && ps !== 'paid' && isOverdue(inv);
              const left = remainingOf(inv);
              // One status pill carries the colour: part-paid shows what's left, otherwise the state
              const pill = ps === 'partial'
                ? { label: t('billing.left', { amount: money(left, { decimals: 2 }) }), tone: overdue ? toneColors.danger : toneColors.warning }
                : overdue
                  ? { label: t('status.overdue'), tone: toneColors.danger }
                  : { label: t(`invoiceView.ps.${ps}`), tone: PAY_TONE[ps] };
              const secondary = [
                t('billing.due', { date: dayLabel(inv.dueDate) }),
                allScope ? inv.unit?.property?.name : null,
              ].filter(Boolean).join('  ·  ');
              return (
                <Pressable
                  key={inv.id}
                  onPress={() => nav.navigate('InvoiceDetail', { invoiceId: inv.id })}
                  style={({ pressed }) => [styles.item, i > 0 && styles.sep, pressed && { backgroundColor: colors.surfaceAlt }]}
                  accessibilityLabel={`${inv.tenant?.name ?? ''}, ${money(inv.totalAmount, { decimals: 2 })}, ${pill.label}`}
                >
                  <View style={styles.tile}>
                    <Text style={styles.tileText} numberOfLines={1} adjustsFontSizeToFit>
                      {inv.unit?.unitCode ?? '—'}
                    </Text>
                  </View>
                  <View style={styles.itemBody}>
                    <View style={styles.itemLine}>
                      <Text style={styles.itemTitle} numberOfLines={1}>{inv.tenant?.name ?? t('billing.tenant')}</Text>
                      <Text style={[styles.amount, ps === 'cancelled' && styles.amountCancelled]}>
                        {money(inv.totalAmount, { decimals: 2 })}
                      </Text>
                    </View>
                    <View style={[styles.itemLine, { marginTop: 6 }]}>
                      <Text style={[styles.itemSub, overdue && { color: colors.danger }]} numberOfLines={1}>{secondary}</Text>
                      <View style={[styles.pill, { backgroundColor: pill.tone.bg }]}>
                        <Text style={[styles.pillText, { color: pill.tone.fg }]} numberOfLines={1}>{pill.label}</Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <MonthSheet
        visible={monthSheet}
        value={month}
        onClose={() => setMonthSheet(false)}
        onChange={v => { setMonth(v); setMonthSheet(false); }}
      />
    </Screen>
  );
}

function MonthSheet({ visible, value, onClose, onChange }: {
  visible: boolean; value: string | null; onClose: () => void; onChange: (v: string | null) => void;
}) {
  const { t } = useTranslation();
  const [year, setYear] = useState(() => (value ? parseInt(value.slice(0, 4), 10) : new Date().getFullYear()));
  const months = monthsShort();
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return (
    <Sheet visible={visible} onClose={onClose} title={t('billing.selectMonth')}>
      <View style={styles.yearRow}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setYear(y => y - 1)}>
          <Icon name="chevron-back" size={18} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.yearText}>{year}</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setYear(y => y + 1)}>
          <Icon name="chevron-forward" size={18} color={colors.ink} />
        </TouchableOpacity>
      </View>
      <View style={styles.monthGrid}>
        {months.map((m, i) => {
          const v = `${year}-${String(i + 1).padStart(2, '0')}`;
          const active = v === value;
          return (
            <TouchableOpacity
              key={v}
              style={[styles.monthCell, v === current && styles.monthCellNow, active && styles.monthCellActive]}
              onPress={() => onChange(v)}
              activeOpacity={0.7}
            >
              <Text style={[styles.monthCellText, active && { color: colors.white }]} numberOfLines={1} adjustsFontSizeToFit>{m}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity style={styles.allMonths} onPress={() => onChange(null)} activeOpacity={0.7}>
        <Text style={[styles.allMonthsText, !value && { color: colors.primary }]}>{t('billing.allMonths')}</Text>
        {!value ? <Icon name="checkmark" size={18} color={colors.primary} /> : null}
      </TouchableOpacity>
    </Sheet>
  );
}

// ─── Meter readings ──────────────────────────────────────────────────────────
// One card per room + reading date (`GET /utility-readings/grouped`), electricity and water side
// by side. Occupied rooms without a reading this month get a "Missing" card.

type ReadingView = 'all' | 'missing' | 'unbilled' | 'billed';

type ReadingCard = {
  key: string;
  unitId: number;
  code: string;
  floor?: string | null;
  tenant?: string;
  /** null → occupied room with no reading this month */
  row: GroupedReadingRow | null;
  /** This is the room's newest row (only that one can get a missing meter added) */
  newest: boolean;
};

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function usageTotals(rows: GroupedReadingRow[]) {
  return rows.reduce(
    (s, r) => ({ electricity: s.electricity + toNum(r.electricity?.usage), water: s.water + toNum(r.water?.usage) }),
    { electricity: 0, water: 0 },
  );
}

function ReadingsTab({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const { propertyId, can } = useAuth();
  const canRecord = can('create', 'utility reading');
  const canEdit = can('edit', 'utility reading');
  const canDelete = can('delete', 'utility reading');
  const [month, setMonth] = useState(thisMonthYM());
  const [view, setView] = useState<ReadingView>('all');
  const [q, setQ] = useState('');
  const isCurrentMonth = month >= thisMonthYM();

  const { data, loading, error, refreshing, refresh, reload } = useApi(async () => {
    const scope = { propertyId: propertyId ?? undefined };
    const [cur, prev, un] = await Promise.all([
      // This month and anything after it: later rows tell us which row is each room's newest
      utilityApi.groupedAll({ ...scope, from: `${month}-01` }),
      utilityApi.groupedAll({ ...scope, month: shiftMonth(month, -1) }).catch(() => null),
      unitsApi.list({ ...scope, sort: 'unitCode' }).catch(() => null),
    ]);
    return { rows: cur.rows, prevRows: prev?.rows ?? [], units: un ? pickList(un, 'units') : [] };
  }, [propertyId, month]);

  const monthRows = useMemo(
    () => (data?.rows ?? []).filter(r => String(r.readingDate).slice(0, 7) === month),
    [data, month],
  );
  const totals = useMemo(() => usageTotals(monthRows), [monthRows]);
  const prevTotals = useMemo(() => usageTotals(data?.prevRows ?? []), [data]);

  // Row cards + a "Missing" card for every occupied room without a reading this month
  const cards = useMemo<ReadingCard[]>(() => {
    const units = data?.units ?? [];
    const byId = new Map<number, any>(units.map(u => [u.id, u]));
    const newest = newestRowKeys(data?.rows ?? []);
    const recorded = new Set(monthRows.map(r => r.unitId));
    const rowCards = monthRows.map(r => {
      const u = byId.get(r.unitId);
      return {
        key: r.key,
        unitId: r.unitId,
        code: String(r.unit?.unitCode ?? u?.unitCode ?? r.unitId),
        floor: r.unit?.floorNumber ?? u?.floorNumber,
        tenant: r.tenant?.name ?? activeContract(u)?.tenant?.name,
        row: r,
        newest: newest.get(r.unitId) === r.key,
      };
    });
    const missing = units
      .filter(u => activeContract(u) && !recorded.has(u.id))
      .map(u => ({
        key: `missing-${u.id}`,
        unitId: u.id as number,
        code: String(u.unitCode ?? u.id),
        floor: u.floorNumber,
        tenant: activeContract(u)?.tenant?.name,
        row: null,
        newest: false,
      }));
    return [...rowCards, ...missing];
  }, [data, monthRows]);

  const done = new Set(monthRows.map(r => r.unitId)).size;
  const roomCount = done + cards.filter(c => !c.row).length;
  const inView = (c: ReadingCard, v: ReadingView) =>
    v === 'all' ? true
      : v === 'missing' ? !c.row
        : v === 'billed' ? !!c.row && isRowBilled(c.row)
          : !!c.row && !isRowBilled(c.row);
  const counts = {
    all: cards.length,
    missing: cards.filter(c => inView(c, 'missing')).length,
    unbilled: cards.filter(c => inView(c, 'unbilled')).length,
    billed: cards.filter(c => inView(c, 'billed')).length,
  };

  const floors = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = cards
      .filter(c => inView(c, view))
      .filter(c => !s || [c.code, c.tenant, c.row?.electricity?.note, c.row?.water?.note]
        .some(x => String(x ?? '').toLowerCase().includes(s)))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })
        || (a.row && b.row ? byNewest(a.row, b.row) : a.row ? -1 : b.row ? 1 : 0));
    const map = new Map<string, ReadingCard[]>();
    list.forEach(c => {
      const f = c.floor != null && c.floor !== '' ? String(c.floor) : '—';
      map.set(f, [...(map.get(f) ?? []), c]);
    });
    const rank = (f: string) => (f === '—' || isNaN(Number(f)) ? Infinity : Number(f));
    return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
  }, [cards, view, q]);

  const record = (unitId: number) => nav.navigate('UtilityForm', { unitId });
  const edit = (row: GroupedReadingRow) => nav.navigate('UtilityForm', { row });
  // Same date as the row, so the new reading lands in the same row
  const addMeter = (c: ReadingCard, type: MeterType) =>
    nav.navigate('UtilityForm', { unitId: c.unitId, unitCode: c.code, addMeter: type, readingDate: c.row!.readingDate });

  const removeMeter = (row: GroupedReadingRow, k: MeterType) => confirmAction(
    t('reading.delete'),
    t('reading.deleteMsg', { meter: t(`billing.${k}`).toLowerCase(), date: dayLabel(row.readingDate) }),
    async () => {
      try {
        await utilityApi.remove(row[k]!.id);
        toast.deleted();
        reload();
      } catch (e) {
        toast.error(errMsg(e), { title: t('toast.couldNotDelete') });
      }
    },
  );
  // 🗑 acts on one meter: ask which when both can go
  const onDelete = (row: GroupedReadingRow) => {
    const ks = editableMeters(row);
    if (ks.length === 1) return removeMeter(row, ks[0]);
    Alert.alert(t('reading.delete'), t('reading.deleteWhich'), [
      ...ks.map(k => ({ text: t(`billing.${k}`), style: 'destructive' as const, onPress: () => removeMeter(row, k) })),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  };

  return (
    <Screen tabBarSpace refreshing={refreshing} onRefresh={refresh} header={<BillingHeader tab={tab} onTab={onTab} />} contentStyle={{ paddingTop: spacing.md }}>
      {/* Month + totals */}
      <View style={styles.card}>
        <View style={styles.monthNav}>
          <TouchableOpacity style={styles.navBtn} onPress={() => setMonth(m => shiftMonth(m, -1))} hitSlop={6} accessibilityLabel={t('billing.prevMonth')}>
            <Icon name="chevron-back" size={18} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{monthLabel(month)}</Text>
          <TouchableOpacity
            style={[styles.navBtn, isCurrentMonth && { opacity: 0.3 }]}
            onPress={() => setMonth(m => shiftMonth(m, 1))}
            disabled={isCurrentMonth}
            hitSlop={6}
            accessibilityLabel={t('billing.nextMonth')}
          >
            <Icon name="chevron-forward" size={18} color={colors.ink} />
          </TouchableOpacity>
        </View>

        <View style={[styles.row, { marginTop: spacing.lg }]}>
          {METER_TYPES.map(k => {
            const cur = totals[k];
            const prev = prevTotals[k];
            const change = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
            return (
              <View key={k} style={styles.col}>
                <View style={styles.totalLabel}>
                  <Icon name={METER[k].icon} size={13} color={METER[k].tone.fg} />
                  <Text style={styles.label}>{t(`billing.${k}`)}</Text>
                </View>
                <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit>
                  {cur.toLocaleString()} <Text style={styles.totalUnit}>{METER[k].unit}</Text>
                </Text>
                <Text style={styles.totalChange} numberOfLines={1}>
                  {change == null ? ' ' : t('billing.vsLastMonth', { pct: `${change > 0 ? '+' : ''}${change}%` })}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={{ marginTop: 14 }}>
          <ProgressBar value={roomCount ? done / roomCount : 0} height={6} />
        </View>
        <Text style={styles.sub}>{t('billing.recordedOf', { done, total: roomCount })}</Text>
        {canRecord && isCurrentMonth && done < roomCount ? (
          <TouchableOpacity style={styles.roundBtn} onPress={() => nav.navigate('MeterRound')} activeOpacity={0.8}>
            <Icon name="walk-outline" size={17} color={colors.white} />
            <Text style={styles.roundText}>{t('round.start', { count: roomCount - done })}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <SearchBar value={q} onChangeText={setQ} placeholder={t('billing.searchUnit')} style={styles.search} />
      </View>
      <View style={{ marginTop: spacing.md }}>
        <Segments<ReadingView>
          value={view}
          onChange={setView}
          options={[
            { value: 'all', label: t('billing.all'), count: counts.all },
            { value: 'missing', label: t('billing.missing'), count: counts.missing },
            { value: 'unbilled', label: t('reading.notBilled'), count: counts.unbilled },
            { value: 'billed', label: t('reading.locked'), count: counts.billed },
          ]}
        />
      </View>

      {loading ? <LoadingView /> : error ? <ErrorView message={error} onRetry={refresh} /> : floors.length === 0 ? (
        <EmptyState
          icon={view === 'missing' ? 'checkmark-done-outline' : 'speedometer-outline'}
          title={view === 'missing' ? t('billing.allRecorded') : t('billing.noReadings')}
          message={q ? t('billing.tryDifferent') : undefined}
          actionLabel={canRecord && view !== 'missing' ? t('billing.recordReading') : undefined}
          onAction={() => nav.navigate('UtilityForm', {})}
        />
      ) : floors.map(([floor, list]) => (
        <View key={floor}>
          <View style={styles.groupHead}>
            <Text style={styles.groupTitle}>{floor === '—' ? t('units.noFloor') : t('units.floor', { floor })}</Text>
            <Text style={styles.groupMeta}>{list.filter(c => c.row).length}/{list.length}</Text>
          </View>
          <View style={{ gap: 10 }}>
            {list.map(c => {
              const row = c.row;
              const editable = row ? editableMeters(row) : [];
              const invoice = row ? rowInvoice(row) : null;
              // "Add" the missing meter only on the room's newest row, while nothing on it is billed
              const canAdd = canRecord && !!row && c.newest && !hasLockedMeter(row);
              return (
                <View key={c.key} style={styles.unitCard}>
                  <View style={styles.unitHead}>
                    <Text style={styles.unitCode}>{c.code}</Text>
                    <Text style={styles.unitTenant} numberOfLines={1}>{c.tenant ?? ''}</Text>
                    {row ? (
                      <Text style={styles.unitDate}>{dayLabel(row.readingDate)}</Text>
                    ) : (
                      <View style={styles.missingPill}>
                        <Text style={styles.missingText}>{t('billing.missing')}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.meters}>
                    {METER_TYPES.map(k => (
                      <MeterCell
                        key={k}
                        type={k}
                        reading={row ? row[k] : null}
                        // Missing room → record both; row without this meter → add it (newest row only)
                        action={!row ? (canRecord ? 'record' : 'none') : row[k] ? (canEdit && editable.includes(k) ? 'edit' : 'none') : canAdd ? 'add' : 'none'}
                        onPress={() => (!row ? record(c.unitId) : row[k] ? edit(row) : addMeter(c, k))}
                      />
                    ))}
                  </View>
                  {row ? (
                    <View style={styles.rowFoot}>
                      {invoice ? (
                        <Pressable
                          onPress={() => nav.navigate('InvoiceDetail', { invoiceId: invoice.id })}
                          style={[styles.statusPill, { backgroundColor: toneColors.neutral.bg }]}
                          accessibilityLabel={t('reading.billedOn', { number: invoice.invoiceNumber })}
                          hitSlop={6}
                        >
                          <Icon name="lock-closed" size={11} color={toneColors.neutral.fg} />
                          <Text style={[styles.statusPillText, { color: toneColors.neutral.fg }]} numberOfLines={1}>{invoice.invoiceNumber}</Text>
                        </Pressable>
                      ) : (
                        <View style={[styles.statusPill, { backgroundColor: toneColors.warning.bg }]}>
                          <Text style={[styles.statusPillText, { color: toneColors.warning.fg }]}>{t('reading.notBilled')}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }} />
                      {canEdit && editable.length ? (
                        <TouchableOpacity style={styles.rowAction} onPress={() => edit(row)} hitSlop={6} accessibilityLabel={t('reading.edit')}>
                          <Icon name="create-outline" size={17} color={colors.ink} />
                        </TouchableOpacity>
                      ) : null}
                      {canDelete && editable.length ? (
                        <TouchableOpacity style={styles.rowAction} onPress={() => onDelete(row)} hitSlop={6} accessibilityLabel={t('reading.delete')}>
                          <Icon name="trash-outline" size={17} color={colors.danger} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </Screen>
  );
}

type MeterAction = 'edit' | 'add' | 'record' | 'none';

function MeterCell({ type, reading, action, onPress }: {
  type: MeterType; reading: GroupedMeterReading | null; action: MeterAction; onPress: () => void;
}) {
  const { t } = useTranslation();
  const m = METER[type];

  if (!reading) {
    const label = action === 'record' ? `+ ${t('billing.record')}`
      : action === 'add' ? `+ ${t(type === 'water' ? 'reading.addWater' : 'reading.addElectricity')}`
        : '—';
    return (
      <Pressable
        onPress={onPress}
        disabled={action === 'none'}
        style={({ pressed }) => [styles.meter, styles.meterEmpty, pressed && { opacity: 0.6 }]}
      >
        <View style={styles.meterHead}>
          <Icon name={m.icon} size={13} color={colors.muted} />
          <Text style={styles.meterLabel} numberOfLines={1}>{t(`billing.${type}`)}</Text>
        </View>
        <Text style={[styles.meterMissing, action === 'none' && styles.meterDash]} numberOfLines={1}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={action !== 'edit'}
      style={({ pressed }) => [styles.meter, { backgroundColor: m.tone.bg }, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.meterHead}>
        <Icon name={m.icon} size={13} color={m.tone.fg} />
        <Text style={[styles.meterLabel, { flex: 1 }]} numberOfLines={1}>{t(`billing.${type}`)}</Text>
        {/* Billed on an invoice → locked (edit/delete blocked by the server) */}
        {reading.locked ? <Icon name="lock-closed" size={11} color={colors.muted} accessibilityLabel={t('reading.locked')} /> : null}
      </View>
      <Text style={[styles.meterValue, { color: m.tone.fg }]} numberOfLines={1} adjustsFontSizeToFit>
        {toNum(reading.usage).toLocaleString()} <Text style={styles.meterUnit}>{m.unit}</Text>
      </Text>
      <Text style={styles.meterRange} numberOfLines={1}>
        {toNum(reading.previousReading).toLocaleString()} → {toNum(reading.currentReading).toLocaleString()}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Header
  header: { backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, fontWeight: '500', marginTop: 2 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center',
  },
  addBtn: { backgroundColor: colors.primary, borderColor: colors.primary },

  tabs: { flexDirection: 'row', gap: 24, marginTop: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  tab: { paddingTop: 4 },
  tabText: { fontSize: 14, fontWeight: '500', color: colors.muted, paddingBottom: 10 },
  tabTextActive: { color: colors.ink, fontWeight: '700' },
  tabLabelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  tabBadge: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, marginTop: -1,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
  },
  tabBadgeText: { fontSize: 10, fontWeight: '800', color: colors.white },
  tabLine: { height: 2, borderRadius: 1, backgroundColor: 'transparent', marginBottom: -1 },
  tabLineActive: { backgroundColor: colors.primary },

  // Summary
  card: {
    backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl,
    borderWidth: 1, borderColor: colors.divider,
  },
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1, minWidth: 0 },
  label: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  big: { fontSize: 24, fontWeight: '700', color: colors.ink, letterSpacing: -0.6, marginTop: 4 },
  sub: { fontSize: 12, color: colors.muted, marginTop: 10 },

  // Search + month
  searchRow: { flexDirection: 'row', gap: 8, marginTop: spacing.lg, marginBottom: spacing.md },
  search: { borderColor: colors.divider, borderRadius: 14 },
  monthBtn: {
    height: 44, minWidth: 44, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', gap: 6,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center',
  },
  monthBtnActive: { backgroundColor: colors.primarySoft, borderColor: colors.primaryTint },
  monthBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary, maxWidth: 110 },

  // Month groups
  groupHead: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginTop: spacing.xl, marginBottom: 10, paddingHorizontal: 4,
  },
  groupTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  groupMeta: { fontSize: 12, fontWeight: '500', color: colors.muted },

  // Rows
  listCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.divider,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: spacing.lg },
  sep: { borderTopWidth: 1, borderTopColor: colors.divider },
  tile: {
    width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    backgroundColor: colors.bg,
  },
  tileText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  itemBody: { flex: 1, minWidth: 0 },
  itemLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  itemTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  itemSub: { flex: 1, fontSize: 12, color: colors.textSecondary },
  itemSubMuted: { color: colors.muted },
  itemRight: { alignItems: 'flex-end' },
  amount: { fontSize: 15, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  amountCancelled: { color: colors.muted, textDecorationLine: 'line-through' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, flexShrink: 0 },
  pillText: { fontSize: 11, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },

  // Readings — month nav + totals
  roundBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14,
    height: 44, borderRadius: 12, backgroundColor: colors.primary,
  },
  roundText: { fontSize: 14, fontWeight: '600', color: colors.white },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  totalLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  totalValue: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginTop: 4 },
  totalUnit: { fontSize: 13, fontWeight: '500', color: colors.muted },
  totalChange: { fontSize: 11, color: colors.muted, marginTop: 2 },

  // Readings — unit cards
  unitCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl, padding: 14,
    borderWidth: 1, borderColor: colors.divider,
  },
  unitHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  unitCode: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  unitTenant: { flex: 1, fontSize: 13, color: colors.textSecondary },
  unitDate: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  missingPill: { backgroundColor: colors.warningSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  missingText: { fontSize: 11, fontWeight: '600', color: colors.warning },
  meters: { flexDirection: 'row', gap: 8 },
  meter: { flex: 1, minWidth: 0, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, minHeight: 78 },
  meterEmpty: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, justifyContent: 'space-between' },
  meterHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meterLabel: { fontSize: 11, fontWeight: '500', color: colors.textSecondary, flexShrink: 1 },
  meterValue: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4, marginTop: 4 },
  meterUnit: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  meterRange: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  meterMissing: { fontSize: 13, fontWeight: '600', color: colors.primary, marginTop: 8 },
  meterDash: { color: colors.muted, fontWeight: '500' },
  rowFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill,
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  rowAction: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg,
  },

  // Month sheet
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  yearText: { fontSize: 17, fontWeight: '700', color: colors.ink },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthCell: {
    width: '31.5%', height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: 'transparent', paddingHorizontal: 6,
  },
  monthCellNow: { borderColor: colors.primaryTint },
  monthCellActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  monthCellText: { fontSize: 14, fontWeight: '500', color: colors.ink },
  allMonths: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 14, paddingVertical: 14, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: colors.divider,
  },
  allMonthsText: { fontSize: 15, fontWeight: '600', color: colors.ink },
});
