import React, { useState } from 'react';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { monthsShort, statusLabel } from '../i18n';
import { dashboardApi, propertiesApi, pickList } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useBadges } from '../context/BadgeContext';
import { useApi } from '../hooks/useApi';
import { ErrorView, ListRow, LoadingView, Screen, Sheet } from '../components/ui';
import DonutChart from '../components/DonutChart';
import { colors, radius, spacing, statusTone, toneColors } from '../theme';
import { initials, money, toNum } from '../utils/format';
import { toast } from '../components/Toast';
import PropertyLogo from '../components/PropertyLogo';

/**
 * Home = the web "Dashboard Overview" (GET /dashboard/overview, FRONTEND_GUIDE §16) laid out for
 * a phone: KPI cards, quick actions, revenue insights, unit distribution, recent invoices,
 * maintenance requests and expiring contracts.
 */

type Overview = {
  topCards: {
    totalRevenue: number; revenueGrowth: string;
    occupancyRate: string; occupancyGrowth: string;
    currentTenants: number; newTenantsThisMonth: string;
    availableRooms: number; totalRooms: number; readyToRentGrowth: string;
  };
  revenueInsights: { key: string; month: string; revenue: number }[];
  unitDistribution: Record<string, number>;
  invoice: { id: number; unit: string; tenant: string; amount: string; date: string; status: string }[];
  maintenanceRequests: { id: number; unit: string; issue: string; date: string; priority: string; status: string }[];
  expiringContracts: { id: number; unit: string; tenant: string; expiresOn: string; daysLeft: number }[];
};

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Unit states in the web's legend order, in shades of the brand colour
const UNIT_STATES: { key: string; color: string }[] = [
  { key: 'Available', color: colors.primary },
  { key: 'Maintenance', color: colors.primaryTint },
  { key: 'Occupied', color: '#8F87EC' },
  { key: 'Reserved', color: colors.primaryMuted },
];

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'home.goodMorning';
  if (h < 18) return 'home.goodAfternoon';
  return 'home.goodEvening';
}

/** "+12.5%" / "-3%" / "0%" → direction for the change chip. */
function trend(v?: string | number | null): 'up' | 'down' | 'flat' {
  const n = parseFloat(String(v ?? '0').replace(/[^0-9.+-]/g, ''));
  if (!Number.isFinite(n) || n === 0) return 'flat';
  return n > 0 ? 'up' : 'down';
}

