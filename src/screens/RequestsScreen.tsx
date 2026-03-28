import React, { useState, useCallback, useEffect } from 'react';
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
import { maintenanceApi } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────
type MaintenanceStatus = 'pending' | 'assigned' | 'in_progress' | 'completed';

export type MaintenanceItem = {
  id: number;
  type: string;
  description: string;
  priority: string;
  status: MaintenanceStatus;
  isBillable: boolean;
  cost: string | null;
  note: string | null;
  createdAt: string;
  unit?: { id: number; unitCode: string; floorNumber?: number; roomType?: string };
  assignedUser?: { id: number; username: string } | null;
};

// ─── Config ───────────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:     { label: 'Pending',     color: '#D97706', bg: '#FEF9C3', icon: 'time-outline' },
  assigned:    { label: 'Assigned',    color: '#7C3AED', bg: '#EDE9FE', icon: 'person-outline' },
  in_progress: { label: 'In Progress', color: '#2563EB', bg: '#DBEAFE', icon: 'reload-outline' },
  completed:   { label: 'Completed',   color: '#16A34A', bg: '#DCFCE7', icon: 'checkmark-circle-outline' },
};

const PRIORITY_META: Record<string, { color: string; bg: string; dot: string }> = {
  low:    { color: '#16A34A', bg: '#DCFCE7', dot: '#16A34A' },
  medium: { color: '#6366F1', bg: '#EEF2FF', dot: '#6366F1' },
  high:   { color: '#EA580C', bg: '#FFF7ED', dot: '#EA580C' },
  urgent: { color: '#DC2626', bg: '#FEF2F2', dot: '#DC2626' },
};

const TYPE_META: Record<string, { icon: string; bg: string; color: string }> = {
  plumbing:   { icon: 'water-outline',         bg: '#DBEAFE', color: '#2563EB' },
  electrical: { icon: 'flash-outline',         bg: '#FEF9C3', color: '#CA8A04' },
  structural: { icon: 'construct-outline',     bg: '#FEE2E2', color: '#DC2626' },
  appliance:  { icon: 'hardware-chip-outline', bg: '#DCFCE7', color: '#16A34A' },
  cleaning:   { icon: 'brush-outline',         bg: '#F5F3FF', color: '#7C3AED' },
  other:      { icon: 'build-outline',         bg: '#EEF2FF', color: '#6366F1' },
};

