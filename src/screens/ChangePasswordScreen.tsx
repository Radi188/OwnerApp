import React from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Icon from 'react-native-vector-icons/Ionicons';
import { Text } from '../components/Text';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { required, useForm } from '../hooks/useForm';
import { Button, Card, Header, Screen, TextField } from '../components/ui';
import { colors, radius, spacing } from '../theme';

/**
 * Change password. In `forced` mode (first login with a temporary password, `mustChangePassword`)
 * there is no way back; after saving we sign in again with the new password, because changing it
 * invalidates the current access token.
 */
export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const forced = !!useRoute<any>().params?.forced;
  const auth = useAuth();

  const f = useForm({ currentPassword: '', newPassword: '', confirmPassword: '' }, {
    currentPassword: required(t('changePassword.current')),
    newPassword: (v, all) => required(t('changePassword.new'))(v)
      ?? (String(v).length < 6 ? t('forgot.tooShort') : null)
      ?? (v === all.currentPassword ? t('changePassword.mustDiffer') : null),
    confirmPassword: (v, all) => (v !== all.newPassword ? t('forgot.mismatch') : null),
  });

  const save = f.submit(
    async v => {
      await authApi.changePassword(v.currentPassword, v.newPassword, v.confirmPassword);
      if (forced) {
        // Old token is now invalid — sign in again with the new password
        try {
          await auth.submitQuickLogin(v.newPassword);
        } catch {
          auth.logout();
          return;
        }
        if (auth.user) auth.updateUser({ ...auth.user, mustChangePassword: false });
      }
    },
    () => {
      if (!forced) {
        Alert.alert(t('changePassword.doneTitle'), t('changePassword.doneMsg'));
        nav.goBack();
      }
    },
  );

  return (
    <Screen
      header={<Header back={!forced} title={forced ? t('changePassword.forcedTitle') : t('changePassword.title')} />}
      footer={<Button title={t('changePassword.save')} onPress={save} loading={f.submitting} style={{ flex: 1 }} />}
    >
      {forced ? (
        <View style={styles.notice}>
          <Icon name="shield-checkmark-outline" size={18} color={colors.primary} />
          <Text style={styles.noticeText}>{t('changePassword.forcedMsg')}</Text>
        </View>
      ) : null}
      <Card>
        <TextField label={forced ? t('changePassword.temporary') : t('changePassword.current')} required secureTextEntry autoCapitalize="none" {...f.field('currentPassword')} />
        <TextField label={t('changePassword.new')} required secureTextEntry autoCapitalize="none" hint={t('forgot.tooShort')} {...f.field('newPassword')} />
        <TextField label={t('forgot.confirmPassword')} required secureTextEntry autoCapitalize="none" {...f.field('confirmPassword')} />
      </Card>
      {forced ? (
        <Button title={t('profile.logOut')} variant="ghost" onPress={() => auth.logout()} style={{ marginTop: spacing.lg }} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: radius.lg,
    backgroundColor: colors.primarySoft, marginBottom: spacing.lg,
  },
  noticeText: { flex: 1, fontSize: 13, color: colors.ink, lineHeight: 19 },
});
