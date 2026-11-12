import React from 'react';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { dayLabel, statusLabel } from '../../i18n';
import { pickList, pickOne, unitsApi, utilityApi, type GroupedReadingRow } from '../../services/api';
import { byNewest, hasLockedMeter, METER_TYPES } from '../../utils/readings';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { confirmAction, ErrorView, LoadingView, ProgressBar, Screen } from '../../components/ui';
import { colors, radius, spacing, statusTone, toneColors } from '../../theme';
import { capitalize, daysUntil, errMsg, initials, money, toNum } from '../../utils/format';
import { activeContract, unitStatus } from './UnitsScreen';
import { toast } from '../../components/Toast';

const METERS = {
  electricity: { icon: 'flash', unit: 'kWh', tone: toneColors.warning, startKey: 'startElectricityReading' },
  water:       { icon: 'water', unit: 'm³',  tone: toneColors.info,    startKey: 'startWaterReading' },
} as const;
type MeterType = keyof typeof METERS;

/** Share of the contract term already elapsed (0–1). */
function termProgress(start?: string, end?: string): number {
  const s = start ? new Date(start).getTime() : NaN;
  const e = end ? new Date(end).getTime() : NaN;
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  return Math.min(1, Math.max(0, (Date.now() - s) / (e - s)));
}

