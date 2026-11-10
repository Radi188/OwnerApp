import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
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
import {
  num, pickList, pickOne, propertiesApi, tenancyApi, tenantsApi, unitsApi, utilityApi,
} from '../../services/api';
import type { BillingStrategy } from '../../services/types';
import { colors, radius, spacing } from '../../theme';
import { errMsg, money, todayYMD } from '../../utils/format';

/**
 * Move a tenant into a room (FRONTEND_GUIDE §9). Everything is pre-filled from the room
 * (rent, deposit), the property (billing type) and the last meter readings.
 */
export default function MoveInScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { unitId, tenantId: presetTenant } = (useRoute<any>().params ?? {}) as { unitId: number; tenantId?: number };
  const { can } = useAuth();

  const ctx = useApi(async () => {
    const unit = pickOne<any>(await unitsApi.get(unitId), 'units', 'unit');
    const [prop, init] = await Promise.all([
      unit?.propertyId ? propertiesApi.get(unit.propertyId).then(r => pickOne<any>(r, 'properties', 'property')).catch(() => null) : null,
      utilityApi.init(unitId).then((r: any) => r?.data ?? r).catch(() => null),
    ]);
    return { unit, prop, init };
  }, [unitId], { refetchOnFocus: false });

  // Refetch tenants on focus so a tenant created from here shows up straight away
  const tenants = useApi(async () => pickList(await tenantsApi.list({ sort: 'name', limit: 500 }), 'tenants'), []);

  const unit = ctx.data?.unit;
  const prop = ctx.data?.prop;
  const defaultStrategy: BillingStrategy = prop?.defaultBillingStrategy ?? 'anniversary';

  const [tenantId, setTenantId] = useState<number | null>(presetTenant ?? null);
  const [date, setDate] = useState(todayYMD());
  const [rent, setRent] = useState('');
  const [deposit, setDeposit] = useState('');
  const [strategy, setStrategy] = useState<BillingStrategy | null>(null);
  const [elec, setElec] = useState('');
  const [water, setWater] = useState('');
  const [firstInvoice, setFirstInvoice] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState<{ contract: any; firstInvoice: any } | null>(null);
  const [paySheet, setPaySheet] = useState(false);

  // Pre-fill once the room / property / last readings are known
  useEffect(() => {
    if (!ctx.data) return;
    const { unit: u, init } = ctx.data;
    setRent(r => r || (u?.monthlyRent != null ? String(num(u.monthlyRent)) : ''));
    setDeposit(d => d || (u?.depositAmount != null ? String(num(u.depositAmount)) : ''));
    setStrategy(s => s ?? defaultStrategy);
    const lastE = init?.electricity?.previousReading ?? u?.startElectricityReading;
    const lastW = init?.water?.previousReading ?? u?.startWaterReading;
    setElec(v => v || (lastE != null ? String(num(lastE)) : ''));
    setWater(v => v || (lastW != null ? String(num(lastW)) : ''));
  }, [ctx.data, defaultStrategy]);

  const tenantOptions = useMemo(() => (tenants.data ?? []).map((tn: any) => ({
    value: tn.id as number,
    label: tn.name,
    subtitle: [tn.phoneNumber, tn.status && tn.status !== 'Active' ? tn.status : null].filter(Boolean).join(' · '),
  })), [tenants.data]);

  const isFuture = date > todayYMD();

  const submit = async () => {
    if (!tenantId) { setError(t('moveIn.pickTenant')); return; }
    setSaving(true);
    setError(undefined);
    try {
      const res = await tenancyApi.moveIn(unitId, {
        tenantId,
        moveInDate: date || undefined,
        monthlyRent: rent !== '' ? num(rent) : undefined,
        depositAmount: deposit !== '' ? num(deposit) : undefined,
        billingStrategy: strategy ?? undefined,
        startReadings: elec !== '' || water !== '' ? {
          electricity: elec !== '' ? num(elec) : undefined,
          water: water !== '' ? num(water) : undefined,
        } : undefined,
        createFirstInvoice: firstInvoice,
        note: note.trim() || undefined,
      });
      setDone({ contract: res?.contract ?? null, firstInvoice: res?.firstInvoice ?? null });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => nav.goBack()} hitSlop={6} accessibilityLabel="Back">
        <Icon name={done ? 'close' : 'chevron-back'} size={20} color={colors.ink} />
      </TouchableOpacity>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title}>{t('moveIn.title')}</Text>
        {unit ? <Text style={styles.subtitle} numberOfLines={1}>{t('billing.unit', { code: unit.unitCode })}{prop?.name ? ` · ${prop.name}` : ''}</Text> : null}
      </View>
    </View>
  );

  // ── Success ────────────────────────────────────────────────────────────────
  if (done) {
    const fi = done.firstInvoice;
    const tenantName = tenantOptions.find(o => o.value === tenantId)?.label;
    return (
      <Screen header={header} footer={<Button title={t('common.done')} onPress={() => nav.goBack()} style={{ flex: 1 }} />}>
        <View style={[styles.card, styles.successCard]}>
          <View style={styles.successIcon}><Icon name="checkmark" size={30} color={colors.white} /></View>
          <Text style={styles.successTitle}>{t('moveIn.doneTitle')}</Text>
          <Text style={styles.successText}>
            {t('moveIn.doneText', { name: tenantName ?? '', unit: unit?.unitCode ?? '', date: dayLabel(date, true) })}
          </Text>
        </View>
        {fi ? (
          <View style={[styles.card, { marginTop: spacing.md }]}>
            <Text style={styles.label}>{t('moveIn.firstInvoice')}</Text>
            <View style={styles.between}>
              <Text style={styles.big}>{money(fi.totalAmount, { decimals: 2 })}</Text>
              <Text style={styles.muted}>{t('billing.due', { date: dayLabel(fi.dueDate, true) })}</Text>
            </View>
            <View style={styles.actionsRow}>
              {can('create', 'payment') ? (
                <Button title={t('invoiceView.recordPayment')} icon="cash-outline" variant="success" onPress={() => setPaySheet(true)} style={{ flex: 1 }} />
              ) : null}
              <Button title={t('reading.openInvoice')} variant="secondary" onPress={() => nav.replace('InvoiceDetail', { invoiceId: fi.id })} style={{ flex: 1 }} />
            </View>
          </View>
        ) : null}
        <RecordPaymentSheet
          visible={paySheet}
          invoice={fi ? { ...fi, remainingAmount: fi.remainingAmount ?? fi.totalAmount, pendingAmount: fi.pendingAmount ?? 0, tenant: { name: tenantName } } : null}
          onClose={() => setPaySheet(false)}
          onSaved={() => { setPaySheet(false); Alert.alert(t('moveIn.paymentSaved')); }}
        />
      </Screen>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <Screen
      header={header}
      footer={<Button title={t('moveIn.confirm')} icon="enter-outline" onPress={submit} loading={saving} disabled={!tenantId} style={{ flex: 1 }} />}
      contentStyle={{ paddingTop: spacing.sm }}
    >
      {ctx.loading ? <LoadingView /> : ctx.error ? <ErrorView message={ctx.error} onRetry={ctx.refresh} /> : (
        <>
          {error ? (
            <View style={styles.errorBox}>
              <Icon name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Step n={1} title={t('moveIn.stepTenant')} />
          <Select<number>
            label={t('billing.tenant')}
            icon="person-outline"
            searchable
            required
            value={tenantId}
            options={tenantOptions}
            onChange={v => { setTenantId(v); setError(undefined); }}
          />
          {can('create', 'tenant') ? (
            <TouchableOpacity style={styles.linkBtn} onPress={() => nav.navigate('TenantForm', {})} hitSlop={8}>
              <Icon name="person-add-outline" size={15} color={colors.primary} />
              <Text style={styles.link}>{t('moveIn.newTenant')}</Text>
            </TouchableOpacity>
          ) : null}

          <Step n={2} title={t('moveIn.stepTerms')} />
          <DateField label={t('moveIn.date')} value={date} onChange={setDate} hint={isFuture ? t('moveIn.futureHint') : undefined} />
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Input label={t('unitDetail.monthlyRent')} prefix="$" keyboardType="decimal-pad" value={rent} onChangeText={setRent}
                hint={unit?.monthlyRent != null ? t('moveIn.roomPrice', { price: money(unit.monthlyRent) }) : undefined} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label={t('unitDetail.deposit')} prefix="$" keyboardType="decimal-pad" value={deposit} onChangeText={setDeposit} />
            </View>
          </View>
          <Select<BillingStrategy>
            label={t('moveIn.billing')}
            variant="sheet"
            value={strategy}
            onChange={setStrategy}
            hint={t('moveIn.propertyDefault', { value: t(`tenancy.billing.${defaultStrategy}`) })}
            options={(['anniversary', 'unified'] as BillingStrategy[]).map(v => ({
              value: v, label: t(`tenancy.billing.${v}`), subtitle: t(`tenancy.billingHint.${v}`),
            }))}
          />

          <Step n={3} title={t('moveIn.stepMeters')} />
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Input label={t('billing.electricity')} icon="flash-outline" suffix="kWh" keyboardType="decimal-pad" value={elec} onChangeText={setElec} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label={t('billing.water')} icon="water-outline" suffix="m³" keyboardType="decimal-pad" value={water} onChangeText={setWater} />
            </View>
          </View>
          <Text style={styles.hint}>{t('moveIn.metersHint')}</Text>

          <Step n={4} title={t('moveIn.stepFinish')} />
          <View style={styles.card}>
            <SwitchRow label={t('moveIn.firstInvoiceSwitch')} hint={t('moveIn.firstInvoiceHint')} value={firstInvoice} onChange={setFirstInvoice} />
          </View>
          <View style={{ marginTop: spacing.md }}>
            <Input label={t('payment.note')} value={note} onChangeText={setNote} multiline maxLength={200} />
          </View>
        </>
      )}
    </Screen>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}><Text style={styles.stepNumText}>{n}</Text></View>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );
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
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  row2: { flexDirection: 'row', gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.xl, marginBottom: 12 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  stepTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: -4, paddingHorizontal: 4 },
  link: { fontSize: 13, fontWeight: '600', color: colors.primary },
  hint: { fontSize: 12, color: colors.muted, marginTop: -6, paddingHorizontal: 4 },
  label: { fontSize: 13, color: colors.textSecondary, fontWeight: '500', marginTop: 12 },
  big: { fontSize: 26, fontWeight: '700', color: colors.ink, letterSpacing: -0.6, marginTop: 4 },
  muted: { fontSize: 13, color: colors.muted },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 12 },
  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: radius.md,
    backgroundColor: colors.dangerSoft, marginBottom: 4,
  },
  errorText: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.danger, lineHeight: 19 },
  successCard: { alignItems: 'center', paddingVertical: 28 },
  successIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: 14 },
  successText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});
