import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { Sheet } from './Sheet';
import { Input, Select, DateField } from './form';
import { Button } from './ui';
import { errMsg, money, todayYMD } from '../utils/format';
import { num, payableAmount, paymentsApi } from '../services/api';
import type { PaymentMethod } from '../services/types';
import { colors, radius } from '../theme';

const METHODS: PaymentMethod[] = ['cash', 'bank_transfer', 'khqr', 'other'];

type InvoiceLike = {
  id: number;
  invoiceNumber?: string;
  totalAmount?: any;
  remainingAmount?: any;
  pendingAmount?: any;
  tenant?: { name?: string } | null;
};

/**
 * "Record payment" bottom sheet. Pre-fills the amount with remaining − pending (FRONTEND_GUIDE §13),
 * offers "Pay in full", and recovers from the server's overpayment error by using the max it allows.
 */
export default function RecordPaymentSheet({
  visible, invoice, onClose, onSaved,
}: { visible: boolean; invoice: InvoiceLike | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const max = payableAmount(invoice);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [date, setDate] = useState(todayYMD());
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  // Reset every time the sheet opens
  useEffect(() => {
    if (!visible) return;
    setAmount(max ? String(max) : '');
    setMethod('cash');
    setDate(todayYMD());
    setRef('');
    setNote('');
    setError(undefined);
  }, [visible, max]);

  const value = num(amount);
  const tooMuch = max > 0 && value > max + 0.0001;

  const save = async () => {
    if (!invoice) return;
    if (!(value > 0)) { setError(t('payment.amountRequired')); return; }
    if (tooMuch) { setError(t('payment.tooMuch', { max: money(max, { decimals: 2 }) })); return; }
    setSaving(true);
    setError(undefined);
    try {
      await paymentsApi.create({
        invoiceId: invoice.id,
        amount: value,
        paymentMethod: method,
        paymentDate: date || undefined,
        transactionId: ref.trim() || undefined,
        note: note.trim() || undefined,
      });
      onSaved();
    } catch (e) {
      const msg = errMsg(e);
      // "Payment exceeds the remaining balance. Maximum allowed is 30.00." → put 30.00 in the field
      const m = /maximum allowed is\s*([\d.,]+)/i.exec(msg);
      if (m) setAmount(m[1].replace(/,/g, ''));
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('payment.recordTitle')}
      footer={
        <Button
          title={value > 0 ? t('payment.saveAmount', { amount: money(value, { decimals: 2 }) }) : t('payment.save')}
          icon="checkmark-circle-outline"
          variant="success"
          onPress={save}
          loading={saving}
          disabled={!value || tooMuch}
        />
      }
    >
      {invoice ? (
        <View style={styles.summary}>
          <Text style={styles.summaryTitle} numberOfLines={1}>
            {invoice.invoiceNumber}{invoice.tenant?.name ? ` · ${invoice.tenant.name}` : ''}
          </Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText}>{t('payment.remaining')} <Text style={styles.summaryStrong}>{money(invoice.remainingAmount ?? invoice.totalAmount, { decimals: 2 })}</Text></Text>
            <Text style={styles.summaryText}>{t('payment.pending')} <Text style={styles.summaryStrong}>{money(invoice.pendingAmount ?? 0, { decimals: 2 })}</Text></Text>
          </View>
        </View>
      ) : null}

      <Input
        label={t('payment.amount')}
        prefix="$"
        icon="cash-outline"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={v => { setAmount(v.replace(',', '.')); setError(undefined); }}
        error={error}
        hint={max ? t('payment.maxHint', { max: money(max, { decimals: 2 }) }) : undefined}
      />
      {max > 0 && value !== max ? (
        <Pressable onPress={() => { setAmount(String(max)); setError(undefined); }} style={styles.fullChip}>
          <Text style={styles.fullText}>{t('payment.payInFull', { amount: money(max, { decimals: 2 }) })}</Text>
        </Pressable>
      ) : null}

      <Select<PaymentMethod>
        label={t('payment.method')}
        variant="chips"
        value={method}
        onChange={setMethod}
        options={METHODS.map(m => ({ value: m, label: t(`payment.methods.${m}`) }))}
      />
      <DateField label={t('payment.date')} value={date} onChange={setDate} />
      {method === 'bank_transfer' || method === 'khqr' ? (
        <Input label={t('payment.reference')} icon="barcode-outline" value={ref} onChangeText={setRef} autoCapitalize="characters" />
      ) : null}
      <Input label={t('payment.note')} value={note} onChangeText={setNote} multiline maxLength={200} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  summary: { backgroundColor: colors.bg, borderRadius: radius.lg, padding: 12, marginBottom: 14 },
  summaryTitle: { fontSize: 13, fontWeight: '600', color: colors.ink },
  summaryRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  summaryText: { fontSize: 12, color: colors.textSecondary },
  summaryStrong: { fontWeight: '700', color: colors.ink },
  fullChip: {
    alignSelf: 'flex-start', marginTop: -6, marginBottom: 14, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.pill, backgroundColor: colors.primarySoft,
  },
  fullText: { fontSize: 12, fontWeight: '600', color: colors.primary },
});
