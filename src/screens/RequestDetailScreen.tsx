import React, { useState, useCallback, useEffect } from 'react';
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
  Modal,
  FlatList,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { RequestsStackParamList } from '../navigation/AppNavigator';
import { maintenanceApi, usersApi } from '../services/api';

type MaintenanceStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

type Reply = {
  id: string;
  from: 'owner' | 'tenant';
  text: string;
  time: string;
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const PRIORITY_META: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  low: { label: 'Low', color: '#16A34A', bg: '#DCFCE7' },
  medium: { label: 'Medium', color: '#6366F1', bg: '#EEF2FF' },
  high: { label: 'High', color: '#EA580C', bg: '#FFF7ED' },
  urgent: { label: 'Urgent', color: '#DC2626', bg: '#FEF2F2' },
};

const STEPS: { key: MaintenanceStatus; label: string; icon: string; color: string }[] = [
  { key: 'pending',     label: 'Pending',     icon: 'time-outline',             color: '#D97706' },
  { key: 'assigned',   label: 'Assigned',    icon: 'person-outline',           color: '#7C3AED' },
  { key: 'in_progress',label: 'In Progress', icon: 'reload-outline',           color: '#2563EB' },
  { key: 'completed',  label: 'Completed',   icon: 'checkmark-circle-outline', color: '#16A34A' },
];

function stepIndex(s: MaintenanceStatus): number {
  const i = STEPS.findIndex(x => x.key === s);
  return i === -1 ? 0 : i;
}

