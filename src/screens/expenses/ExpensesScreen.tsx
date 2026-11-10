import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Text } from '../../components/Text';
import Segments from '../../components/Segments';
import { EmptyState, ErrorView, LoadingView, Screen, SearchBar } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { dayLabel, monthLabel } from '../../i18n';
import { num, pickList, transactionsApi } from '../../services/api';
import { colors, radius, spacing } from '../../theme';
import { capitalize, money, thisMonthYM } from '../../utils/format';

type TxType = 'expense' | 'income';

const pad = (n: number) => String(n).padStart(2, '0');
function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
const monthRange = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return { from: `${ym}-01`, to: `${ym}-${pad(new Date(y, m, 0).getDate())}` };
};

/** Expenses & income for the current property, one month at a time (FRONTEND_GUIDE §15). */
export default function ExpensesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { can, propertyId } = useAuth();
  const [type, setType] = useState<TxType>('expense');
  const [month, setMonth] = useState(thisMonthYM());
  const [q, setQ] = useState('');
  const isCurrent = month >= thisMonthYM();

  const { data, loading, error, refresh, refreshing } = useApi(async () => {
    const { from, to } = monthRange(month);
    return pickList(await transactionsApi.list({ type, from, to, sort: '-transactionDate', limit: 500 }), 'transactions');
  }, [type, month, propertyId]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((r: any) => !s || [r.description, r.vendor, r.category?.name, r.unit?.unitCode, r.note]
      .some(x => String(x ?? '').toLowerCase().includes(s)));
  }, [data, q]);
  const total = rows.reduce((sum, r: any) => sum + num(r.amount), 0);

  // Group by day, newest first
  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    rows.forEach((r: any) => {
      const d = String(r.transactionDate ?? r.createdAt ?? '').slice(0, 10);
      map.set(d, [...(map.get(d) ?? []), r]);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  const color = type === 'expense' ? colors.danger : colors.success;

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => nav.goBack()} hitSlop={6} accessibilityLabel="Back">
          <Icon name="chevron-back" size={20} color={colors.ink} />
        </TouchableOpacity>
        <Text style={[styles.title, { flex: 1 }]}>{t('expenses.title')}</Text>
        {can('view', 'transaction category') ? (
          <TouchableOpacity style={styles.iconBtn} onPress={() => nav.navigate('Categories')} accessibilityLabel={t('expenses.categories')}>
            <Icon name="pricetags-outline" size={18} color={colors.ink} />
          </TouchableOpacity>
        ) : null}
        {can('create', 'transaction') ? (
          <TouchableOpacity style={[styles.iconBtn, styles.addBtn]} onPress={() => nav.navigate('TransactionForm', { type })} accessibilityLabel={t('expenses.add')}>
            <Icon name="add" size={22} color={colors.white} />
          </TouchableOpacity>
        ) : null}
      </View>
      <Segments<TxType>
        style={{ marginTop: 12 }}
        value={type}
        onChange={setType}
        options={[{ value: 'expense', label: t('expenses.expenses') }, { value: 'income', label: t('expenses.income') }]}
      />
    </View>
  );

  return (
    <Screen header={header} refreshing={refreshing} onRefresh={refresh} contentStyle={{ paddingTop: spacing.md }}>
      {/* Month + total */}
      <View style={styles.card}>
        <View style={styles.monthNav}>
          <TouchableOpacity style={styles.navBtn} onPress={() => setMonth(m => shiftMonth(m, -1))} hitSlop={6}>
            <Icon name="chevron-back" size={18} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{monthLabel(month)}</Text>
          <TouchableOpacity style={[styles.navBtn, isCurrent && { opacity: 0.3 }]} onPress={() => setMonth(m => shiftMonth(m, 1))} disabled={isCurrent} hitSlop={6}>
            <Icon name="chevron-forward" size={18} color={colors.ink} />
          </TouchableOpacity>
        </View>
        <Text style={styles.label}>{type === 'expense' ? t('expenses.totalSpent') : t('expenses.totalReceived')}</Text>
        <Text style={[styles.total, { color }]}>{money(total, { decimals: 2 })}</Text>
        <Text style={styles.muted}>{t('expenses.count', { count: rows.length })}</Text>
      </View>

      <View style={{ marginTop: spacing.md }}>
        <SearchBar value={q} onChangeText={setQ} placeholder={t('expenses.search')} />
      </View>

      {loading ? <LoadingView /> : error ? <ErrorView message={error} onRetry={refresh} /> : groups.length === 0 ? (
        <EmptyState
          icon={type === 'expense' ? 'trending-down-outline' : 'trending-up-outline'}
          title={type === 'expense' ? t('expenses.noExpenses') : t('expenses.noIncome')}
          actionLabel={can('create', 'transaction') ? t('expenses.add') : undefined}
          onAction={() => nav.navigate('TransactionForm', { type })}
        />
      ) : groups.map(([day, list]) => (
        <View key={day}>
          <View style={styles.groupHead}>
            <Text style={styles.groupTitle}>{dayLabel(day, true)}</Text>
            <Text style={styles.groupMeta}>{money(list.reduce((s, r) => s + num(r.amount), 0), { decimals: 2 })}</Text>
          </View>
          <View style={[styles.card, styles.flush]}>
            {list.map((r: any, i: number) => (
              <Pressable
                key={r.id}
                onPress={() => can('edit', 'transaction') && nav.navigate('TransactionForm', { transaction: r })}
                style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <View style={[styles.icon, { backgroundColor: type === 'expense' ? colors.dangerSoft : colors.successSoft }]}>
                  <Icon name={r.maintenanceId || r.maintenance ? 'construct-outline' : type === 'expense' ? 'arrow-down' : 'arrow-up'} size={16} color={color} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{r.description || capitalize(r.category?.name)}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {[capitalize(r.category?.name), r.unit?.unitCode ? t('billing.unit', { code: r.unit.unitCode }) : t('expenses.propertyWide'), r.vendor].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={[styles.amount, { color }]}>{type === 'expense' ? '−' : '+'}{money(r.amount, { decimals: 2 })}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center',
  },
  addBtn: { backgroundColor: colors.primary, borderColor: colors.primary },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.divider },
  flush: { padding: 0, overflow: 'hidden' },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  label: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  total: { fontSize: 28, fontWeight: '700', letterSpacing: -0.6, marginTop: 4 },
  muted: { fontSize: 12, color: colors.muted, marginTop: 2 },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.xl, marginBottom: 10, paddingHorizontal: 4 },
  groupTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  groupMeta: { fontSize: 12, fontWeight: '500', color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: spacing.lg },
  sep: { borderTopWidth: 1, borderTopColor: colors.divider },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  amount: { fontSize: 14, fontWeight: '700' },
});
