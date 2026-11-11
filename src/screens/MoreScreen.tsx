import React from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useBadges } from '../context/BadgeContext';
import { authApi } from '../services/api';
import { Screen } from '../components/ui';
import { colors, radius, spacing } from '../theme';
import { initials } from '../utils/format';

type Item = {
  key: string; icon: string; label: string; route?: string; module?: string;
  badge?: number; value?: string; onPress?: () => void; danger?: boolean;
};

export default function MoreScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const auth = useAuth();
  const { user, propertyName, can } = auth;
  const { requestCount, notificationCount } = useBadges();
  // Tenant payments waiting for staff to verify (badge on the Payments row)

  const toggleLanguage = () => { i18n.changeLanguage(i18n.language === 'km' ? 'en' : 'km'); };

  const logout = () => {
    Alert.alert(t('profile.logOut'), t('profile.logOutConfirm'), [
      { text: t('profile.cancel'), style: 'cancel' },
      {
        text: t('profile.logOut'),
        style: 'destructive',
        onPress: async () => {
          try { await authApi.logout(); } catch { /* ignore */ }
          auth.logout(); // navigator switches to Login when unauthenticated
        },
      },
    ]);
  };

  const groups: { title: string; items: Item[] }[] = [
    {
      title: t('more.operations'),
      items: [
        { key: 'expenses', icon: 'wallet-outline', label: t('more.expenses'), route: 'Expenses', module: 'transaction' },
        { key: 'contracts', icon: 'document-text-outline', label: t('more.contracts'), route: 'Contracts', module: 'contract' },
        { key: 'maintenance', icon: 'construct-outline', label: t('more.maintenance'), route: 'Requests', module: 'maintenance', badge: requestCount },
        { key: 'announcements', icon: 'megaphone-outline', label: t('more.announcements'), route: 'Announcements', module: 'announcement' },
        { key: 'notifications', icon: 'notifications-outline', label: t('more.notifications'), route: 'Notifications', module: 'notification', badge: notificationCount },
      ],
    },
    {
      title: t('more.insights'),
      items: [
        { key: 'reports', icon: 'bar-chart-outline', label: t('more.reports'), route: 'Reports', module: 'report' },
      ],
    },
    {
      title: t('more.administration'),
      items: [
        { key: 'property', icon: 'business-outline', label: t('more.property'), route: 'PropertySettings', module: 'property' },
        { key: 'users', icon: 'people-outline', label: t('more.users'), route: 'Users', module: 'user' },
        { key: 'roles', icon: 'shield-checkmark-outline', label: t('more.roles'), route: 'Roles', module: 'role' },
      ],
    },
    {
      title: t('more.preferences'),
      items: [
        { key: 'language', icon: 'language-outline', label: t('more.language'), value: i18n.language === 'km' ? 'ខ្មែរ' : 'English', onPress: toggleLanguage },
        { key: 'telegram', icon: 'paper-plane-outline', label: 'Telegram', route: 'Telegram' },
        { key: 'settings', icon: 'settings-outline', label: t('more.settings'), route: 'Profile' },
        { key: 'logout', icon: 'log-out-outline', label: t('profile.logOut'), onPress: logout, danger: true },
      ],
    },
  ];

  return (
    <Screen tabBarSpace contentStyle={{ paddingTop: insets.top + 8 }}>
      <Text style={styles.title}>{t('more.title')}</Text>

      {/* Account */}
      <Pressable
        onPress={() => nav.navigate('Profile')}
        style={({ pressed }) => [styles.card, styles.profile, pressed && styles.pressed]}
      >
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials(user?.username)}</Text></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>{user?.username ?? '—'}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {user?.role?.name ?? t('home.owner')}{propertyName ? ` · ${propertyName}` : ''}
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

      {groups.map(g => {
        const items = g.items.filter(i => !i.module || can('view', i.module));
        if (!items.length) return null;
        return (
          <View key={g.title}>
            <Text style={styles.section}>{g.title}</Text>
            <View style={[styles.card, styles.list]}>
              {items.map((i, idx) => (
                <Pressable
                  key={i.key}
                  onPress={i.onPress ?? (() => i.route && nav.navigate(i.route))}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <View style={[styles.icon, i.danger && { backgroundColor: colors.dangerSoft }]}>
                    <Icon name={i.icon} size={18} color={i.danger ? colors.danger : colors.ink} />
                  </View>
                  <View style={[styles.rowInner, idx > 0 && styles.sep]}>
                    <Text style={[styles.label, i.danger && { color: colors.danger }]} numberOfLines={1}>{i.label}</Text>
                    {i.value ? <Text style={styles.value}>{i.value}</Text> : null}
                    {i.badge ? (
                      <View style={styles.badge}><Text style={styles.badgeText}>{i.badge > 99 ? '99+' : i.badge}</Text></View>
                    ) : null}
                    {i.danger ? null : (
                      <Icon name={i.key === 'language' ? 'swap-horizontal' : 'chevron-forward'} size={16} color={colors.muted} />
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}

      <Text style={styles.footer}>{t('profile.appFooter')}</Text>
    </Screen>
  );
}

const ICON = 34;

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.4, marginBottom: spacing.lg },

  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.divider },
  pressed: { backgroundColor: colors.surfaceAlt },

  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.lg },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontWeight: '700', fontSize: 16 },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },

  section: {
    fontSize: 12, fontWeight: '600', color: colors.muted, letterSpacing: 0.3,
    marginTop: spacing.xl, marginBottom: 8, paddingHorizontal: 4,
  },
  list: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.lg },
  icon: { width: ICON, height: ICON, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  // Divider starts after the icon, like iOS settings
  rowInner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, marginLeft: 12, paddingRight: spacing.lg },
  sep: { borderTopWidth: 1, borderTopColor: colors.divider },
  label: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.ink },
  value: { fontSize: 14, color: colors.textSecondary },
  badge: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },

  footer: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: spacing.xxl },
});
