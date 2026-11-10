import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Alert,
  Animated,
  StatusBar,
  Dimensions,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Text, TextInput } from '../components/Text';
import { FieldShell, Input } from '../components/form';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import AppLogo from '../components/AppLogo';
import {
  getAvailableBiometricType,
  promptBiometrics,
  loadBiometricCredentials,
  saveBiometricCredentials,
  isBiometricEnabled,
  BiometricType,
} from '../services/biometrics';

type PropertyItem = { id: number; name: string; address?: string };

const { height } = Dimensions.get('window');
const BANNER_H = height * 0.37;

// ─── Property Picker Sheet ─────────────────────────────────────────────────────
function PropertySheet({
  visible,
  properties,
  loading,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  properties: PropertyItem[];
  loading: boolean;
  selected: PropertyItem | null;
  onSelect: (p: PropertyItem) => void;
  onClose: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 12 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 500, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible, slideAnim]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={ps.backdrop} onPress={onClose} />
      <Animated.View style={[ps.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={ps.handle} />
        <View style={ps.header}>
          <Text style={ps.title}>Select Property</Text>
          <TouchableOpacity onPress={onClose} style={ps.closeBtn} activeOpacity={0.7}>
            <Icon name="close" size={18} color="#6B7280" />
          </TouchableOpacity>
        </View>
        <Text style={ps.subtitle}>Choose the property you want to manage</Text>

        {loading ? (
          <View style={ps.center}>
            <ActivityIndicator color="#0F766E" size="large" />
            <Text style={ps.loadingText}>Loading properties…</Text>
          </View>
        ) : properties.length === 0 ? (
          <View style={ps.center}>
            <Icon name="business-outline" size={40} color="#D1D5DB" />
            <Text style={ps.emptyText}>No properties found</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={ps.list}>
            {properties.map((p, idx) => {
              const isSelected = selected?.id === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    ps.row,
                    isSelected && ps.rowSelected,
                    idx === properties.length - 1 && ps.rowLast,
                  ]}
                  onPress={() => { onSelect(p); onClose(); }}
                  activeOpacity={0.75}
                >
                  <View style={[ps.rowIcon, isSelected && ps.rowIconSelected]}>
                    <Icon name="business" size={18} color={isSelected ? '#FFFFFF' : '#0F766E'} />
                  </View>
                  <View style={ps.rowInfo}>
                    <Text style={[ps.rowName, isSelected && ps.rowNameSelected]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {!!p.address && (
                      <Text style={ps.rowAddr} numberOfLines={1}>{p.address}</Text>
                    )}
                  </View>
                  {isSelected
                    ? <Icon name="checkmark-circle" size={22} color="#0F766E" />
                    : <View style={ps.radio} />
                  }
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </Animated.View>
    </Modal>
  );
}

// ─── Login Screen ──────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const { t }           = useTranslation();
  const [, forceUpdate] = useState(0);
  const auth            = useAuth();
  const currentLang     = i18n.language;

  const [username,      setUsername]      = useState('');
  const [password,      setPassword]      = useState('');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');

  const [properties,    setProperties]    = useState<PropertyItem[]>([]);
  const [selectedProp,  setSelectedProp]  = useState<PropertyItem | null>(null);
  const [propLoading,   setPropLoading]   = useState(false);
  const [sheetVisible,  setSheetVisible]  = useState(false);
  const lastLookupRef = useRef('');

  const [bioType,       setBioType]       = useState<BiometricType>(null);
  const [bioEnabled,    setBioEnabled]    = useState(false);
  const [bioLoading,    setBioLoading]    = useState(false);

  const slideAnim = useRef(new Animated.Value(60)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 550, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 550, useNativeDriver: true }),
    ]).start();

    // Check biometric availability and if user has enabled it
    Promise.all([getAvailableBiometricType(), isBiometricEnabled()]).then(([type, enabled]) => {
      setBioType(type);
      setBioEnabled(enabled && !!type);
    });
  }, []);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start();
  };

  // Called when user finishes typing the username
  const handleUsernameLookup = async () => {
    const uname = username.trim();
    if (!uname || uname === lastLookupRef.current) return;
    lastLookupRef.current = uname;

    setProperties([]);
    setSelectedProp(null);
    setPropLoading(true);
    try {
      const res  = await authApi.lookupProperties(uname);
      const list: PropertyItem[] = (res?.data?.properties ?? []).map((p: any) => ({
        id:      p.id,
        name:    p.name,
        address: p.address ?? '',
      }));
      setProperties(list);
      if (list.length === 1) setSelectedProp(list[0]);
    } catch {
      // Silently ignore — property field just stays empty
    } finally {
      setPropLoading(false);
    }
  };

  const openPropertySheet = () => {
    if (properties.length === 0 && !propLoading) return;
    setSheetVisible(true);
  };

  const completeLogin = async (
    uname: string, pwd: string,
    propId?: number, propName?: string,
    offerBioSave = false,
  ) => {
    const res = await authApi.login(uname, pwd, propId);
    const user         = res?.data?.user ?? res?.user;
    const accessToken  = res?.accessToken  ?? res?.data?.accessToken;
    const refreshToken = res?.refreshToken ?? res?.data?.refreshToken;
    if (!user || !accessToken || !refreshToken) throw new Error('invalid');

    // Offer to enable biometrics if not yet enabled and device supports it
    if (offerBioSave && bioType && !bioEnabled) {
      Alert.alert(
        `Enable ${bioType}?`,
        `Sign in faster next time using ${bioType}.`,
        [
          { text: 'Not Now', style: 'cancel', onPress: () => auth.login(user, accessToken, refreshToken, propId, propName) },
          {
            text: 'Enable',
            onPress: async () => {
              await saveBiometricCredentials(uname, pwd, propId, propName);
              setBioEnabled(true);
              auth.login(user, accessToken, refreshToken, propId, propName);
            },
          },
        ],
      );
    } else {
      auth.login(user, accessToken, refreshToken, propId, propName);
    }
  };

  const handleLogin = async () => {
    setError('');
    if (!username.trim() || !password.trim()) {
      setError(t('login.pleaseEnter'));
      shake();
      return;
    }
    setLoading(true);
    try {
      await completeLogin(username.trim(), password, selectedProp?.id, selectedProp?.name, true);
    } catch (e: any) {
      if (e?.status === 401 || e?.status === 400) {
        setError(t('login.invalidCredentials'));
      } else {
        setError(t('login.loginFailed'));
      }
      shake();
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setBioLoading(true);
    try {
      const creds = await loadBiometricCredentials();
      if (!creds) { setError('No biometric credentials saved. Please sign in manually.'); return; }

      const passed = await promptBiometrics(`Sign in as ${creds.username}`);
      if (!passed) return;

      await completeLogin(creds.username, creds.password, creds.propertyId, creds.propertyName);
    } catch {
      setError(t('login.loginFailed'));
      shake();
    } finally {
      setBioLoading(false);
    }
  };

  const handleLanguageSwitch = () => {
    i18n.changeLanguage(currentLang === 'en' ? 'km' : 'en').then(() => forceUpdate(n => n + 1));
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0F766E" />

      {/* ── Top indigo banner ── */}
      <View style={s.banner}>
        <View style={s.bannerDeco1} />
        <View style={s.bannerDeco2} />

        <TouchableOpacity style={s.langBtn} onPress={handleLanguageSwitch} activeOpacity={0.7}>
          <Icon name="language-outline" size={15} color="rgba(255,255,255,0.85)" />
          <Text style={s.langText}>{currentLang === 'en' ? 'ភាសាខ្មែរ' : 'English'}</Text>
        </TouchableOpacity>

        <View style={s.bannerContent}>
          <AppLogo size="md" variant="dark" />
          <Text style={s.bannerApp}>Pteah Manager</Text>
          <Text style={s.bannerSub}>{t('login.subtitle')}</Text>
        </View>
      </View>

      {/* ── White form card ── */}
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              s.card,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }, { translateX: shakeAnim }],
              },
            ]}
          >
            <Text style={s.welcome}>{t('login.welcomeBack')}</Text>
            <Text style={s.sub}>{t('login.cardSubtitle')}</Text>

            {/* Error */}
            {!!error && (
              <View style={s.errorBox}>
                <Icon name="alert-circle-outline" size={15} color="#DC2626" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            {/* Username */}
            <Input
              label={t('login.email')}
              icon="person-outline"
              placeholder={t('login.emailPlaceholder')}
              value={username}
              onChangeText={v => {
                setUsername(v);
                setError('');
                setProperties([]);
                setSelectedProp(null);
                lastLookupRef.current = '';
              }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onEndEditing={handleUsernameLookup}
              onSubmitEditing={() => { handleUsernameLookup(); passwordRef.current?.focus(); }}
            />

            {/* Password (eye toggle is built into Input) */}
            <Input
              ref={passwordRef}
              label={t('login.password')}
              placeholder={t('login.passwordPlaceholder')}
              value={password}
              onChangeText={v => { setPassword(v); setError(''); }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />

            {/* Property selector — same field look, opens the property sheet */}
            <FieldShell
              label={t('login.property')}
              icon="business-outline"
              focused={sheetVisible}
              filled={!!selectedProp}
              onPress={openPropertySheet}
              right={propLoading
                ? <ActivityIndicator size="small" color="#0F766E" />
                : <Icon name="chevron-down" size={18} color="#9CA3AF" />}
            >
              {selectedProp ? <Text style={s.propValue} numberOfLines={1}>{selectedProp.name}</Text> : null}
            </FieldShell>

            {/* Forgot password */}
            <TouchableOpacity
              style={s.forgotBtn}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('ForgotPassword')}
            >
              <Text style={s.forgotText}>{t('login.forgotPassword')}</Text>
            </TouchableOpacity>

            {/* Sign In */}
            <TouchableOpacity
              style={[s.loginBtn, loading && s.loginBtnDisabled]}
              activeOpacity={0.85}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Icon name="log-in-outline" size={18} color="#FFFFFF" />
                  <Text style={s.loginBtnText}>{t('login.signIn')}</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Biometric login */}
            {bioEnabled && bioType && (
              <TouchableOpacity
                style={s.bioBtn}
                activeOpacity={0.75}
                onPress={handleBiometricLogin}
                disabled={bioLoading}
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
                    <Text style={s.bioBtnText}>
                      Sign in with {bioType}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Property picker sheet */}
      <PropertySheet
        visible={sheetVisible}
        properties={properties}
        loading={propLoading}
        selected={selectedProp}
        onSelect={p => { setSelectedProp(p); setError(''); }}
        onClose={() => setSheetVisible(false)}
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  propValue: { fontSize: 15, color: '#0F172A' },
  root: { flex: 1, backgroundColor: '#0F766E' },
  flex: { flex: 1 },

  banner: {
    height: BANNER_H, backgroundColor: '#0F766E',
    alignItems: 'center', justifyContent: 'flex-end',
    paddingBottom: 32, overflow: 'hidden',
  },
  bannerDeco1: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -100, right: -80,
  },
  bannerDeco2: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: -60, left: -60,
  },
  langBtn: {
    position: 'absolute', top: 54, right: 20,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  langText:     { fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  bannerContent: { alignItems: 'center', gap: 10 },
  bannerApp:    { fontSize: 24, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  bannerSub:    { fontSize: 13, color: 'rgba(255,255,255,0.6)' },

  scrollContent: { flexGrow: 1 },
  card: {
    flex: 1, backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 28, paddingTop: 32, paddingBottom: 40,
    minHeight: height * 0.65,
  },

  welcome: { fontSize: 24, fontWeight: '800', color: '#0F172A', letterSpacing: -0.4 },
  sub:     { fontSize: 14, color: '#9CA3AF', marginTop: 4, marginBottom: 24 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12,
    marginBottom: 16, borderWidth: 1, borderColor: '#FECACA',
  },
  errorText: { flex: 1, fontSize: 13, color: '#DC2626', lineHeight: 18 },


  forgotBtn:  { alignSelf: 'flex-end', marginBottom: 28, marginTop: 2 },
  forgotText: { fontSize: 13, color: '#0F766E', fontWeight: '600' },

  loginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#0F766E', borderRadius: 16, paddingVertical: 16,
    shadowColor: '#0F766E', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  loginBtnDisabled: { opacity: 0.65 },
  loginBtnText:     { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  bioBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 14, paddingVertical: 14,
    borderRadius: 16, borderWidth: 1.5, borderColor: '#CCFBF1',
    backgroundColor: '#F5F3FF',
  },
  bioBtnText: { fontSize: 15, fontWeight: '600', color: '#0F766E' },
});

// Property sheet styles
const ps = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, maxHeight: '75%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 4,
  },
  title:    { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  subtitle: { fontSize: 13, color: '#9CA3AF', marginBottom: 20 },

  center:      { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 13, color: '#9CA3AF' },
  emptyText:   { fontSize: 14, color: '#9CA3AF' },

  list: { marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
  },
  rowLast:     { borderBottomWidth: 0 },
  rowSelected: { backgroundColor: 'transparent' },
  rowIcon: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rowIconSelected: { backgroundColor: '#0F766E' },
  rowInfo:         { flex: 1 },
  rowName:         { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  rowNameSelected: { color: '#115E59' },
  rowAddr:         { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#D1D5DB', flexShrink: 0,
  },
});
