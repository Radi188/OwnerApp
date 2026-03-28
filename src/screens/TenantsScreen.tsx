import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
  Clipboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { tenantsApi } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────
type Tenant = {
  id: number;
  name: string;
  phoneNumber: string;
  status: string;
  emergencyContact?: string;
  occupation?: string;
  user?: { id: number; username: string } | null;
};

const AVATAR_COLORS = ['#6366F1', '#0891B2', '#16A34A', '#CA8A04', '#DC2626', '#7C3AED'];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

const STATUS_TABS = ['All', 'Active', 'Inactive'];

type Credentials = { username: string; password: string };

// ─── Add Tenant Sheet ─────────────────────────────────────────────────────────
function AddTenantSheet({
  visible, onClose, onCreated,
}: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(500)).current;

  const [name, setName]               = useState('');
  const [phone, setPhone]             = useState('');
  const [emergency, setEmergency]     = useState('');
  const [occupation, setOccupation]   = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [errors, setErrors]           = useState<{ name?: string; phone?: string }>({});
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  useEffect(() => {
    if (visible) {
      setName(''); setPhone(''); setEmergency(''); setOccupation('');
      setErrors({}); setCredentials(null); setSubmitting(false);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 500, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible, slideAnim]);

  const validate = () => {
    const e: { name?: string; phone?: string } = {};
    if (!name.trim())  e.name  = t('tenants.nameRequired');
    if (!phone.trim()) e.phone = t('tenants.phoneRequired');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await tenantsApi.create({
        name: name.trim(),
        phoneNumber: phone.trim(),
        emergencyContact: emergency.trim() || undefined,
        occupation: occupation.trim() || undefined,
      });
      const creds = res?.data?.credentials;
      if (creds?.username && creds?.password) {
        setCredentials({ username: creds.username, password: creds.password });
      } else {
        onCreated();
        onClose();
      }
    } catch {
      Alert.alert(t('common.error'), t('tenants.createError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = () => { onCreated(); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={sheet.backdrop} onPress={credentials ? undefined : onClose} />
        <Animated.View style={[sheet.container, { transform: [{ translateY: slideAnim }], paddingBottom: insets.bottom + 16 }]}>
          <View style={sheet.handle} />

          {credentials ? (
            <>
              <View style={sheet.successHeader}>
                <View style={sheet.successIconWrap}>
                  <Icon name="checkmark-circle" size={36} color="#16A34A" />
                </View>
                <Text style={sheet.successTitle}>{t('tenants.createSuccess')}</Text>
                <Text style={sheet.successNote}>{t('tenants.credentialNote')}</Text>
              </View>
              <View style={sheet.credCard}>
                <View style={sheet.credRow}>
                  <Text style={sheet.credLabel}>{t('tenants.usernameLabel')}</Text>
                  <TouchableOpacity style={sheet.credValueWrap} onPress={() => Clipboard.setString(credentials.username)} activeOpacity={0.7}>
                    <Text style={sheet.credValue}>{credentials.username}</Text>
                    <Icon name="copy-outline" size={14} color="#6366F1" />
                  </TouchableOpacity>
                </View>
                <View style={sheet.credDivider} />
                <View style={sheet.credRow}>
                  <Text style={sheet.credLabel}>{t('tenants.passwordLabel')}</Text>
                  <TouchableOpacity style={sheet.credValueWrap} onPress={() => Clipboard.setString(credentials.password)} activeOpacity={0.7}>
                    <Text style={sheet.credValue}>{credentials.password}</Text>
                    <Icon name="copy-outline" size={14} color="#6366F1" />
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity style={sheet.submitBtn} onPress={handleDone} activeOpacity={0.8}>
                <Text style={sheet.submitText}>{t('tenants.done')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={sheet.titleRow}>
                <Text style={sheet.sheetTitle}>{t('tenants.addTenant')}</Text>
                <TouchableOpacity onPress={onClose} style={sheet.closeBtn} activeOpacity={0.7}>
                  <Icon name="close" size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={sheet.label}>{t('tenants.nameLabel')} <Text style={sheet.required}>*</Text></Text>
                <TextInput
                  style={[sheet.input, !!errors.name && sheet.inputError]}
                  placeholder={t('tenants.namePlaceholder')}
                  placeholderTextColor="#9CA3AF"
                  value={name}
                  onChangeText={v => { setName(v); if (errors.name) setErrors(e => ({ ...e, name: undefined })); }}
                  autoCapitalize="words"
                />
                {!!errors.name && <Text style={sheet.errorText}>{errors.name}</Text>}

                <Text style={sheet.label}>{t('tenants.phoneLabel')} <Text style={sheet.required}>*</Text></Text>
                <TextInput
                  style={[sheet.input, !!errors.phone && sheet.inputError]}
                  placeholder={t('tenants.phonePlaceholder')}
                  placeholderTextColor="#9CA3AF"
                  value={phone}
                  onChangeText={v => { setPhone(v); if (errors.phone) setErrors(e => ({ ...e, phone: undefined })); }}
                  keyboardType="phone-pad"
                />
                {!!errors.phone && <Text style={sheet.errorText}>{errors.phone}</Text>}

                <Text style={sheet.label}>{t('tenants.emergencyLabel')}</Text>
                <TextInput
                  style={sheet.input}
                  placeholder={t('tenants.emergencyPlaceholder')}
                  placeholderTextColor="#9CA3AF"
                  value={emergency}
                  onChangeText={setEmergency}
                  autoCapitalize="words"
                />

                <Text style={sheet.label}>{t('tenants.occupationLabel')}</Text>
                <TextInput
                  style={sheet.input}
                  placeholder={t('tenants.occupationPlaceholder')}
                  placeholderTextColor="#9CA3AF"
                  value={occupation}
                  onChangeText={setOccupation}
                  autoCapitalize="words"
                />
              </ScrollView>
              <TouchableOpacity
                style={[sheet.submitBtn, submitting && sheet.submitBtnDisabled]}
                onPress={handleSubmit}
                activeOpacity={0.8}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#FFFFFF" size="small" />
                  : <Text style={sheet.submitText}>{t('tenants.addTenant')}</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function TenantsScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [tenants, setTenants]       = useState<Tenant[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [activeTab, setActiveTab]   = useState('All');
  const [sheetVisible, setSheetVisible] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await tenantsApi.list();
      setTenants(res?.data?.tenants ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tenants.filter(t => {
      const matchSearch = !q
        || t.name.toLowerCase().includes(q)
        || (t.phoneNumber ?? '').toLowerCase().includes(q)
        || (t.occupation ?? '').toLowerCase().includes(q);
      const matchTab = activeTab === 'All' || t.status === activeTab;
      return matchSearch && matchTab;
    });
  }, [tenants, search, activeTab]);

  const activeCount   = tenants.filter(t => t.status === 'Active').length;
  const inactiveCount = tenants.filter(t => t.status === 'Inactive').length;

  const statusColor = (status: string) => {
    if (status === 'Active') return { bg: '#F0FDF4', text: '#16A34A' };
    return { bg: '#FEF2F2', text: '#DC2626' };
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={[]}>
        <View style={[s.header, { paddingTop: insets.top + 14 }]}>
          <View>
            <Text style={s.headerTitle}>Tenants</Text>
            <Text style={s.headerSubtitle}>Loading...</Text>
          </View>
        </View>
        <ActivityIndicator color="#6366F1" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={[]}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 14 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{t('tenants.title')}</Text>
          <Text style={s.headerSubtitle}>
            {tenants.length} total · {activeCount} active
          </Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => setSheetVisible(true)} activeOpacity={0.7}>
          <Icon name="add" size={22} color="#6366F1" />
        </TouchableOpacity>
      </View>

      {/* ── Search ── */}
      <View style={s.searchWrap}>
        <View style={s.searchBar}>
          <Icon name="search-outline" size={16} color="#9CA3AF" />
          <TextInput
            style={s.searchInput}
            placeholder="Search by name, phone, occupation..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}>
              <Icon name="close-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Status Tabs ── */}
      <View style={s.tabsRow}>
        {STATUS_TABS.map(tab => {
          const active = tab === activeTab;
          const count = tab === 'All' ? tenants.length : tab === 'Active' ? activeCount : inactiveCount;
          return (
            <TouchableOpacity
              key={tab}
              style={[s.tab, active && s.tabActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[s.tabText, active && s.tabTextActive]}>{tab}</Text>
              {count > 0 && (
                <View style={[s.tabBadge, active && s.tabBadgeActive]}>
                  <Text style={[s.tabBadgeText, active && s.tabBadgeTextActive]}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── List ── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#6366F1']} tintColor="#6366F1" />
        }
      >
        {filtered.length === 0 ? (
          <View style={s.emptyCard}>
            <View style={s.emptyIconWrap}>
              <Icon name="people-outline" size={30} color="#6366F1" />
            </View>
            <Text style={s.emptyTitle}>No tenants found</Text>
            <Text style={s.emptySubtitle}>
              {search ? 'Try a different search term' : 'Add your first tenant using the + button'}
            </Text>
          </View>
        ) : (
          filtered.map((tenant, i) => {
            const avatarColor = AVATAR_COLORS[i % AVATAR_COLORS.length];
            const sc = statusColor(tenant.status);
            return (
              <TouchableOpacity
                key={tenant.id}
                style={s.card}
                onPress={() => navigation.navigate('TenantDetail', { tenantId: tenant.id })}
                activeOpacity={0.75}
              >
                {/* Avatar + Info */}
                <View style={s.cardTop}>
                  <View style={[s.avatar, { backgroundColor: avatarColor }]}>
                    <Text style={s.avatarText}>{initials(tenant.name)}</Text>
                  </View>
                  <View style={s.info}>
                    <View style={s.nameRow}>
                      <Text style={s.name} numberOfLines={1}>{tenant.name}</Text>
                      <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                        <Text style={[s.statusText, { color: sc.text }]}>{tenant.status}</Text>
                      </View>
                    </View>
                    {tenant.phoneNumber ? (
                      <View style={s.metaRow}>
                        <Icon name="call-outline" size={12} color="#9CA3AF" />
                        <Text style={s.metaText}>{tenant.phoneNumber}</Text>
                      </View>
                    ) : null}
                    {tenant.occupation ? (
                      <View style={s.metaRow}>
                        <Icon name="briefcase-outline" size={12} color="#9CA3AF" />
                        <Text style={s.metaText}>{tenant.occupation}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Icon name="chevron-forward" size={16} color="#D1D5DB" style={{ flexShrink: 0 }} />
                </View>

                {/* Footer chips */}
                <View style={s.cardFooter}>
                  {tenant.user ? (
                    <View style={s.chip}>
                      <Icon name="person-circle-outline" size={12} color="#6366F1" />
                      <Text style={s.chipText}>@{tenant.user.username}</Text>
                    </View>
                  ) : (
                    <View style={[s.chip, { backgroundColor: '#FEF9C3' }]}>
                      <Icon name="alert-circle-outline" size={12} color="#CA8A04" />
                      <Text style={[s.chipText, { color: '#CA8A04' }]}>No account</Text>
                    </View>
                  )}
                  {tenant.emergencyContact ? (
                    <View style={s.chip}>
                      <Icon name="shield-checkmark-outline" size={12} color="#6366F1" />
                      <Text style={s.chipText}>Emergency: {tenant.emergencyContact}</Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <AddTenantSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onCreated={() => { setRefreshing(true); loadData(); }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },

  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 3,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  searchWrap: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F3F4F6', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0 },

  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, backgroundColor: '#F3F4F6',
  },
  tabActive: { backgroundColor: '#EEF2FF' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  tabTextActive: { color: '#6366F1' },
  tabBadge: {
    backgroundColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 1, minWidth: 20, alignItems: 'center',
  },
  tabBadgeActive: { backgroundColor: '#C7D2FE' },
  tabBadgeText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  tabBadgeTextActive: { color: '#4338CA' },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, gap: 10 },

  emptyCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 50, paddingHorizontal: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 18 },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 18,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  name: { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 },
  statusBadge: {
    borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3, flexShrink: 0,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  metaText: { fontSize: 12, color: '#6B7280' },

  cardFooter: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    marginTop: 12, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F3F4F6',
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EEF2FF', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  chipText: { fontSize: 11, fontWeight: '600', color: '#6366F1' },
});

const sheet = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  container: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, maxHeight: '90%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 20,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827', letterSpacing: -0.3 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  label:    { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  required: { color: '#EF4444' },
  input: {
    backgroundColor: '#F9FAFB', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#111827', marginBottom: 16,
  },
  inputError:  { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  errorText:   { fontSize: 12, color: '#EF4444', marginTop: -12, marginBottom: 14 },
  submitBtn: {
    backgroundColor: '#6366F1', borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { backgroundColor: '#A5B4FC' },
  submitText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  successHeader: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  successIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center',
  },
  successTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  successNote:  { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 18 },
  credCard: {
    backgroundColor: '#F9FAFB', borderRadius: 14,
    borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 20,
  },
  credRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  credDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB', marginHorizontal: 16 },
  credLabel:    { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  credValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  credValue:    { fontSize: 14, fontWeight: '700', color: '#111827' },
});
