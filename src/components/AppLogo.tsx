import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { colors } from '../theme';

type Props = {
  size?: 'sm' | 'md' | 'lg';
  /**
   * - `dark`  — for indigo / dark backgrounds: white Pteah symbol, no container
   *             (brand guide: "white logo on Pteah Indigo").
   * - `light` — for white / light backgrounds: the indigo app-icon tile.
   * - `mark`  — for white / light backgrounds: indigo symbol, no container.
   */
  variant?: 'light' | 'dark' | 'mark';
};

const SIZES = {
  sm: 52,
  md: 80,
  lg: 110,
};

const SYMBOL_WHITE = require('../assets/brand/pteah-symbol-white.png');
const SYMBOL_INDIGO = require('../assets/brand/pteah-symbol.png');
const APP_ICON = require('../assets/brand/pteah-app-icon.png');

export default function AppLogo({ size = 'md', variant = 'light' }: Props) {
  const d = SIZES[size];

  if (variant === 'light') {
    return (
      <View style={[styles.tileShadow, { width: d, height: d }]}>
        <Image
          source={APP_ICON}
          style={{ width: d, height: d }}
          resizeMode="contain"
          accessibilityLabel="Pteah Manager"
        />
      </View>
    );
  }

  return (
    <Image
      source={variant === 'dark' ? SYMBOL_WHITE : SYMBOL_INDIGO}
      style={{ width: d, height: d }}
      resizeMode="contain"
      accessibilityLabel="Pteah Manager"
    />
  );
}

const styles = StyleSheet.create({
  tileShadow: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
});
