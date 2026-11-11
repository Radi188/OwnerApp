import React, { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Text } from '../../components/Text';
import { useNavigation } from '@react-navigation/native';
import { chargesApi, fileUrl, num, pickList, pickOne, propertiesApi, type UploadFile } from '../../services/api';
import type { PropertyCharge } from '../../services/types';
import { Sheet } from '../../components/Sheet';
import { Input, chooseImage } from '../../components/form';
import PropertyLogo from '../../components/PropertyLogo';
import { TelegramJoinCard } from '../../components/TelegramLink';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { numeric, required, useForm } from '../../hooks/useForm';
import { Button, Card, ErrorView, Header, LoadingView, Screen, SelectField, SwitchRow, TextField } from '../../components/ui';
import { colors, font, radius, spacing } from '../../theme';
import { errMsg, money } from '../../utils/format';
import { toast } from '../../components/Toast';

const TYPES = ['Apartment', 'Room Rental', 'Shop House', 'Villa', 'Land'].map(v => ({ label: v, value: v }));
const STATUSES = ['Active', 'Maintenance'].map(v => ({ label: v, value: v }));
const s = (v: any) => (v == null ? '' : String(v));

const EMPTY = {
  name: '', type: 'Apartment', status: 'Active', address: '', description: '', ownerName: '', ownerPhone: '',
  numberOfFloors: '', totalUnits: '', electricityPricePerKwh: '', waterPricePerM3: '', exchangeRate: '',
  billingDay: '1', dueDay: '5', reminderBeforeDueDays: '1', bankName: '', bankAccountName: '', bankAccountNumber: '',
  // Tenancy defaults for move-in / move-out (booleans kept as 'true' / 'false' strings; multipart accepts both)
  defaultBillingStrategy: 'anniversary', defaultMoveOutRentMode: 'prorated', dailyRateBasis: 'actual',
  autoApplyDeposit: 'false', refundUnusedDays: 'false',
  // One rule per line, printed as bullets at the bottom of every invoice (FRONTEND_UPDATE §4)
  invoiceNotes: '',
};

const PRICE_KEYS = ['electricityPricePerKwh', 'waterPricePerM3'];
/** Prices keep up to 4 decimals (e.g. 0.625) — never rounded to 2. */
const price4 = (label: string) => (v: any) =>
  numeric(label)(v) ?? (v !== '' && !/^\d+(\.\d{1,4})?$/.test(String(v).trim()) ? `${label}: up to 4 decimals` : null);

