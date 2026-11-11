import React from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  /** Length of each ray; the component is a 2·radius square centred on the sun. */
  radius: number;
  rays?: number;
  /** Ray opacity (alternate rays use ~60 % of it). */
  intensity?: number;
};

/**
 * Soft light rays radiating from a point — echoes the sunray gable in the Pteah logo.
 * Static on its own; wrap it in an Animated.View to rotate / fade it.
 */
export default function Sunburst({ radius, rays = 12, intensity = 0.06 }: Props) {
  const half = radius * Math.tan(Math.PI / rays / 2.2);
  const bright = { borderTopColor: `rgba(255,255,255,${intensity})` };
  const dim = { borderTopColor: `rgba(255,255,255,${intensity * 0.6})` };

  return (
    <View pointerEvents="none" style={{ width: radius * 2, height: radius * 2 }}>
      {Array.from({ length: rays }).map((_, i) => (
        <View key={i} style={[StyleSheet.absoluteFill, styles.wrap, { transform: [{ rotate: `${(360 / rays) * i}deg` }] }]}>
          <View
            style={[
              styles.ray,
              i % 2 ? dim : bright,
              { borderLeftWidth: half, borderRightWidth: half, borderTopWidth: radius },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  ray: { width: 0, height: 0, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
});
