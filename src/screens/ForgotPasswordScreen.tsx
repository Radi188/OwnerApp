import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput as RNTextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Text, TextInput } from '../components/Text';
import { Input } from '../components/form';
import { Button, Screen } from '../components/ui';
import { ApiError, authApi } from '../services/api';
import { colors, radius, spacing } from '../theme';
import { errMsg } from '../utils/format';

type Step = 'identify' | 'otp' | 'reset' | 'done';
const OTP_LEN = 6;
const COOLDOWN = 60;

/** Forgot password: username → 6-digit OTP → new password (FRONTEND_GUIDE §3). */
export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const [step, setStep] = useState<Step>('identify');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const otpRef = useRef<RNTextInput>(null);

  // Resend countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try { await fn(); } catch (e) {
      if (e instanceof ApiError && e.status === 429) setCooldown(COOLDOWN);
      setError(errMsg(e));
    } finally { setBusy(false); }
  };

  const sendCode = () => run(async () => {
    await authApi.forgotPassword(identifier.trim());
    setCooldown(COOLDOWN);
    setOtp('');
    setStep('otp');
    setTimeout(() => otpRef.current?.focus(), 300);
  });

  const verify = () => run(async () => {
    const token = await authApi.verifyOtp(identifier.trim(), otp);
    if (!token) throw new Error(t('forgot.invalidCode'));
    setResetToken(token);
    setStep('reset');
  });

  const reset = () => {
    if (pw.length < 6) { setError(t('forgot.tooShort')); return; }
    if (pw !== pw2) { setError(t('forgot.mismatch')); return; }
    run(async () => {
      await authApi.resetPassword(identifier.trim(), resetToken, pw, pw2);
      setStep('done');
    });
  };

  // ── Footer per step ────────────────────────────────────────────────────────
  const footer = step === 'identify'
    ? <Button title={t('forgot.sendCode')} onPress={sendCode} loading={busy} disabled={!identifier.trim()} style={{ flex: 1 }} />
    : step === 'otp'
      ? <Button title={t('forgot.verify')} onPress={verify} loading={busy} disabled={otp.length !== OTP_LEN} style={{ flex: 1 }} />
      : step === 'reset'
        ? <Button title={t('forgot.save')} onPress={reset} loading={busy} disabled={!pw || !pw2} style={{ flex: 1 }} />
        : <Button title={t('forgot.backToLogin')} onPress={() => nav.goBack()} style={{ flex: 1 }} />;

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => (step === 'otp' ? setStep('identify') : step === 'reset' ? setStep('otp') : nav.goBack())} hitSlop={6}>
        <Icon name="chevron-back" size={20} color={colors.ink} />
      </TouchableOpacity>
    </View>
  );

  return (
    <Screen header={header} footer={footer} contentStyle={{ paddingTop: spacing.lg }}>
      <View style={styles.hero}>
        <View style={[styles.heroIcon, step === 'done' && { backgroundColor: colors.success }]}>
          <Icon name={step === 'done' ? 'checkmark' : step === 'reset' ? 'key-outline' : step === 'otp' ? 'chatbubble-ellipses-outline' : 'lock-open-outline'} size={28} color={step === 'done' ? colors.white : colors.primary} />
        </View>
        <Text style={styles.title}>{t(`forgot.${step}Title`)}</Text>
        <Text style={styles.text}>{t(`forgot.${step}Text`, { identifier: identifier.trim() })}</Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Icon name="alert-circle" size={16} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {step === 'identify' ? (
        <Input
          label={t('login.email')}
          icon="person-outline"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          onSubmitEditing={() => identifier.trim() && sendCode()}
        />
      ) : null}

      {step === 'otp' ? (
        <>
          {/* 6 boxes backed by one hidden input (paste & SMS autofill friendly) */}
          <Pressable style={styles.otpRow} onPress={() => otpRef.current?.focus()}>
            {Array.from({ length: OTP_LEN }).map((_, i) => {
              const ch = otp[i];
              const active = i === Math.min(otp.length, OTP_LEN - 1);
              return (
                <View key={i} style={[styles.otpBox, ch ? styles.otpFilled : null, active && styles.otpActive]}>
                  <Text style={styles.otpChar}>{ch ?? ''}</Text>
                </View>
              );
            })}
          </Pressable>
          <TextInput
            ref={otpRef}
            value={otp}
            onChangeText={v => { setOtp(v.replace(/\D/g, '').slice(0, OTP_LEN)); setError(undefined); }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={OTP_LEN}
            style={styles.hiddenInput}
            autoFocus
          />
          <TouchableOpacity onPress={sendCode} disabled={cooldown > 0 || busy} style={styles.resend} hitSlop={8}>
            <Text style={[styles.resendText, cooldown > 0 && { color: colors.muted }]}>
              {cooldown > 0 ? t('forgot.resendIn', { s: cooldown }) : t('forgot.resend')}
            </Text>
          </TouchableOpacity>
        </>
      ) : null}

      {step === 'reset' ? (
        <>
          <Input label={t('forgot.newPassword')} secureTextEntry autoCapitalize="none" value={pw} onChangeText={setPw} hint={t('forgot.tooShort')} />
          <Input label={t('forgot.confirmPassword')} secureTextEntry autoCapitalize="none" value={pw2} onChangeText={setPw2} returnKeyType="done" onSubmitEditing={reset} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center',
  },
  hero: { alignItems: 'center', marginBottom: spacing.xl, paddingHorizontal: spacing.lg },
  heroIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, marginTop: 16, textAlign: 'center' },
  text: { fontSize: 14, color: colors.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.dangerSoft, marginBottom: 14 },
  errorText: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.danger, lineHeight: 19 },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  otpBox: {
    width: 46, height: 56, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  otpFilled: { borderColor: colors.primaryTint },
  otpActive: { borderColor: colors.primary },
  otpChar: { fontSize: 22, fontWeight: '700', color: colors.ink },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  resend: { alignSelf: 'center', marginTop: 18 },
  resendText: { fontSize: 14, fontWeight: '600', color: colors.primary },
});
