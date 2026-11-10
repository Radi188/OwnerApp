import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { usersApi, authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { BackButton } from '../components/ui';

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

type SettingItem = {
  id: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  value?: string;
  toggle?: boolean;
  danger?: boolean;
};

type Section = { title: string; items: SettingItem[] };

export default function ProfileScreen() {
  const insets    = useSafeAreaInsets();
  const { t }     = useTranslation();
  const auth      = useAuth();
  const navigation = useNavigation<any>();
  const [, forceUpdate] = useState(0);

  const [meData, setMeData]         = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [pushAll, setPushAll]       = useState(true);
  const [pushRequests, setPushRequests] = useState(true);
  const [pushPayments, setPushPayments] = useState(true);
  const [biometric, setBiometric]   = useState(false);

  const currentLang = i18n.language;
  const langLabel   = currentLang === 'en' ? 'English 🇺🇸' : 'ភាសាខ្មែរ 🇰🇭';

  const loadMe = useCallback(async () => {
    try {
      const res = await usersApi.me();
      const user = res?.data?.user;
      if (user) {
        setMeData(user);
        auth.updateUser(user);
        // Sync notification preference
        if (user.settings?.notify !== undefined) {
          setPushAll(user.settings.notify);
        }
        if (user.isBiometrics !== undefined) {
          setBiometric(user.isBiometrics);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  const handleLanguageSwitch = () => {
    i18n.changeLanguage(currentLang === 'en' ? 'km' : 'en').then(() => forceUpdate(n => n + 1));
  };

  const handleLogout = () => {
    Alert.alert(t('profile.logOut'), t('profile.logOutConfirm'), [
      { text: t('profile.cancel'), style: 'cancel' },
      {
        text: t('profile.logOut'),
        style: 'destructive',
        onPress: async () => {
          try { await authApi.logout(); } catch {/* ignore */}
          auth.logout();
          // Navigator automatically switches to Login when isAuthenticated = false
        },
      },
    ]);
  };

  const displayUser = meData ?? auth.user;
  const username    = displayUser?.username ?? '—';
  const roleName    = displayUser?.role?.name ?? displayUser?.roleId;
  const userInitials = initials(username);

  const SECTIONS: Section[] = [
    {
      title: t('profile.account'),
      items: [
        { id: 'username', icon: 'person-outline', iconBg: '#F0FDFA', iconColor: '#0F766E', label: 'Username', value: username },
        { id: 'role',     icon: 'shield-outline', iconBg: '#F5F3FF', iconColor: '#7C3AED', label: 'Role',     value: roleName ? String(roleName) : '—' },
        { id: 'password', icon: 'key-outline',    iconBg: '#FFF7ED', iconColor: '#EA580C', label: t('profile.changePassword') },
      ],
    },
    {
      title: t('profile.pushNotifications'),
      items: [
        { id: 'push_all',      icon: 'notifications-outline', iconBg: '#F0FDFA', iconColor: '#0F766E', label: t('profile.allNotifications'), toggle: true },
        { id: 'push_requests', icon: 'construct-outline',     iconBg: '#FEF9C3', iconColor: '#CA8A04', label: t('profile.newRequests'),       toggle: true },
        { id: 'push_payments', icon: 'cash-outline',          iconBg: '#F0FDF4', iconColor: '#16A34A', label: t('profile.paymentUpdates'),    toggle: true },
      ],
    },
    {
      title: t('profile.security'),
      items: [
        { id: 'biometric', icon: 'finger-print-outline', iconBg: '#F5F3FF', iconColor: '#7C3AED', label: t('profile.biometricLogin'),  toggle: true },
        { id: 'language',  icon: 'language-outline',     iconBg: '#F0FDFA', iconColor: '#0F766E', label: t('profile.language'),         value: langLabel },
        { id: 'privacy',   icon: 'shield-outline',       iconBg: '#F0FDFA', iconColor: '#0F766E', label: t('profile.privacyPolicy') },
        { id: 'terms',     icon: 'document-outline',     iconBg: '#F3F4F6', iconColor: '#374151', label: t('profile.termsOfService') },
      ],
    },
    {
      title: '',
      items: [
        { id: 'logout', icon: 'log-out-outline', iconBg: '#FEF2F2', iconColor: '#DC2626', label: t('profile.logOut'), danger: true },
      ],
    },
  ];

  const toggleMap: Record<string, [boolean, (v: boolean) => void]> = {
    push_all:      [pushAll,      setPushAll],
    push_requests: [pushRequests, setPushRequests],
    push_payments: [pushPayments, setPushPayments],
    biometric:     [biometric,    setBiometric],
  };

  const handlePress = (id: string) => {
    if (id === 'logout') {
      handleLogout();
    } else if (id === 'language') {
      handleLanguageSwitch();
    } else if (id === 'password') {
      navigation.navigate('ChangePassword');
    }
  };

  return (
    <SafeAreaView style={s.container} edges={[]}>
      {/* Header */}
      <View style={[hdr.container, { paddingTop: insets.top + 14 }]}>
        <BackButton />
        <Text style={[hdr.title, { flex: 1 }]}>{t('profile.title')}</Text>
        <TouchableOpacity style={hdr.editBtn} activeOpacity={0.7} onPress={loadMe}>
          <Icon name="refresh-outline" size={20} color="#374151" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#0F766E" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar card */}
          <View style={s.avatarCard}>
            <View style={s.avatarCircle}>
              <Text style={s.avatarText}>{userInitials}</Text>
            </View>
            <Text style={s.name}>{username}</Text>
            {roleName && <Text style={s.email}>{roleName}</Text>}
            <View style={s.ownerPill}>
              <Icon name="person-outline" size={13} color="#0F766E" />
              <Text style={s.ownerPillText}>{t('profile.ownerLabel')}</Text>
            </View>
          </View>

          {/* Settings sections */}
          {SECTIONS.map((section, si) => (
            <View key={si} style={s.section}>
              {section.title ? <Text style={s.sectionTitle}>{section.title}</Text> : null}
              <View style={s.sectionCard}>
                {section.items.map((item, ii) => {
                  const toggleEntry = toggleMap[item.id];
                  const isLast = ii === section.items.length - 1;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[s.row, !isLast && s.rowBorder]}
                      activeOpacity={item.toggle ? 1 : 0.7}
                      onPress={item.toggle ? undefined : () => handlePress(item.id)}
                    >
                      <View style={[s.rowIcon, { backgroundColor: item.iconBg }]}>
                        <Icon name={item.icon} size={16} color={item.iconColor} />
                      </View>
                      <Text style={[s.rowLabel, item.danger && s.dangerLabel]}>{item.label}</Text>
                      <View style={s.rowRight}>
                        {item.toggle ? (
                          <Switch
                            value={toggleEntry?.[0]}
                            onValueChange={toggleEntry?.[1]}
                            trackColor={{ false: '#E5E7EB', true: '#5EEAD4' }}
                            thumbColor={toggleEntry?.[0] ? '#0F766E' : '#9CA3AF'}
                          />
                        ) : item.value ? (
                          <Text style={s.rowValue}>{item.value}</Text>
                        ) : !item.danger ? (
                          <Icon name="chevron-forward" size={16} color="#D1D5DB" />
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          <Text style={s.footer}>{t('profile.appFooter')}</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const hdr = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 4,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#0F172A', letterSpacing: -0.4 },
  editBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },

  avatarCard: {
    alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 20,
    paddingTop: 28, paddingBottom: 24, paddingHorizontal: 20, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  avatarCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#0F766E',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatarText: { fontSize: 26, fontWeight: '700', color: '#FFFFFF' },
  name: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  email: { fontSize: 13, color: '#9CA3AF', marginBottom: 14 },
  ownerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F0FDFA', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
  },
  ownerPillText: { fontSize: 13, color: '#0F766E', fontWeight: '600' },

  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingLeft: 4 },
  sectionCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6' },
  rowIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowLabel: { flex: 1, fontSize: 14, color: '#374151', fontWeight: '500' },
  dangerLabel: { color: '#DC2626' },
  rowRight: { marginLeft: 8 },
  rowValue: { fontSize: 13, color: '#9CA3AF', maxWidth: 140 },

  footer: { textAlign: 'center', fontSize: 12, color: '#D1D5DB', marginTop: 8 },
});
