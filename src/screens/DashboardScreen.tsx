import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { dashboardApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type OwnerMobileData = {
  performanceOverview: {
    totalRevenue:        number;
    totalExpenses:       number;
    netProfit:           number;
    outstandingBalances: number;
  };
  portfolioStatus: {
    totalUnits:    number;
    occupiedUnits: number;
    vacantUnits:   number;
    occupancyRate: string; // e.g. "50.00%"
  };
  needsAttention: {
    pendingMaintenance: {
      id:          number;
      type:        string;
      description: string;
      priority:    string;
      status:      string;
      createdAt:   string;
      unit?:       { unitCode: string };
    }[];
    expiringContracts: {
      id:       number;
      tenantId: number;
      unitId:   number;
      endDate:  string;
      tenant?:  { name: string };
      unit?:    { unitCode: string };
    }[];
  };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function parsePct(str: string): number {
  return parseFloat(str) || 0;
}

// ─── Ring Progress ────────────────────────────────────────────────────────────

function RingProgress({ pct, color, size = 68 }: { pct: number; color: string; size?: number }) {
  const BORDER = 7;
  const safeP  = Math.min(Math.max(pct, 0), 100);
  const deg    = (safeP / 100) * 360;
  const half   = size / 2;

  // Each half-ring (top+right or bottom+left) spans exactly 180° of arc.
  // Rotating it inside a half-clip reveals 0–180° of that arc:
  //   rotate = −135° → 0° of arc visible (nothing)
  //   rotate = +45°  → 180° of arc visible (full half)
  const rotateRight = Math.min(deg, 180) - 135;          // drives 0–50%
  const rotateLeft  = Math.max(deg - 180, 0) - 135;      // drives 50–100%

  const ringBase = {
    position: 'absolute' as const,
    width: size, height: size,
    borderRadius: half,
    borderWidth: BORDER,
  };

  return (
    <View style={{ width: size, height: size }}>
      {/* Gray track */}
      <View style={[ringBase, { borderColor: '#E5E7EB' }]} />

      {/* Right half-clip: top+right borders colored, drives 0–50% */}
      <View style={{ position: 'absolute', width: half, height: size, left: half, overflow: 'hidden' }}>
        <View style={[ringBase, {
          left: -half,
          borderTopColor:    color,
          borderRightColor:  color,
          borderBottomColor: 'transparent',
          borderLeftColor:   'transparent',
          transform: [{ rotate: `${rotateRight}deg` }],
        }]} />
      </View>

      {/* Left half-clip: bottom+left borders colored, drives 50–100% */}
      {deg > 180 && (
        <View style={{ position: 'absolute', width: half, height: size, left: 0, overflow: 'hidden' }}>
          <View style={[ringBase, {
            left: 0,
            borderTopColor:    'transparent',
            borderRightColor:  'transparent',
            borderBottomColor: color,
            borderLeftColor:   color,
            transform: [{ rotate: `${rotateLeft}deg` }],
          }]} />
        </View>
      )}

      {/* Centre label */}
      <View style={{ position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color, letterSpacing: -0.3 }}>{safeP}%</Text>
        <Text style={{ fontSize: 9, color: '#9CA3AF', fontWeight: '600' }}>rate</Text>
      </View>
    </View>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function DashboardHeader({
  initials, username, onNotif, onSettings,
}: {
  initials: string; username: string;
  onNotif: () => void; onSettings: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[hdr.container, { paddingTop: insets.top + 14 }]}>
      <View style={hdr.avatarWrap}>
        <Text style={hdr.avatarText}>{initials}</Text>
      </View>
      <View style={hdr.nameWrap}>
        <Text style={hdr.welcome}>Welcome,</Text>
        <Text style={hdr.username}>{username}!</Text>
      </View>
      <View style={hdr.actions}>
        <TouchableOpacity style={hdr.iconBtn} activeOpacity={0.7} onPress={onNotif}>
          <Icon name="notifications-outline" size={22} color="#374151" />
        </TouchableOpacity>
        <TouchableOpacity style={hdr.iconBtn} activeOpacity={0.7} onPress={onSettings}>
          <Icon name="settings-outline" size={22} color="#374151" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const { t }      = useTranslation();
  const { user }   = useAuth();

  const [dashData,   setDashData]   = useState<OwnerMobileData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await dashboardApi.ownerMobile().catch(() => null);
      if (res?.data) setDashData(res.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = () => { setRefreshing(true); loadData(); };

  const fmtMoney = (n: number) =>
    n >= 1_000_000
      ? '$' + (n / 1_000_000).toFixed(1) + 'M'
      : '$' + (n ?? 0).toLocaleString();

  const username = user?.username ?? 'Owner';
  const initials = username.substring(0, 2).toUpperCase();

  // ── Derived from API data ─────────────────────────────────────────────────
  const perf      = dashData?.performanceOverview;
  const portfolio = dashData?.portfolioStatus;
  const attention = dashData?.needsAttention;

  const occupancyPct = parsePct(portfolio?.occupancyRate ?? '0');
  const vacancyPct   = Math.max(0, 100 - occupancyPct);

  const maintenanceItems = attention?.pendingMaintenance ?? [];
  const contractItems    = attention?.expiringContracts  ?? [];

  const QUICK_ACTIONS = [
    { icon: 'people-outline',        label: t('dashboard.tenants'),         color: '#6366F1', bg: '#EEF2FF', onPress: () => navigation.navigate('Tenants') },
    { icon: 'construct-outline',     label: t('dashboard.pendingRequests'), color: '#D97706', bg: '#FEF9C3', onPress: () => navigation.navigate('Requests') },
    { icon: 'receipt-outline',       label: 'Invoice',                      color: '#2563EB', bg: '#DBEAFE', onPress: () => navigation.navigate('Tenants') },
    { icon: 'notifications-outline', label: t('dashboard.notifications'),   color: '#10B981', bg: '#F0FDF4', onPress: () => navigation.navigate('Notifications') },
  ];

  return (
    <SafeAreaView style={s.container} edges={[]}>
      <DashboardHeader
        initials={initials}
        username={username}
        onNotif={()    => navigation.navigate('Notifications')}
        onSettings={() => navigation.navigate('Profile')}
      />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#6366F1']} tintColor="#6366F1" />
        }
      >
        {loading ? (
          <ActivityIndicator color="#6366F1" style={{ marginTop: 60 }} />
        ) : (
          <>
            {/* ─── Performance Overview ──────────────────────────────────── */}
            <View style={s.perfBg}>
              {/* Decorative glow circles */}
              <View style={s.perfGlow1} />
              <View style={s.perfGlow2} />
              <View style={s.perfGlow3} />
              <View style={s.perfGlow4} />

              <View style={s.perfHeader}>
                <View>
                  <Text style={s.perfSectionTitle}>Performance Overview</Text>
                  <Text style={s.perfSubtitle}>This month's summary</Text>
                </View>
                <View style={s.perfTitleDot} />
              </View>

              <View style={s.perfGrid}>

                {/* Total Revenue */}
                <View style={s.perfMetricCard}>
                  <View style={s.perfMetricHeader}>
                    <Text style={s.perfMetricLabel}>Total Revenue</Text>
                    <Icon name="bar-chart" size={18} color="#22C55E" />
                  </View>
                  <Text style={s.perfMetricValue}>{fmtMoney(perf?.totalRevenue ?? 0)}</Text>
                  <Text style={[s.perfMetricSub, { color: '#22C55E' }]}>Total income</Text>
                </View>

                {/* Total Expenses */}
                <View style={s.perfMetricCard}>
                  <View style={s.perfMetricHeader}>
                    <Text style={s.perfMetricLabel}>Total Expenses</Text>
                    <Icon name="trending-down" size={18} color="#F97316" />
                  </View>
                  <Text style={[s.perfMetricValue, { color: '#F97316' }]}>{fmtMoney(perf?.totalExpenses ?? 0)}</Text>
                  <Text style={[s.perfMetricSub, { color: '#F97316' }]}>Total spent</Text>
                </View>

                {/* Net Profit */}
                <View style={[s.perfMetricCard, s.perfMetricCardAccent]}>
                  <View style={s.perfMetricHeader}>
                    <Text style={[s.perfMetricLabel, { color: 'rgba(255,255,255,0.8)' }]}>Net Profit</Text>
                    <Icon name="trending-up" size={18} color="#FFFFFF" />
                  </View>
                  <Text style={[s.perfMetricValue, { color: '#FFFFFF' }]}>{fmtMoney(perf?.netProfit ?? 0)}</Text>
                  <Text style={[s.perfMetricSub, { color: 'rgba(255,255,255,0.75)' }]}>After expenses</Text>
                </View>

                {/* Outstanding */}
                <View style={s.perfMetricCard}>
                  <View style={s.perfMetricHeader}>
                    <Text style={s.perfMetricLabel}>Outstanding</Text>
                    <Icon name="warning" size={18} color="#EAB308" />
                  </View>
                  <Text style={[s.perfMetricValue, { color: '#111827' }]}>{fmtMoney(perf?.outstandingBalances ?? 0)}</Text>
                  <Text style={[s.perfMetricSub, { color: '#EAB308' }]}>Unpaid balance</Text>
                </View>

              </View>
            </View>

            {/* ─── Portfolio Status ──────────────────────────────────────── */}
            <Text style={s.sectionTitle}>Portfolio Status</Text>
            <View style={s.portfolioRow}>
              <View style={[s.portfolioCard, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
                <View style={s.portfolioInfo}>
                  <Text style={[s.portfolioCount, { color: '#4F46E5' }]}>
                    {portfolio?.occupiedUnits ?? 0}
                  </Text>
                  <Text style={[s.portfolioLabel, { color: '#6366F1' }]}>Occupied</Text>
                  <Text style={s.portfolioSub}>
                    {portfolio?.occupiedUnits ?? 0}/{portfolio?.totalUnits ?? 0} Units
                  </Text>
                </View>
                <RingProgress pct={Math.round(occupancyPct)} color="#6366F1" />
              </View>

              <View style={[s.portfolioCard, { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB' }]}>
                <View style={s.portfolioInfo}>
                  <Text style={[s.portfolioCount, { color: '#374151' }]}>
                    {portfolio?.vacantUnits ?? 0}
                  </Text>
                  <Text style={[s.portfolioLabel, { color: '#6B7280' }]}>Vacant</Text>
                  <Text style={s.portfolioSub}>
                    {portfolio?.vacantUnits ?? 0}/{portfolio?.totalUnits ?? 0} Units
                  </Text>
                </View>
                <RingProgress pct={Math.round(vacancyPct)} color="#9CA3AF" />
              </View>
            </View>

            {/* ─── Needs Attention ───────────────────────────────────────── */}
            {maintenanceItems.length > 0 && (
              <>
                {(() => {
                  const hasUrgent   = maintenanceItems.some(r => r.priority === 'urgent' || r.priority === 'high');
                  const headerColor = hasUrgent ? '#DC2626' : '#6366F1';
                  const headerBg    = hasUrgent ? '#FEF2F2' : '#EEF2FF';
                  const badgeBg     = hasUrgent ? '#FEF2F2' : '#EEF2FF';
                  return (
                    <View style={s.attentionHeader}>
                      <View style={s.attentionTitleRow}>
                        <View style={[s.attentionIconTitle, { backgroundColor: headerBg }]}>
                          <Icon name={hasUrgent ? 'warning' : 'construct'} size={15} color={headerColor} />
                        </View>
                        <Text style={[s.sectionTitle, { color: hasUrgent ? '#DC2626' : '#111827' }]}>Needs Attention</Text>
                        {hasUrgent && <View style={s.urgentDot} />}
                      </View>
                      <View style={[s.attentionBadgeCount, { backgroundColor: badgeBg }]}>
                        <Text style={[s.attentionBadgeCountText, { color: headerColor }]}>{maintenanceItems.length}</Text>
                      </View>
                    </View>
                  );
                })()}

                <View style={s.mntList}>
                  {maintenanceItems.map((req) => {
                    const isUrgent = req.priority === 'urgent' || req.priority === 'high';
                    return (
                      <TouchableOpacity
                        key={`mnt-${req.id}`}
                        style={s.mntCard}
                        activeOpacity={0.75}
                        onPress={() => navigation.navigate('Requests', {
                          screen: 'RequestDetail',
                          params: { requestId: req.id },
                        })}
                      >
                        {/* Left accent bar */}
                        <View style={[s.mntAccent, { backgroundColor: isUrgent ? '#EF4444' : '#6366F1' }]} />

                        <View style={[s.mntIconWrap, { backgroundColor: isUrgent ? '#FEF2F2' : '#EEF2FF' }]}>
                          <Icon name="construct-outline" size={20} color={isUrgent ? '#DC2626' : '#6366F1'} />
                        </View>

                        <View style={s.mntBody}>
                          <View style={s.mntTopRow}>
                            <Text style={s.mntTitle} numberOfLines={1}>{req.description}</Text>
                            {isUrgent && (
                              <View style={s.urgentBadge}>
                                <View style={s.urgentDot} />
                                <Text style={s.urgentText}>Urgent</Text>
                              </View>
                            )}
                          </View>
                          <View style={s.mntMetaRow}>
                            {req.unit && (
                              <View style={s.mntChip}>
                                <Icon name="home-outline" size={10} color="#6B7280" />
                                <Text style={s.mntChipText}>Unit {req.unit.unitCode}</Text>
                              </View>
                            )}
                            <View style={s.mntChip}>
                              <Icon name="time-outline" size={10} color="#6B7280" />
                              <Text style={s.mntChipText}>{timeAgo(req.createdAt)}</Text>
                            </View>
                            <View style={[s.mntChip, { backgroundColor: isUrgent ? '#FEF2F2' : '#EEF2FF' }]}>
                              <Text style={[s.mntChipText, { color: isUrgent ? '#DC2626' : '#6366F1', fontWeight: '700' }]}>
                                {req.status.replace(/_/g, ' ')}
                              </Text>
                            </View>
                          </View>
                        </View>

                        <View style={s.mntArrow}>
                          <Icon name="chevron-forward" size={16} color="#D1D5DB" />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* ─── Expiring Contracts ────────────────────────────────────────── */}
            {contractItems.length > 0 && (
              <>
                {(() => {
                  const hasExpired  = contractItems.some(c => daysUntil(c.endDate) <= 0);
                  const hdrColor    = hasExpired ? '#DC2626' : '#EA580C';
                  const hdrBg       = hasExpired ? '#FEF2F2' : '#FFF7ED';
                  return (
                    <View style={s.attentionHeader}>
                      <View style={s.attentionTitleRow}>
                        <View style={[s.attentionIconTitle, { backgroundColor: hdrBg }]}>
                          <Icon name="document-text" size={15} color={hdrColor} />
                        </View>
                        <Text style={s.sectionTitle}>Expiring Contracts</Text>
                      </View>
                      <View style={[s.attentionBadgeCount, { backgroundColor: hdrBg }]}>
                        <Text style={[s.attentionBadgeCountText, { color: hdrColor }]}>{contractItems.length}</Text>
                      </View>
                    </View>
                  );
                })()}

                <View style={s.card}>
                  {contractItems.map((contract, i) => {
                    const days        = daysUntil(contract.endDate);
                    const isExpired   = days <= 0;
                    const isCritical  = days <= 7 && days > 0;
                    const accentColor = isExpired ? '#DC2626' : isCritical ? '#EA580C' : '#EA580C';
                    const bgColor     = isExpired ? '#FEF2F2' : '#FFF7ED';
                    const borderColor = isExpired ? '#FECACA' : '#FED7AA';
                    const badgeLabel  = isExpired ? 'Expired' : `${days}d left`;
                    return (
                      <View key={`contract-${contract.id}`}>
                        <View style={s.contractRow}>
                          <View style={[s.contractIconWrap, { backgroundColor: bgColor }]}>
                            <Icon name="document-text-outline" size={18} color={accentColor} />
                          </View>
                          <View style={s.attentionBody}>
                            <Text style={s.attentionTitle}>
                              {contract.tenant?.name ?? `Tenant #${contract.tenantId}`}
                            </Text>
                            <Text style={s.attentionMeta}>
                              Unit {contract.unit?.unitCode ?? `#${contract.unitId}`} · Ends {contract.endDate}
                            </Text>
                          </View>
                          <View style={[s.contractBadge, { backgroundColor: bgColor, borderColor }]}>
                            <Icon name={isExpired ? 'close-circle' : 'time-outline'} size={12} color={accentColor} />
                            <Text style={[s.contractBadgeText, { color: accentColor }]}>{badgeLabel}</Text>
                          </View>
                        </View>
                        {i < contractItems.length - 1 && <View style={s.divider} />}
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* ─── Quick Actions ─────────────────────────────────────────── */}
            <Text style={s.sectionTitle}>Quick Actions</Text>
            <View style={s.quickRow}>
              {QUICK_ACTIONS.map(action => (
                <TouchableOpacity
                  key={action.label}
                  style={s.quickCard}
                  activeOpacity={0.75}
                  onPress={action.onPress}
                >
                  <View style={[s.quickIcon, { backgroundColor: action.bg }]}>
                    <Icon name={action.icon} size={22} color={action.color} />
                  </View>
                  <Text style={s.quickLabel} numberOfLines={2}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const hdr = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 4,
  },
  avatarWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  nameWrap:   { flex: 1 },
  welcome:    { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  username:   { fontSize: 18, fontWeight: '800', color: '#111827', letterSpacing: -0.4, marginTop: 1 },
  actions:    { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#F3F4F6',
  },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  scroll:    { flex: 1 },
  content:   { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 36, gap: 16 },

  // Performance Overview
  perfBg: {
    backgroundColor: 'rgba(49, 46, 129, 0.72)',
    borderRadius: 24, padding: 18,
    overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
    shadowColor: '#312E81',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 20, elevation: 8,
  },
  // Decorative soft glow spots — muted
  perfGlow1: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(167,139,250,0.2)',
    top: -70, right: -50,
  },
  perfGlow2: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(99,102,241,0.15)',
    bottom: -50, left: -30,
  },
  perfGlow3: {
    position: 'absolute', width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(196,181,253,0.12)',
    top: 50, left: 110,
  },
  perfGlow4: {
    position: 'absolute', width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(139,92,246,0.15)',
    bottom: 16, right: 50,
  },
  perfHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14,
  },
  perfSectionTitle: {
    fontSize: 15, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3,
  },
  perfSubtitle: {
    fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.45)', marginTop: 1,
  },
  perfTitleDot: {
    width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(165,180,252,0.6)',
  },
  perfGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  perfMetricCard: {
    width: '47.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14,
    gap: 4,
    shadowColor: '#1E1B4B',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 5,
  },
  perfMetricCardAccent: {
    backgroundColor: '#5B21B6',
  },
  perfMetricHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 4,
  },
  perfMetricIcon: {
    width: 32, height: 32, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  perfMetricLabel: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', flex: 1 },
  perfMetricValue: { fontSize: 19, fontWeight: '900', color: '#111827', letterSpacing: -0.6 },
  perfMetricFooter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  perfMetricSub:    { fontSize: 11, fontWeight: '600' },

  // Portfolio
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  portfolioRow: { flexDirection: 'row', gap: 12 },
  portfolioCard: {
    flex: 1, borderRadius: 18, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  portfolioInfo:  { gap: 3 },
  portfolioCount: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  portfolioLabel: { fontSize: 13, fontWeight: '700' },
  portfolioSub:   { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },

  // Attention headers
  attentionHeader:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  attentionTitleRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  attentionIconTitle: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: '#FFFBEB',
    alignItems: 'center', justifyContent: 'center',
  },
  attentionBadgeCount: {
    backgroundColor: '#FEF9C3', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, minWidth: 26, alignItems: 'center',
  },
  attentionBadgeCountText: { fontSize: 12, fontWeight: '800', color: '#D97706' },

  // Maintenance cards list
  mntList: { gap: 10 },
  mntCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    flexDirection: 'row', alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  mntAccent:   { width: 4, alignSelf: 'stretch' },
  mntIconWrap: {
    width: 44, height: 44, borderRadius: 12, margin: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  mntBody:    { flex: 1, paddingVertical: 12, paddingRight: 4 },
  mntTopRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  mntTitle:   { flex: 1, fontSize: 13, fontWeight: '700', color: '#111827' },
  mntMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  mntChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#F3F4F6', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  mntChipText: { fontSize: 10, fontWeight: '600', color: '#6B7280' },
  mntArrow:    { paddingRight: 12, paddingLeft: 4 },

  // Shared card shell
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#F3F4F6', marginHorizontal: 16 },
  attentionBody:  { flex: 1 },
  attentionTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  attentionMeta:  { fontSize: 11, color: '#9CA3AF', marginTop: 3 },

  // Contract rows
  contractRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  contractIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  contractBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    borderWidth: 1,
  },
  contractBadgeText: { fontSize: 11, fontWeight: '700' },

  // Urgent badge (used inside mnt cards)
  urgentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF2F2', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7,
  },
  urgentDot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: '#EF4444' },
  urgentText: { fontSize: 10, fontWeight: '700', color: '#DC2626' },

  // Quick Actions
  quickRow: { flexDirection: 'row', gap: 10 },
  quickCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, paddingVertical: 16,
    alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  quickIcon:  { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 11, fontWeight: '700', color: '#374151', textAlign: 'center' },
});
