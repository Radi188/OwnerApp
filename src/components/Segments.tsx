import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Text } from './Text';
import { colors } from '../theme';

export type SegmentOption<T extends string> = { value: T; label: string; count?: number };

/** Equal-width segmented control with optional counts (iOS-style, flat). */
export default function Segments<T extends string>({ value, onChange, options, style }: {
  value: T; onChange: (v: T) => void; options: SegmentOption<T>[]; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.wrap, style]}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.item, active && styles.itemActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.text, active && styles.textActive]} numberOfLines={1} adjustsFontSizeToFit>
              {o.label}
              {o.count != null ? <Text style={[styles.count, active && styles.textActive]}>  {o.count}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: colors.divider, borderRadius: 12, padding: 3 },
  item: { flex: 1, minWidth: 0, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  itemActive: { backgroundColor: colors.surface },
  text: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  textActive: { color: colors.ink, fontWeight: '600' },
  count: { fontSize: 12, fontWeight: '500', color: colors.muted },
});
