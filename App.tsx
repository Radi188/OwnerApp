import React, { useEffect } from 'react';
import { StatusBar, View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './src/i18n';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { BadgeProvider, useBadges } from './src/context/BadgeContext';
import AppNavigator from './src/navigation/AppNavigator';
import QuickLoginModal from './src/components/QuickLoginModal';
import { ToastHost } from './src/components/Toast';
import { navigate, openNotificationTarget } from './src/navigation/navigationRef';
import {
  requestNotificationPermission,
  getFCMToken,
  onForegroundMessage,
  onNotificationOpenedApp,
  getInitialNotification,
} from './src/services/notifications';
import { deviceApi } from './src/services/api';

function PushNotificationSetup() {
  const { isAuthenticated } = useAuth();
  const { refreshBadges } = useBadges();

  // Request permission + register FCM token with backend once authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    (async () => {
      const granted = await requestNotificationPermission();
      if (!granted) return;

      const token = await getFCMToken();
      if (token) {
        deviceApi.registerToken(token).catch(() => {});
      }
    })();
  }, [isAuthenticated]);

  // Foreground message handler — refresh badge counts
  useEffect(() => {
    const unsubscribe = onForegroundMessage(_message => {
      refreshBadges();
    });
    return unsubscribe;
  }, [refreshBadges]);

  // Notification tap while app is in background
  useEffect(() => {
    const unsubscribe = onNotificationOpenedApp(message => {
      // A pending tenant payment opens the payment so it can be verified
      if (!openNotificationTarget(message?.data?.type as string, message?.data)) navigate('Notifications');
    });
    return unsubscribe;
  }, []);

  // Notification tap when app was fully quit (killed state)
  useEffect(() => {
    getInitialNotification().then(message => {
      if (message && !openNotificationTarget(message.data?.type as string, message.data)) {
        navigate('Notifications');
      }
    });
  }, []);

  return null;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <BadgeProvider>
          <View style={styles.root}>
            <StatusBar barStyle="dark-content" backgroundColor="#F4F6F8" translucent={false} />
            <AppNavigator />
            <QuickLoginModal />
            <PushNotificationSetup />
            <ToastHost />
          </View>
        </BadgeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6F8' },
});
