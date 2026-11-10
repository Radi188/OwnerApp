import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './Text';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { useBadges } from '../context/BadgeContext';
import { colors } from '../theme';

const TABS: Record<string, { icon: string; activeIcon: string; labelKey: string }> = {
  Home:    { icon: 'home-outline',    activeIcon: 'home',    labelKey: 'tab.home' },
  Units:   { icon: 'business-outline', activeIcon: 'business', labelKey: 'tab.units' },
  Tenants: { icon: 'people-outline',  activeIcon: 'people',  labelKey: 'tab.tenants' },
  Billing: { icon: 'receipt-outline', activeIcon: 'receipt', labelKey: 'tab.billing' },
  More:    { icon: 'grid-outline',    activeIcon: 'grid',    labelKey: 'tab.more' },
};

/**
 * Tab bar docked to the bottom edge (not floating). It sits in the layout flow, so
 * React Navigation shrinks the screen above it and content never scrolls underneath.
 */
export default function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { requestCount } = useBadges();

  const badges: Record<string, number> = { More: requestCount };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        const cfg = TABS[route.name] ?? { icon: 'ellipse-outline', activeIcon: 'ellipse', labelKey: route.name };
        const focused = state.index === index;
        const tint = focused ? colors.primary : colors.muted;
        const badge = badges[route.name] ?? 0;
        const label = t(cfg.labelKey, { defaultValue: route.name });

        const onPress = () => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={label}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            style={styles.tab}
            activeOpacity={0.6}
          >
            <View>
              <Icon name={focused ? cfg.activeIcon : cfg.icon} size={23} color={tint} />
              {badge > 0 ? (
                <View style={styles.badge}><Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text></View>
              ) : null}
            </View>
            <Text style={[styles.label, { color: tint }, focused && styles.labelActive]} numberOfLines={1}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', backgroundColor: colors.surface, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  label: { fontSize: 11, fontWeight: '500', marginTop: 3 },
  labelActive: { fontWeight: '700' },
  badge: {
    position: 'absolute', top: -4, right: -10, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.surface,
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: colors.white },
});
