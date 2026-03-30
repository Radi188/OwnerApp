/**
 * @format
 */

import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';

// Must be registered outside of any component — handles notifications
// received when the app is in the background or killed state.
messaging().setBackgroundMessageHandler(async _remoteMessage => {
  // FCM automatically shows the notification from the data payload.
  // Add any silent data processing here if needed.
});

AppRegistry.registerComponent(appName, () => App);
