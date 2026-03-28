import React, { useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  Animated,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TAB_COUNT       = 5;
const TAB_WIDTH       = SCREEN_WIDTH / TAB_COUNT;
const BAR_HEIGHT      = 64;
const INDICATOR_WIDTH = 32;

const ACTIVE_COLOR   = '#6366F1';
const INACTIVE_COLOR = '#9CA3AF';

// Unread badge counts (mock)
const BADGES: Record<string, number> = {
  Requests:      4,
  Notifications: 2,
};

type TabConfig = {
  icon:       string;
  activeIcon: string;
  labelKey:   string;
};

const TABS: TabConfig[] = [
  { icon: 'grid-outline',          activeIcon: 'grid',          labelKey: 'tab.dashboard'     },
  { icon: 'construct-outline',     activeIcon: 'construct',     labelKey: 'tab.requests'      },
  { icon: 'notifications-outline', activeIcon: 'notifications', labelKey: 'tab.notifications' },
  { icon: 'people-outline',        activeIcon: 'people',        labelKey: 'tab.tenants'       },
  { icon: 'person-outline',        activeIcon: 'person',        labelKey: 'tab.profile'       },
];

const indicatorCenter = (index: number) =>
  index * TAB_WIDTH + TAB_WIDTH / 2 - INDICATOR_WIDTH / 2;

export default function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const { t }  = useTranslation();
  const insets = useSafeAreaInsets();

  const indicatorX = useRef(
    new Animated.Value(indicatorCenter(state.index)),
  ).current;

  const activeAnims = useRef(
    state.routes.map((_, i) => new Animated.Value(i === state.index ? 1 : 0)),
  ).current;

  const handlePress = (index: number) => {
    const route    = state.routes[index];
    const isFocused = state.index === index;

    if (!isFocused) {
      // Instantly reset all other tabs
      state.routes.forEach((_, i) => {
        if (i !== index) {
          activeAnims[i].stopAnimation();
          activeAnims[i].setValue(0);
        }
      });

      // Spring-animate the newly active tab
      Animated.spring(activeAnims[index], {
        toValue:       1,
        useNativeDriver: false,
        damping:   14,
        stiffness: 200,
        mass:      0.7,
      }).start();

      // Slide the indicator
      Animated.spring(indicatorX, {
        toValue:       indicatorCenter(index),
        useNativeDriver: true,
        damping:   20,
        stiffness: 220,
        mass:      0.8,
      }).start();
    }

    const event = navigation.emit({
      type:               'tabPress',
      target:             route.key,
      canPreventDefault:  true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  const handleLongPress = (index: number) => {
    navigation.emit({
      type:   'tabLongPress',
      target: state.routes[index].key,
    });
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* Sliding pill indicator */}
      <Animated.View
        style={[styles.indicator, { transform: [{ translateX: indicatorX }] }]}
      />

      <View style={styles.tabs}>
        {state.routes.map((route, index) => {
          const isFocused  = state.index === index;
          const tab        = TABS[index];
          const badgeCount = BADGES[route.name] ?? 0;

          const scale = activeAnims[index].interpolate({
            inputRange:  [0, 1],
            outputRange: [1, 1.22],
          });

          const iconColor = activeAnims[index].interpolate({
            inputRange:  [0, 1],
            outputRange: [INACTIVE_COLOR, ACTIVE_COLOR],
          });

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={t(tab.labelKey)}
              onPress={() => handlePress(index)}
              onLongPress={() => handleLongPress(index)}
              style={styles.tab}
              activeOpacity={1}
            >
              <Animated.View style={[styles.tabContent, { transform: [{ scale }] }]}>
                {/* Icon + badge wrapper */}
                <View>
                  <Icon
                    name={isFocused ? tab.activeIcon : tab.icon}
                    size={22}
                    color={isFocused ? ACTIVE_COLOR : INACTIVE_COLOR}
                  />
                  {badgeCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {badgeCount > 9 ? '9+' : badgeCount}
                      </Text>
                    </View>
                  )}
                </View>

                <Animated.Text numberOfLines={1} style={[styles.label, { color: iconColor }]}>
                  {t(tab.labelKey)}
                </Animated.Text>
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderTopWidth:  StyleSheet.hairlineWidth,
    borderTopColor:  '#E5E7EB',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: -4 },
    shadowOpacity:   0.06,
    shadowRadius:    16,
    elevation:       16,
  },
  indicator: {
    position:              'absolute',
    top:                   0,
    width:                 INDICATOR_WIDTH,
    height:                3,
    backgroundColor:       ACTIVE_COLOR,
    borderBottomLeftRadius:  3,
    borderBottomRightRadius: 3,
  },
  tabs: {
    flexDirection: 'row',
    height:        BAR_HEIGHT,
  },
  tab: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
  },
  tabContent: {
    alignItems:     'center',
    justifyContent: 'center',
    gap:            3,
  },
  label: {
    fontSize:      9,
    fontWeight:    '500',
    letterSpacing: 0.1,
  },
  badge: {
    position:        'absolute',
    top:             -4,
    right:           -8,
    minWidth:        15,
    height:          15,
    borderRadius:    8,
    backgroundColor: '#EF4444',
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: 3,
    borderWidth:     1.5,
    borderColor:     '#FFFFFF',
  },
  badgeText: { fontSize: 8, fontWeight: '700', color: '#FFFFFF' },
});
