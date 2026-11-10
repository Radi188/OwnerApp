import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { dayLabel, monthLabel, monthsShort } from '../../i18n';
import Segments from '../../components/Segments';
import { invoicesApi, pickList, unitsApi, utilityApi } from '../../services/api';
import { activeContract } from '../units/UnitsScreen';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { EmptyState, ErrorView, LoadingView, ProgressBar, Screen, SearchBar, Sheet } from '../../components/ui';
import { colors, radius, spacing, toneColors } from '../../theme';
import { money, thisMonthYM, toNum } from '../../utils/format';

type Tab = 'invoices' | 'readings';
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

/** Group rows by "YYYY-MM", newest month first. */
function byMonth<T>(rows: T[], key: (r: T) => string | null | undefined): [string, T[]][] {
  const map = new Map<string, T[]>();
  rows.forEach(r => {
    const k = String(key(r) ?? '').slice(0, 7) || '—';
    map.set(k, [...(map.get(k) ?? []), r]);
  });
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function BillingScreen() {
  const [tab, setTab] = useState<Tab>('invoices');
  return tab === 'invoices' ? <InvoicesTab tab={tab} onTab={setTab} /> : <ReadingsTab tab={tab} onTab={setTab} />;
}

function BillingHeader({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { propertyName, can } = useAuth();
  const canAddReading = tab === 'readings' && can('create', 'utility reading');

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>{t('billing.title')}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{propertyName ?? t('billing.allProperties')}</Text>
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
        {(['invoices', 'readings'] as Tab[]).map(k => {
          const active = tab === k;
          return (
            <Pressable key={k} onPress={() => onTab(k)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: active }}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {k === 'invoices' ? t('billing.invoices') : t('billing.readings')}
              </Text>
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
  const { propertyId } = useAuth();
  const [filter, setFilter] = useState<InvoiceFilter>('all');
  const [month, setMonth] = useState<string | null>(null);
  const [monthSheet, setMonthSheet] = useState(false);
  const [q, setQ] = useState('');

  const { data, loading, error, refreshing, refresh } = useApi(
    async () => pickList(await invoicesApi.list({ sort: '-createdAt', billingMonth: month ?? undefined }), 'invoices'),
    [propertyId, month],
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
    return byMonth(list, i => i.billingMonth ?? i.createdAt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, filter, q]);

  return (
    <Screen tabBarSpace refreshing={refreshing} onRefresh={refresh} header={<BillingHeader tab={tab} onTab={onTab} />} contentStyle={{ paddingTop: spacing.md }}>
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
              const tc = PAY_TONE[ps];
              const overdue = ps !== 'cancelled' && isOverdue(inv);
              const left = remainingOf(inv);
              return (
                <Pressable
                  key={inv.id}
                  onPress={() => nav.navigate('InvoiceDetail', { invoiceId: inv.id })}
                  style={({ pressed }) => [styles.item, i > 0 && styles.sep, pressed && { backgroundColor: colors.surfaceAlt }]}
                >
                  <View style={[styles.tile, { backgroundColor: tc.bg }]}>
                    <Text style={[styles.tileText, { color: tc.fg }]} numberOfLines={1} adjustsFontSizeToFit>
                      {inv.unit?.unitCode ?? '—'}
                    </Text>
                  </View>
                  <View style={styles.itemBody}>
                    <Text style={styles.itemTitle} numberOfLines={1}>{inv.tenant?.name ?? t('billing.tenant')}</Text>
                    <Text style={[styles.itemSub, overdue && { color: colors.danger }]} numberOfLines={1}>
                      {t('billing.due', { date: dayLabel(inv.dueDate) })}
                      {inv.invoiceNumber ? <Text style={styles.itemSubMuted}>  ·  {inv.invoiceNumber}</Text> : null}
                    </Text>
                  </View>
                  <View style={styles.itemRight}>
                    <Text style={styles.amount}>{money(inv.totalAmount, { decimals: 2 })}</Text>
                    <View style={styles.statusRow}>
                      <View style={[styles.dot, { backgroundColor: overdue ? colors.danger : tc.fg }]} />
                      <Text style={[styles.statusText, { color: overdue ? colors.danger : tc.fg }]} numberOfLines={1}>
                        {overdue ? t('status.overdue') : t(`invoiceView.ps.${ps}`)}
                        {ps === 'partial' ? ` · ${t('billing.left', { amount: money(left, { decimals: 2 }) })}` : ''}
                      </Text>
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

type Meter = 'electricity' | 'water';
type ReadingView = 'all' | 'missing' | 'recorded';
type UnitMeters = { electricity?: any; water?: any };

const METER: Record<Meter, { icon: string; unit: string; tone: { fg: string; bg: string } }> = {
  electricity: { icon: 'flash', unit: 'kWh', tone: toneColors.warning },
  water:       { icon: 'water', unit: 'm³',  tone: toneColors.info },
};

const unitIdOf = (r: any) => r.unitId ?? r.unit?.id;

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Latest electricity + water reading per unit within one month. `readings` must be newest-first. */
function metersInMonth(readings: any[], ym: string): Map<number, UnitMeters> {
  const map = new Map<number, UnitMeters>();
  readings.forEach(r => {
    if (String(r.readingDate ?? '').slice(0, 7) !== ym) return;
    const type = r.type as Meter;
    if (type !== 'electricity' && type !== 'water') return;
    const id = unitIdOf(r);
    const entry = map.get(id) ?? {};
    if (!entry[type]) entry[type] = r;
    map.set(id, entry);
  });
  return map;
}

function usageTotals(map: Map<number, UnitMeters>) {
  let electricity = 0;
  let water = 0;
  map.forEach(m => {
    electricity += toNum(m.electricity?.usage);
    water += toNum(m.water?.usage);
  });
  return { electricity, water };
}

function ReadingsTab({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const { propertyId, can } = useAuth();
  const canRecord = can('create', 'utility reading');
  const [month, setMonth] = useState(thisMonthYM());
  const [view, setView] = useState<ReadingView>('all');
  const [q, setQ] = useState('');
  const isCurrentMonth = month >= thisMonthYM();

  const { data, loading, error, refreshing, refresh } = useApi(async () => {
    const [rd, un] = await Promise.all([
      utilityApi.list({ sort: '-readingDate' }),
      unitsApi.list({ propertyId: propertyId ?? undefined, sort: 'unitCode' }).catch(() => null),
    ]);
    return { readings: pickList(rd, 'utilityReadings'), units: un ? pickList(un, 'units') : [] };
  }, [propertyId]);

  const readings = useMemo(
    () => (data?.readings ?? [])
      // utility-readings can't be filtered by property server-side — scope by the reading's unit
      .filter(r => propertyId == null || r.unit?.propertyId == null || r.unit.propertyId === propertyId)
      .sort((a, b) => String(b.readingDate).localeCompare(String(a.readingDate)) || b.id - a.id),
    [data, propertyId],
  );

  const current = useMemo(() => metersInMonth(readings, month), [readings, month]);
  const totals = useMemo(() => usageTotals(current), [current]);
  const prevTotals = useMemo(() => usageTotals(metersInMonth(readings, shiftMonth(month, -1))), [readings, month]);

  // Units to show: every occupied unit (they need reading) + any unit that has a reading this month
  const rows = useMemo(() => {
    const units = data?.units ?? [];
    const byId = new Map<number, any>(units.map(u => [u.id, u]));
    const ids = new Set<number>([...units.filter(u => activeContract(u)).map(u => u.id), ...current.keys()]);
    return [...ids].map(id => {
      const u = byId.get(id);
      const m = current.get(id) ?? {};
      const any = m.electricity ?? m.water;
      const latest = [m.electricity, m.water].filter(Boolean).sort((a, b) => String(b.readingDate).localeCompare(String(a.readingDate)))[0];
      return {
        id,
        code: String(u?.unitCode ?? any?.unit?.unitCode ?? id),
        floor: u?.floorNumber ?? any?.unit?.floorNumber,
        tenant: u ? activeContract(u)?.tenant?.name : undefined,
        meters: m,
        date: latest?.readingDate as string | undefined,
        recorded: !!any,
      };
    });
  }, [data, current]);

  const done = rows.filter(r => r.recorded).length;

  const floors = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = rows
      .filter(r => view === 'all' || (view === 'recorded' ? r.recorded : !r.recorded))
      .filter(r => !s || r.code.toLowerCase().includes(s) || (r.tenant ?? '').toLowerCase().includes(s))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    const map = new Map<string, typeof list>();
    list.forEach(r => {
      const f = r.floor != null && r.floor !== '' ? String(r.floor) : '—';
      map.set(f, [...(map.get(f) ?? []), r]);
    });
    const rank = (f: string) => (f === '—' || isNaN(Number(f)) ? Infinity : Number(f));
    return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
  }, [rows, view, q]);

  const record = (unitId: number) => nav.navigate('UtilityForm', { unitId });
  const edit = (reading: any) => nav.navigate('UtilityForm', { reading });

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
          {(['electricity', 'water'] as Meter[]).map(k => {
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
          <ProgressBar value={rows.length ? done / rows.length : 0} height={6} />
        </View>
        <Text style={styles.sub}>{t('billing.recordedOf', { done, total: rows.length })}</Text>
        {canRecord && isCurrentMonth && done < rows.length ? (
          <TouchableOpacity style={styles.roundBtn} onPress={() => nav.navigate('MeterRound')} activeOpacity={0.8}>
            <Icon name="walk-outline" size={17} color={colors.white} />
            <Text style={styles.roundText}>{t('round.start', { count: rows.length - done })}</Text>
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
            { value: 'all', label: t('billing.all'), count: rows.length },
            { value: 'missing', label: t('billing.missing'), count: rows.length - done },
            { value: 'recorded', label: t('billing.recorded'), count: done },
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
            <Text style={styles.groupMeta}>{list.filter(r => r.recorded).length}/{list.length}</Text>
          </View>
          <View style={{ gap: 10 }}>
            {list.map(r => (
              <View key={r.id} style={styles.unitCard}>
                <View style={styles.unitHead}>
                  <Text style={styles.unitCode}>{r.code}</Text>
                  <Text style={styles.unitTenant} numberOfLines={1}>{r.tenant ?? ''}</Text>
                  {r.recorded ? (
                    <Text style={styles.unitDate}>{dayLabel(r.date)}</Text>
                  ) : (
                    <View style={styles.missingPill}>
                      <Text style={styles.missingText}>{t('billing.missing')}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.meters}>
                  {(['electricity', 'water'] as Meter[]).map(k => (
                    <MeterCell
                      key={k}
                      type={k}
                      reading={r.meters[k]}
                      canRecord={canRecord}
                      onPress={() => (r.meters[k] ? edit(r.meters[k]) : record(r.id))}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}

function MeterCell({ type, reading, canRecord, onPress }: { type: Meter; reading?: any; canRecord: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const m = METER[type];

  if (!reading) {
    return (
      <Pressable
        onPress={onPress}
        disabled={!canRecord}
        style={({ pressed }) => [styles.meter, styles.meterEmpty, pressed && { opacity: 0.6 }]}
      >
        <View style={styles.meterHead}>
          <Icon name={m.icon} size={13} color={colors.muted} />
          <Text style={styles.meterLabel} numberOfLines={1}>{t(`billing.${type}`)}</Text>
        </View>
        <Text style={styles.meterMissing}>{canRecord ? `+ ${t('billing.record')}` : t('billing.notRecorded')}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.meter, { backgroundColor: m.tone.bg }, pressed && { opacity: 0.7 }]}>
      <View style={styles.meterHead}>
        <Icon name={m.icon} size={13} color={m.tone.fg} />
        <Text style={[styles.meterLabel, { flex: 1 }]} numberOfLines={1}>{t(`billing.${type}`)}</Text>
        {/* Billed on an invoice → locked (edit/delete blocked by the server) */}
        {reading.invoiceId != null ? <Icon name="lock-closed" size={11} color={colors.muted} accessibilityLabel={t('reading.locked')} /> : null}
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
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: spacing.lg },
  sep: { borderTopWidth: 1, borderTopColor: colors.divider },
  tile: { width: 52, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tileText: { fontSize: 13, fontWeight: '700', letterSpacing: -0.2 },
  itemBody: { flex: 1, minWidth: 0 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  itemSub: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  itemSubMuted: { color: colors.muted },
  itemRight: { alignItems: 'flex-end' },
  amount: { fontSize: 14, fontWeight: '600', color: colors.ink },
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
