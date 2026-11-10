import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Text } from '../../components/Text';
import { DateField, Input, Select } from '../../components/form';
import { Button, ErrorView, LoadingView, Screen, SwitchRow } from '../../components/ui';
import RecordPaymentSheet from '../../components/RecordPaymentSheet';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { dayLabel } from '../../i18n';
import { num, pickOne, propertiesApi, tenancyApi, unitsApi, utilityApi } from '../../services/api';
import type { MoveOutBody, RentMode, Settlement } from '../../services/types';
import { activeContract } from '../units/UnitsScreen';
import { colors, radius, spacing } from '../../theme';
import { errMsg, money, todayYMD } from '../../utils/format';

/**
 * Move a tenant out (FRONTEND_GUIDE §9): the settlement is previewed live on every change
 * (`/move-out/preview`, debounced), then confirmed with the exact same body.
 */
export default function MoveOutScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { unitId } = useRoute<any>().params as { unitId: number };
  const { can } = useAuth();

  const ctx = useApi(async () => {
    const unit = pickOne<any>(await unitsApi.get(unitId), 'units', 'unit');
    const [prop, init] = await Promise.all([
      unit?.propertyId ? propertiesApi.get(unit.propertyId).then(r => pickOne<any>(r, 'properties', 'property')).catch(() => null) : null,
      utilityApi.init(unitId).then((r: any) => r?.data ?? r).catch(() => null),
    ]);
    return { unit, prop, init };
  }, [unitId], { refetchOnFocus: false });

  const unit = ctx.data?.unit;
  const prop = ctx.data?.prop;
  const contract = activeContract(unit);
  const lastE = num(ctx.data?.init?.electricity?.previousReading);
  const lastW = num(ctx.data?.init?.water?.previousReading);

  const [date, setDate] = useState(todayYMD());
  const [elec, setElec] = useState('');
  const [water, setWater] = useState('');
  const [rentMode, setRentMode] = useState<RentMode | null>(null);
  const [applyDeposit, setApplyDeposit] = useState<boolean | null>(null);
  const [refundUnused, setRefundUnused] = useState<boolean | null>(null);
  const [discount, setDiscount] = useState('');
  const [note, setNote] = useState('');

  // Defaults from the property's tenancy settings
  useEffect(() => {
    if (!ctx.data) return;
    setRentMode(m => m ?? prop?.defaultMoveOutRentMode ?? 'prorated');
    setApplyDeposit(v => v ?? !!prop?.autoApplyDeposit);
    setRefundUnused(v => v ?? !!prop?.refundUnusedDays);
  }, [ctx.data, prop]);

  const elecLow = elec !== '' && num(elec) < lastE;
  const waterLow = water !== '' && num(water) < lastW;
  const future = date > todayYMD();

  const body: MoveOutBody = useMemo(() => ({
    moveOutDate: date || undefined,
    finalReadings: elec !== '' || water !== '' ? {
      electricity: elec !== '' ? num(elec) : undefined,
      water: water !== '' ? num(water) : undefined,
    } : undefined,
    rentMode: rentMode ?? undefined,
    applyDeposit: applyDeposit ?? undefined,
    refundUnusedDays: refundUnused ?? undefined,
    discount: discount !== '' ? num(discount) : undefined,
    note: note.trim() || undefined,
  }), [date, elec, water, rentMode, applyDeposit, refundUnused, discount, note]);

  // ── Live preview (debounced 400 ms, stale responses ignored) ───────────────
  const [preview, setPreview] = useState<Settlement | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | undefined>();
  const seq = useRef(0);
  const bodyKey = JSON.stringify(body);

  useEffect(() => {
    if (!contract || rentMode == null || future || elecLow || waterLow) return;
    const id = ++seq.current;
    setPreviewing(true);
    const timer = setTimeout(async () => {
      try {
        const s = await tenancyApi.previewMoveOut(unitId, body);
        if (id === seq.current) { setPreview(s); setPreviewError(undefined); }
      } catch (e) {
        if (id === seq.current) setPreviewError(errMsg(e));
      } finally {
        if (id === seq.current) setPreviewing(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyKey, unitId, !!contract, rentMode == null, future, elecLow, waterLow]);

  // ── Confirm ────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<Settlement | null>(null);
  const [paySheet, setPaySheet] = useState(false);

  const confirm = () => Alert.alert(t('moveOut.confirmTitle'), t('moveOut.confirmMsg', { name: contract?.tenant?.name ?? '', unit: unit?.unitCode ?? '' }), [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('moveOut.confirm'), style: 'destructive',
      onPress: async () => {
        setSaving(true);
        try {
          setDone(await tenancyApi.moveOut(unitId, body));
        } catch (e) {
          Alert.alert(t('common.error'), errMsg(e));
        } finally {
          setSaving(false);
        }
      },
    },
  ]);

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => nav.goBack()} hitSlop={6} accessibilityLabel="Back">
        <Icon name={done ? 'close' : 'chevron-back'} size={20} color={colors.ink} />
      </TouchableOpacity>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title}>{t('moveOut.title')}</Text>
        {unit ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {t('billing.unit', { code: unit.unitCode })}{contract?.tenant?.name ? ` · ${contract.tenant.name}` : ''}
          </Text>
        ) : null}
      </View>
    </View>
  );

  // ── Done ───────────────────────────────────────────────────────────────────
  if (done) {
    const fi = done.finalInvoice;
    return (
      <Screen header={header} footer={<Button title={t('common.done')} onPress={() => nav.goBack()} style={{ flex: 1 }} />}>
        <View style={[styles.card, styles.successCard]}>
          <View style={styles.successIcon}><Icon name="checkmark" size={30} color={colors.white} /></View>
          <Text style={styles.successTitle}>{t('moveOut.doneTitle')}</Text>
          <Text style={styles.successText}>{t('moveOut.doneText', { unit: done.unit?.unitCode ?? unit?.unitCode ?? '' })}</Text>
        </View>
        <View style={{ marginTop: spacing.md }}><SettlementCard s={done} /></View>
        {fi?.id ? (
          <View style={styles.actionsRow}>
            {can('create', 'payment') && num(done.outstanding) > 0 ? (
              <Button title={t('moveOut.recordFinal')} icon="cash-outline" variant="success" onPress={() => setPaySheet(true)} style={{ flex: 1 }} />
            ) : null}
            <Button title={t('reading.openInvoice')} variant="secondary" onPress={() => nav.replace('InvoiceDetail', { invoiceId: fi.id })} style={{ flex: 1 }} />
          </View>
        ) : null}
        <RecordPaymentSheet
          visible={paySheet}
          invoice={fi?.id ? { id: fi.id, invoiceNumber: fi.invoiceNumber, totalAmount: fi.totalAmount, remainingAmount: fi.remainingAmount ?? fi.totalAmount, pendingAmount: 0, tenant: done.tenant } : null}
          onClose={() => setPaySheet(false)}
          onSaved={() => { setPaySheet(false); Alert.alert(t('moveIn.paymentSaved')); }}
        />
      </Screen>
    );
  }

  const blocked = !contract || future || elecLow || waterLow;

  return (
    <Screen
      header={header}
      footer={<Button title={t('moveOut.confirm')} icon="exit-outline" variant="danger" onPress={confirm} loading={saving} disabled={blocked || !preview || previewing} style={{ flex: 1 }} />}
      contentStyle={{ paddingTop: spacing.sm }}
    >
      {ctx.loading ? <LoadingView /> : ctx.error ? <ErrorView message={ctx.error} onRetry={ctx.refresh} /> : !contract ? (
        <View style={styles.card}><Text style={styles.emptyText}>{t('moveOut.noTenant')}</Text></View>
      ) : (
        <>
          <View style={styles.tenantCard}>
            <Icon name="person-circle-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.tenantText} numberOfLines={1}>
              {contract.tenant?.name} · {t('moveOut.since', { date: dayLabel(contract.startDate, true) })}
            </Text>
          </View>

          <DateField
            label={t('moveOut.date')}
            value={date}
            onChange={setDate}
            error={future ? t('moveOut.futureError') : undefined}
          />
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Input
                label={t('billing.electricity')} icon="flash-outline" suffix="kWh" keyboardType="decimal-pad"
                value={elec} onChangeText={setElec}
                hint={t('moveOut.last', { value: lastE.toLocaleString() })}
                error={elecLow ? t('invoiceForm.mustBe', { prev: lastE.toLocaleString(), unit: 'kWh' }) : undefined}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label={t('billing.water')} icon="water-outline" suffix="m³" keyboardType="decimal-pad"
                value={water} onChangeText={setWater}
                hint={t('moveOut.last', { value: lastW.toLocaleString() })}
                error={waterLow ? t('invoiceForm.mustBe', { prev: lastW.toLocaleString(), unit: 'm³' }) : undefined}
              />
            </View>
          </View>

          <Text style={styles.section}>{t('moveOut.options')}</Text>
          <Select<RentMode>
            label={t('moveOut.extraDays')}
            variant="sheet"
            value={rentMode}
            onChange={setRentMode}
            hint={t('moveOut.extraDaysHint')}
            options={(['prorated', 'full', 'none'] as RentMode[]).map(v => ({ value: v, label: t(`tenancy.rentMode.${v}`) }))}
          />
          <View style={styles.card}>
            <SwitchRow label={t('tenancy.applyDeposit')} value={!!applyDeposit} onChange={setApplyDeposit} />
            <View style={styles.hr} />
            <SwitchRow label={t('tenancy.refundUnused')} value={!!refundUnused} onChange={setRefundUnused} />
          </View>
          <View style={{ marginTop: spacing.md }}>
            <Input label={t('invoiceView.discount')} prefix="$" keyboardType="decimal-pad" value={discount} onChangeText={setDiscount} />
            <Input label={t('payment.note')} value={note} onChangeText={setNote} multiline maxLength={200} />
          </View>

          <View style={styles.previewHead}>
            <Text style={[styles.section, { marginTop: 0, marginBottom: 0 }]}>{t('moveOut.settlement')}</Text>
            {previewing ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.previewTag}>{t('moveOut.preview')}</Text>}
          </View>
          {previewError ? (
            <View style={styles.errorBox}>
              <Icon name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{previewError}</Text>
            </View>
          ) : preview ? (
            <View style={previewing ? { opacity: 0.6 } : undefined}><SettlementCard s={preview} /></View>
          ) : (
            <View style={styles.card}><Text style={styles.emptyText}>{t('moveOut.previewWaiting')}</Text></View>
          )}
        </>
      )}
    </Screen>
  );
}

