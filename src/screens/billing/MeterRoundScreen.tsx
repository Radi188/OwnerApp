import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput as RNTextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Text, TextInput } from '../../components/Text';
import { Button, EmptyState, LoadingView, ProgressBar, Screen } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { monthLabel } from '../../i18n';
import { num, pickList, unitsApi, utilityApi } from '../../services/api';
import { activeContract } from '../units/UnitsScreen';
import { colors, radius, spacing, toneColors } from '../../theme';
import { errMsg, money, thisMonthYM, todayYMD } from '../../utils/format';
import { toast } from '../../components/Toast';

/**
 * Meter round (FRONTEND_GUIDE §11): walk the building and enter both meters room by room.
 * Loads `/init/:unitId` per room for the last values + prices, saves with `/bulk`, then jumps on.
 */
export default function MeterRoundScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { propertyId } = useAuth();
  const month = thisMonthYM();

  // Occupied rooms (they get billed) in floor / code order + which already have a reading this month
  const base = useApi(async () => {
    const [u, r] = await Promise.all([
      unitsApi.list({ sort: 'unitCode', limit: 500 }),
      utilityApi.list({ sort: '-readingDate', limit: 500 }).catch(() => null),
    ]);
    const units = pickList(u, 'units')
      .filter((x: any) => activeContract(x))
      .sort((a: any, b: any) => (Number(a.floorNumber) || 0) - (Number(b.floorNumber) || 0)
        || String(a.unitCode).localeCompare(String(b.unitCode), undefined, { numeric: true }));
    const read = new Set<number>(pickList(r, 'utilityReadings')
      .filter((x: any) => String(x.readingDate ?? '').slice(0, 7) === month)
      .map((x: any) => x.unitId ?? x.unit?.id));
    return { units, read };
  }, [propertyId], { refetchOnFocus: false });

  const units: any[] = base.data?.units ?? [];
  const [done, setDone] = useState<Set<number>>(new Set());
  useEffect(() => { if (base.data) setDone(new Set(base.data.read)); }, [base.data]);

  // Start at the first room without a reading
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!base.data) return;
    const first = units.findIndex(u => !base.data!.read.has(u.id));
    setIndex(first < 0 ? 0 : first);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.data]);

  const unit = units[index];
  const init = useApi(async () => (unit ? ((await utilityApi.init(unit.id)) as any)?.data ?? null : null), [unit?.id], { refetchOnFocus: false });

  const [elec, setElec] = useState('');
  const [water, setWater] = useState('');
  const [saving, setSaving] = useState(false);
  const waterRef = useRef<RNTextInput>(null);
  const elecRef = useRef<RNTextInput>(null);
  useEffect(() => { setElec(''); setWater(''); setTimeout(() => elecRef.current?.focus(), 250); }, [unit?.id]);

  const prevE = num(init.data?.electricity?.previousReading);
  const prevW = num(init.data?.water?.previousReading);
  const rateE = num(init.data?.electricity?.pricePerUnit);
  const rateW = num(init.data?.water?.pricePerUnit);
  const eLow = elec !== '' && num(elec) < prevE;
  const wLow = water !== '' && num(water) < prevW;
  const canSave = !!unit && (elec !== '' || water !== '') && !eLow && !wLow && !init.loading;

  const go = (i: number) => setIndex(Math.max(0, Math.min(units.length - 1, i)));
  const next = () => {
    // Next room without a reading, wrapping around; stay if everything is done
    for (let k = 1; k <= units.length; k++) {
      const j = (index + k) % units.length;
      if (!done.has(units[j].id)) { setIndex(j); return; }
    }
    if (index < units.length - 1) setIndex(index + 1);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await utilityApi.bulk({
        unitId: unit.id,
        electricityReading: elec !== '' ? num(elec) : undefined,
        waterReading: water !== '' ? num(water) : undefined,
        readingDate: todayYMD(),
      });
      setDone(prev => new Set(prev).add(unit.id));
      next();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const doneCount = units.filter(u => done.has(u.id)).length;
  const allDone = units.length > 0 && doneCount === units.length;

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => nav.goBack()} hitSlop={6}>
          <Icon name="close" size={20} color={colors.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('round.title')}</Text>
          <Text style={styles.subtitle}>{monthLabel(month)} · {t('round.progress', { done: doneCount, total: units.length })}</Text>
        </View>
      </View>
      <View style={{ marginTop: 10 }}>
        <ProgressBar value={units.length ? doneCount / units.length : 0} height={6} color={colors.success} />
      </View>
      {units.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} style={styles.stripWrap}>
          {units.map((u, i) => {
            const on = i === index;
            const isDone = done.has(u.id);
            return (
              <TouchableOpacity key={u.id} onPress={() => go(i)} style={[styles.chip, isDone && styles.chipDone, on && styles.chipOn]}>
                {isDone ? <Icon name="checkmark" size={12} color={on ? colors.white : colors.success} /> : null}
                <Text style={[styles.chipText, isDone && { color: colors.success }, on && { color: colors.white }]}>{u.unitCode}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );

  const footer = unit ? (
    <>
      <Button title={t('round.skip')} variant="secondary" onPress={next} style={{ flex: 1 }} disabled={saving} />
      <Button title={t('round.saveNext')} icon="arrow-forward" onPress={save} loading={saving} disabled={!canSave} style={{ flex: 1.6 }} />
    </>
  ) : undefined;

  return (
    <Screen header={header} footer={footer} contentStyle={{ paddingTop: spacing.md }}>
      {base.loading ? <LoadingView /> : !units.length ? (
        <EmptyState icon="speedometer-outline" title={t('round.noRooms')} />
      ) : (
        <>
          {allDone ? (
            <View style={styles.allDone}>
              <Icon name="checkmark-done" size={18} color={colors.success} />
              <Text style={styles.allDoneText}>{t('round.allDone')}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.roomHead}>
              <Text style={styles.roomCode}>{unit?.unitCode}</Text>
              <Text style={styles.roomTenant} numberOfLines={1}>{activeContract(unit)?.tenant?.name ?? ''}</Text>
              {done.has(unit?.id) ? <View style={styles.donePill}><Text style={styles.donePillText}>{t('round.recorded')}</Text></View> : null}
            </View>
            {unit?.floorNumber ? <Text style={styles.floor}>{t('units.floor', { floor: unit.floorNumber })}</Text> : null}

            {init.loading ? <LoadingView /> : (
              <>
                <MeterInput
                  inputRef={elecRef}
                  icon="flash" tone={toneColors.warning}
                  label={t('billing.electricity')} unit="kWh"
                  prev={prevE} rate={rateE} value={elec} onChange={setElec} low={eLow}
                  returnKeyType="next" onSubmit={() => waterRef.current?.focus()}
                />
                <MeterInput
                  inputRef={waterRef}
                  icon="water" tone={toneColors.info}
                  label={t('billing.water')} unit="m³"
                  prev={prevW} rate={rateW} value={water} onChange={setWater} low={wLow}
                  returnKeyType="done" onSubmit={save}
                />
              </>
            )}
          </View>

          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => go(index - 1)} disabled={index === 0} style={[styles.navBtn, index === 0 && { opacity: 0.3 }]}>
              <Icon name="chevron-back" size={16} color={colors.ink} />
              <Text style={styles.navText}>{units[index - 1]?.unitCode ?? ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => go(index + 1)} disabled={index >= units.length - 1} style={[styles.navBtn, index >= units.length - 1 && { opacity: 0.3 }]}>
              <Text style={styles.navText}>{units[index + 1]?.unitCode ?? ''}</Text>
              <Icon name="chevron-forward" size={16} color={colors.ink} />
            </TouchableOpacity>
          </View>
        </>
      )}
    </Screen>
  );
}

function MeterInput({
  inputRef, icon, tone, label, unit, prev, rate, value, onChange, low, returnKeyType, onSubmit,
}: {
  inputRef: React.RefObject<RNTextInput | null>; icon: string; tone: { fg: string; bg: string }; label: string; unit: string;
  prev: number; rate: number; value: string; onChange: (v: string) => void; low: boolean;
  returnKeyType: 'next' | 'done'; onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const usage = value !== '' ? num(value) - prev : null;
  return (
    <View style={styles.meter}>
      <View style={styles.meterHead}>
        <View style={[styles.meterIcon, { backgroundColor: tone.bg }]}><Icon name={icon} size={15} color={tone.fg} /></View>
        <Text style={styles.meterLabel}>{label}</Text>
        <Text style={styles.rate}>{money(rate)}/{unit}</Text>
      </View>
      <View style={styles.meterRow}>
        <View style={styles.prevBox}>
          <Text style={styles.boxLabel}>{t('invoiceForm.previousFull')}</Text>
          <Text style={styles.prevValue}>{prev.toLocaleString()}</Text>
        </View>
        <Icon name="arrow-forward" size={16} color={colors.muted} />
        <View style={[styles.currBox, low && styles.currBoxLow]}>
          <Text style={[styles.boxLabel, low && { color: colors.danger }]}>{t('invoiceForm.current')}</Text>
          <TextInput
            ref={inputRef}
            style={styles.currInput}
            value={value}
            onChangeText={v => onChange(v.replace(',', '.'))}
            keyboardType="decimal-pad"
            placeholder="—"
            placeholderTextColor={colors.border}
            returnKeyType={returnKeyType}
            onSubmitEditing={onSubmit}
            blurOnSubmit={returnKeyType === 'done'}
          />
        </View>
      </View>
      <Text style={[styles.usage, { color: low ? colors.danger : usage != null ? colors.success : colors.muted }]}>
        {low
          ? t('invoiceForm.mustBe', { prev: prev.toLocaleString(), unit })
          : usage != null
            ? `= ${usage.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit} · ${money(usage * rate, { decimals: 2 })}`
            : t('invoiceForm.enterCurrent')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, fontWeight: '500', marginTop: 2 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center',
  },
  stripWrap: { marginTop: 10, marginHorizontal: -spacing.lg },
  strip: { gap: 6, paddingHorizontal: spacing.lg },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 3, height: 32, paddingHorizontal: 12, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider,
  },
  chipDone: { backgroundColor: colors.successSoft, borderColor: colors.successSoft },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },

  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.divider },
  roomHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roomCode: { fontSize: 24, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 },
  roomTenant: { flex: 1, fontSize: 14, color: colors.textSecondary },
  floor: { fontSize: 12, color: colors.muted, marginTop: 2 },
  donePill: { backgroundColor: colors.successSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  donePillText: { fontSize: 11, fontWeight: '700', color: colors.success },

  meter: { marginTop: spacing.lg },
  meterHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meterIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  meterLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  rate: { fontSize: 12, color: colors.muted },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  prevBox: { flex: 1, borderRadius: 12, backgroundColor: colors.bg, paddingHorizontal: 12, paddingVertical: 10 },
  currBox: { flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 10 },
  currBoxLow: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  boxLabel: { fontSize: 11, fontWeight: '600', color: colors.muted },
  prevValue: { fontSize: 20, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
  currInput: { fontSize: 22, fontWeight: '700', color: colors.ink, paddingVertical: 0, marginTop: 2 },
  usage: { fontSize: 12, fontWeight: '600', marginTop: 8 },

  navRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 },
  navText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  allDone: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.successSoft, marginBottom: spacing.md },
  allDoneText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.success },
});
