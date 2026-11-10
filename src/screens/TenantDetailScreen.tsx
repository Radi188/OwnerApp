import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { confirmAction, LoadingView, ProgressBar, Screen } from '../components/ui';
import Segments from '../components/Segments';
import TenantCredentialsSheet from '../components/TenantCredentialsSheet';
import type { TenantCredentials } from '../services/types';
import { dayLabel, monthLabel, statusLabel } from '../i18n';
import { maintenanceApi, pickList, tenantsApi, utilityApi } from '../services/api';
import { currentMonthKey, getInvoice, hydrateInvoices, monthKey } from '../store/invoiceStore';
import { colors, radius, spacing, statusTone, toneColors } from '../theme';
import { daysUntil, initials, money, riel, thisMonthYM, timeAgo, toNum } from '../utils/format';

type Section = 'overview' | 'invoices' | 'requests';
type InvoiceRange = 'last_month' | '3_months' | '6_months' | '1_year';

const RANGES: { value: InvoiceRange; key: string }[] = [
  { value: 'last_month', key: 'range1m' },
  { value: '3_months', key: 'range3m' },
  { value: '6_months', key: 'range6m' },
  { value: '1_year', key: 'range1y' },
];

const isActiveStatus = (s?: string) => String(s ?? '').toLowerCase() === 'active';
const isUrgent = (m: any) => ['urgent', 'high'].includes(String(m.priority ?? '').toLowerCase());

/** Share of the contract term already elapsed (0–1). */
function termProgress(start?: string, end?: string): number {
  const s = start ? new Date(start).getTime() : NaN;
  const e = end ? new Date(end).getTime() : NaN;
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  return Math.min(1, Math.max(0, (Date.now() - s) / (e - s)));
}

