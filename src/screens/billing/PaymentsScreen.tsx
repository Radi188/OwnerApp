import React, { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Text } from '../../components/Text';
import Segments from '../../components/Segments';
import { EmptyState, ErrorView, LoadingView, Screen } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { dayLabel } from '../../i18n';
import { fileUrl, paymentsApi, pickList } from '../../services/api';
import type { Payment } from '../../services/types';
import { colors, radius, spacing, toneColors } from '../../theme';
import { errMsg, money } from '../../utils/format';

type View_ = 'pending' | 'all';
const RECORD_TONE = { verified: toneColors.success, pending: toneColors.warning, rejected: toneColors.danger };

/** Payments list + "to verify" queue for tenant-submitted payments (FRONTEND_GUIDE §13). */
export default function PaymentsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { can, propertyId } = useAuth();
  const [view, setView] = useState<View_>('pending');
  const [busyId, setBusyId] = useState<number | null>(null);

  const { data, loading, error, refresh, refreshing, reload } = useApi(
    async () => pickList<Payment>(await paymentsApi.list({ status: view === 'pending' ? 'pending' : undefined, sort: '-createdAt', limit: 100 }), 'payments'),
    [view, propertyId],
  );
  const list = data ?? [];
  const canVerify = can('verify', 'payment');

  const act = async (p: Payment, status: 'verified' | 'rejected', note?: string) => {
    setBusyId(p.id);
    try {
      await paymentsApi.verify(p.id, status, note);
      await reload();
    } catch (e) {
      Alert.alert(t('common.error'), errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const reject = (p: Payment) => {
    if ((Alert as any).prompt) {
      (Alert as any).prompt(t('invoiceView.rejectTitle'), t('invoiceView.rejectMsg'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('invoiceView.reject'), style: 'destructive', onPress: (note?: string) => act(p, 'rejected', note || undefined) },
      ]);
    } else {
      Alert.alert(t('invoiceView.rejectTitle'), money(p.amount, { decimals: 2 }), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('invoiceView.reject'), style: 'destructive', onPress: () => act(p, 'rejected') },
      ]);
    }
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => nav.goBack()} hitSlop={6} accessibilityLabel="Back">
          <Icon name="chevron-back" size={20} color={colors.ink} />
        </TouchableOpacity>
        <Text style={[styles.title, { flex: 1 }]}>{t('payments.title')}</Text>
      </View>
      <Segments<View_>
        style={{ marginTop: 12 }}
        value={view}
        onChange={setView}
        options={[
          { value: 'pending', label: t('payments.toVerify'), count: view === 'pending' ? list.length : undefined },
          { value: 'all', label: t('payments.all') },
        ]}
      />
    </View>
  );

  return (
    <Screen header={header} refreshing={refreshing} onRefresh={refresh} contentStyle={{ paddingTop: spacing.md }}>
      {loading ? <LoadingView /> : error ? <ErrorView message={error} onRetry={refresh} /> : list.length === 0 ? (
        <EmptyState
          icon={view === 'pending' ? 'checkmark-done-outline' : 'cash-outline'}
          title={view === 'pending' ? t('payments.nothingToVerify') : t('payments.none')}
          message={view === 'pending' ? t('payments.nothingToVerifyHint') : undefined}
        />
      ) : (
        <View style={{ gap: 10 }}>
          {list.map(p => {
            const tone = RECORD_TONE[p.status as keyof typeof RECORD_TONE] ?? toneColors.neutral;
            const inv = p.invoice;
            const receipt = fileUrl(p.attachment);
            return (
              <Pressable
                key={p.id}
                onPress={() => inv?.id && nav.navigate('InvoiceDetail', { invoiceId: inv.id })}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
              >
                <View style={styles.top}>
                  <View style={[styles.tile, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.tileText, { color: tone.fg }]} numberOfLines={1} adjustsFontSizeToFit>{inv?.unit?.unitCode ?? '—'}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>{inv?.tenant?.name ?? t('billing.tenant')}</Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {[t(`payment.methods.${p.paymentMethod ?? 'other'}`), dayLabel(p.paymentDate, true), p.transactionId].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.amount}>{money(p.amount, { decimals: 2 })}</Text>
                    <Text style={[styles.status, { color: tone.fg }]}>{t(`invoiceView.rec.${p.status ?? 'verified'}`)}</Text>
                  </View>
                </View>

                {inv?.invoiceNumber || receipt || p.note ? (
                  <View style={styles.meta}>
                    {inv?.invoiceNumber ? <Text style={styles.metaText} numberOfLines={1}>{inv.invoiceNumber}</Text> : null}
                    {receipt ? (
                      // Signed image link (expires after ~6 h; reloading the list gives a fresh one)
                      <TouchableOpacity style={styles.receipt} onPress={() => Linking.openURL(receipt)} hitSlop={8}>
                        <Icon name="image-outline" size={13} color={colors.primary} />
                        <Text style={styles.receiptText}>{t('payments.receipt')}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {p.note ? <Text style={[styles.metaText, { flexBasis: '100%' }]} numberOfLines={2}>“{p.note}”</Text> : null}
                  </View>
                ) : null}

                {p.status === 'pending' && canVerify ? (
                  <View style={styles.actions}>
                    <TouchableOpacity style={[styles.btn, styles.reject]} onPress={() => reject(p)} disabled={busyId === p.id}>
                      <Icon name="close" size={16} color={colors.danger} />
                      <Text style={[styles.btnText, { color: colors.danger }]}>{t('invoiceView.reject')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btn, styles.verify]} onPress={() => act(p, 'verified')} disabled={busyId === p.id}>
                      <Icon name="checkmark" size={16} color={colors.white} />
                      <Text style={[styles.btnText, { color: colors.white }]}>{t('invoiceView.verify')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center',
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.divider, padding: spacing.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 52, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tileText: { fontSize: 13, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  sub: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  amount: { fontSize: 15, fontWeight: '700', color: colors.ink },
  status: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.divider },
  metaText: { fontSize: 12, color: colors.muted },
  receipt: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  receiptText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { flex: 1, height: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  reject: { backgroundColor: colors.dangerSoft },
  verify: { backgroundColor: colors.success },
  btnText: { fontSize: 14, fontWeight: '600' },
});
