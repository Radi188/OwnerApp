import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

export type DonutSlice = { key: string; value: number; color: string };

/**
 * Donut / pie chart drawn with plain Views (no react-native-svg needed).
 *
 * Each wedge ≤ 180° is a half-disc rotated inside a right-half clip; larger wedges are split in two.
 * Set `thickness` to `size / 2` for a full pie.
 */
export default function DonutChart({
  data, size = 132, thickness = 18, track = colors.divider, center,
}: { data: DonutSlice[]; size?: number; thickness?: number; track?: string; center?: React.ReactNode }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);

  // Expand slices into ≤180° wedges with a start angle
  const wedges: { start: number; sweep: number; color: string; key: string }[] = [];
  let angle = 0;
  if (total > 0) {
    data.forEach(d => {
      let sweep = (Math.max(0, d.value) / total) * 360;
      let part = 0;
      while (sweep > 0.01) {
        const s = Math.min(180, sweep);
        wedges.push({ start: angle, sweep: s, color: d.color, key: `${d.key}-${part++}` });
        angle += s;
        sweep -= s;
      }
    });
  }

  const half = size / 2;
  const inner = size - thickness * 2;

  return (
    <View style={{ width: size, height: size }}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: half, backgroundColor: track }]} />
      {wedges.map(w => (
        <View key={w.key} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${w.start}deg` }] }]}>
          {/* Clip to the right half of the circle */}
          <View style={{ position: 'absolute', left: half, top: 0, width: half, height: size, overflow: 'hidden' }}>
            {/* Full-size layer rotated around the circle's centre, carrying a left half-disc */}
            <View style={{ position: 'absolute', left: -half, top: 0, width: size, height: size, transform: [{ rotate: `${w.sweep}deg` }] }}>
              <View
                style={{
                  width: half, height: size, backgroundColor: w.color,
                  borderTopLeftRadius: half, borderBottomLeftRadius: half,
                }}
              />
            </View>
          </View>
        </View>
      ))}
      {inner > 0 ? (
        <View
          style={{
            position: 'absolute', left: thickness, top: thickness, width: inner, height: inner,
            borderRadius: inner / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
          }}
        >
          {center}
        </View>
      ) : null}
    </View>
  );
}