export default function TenantDetailScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const tenantId: number = useRoute<any>().params.tenantId;
  const { can } = useAuth();

  const [tenant, setTenant] = useState<any>(null);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [range, setRange] = useState<InvoiceRange>('3_months');
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState<any>(null);
  const [section, setSection] = useState<Section>('overview');
  const [newLogin, setNewLogin] = useState<TenantCredentials | null>(null);

  // Local extras saved by Generate Invoice (readings + KHR breakdown)
  const invoiceRecord = getInvoice(String(tenantId), currentMonthKey());

  const loadData = useCallback(async () => {
    try {
      const [tenantRes, mntRes, invRes] = await Promise.all([
        tenantsApi.get(tenantId),
        maintenanceApi.list().catch(() => null),
        tenantsApi.invoices(tenantId, '3_months').catch(() => null),
        hydrateInvoices(),
      ]);
      const apiInvoices: any[] = invRes?.data?.invoices ?? [];
      setCurrentInvoice(apiInvoices.find(inv => monthKey(inv.billingMonth) === currentMonthKey()) ?? null);
      const tn = tenantRes?.data?.tenants ?? tenantRes?.data?.tenant ?? null;
      setTenant(tn);
      const unitIds = new Set((tn?.contracts ?? []).map((c: any) => c.unitId));
      const all: any[] = pickList(mntRes, 'maintenanceRequests', 'maintenances');
      setMaintenance(all.filter(m => unitIds.has(m.unitId)).slice(0, 20));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  const loadInvoices = useCallback(async (r: InvoiceRange) => {
    setInvoicesLoading(true);
    try {
      const res = await tenantsApi.invoices(tenantId, r).catch(() => null);
      setInvoices(res?.data?.invoices ?? []);
    } finally {
      setInvoicesLoading(false);
    }
  }, [tenantId]);

  // Reload on focus (e.g. after generating an invoice or editing the tenant)
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  useEffect(() => { loadInvoices(range); }, [range, loadInvoices]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
    loadInvoices(range);
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => nav.goBack()} hitSlop={6} accessibilityLabel="Back">
        <Icon name="chevron-back" size={20} color={colors.ink} />
      </TouchableOpacity>
      <Text style={[styles.title, { flex: 1 }]} numberOfLines={1}>{t('tenantView.title')}</Text>
      {tenant && can('edit', 'tenant') ? (
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => nav.navigate('TenantForm', { tenant })}
          activeOpacity={0.7}
          accessibilityLabel={t('tenantView.edit')}
        >
          <Icon name="create-outline" size={19} color={colors.ink} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  if (loading || !tenant) {
    return (
      <Screen header={header}>
        {loading ? <LoadingView /> : (
          <View style={styles.notFound}>
            <Icon name="person-outline" size={32} color={colors.muted} />
            <Text style={styles.muted}>{t('tenantView.notFound')}</Text>
          </View>
        )}
      </Screen>
    );
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const contracts: any[] = tenant.contracts ?? [];
  const contract = contracts.find(c => isActiveStatus(c.status)) ?? contracts[0];
  const unit = contract?.unit;
  const unitId = unit?.id ?? contract?.unitId;
  const property = unit?.property;
  const active = isActiveStatus(tenant.status);
  const urgentCount = maintenance.filter(isUrgent).length;
  const hasInvoice = !!currentInvoice || !!invoiceRecord;
  const invTone = toneColors[statusTone(currentInvoice?.status ?? 'pending')];

  // ── Actions ────────────────────────────────────────────────────────────────
  const call = (phone?: string) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert(t('tenantDetail.error'), t('tenantDetail.unableToCall')));
  };

  const notify = () => {
    if (!tenant.userId) {
      Alert.alert(t('tenantView.noAccountTitle'), t('tenantView.noAccountMsg', { name: tenant.name }));
      return;
    }
    nav.navigate('SendNotification', { userId: tenant.userId, name: tenant.name });
  };

  const openInvoice = async () => {
    // Already billed on the server → open the full invoice directly
    if (currentInvoice?.id) {
      nav.navigate('InvoiceDetail', { invoiceId: currentInvoice.id });
      return;
    }
    if (!unitId || !contract) {
      Alert.alert(t('tenantView.noContractTitle'), t('tenantView.noContractMsg'));
      return;
    }
    setOpening(true);
    try {
      const res = await utilityApi.lastReading(unitId);
      nav.navigate('GenerateInvoice', {
        tenantId: tenant.id,
        tenantName: tenant.name,
        unitCode: unit?.unitCode,
        contractId: contract.id,
        unitId,
        lastReading: res,
        apiInvoice: currentInvoice ? {
          id: currentInvoice.id,
          totalAmount: toNum(currentInvoice.totalAmount ?? currentInvoice.amount),
          dueDate: currentInvoice.dueDate ?? null,
          status: currentInvoice.status,
          billingMonth: currentInvoice.billingMonth,
        } : null,
      });
    } catch {
      Alert.alert(t('tenantDetail.error'), t('tenantView.readingsFailed'));
    } finally {
      setOpening(false);
    }
  };

  // New password + QR; the old password stops working (FRONTEND_GUIDE §8)
  const resetLogin = () => Alert.alert(t('tenantView.resetLogin'), t('tenantView.resetLoginMsg', { name: tenant.name }), [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('tenantView.reset'),
      style: 'destructive',
      onPress: async () => {
        try {
          const c = await tenantsApi.regenerateLogin(tenant.id);
          if (c) setNewLogin(c);
        } catch (e: any) {
          Alert.alert(t('tenantDetail.error'), e?.message ?? t('home.tryAgain'));
        }
      },
    },
  ]);

  const remove = () => confirmAction(
    t('tenantView.deleteTitle'),
    t('tenantView.deleteConfirm', { name: tenant.name }),
    async () => {
      try {
        await tenantsApi.remove(tenant.id);
        nav.goBack();
      } catch (e: any) {
        Alert.alert(t('unitDetail.deleteFailed'), e?.message ?? t('home.tryAgain'));
      }
    },
    t('unitDetail.delete'),
  );

  const unitLine = [
    unit?.unitCode ? t('billing.unit', { code: unit.unitCode }) : unitId ? t('billing.unit', { code: `#${unitId}` }) : null,
    unit?.floorNumber ? t('units.floor', { floor: unit.floorNumber }) : null,
    property?.name,
  ].filter(Boolean).join(' · ');

  return (
    <Screen header={header} refreshing={refreshing} onRefresh={onRefresh} contentStyle={{ paddingTop: spacing.sm }}>
      {/* Profile */}
      <View style={styles.card}>
        <View style={styles.profile}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials(tenant.name)}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={1}>{tenant.name}</Text>
            <View style={styles.metaRow}>
              <View style={[styles.dot, { backgroundColor: active ? colors.success : colors.danger }]} />
              <Text style={[styles.metaStrong, { color: active ? colors.success : colors.danger }]}>
                {statusLabel(tenant.status)}
              </Text>
              {tenant.user?.username ? <Text style={styles.meta} numberOfLines={1}>· @{tenant.user.username}</Text> : null}
            </View>
            {unitLine ? (
              <View style={styles.metaRow}>
                <Icon name="home-outline" size={12} color={colors.muted} />
                <Text style={styles.meta} numberOfLines={1}>{unitLine}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.actions}>
          <Action icon="call-outline" label={t('tenantDetail.call')} onPress={() => call(tenant.phoneNumber)} disabled={!tenant.phoneNumber} />
          <Action icon="notifications-outline" label={t('tenantDetail.notify')} onPress={notify} />
          <Action
            icon="document-text-outline"
            label={t('tenantView.contract')}
            onPress={() => contract && nav.navigate('ContractDetail', { contractId: contract.id })}
            disabled={!contract}
          />
        </View>
      </View>

      {/* This month's invoice */}
      {contract ? (
        hasInvoice ? (
          <Pressable onPress={openInvoice} disabled={opening} style={({ pressed }) => [styles.card, styles.invoiceCard, pressed && styles.pressed]}>
            <View style={styles.between}>
              <Text style={styles.label}>{monthLabel(thisMonthYM())}</Text>
              {currentInvoice ? (
                <View style={styles.metaRow}>
                  <View style={[styles.dot, { backgroundColor: invTone.fg }]} />
                  <Text style={[styles.metaStrong, { color: invTone.fg }]}>{statusLabel(currentInvoice.status)}</Text>
                </View>
              ) : null}
            </View>
            <View style={[styles.between, { marginTop: 6, alignItems: 'flex-end' }]}>
              <Text style={styles.big} numberOfLines={1} adjustsFontSizeToFit>
                {currentInvoice ? money(currentInvoice.totalAmount ?? currentInvoice.amount, { decimals: 2 }) : riel(invoiceRecord?.total)}
              </Text>
              {currentInvoice?.dueDate || invoiceRecord?.scheduledDate ? (
                <Text style={styles.due}>{t('billing.due', { date: dayLabel(currentInvoice?.dueDate ?? invoiceRecord?.scheduledDate) })}</Text>
              ) : null}
            </View>
            {invoiceRecord ? (
              <View style={styles.breakdown}>
                <View style={styles.metaRow}>
                  <Icon name="flash" size={12} color={toneColors.warning.fg} />
                  <Text style={styles.meta}>{riel(invoiceRecord.elecCost)}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Icon name="water" size={12} color={toneColors.info.fg} />
                  <Text style={styles.meta}>{riel(invoiceRecord.waterCost)}</Text>
                </View>
              </View>
            ) : null}
            <View style={styles.invoiceLink}>
              <Text style={styles.link}>{t('tenantDetail.viewInvoice')}</Text>
              {opening ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="arrow-forward" size={15} color={colors.primary} />}
            </View>
          </Pressable>
        ) : (
          <View style={[styles.card, styles.generate]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowTitle}>{t('tenantView.noInvoiceTitle', { month: monthLabel(thisMonthYM()) })}</Text>
              <Text style={styles.rowSub}>{t('tenantView.noInvoiceHint')}</Text>
            </View>
            <TouchableOpacity style={styles.cta} onPress={openInvoice} disabled={opening} activeOpacity={0.8}>
              {opening ? <ActivityIndicator size="small" color={colors.white} /> : (
                <>
                  <Icon name="receipt-outline" size={15} color={colors.white} />
                  <Text style={styles.ctaText}>{t('tenantView.generate')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )
      ) : null}

      {/* Sections */}
      <Segments<Section>
        style={{ marginTop: spacing.xl }}
        value={section}
        onChange={setSection}
        options={[
          { value: 'overview', label: t('tenantView.overview') },
          { value: 'invoices', label: t('tenantView.invoices'), count: invoices.length },
          { value: 'requests', label: t('tenantView.requests'), count: maintenance.length },
        ]}
      />

      {section === 'overview' ? (
        <>
          <Text style={styles.section}>{t('tenantView.contact')}</Text>
          <View style={[styles.card, styles.flush]}>
            <InfoRow first label={t('tenantDetail.phone')} value={tenant.phoneNumber} onPress={tenant.phoneNumber ? () => call(tenant.phoneNumber) : undefined} />
            <InfoRow label={t('tenantView.emergency')} value={tenant.emergencyContact} onPress={tenant.emergencyContact ? () => call(tenant.emergencyContact) : undefined} />
            <InfoRow label={t('tenantView.gender')} value={tenant.gender ? t(`tenantView.genders.${tenant.gender}`) : null} />
            <InfoRow label={t('tenantView.idNumber')} value={tenant.idNumber} />
            <InfoRow label={t('tenantView.occupation')} value={tenant.occupation} />
            <InfoRow label={t('tenantView.memberSince')} value={dayLabel(tenant.createdAt, true)} />
          </View>

          {contract ? (
            <>
              <Text style={styles.section}>{t('tenantView.contract')}</Text>
              <View style={[styles.card, styles.flush]}>
                <View style={styles.term}>
                  <View style={styles.between}>
                    <Text style={styles.label}>{t('unitDetail.monthlyRent')}</Text>
                    <Text style={styles.rent}>{money(contract.monthlyRent, { decimals: 2 })}</Text>
                  </View>
                  <View style={[styles.between, { marginTop: 14, marginBottom: 8 }]}>
                    <Text style={styles.meta}>{dayLabel(contract.startDate, true)} → {dayLabel(contract.endDate, true)}</Text>
                    {contract.endDate ? (
                      <Text style={[styles.metaStrong, daysUntil(contract.endDate) <= 30 && { color: colors.warning }]}>
                        {daysUntil(contract.endDate) <= 0 ? t('unitDetail.ended') : t('unitDetail.daysLeft', { count: daysUntil(contract.endDate) })}
                      </Text>
                    ) : null}
                  </View>
                  <ProgressBar value={termProgress(contract.startDate, contract.endDate)} height={6} />
                </View>
                <ChevronRow
                  icon="home-outline"
                  label={unit?.unitCode ? t('billing.unit', { code: unit.unitCode }) : t('units.title')}
                  sub={property?.name}
                  onPress={() => unitId && nav.navigate('UnitDetail', { unitId })}
                />
                <ChevronRow
                  icon="document-text-outline"
                  label={t('unitDetail.viewContract')}
                  onPress={() => nav.navigate('ContractDetail', { contractId: contract.id })}
                />
              </View>
            </>
          ) : null}

          <View style={styles.sectionRow}>
            <Text style={[styles.section, styles.sectionInline]}>{t('tenantView.occupants')}</Text>
            {can('create', 'occupant') ? (
              <TouchableOpacity onPress={() => nav.navigate('OccupantForm', { tenantId: tenant.id })} hitSlop={8} style={styles.linkBtn}>
                <Icon name="add" size={15} color={colors.primary} />
                <Text style={styles.link}>{t('tenantView.add')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={[styles.card, styles.flush]}>
            {!(tenant.occupants?.length) ? (
              <Text style={styles.emptyLine}>{t('tenantView.noOccupants')}</Text>
            ) : (tenant.occupants as any[]).map((o, i) => (
              <Pressable
                key={o.id}
                onPress={() => nav.navigate('OccupantForm', { tenantId: tenant.id, occupant: o })}
                style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && styles.pressed]}
              >
                <View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>{initials(o.name)}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{o.name}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {[o.relationship ?? t('tenantView.occupant'), o.phoneNumber].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            ))}
          </View>

          {can('edit', 'tenant') ? (
            <View style={[styles.card, styles.flush, { marginTop: spacing.xl }]}>
              <ChevronRow
                icon="key-outline"
                label={t('tenantView.resetLogin')}
                sub={tenant.user?.username ? `@${tenant.user.username}` : undefined}
                onPress={resetLogin}
                first
              />
            </View>
          ) : null}

          {can('delete', 'tenant') ? (
            <Pressable onPress={remove} style={({ pressed }) => [styles.card, styles.deleteRow, pressed && styles.pressed]}>
              <Icon name="trash-outline" size={17} color={colors.danger} />
              <Text style={styles.deleteText}>{t('tenantView.deleteTitle')}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {section === 'invoices' ? (
        <>
          <Segments<InvoiceRange>
            style={{ marginTop: spacing.md }}
            value={range}
            onChange={setRange}
            options={RANGES.map(r => ({ value: r.value, label: t(`tenantView.${r.key}`) }))}
          />
          <View style={[styles.card, styles.flush, { marginTop: spacing.md }]}>
            {invoicesLoading ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 28 }} /> :
              invoices.length === 0 ? <Text style={styles.emptyLine}>{t('tenantView.noInvoices')}</Text> :
              invoices.map((inv, i) => {
                // paymentStatus (paid / partial / unpaid) is what matters for "who paid what"
                const ps: string | undefined = inv.paymentStatus;
                const tc = ps
                  ? ({ paid: toneColors.success, partial: toneColors.warning, unpaid: toneColors.danger } as any)[ps] ?? toneColors.neutral
                  : toneColors[statusTone(inv.status)];
                const overdue = !!inv.isOverdue && ps !== 'paid';
                return (
                  <Pressable
                    key={inv.id}
                    onPress={() => nav.navigate('InvoiceDetail', { invoiceId: inv.id })}
                    style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && styles.pressed]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowTitle}>{monthLabel(monthKey(inv.billingMonth ?? inv.createdAt))}</Text>
                      {inv.dueDate ? <Text style={styles.rowSub}>{t('billing.due', { date: dayLabel(inv.dueDate) })}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.amount}>{money(inv.totalAmount ?? inv.amount, { decimals: 2 })}</Text>
                      <View style={[styles.metaRow, { marginTop: 3 }]}>
                        <View style={[styles.dot, { backgroundColor: overdue ? colors.danger : tc.fg }]} />
                        <Text style={[styles.status, { color: overdue ? colors.danger : tc.fg }]}>
                          {overdue ? t('status.overdue') : ps ? t(`invoiceView.ps.${ps}`) : statusLabel(inv.status)}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
          </View>
        </>
      ) : null}

      {section === 'requests' ? (
        <>
          {urgentCount > 0 ? (
            <View style={styles.urgentNote}>
              <Icon name="alert-circle" size={15} color={colors.danger} />
              <Text style={styles.urgentText}>{t('tenantView.urgentCount', { count: urgentCount })}</Text>
            </View>
          ) : null}
          <View style={[styles.card, styles.flush, { marginTop: spacing.md }]}>
            {maintenance.length === 0 ? <Text style={styles.emptyLine}>{t('tenantView.noRequests')}</Text> :
              maintenance.map((m, i) => {
                const tc = toneColors[statusTone(m.status)];
                const urgent = isUrgent(m);
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => nav.navigate('RequestDetail', { requestId: m.id })}
                    style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && styles.pressed]}
                  >
                    <View style={[styles.smallIcon, urgent && { backgroundColor: colors.dangerSoft }]}>
                      <Icon name="construct-outline" size={16} color={urgent ? colors.danger : colors.ink} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{m.description || statusLabel(m.type)}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {[statusLabel(m.type), timeAgo(m.createdAt)].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.status, { color: tc.fg }]}>{statusLabel(m.status)}</Text>
                      {urgent ? <Text style={[styles.status, { color: colors.danger, marginTop: 3 }]}>{t('tenantView.urgent')}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
          </View>
        </>
      ) : null}
      <TenantCredentialsSheet
        visible={!!newLogin}
        name={tenant.name}
        credentials={newLogin}
        onDone={() => setNewLogin(null)}
      />
    </Screen>
  );
}

// ─── Small pieces ────────────────────────────────────────────────────────────

function Action({ icon, label, onPress, disabled }: { icon: string; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }, disabled && { opacity: 0.4 }]}
      accessibilityRole="button"
    >
      <Icon name={icon} size={17} color={colors.primary} />
      <Text style={styles.actionText} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function InfoRow({ label, value, onPress, first }: { label: string; value?: string | null; onPress?: () => void; first?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.info, !first && styles.sep, pressed && styles.pressed]}
    >
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, onPress && { color: colors.primary }]} numberOfLines={1}>{value || '—'}</Text>
    </Pressable>
  );
}

function ChevronRow({ icon, label, sub, onPress, first }: { icon: string; label: string; sub?: string; onPress: () => void; first?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !first && styles.sep, pressed && styles.pressed]}>
      <View style={styles.smallIcon}><Icon name={icon} size={16} color={colors.ink} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <Icon name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center',
  },
  notFound: { alignItems: 'center', marginTop: 60, gap: 10 },
  muted: { color: colors.muted, fontSize: 14 },

  // Cards
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.divider },
  flush: { padding: 0, overflow: 'hidden' },
  pressed: { backgroundColor: colors.surfaceAlt },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },

  // Profile
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontWeight: '700', fontSize: 19 },
  name: { fontSize: 19, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, flexShrink: 1 },
  meta: { fontSize: 12, color: colors.textSecondary, flexShrink: 1 },
  metaStrong: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  dot: { width: 6, height: 6, borderRadius: 3 },
  actions: { flexDirection: 'row', gap: 8, marginTop: spacing.lg },
  action: {
    flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 40, borderRadius: 12, backgroundColor: colors.primarySoft,
  },
  actionText: { fontSize: 13, fontWeight: '600', color: colors.primary },

  // Invoice card
  invoiceCard: { marginTop: spacing.md },
  label: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  big: { fontSize: 26, fontWeight: '700', color: colors.ink, letterSpacing: -0.6, flexShrink: 1 },
  due: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  breakdown: { flexDirection: 'row', gap: 16, marginTop: 8 },
  invoiceLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider,
  },
  link: { fontSize: 13, fontWeight: '600', color: colors.primary },
  generate: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: spacing.md, padding: spacing.lg },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primary,
    borderRadius: radius.pill, paddingHorizontal: 14, height: 36, minWidth: 90, justifyContent: 'center',
  },
  ctaText: { color: colors.white, fontSize: 13, fontWeight: '600' },

  // Sections
  section: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: spacing.xl, marginBottom: 10, paddingHorizontal: 4 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: 10, paddingRight: 4 },
  sectionInline: { marginTop: 0, marginBottom: 0 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },

  // Rows
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: spacing.lg },
  sep: { borderTopWidth: 1, borderTopColor: colors.divider },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  smallIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  smallAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  smallAvatarText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  amount: { fontSize: 14, fontWeight: '600', color: colors.ink },
  status: { fontSize: 11, fontWeight: '600' },
  emptyLine: { fontSize: 13, color: colors.muted, padding: spacing.lg, textAlign: 'center' },

  info: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 14, paddingHorizontal: spacing.lg },
  infoLabel: { fontSize: 14, color: colors.textSecondary },
  infoValue: { fontSize: 14, fontWeight: '600', color: colors.ink, flexShrink: 1, textAlign: 'right' },

  term: { padding: spacing.lg },
  rent: { fontSize: 18, fontWeight: '700', color: colors.ink },

  urgentNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md,
    backgroundColor: colors.dangerSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  urgentText: { fontSize: 13, fontWeight: '600', color: colors.danger },

  deleteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: spacing.xxl, paddingVertical: 14 },
  deleteText: { fontSize: 15, fontWeight: '600', color: colors.danger },
});
