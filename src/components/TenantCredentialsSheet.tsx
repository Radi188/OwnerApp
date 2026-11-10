import React from 'react';
import { Image, Share, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { Sheet } from './Sheet';
import { Button } from './ui';
import type { TenantCredentials } from '../services/types';
import { colors, radius } from '../theme';

/**
 * Shows a tenant's app login right after it is created / reset.
 * The password is returned only once by the API, so this must be dismissed explicitly.
 */
export default function TenantCredentialsSheet({
  visible, name, credentials, onDone, doneLabel,
}: {
  visible: boolean;
  name?: string;
  credentials: TenantCredentials | null;
  onDone: () => void;
  doneLabel?: string;
}) {
  const { t } = useTranslation();
  if (!credentials) return null;

  const share = () => Share.share({
    message: t('credentials.shareMsg', { name: name ?? '', username: credentials.username, password: credentials.password }),
  });

  return (
    <Sheet
      visible={visible}
      onClose={onDone}
      title={t('credentials.title')}
      footer={
        <View style={{ gap: 10 }}>
          <Button title={t('credentials.share')} icon="share-social-outline" variant="secondary" onPress={share} />
          <Button title={doneLabel ?? t('common.done')} onPress={onDone} />
        </View>
      }
    >
      <Text style={styles.lead}>{t('credentials.lead', { name: name ?? '' })}</Text>

      {credentials.qrDataURL ? (
        <View style={styles.qrWrap}>
          <Image source={{ uri: credentials.qrDataURL }} style={styles.qr} resizeMode="contain" />
        </View>
      ) : null}

      <View style={styles.box}>
        <Row label={t('credentials.username')} value={credentials.username} />
        <View style={styles.sep} />
        <Row label={t('credentials.password')} value={credentials.password} mono />
      </View>

      <View style={styles.warn}>
        <Icon name="warning-outline" size={16} color={colors.warning} />
        <Text style={styles.warnText}>{t('credentials.warning')}</Text>
      </View>
    </Sheet>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, mono && styles.mono]} selectable>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 14, color: colors.textSecondary, marginBottom: 14, lineHeight: 20 },
  qrWrap: { alignItems: 'center', padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.divider, marginBottom: 14 },
  qr: { width: 180, height: 180 },
  box: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.divider, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  sep: { height: 1, backgroundColor: colors.divider },
  label: { fontSize: 13, color: colors.textSecondary },
  value: { fontSize: 16, fontWeight: '700', color: colors.ink, flexShrink: 1, textAlign: 'right' },
  mono: { letterSpacing: 1 },
  warn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, padding: 12,
    borderRadius: radius.md, backgroundColor: colors.warningSoft,
  },
  warnText: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.ink },
});
