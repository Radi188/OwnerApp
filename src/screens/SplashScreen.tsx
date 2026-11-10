import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  StatusBar,
  Dimensions,
} from 'react-native';
import { Text } from '../components/Text';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { loadStoredTokens, usersApi } from '../services/api';
import AppLogo from '../components/AppLogo';

const { width } = Dimensions.get('window');
const MIN_SPLASH_MS = 2500;

// ─── Cross Cambodia logo (recreated from brand asset) ────────────────────────
function CrossLogo() {
  return (
    <View style={logo.row}>
      {/* CR */}
      <Text style={logo.charcoal}>CR</Text>

      {/* X — cyan with dark-teal depth shadow */}
      <Text style={logo.x}>X</Text>

      {/* SS */}
      <Text style={logo.charcoal}>SS</Text>
    </View>
  );
}

const logo = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  charcoal: {
    fontSize:      26,
    fontWeight:    '900',
    color:         'rgba(255,255,255,0.92)',
    letterSpacing: -0.5,
  },
  x: {
    fontSize:        34,
    fontWeight:      '900',
    color:           '#5BC8DC',
    letterSpacing:   -0.5,
    marginHorizontal: 1,
    textShadowColor:  '#1A6070',
    textShadowOffset: { width: -2, height: 2 },
    textShadowRadius: 1,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SplashScreen() {
  const navigation = useNavigation<any>();
  const { login }  = useAuth();

  const [checkDone, setCheckDone] = useState(false);
  const startTime   = useRef(Date.now());

  const pendingAuth = useRef<{
    user: any; access: string; refresh: string;
  } | null>(null);

  const fadeAnim    = useRef(new Animated.Value(0)).current;
  const scaleAnim   = useRef(new Animated.Value(0.82)).current;
  const dot1Anim    = useRef(new Animated.Value(0.25)).current;
  const dot2Anim    = useRef(new Animated.Value(0.25)).current;
  const dot3Anim    = useRef(new Animated.Value(0.25)).current;
  const devFadeAnim = useRef(new Animated.Value(0)).current;

  // ── 1. Entry animations + session check ──────────────────────────────────
  useEffect(() => {
    // Main logo entrance
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, damping: 14, stiffness: 100, useNativeDriver: true }),
    ]).start();

    // Developer badge fades in slightly later
    Animated.timing(devFadeAnim, {
      toValue: 1, duration: 700, delay: 400, useNativeDriver: true,
    }).start();

    // Bouncing dots
    const runDot = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1,    duration: 420, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.25, duration: 420, useNativeDriver: true }),
        ]),
      );
    runDot(dot1Anim, 0).start();
    runDot(dot2Anim, 140).start();
    runDot(dot3Anim, 280).start();

    // Session restore — store in ref, NOT in state, so we don't trigger re-renders
    (async () => {
      try {
        const stored = await loadStoredTokens();
        if (stored) {
          const res  = await usersApi.me();
          const user = res?.data?.user ?? res?.user ?? res?.data;
          if (user?.id) {
            pendingAuth.current = { user, access: stored.access, refresh: stored.refresh };
          }
        }
      } catch {
        // Expired / no token → Login
      } finally {
        setCheckDone(true);
      }
    })();
  }, []);

  // ── 2. After min display time, navigate while splash is FULLY visible ─────
  useEffect(() => {
    if (!checkDone) return;

    const elapsed   = Date.now() - startTime.current;
    const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);

    const timer = setTimeout(() => {
      if (pendingAuth.current) {
        const { user, access, refresh } = pendingAuth.current;
        login(user, access, refresh);
      } else {
        navigation.replace('Login');
      }
    }, remaining);

    return () => clearTimeout(timer);
  }, [checkDone]);

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F766E" />

      <View style={[s.deco, s.decoTopRight]} />
      <View style={[s.deco, s.decoBottomLeft]} />

      {/* ── Main branding ── */}
      <Animated.View
        style={[s.center, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}
      >
        <AppLogo size="lg" variant="dark" />
        <Text style={s.appName}>Pteah Manager</Text>
        <Text style={s.tagline}>Property Management · Made Simple</Text>
      </Animated.View>

      {/* ── Loading dots ── */}
      <View style={s.loaderRow}>
        <Animated.View style={[s.dot, { opacity: dot1Anim }]} />
        <Animated.View style={[s.dot, { opacity: dot2Anim }]} />
        <Animated.View style={[s.dot, { opacity: dot3Anim }]} />
      </View>

      {/* ── Developer credit ── */}
      <Animated.View style={[s.devWrap, { opacity: devFadeAnim }]}>
        <Text style={s.devBy}>Developed by</Text>
        <CrossLogo />
        <Text style={s.devName}>CAMBODIA</Text>
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F766E',
    alignItems:      'center',
    justifyContent:  'center',
  },
  deco: {
    position:     'absolute',
    width:        width * 0.85,
    height:       width * 0.85,
    borderRadius: (width * 0.85) / 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  decoTopRight:   { top: -width * 0.3, right: -width * 0.3 },
  decoBottomLeft: { bottom: -width * 0.3, left: -width * 0.3 },

  center:  { alignItems: 'center', gap: 12 },
  appName: { fontSize: 34, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5, marginTop: 6 },
  tagline: { fontSize: 14, color: 'rgba(255,255,255,0.65)', letterSpacing: 0.2 },

  loaderRow: { flexDirection: 'row', gap: 7, marginTop: 60 },
  dot: {
    width:           7,
    height:          7,
    borderRadius:    3.5,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },

  // Developer credit block
  devWrap: {
    position:   'absolute',
    bottom:     36,
    alignItems: 'center',
    gap:        4,
  },
  devBy: {
    fontSize:      10,
    fontWeight:    '500',
    color:         'rgba(255,255,255,0.45)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom:  2,
  },
  devName: {
    fontSize:      11,
    fontWeight:    '700',
    color:         'rgba(255,255,255,0.55)',
    letterSpacing: 4,
    marginTop:     1,
  },
});
