import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Text } from '../Text';
import { Sheet } from '../Sheet';
import i18n from '../../i18n';
import { colors, radius } from '../../theme';
import { FieldShell } from './FieldShell';
import { Input } from './Input';

export type SelectOption<T> = { label: string; value: T; subtitle?: string; count?: number };

export type SelectProps<T extends string | number> = {
  label?: string;
  value: T | null | undefined;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  /** Always show the search box in the sheet (auto when > 8 options). */
  searchable?: boolean;
  disabled?: boolean;
  /** Ionicons name shown on the left. */
  icon?: string;
  /**
   * `chips`  — one-tap pills (default for ≤ 4 short options)
   * `sheet`  — floating-label field that opens a bottom sheet (default otherwise)
   */
  variant?: 'chips' | 'sheet';
};

/** The app's picker: same floating-label field as <Input>, opening a searchable bottom sheet. */
export function Select<T extends string | number>({
  label, value, options, onChange, placeholder, required, error, hint, searchable, disabled, icon, variant,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = options.find(o => o.value === value);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter(o => o.label.toLowerCase().includes(s) || (o.subtitle ?? '').toLowerCase().includes(s));
  }, [q, options]);

  const chips = variant === 'chips' || (
    variant !== 'sheet' && !searchable && options.length > 0 && options.length <= 4 &&
    options.every(o => o.label.length <= 16 && !o.subtitle)
  );

  // ── Chips ──────────────────────────────────────────────────────────────────
  if (chips) {
    return (
      <View style={styles.chipsWrap}>
        {label ? (
          <Text style={styles.chipsLabel}>
            {label}{required ? <Text style={{ color: colors.danger }}> *</Text> : null}
          </Text>
        ) : null}
        <View style={styles.chips}>
          {options.map(o => {
            const active = o.value === value;
            return (
              <Pressable
                key={String(o.value)}
                onPress={() => !disabled && onChange(o.value)}
                style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.7 }, disabled && { opacity: 0.5 }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, disabled }}
              >
                <View style={[styles.chipRadio, active && styles.chipRadioActive]}>
                  {active ? <Icon name="checkmark" size={11} color={colors.white} /> : null}
                </View>
                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {error ? (
          <View style={styles.msgRow}>
            <Icon name="alert-circle" size={13} color={colors.danger} />
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : hint ? <Text style={[styles.hint, styles.msgRow]}>{hint}</Text> : null}
      </View>
    );
  }

  // ── Sheet ──────────────────────────────────────────────────────────────────
  const close = () => { setOpen(false); setQ(''); };
  const showSearch = searchable || options.length > 8;

  return (
    <>
      <FieldShell
        label={label}
        required={required}
        error={error}
        hint={hint}
        focused={open}
        filled={!!selected}
        disabled={disabled}
        icon={icon}
        onPress={() => setOpen(true)}
        right={<Icon name="chevron-down" size={18} color={open ? colors.primary : colors.muted} />}
      >
        {selected ? (
          <View>
            <Text style={styles.value} numberOfLines={1}>{selected.label}</Text>
            {selected.subtitle && !label ? <Text style={styles.valueSub} numberOfLines={1}>{selected.subtitle}</Text> : null}
          </View>
        ) : !label ? (
          <Text style={[styles.value, styles.placeholder]} numberOfLines={1}>{placeholder ?? i18n.t('form.select')}</Text>
        ) : null}
      </FieldShell>

      <Sheet visible={open} onClose={close} title={label ?? placeholder ?? i18n.t('form.select')}>
        {showSearch ? (
          <Input
            icon="search"
            placeholder={i18n.t('form.search')}
            value={q}
            onChangeText={setQ}
            autoCorrect={false}
            autoCapitalize="none"
          />
        ) : null}

        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="search-outline" size={22} color={colors.muted} />
            <Text style={styles.emptyText}>{i18n.t('form.noOptions')}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {/* Plain map (not FlatList): the Sheet already scrolls and nested VirtualizedLists warn */}
            {filtered.map((item, i) => {
              const active = item.value === value;
              return (
                <Pressable
                  key={String(item.value)}
                  style={({ pressed }) => [styles.option, i > 0 && styles.optionSep, active && styles.optionActive, pressed && !active && styles.optionPressed]}
                  onPress={() => { onChange(item.value); close(); }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.optionText, active && styles.optionTextActive]} numberOfLines={1}>{item.label}</Text>
                    {item.subtitle ? <Text style={styles.optionSub} numberOfLines={1}>{item.subtitle}</Text> : null}
                  </View>
                  {item.count != null ? <Text style={styles.optionCount}>{item.count}</Text> : null}
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active ? <Icon name="checkmark" size={13} color={colors.white} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  value: { fontSize: 15, color: colors.ink },
  valueSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  placeholder: { color: colors.muted },

  // Chips
  chipsWrap: { marginBottom: 14 },
  chipsLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 8, paddingHorizontal: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingLeft: 12, paddingRight: 16,
    borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipRadio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  chipRadioActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: '600' },
  msgRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, paddingHorizontal: 4 },
  error: { flex: 1, fontSize: 12, fontWeight: '500', color: colors.danger },
  hint: { fontSize: 12, color: colors.muted },

  // Sheet list
  list: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.divider, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, backgroundColor: colors.surface },
  optionSep: { borderTopWidth: 1, borderTopColor: colors.divider },
  optionActive: { backgroundColor: colors.primarySoft },
  optionPressed: { backgroundColor: colors.surfaceAlt },
  optionText: { fontSize: 15, color: colors.ink },
  optionTextActive: { color: colors.primary, fontWeight: '600' },
  optionSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  optionCount: { fontSize: 12, fontWeight: '600', color: colors.muted },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  emptyText: { fontSize: 13, color: colors.muted },
});