export default function RequestDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RequestsStackParamList, 'RequestDetail'>>();
  const insets = useSafeAreaInsets();
  const requestId = route.params.requestId;

  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [replyText, setReplyText] = useState('');
  const [status, setStatus] = useState<MaintenanceStatus>('pending');
  const [updating, setUpdating] = useState(false);

  // Employee picker modal
  const [showPicker, setShowPicker] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await maintenanceApi.get(requestId);
      const m = res?.data?.maintenances ?? res?.data?.maintenance;
      if (m) {
        setItem(m);
        setStatus(m.status as MaintenanceStatus);
      }
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSendReply = () => {
    if (!replyText.trim()) return;
    setReplies(prev => [
      ...prev,
      { id: String(Date.now()), from: 'owner', text: replyText.trim(), time: 'Just now' },
    ]);
    setReplyText('');
  };

  // Open employee picker to assign
  const openAssignPicker = async () => {
    setShowPicker(true);
    if (employees.length === 0) {
      setLoadingEmps(true);
      try {
        const res = await usersApi.list();
        const list = res?.data?.users ?? [];
        setEmployees(list);
      } catch {
        setEmployees([]);
      } finally {
        setLoadingEmps(false);
      }
    }
  };

  const handleAssign = async (emp: any) => {
    setShowPicker(false);
    setUpdating(true);
    try {
      await maintenanceApi.assign(requestId, emp.id);
      setStatus('assigned');
      setItem((prev: any) => ({ ...prev, assignedUser: emp, status: 'assigned' }));
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to assign.');
    } finally {
      setUpdating(false);
    }
  };

  const handleAdvance = () => {
    const cur = stepIndex(status);
    const next = STEPS[cur + 1];
    if (!next) return;

    if (status === 'pending') {
      // Need employee selection
      openAssignPicker();
      return;
    }

    Alert.alert('Update Status', `Move to "${next.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setUpdating(true);
          try {
            if (next.key === 'in_progress') await maintenanceApi.start(requestId);
            else if (next.key === 'completed') await maintenanceApi.complete(requestId);
            setStatus(next.key);
            setItem((prev: any) => ({ ...prev, status: next.key }));
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Failed to update status.');
          } finally {
            setUpdating(false);
          }
        },
      },
    ]);
  };

  const handleCancel = () => {
    Alert.alert('Cancel Request', 'Are you sure you want to cancel this request?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          setUpdating(true);
          try {
            await maintenanceApi.cancel(requestId);
            setStatus('cancelled');
            setItem((prev: any) => ({ ...prev, status: 'cancelled' }));
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Failed to cancel.');
          } finally {
            setUpdating(false);
          }
        },
      },
    ]);
  };

  const curStep = stepIndex(status);
  const nextStep = STEPS[curStep + 1];
  const isTerminal = status === 'completed' || status === 'cancelled';
  const priorityMeta = PRIORITY_META[item?.priority ?? 'medium'] ?? PRIORITY_META.medium;
  const isUrgent = item?.priority === 'urgent' || item?.priority === 'high';

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={[]}>
        <View style={[s.header, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Icon name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Request Detail</Text>
          <View style={{ width: 36 }} />
        </View>
        <ActivityIndicator color="#A5B4FC" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={s.container} edges={[]}>
        <View style={[s.header, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Icon name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { flex: 1 }]}>Request not found</Text>
          <View style={{ width: 36 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={[]}>
      {/* ── Employee Picker Modal ── */}
      <Modal
        visible={showPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select Employee</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)} style={s.modalClose}>
                <Icon name="close" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>
            {loadingEmps ? (
              <ActivityIndicator color="#6366F1" style={{ marginVertical: 40 }} />
            ) : employees.length === 0 ? (
              <View style={s.emptyPicker}>
                <Icon name="person-outline" size={32} color="#C7D2FE" />
                <Text style={s.emptyPickerText}>No employees found</Text>
              </View>
            ) : (
              <FlatList
                data={employees}
                keyExtractor={e => String(e.id)}
                style={{ maxHeight: 360 }}
                ItemSeparatorComponent={() => <View style={s.pickerSep} />}
                renderItem={({ item: emp }) => (
                  <TouchableOpacity
                    style={s.pickerRow}
                    onPress={() => handleAssign(emp)}
                    activeOpacity={0.7}
                  >
                    <View style={s.pickerAvatar}>
                      <Icon name="person" size={16} color="#6366F1" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.pickerName}>{emp.username}</Text>
                      {emp.role?.name && (
                        <Text style={s.pickerRole}>{emp.role.name}</Text>
                      )}
                    </View>
                    <Icon name="chevron-forward" size={16} color="#D1D5DB" />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── Dark hero header ── */}
      <View style={[s.hero, { paddingTop: insets.top + 8 }]}>
        {/* Glow decorations */}
        <View style={s.glow1} />
        <View style={s.glow2} />

        <View style={s.heroTop}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Icon name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.heroUnit} numberOfLines={1}>
              Unit {item.unit?.unitCode ?? `#${item.unitId}`}
            </Text>
            <Text style={s.heroType}>
              {item.type ? item.type.charAt(0).toUpperCase() + item.type.slice(1) : ''}
              {' · '}Request #{item.id}
            </Text>
          </View>
          <TouchableOpacity
            style={s.notifBtn}
            activeOpacity={0.8}
            onPress={() =>
              Alert.alert('Send Notification', 'Send a status update to tenant?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Send',
                  onPress: () => Alert.alert('Sent', `Notification sent for request #${requestId}.`),
                },
              ])
            }
          >
            <Icon name="notifications-outline" size={18} color="#A5B4FC" />
          </TouchableOpacity>
        </View>

        {/* Status + priority chips */}
        <View style={s.heroChips}>
          {status === 'cancelled' ? (
            <View style={[s.chip, { backgroundColor: 'rgba(220,38,38,0.2)' }]}>
              <Icon name="close-circle-outline" size={12} color="#FCA5A5" />
              <Text style={[s.chipText, { color: '#FCA5A5' }]}>Cancelled</Text>
            </View>
          ) : (
            <View style={[s.chip, { backgroundColor: 'rgba(165,180,252,0.2)' }]}>
              <Icon name={STEPS[curStep]?.icon ?? 'time-outline'} size={12} color="#A5B4FC" />
              <Text style={[s.chipText, { color: '#A5B4FC' }]}>{STEPS[curStep]?.label ?? status}</Text>
            </View>
          )}
          <View style={[s.chip, { backgroundColor: isUrgent ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.12)' }]}>
            <Icon name="flag" size={12} color={isUrgent ? '#FCA5A5' : 'rgba(255,255,255,0.6)'} />
            <Text style={[s.chipText, { color: isUrgent ? '#FCA5A5' : 'rgba(255,255,255,0.6)' }]}>
              {priorityMeta.label} Priority
            </Text>
          </View>
        </View>

        {/* Description */}
        <Text style={s.heroDesc} numberOfLines={3}>{item.description}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Progress Stepper ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Progress</Text>

            <View style={s.stepperRow}>
              {STEPS.map((step, idx) => {
                const done = status !== 'cancelled' && idx <= curStep;
                const active = idx === curStep && status !== 'cancelled';
                return (
                  <React.Fragment key={step.key}>
                    <View
                      style={[
                        s.stepDot,
                        done && { backgroundColor: step.color, borderColor: step.color },
                        active && { shadowColor: step.color, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 },
                      ]}
                    >
                      {done ? (
                        <Icon
                          name={active ? step.icon : 'checkmark'}
                          size={13}
                          color="#fff"
                        />
                      ) : (
                        <View style={s.stepDotInner} />
                      )}
                    </View>
                    {idx < STEPS.length - 1 && (
                      <View
                        style={[
                          s.stepLine,
                          status !== 'cancelled' && idx < curStep && {
                            backgroundColor: STEPS[idx + 1].color,
                          },
                        ]}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </View>

            <View style={s.stepLabels}>
              {STEPS.map((step, idx) => (
                <Text
                  key={step.key}
                  style={[
                    s.stepLabel,
                    status !== 'cancelled' && idx === curStep && { color: step.color, fontWeight: '700' },
                  ]}
                >
                  {step.label}
                </Text>
              ))}
            </View>

            {/* Action buttons */}
            {!isTerminal && (
              <View style={s.actionRow}>
                {nextStep && (
                  <TouchableOpacity
                    style={[s.advanceBtn, { backgroundColor: nextStep.color }]}
                    onPress={handleAdvance}
                    activeOpacity={0.85}
                    disabled={updating}
                  >
                    {updating ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Icon name={nextStep.icon} size={15} color="#fff" />
                        <Text style={s.advanceBtnText}>
                          {status === 'pending' ? 'Assign Employee' : `Move to ${nextStep.label}`}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={s.cancelBtn}
                  onPress={handleCancel}
                  activeOpacity={0.85}
                  disabled={updating}
                >
                  <Icon name="close-circle-outline" size={15} color="#DC2626" />
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {status === 'cancelled' && (
              <View style={s.cancelledBanner}>
                <Icon name="close-circle" size={16} color="#DC2626" />
                <Text style={s.cancelledBannerText}>This request has been cancelled</Text>
              </View>
            )}
            {status === 'completed' && (
              <View style={s.completedBanner}>
                <Icon name="checkmark-circle" size={16} color="#16A34A" />
                <Text style={s.completedBannerText}>Request completed</Text>
              </View>
            )}
          </View>

          {/* ── Details ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Details</Text>
            <View style={s.detailGrid}>
              <View style={s.detailItem}>
                <View style={[s.detailIcon, { backgroundColor: '#EEF2FF' }]}>
                  <Icon name="home-outline" size={14} color="#6366F1" />
                </View>
                <View>
                  <Text style={s.detailLabel}>Unit</Text>
                  <Text style={s.detailValue}>
                    {item.unit ? `${item.unit.unitCode} · Floor ${item.unit.floorNumber}` : `#${item.unitId}`}
                  </Text>
                </View>
              </View>

              {item.unit?.roomType && (
                <View style={s.detailItem}>
                  <View style={[s.detailIcon, { backgroundColor: '#F0FDF4' }]}>
                    <Icon name="cube-outline" size={14} color="#16A34A" />
                  </View>
                  <View>
                    <Text style={s.detailLabel}>Room Type</Text>
                    <Text style={s.detailValue}>{item.unit.roomType}</Text>
                  </View>
                </View>
              )}

              <View style={s.detailItem}>
                <View style={[s.detailIcon, { backgroundColor: '#FFF7ED' }]}>
                  <Icon name="construct-outline" size={14} color="#EA580C" />
                </View>
                <View>
                  <Text style={s.detailLabel}>Category</Text>
                  <Text style={s.detailValue}>{item.type}</Text>
                </View>
              </View>

              <View style={s.detailItem}>
                <View style={[s.detailIcon, { backgroundColor: '#F3F4F6' }]}>
                  <Icon name="time-outline" size={14} color="#6B7280" />
                </View>
                <View>
                  <Text style={s.detailLabel}>Submitted</Text>
                  <Text style={s.detailValue}>{fmtDate(item.createdAt)}</Text>
                </View>
              </View>

              {item.assignedUser && (
                <View style={s.detailItem}>
                  <View style={[s.detailIcon, { backgroundColor: '#EDE9FE' }]}>
                    <Icon name="person-outline" size={14} color="#7C3AED" />
                  </View>
                  <View>
                    <Text style={s.detailLabel}>Assigned To</Text>
                    <Text style={s.detailValue}>{item.assignedUser.username}</Text>
                  </View>
                </View>
              )}

              {item.cost && parseFloat(item.cost) > 0 && (
                <View style={s.detailItem}>
                  <View style={[s.detailIcon, { backgroundColor: '#FEF9C3' }]}>
                    <Icon name="cash-outline" size={14} color="#D97706" />
                  </View>
                  <View>
                    <Text style={s.detailLabel}>Cost {item.isBillable && '· Billable'}</Text>
                    <Text style={s.detailValue}>${item.cost}</Text>
                  </View>
                </View>
              )}

              {item.note && (
                <View style={s.detailItem}>
                  <View style={[s.detailIcon, { backgroundColor: '#F0FDF4' }]}>
                    <Icon name="document-text-outline" size={14} color="#16A34A" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.detailLabel}>Note</Text>
                    <Text style={s.detailValue}>{item.note}</Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* ── Messages ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Messages</Text>
            {replies.length === 0 ? (
              <View style={s.emptyThread}>
                <View style={s.emptyThreadIcon}>
                  <Icon name="chatbubble-ellipses-outline" size={26} color="#C7D2FE" />
                </View>
                <Text style={s.emptyThreadText}>No messages yet</Text>
                <Text style={s.emptyThreadSub}>Reply below to start the conversation.</Text>
              </View>
            ) : (
              <View style={s.thread}>
                {replies.map(reply => {
                  const isOwner = reply.from === 'owner';
                  return (
                    <View key={reply.id} style={[s.bubble, isOwner ? s.bubbleOwner : s.bubbleTenant]}>
                      {!isOwner && (
                        <View style={s.bubbleAvatar}>
                          <Icon name="person" size={12} color="#6B7280" />
                        </View>
                      )}
                      <View style={[s.bubbleBody, isOwner ? s.bubbleBodyOwner : s.bubbleBodyTenant]}>
                        <Text style={[s.bubbleText, isOwner && s.bubbleTextOwner]}>{reply.text}</Text>
                        <Text style={[s.bubbleTime, isOwner && s.bubbleTimeOwner]}>{reply.time}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>

        {/* ── Reply input ── */}
        <View style={[s.inputBar, { paddingBottom: insets.bottom + 12 }]}>
          <TextInput
            style={s.input}
            placeholder="Reply to tenant…"
            placeholderTextColor="#9CA3AF"
            value={replyText}
            onChangeText={setReplyText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[s.sendBtn, !replyText.trim() && s.sendBtnDisabled]}
            onPress={handleSendReply}
            activeOpacity={0.8}
            disabled={!replyText.trim()}
          >
            <Icon name="send" size={17} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 14 },

  // Hero
  hero: {
    backgroundColor: 'rgba(49,46,129,0.95)',
    paddingHorizontal: 16,
    paddingBottom: 22,
    overflow: 'hidden',
  },
  glow1: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(139,92,246,0.25)',
    top: -60,
    right: -60,
  },
  glow2: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(99,102,241,0.2)',
    bottom: -40,
    left: -40,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroUnit: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  heroType: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '500', marginTop: 2, textTransform: 'capitalize' },
  notifBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroChips: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  chipText: { fontSize: 11, fontWeight: '700' },
  heroDesc: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 22,
    letterSpacing: -0.2,
  },

  // Header title (loading/error states)
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    gap: 14,
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#111827', letterSpacing: -0.2 },

  // Stepper
  stepperRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D1D5DB' },
  stepLine: { flex: 1, height: 2, backgroundColor: '#E5E7EB' },
  stepLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  stepLabel: { fontSize: 9, fontWeight: '600', color: '#9CA3AF', textAlign: 'center', flex: 1 },

  // Action row
  actionRow: { flexDirection: 'row', gap: 10 },
  advanceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    borderRadius: 14,
  },
  advanceBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
  },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },

  cancelledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
  },
  cancelledBannerText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
  },
  completedBannerText: { fontSize: 13, fontWeight: '700', color: '#16A34A' },

  // Details grid
  detailGrid: { gap: 14 },
  detailItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  detailIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  detailLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '500', marginBottom: 2 },
  detailValue: { fontSize: 13, fontWeight: '700', color: '#111827' },

  // Messages
  emptyThread: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  emptyThreadIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyThreadText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  emptyThreadSub: { fontSize: 12, color: '#9CA3AF', textAlign: 'center' },
  thread: { gap: 10 },
  bubble: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubbleOwner: { justifyContent: 'flex-end' },
  bubbleTenant: { justifyContent: 'flex-start' },
  bubbleAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginBottom: 4,
  },
  bubbleBody: { maxWidth: '75%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleBodyOwner: { backgroundColor: '#6366F1', borderBottomRightRadius: 4 },
  bubbleBodyTenant: { backgroundColor: '#F3F4F6', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: '#374151', lineHeight: 20 },
  bubbleTextOwner: { color: '#FFFFFF' },
  bubbleTime: { fontSize: 10, color: '#9CA3AF', marginTop: 4 },
  bubbleTimeOwner: { color: 'rgba(255,255,255,0.6)', textAlign: 'right' },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  input: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    maxHeight: 100,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: { backgroundColor: '#C7D2FE' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 24,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  pickerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  pickerRole: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  pickerSep: { height: StyleSheet.hairlineWidth, backgroundColor: '#F3F4F6', marginLeft: 74 },
  emptyPicker: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyPickerText: { fontSize: 14, color: '#9CA3AF', fontWeight: '600' },
});
