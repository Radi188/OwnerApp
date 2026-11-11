import React, { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Text } from '../../components/Text';
import { Sheet } from '../../components/Sheet';
import { Input, chooseImage } from '../../components/form';
import RecordPaymentSheet from '../../components/RecordPaymentSheet';
import RejectPaymentSheet from '../../components/RejectPaymentSheet';
import { downloadAndOpen, MIME } from '../../services/files';
import { dayLabel, monthLabel } from '../../i18n';
import { invoicesApi, num, payableAmount, paymentsApi, pickOne } from '../../services/api';
import type { Invoice, Payment } from '../../services/types';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { Button, ErrorView, LoadingView, ProgressBar, Screen } from '../../components/ui';
import { colors, radius, spacing, toneColors } from '../../theme';
import { errMsg, initials, money, riel } from '../../utils/format';
import { toast } from '../../components/Toast';

const LINE_ICON: Record<string, string> = {
  rent: 'home-outline', electricity: 'flash-outline', water: 'water-outline', parking: 'car-outline',
  internet: 'wifi-outline', garbage: 'trash-outline', management: 'briefcase-outline', maintenance: 'construct-outline',
  charge: 'pricetag-outline', additional: 'add-circle-outline',
};

const PAYMENT_TONE = { paid: toneColors.success, partial: toneColors.warning, unpaid: toneColors.danger, cancelled: toneColors.neutral };
const RECORD_TONE = { verified: toneColors.success, pending: toneColors.warning, rejected: toneColors.danger };

/** Older API responses may lack the balance fields — derive them from status/payments. */
function withBalance(inv: any): Invoice {
  if (!inv || inv.paymentStatus) return inv;
  const verified = (inv.payments ?? []).filter((p: any) => (p.status ?? 'verified') === 'verified').reduce((s: number, p: any) => s + num(p.amount), 0);
  const pending = (inv.payments ?? []).filter((p: any) => p.status === 'pending').reduce((s: number, p: any) => s + num(p.amount), 0);
  const remaining = Math.max(0, num(inv.totalAmount) - verified);
  return {
    ...inv,
    paidAmount: verified,
    pendingAmount: pending,
    remainingAmount: remaining,
    paymentStatus: inv.status === 'cancelled' ? 'cancelled' : remaining <= 0 ? 'paid' : verified > 0 ? 'partial' : 'unpaid',
    isOverdue: inv.status === 'overdue',
    daysOverdue: 0,
  };
}

