import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StatusBar,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { loadStoredTokens, usersApi } from '../services/api';
import AppLogo from '../components/AppLogo';

const { width } = Dimensions.get('window');
const MIN_SPLASH_MS = 2000;

export default function SplashScreen() {
  const navigation              = useNavigation<any>();
  const { login, isAuthenticated } = useAuth();

  // checkDone = session restore finished (success or fail)
  const [checkDone, setCheckDone] = useState(false);
  const startTime = useRef(Date.now());

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.75)).current;
  const dot1Anim  = useRef(new Animated.Value(0.25)).current;
  const dot2Anim  = useRef(new Animated.Value(0.25)).current;
  const dot3Anim  = useRef(new Animated.Value(0.25)).current;
  const fadeOut   = useRef(new Animated.Value(1)).current;

  // ── 1. Start animations + run session check ───────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, damping: 14, stiffness: 110, useNativeDriver: true }),
    ]).start();

    const runDot = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1,    duration: 450, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.25, duration: 450, useNativeDriver: true }),
        ]),
      );
    runDot(dot1Anim, 0).start();
    runDot(dot2Anim, 150).start();
    runDot(dot3Anim, 300).start();

    // Session restore
    (async () => {
      try {
        const stored = await loadStoredTokens();
        if (stored) {
          const res  = await usersApi.me();
          const user = res?.data?.user ?? res?.user ?? res?.data;
          if (user?.id) {
            login(user, stored.access, stored.refresh);
          }
        }
      } catch {
        // Token invalid/expired — navigate to Login
      } finally {
        setCheckDone(true);
      }
    })();
  }, []);

  // ── 2. Once check is done, wait for min time then navigate ────────────────
  useEffect(() => {
    if (!checkDone) return;

    const elapsed   = Date.now() - startTime.current;
    const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);

    const timer = setTimeout(() => {
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => {
        if (isAuthenticated) {
          // Replace entire stack with Main so back button won't return to Splash
          navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        } else {
          navigation.replace('Login');
        }
      });
    }, remaining);

    return () => clearTimeout(timer);
  }, [checkDone, isAuthenticated]);

  return (
    <Animated.View style={[s.container, { opacity: fadeOut }]}>
      <StatusBar barStyle="light-content" backgroundColor="#6366F1" />

      <View style={[s.deco, s.decoTopRight]} />
      <View style={[s.deco, s.decoBottomLeft]} />

      <Animated.View
        style={[s.center, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}
      >
        <AppLogo size="lg" variant="dark" />
        <Text style={s.appName}>Pteah Manager</Text>
        <Text style={s.tagline}>Property Management · Made Simple</Text>
      </Animated.View>

      <View style={s.loaderRow}>
        <Animated.View style={[s.dot, { opacity: dot1Anim }]} />
        <Animated.View style={[s.dot, { opacity: dot2Anim }]} />
        <Animated.View style={[s.dot, { opacity: dot3Anim }]} />
      </View>

      <Text style={s.bottomLabel}>PROPERTY MANAGEMENT</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deco: {
    position: 'absolute',
    width: width * 0.85,
    height: width * 0.85,
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
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  bottomLabel: {
    position: 'absolute',
    bottom: 42,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
  },
});