/** Summary of a move-out settlement (preview or final). */
function SettlementCard({ s }: { s: Settlement }) {
  const { t } = useTranslation();
  const lines = s.finalInvoice?.invoiceDetails ?? [];
  const earlier = (s.unpaidInvoices ?? []).filter(u => u.invoiceId !== s.finalInvoice?.id).reduce((sum, u) => sum + num(u.remainingAmount), 0);

  return (
    <View style={[styles.card, styles.settle]}>
      <Line label={t('moveOut.paidThrough')} value={s.rent?.paidThrough ? dayLabel(s.rent.paidThrough, true) : '—'} />
      <Line
        label={t('moveOut.extraRent')}
        value={s.rent?.coveredByPaidPeriod ? t('moveOut.covered') : money(s.rent?.charged ?? 0, { decimals: 2 })}
        sub={!s.rent?.coveredByPaidPeriod && s.rent?.extraDays ? t('moveOut.extraDaysFrom', { count: s.rent.extraDays, date: dayLabel(s.rent.extraFrom) }) : undefined}
        good={!!s.rent?.coveredByPaidPeriod}
      />

      <View style={styles.hr} />
      <Text style={styles.groupLabel}>{t('moveOut.finalInvoice')}</Text>
      {lines.length ? lines.map((l, i) => <Line key={l.id ?? i} label={l.description} value={money(l.amount, { decimals: 2 })} small />) : (
        <Text style={styles.nothing}>{t('moveOut.nothingToCharge')}</Text>
      )}
      {s.credit?.enabled && num(s.credit.total) > 0 ? (
        <Line label={t('moveOut.unusedCredit', { count: s.credit.unusedDays })} value={`− ${money(s.credit.total, { decimals: 2 })}`} good small />
      ) : null}
      {earlier > 0 ? <Line label={t('moveOut.unpaidEarlier')} value={money(earlier, { decimals: 2 })} small /> : null}

      <View style={styles.hr} />
      <Line label={t('moveOut.owes')} value={money(s.outstanding, { decimals: 2 })} strong danger={num(s.outstanding) > 0} />
      <Line
        label={t('moveOut.depositReturn')}
        value={money(s.deposit?.refundable ?? 0, { decimals: 2 })}
        sub={num(s.deposit?.applied) > 0 ? t('moveOut.depositApplied', { amount: money(s.deposit.applied, { decimals: 2 }), total: money(s.deposit.amount, { decimals: 2 }) }) : undefined}
      />
      <Line label={t('moveOut.refundNow')} value={money(s.refundDue ?? 0, { decimals: 2 })} strong />

      {s.settings ? (
        <View style={styles.chips}>
          <Chip text={t(`tenancy.rentMode.${s.settings.rentMode}`)} />
          {s.settings.applyDeposit ? <Chip text={t('tenancy.applyDepositShort')} /> : null}
          {s.settings.refundUnusedDays ? <Chip text={t('tenancy.refundUnusedShort')} /> : null}
          <Chip text={t(`tenancy.rate.${s.settings.dailyRateBasis}`)} />
        </View>
      ) : null}
    </View>
  );
}