export default function PropertySettingsScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const { propertyId, can, switchProperty } = useAuth();
  const canEdit = can('edit', 'property');
  // Newly picked images, uploaded with Save (multipart `logo` / `paymentQrCode`)
  const [logoFile, setLogoFile] = useState<UploadFile | null>(null);
  const [qrFile, setQrFile] = useState<UploadFile | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const { data, loading, error, refresh } = useApi(
    async () => (propertyId ? pickOne<any>(await propertiesApi.get(propertyId), 'properties', 'property') : null),
    [propertyId],
    { refetchOnFocus: false },
  );

  const f = useForm(EMPTY, {
    name: required('Name'),
    numberOfFloors: numeric('Floors'),
    totalUnits: numeric('Total units'),
    electricityPricePerKwh: price4('Electricity price'),
    waterPricePerM3: price4('Water price'),
    invoiceNotes: v => (String(v ?? '').length > 2000 ? 'Invoice notes: at most 2000 characters' : null),
    exchangeRate: numeric('Exchange rate'),
    billingDay: numeric('Billing day'),
    dueDay: numeric('Due day'),
    reminderBeforeDueDays: numeric('Reminder days'),
  });

  useEffect(() => {
    if (!data) return;
    const next: any = {};
    (Object.keys(EMPTY) as (keyof typeof EMPTY)[]).forEach(k => {
      const v = data[k];
      // "0.3000" → "0.3": show the price without padding zeros (still up to 4 decimals)
      next[k] = v == null || v === 'null' ? EMPTY[k] : PRICE_KEYS.includes(k) ? String(Number(v)) : s(v);
    });
    f.setValues(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const save = f.submit(async v => {
    if (!propertyId) throw new Error('No property selected');
    await propertiesApi.update(propertyId, { ...v, logo: logoFile ?? undefined, paymentQrCode: qrFile ?? undefined });
    // Keep the header name in sync if it was renamed
    if (data?.name !== v.name) await switchProperty(propertyId, v.name).catch(() => {});
  }, () => nav.goBack(), { success: 'Property settings updated' });

  const fld = (key: keyof typeof EMPTY, label: string, extra: any = {}) => (
    <TextField label={label} editable={canEdit} {...f.field(key)} {...extra} />
  );

  return (
    <Screen
      header={<Header title="Property settings" subtitle={data?.name} />}
      footer={canEdit && data ? <Button title="Save settings" onPress={save} loading={f.submitting} style={{ flex: 1 }} /> : undefined}
    >
      {loading ? <LoadingView /> : error || !data ? <ErrorView message={error ?? 'Select a property first'} onRetry={refresh} /> : (
        <>
          {/* Property identity: logo, name, type · address */}
          <Card style={styles.brand}>
            <PropertyLogo logo={data.logo} uri={logoFile?.uri} name={f.values.name || data.name} size={76} />
            <View style={styles.brandBody}>
              <Text style={styles.brandName} numberOfLines={2}>{f.values.name || data.name}</Text>
              <Text style={styles.brandMeta} numberOfLines={2}>
                {[f.values.type, f.values.address].filter(Boolean).join(' · ') || '—'}
              </Text>
              {canEdit ? (
                <Pressable
                  onPress={async () => { const file = await chooseImage('Property logo'); if (file) setLogoFile(file); }}
                  style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.6 }]}
                  hitSlop={6}
                >
                  <Icon name="image-outline" size={15} color={colors.primary} />
                  <Text style={styles.linkText}>{data.logo || logoFile ? 'Change logo' : 'Add logo'}</Text>
                  {logoFile ? <Text style={styles.newTag}>New</Text> : null}
                </Pressable>
              ) : null}
            </View>
          </Card>

          <Card style={styles.gap}>
            <Text style={styles.section}>General</Text>
            {fld('name', 'Property name', { required: true })}
            <SelectField label="Type" icon="business-outline" value={f.values.type} options={TYPES} onChange={v => f.set('type', v)} disabled={!canEdit} />
            <SelectField label="Status" value={f.values.status} options={STATUSES} onChange={v => f.set('status', v)} disabled={!canEdit} />
            {fld('address', 'Address')}
            {fld('description', 'Description', { multiline: true })}
            <View style={styles.row}>
              <View style={styles.half}>{fld('numberOfFloors', 'Floors', { keyboardType: 'number-pad' })}</View>
              <View style={styles.half}>{fld('totalUnits', 'Total units', { keyboardType: 'number-pad' })}</View>
            </View>
          </Card>

          <Card style={styles.gap}>
            <Text style={styles.section}>Owner</Text>
            {fld('ownerName', 'Owner name')}
            {fld('ownerPhone', 'Owner phone', { keyboardType: 'phone-pad' })}
          </Card>

          <Card style={styles.gap}>
            <Text style={styles.section}>Utility rates & currency</Text>
            <View style={styles.row}>
              <View style={styles.half}>{fld('electricityPricePerKwh', 'Electricity / kWh', { keyboardType: 'decimal-pad', prefix: '$' })}</View>
              <View style={styles.half}>{fld('waterPricePerM3', 'Water / m³', { keyboardType: 'decimal-pad', prefix: '$' })}</View>
            </View>
            {fld('exchangeRate', 'Exchange rate (KHR per USD)', { keyboardType: 'number-pad', prefix: '៛' })}
          </Card>

          <Card style={styles.gap}>
            <Text style={styles.section}>Billing cycle</Text>
            <View style={styles.row}>
              <View style={styles.third}>{fld('billingDay', 'Billing day', { keyboardType: 'number-pad' })}</View>
              <View style={styles.third}>{fld('dueDay', 'Due day', { keyboardType: 'number-pad' })}</View>
              <View style={styles.third}>{fld('reminderBeforeDueDays', 'Remind (days)', { keyboardType: 'number-pad' })}</View>
            </View>
            {/* Anniversary tenants get the same grace period unified tenants get between billingDay and dueDay */}
            {num(f.values.dueDay) > num(f.values.billingDay) ? (
              <Text style={styles.hint}>{t('propertySettings.graceHint', { count: num(f.values.dueDay) - num(f.values.billingDay) })}</Text>
            ) : null}
          </Card>

          <Card style={styles.gap}>
            <Text style={styles.section}>{t('propertySettings.invoiceNotes')}</Text>
            <Text style={[styles.hint, { marginTop: -6, marginBottom: 12 }]}>{t('propertySettings.invoiceNotesHint')}</Text>
            {fld('invoiceNotes', t('propertySettings.invoiceNotesLabel'), { multiline: true, maxLength: 2000, numberOfLines: 5, placeholder: t('propertySettings.invoiceNotesPlaceholder') })}
            {f.values.invoiceNotes ? (
              <View style={styles.notesPreview}>
                {String(f.values.invoiceNotes).split('\n').filter(l => l.trim()).map((l, i) => (
                  <Text key={i} style={styles.notesLine}>•  {l.trim()}</Text>
                ))}
              </View>
            ) : null}
          </Card>

          <Card style={styles.gap}>
            <Text style={styles.section}>{t('propertySettings.tenancy')}</Text>
            <Text style={[styles.hint, { marginTop: -6, marginBottom: 12 }]}>{t('propertySettings.tenancyHint')}</Text>
            <SelectField
              label={t('propertySettings.howPay')}
              variant="sheet"
              value={f.values.defaultBillingStrategy}
              disabled={!canEdit}
              onChange={v => f.set('defaultBillingStrategy', v)}
              options={(['anniversary', 'unified'] as const).map(v => ({ value: v, label: t(`tenancy.billing.${v}`), subtitle: t(`tenancy.billingHint.${v}`) }))}
            />
            <SelectField
              label={t('propertySettings.extraDays')}
              variant="sheet"
              value={f.values.defaultMoveOutRentMode}
              disabled={!canEdit}
              onChange={v => f.set('defaultMoveOutRentMode', v)}
              options={(['prorated', 'full', 'none'] as const).map(v => ({ value: v, label: t(`tenancy.rentMode.${v}`) }))}
            />
            <SelectField
              label={t('propertySettings.dailyRate')}
              variant="sheet"
              value={f.values.dailyRateBasis}
              disabled={!canEdit}
              onChange={v => f.set('dailyRateBasis', v)}
              options={(['actual', 'fixed30'] as const).map(v => ({ value: v, label: t(`tenancy.rate.${v}`) }))}
            />
            <SwitchRow
              label={t('tenancy.applyDeposit')}
              value={f.values.autoApplyDeposit === 'true'}
              onChange={v => canEdit && f.set('autoApplyDeposit', v ? 'true' : 'false')}
            />
            <SwitchRow
              label={t('tenancy.refundUnused')}
              value={f.values.refundUnusedDays === 'true'}
              onChange={v => canEdit && f.set('refundUnusedDays', v ? 'true' : 'false')}
            />
          </Card>

          {propertyId ? <ChargesCard propertyId={propertyId} canEdit={canEdit} /> : null}

          <Card style={styles.gap}>
            <Text style={styles.section}>Payment info</Text>
            <Text style={[styles.hint, { marginTop: -6, marginBottom: 12 }]}>
              Shown to tenants on invoices and in the tenant app so they can pay by bank transfer or KHQR.
            </Text>

            {/* What tenants see: QR + bank details */}
            <View style={styles.payCard}>
              {qrFile?.uri || data.paymentQrCode ? (
                <Pressable onPress={() => setQrOpen(true)} style={styles.qrFrame} accessibilityLabel="Payment QR code, tap to enlarge">
                  <Image source={{ uri: qrFile?.uri ?? fileUrl(data.paymentQrCode) }} style={styles.qr} resizeMode="contain" />
                  <View style={styles.qrZoom}><Icon name="expand-outline" size={14} color={colors.white} /></View>
                </Pressable>
              ) : (
                <View style={[styles.qrFrame, styles.qrEmpty]}>
                  <Icon name="qr-code-outline" size={40} color={colors.muted} />
                  <Text style={styles.qrEmptyText}>No payment QR yet</Text>
                </View>
              )}
              <View style={styles.bankLines}>
                <BankLine icon="business-outline" label="Bank" value={f.values.bankName} />
                <BankLine icon="person-outline" label="Account name" value={f.values.bankAccountName} />
                <BankLine icon="card-outline" label="Account number" value={f.values.bankAccountNumber} mono />
              </View>
              {canEdit ? (
                <Button
                  title={data.paymentQrCode || qrFile ? 'Replace QR code' : 'Upload QR code'}
                  icon="qr-code-outline"
                  variant="secondary"
                  small
                  onPress={async () => { const file = await chooseImage('Payment QR code'); if (file) setQrFile(file); }}
                  style={{ marginTop: spacing.md, alignSelf: 'stretch' }}
                />
              ) : null}
              {qrFile ? <Text style={[styles.hint, { textAlign: 'center' }]}>New QR code — tap Save settings to upload it.</Text> : null}
            </View>

            {canEdit ? (
              <View style={{ marginTop: spacing.lg }}>
                {fld('bankName', 'Bank name')}
                {fld('bankAccountName', 'Account name')}
                {fld('bankAccountNumber', 'Account number', { keyboardType: 'number-pad' })}
              </View>
            ) : null}
          </Card>

          <TelegramJoinCard propertyName={data.name} style={styles.gap} />

          <QrViewer visible={qrOpen} uri={qrFile?.uri ?? fileUrl(data.paymentQrCode)} title={f.values.bankName || data.name} onClose={() => setQrOpen(false)} />
        </>
      )}
    </Screen>
  );
}

