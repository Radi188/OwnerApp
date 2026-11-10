import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInputProps, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Text, TextInput } from '../Text';
import i18n from '../../i18n';
import { colors } from '../../theme';
import { FieldShell } from './FieldShell';

export type InputProps = TextInputProps & {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  /** Ionicons name; `null` hides the automatic icon (phone / email / password). */
  icon?: string | null;
  /** Shown before the value once the label has floated, e.g. "$". */
  prefix?: string;
  /** Shown after the value, e.g. "kWh". */
  suffix?: string;
  /** Show the ✕ clear button while typing (default true for single-line inputs). */
  clearable?: boolean;
};

function inferIcon(p: { keyboardType?: TextInputProps['keyboardType']; secureTextEntry?: boolean; autoComplete?: string }) {
  if (p.secureTextEntry) return 'lock-closed-outline';
  if (p.keyboardType === 'phone-pad' || p.autoComplete === 'tel') return 'call-outline';
  if (p.keyboardType === 'email-address' || p.autoComplete === 'email') return 'mail-outline';
  return undefined;
}

/**
 * The app's text input. Floating label, optional icon / prefix / suffix,
 * clear button, password eye, character counter and inline error.
 * Forwards its ref to the native TextInput (focus(), blur()…).
 */
export const Input = forwardRef<TextInput, InputProps>(function Input({
  label, required, error, hint, icon, prefix, suffix, clearable = true,
  multiline, maxLength, secureTextEntry, value, onChangeText, editable = true,
  onFocus, onBlur, placeholder, style, ...rest
}, ref) {
  const inner = useRef<TextInput>(null);
  useImperativeHandle(ref, () => inner.current as TextInput, []);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);

  const filled = value != null && String(value).length > 0;
  const floated = focused || filled;
  const leading = icon === null ? undefined : icon ?? inferIcon({ keyboardType: rest.keyboardType, secureTextEntry, autoComplete: rest.autoComplete });
  const showClear = clearable && focused && filled && editable && !multiline && !secureTextEntry;

  const right = (showClear || secureTextEntry || suffix) ? (
    <View style={styles.right}>
      {suffix ? <Text style={styles.affix}>{suffix}</Text> : null}
      {showClear ? (
        <TouchableOpacity onPress={() => onChangeText?.('')} hitSlop={10} accessibilityLabel={i18n.t('form.clear')}>
          <Icon name="close-circle" size={18} color={colors.muted} />
        </TouchableOpacity>
      ) : null}
      {secureTextEntry ? (
        <TouchableOpacity
          onPress={() => setHidden(h => !h)}
          hitSlop={10}
          accessibilityLabel={hidden ? i18n.t('form.showPassword') : i18n.t('form.hidePassword')}
        >
          <Icon name={hidden ? 'eye-outline' : 'eye-off-outline'} size={19} color={colors.muted} />
        </TouchableOpacity>
      ) : null}
    </View>
  ) : undefined;

  return (
    <FieldShell
      label={label}
      required={required}
      error={error}
      hint={hint}
      counter={maxLength && multiline ? `${String(value ?? '').length}/${maxLength}` : undefined}
      focused={focused}
      filled={filled}
      multiline={multiline}
      disabled={!editable}
      icon={leading}
      right={right}
      onPress={() => inner.current?.focus()}
    >
      <View style={[styles.row, multiline && styles.rowMulti]}>
        {prefix && (floated || !label) ? <Text style={[styles.affix, focused && { color: colors.primary }]}>{prefix}</Text> : null}
        <TextInput
          ref={inner}
          placeholderTextColor={colors.muted}
          {...rest}
          // With a floating label the placeholder only appears once the label has moved up
          placeholder={label && !focused ? undefined : placeholder}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          maxLength={maxLength}
          multiline={multiline}
          secureTextEntry={secureTextEntry && hidden}
          onFocus={e => { setFocused(true); onFocus?.(e); }}
          onBlur={e => { setFocused(false); onBlur?.(e); }}
          style={[styles.input, !label && styles.inputPlain, multiline && styles.inputMulti, style]}
        />
      </View>
    </FieldShell>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowMulti: { alignItems: 'flex-start' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, minWidth: 0, fontSize: 15, color: colors.ink, paddingVertical: 0, paddingHorizontal: 0 },
  inputPlain: { paddingVertical: Platform.OS === 'ios' ? 16 : 12 },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  affix: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
});