/** Nice round top for the revenue axis (e.g. 3.2 → 4, 1840 → 2000). */
function niceMax(v: number): number {
  if (v <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10;
  return step * pow;
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { user, propertyId, propertyName, switchProperty, can } = useAuth();
  const { notificationCount, requestCount, refreshBadges } = useBadges();
  const [picker, setPicker] = useState(false);

  const { data, loading, refreshing, error, refresh } = useApi(
    async () => ((await dashboardApi.overview())?.data ?? null) as Overview | null,
    [propertyId],
  );

  // Refetch on focus so a new logo / name from Property settings shows up straight away
  const props = useApi(async () => pickList(await propertiesApi.list(), 'properties'), []);
  const currentProp = (props.data ?? []).find((p: any) => p.id === propertyId);

  const onSwitch = async (p: any) => {
    setPicker(false);
    if (p.id === propertyId) return;
    try {
      await switchProperty(p.id, p.name);
      refreshBadges();
    } catch (e: any) {
      toast.error(e?.message ?? t('home.tryAgain'), { title: t('home.switchFailed') });
    }
  };

  // Quick actions — 3 × 2 grid; each tile only shows when the user can open that area
  const quickActions: QuickAction[] = [
    { key: 'finance', icon: 'wallet-outline', label: t('home.quick.finance'), route: 'Expenses', module: 'transaction' },
    { key: 'property', icon: 'business-outline', label: t('home.quick.property'), route: 'PropertySettings', module: 'property' },
    { key: 'users', icon: 'people-outline', label: t('home.quick.users'), route: 'Users', module: 'user' },
    { key: 'maintenance', icon: 'construct-outline', label: t('home.quick.maintenance'), route: 'Requests', module: 'maintenance', badge: requestCount },
    { key: 'reports', icon: 'bar-chart-outline', label: t('home.quick.reports'), route: 'Reports', module: 'report' },
    { key: 'announcements', icon: 'megaphone-outline', label: t('home.quick.announcements'), route: 'Announcements', module: 'announcement' },
  ].filter(a => can('view', a.module));

  const top = data?.topCards;
  const dist = data?.unitDistribution ?? {};
  const unitTotal = toNum(dist.Total) || UNIT_STATES.reduce((s, u) => s + toNum(dist[u.key]), 0);
  const months = monthsShort();
  const revenue = (data?.revenueInsights ?? []).map(r => ({
    label: months[EN_MONTHS.indexOf(r.month)] ?? r.month,
    value: toNum(r.revenue),
  }));

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} tabBarSpace contentStyle={{ paddingTop: insets.top + 8 }}>
      {/* Header — scrolls with the content */}
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.greet} numberOfLines={1}>
            {t(greetingKey())}, {user?.username ?? t('home.owner')}
          </Text>
          <TouchableOpacity style={styles.propBtn} onPress={() => setPicker(true)} activeOpacity={0.6}>
            {propertyId ? <PropertyLogo logo={currentProp?.logo} name={propertyName} size={26} /> : null}
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
          {/* ── KPI cards (2 × 2) ── */}
          <View style={styles.kpiGrid}>
            <KpiCard
              icon="cash-outline"
              label={t('home.dash.totalRevenue')}
              value={money(top?.totalRevenue ?? 0, { decimals: 2 })}
              change={top?.revenueGrowth ?? '0%'}
              caption={t('home.dash.fromLastMonth')}
              onPress={can('view', 'report') ? () => nav.navigate('Reports') : undefined}
            />
            <KpiCard
              icon="trending-up-outline"
              label={t('home.dash.occupancyRate')}
              value={String(top?.occupancyRate ?? '0%')}
              change={top?.occupancyGrowth ?? '0%'}
              caption={t('home.dash.fromLastMonth')}
              onPress={() => nav.navigate('Units')}
            />
            <KpiCard
              icon="people-outline"
              label={t('home.dash.currentTenants')}
              value={String(top?.currentTenants ?? 0)}
              change={top?.newTenantsThisMonth ?? '+0'}
              caption={t('home.dash.newThisMonth')}
              onPress={() => nav.navigate('Tenants')}
            />
            <KpiCard
              icon="grid-outline"
              label={t('home.dash.availableRooms')}
              value={`${top?.availableRooms ?? 0} / ${top?.totalRooms ?? 0}`}
              change={`${top?.readyToRentGrowth ?? '+0'} ${t('home.dash.units')}`}
              caption={t('home.dash.readyToRent')}
              onPress={() => nav.navigate('Units')}
            />
          </View>

          {/* ── Quick actions ── */}
          {quickActions.length ? (
            <View style={[styles.card, styles.gap, { paddingHorizontal: 8, paddingBottom: 8 }]}>
              <Text style={[styles.cardTitle, { paddingHorizontal: 10, marginBottom: 6 }]}>{t('home.quick.title')}</Text>
              <View style={styles.quickGrid}>
                {quickActions.map(a => (
                  <QuickTile key={a.key} action={a} onPress={() => nav.navigate(a.route)} />
                ))}
              </View>
            </View>
          ) : null}

          {/* ── Revenue insights ── */}
          <View style={[styles.card, styles.gap]}>
            <CardHead title={t('home.dash.revenueInsights')} subtitle={t('home.dash.revenueInsightsSub')} />
            <RevenueChart data={revenue} />
          </View>

          {/* ── Unit distribution ── */}
          <View style={[styles.card, styles.gap]}>
            <CardHead
              title={t('home.dash.unitDistribution')}
              subtitle={t('home.dash.unitDistributionSub')}
              action={t('home.dash.viewAll')}
              onAction={() => nav.navigate('Units')}
            />
            <View style={styles.distRow}>
              <DonutChart
                size={136}
                thickness={20}
                data={UNIT_STATES.map(u => ({ key: u.key, value: toNum(dist[u.key]), color: u.color }))}
                center={
                  <View style={{ alignItems: 'center' }}>
                    <Text style={styles.donutValue}>{unitTotal}</Text>
                    <Text style={styles.donutLabel}>{t('home.dash.total')}</Text>
                  </View>
                }
              />
              <View style={styles.legend}>
                {UNIT_STATES.map(u => (
                  <View key={u.key} style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: u.color }]} />
                    <Text style={styles.legendLabel} numberOfLines={1}>{statusLabel(u.key)}</Text>
                    <Text style={styles.legendValue}>{toNum(dist[u.key])}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* ── Recent invoices ── */}
          <View style={[styles.card, styles.list, styles.gap]}>
            <View style={styles.listHead}>
              <CardHead
                title={t('home.dash.recentInvoices')}
                subtitle={t('home.dash.recentInvoicesSub')}
                action={t('home.dash.viewAll')}
                onAction={() => nav.navigate('Billing')}
              />
            </View>
            {(data?.invoice ?? []).length === 0 ? (
              <EmptyRow icon="receipt-outline" text={t('home.dash.noInvoices')} />
            ) : (data?.invoice ?? []).map((inv, i) => (
              <Row
                key={inv.id}
                first={i === 0}
                icon="receipt-outline"
                code={inv.unit}
                title={inv.tenant}
                subtitle={inv.date}
                right={<Text style={styles.amount}>{money(inv.amount, { decimals: 2 })}</Text>}
                pill={<Pill label={statusLabel(inv.status)} tone={statusTone(inv.status)} />}
                onPress={() => nav.navigate('InvoiceDetail', { invoiceId: inv.id })}
              />
            ))}
          </View>

          {/* ── Maintenance requests ── */}
          <View style={[styles.card, styles.list, styles.gap]}>
            <View style={styles.listHead}>
              <CardHead
                title={t('home.dash.maintenance')}
                subtitle={t('home.dash.maintenanceSub')}
                action={t('home.dash.viewAll')}
                onAction={() => nav.navigate('Requests')}
              />
            </View>
            {(data?.maintenanceRequests ?? []).length === 0 ? (
              <EmptyRow icon="construct-outline" text={t('home.dash.noMaintenance')} />
            ) : (data?.maintenanceRequests ?? []).map((m, i) => (
              <Row
                key={m.id}
                first={i === 0}
                icon="construct-outline"
                code={m.unit}
                title={m.issue}
                subtitle={m.date}
                right={<Pill label={statusLabel(m.priority)} tone={statusTone(m.priority)} icon="flag" />}
                pill={<Pill label={statusLabel(m.status)} tone="primary" />}
                onPress={() => nav.navigate('RequestDetail', { requestId: m.id })}
              />
            ))}
          </View>

          {/* ── Expiring contracts ── */}
          <View style={[styles.card, styles.list, styles.gap]}>
            <View style={styles.listHead}>
              <CardHead
                title={t('home.dash.expiringContracts')}
                subtitle={t('home.dash.expiringContractsSub')}
                action={can('view', 'contract') ? t('home.dash.viewAll') : undefined}
                onAction={() => nav.navigate('Contracts')}
              />
            </View>
            {(data?.expiringContracts ?? []).length === 0 ? (
              <EmptyRow icon="document-text-outline" text={t('home.dash.noExpiring')} />
            ) : (data?.expiringContracts ?? []).map((c, i) => (
              <Row
                key={c.id}
                first={i === 0}
                icon="document-text-outline"
                code={c.unit}
                title={c.tenant}
                subtitle={t('home.dash.expiresOn', { date: c.expiresOn })}
                right={
                  <Pill
                    label={t('home.dash.daysLeft', { count: c.daysLeft })}
                    tone={c.daysLeft <= 7 ? 'danger' : c.daysLeft <= 30 ? 'warning' : 'neutral'}
                  />
                }
                onPress={() => nav.navigate('ContractDetail', { contractId: c.id })}
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
              left={<PropertyLogo logo={p.logo} name={p.name} size={44} />}
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

// ─── Pieces ──────────────────────────────────────────────────────────────────

function CardHead({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.cardHead}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        {subtitle ? <Text style={styles.cardSub}>{subtitle}</Text> : null}
      </View>
      {action && onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={8}>
          <Text style={styles.link}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function KpiCard({ icon, label, value, change, caption, onPress }: {
  icon: string; label: string; value: string; change: string; caption: string; onPress?: () => void;
}) {
  const dir = trend(change);
  const chip = dir === 'up' ? toneColors.success : dir === 'down' ? toneColors.danger : toneColors.neutral;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.card, styles.kpi, pressed && styles.pressed]}>
      <View style={styles.kpiHead}>
        <Text style={styles.kpiLabel} numberOfLines={2}>{label}</Text>
        <View style={styles.kpiIcon}><Icon name={icon} size={16} color={colors.primary} /></View>
      </View>
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <View style={styles.kpiFoot}>
        <View style={[styles.chip, { backgroundColor: chip.bg }]}>
          {dir !== 'flat' ? <Icon name={dir === 'up' ? 'arrow-up' : 'arrow-down'} size={10} color={chip.fg} style={{ transform: [{ rotate: '45deg' }] }} /> : null}
          <Text style={[styles.chipText, { color: chip.fg }]} numberOfLines={1}>{change}</Text>
        </View>
        <Text style={styles.kpiCaption} numberOfLines={1}>{caption}</Text>
      </View>
    </Pressable>
  );
}

/** Last-12-months revenue bars with a light grid, like the web chart. */
function RevenueChart({ data }: { data: { label: string; value: number }[] }) {
  const H = 150;
  const max = niceMax(Math.max(0, ...data.map(d => d.value)));
  const ticks = [max, (max * 3) / 4, max / 2, max / 4, 0];
  const total = data.reduce((s, d) => s + d.value, 0);
  const fmt = (n: number) => (n >= 1000 ? `$${Math.round(n / 100) / 10}k` : `$${Math.round(n * 100) / 100}`);
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={styles.chartTotal}>{money(total, { decimals: 2 })}</Text>
      <View style={{ flexDirection: 'row', marginTop: spacing.md }}>
        <View style={{ height: H, justifyContent: 'space-between', marginRight: 8 }}>
          {ticks.map((v, i) => <Text key={i} style={styles.axis}>{fmt(v)}</Text>)}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ height: H }}>
            {ticks.map((_, i) => (
              <View key={i} style={[styles.gridLine, { top: (H - 1) * (i / (ticks.length - 1)) + 6 }]} />
            ))}
            <View style={styles.bars}>
              {data.map((d, i) => (
                <View key={i} style={styles.barCol}>
                  <View style={[styles.bar, { height: Math.max(3, (d.value / max) * (H - 12)) }]} />
                </View>
              ))}
            </View>
          </View>
          <View style={styles.barLabels}>
            {data.map((d, i) => <Text key={i} style={styles.barLabel} numberOfLines={1}>{d.label}</Text>)}
          </View>
        </View>
      </View>
    </View>
  );
}

