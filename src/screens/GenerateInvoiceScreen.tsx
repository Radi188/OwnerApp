import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { utilityApi, invoicesApi } from '../services/api';
import { getInvoice, saveInvoice } from '../store/invoiceStore';
import { Button, Screen } from '../components/ui';
import { Input } from '../components/form';
import Segments from '../components/Segments';
import { dayLabel } from '../i18n';
import { colors, radius, spacing, toneColors } from '../theme';
import { daysUntil, initials } from '../utils/format';

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmtKhr = (n: number) => `${Math.round(n).toLocaleString('en-US')} ៛`;
const fmtUsd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Currency = 'USD' | 'KHR';

/**
 * Three modes:
 *  - create / edit: enter this month's meter readings → bulk-save readings + create the invoice
 *  - view (local):  this device saved the readings → read-only breakdown, "Edit" to change them
 *  - view (remote): invoice exists on the API only  → summary + link to the full invoice
 */
export default function GenerateInvoiceScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { tenantId, contractId, unitId, lastReading, apiInvoice, tenantName: tenantNameParam, unitCode: unitCodeParam } = useRoute<any>().params;

  // ── Parse API context ──────────────────────────────────────────────────────
  const apiData  = lastReading?.data ?? {};
  const ctx      = apiData.context        ?? {};
  const elec     = apiData.electricity    ?? {};
  const water    = apiData.water          ?? {};
  const fees     = apiData.additionalFees ?? {};
  const billing  = apiData.billingInfo    ?? {};
  const settings = apiData.settings       ?? {};

  const exchangeRate = Number(settings.exchangeRate ?? 4000);
  const prevKwh      = parseFloat(String(elec.previousReading ?? 0));
  const prevWater    = parseFloat(String(water.previousReading ?? 0));
  const kwhRateUsd   = parseFloat(String(elec.pricePerUnit ?? 0));
  const waterRateUsd = parseFloat(String(water.pricePerUnit ?? 0));

  // All additional fees are USD
  const feeRows: { key: string; usd: number }[] = [
    { key: 'rent',       usd: Number(fees.rent ?? 0) },
    { key: 'management', usd: Number(fees.management ?? 0) },
    { key: 'parking',    usd: Number(fees.parking ?? 0) },
    { key: 'internet',   usd: Number(fees.internet ?? 0) },
    { key: 'garbage',    usd: Number(fees.garbage ?? 0) },
    { key: 'additional', usd: Number(fees.additional ?? 0) },
  ];
  const fixedUsd = feeRows.reduce((s, f) => s + f.usd, 0);

  // Prefer the tenant we came from — the readings API says "No Active Tenant" when it can't resolve one
  const ctxTenant       = /no active/i.test(String(ctx.tenant ?? '')) ? '' : ctx.tenant;
  const tenantName      = tenantNameParam || ctxTenant || '';
  const roomCode        = ctx.room || unitCodeParam || '';
  const propName        = ctx.property ?? '';
  const displayMonth    = billing.displayMonth ?? ctx.month ?? '';
  const billingMonthApi = billing.billingMonth ?? '';
  const dueDate         = billing.dueDate ?? '';

  // ── State ──────────────────────────────────────────────────────────────────
  const storeMonth      = billingMonthApi || displayMonth; // normalised to YYYY-MM inside the store
  const existingInvoice = getInvoice(String(tenantId), storeMonth);
  const remoteOnly      = !!apiInvoice && !existingInvoice;

  // Invoice already exists on the server and there are no local readings to show →
  // skip this screen and open the full invoice (line items, payments, status) directly.
  useEffect(() => {
    if (remoteOnly && apiInvoice?.id) nav.replace('InvoiceDetail', { invoiceId: apiInvoice.id });
  }, [remoteOnly, apiInvoice?.id, nav]);
  const [isEditing, setIsEditing]   = useState(!existingInvoice && !apiInvoice);
  const [currKwh, setCurrKwh]       = useState(existingInvoice ? String(existingInvoice.currKwh) : '');
  const [currWater, setCurrWater]   = useState(existingInvoice ? String(existingInvoice.currWater) : '');
  const [notes, setNotes]           = useState(existingInvoice?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [currency, setCurrency]     = useState<Currency>('USD');
  const [showNotes, setShowNotes]   = useState(!!existingInvoice?.notes);
  const kwhRef   = useRef<TextInput>(null);
  const waterRef = useRef<TextInput>(null);

  // ── Calculations (USD; converted for display) ──────────────────────────────
  const kwhNum     = parseFloat(currKwh) || 0;
  const waterNum   = parseFloat(currWater) || 0;
  const usageKwh   = Math.max(0, kwhNum - prevKwh);
  const usageWater = Math.max(0, waterNum - prevWater);
  const elecUsd    = usageKwh * kwhRateUsd;
  const waterUsd   = usageWater * waterRateUsd;
  const totalUsd   = fixedUsd + elecUsd + waterUsd;

  const kwhValid   = currKwh !== '' && kwhNum >= prevKwh;
  const waterValid = currWater !== '' && waterNum >= prevWater;
  const isValid    = kwhValid && waterValid;
  const isViewMode = (!!existingInvoice || !!apiInvoice) && !isEditing;

  const fmt = (usd: number) => (currency === 'USD' ? fmtUsd(usd) : fmtKhr(usd * exchangeRate));
  const fmtAlt = (usd: number) => (currency === 'USD' ? fmtKhr(usd * exchangeRate) : fmtUsd(usd));

  // ── Save ───────────────────────────────────────────────────────────────────
  const persistLocal = () => saveInvoice({
    tenantId: String(tenantId), billingMonth: storeMonth,
    currKwh: kwhNum, currWater: waterNum, notes,
    scheduledDate: dueDate, total: totalUsd * exchangeRate,
    elecCost: elecUsd * exchangeRate, waterCost: waterUsd * exchangeRate,
    usageKwh, usageWater,
  });

  const handleSave = () => {
    if (!isValid) return;
    Alert.alert(
      t('invoiceForm.confirmTitle'),
      t('invoiceForm.confirmMsg', {
        name: tenantName, month: displayMonth, usd: fmtUsd(totalUsd), khr: fmtKhr(totalUsd * exchangeRate),
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: existingInvoice ? t('invoiceForm.update') : t('common.confirm'),
          onPress: async () => {
            setSubmitting(true);
            try {
              const d = new Date();
              const readingDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              await utilityApi.bulk({ unitId, electricityReading: kwhNum, waterReading: waterNum, readingDate, note: notes || '' });
              await invoicesApi.create({ contractId, billingMonth: billingMonthApi });
              persistLocal();
              setIsEditing(false);
              Alert.alert(
                t('invoiceForm.createdTitle'),
                t('invoiceForm.createdMsg', { name: tenantName, date: dayLabel(dueDate, true) }),
                [{ text: t('common.done'), onPress: () => nav.goBack() }],
              );
            } catch (e: any) {
              if (e?.message?.toLowerCase().includes('duplicate') || e?.status === 400) {
                persistLocal();
                setIsEditing(false);
                Alert.alert(t('invoiceForm.savedTitle'), t('invoiceForm.savedMsg'), [{ text: t('common.done'), onPress: () => nav.goBack() }]);
              } else {
                Alert.alert(t('common.error'), e?.message ?? t('invoiceForm.saveFailed'));
              }
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  // ── Header & footer ────────────────────────────────────────────────────────
  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => nav.goBack()} hitSlop={6} accessibilityLabel="Back">
        <Icon name="chevron-back" size={20} color={colors.ink} />
      </TouchableOpacity>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title} numberOfLines={1}>{isViewMode ? t('invoiceForm.viewTitle') : t('invoiceForm.createTitle')}</Text>
        {displayMonth ? <Text style={styles.subtitle} numberOfLines={1}>{displayMonth}</Text> : null}
      </View>
      {isViewMode && !remoteOnly ? (
        <TouchableOpacity style={styles.iconBtn} onPress={() => setIsEditing(true)} activeOpacity={0.7} accessibilityLabel={t('invoiceForm.edit')}>
          <Icon name="create-outline" size={19} color={colors.ink} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  // What still blocks the button, e.g. "Enter the Water reading to continue"
  const missing = [
    !kwhValid ? t('billing.electricity') : null,
    !waterValid ? t('billing.water') : null,
  ].filter(Boolean).join(' & ');

  const footer = !isViewMode ? (
    <View style={{ flex: 1 }}>
      <View style={styles.footTotal}>
        <View>
          <Text style={styles.footLabel}>{t('invoiceForm.totalDue')}</Text>
          <Text style={styles.alt}>≈ {fmtAlt(totalUsd)}</Text>
        </View>
        <Text style={styles.footValue} numberOfLines={1} adjustsFontSizeToFit>{fmt(totalUsd)}</Text>
      </View>
      {!isValid ? <Text style={styles.footHint}>{t('invoiceForm.needReadings', { meters: missing })}</Text> : null}
      <Button
        title={existingInvoice ? t('invoiceForm.update') : t('invoiceForm.createTitle')}
        icon="send-outline"
        onPress={handleSave}
        loading={submitting}
        disabled={!isValid}
      />
    </View>
  ) : undefined;

  const status = isViewMode ? 'saved' : 'draft';
  const statusTc = status === 'saved' ? toneColors.success : toneColors.neutral;
  const dueSoon = !!dueDate && daysUntil(dueDate) <= 3;

  return (
    <Screen header={header} footer={footer} contentStyle={{ paddingTop: spacing.sm }}>
      {/* Summary */}
      <View style={styles.card}>
        <View style={styles.who}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{tenantName ? initials(tenantName) : '?'}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={1}>{tenantName || '—'}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {[roomCode ? t('billing.unit', { code: roomCode }) : null, propName].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: statusTc.bg }]}>
            <View style={[styles.dot, { backgroundColor: statusTc.fg }]} />
            <Text style={[styles.chipText, { color: statusTc.fg }]}>
              {status === 'saved' ? t('invoiceForm.saved') : t('invoiceForm.newInvoice')}
            </Text>
          </View>
        </View>
        <View style={styles.dueLine}>
          <Icon name="calendar-outline" size={13} color={dueSoon ? colors.danger : colors.muted} />
          <Text style={[styles.dueText, dueSoon && { color: colors.danger }]}>
            {t('billing.due', { date: dayLabel(dueDate, true) })}
          </Text>
          <Text style={styles.dueRate}>· {exchangeRate.toLocaleString()} ៛/$</Text>
        </View>
      </View>

      {remoteOnly ? null : (
        <>
          {/* Meter readings */}
          <Text style={styles.section}>{t('invoiceForm.readings')}</Text>
          <View style={{ gap: 10 }}>
            <MeterCard
              icon="flash"
              tone={toneColors.warning}
              label={t('billing.electricity')}
              unit="kWh"
              prev={prevKwh}
              rate={fmtUsd(kwhRateUsd)}
              value={currKwh}
              onChange={setCurrKwh}
              editable={!isViewMode}
              valid={kwhValid}
              usage={usageKwh}
              cost={fmt(elecUsd)}
              inputRef={kwhRef}
              autoFocus={!isViewMode && !existingInvoice}
              returnKeyType="next"
              onSubmit={() => waterRef.current?.focus()}
            />
            <MeterCard
              icon="water"
              tone={toneColors.info}
              label={t('billing.water')}
              unit="m³"
              prev={prevWater}
              rate={fmtUsd(waterRateUsd)}
              value={currWater}
              onChange={setCurrWater}
              editable={!isViewMode}
              valid={waterValid}
              usage={usageWater}
              cost={fmt(waterUsd)}
              inputRef={waterRef}
              returnKeyType="done"
            />
          </View>

          {/* Notes — tucked away until needed */}
          {isViewMode ? (
            notes ? (
              <>
                <Text style={styles.section}>{t('invoiceForm.notes')}</Text>
                <View style={styles.card}><Text style={styles.notes}>{notes}</Text></View>
              </>
            ) : null
          ) : showNotes ? (
            <>
              <Text style={styles.section}>{t('invoiceForm.notes')}</Text>
              <Input
                placeholder={t('invoiceForm.notesPlaceholder')}
                value={notes}
                onChangeText={setNotes}
                multiline
                maxLength={200}
                autoFocus={!notes}
              />
            </>
          ) : (
            <TouchableOpacity style={styles.addNote} onPress={() => setShowNotes(true)} hitSlop={8}>
              <Icon name="add" size={16} color={colors.primary} />
              <Text style={styles.addNoteText}>{t('invoiceForm.addNote')}</Text>
            </TouchableOpacity>
          )}

          {/* Breakdown */}
          <View style={styles.sectionRow}>
            <Text style={[styles.section, { marginTop: 0, marginBottom: 0 }]}>{t('invoiceForm.breakdown')}</Text>
            <Segments<Currency>
              style={{ width: 132 }}
              value={currency}
              onChange={setCurrency}
              options={[{ value: 'USD', label: '$ USD' }, { value: 'KHR', label: '៛ KHR' }]}
            />
          </View>
          <View style={[styles.card, styles.flush]}>
            {feeRows.filter(f => f.key === 'rent' || f.usd > 0).map((f, i) => (
              <Line key={f.key} first={i === 0} label={t(`invoiceForm.fees.${f.key}`)} value={fmt(f.usd)} />
            ))}
            <Line
              label={t('billing.electricity')}
              sub={kwhValid ? `${usageKwh.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh × ${fmtUsd(kwhRateUsd)}` : t('invoiceForm.pendingReading')}
              value={fmt(elecUsd)}
              muted={!kwhValid}
            />
            <Line
              label={t('billing.water')}
              sub={waterValid ? `${usageWater.toLocaleString(undefined, { maximumFractionDigits: 1 })} m³ × ${fmtUsd(waterRateUsd)}` : t('invoiceForm.pendingReading')}
              value={fmt(waterUsd)}
              muted={!waterValid}
            />
            {/* While editing, the live total sits in the footer instead */}
            {isViewMode ? (
              <View style={styles.totalRow}>
                <View>
                  <Text style={styles.totalLabel}>{t('invoiceForm.totalDue')}</Text>
                  <Text style={styles.alt}>≈ {fmtAlt(totalUsd)}</Text>
                </View>
                <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit>{fmt(totalUsd)}</Text>
              </View>
            ) : null}
          </View>
        </>
      )}
    </Screen>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function MeterCard({
  icon, tone, label, unit, prev, rate, value, onChange, editable, valid, usage, cost,
  inputRef, autoFocus, returnKeyType, onSubmit,
}: {
  icon: string; tone: { fg: string; bg: string }; label: string; unit: string; prev: number; rate: string;
  value: string; onChange: (v: string) => void; editable: boolean; valid: boolean; usage: number; cost: string;
  inputRef: React.RefObject<TextInput | null>; autoFocus?: boolean; returnKeyType: 'next' | 'done'; onSubmit?: () => void;
}) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const error = value !== '' && !valid;
  const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <View style={styles.meterCard}>
      <View style={styles.meterHead}>
        <View style={[styles.iconTile, { backgroundColor: tone.bg }]}><Icon name={icon} size={16} color={tone.fg} /></View>
        <Text style={[styles.rowTitle, { flex: 1 }]}>{label}</Text>
        <Text style={styles.rate}>{rate}/{unit}</Text>
      </View>

      <View style={styles.readings}>
        <View style={styles.prevBox}>
          <Text style={styles.boxLabel}>{t('invoiceForm.previousFull')}</Text>
          <Text style={styles.prevValue} numberOfLines={1}>{fmtNum(prev)} <Text style={styles.boxUnit}>{unit}</Text></Text>
        </View>
        <Icon name="arrow-forward" size={16} color={colors.muted} />
        {editable ? (
          <Pressable
            onPress={() => inputRef.current?.focus()}
            style={[styles.currBox, focused && styles.currBoxFocus, error && styles.currBoxError]}
          >
            <Text style={[styles.boxLabel, focused && { color: colors.primary }, error && { color: colors.danger }]}>
              {t('invoiceForm.current')}
            </Text>
            <View style={styles.currRow}>
              <TextInput
                ref={inputRef}
                style={styles.currInput}
                placeholder="—"
                placeholderTextColor={colors.border}
                keyboardType="decimal-pad"
                value={value}
                onChangeText={v => onChange(v.replace(',', '.'))}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                autoFocus={autoFocus}
                returnKeyType={returnKeyType}
                onSubmitEditing={onSubmit}
                blurOnSubmit={returnKeyType === 'done'}
              />
              <Text style={styles.boxUnit}>{unit}</Text>
            </View>
          </Pressable>
        ) : (
          <View style={[styles.currBox, { borderColor: colors.divider }]}>
            <Text style={styles.boxLabel}>{t('invoiceForm.current')}</Text>
            <Text style={styles.prevValue} numberOfLines={1}>{value || '—'} <Text style={styles.boxUnit}>{unit}</Text></Text>
          </View>
        )}
      </View>

      <View style={styles.meterFoot}>
        <Text
          style={[styles.usage, { color: value === '' ? colors.muted : error ? colors.danger : colors.success }]}
          numberOfLines={2}
        >
          {value === ''
            ? t('invoiceForm.enterCurrent')
            : error
              ? t('invoiceForm.mustBe', { prev: fmtNum(prev), unit })
              : t('invoiceForm.used', { usage: fmtNum(usage), unit, cost })}
        </Text>
        {editable && value !== String(prev) ? (
          <TouchableOpacity style={styles.sameBtn} onPress={() => onChange(String(prev))} activeOpacity={0.7}>
            <Text style={styles.sameText}>{t('invoiceForm.noChange')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function Line({ label, sub, value, muted, first }: { label: string; sub?: string; value: string; muted?: boolean; first?: boolean }) {
  return (
    <View style={[styles.line, !first && styles.sep]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.lineLabel}>{label}</Text>
        {sub ? <Text style={[styles.rowSub, muted && { color: colors.warning }]}>{sub}</Text> : null}
      </View>
      <Text style={[styles.lineValue, muted && { color: colors.muted }]}>{value}</Text>
    </View>
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
  sep: { borderTopWidth: 1, borderTopColor: colors.divider },

  section: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: spacing.xl, marginBottom: 10, paddingHorizontal: 4 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: 10, paddingLeft: 4 },

  // Summary
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 11, fontWeight: '600' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dueLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  dueText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  dueRate: { fontSize: 13, color: colors.muted },

  alt: { fontSize: 12, color: colors.muted, marginTop: 2 },

  // Rows
  iconTile: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },

  // Meters
  meterCard: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.divider, padding: spacing.lg },
  meterHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rate: { fontSize: 12, fontWeight: '500', color: colors.muted },
  readings: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  prevBox: { flex: 1, minWidth: 0, borderRadius: 12, backgroundColor: colors.bg, paddingHorizontal: 12, paddingVertical: 10 },
  currBox: {
    flex: 1, minWidth: 0, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface,
  },
  currBoxFocus: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  currBoxError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  boxLabel: { fontSize: 11, fontWeight: '600', color: colors.muted },
  boxUnit: { fontSize: 12, fontWeight: '500', color: colors.muted },
  prevValue: { fontSize: 18, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
  currRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  currInput: { flex: 1, minWidth: 0, fontSize: 20, fontWeight: '700', color: colors.ink, paddingVertical: 0 },
  meterFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10, minHeight: 28 },
  usage: { flex: 1, fontSize: 12, fontWeight: '600' },
  sameBtn: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 5 },
  sameText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },

  addNote: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: spacing.lg, paddingHorizontal: 4 },
  addNoteText: { fontSize: 13, fontWeight: '600', color: colors.primary },

  // Footer
  footTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 },
  footLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  footValue: { fontSize: 24, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, flexShrink: 1 },
  footHint: { fontSize: 12, color: colors.warning, fontWeight: '500', marginBottom: 8 },

  // Notes
  notes: { fontSize: 14, color: colors.ink, lineHeight: 20 },

  // Breakdown
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: spacing.lg },
  lineLabel: { fontSize: 14, color: colors.ink },
  lineValue: { fontSize: 14, fontWeight: '600', color: colors.ink },
  totalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    padding: spacing.lg, backgroundColor: colors.primarySoft, borderTopWidth: 1, borderTopColor: colors.primaryTint,
  },
  totalLabel: { fontSize: 14, fontWeight: '700', color: colors.primaryDark },
  totalValue: { fontSize: 24, fontWeight: '700', color: colors.primaryDark, letterSpacing: -0.5, flexShrink: 1 },
});
