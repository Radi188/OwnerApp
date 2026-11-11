import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Text } from '../components/Text';
import Sunburst from '../components/Sunburst';
import { useAuth } from '../context/AuthContext';
import { loadStoredTokens, usersApi } from '../services/api';
import { colors } from '../theme';

const SYMBOL = require('../assets/brand/pteah-symbol-white.png');
const WORDMARK = require('../assets/brand/pteah-wordmark-white.png');

const MIN_SPLASH_MS = 2600;

// The native launch screen (LaunchScreen.storyboard) shows the same 140pt symbol, centred on
// Pteah Indigo — the first frame here matches it exactly, so the hand-off is seamless.
const LOGO = 140;
const LOGO_SCALE = 0.74;   // settles at ~104pt
const LIFT = 96;           // how far the logo rises from the centre
const WORDMARK_W = 168;
const WORDMARK_H = Math.round(WORDMARK_W * (247 / 540));
const BAR_W = 132;
const GOLD = '#F5C76A';    // warm "sunrise" accent, used sparingly

const RAYS = 12;

// ─── Developer credit ────────────────────────────────────────────────────────
function CrossLogo() {
  return (
    <View style={credit.row}>
      <Text style={credit.charcoal}>CR</Text>
      <Text style={credit.x}>X</Text>
      <Text style={credit.charcoal}>SS</Text>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function SplashScreen() {
  const navigation = useNavigation<any>();
  const { login } = useAuth();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [checkDone, setCheckDone] = useState(false);
  const startTime = useRef(Date.now());
  const pendingAuth = useRef<{ user: any; access: string; refresh: string } | null>(null);

  // Intro choreography
  const rise = useRef(new Animated.Value(0)).current;        // logo: centre → final spot
  const ambience = useRef(new Animated.Value(0)).current;    // glow + sunburst fade in
  const wipe = useRef(new Animated.Value(0)).current;        // wordmark reveal
  const rule = useRef(new Animated.Value(0)).current;        // gold divider
  const tagline = useRef(new Animated.Value(0)).current;
  const footer = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;    // loading bar 0 → 1
  const exit = useRef(new Animated.Value(0)).current;        // 0 → 1 fades everything out

  // Ambient loops
  const spin = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const halos = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  // ── 1. Entrance + session check ───────────────────────────────────────────
  useEffect(() => {
    const ease = Easing.bezier(0.22, 1, 0.36, 1); // easeOutQuint — smooth, "expensive" settle

    Animated.sequence([
      Animated.delay(180),
      Animated.parallel([
        Animated.timing(rise, { toValue: 1, duration: 900, easing: ease, useNativeDriver: true }),
        Animated.timing(ambience, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(420),
          Animated.timing(wipe, { toValue: 1, duration: 800, easing: ease, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(900),
          Animated.timing(rule, { toValue: 1, duration: 600, easing: ease, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(1050),
          Animated.timing(tagline, { toValue: 1, duration: 700, easing: ease, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(1300),
          Animated.timing(footer, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(1100),
          // Creeps toward 85 % while we check the session; finishes on exit
          Animated.timing(progress, { toValue: 0.85, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
      ]),
    ]).start();

    // Ambient motion — skipped when the user prefers reduced motion
    const loops: Animated.CompositeAnimation[] = [];
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (reduce) return;
      loops.push(
        Animated.loop(Animated.timing(spin, { toValue: 1, duration: 48000, easing: Easing.linear, useNativeDriver: true })),
        Animated.loop(
          Animated.sequence([
            Animated.timing(float, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(float, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
        ),
        ...halos.map((h, i) =>
          Animated.sequence([
            Animated.delay(900 + i * 1000),
            Animated.loop(Animated.timing(h, { toValue: 1, duration: 3000, easing: Easing.out(Easing.quad), useNativeDriver: true })),
          ]),
        ),
      );
      loops.forEach(l => l.start());
    }).catch(() => {});

    // Session restore — kept in a ref (not state) so it doesn't re-render mid-animation
    (async () => {
      try {
        const stored = await loadStoredTokens();
        if (stored) {
          const res = await usersApi.me();
          const user = res?.data?.user ?? res?.user ?? res?.data;
          if (user?.id) pendingAuth.current = { user, access: stored.access, refresh: stored.refresh };
        }
      } catch {
        // Expired / no token → Login
      } finally {
        setCheckDone(true);
      }
    })();

    return () => loops.forEach(l => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 2. After the minimum time: finish the bar, fade out, then navigate ────
  useEffect(() => {
    if (!checkDone) return;
    const remaining = Math.max(0, MIN_SPLASH_MS - (Date.now() - startTime.current));

    const timer = setTimeout(() => {
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(exit, { toValue: 1, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(() => {
        if (pendingAuth.current) {
          const { user, access, refresh } = pendingAuth.current;
          login(user, access, refresh);
        } else {
          navigation.replace('Login');
        }
      });
    }, remaining);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkDone]);

  // ── Layout (everything hangs off the logo's final centre) ─────────────────
  const cx = width / 2;
  const cy = height / 2 - LIFT;          // logo's resting centre
  const burstR = Math.max(width, height) * 0.62;
  const contentOut = exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  const centred = (size: number, y = cy) => ({
    position: 'absolute' as const,
    width: size,
    height: size,
    left: cx - size / 2,
    top: y - size / 2,
  });

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* ── Depth: dark vignette at the bottom, soft light behind the logo ── */}
      {[2.4, 1.8, 1.3].map((k, i) => (
        <View
          key={`v${i}`}
          pointerEvents="none"
          style={[centred(width * k, height + width * 0.35), s.vignette, { borderRadius: (width * k) / 2 }]}
        />
      ))}

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: Animated.multiply(ambience, contentOut) }]}>
        {[1.9, 1.4, 1.0, 0.68, 0.44].map((k, i) => (
          <View
            key={`g${i}`}
            style={[centred(width * k), s.glow, { borderRadius: (width * k) / 2 }]}
          />
        ))}

        {/* Sunburst — echoes the rays inside the Pteah gable */}
        <Animated.View
          style={[
            centred(burstR * 2),
            {
              transform: [
                { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
                { scale: ambience.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
              ],
            },
          ]}
        >
          <Sunburst radius={burstR} rays={RAYS} />
        </Animated.View>

        {/* Halo rings pulsing out from the mark */}
        {halos.map((h, i) => (
          <Animated.View
            key={`h${i}`}
            style={[
              centred(150),
              s.halo,
              {
                opacity: h.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.45, 0] }),
                transform: [{ scale: h.interpolate({ inputRange: [0, 1], outputRange: [0.7, 2.4] }) }],
              },
            ]}
          />
        ))}
      </Animated.View>

      {/* ── Logo ── */}
      <Animated.View
        style={[
          centred(LOGO, height / 2),
          {
            opacity: contentOut,
            transform: [
              {
                translateY: Animated.add(
                  rise.interpolate({ inputRange: [0, 1], outputRange: [0, -LIFT] }),
                  float.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }),
                ),
              },
              {
                scale: Animated.add(
                  rise.interpolate({ inputRange: [0, 1], outputRange: [1, LOGO_SCALE] }),
                  exit.interpolate({ inputRange: [0, 1], outputRange: [0, 0.08] }),
                ),
              },
            ],
          },
        ]}
      >
        <Image source={SYMBOL} style={s.full} resizeMode="contain" accessibilityLabel="Pteah Manager" />
      </Animated.View>

      {/* ── Wordmark (left-to-right wipe: outer slides in, inner counter-slides) ── */}
      <Animated.View
        style={[
          s.wordmarkClip,
          {
            left: cx - WORDMARK_W / 2,
            top: cy + (LOGO * LOGO_SCALE) / 2 + 20,
            opacity: Animated.multiply(wipe.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }), contentOut),
            transform: [{ translateX: wipe.interpolate({ inputRange: [0, 1], outputRange: [-WORDMARK_W, 0] }) }],
          },
        ]}
      >
        <Animated.Image
          source={WORDMARK}
          style={[s.wordmark, { transform: [{ translateX: wipe.interpolate({ inputRange: [0, 1], outputRange: [WORDMARK_W, 0] }) }] }]}
          resizeMode="contain"
        />
      </Animated.View>

      {/* ── Gold rule + tagline ── */}
      <Animated.View
        style={[
          s.rule,
          {
            left: cx - 18,
            top: cy + (LOGO * LOGO_SCALE) / 2 + 20 + WORDMARK_H + 18,
            opacity: contentOut,
            transform: [{ scaleX: rule }],
          },
        ]}
      />
      <Animated.View
        style={[
          s.taglineWrap,
          {
            top: cy + (LOGO * LOGO_SCALE) / 2 + 20 + WORDMARK_H + 32,
            opacity: Animated.multiply(tagline, contentOut),
            transform: [{ translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
          },
        ]}
      >
        <Text style={s.tagline}>PROPERTY MANAGEMENT · MADE SIMPLE</Text>
      </Animated.View>

      {/* ── Progress ── */}
      <Animated.View
        style={[
          s.track,
          {
            left: cx - BAR_W / 2,
            top: cy + (LOGO * LOGO_SCALE) / 2 + 20 + WORDMARK_H + 96,
            opacity: Animated.multiply(tagline, contentOut),
          },
        ]}
      >
        <Animated.View
          style={[s.fill, { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-BAR_W, 0] }) }] }]}
        />
      </Animated.View>

      {/* ── Developer credit ── */}
      <Animated.View
        style={[
          s.devWrap,
          {
            bottom: Math.max(insets.bottom, 16) + 20,
            opacity: Animated.multiply(footer, contentOut),
            transform: [{ translateY: footer.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
          },
        ]}
      >
        <Text style={s.devBy}>Developed by</Text>
        <CrossLogo />
        <Text style={s.devName}>CAMBODIA</Text>
      </Animated.View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary, // must match LaunchScreen.storyboard
    overflow: 'hidden',
  },
  full: { width: '100%', height: '100%' },
  vignette: { backgroundColor: 'rgba(23,21,59,0.14)' }, // Night Ink
  glow: { backgroundColor: 'rgba(255,255,255,0.035)' },
  halo: {
    borderRadius: 75,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
  },

  wordmarkClip: {
    position: 'absolute',
    width: WORDMARK_W,
    height: WORDMARK_H,
    overflow: 'hidden',
  },
  wordmark: { width: WORDMARK_W, height: WORDMARK_H },

  rule: {
    position: 'absolute',
    width: 36,
    height: 2,
    borderRadius: 1,
    backgroundColor: GOLD,
  },
  taglineWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  tagline: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.72)',
    letterSpacing: 2.4,
  },

  track: {
    position: 'absolute',
    width: BAR_W,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  fill: {
    width: BAR_W,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#FFFFFF',
  },

  devWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 4,
  },
  devBy: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  devName: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 4,
    marginTop: 1,
  },
});

const credit = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  charcoal: {
    fontSize: 22,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: -0.5,
  },
  x: {
    fontSize: 28,
    fontWeight: '900',
    color: '#5BC8DC',
    letterSpacing: -0.5,
    marginHorizontal: 1,
    textShadowColor: '#1A6070',
    textShadowOffset: { width: -2, height: 2 },
    textShadowRadius: 1,
  },
});
