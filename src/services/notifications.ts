import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { Platform } from 'react-native';

export async function requestNotificationPermission(): Promise<boolean> {
  const authStatus = await messaging().requestPermission();
  return (
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL
  );
}

export async function getFCMToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'ios') {
      await messaging().registerDeviceForRemoteMessages();
    }
    const token = await messaging().getToken();
    return token;
  } catch {
    return null;
  }
}

export function onForegroundMessage(
  handler: (message: FirebaseMessagingTypes.RemoteMessage) => void,
) {
  return messaging().onMessage(handler);
}

export function onNotificationOpenedApp(
  handler: (message: FirebaseMessagingTypes.RemoteMessage) => void,
) {
  return messaging().onNotificationOpenedApp(handler);
}

export async function getInitialNotification(): Promise<FirebaseMessagingTypes.RemoteMessage | null> {
  return messaging().getInitialNotification();
}
