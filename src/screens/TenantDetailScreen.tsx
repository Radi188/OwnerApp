import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import type { TenantsStackParamList } from '../navigation/AppNavigator';
import { useTranslation } from 'react-i18next';
import { tenantsApi, maintenanceApi, utilityApi } from '../services/api';
import { getInvoice, hydrateInvoices, currentMonthKey, monthKey } from '../store/invoiceStore';

// ─── Types ────────────────────────────────────────────────────────────────────
type InvoiceRange    = 'last_month' | '3_months' | '6_months' | '1_year';
type InvoiceStatus   = 'draft' | 'pending' | 'partial' | 'paid' | 'overdue';
type MaintenanceStatus = 'pending' | 'assigned' | 'in_progress' | 'completed';

const INVOICE_RANGES: { key: InvoiceRange; label: string }[] = [
  { key: 'last_month', label: '1M' },
  { key: '3_months',   label: '3M' },
  { key: '6_months',   label: '6M' },
  { key: '1_year',     label: '1Y' },
];

const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; color: string; bg: string; icon: string }> = {
  paid:    { label: 'Paid',    color: '#16A34A', bg: '#DCFCE7', icon: 'checkmark-circle' },
  partial: { label: 'Partial', color: '#2563EB', bg: '#DBEAFE', icon: 'time' },
  pending: { label: 'Pending', color: '#D97706', bg: '#FEF9C3', icon: 'time-outline' },
  overdue: { label: 'Overdue', color: '#DC2626', bg: '#FEF2F2', icon: 'alert-circle' },
  draft:   { label: 'Draft',   color: '#9CA3AF', bg: '#F3F4F6', icon: 'document-outline' },
};

const MAINTENANCE_STATUS: Record<MaintenanceStatus, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pending',     color: '#6366F1', bg: '#EEF2FF' },
  assigned:    { label: 'Assigned',    color: '#7C3AED', bg: '#EDE9FE' },
  in_progress: { label: 'In Progress', color: '#2563EB', bg: '#DBEAFE' },
  completed:   { label: 'Completed',   color: '#16A34A', bg: '#DCFCE7' },
};