const TABS: { key: 'all' | MaintenanceStatus; label: string }[] = [
  { key: 'all',         label: 'All' },
  { key: 'pending',     label: 'Pending' },
  { key: 'assigned',    label: 'Assigned' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed',   label: 'Completed' },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function RequestsScreen() {
  const navigation = useNavigation<any>();
  const { t }      = useTranslation();
  const insets     = useSafeAreaInsets();

  const [activeTab,  setActiveTab]  = useState<'all' | MaintenanceStatus>('all');
  const [items,      setItems]      = useState<MaintenanceItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await maintenanceApi.list();
      setItems(res?.data?.maintenances ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = () => { setRefreshing(true); loadData(); };

  const filtered  = activeTab === 'all' ? items : items.filter(r => r.status === activeTab);
  const openCount = items.filter(r => r.status !== 'completed').length;
  const urgentCount = items.filter(r => r.priority === 'urgent' || r.priority === 'high').length;

  return (
    <SafeAreaView style={s.container} edges={[]}>

      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 14 }]}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.headerTitle}>{t('requests.title')}</Text>
            <Text style={s.headerSub}>Manage maintenance requests</Text>
          </View>
          <View style={s.headerBadges}>
            {urgentCount > 0 && (
              <View style={s.urgentCountBadge}>
                <Icon name="warning" size={11} color="#DC2626" />
                <Text style={s.urgentCountText}>{urgentCount} urgent</Text>
              </View>
            )}
            <View style={s.openBadge}>
              <Text style={s.openBadgeText}>{openCount} open</Text>
            </View>
          </View>
        </View>

        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabs}
          style={s.tabsScroll}
        >
          {TABS.map(tab => {
            const active = activeTab === tab.key;
            const sm     = tab.key !== 'all' ? STATUS_META[tab.key] : null;
            const count  = tab.key === 'all'
              ? items.length
              : items.filter(r => r.status === tab.key).length;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[s.tab, active && { backgroundColor: sm?.color ?? '#6366F1' }]}
                activeOpacity={0.75}
                onPress={() => setActiveTab(tab.key)}
              >
                {sm && <Icon name={sm.icon} size={12} color={active ? '#FFF' : sm.color} />}
                <Text style={[s.tabText, active && s.tabTextActive]}>{tab.label}</Text>
                {count > 0 && (
                  <View style={[s.tabCount, active ? s.tabCountActive : { backgroundColor: sm?.bg ?? '#EEF2FF' }]}>
                    <Text style={[s.tabCountText, { color: active ? (sm?.color ?? '#6366F1') : (sm?.color ?? '#6366F1') }]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── List ── */}
      {loading ? (
        <ActivityIndicator color="#6366F1" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#6366F1']} tintColor="#6366F1" />
          }
        >
          {filtered.length === 0 ? (
            <View style={s.emptyCard}>
              <View style={s.emptyIconWrap}>
                <Icon name="construct-outline" size={28} color="#C7D2FE" />
              </View>
              <Text style={s.emptyTitle}>No requests found</Text>
              <Text style={s.emptySub}>
                {activeTab === 'all' ? 'No maintenance requests yet.' : `No ${activeTab.replace('_', ' ')} requests.`}
              </Text>
            </View>
          ) : (
            <View style={s.list}>
              {filtered.map(req => {
                const sm       = STATUS_META[req.status] ?? STATUS_META.pending;
                const tm       = TYPE_META[req.type]     ?? TYPE_META.other;
                const pm       = PRIORITY_META[req.priority] ?? PRIORITY_META.medium;
                const isUrgent = req.priority === 'urgent' || req.priority === 'high';
                return (
                  <TouchableOpacity
                    key={req.id}
                    style={[s.card, isUrgent && s.cardUrgent]}
                    activeOpacity={0.75}
                    onPress={() => navigation.navigate('RequestDetail', { requestId: req.id })}
                  >
                    {/* Urgent left accent */}
                    {isUrgent && <View style={s.cardAccentBar} />}

                    <View style={s.cardInner}>
                      {/* Top row */}
                      <View style={s.cardTop}>
                        <View style={[s.typeIcon, { backgroundColor: tm.bg }]}>
                          <Icon name={tm.icon} size={18} color={tm.color} />
                        </View>

                        <View style={s.cardMid}>
                          {/* Unit + time */}
                          <View style={s.cardMetaRow}>
                            {req.unit && (
                              <View style={s.unitChip}>
                                <Icon name="home-outline" size={10} color="#6366F1" />
                                <Text style={s.unitChipText}>Unit {req.unit.unitCode}</Text>
                              </View>
                            )}
                            {req.unit?.floorNumber != null && (
                              <Text style={s.metaDot}>·</Text>
                            )}
                            {req.unit?.floorNumber != null && (
                              <Text style={s.metaText}>Floor {req.unit.floorNumber}</Text>
                            )}
                            <Text style={s.cardTime}>{timeAgo(req.createdAt)}</Text>
                          </View>

                          {/* Description */}
                          <Text style={s.cardDesc} numberOfLines={2}>{req.description}</Text>

                          {/* Bottom row: type + assigned + badges */}
                          <View style={s.cardBottomRow}>
                            <View style={s.typeChip}>
                              <Text style={[s.typeChipText, { color: tm.color }]}>
                                {req.type.charAt(0).toUpperCase() + req.type.slice(1)}
                              </Text>
                            </View>

                            {req.assignedUser && (
                              <View style={s.assignedChip}>
                                <Icon name="person-outline" size={10} color="#7C3AED" />
                                <Text style={s.assignedChipText}>{req.assignedUser.username}</Text>
                              </View>
                            )}

                            {isUrgent && (
                              <View style={s.urgentBadge}>
                                <View style={s.urgentDot} />
                                <Text style={s.urgentText}>Urgent</Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {/* Right: status + priority */}
                        <View style={s.cardRight}>
                          <View style={[s.statusPill, { backgroundColor: sm.bg }]}>
                            <Icon name={sm.icon} size={10} color={sm.color} />
                            <Text style={[s.statusText, { color: sm.color }]}>{sm.label}</Text>
                          </View>
                          <View style={[s.priorityDot, { backgroundColor: pm.dot }]} />
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  scroll:    { flex: 1 },
  content:   { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 10 },

  // Header
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20, paddingBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 4,
  },
  headerTop: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 14,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  headerSub:   { fontSize: 12, color: '#9CA3AF', fontWeight: '500', marginTop: 2 },
  headerBadges: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  urgentCountBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF2F2', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10,
  },
  urgentCountText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },
  openBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  openBadgeText: { fontSize: 11, fontWeight: '700', color: '#6366F1' },

  // Tabs
  tabsScroll: { marginBottom: 0 },
  tabs: { paddingBottom: 12, gap: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 13, paddingVertical: 7,
    borderRadius: 20, backgroundColor: '#F3F4F6',
  },
  tabText:       { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  tabTextActive: { color: '#FFFFFF' },
  tabCount: {
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  tabCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabCountText:   { fontSize: 10, fontWeight: '800' },

  // Empty
  emptyCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    alignItems: 'center', paddingVertical: 48, gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 10, elevation: 2,
  },
  emptyIconWrap: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#374151' },
  emptySub:   { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 32 },

  // Cards
  list: { gap: 10 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  cardUrgent: {
    shadowColor: '#EF4444', shadowOpacity: 0.1, shadowRadius: 12,
  },
  cardAccentBar: { width: 4, backgroundColor: '#EF4444' },
  cardInner:     { flex: 1, padding: 14 },

  cardTop:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  typeIcon:   {
    width: 44, height: 44, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardMid:    { flex: 1, gap: 5 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  unitChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EEF2FF', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  unitChipText: { fontSize: 10, fontWeight: '700', color: '#6366F1' },
  metaDot:      { fontSize: 10, color: '#D1D5DB' },
  metaText:     { fontSize: 10, color: '#9CA3AF', fontWeight: '500' },
  cardTime:     { fontSize: 10, color: '#9CA3AF', marginLeft: 'auto' as any },

  cardDesc: { fontSize: 14, fontWeight: '700', color: '#111827', lineHeight: 20 },

  cardBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  typeChip: {
    backgroundColor: '#F3F4F6', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  typeChipText:     { fontSize: 10, fontWeight: '600' },
  assignedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EDE9FE', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  assignedChipText: { fontSize: 10, fontWeight: '600', color: '#7C3AED' },
  urgentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF2F2', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  urgentDot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: '#EF4444' },
  urgentText: { fontSize: 10, fontWeight: '700', color: '#DC2626' },

  cardRight: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  statusText:  { fontSize: 10, fontWeight: '700' },
  priorityDot: { width: 8, height: 8, borderRadius: 4, alignSelf: 'center' },
});
