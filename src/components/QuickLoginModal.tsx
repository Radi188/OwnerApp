import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text } from './Text';
import { Input } from './form';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import {
  getAvailableBiometricType,
  promptBiometrics,
  loadBiometricCredentials,
  BiometricType,
} from '../services/biometrics';

export default function QuickLoginModal() {
  const { user, propertyId, propertyName, quickLoginVisible, submitQuickLogin, cancelQuickLogin } = useAuth();
  const { t } = useTranslation();

  const [password,  setPassword]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [bioType,   setBioType]   = useState<BiometricType>(null);
  const [bioLoading, setBioLoading] = useState(false);

  const shakeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(80)).current;
  const fadeAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (quickLoginVisible) {
      setPassword('');
      setError('');
      slideAnim.setValue(80);
      fadeAnim.setValue(0);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, damping: 18, stiffness: 150, useNativeDriver: true }),
      ]).start();

      // Check biometric availability
      loadBiometricCredentials().then(creds => {
        if (creds) getAvailableBiometricType().then(setBioType);
      });
    }
  }, [quickLoginVisible]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 7,   duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -7,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const handleBiometric = async () => {
    setBioLoading(true);
    setError('');
    try {
      const creds = await loadBiometricCredentials();
      if (!creds) return;
      const passed = await promptBiometrics(`Sign in as ${user?.username}`);
      if (!passed) return;
      await submitQuickLogin(creds.password);
    } catch {
      setError(t('login.invalidCredentials'));
      shake();
    } finally {
      setBioLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!password.trim()) {
      setError(t('login.passwordRequired'));
      shake();
      return;
    }
    setLoading(true);
    setError('');
    try {
      await submitQuickLogin(password);
    } catch {
      setError(t('login.invalidCredentials'));
      shake();
    } finally {
      setLoading(false);
    }
  };

  if (!quickLoginVisible) return null;

  return (
    <Modal transparent animationType="none" visible={quickLoginVisible} statusBarTranslucent>
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[s.overlay, { opacity: fadeAnim }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => {}} />
        </Animated.View>

        <Animated.View
          style={[
            s.card,
            {
              transform: [
                { translateY: slideAnim },
                { translateX: shakeAnim },
              ],
            },
          ]}
        >
          {/* Lock icon */}
          <View style={s.iconWrap}>
            <View style={s.iconCircle}>
              <Icon name="lock-closed" size={26} color="#0F766E" />
            </View>
          </View>

          <Text style={s.title}>{t('quickLogin.title')}</Text>
          <Text style={s.subtitle}>{t('quickLogin.subtitle')}</Text>

          {/* Username row (read-only) */}
          <View style={s.userRow}>
            <View style={s.userAvatar}>
              <Text style={s.userAvatarText}>
                {user?.username?.substring(0, 2).toUpperCase() ?? '?'}
              </Text>
            </View>
            <Text style={s.username}>{user?.username}</Text>
            <Icon name="checkmark-circle" size={18} color="#10B981" />
          </View>

          {/* Property row (read-only, shown only when a property is set) */}
          {propertyId != null && (
            <View style={s.propRow}>
              <View style={s.propIcon}>
                <Icon name="business" size={16} color="#0F766E" />
              </View>
              <View style={s.propInfo}>
                <Text style={s.propLabel}>Property</Text>
                <Text style={s.propName} numberOfLines={1}>
                  {propertyName ?? `Property #${propertyId}`}
                </Text>
              </View>
              <Icon name="lock-closed" size={14} color="#D1D5DB" />
            </View>
          )}

          {/* Error */}
          {!!error && (
            <View style={s.errorBox}>
              <Icon name="alert-circle-outline" size={14} color="#DC2626" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {/* Password field (eye toggle built into Input) */}
          <Input
            label={t('login.password')}
            placeholder={t('login.passwordPlaceholder')}
            value={password}
            onChangeText={v => { setPassword(v); setError(''); }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          {/* Continue button */}
          <TouchableOpacity
            style={[s.continueBtn, loading && s.continueBtnDisabled]}
            activeOpacity={0.85}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Icon name="log-in-outline" size={17} color="#FFFFFF" />
                <Text style={s.continueBtnText}>{t('quickLogin.continue')}</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Biometric button */}
          {bioType && (
            <TouchableOpacity
              style={[s.bioBtn, bioLoading && s.bioBtnDisabled]}
              activeOpacity={0.75}
              onPress={handleBiometric}
              disabled={bioLoading || loading}
            >
              {bioLoading ? (
                <ActivityIndicator color="#0F766E" size="small" />
              ) : (
                <>
                  <Icon
                    name={bioType === 'FaceID' ? 'scan-outline' : 'finger-print-outline'}
                    size={20}
                    color="#0F766E"
                  />
                  <Text style={s.bioBtnText}>Use {bioType}</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Log out link */}
          <TouchableOpacity style={s.logoutBtn} activeOpacity={0.7} onPress={cancelQuickLogin}>
            <Text style={s.logoutText}>{t('quickLogin.logOut')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 12,
    paddingBottom: 44,
  },

  // Drag handle
  iconWrap: { alignItems: 'center', marginBottom: 20, marginTop: 8 },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F0FDFA',
    alignItems: 'center',
    justifyContent: 'center',
  },

  title:    { fontSize: 20, fontWeight: '800', color: '#0F172A', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginBottom: 24, lineHeight: 20 },

  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  propRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  propIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center',
  },
  propInfo:  { flex: 1 },
  propLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  propName:  { fontSize: 13, fontWeight: '600', color: '#374151' },
  userAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  username: { flex: 1, fontSize: 14, fontWeight: '600', color: '#374151' },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: { flex: 1, fontSize: 13, color: '#DC2626' },


  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F766E',
    borderRadius: 16,
    paddingVertical: 16,
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    marginBottom: 16,
  },
  continueBtnDisabled: { opacity: 0.65 },
  continueBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  bioBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 16,
    borderWidth: 1.5, borderColor: '#CCFBF1', backgroundColor: '#F5F3FF',
    marginBottom: 12,
  },
  bioBtnDisabled: { opacity: 0.6 },
  bioBtnText: { fontSize: 15, fontWeight: '600', color: '#0F766E' },

  logoutBtn:  { alignItems: 'center', paddingVertical: 8 },
  logoutText: { fontSize: 14, color: '#9CA3AF', fontWeight: '500' },
});
