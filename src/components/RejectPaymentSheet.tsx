import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { Sheet } from './Sheet';
import { Input } from './form';
import { Button } from './ui';
import { toast } from './Toast';
import { ApiError, paymentsApi } from '../services/api';
import { colors, radius } from '../theme';
import { money } from '../utils/format';

/**
 * Reject a pending tenant payment with a reason (FRONTEND_UPDATE 2026-11-11 §11). The reason is
 * sent as `note` and shown to the tenant (Telegram + app). Works on iOS and Android
 * (Alert.prompt is iOS-only).
 */
export default function RejectPaymentSheet({
  payment, onClose, onDone,
}: {
  payment: { id: number; amount: any; tenantName?: string } | null;
  onClose: () => void;
  /** Called after reject — and after a 409 (someone else already handled it), so the list refreshes. */
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (payment) { setReason(''); setError(undefined); } }, [payment]);

  const submit = async () => {
    if (!payment) return;
    if (!reason.trim()) { setError(t('paymentReject.reasonRequired')); return; }
    setBusy(true);
    try {
      await paymentsApi.verify(payment.id, 'rejected', reason.trim());
      toast.success(t('payments.rejected'));
      onClose();
      onDone();
    } catch (e) {
      const err = e as ApiError;
      if (err?.status === 409) {
        toast.info(t('paymentReject.alreadyHandled'));
        onClose();
        onDone();
      } else {
        setError(err?.message ?? String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={!!payment}
      onClose={onClose}
      title={t('paymentReject.title')}
      footer={<Button title={t('invoiceView.reject')} icon="close-circle-outline" variant="danger" onPress={submit} loading={busy} />}
    >
      {payment ? (
        <View style={styles.summary}>
          <Text style={styles.amount}>{money(payment.amount, { decimals: 2 })}</Text>
          {payment.tenantName ? <Text style={styles.who}>{payment.tenantName}</Text> : null}
        </View>
      ) : null}
      <Text style={styles.hint}>{t('paymentReject.hint')}</Text>
      <Input
        label={t('paymentReject.reason')}
        placeholder={t('paymentReject.placeholder')}
        value={reason}
        onChangeText={v => { setReason(v); setError(undefined); }}
        multiline
        maxLength={300}
        error={error}
        autoFocus
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  summary: { backgroundColor: colors.dangerSoft, borderRadius: radius.lg, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  amount: { fontSize: 20, fontWeight: '800', color: colors.danger },
  who: { fontSize: 13, color: colors.textSecondary, flex: 1 },
  hint: { fontSize: 13, color: colors.textSecondary, marginBottom: 12, lineHeight: 19 },
});
