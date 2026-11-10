import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

type Props = {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'light' | 'dark';
};

const SIZES = {
  sm: { container: 52 },
  md: { container: 80 },
  lg: { container: 110 },
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ICON_IMAGE = require('../assets/app_icon.png');

export default function AppLogo({ size = 'md' }: Props) {
  const d = SIZES[size];

  return (
    <View style={[styles.wrapper, { width: d.container, height: d.container }]}>
      <Image
        source={ICON_IMAGE}
        style={[
          styles.icon,
          {
            width: d.container,
            height: d.container,
            borderRadius: d.container / 4.5,
          },
        ]}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  icon: {
    overflow: 'hidden',
  },
});