export default function InvoiceDetailScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { invoiceId } = useRoute<any>().params;
  const { can } = useAuth();
  const [paySheet, setPaySheet] = useState(false);
  const [moreSheet, setMoreSheet] = useState(false);
  const [discountSheet, setDiscountSheet] = useState(false);
  const [discount, setDiscount] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: inv, loading, error, refresh, refreshing, reload } = useApi(
    async () => withBalance(pickOne<any>(await invoicesApi.get(invoiceId), 'invoice', 'invoices')),
    [invoiceId],
  );

  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // ── Payment row actions ────────────────────────────────────────────────────
  const onPaymentPress = (p: Payment) => {
    const buttons: any[] = [];
    if (p.status === 'pending' && can('verify', 'payment')) {
      buttons.push({ text: t('invoiceView.verify'), onPress: () => run(() => paymentsApi.verify(p.id, 'verified'), t('payments.verified')) });
      buttons.push({ text: t('invoiceView.reject'), style: 'destructive', onPress: () => askReject(p) });
    }
    // Receipt: upload a new photo or remove it (PATCH /payments/:id multipart — FRONTEND_UPDATE §12)
    if (can('edit', 'payment')) {
      buttons.push({
        text: p.attachment ? t('payment.replaceReceipt') : t('payment.addReceipt'),
        onPress: async () => {
          const file = await chooseImage(t('payment.receipt'));
          if (file) run(() => paymentsApi.update(p.id, { attachment: file }), t('payment.receiptSaved'));
        },
      });
      if (p.attachment) {
        buttons.push({ text: t('payment.removeReceipt'), onPress: () => run(() => paymentsApi.update(p.id, { attachment: '' }), t('payment.receiptRemoved')) });
      }
    }
    if (can('delete', 'payment')) {
      buttons.push({
        text: t('invoiceView.deletePayment'), style: 'destructive',
        onPress: () => Alert.alert(t('invoiceView.deletePayment'), t('invoiceView.deletePaymentMsg'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('unitDetail.delete'), style: 'destructive', onPress: () => run(() => paymentsApi.remove(p.id)) },
        ]),
      });
    }
    if (!buttons.length) return;
    Alert.alert(money(p.amount, { decimals: 2 }), `${t(`payment.methods.${p.paymentMethod ?? 'other'}`)} · ${dayLabel(p.paymentDate, true)}`,
      [...buttons, { text: t('common.cancel'), style: 'cancel' }]);
  };

  // Reject asks for a reason the tenant will see (iOS + Android) — FRONTEND_UPDATE §11
  const [rejecting, setRejecting] = useState<Payment | null>(null);
  const askReject = (p: Payment) => setRejecting(p);

  // ── Invoice actions ────────────────────────────────────────────────────────
  // Khmer PDF from the server (property logo, bank details, KHQR)
  const openPdf = () => {
    setMoreSheet(false);
    run(() => downloadAndOpen(invoicesApi.pdfPath(invoiceId), `${inv?.invoiceNumber ?? 'invoice'}.pdf`, MIME.pdf));
  };
  const sendTelegram = () => { setMoreSheet(false); run(() => invoicesApi.sendTelegram(invoiceId), t('invoiceView.sentTelegram')); };
  const cancelInvoice = () => {
    setMoreSheet(false);
    Alert.alert(t('invoiceView.cancelTitle'), t('invoiceView.cancelMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('invoiceView.cancelInvoice'), style: 'destructive', onPress: () => run(() => invoicesApi.cancel(invoiceId)) },
    ]);
  };
  const deleteInvoice = () => {
    setMoreSheet(false);
    Alert.alert(t('invoiceView.deleteTitle'), t('invoiceView.deleteMsg', { number: inv?.invoiceNumber }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('unitDetail.delete'), style: 'destructive',
        onPress: async () => { try { await invoicesApi.remove(invoiceId); toast.deleted(); nav.goBack(); } catch (e) { toast.error(errMsg(e)); } },
      },
    ]);
  };
  const saveDiscount = () => {
    setDiscountSheet(false);
    run(() => invoicesApi.update(invoiceId, { discount: num(discount) }));
  };

  const onShare = () => {
    if (!inv) return;
    const lines = (inv.invoiceDetails ?? []).map(d => `• ${d.description}: ${money(d.amount, { decimals: 2 })}`).join('\n');
    Share.share({
      message: `${inv.invoiceNumber}\n${inv.tenant?.name ?? ''} · ${t('billing.unit', { code: inv.unit?.unitCode ?? '' })}\n${monthLabel(inv.billingMonth)}\n\n${lines}\n\n${t('invoiceForm.totalDue')}: ${money(inv.totalAmount, { decimals: 2 })} (${riel(inv.totalAmountKhr)})\n${t('payment.remaining')}: ${money(inv.remainingAmount, { decimals: 2 })}\n${t('billing.due', { date: dayLabel(inv.dueDate, true) })}`,
    });
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => nav.goBack()} hitSlop={6} accessibilityLabel="Back">
        <Icon name="chevron-back" size={20} color={colors.ink} />
      </TouchableOpacity>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title}>{t('invoiceForm.viewTitle')}</Text>
        {inv?.invoiceNumber ? <Text style={styles.subtitle} numberOfLines={1}>{inv.invoiceNumber}</Text> : null}
      </View>
      {inv ? (
        <TouchableOpacity style={styles.iconBtn} onPress={onShare} accessibilityLabel={t('invoiceView.share')}>
          <Icon name="share-outline" size={19} color={colors.ink} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const cancelled = inv?.status === 'cancelled';
  const payable = payableAmount(inv);
  const canPay = !!inv && !cancelled && payable > 0 && can('create', 'payment');
  const ps = (inv?.paymentStatus ?? 'unpaid') as keyof typeof PAYMENT_TONE;
  const pTone = PAYMENT_TONE[ps] ?? toneColors.neutral;
  const paidPct = inv && num(inv.totalAmount) > 0 ? num(inv.paidAmount) / num(inv.totalAmount) : 0;

  const footer = inv ? (
    <>
      <Button title={t('invoiceView.more')} variant="secondary" icon="ellipsis-horizontal" onPress={() => setMoreSheet(true)} style={{ flex: 1 }} disabled={busy} />
      <Button
        title={cancelled ? t('status.cancelled') : payable > 0 ? t('invoiceView.recordPayment') : t('status.paid')}
        variant="success"
        icon={payable > 0 ? 'cash-outline' : 'checkmark-circle-outline'}
        onPress={() => setPaySheet(true)}
        style={{ flex: 1.8 }}
        disabled={!canPay}
        loading={busy}
      />
    </>
  ) : undefined;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} header={header} footer={footer} contentStyle={{ paddingTop: spacing.sm }}>
      {loading ? <LoadingView /> : error || !inv ? <ErrorView message={error ?? t('invoiceView.notFound')} onRetry={refresh} /> : (
        <>
          {/* Balance */}
          <View style={[styles.card, cancelled && { opacity: 0.7 }]}>
            <View style={styles.between}>
              <View style={styles.chips}>
                <View style={[styles.chip, { backgroundColor: pTone.bg }]}>
                  <View style={[styles.dot, { backgroundColor: pTone.fg }]} />
                  <Text style={[styles.chipText, { color: pTone.fg }]}>{t(`invoiceView.ps.${ps}`)}</Text>
                </View>
                {inv.isOverdue ? (
                  <View style={[styles.chip, { backgroundColor: colors.dangerSoft }]}>
                    <Icon name="alert-circle" size={12} color={colors.danger} />
                    <Text style={[styles.chipText, { color: colors.danger }]}>
                      {inv.daysOverdue ? t('reports.daysLate', { count: inv.daysOverdue }) : t('status.overdue')}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.muted}>{monthLabel(String(inv.billingMonth).slice(0, 7))}</Text>
            </View>

            <Text style={[styles.total, cancelled && styles.strike]}>{money(inv.totalAmount, { decimals: 2 })}</Text>
            <Text style={styles.muted}>{riel(inv.totalAmountKhr)} · {num(inv.exchangeRate).toLocaleString()} ៛/$</Text>

            <View style={{ marginTop: 14 }}>
              <ProgressBar value={paidPct} height={6} color={colors.success} />
            </View>
            <View style={styles.balanceRow}>
              <Balance label={t('invoiceView.paid')} value={money(inv.paidAmount, { decimals: 2 })} color={colors.success} />
              <Balance label={t('payment.pending')} value={money(inv.pendingAmount, { decimals: 2 })} color={num(inv.pendingAmount) > 0 ? colors.warning : undefined} />
              <Balance label={t('payment.remaining')} value={money(inv.remainingAmount, { decimals: 2 })} color={num(inv.remainingAmount) > 0 ? colors.danger : undefined} align="right" />
            </View>

            <View style={styles.dueLine}>
              <Icon name="calendar-outline" size={13} color={inv.isOverdue ? colors.danger : colors.muted} />
              <Text style={[styles.dueText, inv.isOverdue && { color: colors.danger }]}>{t('billing.due', { date: dayLabel(inv.dueDate, true) })}</Text>
              {inv.lastPaymentDate ? <Text style={styles.muted}>· {t('invoiceView.lastPaid', { date: dayLabel(inv.lastPaymentDate) })}</Text> : null}
            </View>
          </View>

          {/* Tenant & unit */}
          <View style={[styles.card, styles.flush, { marginTop: spacing.md }]}>
            <Pressable onPress={() => inv.tenantId && nav.navigate('TenantDetail', { tenantId: inv.tenantId })} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{initials(inv.tenant?.name)}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{inv.tenant?.name ?? t('billing.tenant')}</Text>
                {inv.tenant?.phoneNumber ? <Text style={styles.rowSub}>{inv.tenant.phoneNumber}</Text> : null}
              </View>
              <Icon name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
            <Pressable onPress={() => inv.unitId && nav.navigate('UnitDetail', { unitId: inv.unitId })} style={({ pressed }) => [styles.row, styles.sep, pressed && styles.pressed]}>
              <View style={styles.smallIcon}><Icon name="home-outline" size={17} color={colors.ink} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle}>{t('billing.unit', { code: inv.unit?.unitCode ?? '—' })}</Text>
                {inv.unit?.property?.name ? <Text style={styles.rowSub}>{inv.unit.property.name}</Text> : null}
              </View>
              <Icon name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          </View>

          {/* Lines */}
          <Text style={styles.section}>{t('invoiceView.lines')}</Text>
          <View style={[styles.card, styles.flush]}>
            {(inv.invoiceDetails ?? []).map((d, i) => (
              <View key={d.id ?? i} style={[styles.row, i > 0 && styles.sep]}>
                <View style={styles.smallIcon}><Icon name={LINE_ICON[d.type] ?? 'pricetag-outline'} size={16} color={colors.ink} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowLabel}>{d.description}</Text>
                  {d.usage != null && num(d.usage) > 0 ? (
                    <Text style={styles.rowSub}>{num(d.previousReading).toLocaleString()} → {num(d.currentReading).toLocaleString()} · {num(d.usage).toLocaleString()} × ${num(d.rate)}</Text>
                  ) : null}
                </View>
                <Text style={styles.amount}>{money(d.amount, { decimals: 2 })}</Text>
              </View>
            ))}
            <View style={styles.totals}>
              <TotalLine label={t('invoiceView.subtotal')} value={money(inv.subTotal, { decimals: 2 })} />
              {num(inv.discount) > 0 ? <TotalLine label={t('invoiceView.discount')} value={`− ${money(inv.discount, { decimals: 2 })}`} /> : null}
              <TotalLine label={t('invoiceForm.totalDue')} value={money(inv.totalAmount, { decimals: 2 })} strong />
            </View>
          </View>

          {/* Payments */}
          <Text style={styles.section}>{t('invoiceView.payments')}</Text>
          <View style={[styles.card, styles.flush]}>
            {(inv.payments ?? []).length === 0 ? (
              <Text style={styles.empty}>{t('invoiceView.noPayments')}</Text>
            ) : (inv.payments ?? []).map((p, i) => {
              const rt = RECORD_TONE[p.status as keyof typeof RECORD_TONE] ?? toneColors.neutral;
              return (
                <Pressable key={p.id} onPress={() => onPaymentPress(p)} style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && styles.pressed]}>
                  <View style={[styles.smallIcon, { backgroundColor: rt.bg }]}>
                    <Icon name={p.status === 'pending' ? 'time-outline' : p.status === 'rejected' ? 'close' : 'checkmark'} size={16} color={rt.fg} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.rowLabel, p.status === 'rejected' && styles.strike]}>{money(p.amount, { decimals: 2 })}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {[t(`payment.methods.${p.paymentMethod ?? 'other'}`), dayLabel(p.paymentDate, true), p.transactionId].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={[styles.recStatus, { color: rt.fg }]}>{t(`invoiceView.rec.${p.status ?? 'verified'}`)}</Text>
                </Pressable>
              );
            })}
          </View>

          {inv.note ? (
            <>
              <Text style={styles.section}>{t('invoiceForm.notes')}</Text>
              <View style={styles.card}><Text style={styles.note}>{inv.note}</Text></View>
            </>
          ) : null}
        </>
      )}

      <RecordPaymentSheet
        visible={paySheet}
        invoice={inv}
        onClose={() => setPaySheet(false)}
        onSaved={() => { setPaySheet(false); reload(); }}
      />

      <Sheet visible={moreSheet} onClose={() => setMoreSheet(false)} title={inv?.invoiceNumber}>
        <View style={[styles.card, styles.flush]}>
          <MenuRow icon="document-text-outline" label={t('invoiceView.openPdf')} onPress={openPdf} first />
          <MenuRow icon="paper-plane-outline" label={t('invoiceView.sendTelegram')} onPress={sendTelegram} />
          {can('edit', 'invoice') && !cancelled ? (
            <MenuRow icon="pricetag-outline" label={t('invoiceView.applyDiscount')} onPress={() => { setMoreSheet(false); setDiscount(String(num(inv?.discount) || '')); setDiscountSheet(true); }} />
          ) : null}
          {can('edit', 'invoice') && !cancelled && ps !== 'paid' ? (
            <MenuRow icon="close-circle-outline" label={t('invoiceView.cancelInvoice')} onPress={cancelInvoice} danger />
          ) : null}
          {can('delete', 'invoice') ? <MenuRow icon="trash-outline" label={t('invoiceView.deleteTitle')} onPress={deleteInvoice} danger /> : null}
        </View>
      </Sheet>

      <Sheet
        visible={discountSheet}
        onClose={() => setDiscountSheet(false)}
        title={t('invoiceView.applyDiscount')}
        footer={<Button title={t('invoiceView.saveDiscount')} onPress={saveDiscount} />}
      >
        <Input label={t('invoiceView.discount')} prefix="$" keyboardType="decimal-pad" value={discount} onChangeText={setDiscount} hint={t('invoiceView.discountHint')} />
      </Sheet>
      <RejectPaymentSheet
        payment={rejecting ? { id: rejecting.id, amount: rejecting.amount, tenantName: inv?.tenant?.name } : null}
        onClose={() => setRejecting(null)}
        onDone={() => reload()}
      />
    </Screen>
  );
}