const AVATAR_COLORS = ['#6366F1', '#0891B2', '#16A34A', '#CA8A04', '#DC2626', '#7C3AED'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}
function fmtMoney(n: number): string {
  return n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M ៛' : n.toLocaleString() + ' ៛';
}
function fmtKhr(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' ៛';
}
function fmtShortDate(d: string | null | undefined): string {
  if (!d) return '';
  const date = new Date(d);
  return isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
function currentBillingMonth(): string {
  return new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function TenantDetailScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute<RouteProp<TenantsStackParamList, 'TenantDetail'>>();
  const insets     = useSafeAreaInsets();
  const { t }      = useTranslation();
  const tenantId   = route.params.tenantId;

  const [tenant,          setTenant]          = useState<any>(null);
  const [maintenance,     setMaintenance]     = useState<any[]>([]);
  const [invoices,        setInvoices]        = useState<any[]>([]);
  const [invoiceRange,    setInvoiceRange]    = useState<InvoiceRange>('3_months');
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [loading,         setLoading]         = useState(true);
  const [invoiceBtnLoading, setInvoiceBtnLoading] = useState(false);
  // This month's invoice as saved on the API (source of truth for "generated")
  const [currentInvoice,  setCurrentInvoice]  = useState<any>(null);

  const billingMonth     = currentBillingMonth();
  const invoiceRecord    = getInvoice(String(tenantId), currentMonthKey()); // local extras: readings, breakdown
  const invoiceGenerated = !!currentInvoice || !!invoiceRecord;

  const loadData = useCallback(async () => {
    try {
      const [tenantRes, mntRes, invRes] = await Promise.all([
        tenantsApi.get(tenantId),
        maintenanceApi.list().catch(() => null),
        tenantsApi.invoices(tenantId, '3_months').catch(() => null),
        hydrateInvoices(),
      ]);
      const thisMonth = currentMonthKey();
      const apiInvoices: any[] = invRes?.data?.invoices ?? [];
      setCurrentInvoice(apiInvoices.find(inv => monthKey(inv.billingMonth) === thisMonth) ?? null);
      const t = tenantRes?.data?.tenants ?? tenantRes?.data?.tenant ?? null;
      setTenant(t);
      const tenantContracts: any[] = t?.contracts ?? [];
      const unitIds = new Set(tenantContracts.map((c: any) => c.unitId));
      const allMnt: any[] = mntRes?.data?.maintenances ?? [];
      setMaintenance(allMnt.filter(m => unitIds.has(m.unitId)).slice(0, 10));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const loadInvoices = useCallback(async (range: InvoiceRange) => {
    setInvoicesLoading(true);
    try {
      const res = await tenantsApi.invoices(tenantId, range).catch(() => null);
      setInvoices(res?.data?.invoices ?? []);
    } finally {
      setInvoicesLoading(false);
    }
  }, [tenantId]);

  // Reload whenever the screen regains focus (e.g. coming back after generating an invoice)
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  useEffect(() => { loadInvoices(invoiceRange); }, [invoiceRange, loadInvoices]);

  // ── Skeleton header (shared by loading/error states) ──────────────────────
  const PageHeader = ({ right }: { right?: React.ReactNode }) => (
    <View style={[s.header, { paddingTop: insets.top + 14 }]}>
      <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
        <Icon name="chevron-back" size={22} color="#374151" />
      </TouchableOpacity>
      <Text style={s.headerTitle}>Tenant Detail</Text>
      {right ?? <View style={{ width: 36 }} />}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={[]}>
        <PageHeader />
        <ActivityIndicator color="#6366F1" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!tenant) {
    return (
      <SafeAreaView style={s.container} edges={[]}>
        <PageHeader />
        <View style={{ alignItems: 'center', marginTop: 60 }}>
          <Icon name="person-outline" size={36} color="#D1D5DB" />
          <Text style={{ color: '#9CA3AF', marginTop: 12, fontSize: 14 }}>Tenant not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  const contracts     = tenant.contracts ?? [];
  const activeContract = contracts.find((c: any) =>
    c.status === 'Active' || c.status === 'active',
  ) ?? contracts[0];
  const unit          = activeContract?.unit;
  const unitId        = unit?.id ?? activeContract?.unitId;
  const property      = unit?.property;
  const avatarColor   = AVATAR_COLORS[tenantId % AVATAR_COLORS.length];
  const isActive      = tenant.status === 'Active' || tenant.status === 'active';
  const urgentCount   = maintenance.filter(m => m.priority === 'urgent' || m.priority === 'high').length;

  // Ticket values: prefer the API, fall back to the local record
  const ticketTotal   = currentInvoice
    ? parseFloat(currentInvoice.totalAmount ?? currentInvoice.amount ?? 0) || 0
    : invoiceRecord?.total ?? 0;
  const ticketDue     = fmtShortDate(currentInvoice?.dueDate ?? invoiceRecord?.scheduledDate);
  const ticketStatus  = INVOICE_STATUS_META[(currentInvoice?.status ?? 'pending') as InvoiceStatus] ?? INVOICE_STATUS_META.pending;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleCall = () => {
    if (!tenant.phoneNumber) return;
    Linking.openURL(`tel:${tenant.phoneNumber}`).catch(() => Alert.alert('Error', 'Unable to make call'));
  };

  const handleSendNotif = () => {
    Alert.alert('Send Notification', `Send a notification to ${tenant.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send', onPress: () => Alert.alert('Sent', `Notification sent to ${tenant.name}.`) },
    ]);
  };

  const navigateToInvoice = async () => {
    if (!unitId) {
      Alert.alert('No active contract', 'This tenant does not have an active contract.');
      return;
    }
    setInvoiceBtnLoading(true);
    try {
      const res = await utilityApi.lastReading(unitId);
      navigation.navigate('GenerateInvoice', {
        tenantId:    tenant.id,
        contractId:  activeContract.id,
        unitId,
        lastReading: res,
        apiInvoice:  currentInvoice
          ? {
              id:           currentInvoice.id,
              totalAmount:  parseFloat(currentInvoice.totalAmount ?? currentInvoice.amount ?? 0),
              dueDate:      currentInvoice.dueDate ?? null,
              status:       currentInvoice.status,
              billingMonth: currentInvoice.billingMonth,
            }
          : null,
      });
    } catch {
      Alert.alert('Error', 'Could not fetch utility readings. Please try again.');
    } finally {
      setInvoiceBtnLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={[]}>

      {/* ── Header ── */}
      <PageHeader
        right={
          <TouchableOpacity style={s.notifBtn} onPress={handleSendNotif} activeOpacity={0.8}>
            <Icon name="notifications-outline" size={18} color="#6366F1" />
          </TouchableOpacity>
        }
      />

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Hero card (dark — matches Dashboard perfBg) ── */}
        <View style={s.heroCard}>
          <View style={s.glow1} /><View style={s.glow2} /><View style={s.glow3} />

          {/* Avatar + name + status */}
          <View style={s.heroTop}>
            <View style={[s.avatar, { backgroundColor: avatarColor }]}>
              <Text style={s.avatarText}>{initials(tenant.name)}</Text>
            </View>
            <View style={s.heroNameBlock}>
              <Text style={s.heroName}>{tenant.name}</Text>
              <View style={s.heroChipRow}>
                {/* Status chip */}
                <View style={[s.heroChip, { backgroundColor: isActive ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)' }]}>
                  <View style={[s.heroDot, { backgroundColor: isActive ? '#22C55E' : '#EF4444' }]} />
                  <Text style={[s.heroChipText, { color: isActive ? '#86EFAC' : '#FCA5A5' }]}>{tenant.status}</Text>
                </View>
                {/* Username chip */}
                {tenant.user && (
                  <View style={s.heroChip}>
                    <Icon name="person-circle-outline" size={11} color="rgba(255,255,255,0.6)" />
                    <Text style={s.heroChipText}>@{tenant.user.username}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Unit/property pill */}
          {(unit || activeContract) && (
            <View style={s.heroUnitRow}>
              <Icon name="home-outline" size={12} color="rgba(255,255,255,0.6)" />
              <Text style={s.heroUnitText}>
                {unit?.unitCode ? `Unit ${unit.unitCode}` : `Unit #${unitId}`}
                {unit?.floorNumber ? ` · Floor ${unit.floorNumber}` : ''}
                {property?.name ? ` · ${property.name}` : ''}
              </Text>
            </View>
          )}

          {/* Divider */}
          <View style={s.heroDivider} />

          {/* Action buttons */}
          <View style={s.actionRow}>
            <TouchableOpacity style={s.actionBtn} onPress={handleCall} activeOpacity={0.8}>
              <View style={s.actionIconWrap}>
                <Icon name="call-outline" size={17} color="#FFFFFF" />
              </View>
              <Text style={s.actionBtnText}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={handleSendNotif} activeOpacity={0.8}>
              <View style={s.actionIconWrap}>
                <Icon name="notifications-outline" size={17} color="#FFFFFF" />
              </View>
              <Text style={s.actionBtnText}>Notify</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={() => navigation.navigate('Requests')} activeOpacity={0.8}>
              <View style={s.actionIconWrap}>
                <Icon name="construct-outline" size={17} color="#FFFFFF" />
              </View>
              <Text style={s.actionBtnText}>Requests</Text>
            </TouchableOpacity>
          </View>

          {/* Invoice status / CTA */}
          {invoiceGenerated ? (
            <TouchableOpacity
              style={s.ticket}
              onPress={navigateToInvoice}
              activeOpacity={0.9}
              disabled={invoiceBtnLoading}
            >
              {/* Top: month + total + due date */}
              <View style={s.ticketTop}>
                <View style={s.ticketIcon}>
                  <Icon name="receipt-outline" size={20} color="#4F46E5" />
                  <View style={s.ticketCheck}>
                    <Icon name="checkmark" size={9} color="#FFFFFF" />
                  </View>
                </View>
                <View style={s.ticketMain}>
                  <View style={s.ticketOverRow}>
                    <Text style={s.ticketOverline} numberOfLines={1}>{billingMonth}</Text>
                    <View style={[s.ticketStatus, { backgroundColor: ticketStatus.bg }]}>
                      <Icon name={ticketStatus.icon} size={10} color={ticketStatus.color} />
                      <Text style={[s.ticketStatusText, { color: ticketStatus.color }]}>{ticketStatus.label}</Text>
                    </View>
                  </View>
                  <Text style={s.ticketAmount} numberOfLines={1} adjustsFontSizeToFit>{fmtKhr(ticketTotal)}</Text>
                </View>
                {!!ticketDue && (
                  <View style={s.ticketDue}>
                    <Text style={s.ticketDueLabel}>Due</Text>
                    <Text style={s.ticketDueValue}>{ticketDue}</Text>
                  </View>
                )}
              </View>

              {/* Perforated divider */}
              <View style={s.ticketPerf}>
                {Array.from({ length: 40 }).map((_, i) => <View key={i} style={s.ticketPerfDash} />)}
              </View>

              {/* Bottom: status / breakdown + view */}
              <View style={s.ticketBottom}>
                <View style={s.ticketBreakdown}>
                  {invoiceRecord ? (
                    <>
                      <View style={s.ticketBreakItem}>
                        <Icon name="flash" size={12} color="#F59E0B" />
                        <Text style={s.ticketBreakText} numberOfLines={1}>{fmtKhr(invoiceRecord.elecCost)}</Text>
                      </View>
                      <View style={s.ticketBreakItem}>
                        <Icon name="water" size={12} color="#0EA5E9" />
                        <Text style={s.ticketBreakText} numberOfLines={1}>{fmtKhr(invoiceRecord.waterCost)}</Text>
                      </View>
                    </>
                  ) : (
                    <Text style={s.ticketBreakText} numberOfLines={1}>Saved to server</Text>
                  )}
                </View>
                <View style={s.ticketView}>
                  <Text style={s.ticketViewText}>View</Text>
                  <View style={s.ticketViewArrow}>
                    {invoiceBtnLoading
                      ? <ActivityIndicator size="small" color="#FFFFFF" />
                      : <Icon name="arrow-forward" size={14} color="#FFFFFF" />}
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={s.invoiceBtn}
              onPress={navigateToInvoice}
              activeOpacity={0.85}
              disabled={invoiceBtnLoading}
            >
              {invoiceBtnLoading
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <>
                    <Icon name="receipt-outline" size={17} color="#FFFFFF" />
                    <Text style={s.invoiceBtnText}>{t('tenantDetail.generateInvoice')}</Text>
                  </>
              }
            </TouchableOpacity>
          )}
        </View>

        {/* ── Quick stats row ── */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Icon name="document-text-outline" size={18} color="#6366F1" />
            <Text style={s.statValue}>{contracts.length}</Text>
            <Text style={s.statLabel}>Contracts</Text>
          </View>
          <View style={s.statCard}>
            <Icon name="construct-outline" size={18} color={urgentCount > 0 ? '#DC2626' : '#6B7280'} />
            <Text style={[s.statValue, urgentCount > 0 && { color: '#DC2626' }]}>{maintenance.length}</Text>
            <Text style={s.statLabel}>Requests{urgentCount > 0 ? ` (${urgentCount} urgent)` : ''}</Text>
          </View>
          <View style={s.statCard}>
            <Icon name="receipt-outline" size={18} color="#16A34A" />
            <Text style={s.statValue}>{invoices.length}</Text>
            <Text style={s.statLabel}>Invoices</Text>
          </View>
        </View>

        {/* ── Tenant Information ── */}
        <Text style={s.sectionTitle}>Tenant Information</Text>
        <View style={s.card}>
          {[
            { icon: 'call-outline',             label: 'Phone',            value: tenant.phoneNumber      ?? '—' },
            { icon: 'shield-checkmark-outline', label: 'Emergency Contact', value: tenant.emergencyContact ?? '—' },
            { icon: 'briefcase-outline',        label: 'Occupation',        value: tenant.occupation       ?? '—' },
            { icon: 'calendar-outline',         label: 'Member Since',      value: fmtDate(tenant.createdAt) },
          ].map((row, i, arr) => (
            <View key={row.label}>
              <View style={s.infoRow}>
                <View style={s.infoIconWrap}>
                  <Icon name={row.icon} size={15} color="#6366F1" />
                </View>
                <View style={s.infoBody}>
                  <Text style={s.infoLabel}>{row.label}</Text>
                  <Text style={s.infoValue}>{row.value}</Text>
                </View>
              </View>
              {i < arr.length - 1 && <View style={s.divider} />}
            </View>
          ))}
        </View>

        {/* ── Contract Details ── */}
        {activeContract && (
          <>
            <Text style={s.sectionTitle}>Contract Details</Text>
            <View style={s.card}>
              {[
                { icon: 'home-outline',     label: 'Unit',           value: unit?.unitCode  ?? '—' },
                { icon: 'business-outline', label: 'Property',       value: property?.name  ?? '—' },
                { icon: 'calendar-outline', label: 'Move-in Date',   value: fmtDate(activeContract.startDate) },
                { icon: 'time-outline',     label: 'Contract Until', value: fmtDate(activeContract.endDate) },
                { icon: 'cash-outline',     label: 'Monthly Rent',   value: fmtMoney(activeContract.monthlyRent ?? 0) },
              ].map((row, i, arr) => (
                <View key={row.label}>
                  <View style={s.infoRow}>
                    <View style={s.infoIconWrap}>
                      <Icon name={row.icon} size={15} color="#6366F1" />
                    </View>
                    <View style={s.infoBody}>
                      <Text style={s.infoLabel}>{row.label}</Text>
                      <Text style={s.infoValue}>{row.value}</Text>
                    </View>
                  </View>
                  {i < arr.length - 1 && <View style={s.divider} />}
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Maintenance Requests (styled like dashboard mntCards) ── */}
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>Maintenance Requests</Text>
          {urgentCount > 0 && (
            <View style={s.urgentBadge}>
              <View style={s.urgentDot} />
              <Text style={s.urgentBadgeText}>{urgentCount} Urgent</Text>
            </View>
          )}
        </View>

        {maintenance.length === 0 ? (
          <View style={s.emptyCard}>
            <View style={[s.emptyIconWrap, { backgroundColor: '#EEF2FF' }]}>
              <Icon name="construct-outline" size={24} color="#6366F1" />
            </View>
            <Text style={s.emptyTitle}>No requests found</Text>
            <Text style={s.emptySubtitle}>No maintenance linked to this tenant's units</Text>
          </View>
        ) : (
          <View style={s.mntList}>
            {maintenance.map(req => {
              const meta     = MAINTENANCE_STATUS[req.status as MaintenanceStatus] ?? MAINTENANCE_STATUS.pending;
              const isUrgent = req.priority === 'urgent' || req.priority === 'high';
              return (
                <TouchableOpacity
                  key={req.id}
                  style={s.mntCard}
                  activeOpacity={0.75}
                  onPress={() => navigation.navigate('Requests', {
                    screen: 'RequestDetail',
                    params: { requestId: req.id },
                  })}
                >
                  <View style={[s.mntAccent, { backgroundColor: isUrgent ? '#EF4444' : '#6366F1' }]} />
                  <View style={[s.mntIconWrap, { backgroundColor: isUrgent ? '#FEF2F2' : '#EEF2FF' }]}>
                    <Icon name="construct-outline" size={19} color={isUrgent ? '#DC2626' : '#6366F1'} />
                  </View>
                  <View style={s.mntBody}>
                    <View style={s.mntTopRow}>
                      <Text style={s.mntTitle} numberOfLines={1}>{req.description}</Text>
                      {isUrgent && (
                        <View style={s.urgentInlineBadge}>
                          <View style={s.urgentDot} />
                          <Text style={s.urgentInlineText}>Urgent</Text>
                        </View>
                      )}
                    </View>
                    <View style={s.mntMetaRow}>
                      <View style={s.mntChip}>
                        <Icon name="construct-outline" size={10} color="#6B7280" />
                        <Text style={s.mntChipText}>{req.type}</Text>
                      </View>
                      <View style={s.mntChip}>
                        <Icon name="time-outline" size={10} color="#6B7280" />
                        <Text style={s.mntChipText}>{timeAgo(req.createdAt)}</Text>
                      </View>
                      <View style={[s.mntChip, { backgroundColor: meta.bg }]}>
                        <Text style={[s.mntChipText, { color: meta.color, fontWeight: '700' }]}>{meta.label}</Text>
                      </View>
                    </View>
                  </View>
                  <Icon name="chevron-forward" size={15} color="#D1D5DB" style={{ paddingRight: 12 }} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Invoice History ── */}
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>Invoice History</Text>
          {invoicesLoading && <ActivityIndicator size="small" color="#6366F1" />}
        </View>

        {/* Range filter pills */}
        <View style={s.rangeRow}>
          {INVOICE_RANGES.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[s.rangeBtn, invoiceRange === opt.key && s.rangeBtnActive]}
              onPress={() => setInvoiceRange(opt.key)}
              activeOpacity={0.7}
            >
              <Text style={[s.rangeBtnText, invoiceRange === opt.key && s.rangeBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {!invoicesLoading && invoices.length === 0 ? (
          <View style={s.emptyCard}>
            <View style={[s.emptyIconWrap, { backgroundColor: '#EEF2FF' }]}>
              <Icon name="receipt-outline" size={24} color="#6366F1" />
            </View>
            <Text style={s.emptyTitle}>No invoices found</Text>
            <Text style={s.emptySubtitle}>No invoices for the selected period</Text>
          </View>
        ) : (
          <View style={s.card}>
            {invoices.map((inv: any, i: number) => {
              const status = (inv.status ?? 'pending') as InvoiceStatus;
              const meta   = INVOICE_STATUS_META[status] ?? INVOICE_STATUS_META.pending;
              const amount = parseFloat(inv.totalAmount ?? inv.amount ?? 0);
              const billing = inv.billingMonth ?? inv.createdAt?.slice(0, 7);
              return (
                <View key={inv.id}>
                  <View style={s.invRow}>
                    <View style={[s.invIconWrap, { backgroundColor: meta.bg }]}>
                      <Icon name={meta.icon} size={16} color={meta.color} />
                    </View>
                    <View style={s.invBody}>
                      <Text style={s.invMonth}>{billing ? fmtMonth(billing) : '—'}</Text>
                      {inv.dueDate && <Text style={s.invDue}>Due {fmtDate(inv.dueDate)}</Text>}
                    </View>
                    <View style={s.invRight}>
                      <Text style={s.invAmount}>{fmtMoney(amount)}</Text>
                      <View style={[s.invStatusPill, { backgroundColor: meta.bg }]}>
                        <Text style={[s.invStatusText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                    </View>
                  </View>
                  {i < invoices.length - 1 && <View style={s.divider} />}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Occupants ── */}
        {tenant.occupants?.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Occupants</Text>
            <View style={[s.card, { marginBottom: 8 }]}>
              {tenant.occupants.map((occ: any, i: number) => (
                <View key={occ.id}>
                  <View style={s.infoRow}>
                    <View style={s.infoIconWrap}>
                      <Icon name="person-outline" size={15} color="#6366F1" />
                    </View>
                    <View style={s.infoBody}>
                      <Text style={s.infoLabel}>{occ.relationship ?? 'Occupant'}</Text>
                      <Text style={s.infoValue}>{occ.name}</Text>
                      {occ.phoneNumber && <Text style={s.infoSub}>{occ.phoneNumber}</Text>}
                    </View>
                  </View>
                  {i < tenant.occupants.length - 1 && <View style={s.divider} />}
                </View>
              ))}
            </View>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  scroll:    { flex: 1 },
  content:   { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 16 },

  // ── Header (matches Dashboard hdr) ──
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 4,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  notifBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // ── Hero card (dark — matches Dashboard perfBg) ──
  heroCard: {
    backgroundColor: 'rgba(49,46,129,0.90)', borderRadius: 24, padding: 20,
    overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
    shadowColor: '#312E81', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 20, elevation: 8,
  },
  glow1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(167,139,250,0.18)', top: -70,  right: -50 },
  glow2: { position: 'absolute', width: 140, height: 140, borderRadius: 70,  backgroundColor: 'rgba(99,102,241,0.15)',  bottom: -50, left: -30 },
  glow3: { position: 'absolute', width: 90,  height: 90,  borderRadius: 45,  backgroundColor: 'rgba(196,181,253,0.12)', top: 50,   left: 110  },

  heroTop:       { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14 },
  avatar:        { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:    { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  heroNameBlock: { flex: 1 },
  heroName:      { fontSize: 19, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.4, marginBottom: 6 },
  heroChipRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heroChip:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  heroDot:       { width: 5, height: 5, borderRadius: 3 },
  heroChipText:  { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },

  heroUnitRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  heroUnitText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },

  heroDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.12)', marginBottom: 16 },

  // ── Action buttons (inside hero) ──
  actionRow:    { flexDirection: 'row', gap: 8, marginBottom: 14 },
  actionBtn:    { flex: 1, alignItems: 'center', gap: 6 },
  actionIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  actionBtnText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },

  // ── Invoice CTA / generated banner (inside hero) ──
  invoiceBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 13,
    shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
  },
  invoiceBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },

  // Generated invoice — white "ticket" that pops off the indigo hero
  ticket: {
    backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden',
    shadowColor: '#1E1B4B', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
  },
  ticketTop:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
  ticketIcon:     { width: 42, height: 42, borderRadius: 13, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  ticketCheck: {
    position: 'absolute', right: -3, bottom: -3, width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#16A34A', borderWidth: 2, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  ticketMain:     { flex: 1 },
  ticketOverRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ticketOverline: { fontSize: 10, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6, flexShrink: 1 },
  ticketAmount:   { fontSize: 20, fontWeight: '900', color: '#1E1B4B', letterSpacing: -0.5, marginTop: 2 },
  ticketDue:      { alignItems: 'center', backgroundColor: '#F5F3FF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  ticketDueLabel: { fontSize: 9, fontWeight: '700', color: '#8B5CF6', textTransform: 'uppercase', letterSpacing: 0.5 },
  ticketDueValue: { fontSize: 12, fontWeight: '800', color: '#5B21B6', marginTop: 1 },

  ticketPerf:     { flexDirection: 'row', gap: 4, overflow: 'hidden', marginHorizontal: 14 },
  ticketPerfDash: { width: 6, height: 1.5, borderRadius: 1, backgroundColor: '#E5E7EB' },

  ticketBottom:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  ticketBreakdown: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  ticketStatus:    { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ticketStatusText:{ fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  ticketBreakItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  ticketBreakText: { fontSize: 11, fontWeight: '600', color: '#6B7280', flexShrink: 1 },
  ticketView:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ticketViewText:  { fontSize: 13, fontWeight: '800', color: '#4F46E5' },
  ticketViewArrow: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' },

  // ── Quick stats row ──
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 14,
    alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  statValue: { fontSize: 20, fontWeight: '900', color: '#111827', letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontWeight: '600', color: '#9CA3AF', textAlign: 'center' },

  // ── Section titles (matches Dashboard sectionTitle) ──
  sectionTitle:    { fontSize: 16, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  sectionHeaderRow:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  // ── White cards ──
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#F3F4F6', marginHorizontal: 16 },

  // ── Info rows ──
  infoRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  infoIconWrap:{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  infoBody:    { flex: 1, justifyContent: 'center' },
  infoLabel:   { fontSize: 11, color: '#9CA3AF', marginBottom: 2, fontWeight: '500' },
  infoValue:   { fontSize: 14, fontWeight: '600', color: '#111827' },
  infoSub:     { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  // ── Urgent badge (section header) ──
  urgentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FEF2F2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  urgentDot:       { width: 5, height: 5, borderRadius: 3, backgroundColor: '#EF4444' },
  urgentBadgeText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },

  // ── Maintenance cards (matches Dashboard mntCard) ──
  mntList: { gap: 10 },
  mntCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  mntAccent:   { width: 4, alignSelf: 'stretch' },
  mntIconWrap: { width: 44, height: 44, borderRadius: 12, margin: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  mntBody:     { flex: 1, paddingVertical: 12, paddingRight: 4 },
  mntTopRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  mntTitle:    { flex: 1, fontSize: 13, fontWeight: '700', color: '#111827' },
  mntMetaRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  mntChip:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F3F4F6', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  mntChipText: { fontSize: 10, fontWeight: '600', color: '#6B7280' },
  urgentInlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF2F2', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  urgentInlineText:  { fontSize: 10, fontWeight: '700', color: '#DC2626' },

  // ── Invoice history ──
  rangeRow: { flexDirection: 'row', gap: 8 },
  rangeBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: 'transparent',
  },
  rangeBtnActive:     { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  rangeBtnText:       { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  rangeBtnTextActive: { color: '#6366F1' },

  invRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  invIconWrap:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  invBody:      { flex: 1 },
  invMonth:     { fontSize: 14, fontWeight: '700', color: '#111827' },
  invDue:       { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  invRight:     { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  invAmount:    { fontSize: 13, fontWeight: '700', color: '#111827' },
  invStatusPill:{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  invStatusText:{ fontSize: 11, fontWeight: '700' },

  // ── Empty states ──
  emptyCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18,
    alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  emptyIconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle:    { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 4 },
  emptySubtitle: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 17 },
});