export default function UnitDetailScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { unitId } = useRoute<any>().params;
  const { can } = useAuth();

  const { data, loading, error, refresh, refreshing } = useApi(async () => {
    const [u, r] = await Promise.all([
      unitsApi.get(unitId),
      // One row per reading date, both meters side by side. Not limited to the active property:
      // this room's history is wanted whatever property is selected.
      utilityApi.grouped({ unitId, propertyId: undefined, limit: 6, sort: '-readingDate' }).catch(() => null),
    ]);
    return { unit: pickOne<any>(u, 'units', 'unit'), readings: pickList<GroupedReadingRow>(r, 'rows') };
  }, [unitId]);

  const unit = data?.unit;
  const contract = activeContract(unit);
  const readings = (data?.readings ?? []).filter(r => r.unitId === unitId).sort(byNewest);

  const status = unitStatus(unit);
  const tc = toneColors[statusTone(status)];

  const onDelete = () => confirmAction(
    t('unitDetail.deleteTitle'),
    t('unitDetail.deleteConfirm', { code: unit?.unitCode }),
    async () => {
      try {
        await unitsApi.remove(unitId); toast.deleted();
        nav.goBack();
      } catch (e) { toast.error(errMsg(e), { title: t('unitDetail.deleteFailed') }); }
    },
    t('unitDetail.delete'),
  );

  // Extra fees beyond rent & deposit (those two are in the top card)
  const extras = unit ? ([
    ['parking', unit.parkingFee], ['internet', unit.internetFee], ['garbage', unit.garbageFee],
    ['management', unit.managementFee], ['additional', unit.additionalFee],
  ] as [string, unknown][]).filter(([, v]) => toNum(v) > 0) : [];

  const floorText = unit?.floorNumber != null && unit.floorNumber !== '' ? t('units.floor', { floor: unit.floorNumber }) : t('units.noFloor');

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => nav.goBack()} hitSlop={6} accessibilityLabel="Back">
        <Icon name="chevron-back" size={20} color={colors.ink} />
      </TouchableOpacity>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title} numberOfLines={1}>{unit ? t('billing.unit', { code: unit.unitCode }) : t('units.title')}</Text>
        {unit ? (
          <Text style={styles.subtitle} numberOfLines={1}>{[floorText, unit.roomType].filter(Boolean).join(' · ')}</Text>
        ) : null}
      </View>
      {unit && can('edit', 'unit') ? (
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => nav.navigate('UnitForm', { unit })}
          activeOpacity={0.7}
          accessibilityLabel={t('unitDetail.edit')}
        >
          <Icon name="create-outline" size={19} color={colors.ink} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} header={header} contentStyle={{ paddingTop: spacing.sm }}>
      {loading ? <LoadingView /> : error || !unit ? <ErrorView message={error ?? t('unitDetail.notFound')} onRetry={refresh} /> : (
        <>
          {/* Overview */}
          <View style={styles.card}>
            <View style={styles.overviewTop}>
              <View style={[styles.codeTile, { backgroundColor: tc.bg }]}>
                <Text style={[styles.codeText, { color: tc.fg }]} numberOfLines={1} adjustsFontSizeToFit>{unit.unitCode}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.statusRow}>
                  <View style={[styles.dot, { backgroundColor: tc.fg }]} />
                  <Text style={[styles.statusText, { color: tc.fg }]}>{statusLabel(status)}</Text>
                </View>
                <Text style={styles.overviewMeta} numberOfLines={1}>{[unit.roomType, floorText].filter(Boolean).join(' · ')}</Text>
              </View>
            </View>
            <View style={styles.hr} />
            <View style={styles.pair}>
              <View style={styles.col}>
                <Text style={styles.label}>{t('unitDetail.monthlyRent')}</Text>
                <Text style={styles.big} numberOfLines={1} adjustsFontSizeToFit>{money(unit.monthlyRent, { decimals: 2 })}</Text>
              </View>
              <View style={[styles.col, { alignItems: 'flex-end' }]}>
                <Text style={styles.label}>{t('unitDetail.deposit')}</Text>
                <Text style={styles.mid} numberOfLines={1}>{money(unit.depositAmount, { decimals: 2 })}</Text>
              </View>
            </View>
            {unit.notes ? <Text style={styles.notes}>{unit.notes}</Text> : null}
          </View>

          {/* Tenant */}
          <Text style={styles.section}>{t('unitDetail.tenant')}</Text>
          {contract ? (
            <View style={[styles.card, styles.flush]}>
              <Pressable
                onPress={() => contract.tenantId && nav.navigate('TenantDetail', { tenantId: contract.tenantId })}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.avatar}><Text style={styles.avatarText}>{initials(contract.tenant?.name)}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{contract.tenant?.name ?? t('billing.tenant')}</Text>
                  {contract.tenant?.phoneNumber ? <Text style={styles.rowSub}>{contract.tenant.phoneNumber}</Text> : null}
                </View>
                <Icon name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>

              <View style={styles.term}>
                <View style={styles.between}>
                  <Text style={styles.termDates}>
                    {dayLabel(contract.startDate, true)} → {dayLabel(contract.endDate, true)}
                  </Text>
                  {contract.endDate ? (
                    <Text style={[styles.termLeft, daysUntil(contract.endDate) <= 30 && { color: colors.warning }]}>
                      {daysUntil(contract.endDate) <= 0
                        ? t('unitDetail.ended')
                        : t('unitDetail.daysLeft', { count: daysUntil(contract.endDate) })}
                    </Text>
                  ) : null}
                </View>
                <ProgressBar value={termProgress(contract.startDate, contract.endDate)} height={6} />
              </View>

              <Pressable
                onPress={() => nav.navigate('ContractDetail', { contractId: contract.id })}
                style={({ pressed }) => [styles.row, styles.sep, pressed && styles.pressed]}
              >
                <View style={styles.smallIcon}><Icon name="document-text-outline" size={17} color={colors.ink} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowLabel}>{t('unitDetail.viewContract')}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {money(contract.monthlyRent)}/{contract.rentCycle ?? 'month'} · {capitalize(contract.billingStrategy ?? 'unified')}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
              {can('edit', 'contract') ? (
                <Pressable
                  onPress={() => nav.navigate('MoveOut', { unitId: unit.id })}
                  style={({ pressed }) => [styles.row, styles.sep, pressed && styles.pressed]}
                >
                  <View style={[styles.smallIcon, { backgroundColor: colors.dangerSoft }]}><Icon name="exit-outline" size={17} color={colors.danger} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.rowLabel, { color: colors.danger }]}>{t('unitDetail.moveOut')}</Text>
                    <Text style={styles.rowSub}>{t('unitDetail.moveOutHint')}</Text>
                  </View>
                  <Icon name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={[styles.card, styles.vacant]}>
              <View style={[styles.smallIcon, { backgroundColor: colors.primarySoft }]}>
                <Icon name="key-outline" size={17} color={colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle}>{t('unitDetail.vacantTitle')}</Text>
                <Text style={styles.rowSub}>{t('unitDetail.vacantHint')}</Text>
              </View>
              {can('create', 'contract') ? (
                <TouchableOpacity
                  style={styles.cta}
                  activeOpacity={0.8}
                  onPress={() => nav.navigate('MoveIn', { unitId: unit.id })}
                >
                  <Icon name="enter-outline" size={16} color={colors.white} />
                  <Text style={styles.ctaText}>{t('unitDetail.moveIn')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {!contract && can('create', 'contract') ? (
            <TouchableOpacity
              style={styles.subLink}
              onPress={() => nav.navigate('ContractForm', { unitId: unit.id, monthlyRent: unit.monthlyRent, depositAmount: unit.depositAmount })}
              hitSlop={8}
            >
              <Icon name="document-text-outline" size={14} color={colors.primary} />
              <Text style={styles.link}>{t('unitDetail.formalContract')}</Text>
            </TouchableOpacity>
          ) : null}

          {/* Extra charges (only when there are any) */}
          {extras.length ? (
            <>
              <Text style={styles.section}>{t('unitDetail.otherCharges')}</Text>
              <View style={styles.card}>
                {extras.map(([k, v], i) => (
                  <View key={k} style={[styles.kv, i > 0 && styles.kvSep]}>
                    <Text style={styles.kvLabel}>{t(`unitDetail.fees.${k}`)}</Text>
                    <Text style={styles.kvValue}>{money(v, { decimals: 2 })}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* Meters */}
          <View style={styles.sectionRow}>
            <Text style={[styles.section, { marginTop: 0, marginBottom: 0 }]}>{t('unitDetail.meters')}</Text>
            {can('create', 'utility reading') ? (
              <TouchableOpacity onPress={() => nav.navigate('UtilityForm', { unitId: unit.id })} hitSlop={8} style={styles.linkBtn}>
                <Icon name="add" size={15} color={colors.primary} />
                <Text style={styles.link}>{t('billing.record')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.meters}>
            {(Object.keys(METERS) as MeterType[]).map(k => {
              const m = METERS[k];
              const latest = readings.find(r => r[k])?.[k];
              const latestDate = readings.find(r => r[k])?.readingDate;
              const value = latest ? toNum(latest.currentReading) : toNum(unit[m.startKey]);
              return (
                <View key={k} style={[styles.meter, { backgroundColor: m.tone.bg }]}>
                  <View style={styles.meterHead}>
                    <Icon name={m.icon} size={13} color={m.tone.fg} />
                    <Text style={styles.meterLabel}>{t(`billing.${k}`)}</Text>
                  </View>
                  <Text style={[styles.meterValue, { color: m.tone.fg }]} numberOfLines={1} adjustsFontSizeToFit>
                    {value.toLocaleString()} <Text style={styles.meterUnit}>{m.unit}</Text>
                  </Text>
                  <Text style={styles.meterSub} numberOfLines={1}>
                    {latest
                      ? `+${toNum(latest.usage).toLocaleString()} · ${dayLabel(latestDate)}`
                      : t('unitDetail.startReading')}
                  </Text>
                </View>
              );
            })}
          </View>

          {readings.length ? (
            <View style={[styles.card, styles.flush, { marginTop: 10 }]}>
              {readings.slice(0, 6).map((r, i) => (
                <Pressable
                  key={r.key}
                  onPress={() => nav.navigate('UtilityForm', { row: r })}
                  style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && styles.pressed]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowLabel}>{dayLabel(r.readingDate, true)}</Text>
                    {hasLockedMeter(r) ? (
                      <View style={styles.billedLine}>
                        <Icon name="lock-closed" size={11} color={colors.muted} />
                        <Text style={styles.rowSub}>{t('reading.locked')}</Text>
                      </View>
                    ) : null}
                  </View>
                  {METER_TYPES.map(k => {
                    const m = METERS[k];
                    const reading = r[k];
                    return (
                      <View key={k} style={styles.rowMeter}>
                        <Icon name={m.icon} size={13} color={reading ? m.tone.fg : colors.muted} />
                        <Text style={styles.usage}>
                          {reading ? `+${toNum(reading.usage).toLocaleString()}` : '—'}
                          {reading ? <Text style={styles.usageUnit}> {m.unit}</Text> : null}
                        </Text>
                      </View>
                    );
                  })}
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Danger zone */}
          {can('delete', 'unit') ? (
            <Pressable onPress={onDelete} style={({ pressed }) => [styles.card, styles.deleteRow, pressed && styles.pressed]}>
              <Icon name="trash-outline" size={17} color={colors.danger} />
              <Text style={styles.deleteText}>{t('unitDetail.deleteTitle')}</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, fontWeight: '500', marginTop: 2 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center',
  },

  // Cards
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.divider },
  flush: { padding: 0, overflow: 'hidden' },
  pressed: { backgroundColor: colors.surfaceAlt },
  hr: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.lg },
  pair: { flexDirection: 'row', gap: 12 },
  col: { flex: 1, minWidth: 0 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 },

  section: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: spacing.xl, marginBottom: 10, paddingHorizontal: 4 },
  sectionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.xl, marginBottom: 10, paddingHorizontal: 4,
  },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  subLink: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 4 },
  link: { fontSize: 13, fontWeight: '600', color: colors.primary },

  // Overview
  overviewTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  codeTile: { width: 64, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  codeText: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 14, fontWeight: '600' },
  overviewMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  label: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  big: { fontSize: 26, fontWeight: '700', color: colors.ink, letterSpacing: -0.6, marginTop: 4 },
  mid: { fontSize: 17, fontWeight: '600', color: colors.ink, marginTop: 9 },
  notes: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.lg, lineHeight: 19 },

  // Rows
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: spacing.lg },
  sep: { borderTopWidth: 1, borderTopColor: colors.divider },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  smallIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },

  term: { paddingHorizontal: spacing.lg, paddingBottom: 14 },
  termDates: { fontSize: 12, color: colors.textSecondary, flexShrink: 1 },
  termLeft: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },

  vacant: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.lg },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary,
    borderRadius: radius.pill, paddingHorizontal: 12, height: 34,
  },
  ctaText: { color: colors.white, fontSize: 13, fontWeight: '600' },

  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  kvSep: { borderTopWidth: 1, borderTopColor: colors.divider },
  kvLabel: { fontSize: 14, color: colors.textSecondary },
  kvValue: { fontSize: 14, fontWeight: '600', color: colors.ink },

  // Meters
  meters: { flexDirection: 'row', gap: 10 },
  meter: { flex: 1, minWidth: 0, borderRadius: radius.xl, padding: 14 },
  meterHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meterLabel: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  meterValue: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, marginTop: 6 },
  meterUnit: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  meterSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  usage: { fontSize: 14, fontWeight: '600', color: colors.ink },
  usageUnit: { fontSize: 12, fontWeight: '500', color: colors.muted },
  rowMeter: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 72, justifyContent: 'flex-end' },
  billedLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  deleteRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: spacing.xxl, paddingVertical: 14,
  },
  deleteText: { fontSize: 15, fontWeight: '600', color: colors.danger },
});