function Balance({ label, value, color, align }: { label: string; value: string; color?: string; align?: 'right' }) {
  return (
    <View style={[{ flex: 1, minWidth: 0 }, align === 'right' && { alignItems: 'flex-end' }]}>
      <Text style={styles.balLabel}>{label}</Text>
      <Text style={[styles.balValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

function TotalLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.totalLine}>
      <Text style={[styles.totalLabel, strong && styles.totalStrong]}>{label}</Text>
      <Text style={[styles.totalValue, strong && styles.totalStrong]}>{value}</Text>
    </View>
  );
}

function MenuRow({ icon, label, onPress, danger, first }: { icon: string; label: string; onPress: () => void; danger?: boolean; first?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !first && styles.sep, pressed && styles.pressed]}>
      <View style={[styles.smallIcon, danger && { backgroundColor: colors.dangerSoft }]}>
        <Icon name={icon} size={17} color={danger ? colors.danger : colors.ink} />
      </View>
      <Text style={[styles.rowLabel, { flex: 1 }, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
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

  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.divider },
  flush: { padding: 0, overflow: 'hidden' },
  pressed: { backgroundColor: colors.surfaceAlt },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  muted: { fontSize: 12, color: colors.muted },
  strike: { textDecorationLine: 'line-through' },

  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', flexShrink: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 11, fontWeight: '600' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  total: { fontSize: 32, fontWeight: '700', color: colors.ink, letterSpacing: -0.8, marginTop: 10 },
  balanceRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  balLabel: { fontSize: 11, color: colors.muted, fontWeight: '500' },
  balValue: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 2 },
  dueLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  dueText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },

  section: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: spacing.xl, marginBottom: 10, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: spacing.lg },
  sep: { borderTopWidth: 1, borderTopColor: colors.divider },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  smallIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  amount: { fontSize: 14, fontWeight: '600', color: colors.ink },
  recStatus: { fontSize: 12, fontWeight: '600' },
  empty: { fontSize: 13, color: colors.muted, textAlign: 'center', padding: spacing.lg },
  note: { fontSize: 14, color: colors.ink, lineHeight: 20 },

  totals: { borderTopWidth: 1, borderTopColor: colors.divider, paddingHorizontal: spacing.lg, paddingVertical: 10, backgroundColor: colors.surfaceAlt },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: 13, color: colors.textSecondary },
  totalValue: { fontSize: 13, fontWeight: '600', color: colors.ink },
  totalStrong: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
