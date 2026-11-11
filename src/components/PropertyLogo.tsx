import React, { useEffect, useState } from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Text } from './Text';
import { fileUrl } from '../services/api';
import { colors } from '../theme';
import { initials } from '../utils/format';

/**
 * A property's logo (`property.logo`, or a just-picked local file `uri`). Falls back to the
 * property's initials on an indigo tile when there is no logo or it fails to load.
 */
export default function PropertyLogo({
  logo, uri, name, size = 40, style,
}: {
  /** Server path from the API, e.g. "rental/images/properties/…jpeg?exp=…&sig=…". */
  logo?: string | null;
  /** A local image uri (preview before upload) — wins over `logo`. */
  uri?: string | null;
  name?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const src = uri || fileUrl(logo ?? undefined);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  const radius = Math.round(size * 0.28);
  const box = { width: size, height: size, borderRadius: radius };

  if (src && !failed) {
    return (
      <View style={[styles.frame, box, style]}>
        <Image source={{ uri: src }} style={box} resizeMode="cover" onError={() => setFailed(true)} accessibilityLabel={name ?? 'Property logo'} />
      </View>
    );
  }
  return (
    <View style={[styles.fallback, box, style]}>
      <Text style={[styles.initials, { fontSize: Math.max(11, size * 0.36) }]}>{initials(name ?? '') || '·'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  fallback: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '800', color: colors.primary },
});