function Pill({ label, tone, icon }: { label: string; tone: keyof typeof toneColors; icon?: string }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      {icon ? <Icon name={icon} size={10} color={c.fg} /> : null}
      <Text style={[styles.pillText, { color: c.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function Row({ first, icon, code, title, subtitle, right, pill, onPress }: {
  first: boolean; icon: string; code: string; title: string; subtitle: string;
  right?: React.ReactNode; pill?: React.ReactNode; onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !first && styles.sep, pressed && styles.pressed]}>
      <View style={styles.rowTile}>
        <Icon name={icon} size={13} color={colors.primary} />
        <Text style={styles.rowCode} numberOfLines={1}>{code}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{subtitle}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        {right}
        {pill}
      </View>
    </Pressable>
  );
}

function EmptyRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.emptyRow}>
      <Icon name={icon} size={20} color={colors.muted} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

type QuickAction = { key: string; icon: string; label: string; route: string; module: string; badge?: number };

function QuickTile({ action, onPress }: { action: QuickAction; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickTile, pressed && styles.quickPressed]}
      accessibilityRole="button"
      accessibilityLabel={action.badge ? `${action.label}, ${action.badge}` : action.label}
    >
      {/* Every tile uses the brand colour (Pteah Indigo) */}
      <View style={styles.quickIcon}>
        <Icon name={action.icon} size={22} color={colors.primary} />
        {action.badge ? (
          <View style={styles.quickBadge}>
            <Text style={styles.quickBadgeText}>{action.badge > 99 ? '99+' : action.badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.quickLabel} numberOfLines={2}>{action.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.xl },
  greet: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  propBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, alignSelf: 'flex-start', maxWidth: '100%' },
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

  // Cards — flat, hairline border
  card: {
    backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.divider,
  },
  gap: { marginTop: spacing.lg },
  pressed: { opacity: 0.75 },
  list: { padding: 0, overflow: 'hidden' },
  listHead: { padding: spacing.lg, paddingBottom: spacing.md },
  sep: { borderTopWidth: 1, borderTopColor: colors.divider },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  cardSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  link: { color: colors.primary, fontWeight: '700', fontSize: 13 },

  // KPI cards
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  kpi: { width: '48.5%', padding: 14 },
  kpiHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  kpiLabel: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  kpiIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.6, marginTop: 10, fontVariant: ['tabular-nums'] },
  kpiFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, flexShrink: 0 },
  chipText: { fontSize: 10, fontWeight: '700' },
  kpiCaption: { flex: 1, fontSize: 10, color: colors.muted },

  // Quick actions
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  quickTile: { width: '33.333%', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderRadius: radius.md },
  quickPressed: { backgroundColor: colors.surfaceAlt },
  quickIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  quickBadge: {
    position: 'absolute', top: -4, right: -6, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface,
  },
  quickBadgeText: { fontSize: 10, fontWeight: '800', color: colors.white },
  quickLabel: { marginTop: 8, fontSize: 12, fontWeight: '600', color: colors.ink, textAlign: 'center', lineHeight: 16 },

  // Revenue chart
  chartTotal: { fontSize: 22, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  axis: { fontSize: 10, color: colors.muted, fontVariant: ['tabular-nums'] },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.divider },
  bars: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 6, flexDirection: 'row', alignItems: 'flex-end' },
  barCol: { flex: 1, alignItems: 'center' },
  bar: { width: '58%', maxWidth: 16, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: colors.primary },
  barLabels: { flexDirection: 'row', marginTop: 6 },
  barLabel: { flex: 1, fontSize: 9, color: colors.muted, textAlign: 'center' },

  // Unit distribution
  distRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl, marginTop: spacing.lg },
  donutValue: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  donutLabel: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  legend: { flex: 1, gap: 12 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 13, color: colors.text },
  legendValue: { fontSize: 14, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },

  // List rows
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: spacing.lg },
  rowTile: {
    minWidth: 56, height: 44, paddingHorizontal: 8, borderRadius: 12, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  rowCode: { fontSize: 12, fontWeight: '800', color: colors.primary, marginTop: 1 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  pillText: { fontSize: 11, fontWeight: '700' },
  emptyRow: { alignItems: 'center', gap: 6, paddingVertical: spacing.xl, paddingBottom: spacing.xxl },
  emptyText: { fontSize: 13, color: colors.muted },
});
