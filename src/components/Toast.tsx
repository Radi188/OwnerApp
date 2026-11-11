import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { Text } from './Text';
import { colors } from '../theme';
import i18n from '../i18n';

/**
 * App-wide toasts.
 *
 *   toast.success('Tenant created')
 *   toast.error(errMsg(e), { title: 'Could not save' })
 *
 * Callable from anywhere (screens, hooks, services). The newest toast replaces the current one.
 * <ToastHost /> is mounted once in App.tsx; sheets built on <Modal> mount their own host so
 * toasts also appear above them (iOS draws modals in a separate window).
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning';
export type ToastOptions = { title?: string; duration?: number };
type ToastItem = { id: number; type: ToastType; message: string; title?: string; duration: number };

const DEFAULT_MS: Record<ToastType, number> = { success: 2600, info: 3000, warning: 4000, error: 4500 };

// ── Host registry: the most recently mounted host shows the toast ───────────
type Listener = (t: ToastItem) => void;
const hosts: Listener[] = [];
let nextId = 1;

function emit(type: ToastType, message: string, opts: ToastOptions = {}) {
  if (!message) return;
  const item: ToastItem = { id: nextId++, type, message, title: opts.title, duration: opts.duration ?? DEFAULT_MS[type] };
  hosts[hosts.length - 1]?.(item);
  AccessibilityInfo.announceForAccessibility(opts.title ? `${opts.title}. ${message}` : message);
}

export const toast = {
  success: (message: string, opts?: ToastOptions) => emit('success', message, opts),
  error: (message: string, opts?: ToastOptions) => emit('error', message, opts),
  info: (message: string, opts?: ToastOptions) => emit('info', message, opts),
  warning: (message: string, opts?: ToastOptions) => emit('warning', message, opts),
  /** "Deleted" success toast, translated. */
  deleted: () => emit('success', i18n.t('toast.deleted')),
};

const LOOK: Record<ToastType, { icon: string; color: string }> = {
  success: { icon: 'checkmark', color: '#22C55E' },
  error: { icon: 'close', color: '#F87171' },
  warning: { icon: 'alert', color: '#FBBF24' },
  info: { icon: 'information', color: colors.primaryMuted },
};

// ── Host ─────────────────────────────────────────────────────────────────────
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<ToastItem | null>(null);
  const y = useRef(new Animated.Value(-160)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef(new Animated.Value(1)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    Animated.parallel([
      Animated.timing(y, { toValue: -160, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setItem(null); });
  }, [y, opacity]);

  const show = useCallback((t: ToastItem) => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    setItem(t);
    drag.setValue(0);
    y.setValue(-160);
    timer.setValue(1);
    Animated.parallel([
      Animated.spring(y, { toValue: 0, useNativeDriver: true, tension: 80, friction: 11 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(timer, { toValue: 0, duration: t.duration, easing: Easing.linear, useNativeDriver: true }),
    ]).start();
    hideTimeout.current = setTimeout(hide, t.duration);
  }, [y, opacity, timer, drag, hide]);

  // Keep the visible toast so it can move to the next host if this one unmounts (e.g. a sheet
  // shows "Payment saved" and closes in the same tick)
  const current = useRef<{ item: ToastItem; shownAt: number } | null>(null);
  useEffect(() => { current.current = item ? { item, shownAt: Date.now() } : null; }, [item]);

  useEffect(() => {
    hosts.push(show);
    return () => {
      const i = hosts.lastIndexOf(show);
      if (i >= 0) hosts.splice(i, 1);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      const c = current.current;
      if (c) {
        const left = c.item.duration - (Date.now() - c.shownAt);
        if (left > 600) hosts[hosts.length - 1]?.({ ...c.item, id: nextId++, duration: left });
      }
    };
  }, [show]);

  // Swipe up to dismiss
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
      onPanResponderMove: (_, g) => drag.setValue(Math.min(g.dy, 12)),
      onPanResponderRelease: (_, g) => {
        if (g.dy < -24 || g.vy < -0.5) hide();
        else Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  if (!item) return null;
  const look = LOOK[item.type];

  return (
    <View pointerEvents="box-none" style={[styles.layer, { top: insets.top + 8 }]}>
      <Animated.View
        {...pan.panHandlers}
        style={[styles.card, { opacity, transform: [{ translateY: Animated.add(y, drag) }] }]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <Pressable onPress={hide} style={styles.row} hitSlop={6}>
          <View style={[styles.icon, { backgroundColor: look.color }]}>
            <Icon name={look.icon} size={15} color={colors.nightInk} />
          </View>
          <View style={styles.body}>
            {item.title ? <Text style={styles.title} numberOfLines={1}>{item.title}</Text> : null}
            <Text style={item.title ? styles.message : styles.messageOnly} numberOfLines={3}>{item.message}</Text>
          </View>
        </Pressable>
        <View style={styles.track}>
          <Animated.View style={[styles.bar, { backgroundColor: look.color, transform: [{ scaleX: timer }] }]} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 9999, elevation: 9999 },
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: colors.nightInk,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  icon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', color: colors.white },
  message: { fontSize: 13, color: 'rgba(255,255,255,0.72)', marginTop: 1 },
  messageOnly: { fontSize: 14, fontWeight: '600', color: colors.white },
  track: { height: 2.5, backgroundColor: 'rgba(255,255,255,0.08)' },
  bar: { height: 2.5, width: '100%', transformOrigin: 'left' },
});