function BankLine({ icon, label, value, mono }: { icon: string; label: string; value?: string; mono?: boolean }) {
  return (
    <View style={styles.bankLine}>
      <Icon name={icon} size={15} color={colors.muted} />
      <Text style={styles.bankLabel}>{label}</Text>
      <Text style={[styles.bankValue, mono && styles.mono, !value && { color: colors.muted }]} numberOfLines={1} selectable>
        {value || 'Not set'}
      </Text>
    </View>
  );
}

/** Full-screen payment QR, e.g. to let a tenant scan it from the phone. */
function QrViewer({ visible, uri, title, onClose }: { visible: boolean; uri?: string; title?: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.viewer} onPress={onClose}>
        <View style={[styles.viewerTop, { top: insets.top + 12 }]}>
          <Text style={styles.viewerTitle} numberOfLines={1}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.viewerClose} hitSlop={10} accessibilityLabel="Close">
            <Icon name="close" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
        {uri ? (
          <View style={styles.viewerCard}>
            <Image source={{ uri }} style={styles.viewerImage} resizeMode="contain" />
          </View>
        ) : null}
        <Text style={styles.viewerHint}>Tap anywhere to close</Text>
      </Pressable>
    </Modal>
  );
}

// ─── Property charges (added to every tenant's invoice) ─────────────────────

