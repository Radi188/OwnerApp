import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Text } from '../components/Text';
import { Button, Header, LoadingView, Screen } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { telegramApi } from '../services/api';
import { colors, radius, spacing } from '../theme';
import { errMsg } from '../utils/format';

const TELEGRAM_BLUE = '#229ED9';

/**
 * Link this account to Telegram (FRONTEND_GUIDE §18): generate a deep link, open Telegram,
 * then poll /telegram/status every 3 s until linked (stop after `expiresIn`).
 */
export default function TelegramScreen() {
  const { t } = useTranslation();
  const status = useApi(() => telegramApi.status(), []);
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadline = useRef(0);

  const stopPolling = () => {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
    setWaiting(false);
  };
  useEffect(() => stopPolling, []);

  const connect = async () => {
    setBusy(true);
    try {
      const link: any = await telegramApi.generateLink();
      if (!link?.deepLink) throw new Error(t('telegram.noLink'));
      await Linking.openURL(link.deepLink);
      deadline.current = Date.now() + (Number(link.expiresIn) || 300) * 1000;
      setWaiting(true);
      poll.current = setInterval(async () => {
        if (Date.now() > deadline.current) { stopPolling(); Alert.alert(t('telegram.expired')); return; }
        try {
          const s: any = await telegramApi.status();
          if (s?.isLinked) { stopPolling(); status.setData(s); }
        } catch { /* keep polling */ }
      }, 3000);
    } catch (e) {
      Alert.alert(t('common.error'), errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const unlink = () => Alert.alert(t('telegram.unlinkTitle'), t('telegram.unlinkMsg'), [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('telegram.unlink'), style: 'destructive',
      onPress: async () => {
        try { await telegramApi.unlink(); await status.reload(); } catch (e) { Alert.alert(t('common.error'), errMsg(e)); }
      },
    },
  ]);

  const s: any = status.data;
  const linked = !!s?.isLinked;
  const who = [s?.firstName, s?.lastName].filter(Boolean).join(' ') || (s?.telegramUsername ? `@${s.telegramUsername}` : '');

  return (
    <Screen
      header={<Header title="Telegram" />}
      footer={status.loading ? undefined : linked ? (
        <Button title={t('telegram.unlink')} variant="danger" icon="unlink-outline" onPress={unlink} style={{ flex: 1 }} />
      ) : (
        <Button title={waiting ? t('telegram.openAgain') : t('telegram.connect')} icon="paper-plane-outline" onPress={connect} loading={busy} style={{ flex: 1 }} />
      )}
    >
      {status.loading ? <LoadingView /> : (
        <>
          <View style={styles.hero}>
            <View style={[styles.logo, { backgroundColor: linked ? colors.success : TELEGRAM_BLUE }]}>
              <Icon name={linked ? 'checkmark' : 'paper-plane'} size={30} color={colors.white} />
            </View>
            <Text style={styles.title}>{linked ? t('telegram.linkedTitle') : t('telegram.title')}</Text>
            <Text style={styles.text}>{linked ? t('telegram.linkedText', { who }) : t('telegram.text')}</Text>
          </View>

          {waiting ? (
            <View style={styles.waiting}>
              <ActivityIndicator color={TELEGRAM_BLUE} />
              <Text style={styles.waitingText}>{t('telegram.waiting')}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            {(['invoices', 'payments', 'reminders'] as const).map((k, i) => (
              <View key={k} style={[styles.row, i > 0 && styles.sep]}>
                <Icon name={k === 'invoices' ? 'receipt-outline' : k === 'payments' ? 'cash-outline' : 'alarm-outline'} size={18} color={colors.textSecondary} />
                <Text style={styles.rowText}>{t(`telegram.${k}`)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  logo: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: 16, textAlign: 'center' },
  text: { fontSize: 14, color: colors.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.lg, backgroundColor: '#E8F6FC', marginBottom: spacing.lg },
  waitingText: { flex: 1, fontSize: 13, color: colors.ink },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.divider },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: spacing.lg },
  sep: { borderTopWidth: 1, borderTopColor: colors.divider },
  rowText: { flex: 1, fontSize: 14, color: colors.ink },
});
