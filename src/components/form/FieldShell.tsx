import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Text } from '../Text';
import { colors } from '../../theme';

export const FIELD_HEIGHT = 58;

// Animated version of our Khmer-aware Text, so the floating label keeps the right font
const AnimatedText = Animated.createAnimatedComponent(Text);

export type FieldShellProps = {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  /** Shown bottom-right, e.g. "45/200". */
  counter?: string;
  /** Field currently has keyboard focus (or its picker is open). */
  focused: boolean;
  /** Field has a value — keeps the label floated. */
  filled: boolean;
  multiline?: boolean;
  disabled?: boolean;
  /** Ionicons name shown on the left. */
  icon?: string;
  /** Accessories on the right (clear, eye, chevron, suffix…). */
  right?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * The one field look used by every input in the app:
 * a white rounded box whose label sits inside like a placeholder and floats up
 * (smaller, teal) when the field is focused or filled. Red when invalid.
 */
export function FieldShell({
  label, required, error, hint, counter, focused, filled, multiline, disabled, icon, right, onPress, style, children,
}: FieldShellProps) {
  const floated = focused || filled;
  const anim = useRef(new Animated.Value(floated ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: floated ? 1 : 0, duration: 160, useNativeDriver: true }).start();
  }, [floated, anim]);

  const labelColor = error ? colors.danger : focused ? colors.primary : colors.muted;
  const iconColor = error ? colors.danger : focused ? colors.primary : colors.muted;

  return (
    <View style={[styles.wrap, style]}>
      <Pressable
        onPress={onPress}
        disabled={disabled || !onPress}
        style={[
          styles.box,
          multiline && styles.boxMultiline,
          focused && styles.boxFocused,
          !!error && styles.boxError,
          disabled && styles.boxDisabled,
        ]}
      >
        {icon ? <Icon name={icon} size={19} color={iconColor} style={multiline ? styles.iconTop : undefined} /> : null}

        <View style={[styles.content, label ? (multiline ? styles.contentLabelMulti : styles.contentLabel) : styles.contentPlain]}>
          {label ? (
            <View pointerEvents="none" style={styles.labelWrap}>
              <AnimatedText
                numberOfLines={1}
                style={[
                  styles.label,
                  { color: labelColor },
                  {
                    transform: [
                      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -13] }) },
                      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.8] }) },
                    ],
                  },
                ]}
              >
                {label}
                {required ? <Text style={styles.required}> *</Text> : null}
              </AnimatedText>
            </View>
          ) : null}
          {children}
        </View>

        {right}
      </Pressable>

      {error || hint || counter ? (
        <View style={styles.msgRow}>
          {error ? (
            <>
              <Icon name="alert-circle" size={13} color={colors.danger} />
              <Text style={styles.error}>{error}</Text>
            </>
          ) : hint ? <Text style={styles.hint}>{hint}</Text> : <View style={{ flex: 1 }} />}
          {counter ? <Text style={styles.counter}>{counter}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  box: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: FIELD_HEIGHT, paddingHorizontal: 14,
    borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface,
  },
  boxMultiline: { alignItems: 'flex-start', minHeight: 116 },
  boxFocused: {
    borderColor: colors.primary,
    // soft teal glow (iOS); Android keeps the border only
    shadowColor: colors.primary, shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  boxError: { borderColor: colors.danger, backgroundColor: '#FFFBFB' },
  boxDisabled: { backgroundColor: colors.surfaceAlt, opacity: 0.7 },
  iconTop: { marginTop: 19 },

  content: { flex: 1, minWidth: 0, alignSelf: 'stretch' },
  contentPlain: { justifyContent: 'center' },
  contentLabel: { justifyContent: 'flex-end', paddingTop: 24, paddingBottom: 8 },
  contentLabelMulti: { paddingTop: 26, paddingBottom: 12 },

  labelWrap: { position: 'absolute', left: 0, right: 0, top: 0, height: FIELD_HEIGHT - 3, justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '500', alignSelf: 'flex-start', transformOrigin: 'left center' },
  required: { color: colors.danger },

  msgRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, paddingHorizontal: 4 },
  error: { flex: 1, fontSize: 12, fontWeight: '500', color: colors.danger },
  hint: { flex: 1, fontSize: 12, color: colors.muted },
  counter: { fontSize: 11, color: colors.muted },
});