function Line({ label, value, sub, strong, small, good, danger }: {
  label: string; value: string; sub?: string; strong?: boolean; small?: boolean; good?: boolean; danger?: boolean;
}) {
  return (
    <View style={styles.line}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.lineLabel, small && styles.lineSmall, strong && styles.lineStrong]} numberOfLines={2}>{label}</Text>
        {sub ? <Text style={styles.lineSub}>{sub}</Text> : null}
      </View>
      <Text style={[styles.lineValue, small && styles.lineSmall, strong && styles.lineStrong, good && { color: colors.success }, danger && { color: colors.danger }]}>
        {value}
      </Text>
    </View>
  );
}

function Chip({ text }: { text: string }) {
  return <View style={styles.chip}><Text style={styles.chipText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, fontWeight: '500', marginTop: 2 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center',
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, paddingHorizontal: spacing.lg, paddingVertical: 4, borderWidth: 1, borderColor: colors.divider },
  tenantCard: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, paddingHorizontal: 4 },
  tenantText: { flex: 1, fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  row2: { flexDirection: 'row', gap: 10 },
  section: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: spacing.lg, marginBottom: 12, paddingHorizontal: 4 },
  hr: { height: 1, backgroundColor: colors.divider, marginVertical: 8 },
  previewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: 12, paddingRight: 4 },
  previewTag: { fontSize: 11, fontWeight: '700', color: colors.primary, backgroundColor: colors.primarySoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center', paddingVertical: spacing.lg },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  errorText: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.danger, lineHeight: 19 },

  settle: { paddingVertical: 12 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 5 },
  lineLabel: { fontSize: 14, color: colors.textSecondary },
  lineValue: { fontSize: 14, fontWeight: '600', color: colors.ink },
  lineSmall: { fontSize: 13 },
  lineStrong: { fontSize: 15, fontWeight: '700', color: colors.ink },
  lineSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  groupLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, marginTop: 2, marginBottom: 2 },
  nothing: { fontSize: 13, color: colors.muted, paddingVertical: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { backgroundColor: colors.bg, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },

  actionsRow: { flexDirection: 'row', gap: 10, marginTop: spacing.md },
  successCard: { alignItems: 'center', paddingVertical: 28 },
  successIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: 14 },
  successText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 20, marginBottom: 4 },
});
