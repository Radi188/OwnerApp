import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Text, TextInput } from '../Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { colors, font, radius, shadow, spacing, statusTone, Tone, toneColors } from '../../theme';
import { capitalize, initials } from '../../utils/format';
export { Sheet } from '../Sheet';
// Form controls live in components/form — re-exported here under the names screens already use
export { Input as TextField, Select as SelectField, DateField, Input, Select, FieldShell, ImageUpload } from '../form';

// ─── Layout ──────────────────────────────────────────────────────────────────

type ScreenProps = {
  children: React.ReactNode;
  header?: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** Screen sits above the docked tab bar, which already covers the bottom safe area. */
  tabBarSpace?: boolean;
};

export function Screen({
  children, header, scroll = true, refreshing, onRefresh, footer, contentStyle, tabBarSpace,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = 24 + (footer || tabBarSpace ? 0 : insets.bottom);
  return (
    <View style={styles.screen}>
      {header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.screenContent, { paddingBottom: bottomPad }, contentStyle]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={
              onRefresh ? (
                <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
              ) : undefined
            }
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
        )}
        {footer ? (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>{footer}</View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

type HeaderProps = {
  title: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
};

export function Header({ title, subtitle, back = true, onBack, right }: HeaderProps) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        {back ? (
          <TouchableOpacity
            style={styles.headerBack}
            onPress={onBack ?? (() => nav.goBack())}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="chevron-back" size={22} color={colors.ink} />
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.headerRight}>{right}</View> : null}
      </View>
    </View>
  );
}

/** Back chevron for legacy screens; renders nothing when there is no screen to go back to. */
export function BackButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const nav = useNavigation();
  if (!nav.canGoBack()) return null;
  return (
    <TouchableOpacity style={[styles.headerBack, style]} onPress={() => nav.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Icon name="chevron-back" size={22} color={colors.ink} />
    </TouchableOpacity>
  );
}

export function Card({
  children, style, onPress, padded = true,
}: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; padded?: boolean }) {
  const inner = [styles.card, padded && { padding: spacing.lg }, style];
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [inner, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={inner}>{children}</View>;
}

export function SectionTitle({
  title, action, onAction, style,
}: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.sectionTitleRow, style]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

export function Button({
  title, onPress, variant = 'primary', icon, loading, disabled, small, style,
}: {
  title: string; onPress?: () => void; variant?: ButtonVariant; icon?: string;
  loading?: boolean; disabled?: boolean; small?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const v = {
    primary:   { bg: colors.primary,     fg: colors.white,   border: colors.primary },
    secondary: { bg: colors.surface,     fg: colors.ink,     border: colors.border },
    ghost:     { bg: colors.primarySoft, fg: colors.primary, border: colors.primarySoft },
    danger:    { bg: colors.dangerSoft,  fg: colors.danger,  border: colors.dangerSoft },
    success:   { bg: colors.success,     fg: colors.white,   border: colors.success },
  }[variant];
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: v.bg, borderColor: v.border, opacity: isDisabled ? 0.55 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} size="small" />
      ) : (
        <>
          {icon ? <Icon name={icon} size={small ? 15 : 18} color={v.fg} style={{ marginRight: 6 }} /> : null}
          <Text style={[styles.btnText, small && { fontSize: 13 }, { color: v.fg }]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function IconButton({
  icon, onPress, color = colors.ink, bg = colors.surface, size = 20, badge,
}: { icon: string; onPress?: () => void; color?: string; bg?: string; size?: number; badge?: number }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.iconBtn, { backgroundColor: bg }]} activeOpacity={0.75}>
      <Icon name={icon} size={size} color={color} />
      {badge ? (
        <View style={styles.iconBadge}>
          <Text style={styles.iconBadgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export function FAB({ icon = 'add', onPress, label }: { icon?: string; onPress: () => void; label?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.fab, { bottom: insets.bottom + 24 }, label ? { paddingHorizontal: 18 } : { width: 56 }]}
    >
      <Icon name={icon} size={24} color={colors.white} />
      {label ? <Text style={styles.fabLabel}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

// ─── Display ─────────────────────────────────────────────────────────────────

export function Badge({ label, tone, status }: { label?: string; tone?: Tone; status?: string | null }) {
  const t = toneColors[tone ?? statusTone(status)];
  const text = label ?? capitalize(status ?? '');
  if (!text) return null;
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <View style={[styles.badgeDot, { backgroundColor: t.fg }]} />
      <Text style={[styles.badgeText, { color: t.fg }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

export function Avatar({ name, size = 44, tone = 'primary' }: { name?: string | null; size?: number; tone?: Tone }) {
  const t = toneColors[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2.6, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: t.fg, fontWeight: '700', fontSize: size * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}

export function IconTile({ icon, tone = 'primary', size = 40 }: { icon: string; tone?: Tone; size?: number }) {
  const t = toneColors[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3.2, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size * 0.5} color={t.fg} />
    </View>
  );
}

export function ListRow({
  title, subtitle, meta, left, right, onPress, chevron = !!onPress, style,
}: {
  title: string; subtitle?: string; meta?: string; left?: React.ReactNode; right?: React.ReactNode;
  onPress?: () => void; chevron?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const content = (
    <>
      {left ? <View style={{ marginRight: 12 }}>{left}</View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
        {meta ? <Text style={styles.rowMeta} numberOfLines={1}>{meta}</Text> : null}
      </View>
      {right ? <View style={{ marginLeft: 10, alignItems: 'flex-end' }}>{right}</View> : null}
      {chevron ? <Icon name="chevron-forward" size={18} color={colors.muted} style={{ marginLeft: 6 }} /> : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.row, style, pressed && { backgroundColor: colors.surfaceAlt }]}>
        {content}
      </Pressable>
    );
  }
  return <View style={[styles.row, style]}>{content}</View>;
}

export function StatTile({
  label, value, icon, tone = 'primary', hint, style, onPress,
}: { label: string; value: string | number; icon?: string; tone?: Tone; hint?: string; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  return (
    <Card style={[styles.statTile, style]} onPress={onPress}>
      {icon ? <IconTile icon={icon} tone={tone} size={34} /> : null}
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      {hint ? <Text style={[styles.statHint, { color: toneColors[tone].fg }]} numberOfLines={1}>{hint}</Text> : null}
    </Card>
  );
}

export function KeyValue({ label, value, strong }: { label: string; value?: React.ReactNode; strong?: boolean }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' || value == null ? (
        <Text style={[styles.kvValue, strong && { fontWeight: '800', color: colors.ink }]} numberOfLines={2}>
          {value === '' || value == null ? '—' : String(value)}
        </Text>
      ) : value}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: colors.divider }, style]} />;
}

export function LoadingView({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} size="large" />
      {label ? <Text style={[font.caption, { marginTop: 10 }]}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({
  icon = 'file-tray-outline', title, message, actionLabel, onAction,
}: { icon?: string; title: string; message?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Icon name={icon} size={30} color={colors.primary} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMsg}>{message}</Text> : null}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} small style={{ marginTop: 14 }} /> : null}
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState icon="cloud-offline-outline" title="Couldn't load data" message={message} actionLabel={onRetry ? 'Try again' : undefined} onAction={onRetry} />
  );
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

export function SearchBar({ value, onChangeText, placeholder = 'Search…', style }: {
  value: string; onChangeText: (s: string) => void; placeholder?: string; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.search, style]}>
      <Icon name="search" size={18} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {value ? (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="close-circle" size={18} color={colors.muted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export type Option<T = string> = { label: string; value: T; subtitle?: string; count?: number };

export function FilterChips<T extends string | number>({
  options, value, onChange, style,
}: { options: Option<T>[]; value: T; onChange: (v: T) => void; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ gap: 8, paddingRight: 16 }, style]}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            style={[styles.chip, active && styles.chipActive]}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
            {o.count != null ? (
              <View style={[styles.chipCount, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                <Text style={[styles.chipCountText, active && { color: colors.white }]}>{o.count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─── Form controls ───────────────────────────────────────────────────────────
// TextField / SelectField / DateField now live in components/form (re-exported above).
// Segmented and SwitchRow stay here.

export function Segmented<T extends string>({
  options, value, onChange, style,
}: { options: Option<T>[]; value: T; onChange: (v: T) => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[fs.segment, style]}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={[fs.segmentItem, active && fs.segmentItemActive]}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[fs.segmentText, active && fs.segmentTextActive]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SwitchRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const anim = React.useRef(new Animated.Value(value ? 1 : 0)).current;
  React.useEffect(() => {
    Animated.spring(anim, { toValue: value ? 1 : 0, useNativeDriver: false, damping: 18, stiffness: 260 }).start();
  }, [value, anim]);
  const bg = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.border, colors.primary] });
  const x = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 20] });

  return (
    <Pressable
      style={({ pressed }) => [fs.switchRow, pressed && { opacity: 0.85 }]}
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={fs.switchLabel}>{label}</Text>
        {hint ? <Text style={fs.switchHint}>{hint}</Text> : null}
      </View>
      <Animated.View style={[fs.toggle, { backgroundColor: bg }]}>
        <Animated.View style={[fs.knob, { transform: [{ translateX: x }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const fs = StyleSheet.create({
  // Segmented
  segment: { flexDirection: 'row', backgroundColor: colors.divider, borderRadius: 12, padding: 3 },
  segmentItem: { flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentItemActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  segmentTextActive: { color: colors.ink, fontWeight: '600' },

  // Switch
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, marginBottom: 4 },
  switchLabel: { fontSize: 15, fontWeight: '600', color: colors.ink },
  switchHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  toggle: { width: 50, height: 30, borderRadius: 15, padding: 3, justifyContent: 'center' },
  knob: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: colors.white,
    shadowColor: '#0F172A', shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
});

// ─── Charts (pure views) ─────────────────────────────────────────────────────

export function BarChart({
  data, height = 140, color = colors.primary, format = (n: number) => String(n),
}: { data: { label: string; value: number }[]; height?: number; color?: string; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map(d => d.value));
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);
  return (
    <View>
      <View style={[styles.barRow, { height }]}>
        {data.map((d, i) => {
          const h = Math.max(4, (d.value / max) * (height - 22));
          return (
            <View key={d.label + i} style={styles.barCol}>
              {i === peak && d.value > 0 ? (
                <Text style={[styles.barPeak, { bottom: h + 4 }]} numberOfLines={1}>{format(d.value)}</Text>
              ) : null}
              <View style={[styles.bar, { height: h, backgroundColor: i === peak ? color : color + '55' }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.barLabels}>
        {data.map((d, i) => <Text key={d.label + i} style={styles.barLabel} numberOfLines={1}>{d.label}</Text>)}
      </View>
    </View>
  );
}

export function ProgressBar({ value, color = colors.primary, track = colors.divider, height = 8 }: { value: number; color?: string; track?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, value || 0));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color, borderRadius: height }} />
    </View>
  );
}

export function SegmentBar({ segments, height = 12 }: { segments: { label: string; value: number; color: string }[]; height?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <View>
      <View style={{ flexDirection: 'row', height, borderRadius: height, overflow: 'hidden', backgroundColor: colors.divider }}>
        {segments.filter(s => s.value > 0).map(s => (
          <View key={s.label} style={{ flex: s.value / total, backgroundColor: s.color }} />
        ))}
      </View>
      <View style={styles.legend}>
        {segments.map(s => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={styles.legendText}>{s.label}</Text>
            <Text style={styles.legendValue}>{s.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function confirmAction(title: string, message: string, onConfirm: () => void, confirmText = 'Delete') {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmText, style: 'destructive', onPress: onConfirm },
  ]);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: { padding: spacing.lg },
  footer: {
    paddingHorizontal: spacing.lg, paddingTop: 12, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.divider, flexDirection: 'row', gap: 10,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, minHeight: 240 },

  header: { backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  headerBack: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center',
    justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: colors.divider,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  headerSubtitle: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },

  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.divider },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.md },
  sectionTitle: { ...font.h3 },
  sectionAction: { color: colors.primary, fontWeight: '700', fontSize: 13 },

  btn: {
    height: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 18, borderWidth: 1,
  },
  btnSmall: { height: 38, paddingHorizontal: 14, borderRadius: 10 },
  btnText: { fontSize: 15, fontWeight: '700' },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  iconBadge: {
    position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface,
  },
  iconBadgeText: { color: colors.white, fontSize: 9, fontWeight: '800' },
  fab: {
    position: 'absolute', right: 20, height: 56, borderRadius: 18, backgroundColor: colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', ...shadow.raised,
  },
  fabLabel: { color: colors.white, fontWeight: '700', fontSize: 15, marginLeft: 6 },

  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: spacing.lg, backgroundColor: colors.surface },
  rowTitle: { ...font.bodyStrong, fontSize: 15, color: colors.ink },
  rowSubtitle: { ...font.caption, marginTop: 2 },
  rowMeta: { ...font.tiny, marginTop: 4 },

  statTile: { flex: 1, padding: 14, minWidth: 0 },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.ink, marginTop: 10, letterSpacing: -0.4 },
  statLabel: { ...font.caption, marginTop: 2 },
  statHint: { fontSize: 11, fontWeight: '700', marginTop: 4 },

  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, gap: 12 },
  kvLabel: { ...font.caption, flexShrink: 0 },
  kvValue: { ...font.bodyStrong, flex: 1, textAlign: 'right' },

  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { ...font.h3, textAlign: 'center' },
  emptyMsg: { ...font.caption, textAlign: 'center', marginTop: 6, lineHeight: 18 },

  search: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 14,
    paddingHorizontal: 14, height: 48, borderWidth: 1.5, borderColor: colors.border, gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, paddingVertical: 0 },

  chip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 36, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: colors.white },
  chipCount: { marginLeft: 6, backgroundColor: colors.divider, borderRadius: 10, paddingHorizontal: 6, minWidth: 20, alignItems: 'center' },
  chipCountText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },






  barRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '70%', borderRadius: 6, maxWidth: 28 },
  // Absolutely positioned so the value label isn't clipped to the (narrow) bar column width
  barPeak: { position: 'absolute', width: 60, left: '50%', marginLeft: -30, textAlign: 'center', fontSize: 10, fontWeight: '800', color: colors.ink },
  barLabels: { flexDirection: 'row', gap: 6, marginTop: 6 },
  barLabel: { flex: 1, textAlign: 'center', fontSize: 10, color: colors.muted, fontWeight: '600' },

  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendText: { fontSize: 12, color: colors.textSecondary, marginRight: 4 },
  legendValue: { fontSize: 12, fontWeight: '800', color: colors.ink },
});