function ChargesCard({ propertyId, canEdit }: { propertyId: number; canEdit: boolean }) {
  const { t } = useTranslation();
  const charges = useApi(async () => pickList<PropertyCharge>(await chargesApi.list(propertyId), 'charges'), [propertyId]);
  const [editing, setEditing] = useState<Partial<PropertyCharge> | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const open = (c: Partial<PropertyCharge>) => {
    setEditing(c);
    setName(c.name ?? '');
    setAmount(c.amount != null ? String(num(c.amount)) : '');
  };

  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); await charges.reload(); } catch (e) { toast.error(errMsg(e)); }
  };

  const save = async () => {
    if (!editing || !name.trim() || amount === '' || num(amount) < 0) return;
    setSaving(true);
    await run(() => (editing.id
      ? chargesApi.update(propertyId, editing.id, { name: name.trim(), amount: num(amount) })
      : chargesApi.create(propertyId, { name: name.trim(), amount: num(amount), isActive: true })));
    setSaving(false);
    setEditing(null);
  };

  const remove = (c: PropertyCharge) => Alert.alert(t('propertySettings.deleteCharge'), t('propertySettings.deleteChargeMsg', { name: c.name }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('unitDetail.delete'), style: 'destructive', onPress: () => run(() => chargesApi.remove(propertyId, c.id)) },
  ]);

  const list = charges.data ?? [];

  return (
    <Card style={styles.gap}>
      <View style={styles.chargeHead}>
        <Text style={[styles.section, { marginBottom: 0, flex: 1 }]}>{t('propertySettings.charges')}</Text>
        {canEdit ? (
          <TouchableOpacity onPress={() => open({})} hitSlop={8} style={styles.addBtn}>
            <Icon name="add" size={16} color={colors.primary} />
            <Text style={styles.addText}>{t('propertySettings.addCharge')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={[styles.hint, { marginBottom: 10 }]}>{t('propertySettings.chargesHint')}</Text>

      {charges.loading ? null : list.length === 0 ? (
        <Text style={styles.emptyCharges}>{t('propertySettings.noCharges')}</Text>
      ) : list.map((c, i) => (
        <Pressable
          key={c.id}
          onPress={() => canEdit && open(c)}
          onLongPress={() => canEdit && remove(c)}
          style={({ pressed }) => [styles.chargeRow, i > 0 && styles.chargeSep, pressed && { opacity: 0.7 }]}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.chargeName, !c.isActive && { color: colors.muted }]} numberOfLines={1}>{c.name}</Text>
            <Text style={styles.chargeAmount}>{money(c.amount, { decimals: 2 })}{!c.isActive ? ` · ${t('propertySettings.paused')}` : ''}</Text>
          </View>
          <SwitchToggle
            value={!!c.isActive}
            disabled={!canEdit}
            onChange={v => run(() => chargesApi.update(propertyId, c.id, { isActive: v }))}
          />
        </Pressable>
      ))}

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? t('propertySettings.editCharge') : t('propertySettings.addCharge')}
        footer={
          <View style={{ gap: 10 }}>
            <Button title={t('propertySettings.saveCharge')} onPress={save} loading={saving} disabled={!name.trim() || amount === ''} />
            {editing?.id ? (
              <Button title={t('propertySettings.deleteCharge')} variant="danger" icon="trash-outline"
                onPress={() => { const c = editing as PropertyCharge; setEditing(null); remove(c); }} />
            ) : null}
          </View>
        }
      >
        <Input label={t('propertySettings.chargeName')} placeholder="Internet" value={name} onChangeText={setName} />
        <Input label={t('payment.amount')} prefix="$" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} hint={t('propertySettings.chargeAmountHint')} />
      </Sheet>
    </Card>
  );
}

