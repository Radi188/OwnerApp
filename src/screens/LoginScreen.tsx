import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Text, TextInput } from '../components/Text';
import { FieldShell, Input } from '../components/form';
import Sunburst from '../components/Sunburst';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { colors, shadow } from '../theme';
import {
  getAvailableBiometricType,
  getBiometricState,
  unlockBiometricCredentials,
  saveBiometricCredentials,
  clearBiometricCredentials,
  biometricLabel,
  BiometricType,
} from '../services/biometrics';
import { toast } from '../components/Toast';

// Face ID starts by itself only once per app launch — not again after a deliberate logout
let autoPromptDone = false;

const SYMBOL = require('../assets/brand/pteah-symbol-white.png');
const WORDMARK = require('../assets/brand/pteah-wordmark-white.png');

type PropertyItem = { id: number; name: string; address?: string };

const GOLD = '#F5C76A';
const SHEET_RADIUS = 32;
const WORDMARK_W = 132;
const WORDMARK_H = Math.round(WORDMARK_W * (247 / 540));
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** Fades + lifts its children in when `v` goes 0 → 1. */
function Rise({ v, children, style }: { v: Animated.Value; children: React.ReactNode; style?: any }) {
  return (
    <Animated.View
      style={[
        style,
        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// ─── Property picker sheet ───────────────────────────────────────────────────
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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(600)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      visible
        ? Animated.spring(slide, { toValue: 0, useNativeDriver: true, tension: 70, friction: 13 })
        : Animated.timing(slide, { toValue: 600, duration: 220, useNativeDriver: true }),
      Animated.timing(fade, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [visible, slide, fade]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[ps.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[ps.sheet, { paddingBottom: insets.bottom + 24, transform: [{ translateY: slide }] }]}>
        <View style={ps.handle} />
        <View style={ps.header}>
          <View style={ps.headerIcon}>
            <Icon name="business" size={18} color={colors.primary} />
          </View>
          <View style={ps.flex}>
            <Text style={ps.title}>{t('login.selectProperty')}</Text>
            <Text style={ps.subtitle}>{t('login.selectPropertySub')}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={ps.closeBtn} activeOpacity={0.7} hitSlop={8}>
            <Icon name="close" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={ps.center}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={ps.muted}>{t('login.loadingProperties')}</Text>
          </View>
        ) : properties.length === 0 ? (
          <View style={ps.center}>
            <Icon name="business-outline" size={40} color={colors.border} />
            <Text style={ps.muted}>{t('login.noProperties')}</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={ps.list}>
            {properties.map(p => {
              const isSelected = selected?.id === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[ps.row, isSelected && ps.rowSelected]}
                  onPress={() => { onSelect(p); onClose(); }}
                  activeOpacity={0.75}
                >
                  <View style={[ps.rowIcon, isSelected && ps.rowIconSelected]}>
                    <Icon name="business" size={18} color={isSelected ? colors.white : colors.primary} />
                  </View>
                  <View style={ps.flex}>
                    <Text style={[ps.rowName, isSelected && ps.rowNameSelected]} numberOfLines={1}>{p.name}</Text>
                    {!!p.address && <Text style={ps.rowAddr} numberOfLines={1}>{p.address}</Text>}
                  </View>
                  {isSelected
                    ? <Icon name="checkmark-circle" size={22} color={colors.primary} />
                    : <View style={ps.radio} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </Animated.View>
    </Modal>
  );
}

// ─── Primary button with a press "give" and a soft top sheen ─────────────────
function SignInButton({ title, loading, onPress }: { title: string; loading: boolean; onPress: () => void }) {
  const press = useRef(new Animated.Value(0)).current;
  const to = (v: number) => Animated.spring(press, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();

  return (
    <Pressable onPress={onPress} disabled={loading} onPressIn={() => to(1)} onPressOut={() => to(0)}>
      <Animated.View
        style={[
          s.btn,
          loading && s.btnBusy,
          { transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) }] },
        ]}
      >
        <View style={s.btnSheen} pointerEvents="none" />
        {loading ? (
          <ActivityIndicator color={colors.white} size="small" />
        ) : (
          <>
            <Text style={s.btnText}>{title}</Text>
            <View style={s.btnArrow}>
              <Icon name="arrow-forward" size={16} color={colors.primary} />
            </View>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ─── Login screen ────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const [, forceUpdate] = useState(0);
  const auth = useAuth();
  const currentLang = i18n.language;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [selectedProp, setSelectedProp] = useState<PropertyItem | null>(null);
  const [propLoading, setPropLoading] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const lastLookupRef = useRef('');

  const [bioType, setBioType] = useState<BiometricType>(null);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  // Who / where biometric login signs into (shown under the button)
  const [bioUser, setBioUser] = useState<{ username: string | null; propertyName: string | null }>({ username: null, propertyName: null });

  const passwordRef = useRef<TextInput>(null);

  // Animation values
  const hero = useRef(new Animated.Value(0)).current;
  const sheet = useRef(new Animated.Value(0)).current;
  const items = useRef(Array.from({ length: 6 }, () => new Animated.Value(0))).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(hero, { toValue: 1, duration: 800, easing: EASE, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(120),
        Animated.spring(sheet, { toValue: 1, useNativeDriver: true, tension: 55, friction: 12 }),
      ]),
      Animated.sequence([
        Animated.delay(260),
        Animated.stagger(70, items.map(v => Animated.timing(v, { toValue: 1, duration: 520, easing: EASE, useNativeDriver: true }))),
      ]),
    ]).start();

    // Biometric availability + saved login; on app launch, start Face ID straight away
    Promise.all([getAvailableBiometricType(), getBiometricState()]).then(([type, state]) => {
      setBioType(type);
      setBioEnabled(state.enabled && !!type);
      setBioUser({ username: state.username, propertyName: state.propertyName });
      if (state.enabled && type && !autoPromptDone) {
        autoPromptDone = true;
        setTimeout(() => handleBiometricLogin(), 650); // let the entrance animation settle
      }
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The sunburst only turns while this screen is visible (stops under Forgot Password, after login,
  // and never runs with Reduce Motion). It runs on the native driver, so it costs no JS-thread time.
  useFocusEffect(
    useCallback(() => {
      let loop: Animated.CompositeAnimation | null = null;
      let cancelled = false;
      AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
        if (reduce || cancelled) return;
        loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 60000, easing: Easing.linear, useNativeDriver: true }));
        loop.start();
      }).catch(() => {});
      return () => {
        cancelled = true;
        loop?.stop();
      };
    }, [spin]),
  );

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  /** Smoothly animates the next layout change (property field / chip / error appearing). */
  const animateLayout = () => LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));

  const showError = (msg: string) => {
    animateLayout();
    setError(msg);
  };

  const clearError = () => {
    if (error) { animateLayout(); setError(''); }
  };

  // Called when user finishes typing the username
  const handleUsernameLookup = async () => {
    const uname = username.trim();
    if (!uname || uname === lastLookupRef.current) return;
    lastLookupRef.current = uname;

    animateLayout();
    setProperties([]);
    setSelectedProp(null);
    setPropLoading(true);
    try {
      const res = await authApi.lookupProperties(uname);
      const list: PropertyItem[] = (res?.data?.properties ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        address: p.address ?? '',
      }));
      animateLayout();
      setProperties(list);
      if (list.length === 1) setSelectedProp(list[0]);
    } catch {
      // Silently ignore — the property field just stays hidden
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
    const user = res?.data?.user ?? res?.user;
    const accessToken = res?.accessToken ?? res?.data?.accessToken;
    const refreshToken = res?.refreshToken ?? res?.data?.refreshToken;
    if (!user || !accessToken || !refreshToken) throw new Error('invalid');

    const finish = () => auth.login(user, accessToken, refreshToken, propId, propName);
    const label = biometricLabel(bioType);
    const enable = async () => {
      try {
        await saveBiometricCredentials(uname, pwd, propId, propName);
        setBioEnabled(true);
        toast.success(t('bio.enabledMsg', { type: label }), { title: t('bio.enabledTitle', { type: label }) });
      } catch (e: any) {
        toast.error(e?.message ?? t('bio.saveFailed'));
      }
      finish();
    };

    // Typed-in password sign-in (not a biometric one)
    if (offerBioSave && bioType) {
      if (bioEnabled && bioUser.username === uname) {
        // Same account: keep the saved password & property up to date (e.g. after a password change)
        saveBiometricCredentials(uname, pwd, propId, propName).catch(() => {});
        finish();
        return;
      }
      Alert.alert(
        bioEnabled ? t('bio.switchTitle', { type: label }) : t('bio.offerTitle', { type: label }),
        bioEnabled
          ? t('bio.switchMsg', { type: label, from: bioUser.username ?? '', to: uname })
          : t('bio.offerMsg', { type: label }),
        [
          { text: t('bio.notNow'), style: 'cancel', onPress: finish },
          { text: t('bio.enable'), onPress: enable },
        ],
      );
      return;
    }
    finish();
  };

  const handleLogin = async () => {
    clearError();
    if (!username.trim() || !password.trim()) {
      showError(t('login.pleaseEnter'));
      shake();
      return;
    }
    setLoading(true);
    try {
      await completeLogin(username.trim(), password, selectedProp?.id, selectedProp?.name, true);
    } catch (e: any) {
      if (e?.status === 401 || e?.status === 400) {
        showError(t('login.invalidCredentials'));
      } else if (e?.status === 403 && e?.message) {
        // Locked / inactive / not assigned to that property — the server's message explains which
        showError(e.message);
      } else {
        showError(t('login.loginFailed'));
      }
      shake();
    } finally {
      setLoading(false);
    }
  };

  /** One scan → the OS unlocks the saved login → sign straight in. */
  const handleBiometricLogin = async () => {
    if (bioLoading) return;
    setBioLoading(true);
    clearError();
    try {
      const state = await getBiometricState();
      const creds = await unlockBiometricCredentials({
        title: t('bio.promptTitle', { name: state.username ?? '' }),
        subtitle: state.propertyName ?? undefined,
        cancel: t('bio.usePassword'),
      });
      if (!creds) {
        // Cancelled, or turned off because the phone's Face ID / fingerprints changed
        const still = await getBiometricState();
        if (!still.enabled) {
          setBioEnabled(false);
          toast.info(t('bio.resetMsg'), { title: t('bio.resetTitle', { type: biometricLabel(bioType) }) });
        }
        return;
      }
      setUsername(creds.username);
      await completeLogin(creds.username, creds.password, creds.propertyId, creds.propertyName);
    } catch (e: any) {
      if (e?.status === 401 || e?.status === 400) {
        // Saved password no longer works (changed elsewhere) → turn biometric login off
        await clearBiometricCredentials();
        setBioEnabled(false);
        showError(t('bio.passwordChanged', { type: biometricLabel(bioType) }));
      } else if (e?.status === 403 && e?.message) {
        showError(e.message);
      } else {
        showError(t('login.loginFailed'));
      }
      shake();
    } finally {
      setBioLoading(false);
    }
  };

  const handleLanguageSwitch = () => {
    i18n.changeLanguage(currentLang === 'en' ? 'km' : 'en').then(() => forceUpdate(n => n + 1));
  };

  // ── Layout ────────────────────────────────────────────────────────────────
  const heroH = Math.max(270, Math.min(height * 0.38, 360)) + insets.top * 0.4;
  const heroCenterY = insets.top + (heroH - insets.top - SHEET_RADIUS) / 2 + 6;
  const burstR = Math.max(width, height) * 0.6;
  const showPropertyField = propLoading || properties.length > 1;
  const singleProperty = !propLoading && properties.length === 1 ? properties[0] : null;

  const heroParallax = {
    opacity: Animated.multiply(
      hero,
      scrollY.interpolate({ inputRange: [0, heroH * 0.55], outputRange: [1, 0], extrapolate: 'clamp' }),
    ),
    transform: [
      { translateY: scrollY.interpolate({ inputRange: [-200, 0, heroH], outputRange: [-60, 0, heroH * 0.45], extrapolate: 'clamp' }) },
      { scale: hero.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
    ],
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* ── Backdrop: vignette, glow and slowly turning sunburst ── */}
      {[2.2, 1.6].map((k, i) => (
        <View
          key={`v${i}`}
          pointerEvents="none"
          style={[s.vignette, { width: width * k, height: width * k, borderRadius: (width * k) / 2, left: (width - width * k) / 2, top: heroH - (width * k) * 0.35 }]}
        />
      ))}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: Animated.multiply(hero, scrollY.interpolate({ inputRange: [0, heroH], outputRange: [1, 0.3], extrapolate: 'clamp' })) }]}
      >
        {[1.5, 1.05, 0.7, 0.45].map((k, i) => (
          <View
            key={`g${i}`}
            style={[s.glow, { width: width * k, height: width * k, borderRadius: (width * k) / 2, left: (width - width * k) / 2, top: heroCenterY - (width * k) / 2 }]}
          />
        ))}
        <Animated.View
          style={{
            ...s.abs,
            left: width / 2 - burstR,
            top: heroCenterY - burstR,
            transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
          }}
        >
          <Sunburst radius={burstR} intensity={0.05} />
        </Animated.View>
      </Animated.View>

      {/* White underlay so iOS bounce never reveals indigo under the sheet */}
      <View style={[s.underlay, { top: height * 0.6 }]} pointerEvents="none" />

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.ScrollView
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        >
          {/* ── Hero ── */}
          <View style={[s.hero, { height: heroH, paddingTop: insets.top, paddingBottom: SHEET_RADIUS }]}>
            <Animated.View style={[s.heroInner, heroParallax]}>
              <Image source={SYMBOL} style={s.symbol} resizeMode="contain" accessibilityLabel="Pteah Manager" />
              <Image source={WORDMARK} style={s.wordmark} resizeMode="contain" />
              <View style={s.heroRule} />
              <Text style={s.heroTagline}>{t('login.subtitle')}</Text>
            </Animated.View>
          </View>

          {/* ── Sign-in sheet ── */}
          <Animated.View
            style={[
              s.sheet,
              {
                marginTop: -SHEET_RADIUS,
                paddingBottom: Math.max(insets.bottom, 16) + 16,
                opacity: sheet,
                transform: [{ translateY: sheet.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }],
              },
            ]}
          >
            <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
              <Rise v={items[0]}>
                <Text style={s.eyebrow}>{t('login.eyebrow')}</Text>
                <Text style={s.welcome}>{t('login.welcomeBack')}</Text>
                <Text style={s.sub}>{t('login.cardSubtitle')}</Text>
              </Rise>

              {!!error && (
                <View style={s.errorBox}>
                  <View style={s.errorIcon}>
                    <Icon name="alert" size={13} color={colors.white} />
                  </View>
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}

              <Rise v={items[1]}>
                <Input
                  label={t('login.email')}
                  icon="person-outline"
                  placeholder={t('login.emailPlaceholder')}
                  value={username}
                  onChangeText={v => {
                    setUsername(v);
                    clearError();
                    if (properties.length || selectedProp) animateLayout();
                    setProperties([]);
                    setSelectedProp(null);
                    lastLookupRef.current = '';
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="username"
                  autoComplete="username"
                  returnKeyType="next"
                  onEndEditing={handleUsernameLookup}
                  onSubmitEditing={() => { handleUsernameLookup(); passwordRef.current?.focus(); }}
                />
                {singleProperty && (
                  <View style={s.propChip}>
                    <Icon name="business" size={12} color={colors.primary} />
                    <Text style={s.propChipText} numberOfLines={1}>{t('login.signingInto', { name: singleProperty.name })}</Text>
                    <Icon name="checkmark-circle" size={14} color={colors.success} />
                  </View>
                )}
              </Rise>

              <Rise v={items[2]}>
                <Input
                  ref={passwordRef}
                  label={t('login.password')}
                  placeholder={t('login.passwordPlaceholder')}
                  value={password}
                  onChangeText={v => { setPassword(v); clearError(); }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  autoComplete="password"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
              </Rise>

              {/* Property — only when the account has 2+ properties (single one is shown as a chip) */}
              {showPropertyField && (
                <FieldShell
                  label={t('login.property')}
                  icon="business-outline"
                  focused={sheetVisible}
                  filled={!!selectedProp}
                  onPress={openPropertySheet}
                  right={propLoading
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Icon name="chevron-down" size={18} color={colors.muted} />}
                >
                  {selectedProp
                    ? <Text style={s.propValue} numberOfLines={1}>{selectedProp.name}</Text>
                    : propLoading ? <Text style={s.propPlaceholder}>{t('login.findingProperties')}</Text> : null}
                </FieldShell>
              )}

              <Rise v={items[3]}>
                <TouchableOpacity
                  style={s.forgotBtn}
                  activeOpacity={0.7}
                  hitSlop={8}
                  onPress={() => navigation.navigate('ForgotPassword')}
                >
                  <Text style={s.forgotText}>{t('login.forgotPassword')}</Text>
                </TouchableOpacity>
              </Rise>

              <Rise v={items[4]}>
                <SignInButton title={t('login.signIn')} loading={loading} onPress={handleLogin} />

                {bioEnabled && bioType && (
                  <>
                    <View style={s.orRow}>
                      <View style={s.orLine} />
                      <Text style={s.orText}>{t('login.or')}</Text>
                      <View style={s.orLine} />
                    </View>
                    <TouchableOpacity style={s.bioBtn} activeOpacity={0.75} onPress={handleBiometricLogin} disabled={bioLoading}>
                      {bioLoading ? (
                        <ActivityIndicator color={colors.primary} size="small" />
                      ) : (
                        <>
                          <View style={s.bioIcon}>
                            <Icon name={bioType === 'FaceID' ? 'scan-outline' : 'finger-print-outline'} size={18} color={colors.primary} />
                          </View>
                          <View style={{ flexShrink: 1 }}>
                            <Text style={s.bioBtnText}>{t('login.bioSignIn', { type: biometricLabel(bioType) })}</Text>
                            {bioUser.username ? (
                              <Text style={s.bioBtnSub} numberOfLines={1}>
                                {[bioUser.username, bioUser.propertyName].filter(Boolean).join(' · ')}
                              </Text>
                            ) : null}
                          </View>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </Rise>
            </Animated.View>

            <View style={s.spacer} />

            <Rise v={items[5]} style={s.footer}>
              <View style={s.secureRow}>
                <Icon name="lock-closed" size={11} color={colors.muted} />
                <Text style={s.secureText}>{t('login.secure')}</Text>
              </View>
              <Text style={s.version}>{t('login.footer')}</Text>
            </Rise>
          </Animated.View>
        </Animated.ScrollView>
      </KeyboardAvoidingView>

      {/* Language switch — frosted pill over the hero */}
      <Animated.View style={[s.langWrap, { top: insets.top + 10, opacity: hero }]}>
        <TouchableOpacity style={s.langBtn} onPress={handleLanguageSwitch} activeOpacity={0.7}>
          <Icon name="globe-outline" size={14} color={colors.white} />
          <Text style={s.langText}>{currentLang === 'en' ? 'ខ្មែរ' : 'EN'}</Text>
        </TouchableOpacity>
      </Animated.View>

      <PropertySheet
        visible={sheetVisible}
        properties={properties}
        loading={propLoading}
        selected={selectedProp}
        onSelect={p => { setSelectedProp(p); clearError(); }}
        onClose={() => setSheetVisible(false)}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary },
  flex: { flex: 1 },
  abs: { position: 'absolute' },
  scrollContent: { flexGrow: 1 },

  vignette: { position: 'absolute', backgroundColor: 'rgba(23,21,59,0.16)' },
  glow: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.04)' },
  underlay: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface },

  // Hero
  hero: { alignItems: 'center', justifyContent: 'center' },
  heroInner: { alignItems: 'center' },
  symbol: { width: 76, height: 76, marginBottom: 12 },
  wordmark: { width: WORDMARK_W, height: WORDMARK_H },
  heroRule: { width: 28, height: 2, borderRadius: 1, backgroundColor: GOLD, marginTop: 16, marginBottom: 10 },
  heroTagline: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)', letterSpacing: 1.6 },

  langWrap: { position: 'absolute', right: 18 },
  langBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
  },
  langText: { fontSize: 12, color: colors.white, fontWeight: '700', letterSpacing: 0.4 },

  // Sheet
  sheet: {
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    paddingHorizontal: 26,
    paddingTop: 30,
    shadowColor: colors.nightInk,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 16,
  },
  eyebrow: { fontSize: 11, fontWeight: '700', color: colors.primary, letterSpacing: 2 },
  welcome: { fontSize: 26, fontWeight: '800', color: colors.nightInk, letterSpacing: -0.5, marginTop: 6 },
  sub: { fontSize: 14, color: colors.textSecondary, marginTop: 4, marginBottom: 22 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.dangerSoft, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 12,
    marginBottom: 16, borderWidth: 1, borderColor: '#FECACA',
  },
  errorIcon: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: colors.danger,
    alignItems: 'center', justifyContent: 'center',
  },
  errorText: { flex: 1, fontSize: 13, color: colors.danger, lineHeight: 18, fontWeight: '500' },

  propChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 6, marginTop: -6, marginBottom: 14, maxWidth: '100%',
  },
  propChipText: { fontSize: 12, fontWeight: '600', color: colors.primaryDark, flexShrink: 1 },
  propValue: { fontSize: 15, color: colors.ink },
  propPlaceholder: { fontSize: 14, color: colors.muted },

  forgotBtn: { alignSelf: 'flex-end', marginTop: 2, marginBottom: 24 },
  forgotText: { fontSize: 13, color: colors.primary, fontWeight: '700' },

  // Primary button
  btn: {
    height: 56,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: colors.primary, borderRadius: 18, overflow: 'hidden',
    ...shadow.raised,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
  },
  btnBusy: { opacity: 0.8 },
  btnSheen: {
    position: 'absolute', left: 0, right: 0, top: 0, height: '50%',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  btnText: { fontSize: 16, fontWeight: '700', color: colors.white, letterSpacing: 0.2 },
  btnArrow: {
    position: 'absolute', right: 8,
    width: 40, height: 40, borderRadius: 13, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
  },

  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  orText: { fontSize: 12, color: colors.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },

  bioBtn: {
    minHeight: 56, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderRadius: 18, borderWidth: 1.5, borderColor: colors.primaryTint, backgroundColor: colors.surface,
  },
  bioIcon: {
    width: 30, height: 30, borderRadius: 10, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  bioBtnText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  bioBtnSub: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },

  spacer: { flexGrow: 1, minHeight: 28 },
  footer: { alignItems: 'center', gap: 4 },
  secureRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  secureText: { fontSize: 11, color: colors.muted, fontWeight: '500' },
  version: { fontSize: 10, color: colors.border, fontWeight: '600', letterSpacing: 0.4 },
});

// Property sheet styles
const ps = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(23,21,59,0.5)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 10, maxHeight: '75%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: 18,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.nightInk },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },

  center: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  muted: { fontSize: 13, color: colors.muted },

  list: { marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 16, marginBottom: 6,
    borderWidth: 1, borderColor: colors.divider,
  },
  rowSelected: { borderColor: colors.primaryTint, backgroundColor: colors.primarySoft },
  rowIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  rowIconSelected: { backgroundColor: colors.primary },
  rowName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  rowNameSelected: { color: colors.primaryDark },
  rowAddr: { fontSize: 12, color: colors.muted, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border },
});
