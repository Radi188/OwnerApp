import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutAnimation,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Text } from '../../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { statusLabel } from '../../i18n';
import { pickList, unitsApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { EmptyState, ErrorView, LoadingView, Screen, SearchBar } from '../../components/ui';
import { colors, radius, spacing, statusTone, toneColors } from '../../theme';
import { money } from '../../utils/format';

export function activeContract(unit: any) {
  return (unit?.contracts ?? []).find((c: any) => String(c.status).toLowerCase() === 'active') ?? null;
}

export function unitStatus(unit: any): string {
  return activeContract(unit) ? 'Occupied' : unit?.status ?? 'Available';
}

const STATUSES = ['Occupied', 'Available', 'Reserved', 'Maintenance'] as const;
type Status = typeof STATUSES[number];
type ViewMode = 'list' | 'grid';

const NO_FLOOR = '—';
const KEY_VIEW = 'units.viewMode';
const GRID_COLS = 3;
const GRID_GAP = 8;

/** Normalise whatever the API sends ("available", "AVAILABLE"…) onto our four statuses. */
function canonical(unit: any): Status {
  const s = String(unitStatus(unit)).toLowerCase();
  return STATUSES.find(x => x.toLowerCase() === s || (x === 'Maintenance' && s.includes('maint'))) ?? 'Available';
}

const tone = (s: Status) => toneColors[statusTone(s)];

export default function UnitsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const nav = useNavigation<any>();
  const { propertyId, propertyName, can } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [mode, setMode] = useState<ViewMode>('list');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Remember list/grid choice
  useEffect(() => {
    AsyncStorage.getItem(KEY_VIEW).then(v => { if (v === 'grid' || v === 'list') setMode(v); }).catch(() => {});
  }, []);
  const toggleMode = () => {
    const next = mode === 'list' ? 'grid' : 'list';
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMode(next);
    AsyncStorage.setItem(KEY_VIEW, next).catch(() => {});
  };

  const { data, loading, error, refreshing, refresh } = useApi(
    async () => pickList(await unitsApi.list({ propertyId: propertyId ?? undefined, sort: 'unitCode' }), 'units'),
    [propertyId],
  );

  const units = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<Status, number> = { Occupied: 0, Available: 0, Reserved: 0, Maintenance: 0 };
    units.forEach(u => { c[canonical(u)] += 1; });
    return c;
  }, [units]);

  const searching = q.trim().length > 0;

  const floors = useMemo(() => {
    const s = q.trim().toLowerCase();
    const filtered = units.filter(u =>
      (!status || canonical(u) === status) &&
      (!s || String(u.unitCode).toLowerCase().includes(s) || (activeContract(u)?.tenant?.name ?? '').toLowerCase().includes(s)),
    );
    const map = new Map<string, any[]>();
    filtered.forEach(u => {
      const f = u.floorNumber != null && u.floorNumber !== '' ? String(u.floorNumber) : NO_FLOOR;
      map.set(f, [...(map.get(f) ?? []), u]);
    });
    // Numeric floor order; units without a floor go last
    const rank = (f: string) => (f === NO_FLOOR || isNaN(Number(f)) ? Infinity : Number(f));
    return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
  }, [units, q, status]);

  const toggleFloor = (f: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });
  };

  const pickStatus = (s: Status) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStatus(cur => (cur === s ? null : s));
  };

  const open = (u: any) => nav.navigate('UnitDetail', { unitId: u.id });
  const tileWidth = (width - spacing.lg * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title}>{t('units.title')}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {propertyName ?? t('units.property')} · {t(units.length === 1 ? 'units.unitOne' : 'units.unitMany', { count: units.length })}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={toggleMode}
        activeOpacity={0.7}
        accessibilityLabel={mode === 'list' ? t('units.gridView') : t('units.listView')}
      >
        <Icon name={mode === 'list' ? 'grid-outline' : 'list-outline'} size={19} color={colors.ink} />
      </TouchableOpacity>
      {can('create', 'unit') ? (
        <TouchableOpacity
          style={[styles.iconBtn, styles.addBtn]}
          onPress={() => nav.navigate('UnitForm', {})}
          activeOpacity={0.7}
          accessibilityLabel={t('units.add')}
        >
          <Icon name="add" size={22} color={colors.white} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <Screen tabBarSpace refreshing={refreshing} onRefresh={refresh} header={header} contentStyle={{ paddingTop: 4 }}>
      <SearchBar value={q} onChangeText={setQ} placeholder={t('units.search')} style={styles.search} />

      {/* Status overview — doubles as the filter */}
      <View style={styles.overview}>
        {STATUSES.map((s, i) => {
          const active = status === s;
          const tc = tone(s);
          const disabled = counts[s] === 0 && !active;
          return (
            <Pressable
              key={s}
              onPress={() => pickStatus(s)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              style={({ pressed }) => [
                styles.ovItem,
                i > 0 && styles.ovSep,
                active && { backgroundColor: tc.bg },
                pressed && { opacity: 0.6 },
                disabled && { opacity: 0.45 },
              ]}
            >
              <Text style={[styles.ovCount, active && { color: tc.fg }]}>{counts[s]}</Text>
              <View style={styles.ovLabelRow}>
                <View style={[styles.dot, { backgroundColor: tc.fg }]} />
                <Text style={[styles.ovLabel, active && { color: tc.fg }]} numberOfLines={1} adjustsFontSizeToFit>
                  {statusLabel(s)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {status ? (
        <View style={styles.filterNote}>
          <Text style={styles.filterNoteText}>{t('units.showing', { status: statusLabel(status) })}</Text>
          <TouchableOpacity onPress={() => setStatus(null)} hitSlop={8} style={styles.clearBtn}>
            <Icon name="close" size={13} color={colors.primary} />
            <Text style={styles.clearText}>{t('units.clear')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? <LoadingView /> : error ? <ErrorView message={error} onRetry={refresh} /> : floors.length === 0 ? (
        <EmptyState
          icon="home-outline"
          title={t('units.emptyTitle')}
          message={searching || status ? t('units.emptySearch') : t('units.emptyAdd')}
        />
      ) : floors.map(([floor, list]) => {
        const occupied = list.filter(u => canonical(u) === 'Occupied').length;
        const isCollapsed = collapsed.has(floor) && !searching;
        return (
          <View key={floor}>
            <Pressable style={styles.floorHead} onPress={() => toggleFloor(floor)} hitSlop={4}>
              <Text style={styles.floorTitle}>{floor === NO_FLOOR ? t('units.noFloor') : t('units.floor', { floor })}</Text>
              <View style={styles.floorPill}>
                <Text style={styles.floorPillText}>{occupied}/{list.length}</Text>
              </View>
              <View style={{ flex: 1 }} />
              <Icon name={isCollapsed ? 'chevron-down' : 'chevron-up'} size={16} color={colors.muted} />
            </Pressable>

            {isCollapsed ? null : mode === 'list' ? (
              <View style={styles.card}>
                {list.map((u, i) => <UnitRow key={u.id} unit={u} first={i === 0} onPress={() => open(u)} />)}
              </View>
            ) : (
              <View style={styles.grid}>
                {list.map(u => <UnitTile key={u.id} unit={u} width={tileWidth} onPress={() => open(u)} />)}
              </View>
            )}
          </View>
        );
      })}
    </Screen>
  );
}

// ─── Rows & tiles ────────────────────────────────────────────────────────────

function UnitRow({ unit, first, onPress }: { unit: any; first: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const st = canonical(unit);
  const tc = tone(st);
  const tenant = activeContract(unit)?.tenant?.name;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.sep, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      <View style={[styles.codeTile, { backgroundColor: tc.bg }]}>
        <Text style={[styles.codeText, { color: tc.fg }]} numberOfLines={1} adjustsFontSizeToFit>{unit.unitCode}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, !tenant && styles.rowTitleMuted]} numberOfLines={1}>
          {tenant ?? t('units.noTenant')}
        </Text>
        <View style={styles.rowMeta}>
          <View style={[styles.dot, { backgroundColor: tc.fg }]} />
          <Text style={styles.rowMetaText} numberOfLines={1}>
            {statusLabel(st)}{unit.roomType ? ` · ${unit.roomType}` : ''}
          </Text>
        </View>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rent}>{money(unit.monthlyRent)}</Text>
        <Text style={styles.per}>{t('units.perMonth')}</Text>
      </View>
    </Pressable>
  );
}

function UnitTile({ unit, width, onPress }: { unit: any; width: number; onPress: () => void }) {
  const st = canonical(unit);
  const tc = tone(st);
  const tenant = activeContract(unit)?.tenant?.name;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { width, borderTopColor: tc.fg }, pressed && { opacity: 0.7 }]}
      accessibilityLabel={`${unit.unitCode}, ${statusLabel(st)}`}
    >
      <Text style={styles.tileCode} numberOfLines={1} adjustsFontSizeToFit>{unit.unitCode}</Text>
      <Text style={[styles.tileTenant, !tenant && styles.rowTitleMuted]} numberOfLines={1}>
        {tenant ?? statusLabel(st)}
      </Text>
      <Text style={styles.tileRent} numberOfLines={1}>{money(unit.monthlyRent)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Header — same language as Home
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, fontWeight: '500', marginTop: 2 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center',
  },
  addBtn: { backgroundColor: colors.primary, borderColor: colors.primary },

  search: { borderColor: colors.divider, borderRadius: 14 },

  // Status overview / filter
  overview: {
    flexDirection: 'row', marginTop: spacing.md, backgroundColor: colors.surface,
    borderRadius: radius.xl, borderWidth: 1, borderColor: colors.divider, overflow: 'hidden',
  },
  ovItem: { flex: 1, minWidth: 0, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center' },
  ovSep: { borderLeftWidth: 1, borderLeftColor: colors.divider },
  ovCount: { fontSize: 20, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  ovLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, maxWidth: '100%' },
  ovLabel: { fontSize: 11, fontWeight: '500', color: colors.textSecondary, flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },

  filterNote: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.md, paddingHorizontal: 4,
  },
  filterNoteText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  clearText: { fontSize: 12, color: colors.primary, fontWeight: '600' },

  // Floor sections
  floorHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.xl, marginBottom: 10, paddingHorizontal: 4 },
  floorTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  floorPill: { backgroundColor: colors.divider, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  floorPillText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },

  // List view
  card: {
    backgroundColor: colors.surface, borderRadius: radius.xl, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.divider,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: spacing.lg, gap: 12 },
  sep: { borderTopWidth: 1, borderTopColor: colors.divider },
  codeTile: { width: 52, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  codeText: { fontSize: 13, fontWeight: '700', letterSpacing: -0.2 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rowTitleMuted: { color: colors.muted, fontWeight: '500' },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  rowMetaText: { fontSize: 12, color: colors.textSecondary, flexShrink: 1 },
  rowRight: { alignItems: 'flex-end' },
  rent: { fontSize: 14, fontWeight: '600', color: colors.ink },
  per: { fontSize: 11, color: colors.muted, marginTop: 1 },

  // Grid view
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  tile: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: colors.divider, borderTopWidth: 3,
  },
  tileCode: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  tileTenant: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  tileRent: { fontSize: 12, fontWeight: '600', color: colors.ink, marginTop: 8 },
});