/** Compact toggle (the SwitchRow without its label). */
function SwitchToggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Pressable onPress={() => !disabled && onChange(!value)} hitSlop={8} style={[styles.toggle, value && styles.toggleOn, disabled && { opacity: 0.5 }]}>
      <View style={[styles.knob, value && { transform: [{ translateX: 18 }] }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { ...font.h3, marginBottom: spacing.md },
  notesPreview: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  notesLine: { fontSize: 13, color: colors.text, lineHeight: 19 },

  // Identity
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  brandBody: { flex: 1, minWidth: 0 },
  brandName: { fontSize: 19, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  brandMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 3 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, alignSelf: 'flex-start' },
  linkText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  newTag: {
    fontSize: 10, fontWeight: '800', color: colors.white, backgroundColor: colors.primary,
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, overflow: 'hidden', marginLeft: 2,
  },

  // Payment info
  payCard: {
    alignItems: 'center', padding: spacing.lg, borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.divider,
  },
  qrFrame: {
    width: 200, height: 200, borderRadius: radius.md, backgroundColor: colors.white, padding: 10,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  qr: { width: '100%', height: '100%' },
  qrZoom: {
    position: 'absolute', right: 8, bottom: 8, width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(23,21,59,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  qrEmpty: { borderStyle: 'dashed', gap: 8 },
  qrEmptyText: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  bankLines: { alignSelf: 'stretch', marginTop: spacing.lg, gap: 10 },
  bankLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bankLabel: { fontSize: 13, color: colors.textSecondary, width: 110 },
  bankValue: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink, textAlign: 'right' },
  mono: { letterSpacing: 1, fontVariant: ['tabular-nums'] },

  // QR viewer
  viewer: { flex: 1, backgroundColor: 'rgba(10,9,28,0.92)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  viewerTop: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  viewerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.white },
  viewerClose: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  viewerCard: { width: '100%', maxWidth: 380, aspectRatio: 1, backgroundColor: colors.white, borderRadius: 24, padding: 18 },
  viewerImage: { width: '100%', height: '100%' },
  viewerHint: { marginTop: 18, fontSize: 12, color: 'rgba(255,255,255,0.55)' },
  hint: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  chargeHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  addText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  emptyCharges: { fontSize: 13, color: colors.muted, paddingVertical: 8 },
  chargeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  chargeSep: { borderTopWidth: 1, borderTopColor: colors.divider },
  chargeName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  chargeAmount: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  toggle: { width: 46, height: 28, borderRadius: radius.pill, backgroundColor: colors.border, padding: 3 },
  toggleOn: { backgroundColor: colors.primary },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  third: { flex: 1 },
  gap: { marginTop: spacing.lg },
});
