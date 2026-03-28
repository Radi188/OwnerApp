import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const rnb = new ReactNativeBiometrics({ allowDeviceCredentials: false });

const KEY_BIO_ENABLED  = '@owner:bioEnabled';
const KEY_BIO_USERNAME = '@owner:bioUsername';
const KEY_BIO_PASSWORD = '@owner:bioPassword';
const KEY_BIO_PROP_ID  = '@owner:bioPropId';
const KEY_BIO_PROP_NAME = '@owner:bioPropName';

export type BiometricType = 'FaceID' | 'TouchID' | 'Biometrics' | null;

/** Returns the available biometric type, or null if not available. */
export async function getAvailableBiometricType(): Promise<BiometricType> {
  try {
    const { available, biometryType } = await rnb.isSensorAvailable();
    if (!available) return null;
    if (biometryType === BiometryTypes.FaceID)   return 'FaceID';
    if (biometryType === BiometryTypes.TouchID)   return 'TouchID';
    if (biometryType === BiometryTypes.Biometrics) return 'Biometrics';
    return null;
  } catch {
    return null;
  }
}

/** Prompt biometric authentication. Returns true if passed. */
export async function promptBiometrics(reason: string): Promise<boolean> {
  try {
    const { success } = await rnb.simplePrompt({ promptMessage: reason });
    return success;
  } catch {
    return false;
  }
}

/** Save credentials for biometric login. */
export async function saveBiometricCredentials(
  username: string,
  password: string,
  propertyId?: number,
  propertyName?: string,
): Promise<void> {
  await AsyncStorage.multiSet([
    [KEY_BIO_ENABLED,   'true'],
    [KEY_BIO_USERNAME,  username],
    [KEY_BIO_PASSWORD,  password],
    [KEY_BIO_PROP_ID,   propertyId != null ? String(propertyId) : ''],
    [KEY_BIO_PROP_NAME, propertyName ?? ''],
  ]);
}

/** Load stored biometric credentials. Returns null if not set. */
export async function loadBiometricCredentials(): Promise<{
  username: string;
  password: string;
  propertyId: number | undefined;
  propertyName: string | undefined;
} | null> {
  try {
    const pairs = await AsyncStorage.multiGet([
      KEY_BIO_ENABLED, KEY_BIO_USERNAME, KEY_BIO_PASSWORD, KEY_BIO_PROP_ID, KEY_BIO_PROP_NAME,
    ]);
    const enabled  = pairs[0][1];
    const username = pairs[1][1];
    const password = pairs[2][1];
    const propId   = pairs[3][1];
    const propName = pairs[4][1];
    if (!enabled || !username || !password) return null;
    return {
      username,
      password,
      propertyId:   propId   ? Number(propId) : undefined,
      propertyName: propName || undefined,
    };
  } catch {
    return null;
  }
}

/** Clear stored biometric credentials. */
export async function clearBiometricCredentials(): Promise<void> {
  await AsyncStorage.multiRemove([
    KEY_BIO_ENABLED, KEY_BIO_USERNAME, KEY_BIO_PASSWORD, KEY_BIO_PROP_ID, KEY_BIO_PROP_NAME,
  ]);
}

/** Check if biometric login is enabled. */
export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(KEY_BIO_ENABLED);
    return val === 'true';
  } catch {
    return false;
  }
}
