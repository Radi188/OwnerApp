import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { TenantsStackParamList } from '../navigation/AppNavigator';
import { utilityApi, invoicesApi } from '../services/api';
import { getInvoice, saveInvoice } from '../store/invoiceStore';

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtKhr(n: number): string {
  return n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' ៛';
}
function fmtUsd(n: number): string {
  return '$' + n.toFixed(2);
}
function fmtDate(d: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const AVATAR_COLORS = ['#6366F1', '#0891B2', '#16A34A', '#CA8A04', '#DC2626', '#7C3AED'];
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function GenerateInvoiceScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute<RouteProp<TenantsStackParamList, 'GenerateInvoice'>>();
  const insets     = useSafeAreaInsets();

  const { tenantId, contractId, unitId, lastReading, apiInvoice } = route.params;

  // ── Parse API response ─────────────────────────────────────────────────────
  const apiData  = lastReading?.data ?? {};
  const ctx      = apiData.context        ?? {};
  const elec     = apiData.electricity    ?? {};
  const water    = apiData.water          ?? {};
  const fees     = apiData.additionalFees ?? {};
  const billing  = apiData.billingInfo    ?? {};
  const settings = apiData.settings       ?? {};

  const exchangeRate  = Number(settings.exchangeRate ?? 4000);
  const prevKwh       = parseFloat(String(elec.previousReading  ?? 0));
  const prevWater     = parseFloat(String(water.previousReading ?? 0));
  const kwhRateUsd    = parseFloat(String(elec.pricePerUnit  ?? 0));
  const waterRateUsd  = parseFloat(String(water.pricePerUnit ?? 0));

  // All additional fees stored as USD
  const rentUsd       = Number(fees.rent        ?? 0);
  const parkingUsd    = Number(fees.parking     ?? 0);
  const internetUsd   = Number(fees.internet    ?? 0);
  const garbageUsd    = Number(fees.garbage     ?? 0);
  const managementUsd = Number(fees.management  ?? 0);
  const additionalUsd = Number(fees.additional  ?? 0);
  const fixedUsd      = rentUsd + parkingUsd + internetUsd + garbageUsd + managementUsd + additionalUsd;

  const tenantName      = ctx.tenant   ?? '';
  const roomCode        = ctx.room     ?? '';
  const propName        = ctx.property ?? '';
  const displayMonth    = billing.displayMonth ?? ctx.month ?? '';
  const billingMonthApi = billing.billingMonth ?? '';
  const dueDate         = billing.dueDate ?? '';

  // ── UI state ───────────────────────────────────────────────────────────────
  const storeMonth      = billingMonthApi || displayMonth; // normalised to YYYY-MM inside the store
  const existingInvoice = getInvoice(String(tenantId), storeMonth);
  // Invoice exists on the API but this device has no saved readings → read-only summary
  const remoteOnly      = !!apiInvoice && !existingInvoice;
  const [isEditing,   setIsEditing]   = useState(!existingInvoice && !apiInvoice);
  const [currKwh,     setCurrKwh]     = useState(existingInvoice ? String(existingInvoice.currKwh)   : '');
  const [currWater,   setCurrWater]   = useState(existingInvoice ? String(existingInvoice.currWater) : '');
  const [notes,       setNotes]       = useState(existingInvoice?.notes ?? '');
  const [submitting,  setSubmitting]  = useState(false);
  const [currency,    setCurrency]    = useState<'USD' | 'KHR'>('USD');

  // ── Calculations (everything in USD, convert for display) ──────────────────
  const kwhNum     = parseFloat(currKwh)   || 0;
  const waterNum   = parseFloat(currWater) || 0;
  const usageKwh   = Math.max(0, kwhNum   - prevKwh);
  const usageWater = Math.max(0, waterNum - prevWater);
  const elecUsd    = usageKwh   * kwhRateUsd;
  const waterUsd   = usageWater * waterRateUsd;
  const totalUsd   = fixedUsd + elecUsd + waterUsd;

  const kwhValid   = currKwh   !== '' && kwhNum   >= prevKwh;
  const waterValid = currWater !== '' && waterNum >= prevWater;
  const isValid    = kwhValid && waterValid;
  const isViewMode = (!!existingInvoice || !!apiInvoice) && !isEditing;

  // ── Currency helpers ───────────────────────────────────────────────────────
  const fmt = (usd: number) =>
    currency === 'USD' ? fmtUsd(usd) : fmtKhr(usd * exchangeRate);

  const avatarColor = AVATAR_COLORS[tenantId % AVATAR_COLORS.length];

  // All fee rows — always show all, even if 0
  const fixedFeeRows = [
    { label: 'Room Rental',    note: 'Monthly fixed',     icon: 'home',               iconBg: '#EEF2FF', iconColor: '#6366F1', usd: rentUsd       },
    { label: 'Management Fee', note: 'Building mgmt',     icon: 'shield-outline',     iconBg: '#F0FDF4', iconColor: '#16A34A', usd: managementUsd  },
    { label: 'Parking Fee',    note: 'Reserved parking',  icon: 'car-outline',        iconBg: '#EFF6FF', iconColor: '#2563EB', usd: parkingUsd     },
    { label: 'Internet Fee',   note: 'Monthly broadband', icon: 'wifi-outline',       iconBg: '#ECFEFF', iconColor: '#0891B2', usd: internetUsd    },
    { label: 'Garbage Fee',    note: 'Waste collection',  icon: 'trash-outline',      iconBg: '#FFF7ED', iconColor: '#EA580C', usd: garbageUsd     },
    { label: 'Additional Fee', note: 'Other charges',     icon: 'add-circle-outline', iconBg: '#F3F4F6', iconColor: '#6B7280', usd: additionalUsd  },
  ];

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!isValid) return;
    Alert.alert(
      'Confirm Invoice',
      `Generate invoice for ${tenantName}?\n\nBilling: ${displayMonth}\nTotal: ${fmtUsd(totalUsd)} (${fmtKhr(totalUsd * exchangeRate)})`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: existingInvoice ? 'Update' : 'Confirm',
          onPress: async () => {
            setSubmitting(true);
            try {
              const today = new Date();
              const readingDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              await utilityApi.bulk({
                unitId,
                electricityReading: kwhNum,
                waterReading:       waterNum,
                readingDate,
                note:               notes || '',
              });
              await invoicesApi.create({ contractId, billingMonth: billingMonthApi });
              const totalKhr = totalUsd * exchangeRate;
              saveInvoice({
                tenantId: String(tenantId), billingMonth: storeMonth,
                currKwh: kwhNum, currWater: waterNum, notes,
                scheduledDate: dueDate, total: totalKhr,
                elecCost: elecUsd * exchangeRate, waterCost: waterUsd * exchangeRate,
                usageKwh, usageWater,
              });
              setIsEditing(false);
              Alert.alert('Invoice Created', `Invoice for ${tenantName} has been generated.\nDue: ${fmtDate(dueDate)}`,
                [{ text: 'Done', onPress: () => navigation.goBack() }]);
            } catch (e: any) {
              if (e?.message?.toLowerCase().includes('duplicate') || e?.status === 400) {
                const totalKhr = totalUsd * exchangeRate;
                saveInvoice({
                  tenantId: String(tenantId), billingMonth: storeMonth,
                  currKwh: kwhNum, currWater: waterNum, notes,
                  scheduledDate: dueDate, total: totalKhr,
                  elecCost: elecUsd * exchangeRate, waterCost: waterUsd * exchangeRate,
                  usageKwh, usageWater,
                });
                setIsEditing(false);
                Alert.alert('Readings Saved', 'Utility readings saved. Invoice already exists for this month.',
                  [{ text: 'Done', onPress: () => navigation.goBack() }]);
              } else {
                Alert.alert('Error', e?.message ?? 'Failed to save invoice.');
              }
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  // ── Currency toggle component ──────────────────────────────────────────────
  const CurrencyToggle = () => (
    <View style={s.toggleWrap}>
      <TouchableOpacity
        style={[s.toggleBtn, currency === 'USD' && s.toggleBtnActive]}
        onPress={() => setCurrency('USD')}
        activeOpacity={0.8}
      >
        <Text style={[s.toggleBtnText, currency === 'USD' && s.toggleBtnTextActive]}>$ USD</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.toggleBtn, currency === 'KHR' && s.toggleBtnActive]}
        onPress={() => setCurrency('KHR')}
        activeOpacity={0.8}
      >
        <Text style={[s.toggleBtnText, currency === 'KHR' && s.toggleBtnTextActive]}>៛ KHR</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={[]}>

      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Icon name="chevron-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>{isViewMode ? 'View Invoice' : 'Generate Invoice'}</Text>
          <Text style={s.headerSub}>{displayMonth}</Text>
        </View>
        {isViewMode && !remoteOnly ? (
          <TouchableOpacity style={s.editBtn} onPress={() => setIsEditing(true)} activeOpacity={0.7}>
            <Icon name="create-outline" size={15} color="#6366F1" />
            <Text style={s.editBtnText}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 62 }} />
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── Saved banner ── */}
          {isViewMode && (
            <View style={s.savedBanner}>
              <Icon name="checkmark-circle" size={16} color="#16A34A" />
              <Text style={s.savedBannerText}>Invoice saved for {displayMonth}</Text>
            </View>
          )}

          {/* ── Hero card ── */}
          <View style={s.heroCard}>
            <View style={s.glow1} /><View style={s.glow2} /><View style={s.glow3} />

            <View style={s.heroTop}>
              <View style={[s.avatar, { backgroundColor: avatarColor }]}>
                <Text style={s.avatarText}>{tenantName ? initials(tenantName) : '?'}</Text>
              </View>
              <View style={s.heroInfo}>
                <Text style={s.heroName}>{tenantName}</Text>
                <View style={s.heroChipRow}>
                  {roomCode ? (
                    <View style={s.heroChip}>
                      <Icon name="home-outline" size={10} color="rgba(255,255,255,0.7)" />
                      <Text style={s.heroChipText}>{roomCode}</Text>
                    </View>
                  ) : null}
                  {propName ? (
                    <View style={s.heroChip}>
                      <Icon name="business-outline" size={10} color="rgba(255,255,255,0.7)" />
                      <Text style={s.heroChipText}>{propName}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={s.heroGrid}>
              <View style={s.heroMetaItem}>
                <Text style={s.heroMetaLabel}>Billing Month</Text>
                <Text style={s.heroMetaValue}>{displayMonth}</Text>
              </View>
              <View style={s.heroMetaDivider} />
              <View style={s.heroMetaItem}>
                <Text style={s.heroMetaLabel}>Due Date</Text>
                <Text style={[s.heroMetaValue, { color: '#FCA5A5' }]}>{fmtDate(dueDate)}</Text>
              </View>
              <View style={s.heroMetaDivider} />
              <View style={s.heroMetaItem}>
                <Text style={s.heroMetaLabel}>Rate</Text>
                <Text style={[s.heroMetaValue, { color: '#93C5FD' }]}>{exchangeRate.toLocaleString()} ៛/$</Text>
              </View>
            </View>
          </View>

          {remoteOnly && apiInvoice ? (
            <>
              {/* ── Invoice already on the server — read-only summary ── */}
              <Text style={s.sectionTitle}>Invoice Summary</Text>
              <View style={s.card}>
                <View style={s.bkRow}>
                  <View style={[s.bkIconWrap, { backgroundColor: '#EEF2FF' }]}>
                    <Icon name="receipt-outline" size={14} color="#6366F1" />
                  </View>
                  <View style={s.bkBody}>
                    <Text style={s.bkLabel}>Invoice #{apiInvoice.id}</Text>
                    <Text style={s.bkNote}>Status: {(apiInvoice.status ?? 'pending').replace(/^\w/, c => c.toUpperCase())}</Text>
                  </View>
                </View>
                <View style={s.divider} />
                <View style={s.bkRow}>
                  <View style={[s.bkIconWrap, { backgroundColor: '#FEF2F2' }]}>
                    <Icon name="time-outline" size={14} color="#DC2626" />
                  </View>
                  <View style={s.bkBody}>
                    <Text style={s.bkLabel}>Due Date</Text>
                    <Text style={s.bkNote}>{fmtDate(apiInvoice.dueDate ?? dueDate)}</Text>
                  </View>
                </View>
              </View>

              <View style={s.totalCard}>
                <View style={s.totalGlow1} /><View style={s.totalGlow2} />
                <View style={s.totalLeft}>
                  <Text style={s.totalLabel}>Total Due</Text>
                  <Text style={s.totalSub}>≈ {fmtUsd(apiInvoice.totalAmount / exchangeRate)}</Text>
                </View>
                <Text style={s.totalMain}>{fmtKhr(apiInvoice.totalAmount)}</Text>
              </View>
            </>
          ) : (<>

          {/* ── Previous readings ── two side-by-side stat cards ── */}
          <Text style={s.sectionTitle}>Previous Readings</Text>
          <View style={s.prevRow}>
            {/* Electricity */}
            <View style={s.prevCard}>
              <View style={s.prevCardTop}>
                <View style={[s.prevCardIconWrap, { backgroundColor: '#FEF9C3' }]}>
                  <Icon name="flash" size={18} color="#CA8A04" />
                </View>
                <View style={[s.prevRatePill, { backgroundColor: '#FEF9C3' }]}>
                  <Text style={[s.prevRateText, { color: '#92400E' }]}>{fmtUsd(kwhRateUsd)}/kWh</Text>
                </View>
              </View>
              <Text style={s.prevCardReadingVal}>{prevKwh.toLocaleString()}</Text>
              <Text style={s.prevCardUnit}>kWh</Text>
              <Text style={s.prevCardLabel}>Electricity</Text>
            </View>

            {/* Water */}
            <View style={s.prevCard}>
              <View style={s.prevCardTop}>
                <View style={[s.prevCardIconWrap, { backgroundColor: '#DBEAFE' }]}>
                  <Icon name="water" size={18} color="#2563EB" />
                </View>
                <View style={[s.prevRatePill, { backgroundColor: '#DBEAFE' }]}>
                  <Text style={[s.prevRateText, { color: '#1D4ED8' }]}>{fmtUsd(waterRateUsd)}/m³</Text>
                </View>
              </View>
              <Text style={s.prevCardReadingVal}>{parseFloat(String(prevWater)).toLocaleString()}</Text>
              <Text style={s.prevCardUnit}>m³</Text>
              <Text style={s.prevCardLabel}>Water</Text>
            </View>
          </View>

          {/* ── Current readings ── one card per meter ── */}
          <Text style={s.sectionTitle}>Current Readings</Text>

          {/* Electricity meter card */}
          <View style={s.meterCard}>
            <View style={s.meterCardHeader}>
              <View style={[s.meterCardIconWrap, { backgroundColor: '#FEF9C3' }]}>
                <Icon name="flash" size={16} color="#CA8A04" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.meterCardName}>Electricity</Text>
                <Text style={s.meterCardPrev}>Previous: {prevKwh.toLocaleString()} kWh</Text>
              </View>
              <View style={s.meterUnitBadge}>
                <Text style={s.meterUnitText}>kWh</Text>
              </View>
            </View>

            {isViewMode ? (
              <View style={s.meterReadonlyWrap}>
                <Text style={s.meterReadonlyVal}>{currKwh}</Text>
                <View style={[s.meterResult, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                  <Icon name="trending-up-outline" size={13} color="#16A34A" />
                  <Text style={s.meterResultText}>Used <Text style={s.meterResultBold}>{usageKwh} kWh</Text> → {fmt(elecUsd)}</Text>
                </View>
              </View>
            ) : (
              <View style={s.meterInputWrap}>
                <TextInput
                  style={[s.meterInput, currKwh !== '' && !kwhValid && s.meterInputError]}
                  placeholder="0"
                  placeholderTextColor="#D1D5DB"
                  keyboardType="decimal-pad"
                  value={currKwh}
                  onChangeText={setCurrKwh}
                />
                {currKwh !== '' && kwhValid && (
                  <View style={[s.meterResult, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                    <Icon name="trending-up-outline" size={13} color="#16A34A" />
                    <Text style={s.meterResultText}>Used <Text style={s.meterResultBold}>{usageKwh} kWh</Text> → {fmt(elecUsd)}</Text>
                  </View>
                )}
                {currKwh !== '' && !kwhValid && (
                  <View style={[s.meterResult, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                    <Icon name="warning-outline" size={13} color="#DC2626" />
                    <Text style={[s.meterResultText, { color: '#DC2626' }]}>Must be ≥ <Text style={s.meterResultBold}>{prevKwh}</Text> kWh</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Water meter card */}
          <View style={s.meterCard}>
            <View style={s.meterCardHeader}>
              <View style={[s.meterCardIconWrap, { backgroundColor: '#DBEAFE' }]}>
                <Icon name="water" size={16} color="#2563EB" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.meterCardName}>Water</Text>
                <Text style={s.meterCardPrev}>Previous: {parseFloat(String(prevWater)).toLocaleString()} m³</Text>
              </View>
              <View style={s.meterUnitBadge}>
                <Text style={s.meterUnitText}>m³</Text>
              </View>
            </View>

            {isViewMode ? (
              <View style={s.meterReadonlyWrap}>
                <Text style={s.meterReadonlyVal}>{currWater}</Text>
                <View style={[s.meterResult, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                  <Icon name="trending-up-outline" size={13} color="#16A34A" />
                  <Text style={s.meterResultText}>Used <Text style={s.meterResultBold}>{usageWater.toFixed(1)} m³</Text> → {fmt(waterUsd)}</Text>
                </View>
              </View>
            ) : (
              <View style={s.meterInputWrap}>
                <TextInput
                  style={[s.meterInput, currWater !== '' && !waterValid && s.meterInputError]}
                  placeholder="0"
                  placeholderTextColor="#D1D5DB"
                  keyboardType="decimal-pad"
                  value={currWater}
                  onChangeText={setCurrWater}
                />
                {currWater !== '' && waterValid && (
                  <View style={[s.meterResult, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                    <Icon name="trending-up-outline" size={13} color="#16A34A" />
                    <Text style={s.meterResultText}>Used <Text style={s.meterResultBold}>{usageWater.toFixed(1)} m³</Text> → {fmt(waterUsd)}</Text>
                  </View>
                )}
                {currWater !== '' && !waterValid && (
                  <View style={[s.meterResult, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                    <Icon name="warning-outline" size={13} color="#DC2626" />
                    <Text style={[s.meterResultText, { color: '#DC2626' }]}>Must be ≥ <Text style={s.meterResultBold}>{prevWater}</Text> m³</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* ── Notes ── */}
          <Text style={s.sectionTitle}>Notes</Text>
          {isViewMode ? (
            <View style={[s.notesReadonly, !notes && s.notesEmpty]}>
              <Text style={notes ? s.notesText : s.notesEmptyText}>{notes || '—'}</Text>
            </View>
          ) : (
            <TextInput
              style={s.notesInput}
              placeholder="Optional notes..."
              placeholderTextColor="#9CA3AF"
              value={notes}
              onChangeText={setNotes}
              multiline
              maxLength={200}
            />
          )}

          {/* ── Invoice Breakdown — always visible ── */}
          <View style={s.breakdownHeader}>
            <Text style={s.sectionTitle}>Invoice Breakdown</Text>
            <CurrencyToggle />
          </View>

          {/* Fixed fees card — all rows, including zeros */}
          <View style={s.card}>
            {fixedFeeRows.map((row, i) => (
              <View key={row.label}>
                <View style={s.bkRow}>
                  <View style={[s.bkIconWrap, { backgroundColor: row.iconBg }]}>
                    <Icon name={row.icon} size={14} color={row.iconColor} />
                  </View>
                  <View style={s.bkBody}>
                    <Text style={s.bkLabel}>{row.label}</Text>
                    <Text style={s.bkNote}>{row.note}</Text>
                  </View>
                  <Text style={[s.bkAmount, row.usd === 0 && s.bkAmountZero]}>
                    {fmt(row.usd)}
                  </Text>
                </View>
                {i < fixedFeeRows.length - 1 && <View style={s.divider} />}
              </View>
            ))}
          </View>

          {/* Utility charges card */}
          <View style={s.card}>
            <View style={s.bkRow}>
              <View style={[s.bkIconWrap, { backgroundColor: '#FEF9C3' }]}>
                <Icon name="flash" size={14} color="#CA8A04" />
              </View>
              <View style={s.bkBody}>
                <Text style={s.bkLabel}>Electricity</Text>
                {kwhValid
                  ? <Text style={s.bkNote}>{usageKwh} kWh × {fmtUsd(kwhRateUsd)}</Text>
                  : <Text style={s.bkNotePending}>Pending meter reading</Text>
                }
              </View>
              <Text style={[s.bkAmount, !kwhValid && s.bkAmountZero]}>{fmt(elecUsd)}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.bkRow}>
              <View style={[s.bkIconWrap, { backgroundColor: '#DBEAFE' }]}>
                <Icon name="water" size={14} color="#2563EB" />
              </View>
              <View style={s.bkBody}>
                <Text style={s.bkLabel}>Water</Text>
                {waterValid
                  ? <Text style={s.bkNote}>{usageWater.toFixed(1)} m³ × {fmtUsd(waterRateUsd)}</Text>
                  : <Text style={s.bkNotePending}>Pending meter reading</Text>
                }
              </View>
              <Text style={[s.bkAmount, !waterValid && s.bkAmountZero]}>{fmt(waterUsd)}</Text>
            </View>
          </View>

          {/* Total card */}
          <View style={s.totalCard}>
            <View style={s.totalGlow1} /><View style={s.totalGlow2} />
            <View style={s.totalLeft}>
              <Text style={s.totalLabel}>Total Due</Text>
              <Text style={s.totalSub}>
                {currency === 'USD'
                  ? `≈ ${fmtKhr(totalUsd * exchangeRate)}`
                  : `≈ ${fmtUsd(totalUsd)}`
                }
              </Text>
            </View>
            <Text style={s.totalMain}>{fmt(totalUsd)}</Text>
          </View>

          {/* Due date pill */}
          <View style={s.duePill}>
            <Icon name="time-outline" size={14} color="#DC2626" />
            <Text style={s.dueText}>
              Payment due by <Text style={s.dueBold}>{fmtDate(dueDate)}</Text>
            </Text>
          </View>

          {/* ── Submit ── */}
          {!isViewMode && (
            <TouchableOpacity
              style={[s.submitBtn, (!isValid || submitting) && s.submitBtnDisabled]}
              onPress={handleSave}
              activeOpacity={0.85}
              disabled={!isValid || submitting}
            >
              {submitting
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <><Icon name="send-outline" size={18} color="#FFFFFF" /><Text style={s.submitBtnText}>{existingInvoice ? 'Update Invoice' : 'Generate Invoice'}</Text></>
              }
            </TouchableOpacity>
          )}
          </>)}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },

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
  headerCenter: { flex: 1 },
  headerTitle:  { fontSize: 17, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  headerSub:    { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#EEF2FF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  editBtnText: { fontSize: 13, fontWeight: '700', color: '#6366F1' },

  content: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 48, gap: 16 },

  savedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F0FDF4', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  savedBannerText: { flex: 1, fontSize: 13, color: '#15803D', fontWeight: '600' },

  // ── Hero card ──
  heroCard: {
    backgroundColor: 'rgba(49,46,129,0.90)', borderRadius: 24, padding: 20,
    overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
    shadowColor: '#312E81', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 20, elevation: 8,
  },
  glow1: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(167,139,250,0.18)', top: -60,  right: -40 },
  glow2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(99,102,241,0.15)',  bottom: -40, left: -20 },
  glow3: { position: 'absolute', width: 70,  height: 70,  borderRadius: 35, backgroundColor: 'rgba(196,181,253,0.12)', top: 40,   left: 100  },

  heroTop:      { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  avatar:       { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:   { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  heroInfo:     { flex: 1 },
  heroName:     { fontSize: 17, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3, marginBottom: 6 },
  heroChipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heroChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  heroChipText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },

  heroGrid:        { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 14 },
  heroMetaItem:    { flex: 1 },
  heroMetaDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 8 },
  heroMetaLabel:   { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  heroMetaValue:   { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },

  // ── Breakdown header row with currency toggle ──
  breakdownHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleWrap:      { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 10, padding: 3 },
  toggleBtn:       { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  toggleBtnActive: { backgroundColor: '#6366F1', shadowColor: '#6366F1', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
  toggleBtnText:   { fontSize: 12, fontWeight: '700', color: '#9CA3AF' },
  toggleBtnTextActive: { color: '#FFFFFF' },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#F3F4F6', marginHorizontal: 16 },

  // ── Previous readings — two side-by-side cards ──
  prevRow: { flexDirection: 'row', gap: 12 },
  prevCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  prevCardTop:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  prevCardIconWrap: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  prevRatePill:     { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  prevRateText:     { fontSize: 10, fontWeight: '700' },
  prevCardReadingVal: { fontSize: 28, fontWeight: '900', color: '#111827', letterSpacing: -1 },
  prevCardUnit:     { fontSize: 12, fontWeight: '600', color: '#9CA3AF', marginTop: 2, marginBottom: 6 },
  prevCardLabel:    { fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4 },

  // ── Current readings — individual meter cards ──
  meterCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  meterCardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  meterCardIconWrap:{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  meterCardName:    { fontSize: 15, fontWeight: '800', color: '#111827' },
  meterCardPrev:    { fontSize: 11, color: '#9CA3AF', fontWeight: '500', marginTop: 2 },
  meterUnitBadge:   { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexShrink: 0 },
  meterUnitText:    { fontSize: 12, fontWeight: '800', color: '#6B7280' },

  meterInputWrap:   { gap: 10 },
  meterInput: {
    backgroundColor: '#F9FAFB', borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 18, paddingVertical: 16,
    fontSize: 34, fontWeight: '900', color: '#111827', letterSpacing: -1,
    textAlign: 'center',
  },
  meterInputError:  { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  meterReadonlyWrap:{ gap: 10 },
  meterReadonlyVal: {
    fontSize: 34, fontWeight: '900', color: '#111827', letterSpacing: -1,
    backgroundColor: '#F3F4F6', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16,
    textAlign: 'center',
  },
  meterResult: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9,
  },
  meterResultText: { fontSize: 12, color: '#374151', fontWeight: '500', flex: 1 },
  meterResultBold: { fontWeight: '800', color: '#111827' },

  // ── Notes ──
  notesInput: {
    backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#111827', minHeight: 88, textAlignVertical: 'top',
  },
  notesReadonly:  { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, minHeight: 52 },
  notesEmpty:     { backgroundColor: '#F9FAFB' },
  notesText:      { fontSize: 14, color: '#374151', lineHeight: 20 },
  notesEmptyText: { fontSize: 14, color: '#D1D5DB' },

  // ── Breakdown rows ──
  bkRow:          { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  bkIconWrap:     { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bkBody:         { flex: 1 },
  bkLabel:        { fontSize: 13, fontWeight: '700', color: '#374151' },
  bkNote:         { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  bkNotePending:  { fontSize: 11, color: '#D97706', marginTop: 2, fontWeight: '600' },
  bkAmount:       { fontSize: 13, fontWeight: '800', color: '#111827', flexShrink: 0 },
  bkAmountZero:   { color: '#D1D5DB' },

  // ── Total card ──
  totalCard: {
    backgroundColor: '#5B21B6', borderRadius: 20, padding: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    overflow: 'hidden',
    shadowColor: '#312E81', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  totalGlow1: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(167,139,250,0.2)', top: -50, right: -30 },
  totalGlow2: { position: 'absolute', width: 80,  height: 80,  borderRadius: 40, backgroundColor: 'rgba(99,102,241,0.2)',  bottom: -30, left: 40 },
  totalLeft:  { gap: 4 },
  totalLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5 },
  totalSub:   { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.45)' },
  totalMain:  { fontSize: 26, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },

  // ── Due pill ──
  duePill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#FECACA',
  },
  dueText: { flex: 1, fontSize: 13, color: '#374151' },
  dueBold: { fontWeight: '800', color: '#DC2626' },

  // ── Submit ──
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: '#6366F1', borderRadius: 16, paddingVertical: 17,
  },
  submitBtnDisabled: { backgroundColor: '#C7D2FE' },
  submitBtnText:     { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
});
