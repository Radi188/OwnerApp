import { Platform } from 'react-native';
import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

/**
 * Biometric login.
 *
 * The password lives in the iOS Keychain / Android Keystore, locked to the device's current
 * Face ID / fingerprints (`BIOMETRY_CURRENT_SET`): the OS only hands it back after a successful
 * scan, and enrolling a new face / finger invalidates it. Nothing secret is in AsyncStorage —
 * only "enabled", the username (to show "Sign in as …") and the last property used.
 */

const rnb = new ReactNativeBiometrics({ allowDeviceCredentials: false });

const SERVICE = 'com.pteah.owner.biometric-login';
const KEY_ENABLED = '@owner:bioEnabled';
const KEY_USERNAME = '@owner:bioUsername';
const KEY_PROP_ID = '@owner:bioPropId';
const KEY_PROP_NAME = '@owner:bioPropName';
/** Old builds kept the password in plain AsyncStorage — moved into the Keychain once, then deleted. */
const LEGACY_PASSWORD = '@owner:bioPassword';

export type BiometricType = 'FaceID' | 'TouchID' | 'Biometrics' | null;

export type BiometricCredentials = {
  username: string;
  password: string;
  propertyId: number | undefined;
  propertyName: string | undefined;
};

/** Human label for the sensor: "Face ID", "Touch ID" or "Fingerprint". */
export const biometricLabel = (type: BiometricType) =>
  type === 'FaceID' ? 'Face ID' : type === 'TouchID' ? 'Touch ID' : Platform.OS === 'android' ? 'Fingerprint' : 'Biometrics';

/** Returns the available biometric type, or null if not available / not enrolled. */
export async function getAvailableBiometricType(): Promise<BiometricType> {
  try {
    const { available, biometryType } = await rnb.isSensorAvailable();
    if (!available) return null;
    if (biometryType === BiometryTypes.FaceID) return 'FaceID';
    if (biometryType === BiometryTypes.TouchID) return 'TouchID';
    if (biometryType === BiometryTypes.Biometrics) return 'Biometrics';
    return null;
  } catch {
    return null;
  }
}

/** Plain biometric check (no secret involved). Returns true if passed. */
export async function promptBiometrics(reason: string): Promise<boolean> {
  try {
    const { success } = await rnb.simplePrompt({ promptMessage: reason, cancelButtonText: 'Cancel' });
    return success;
  } catch {
    return false;
  }
}

const SECURE_OPTIONS: Keychain.SetOptions = {
  service: SERVICE,
  accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
  accessible: Keychain.ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  // Android: RSA keystore — encrypt without a prompt, decrypt only after a biometric scan
  storage: Keychain.STORAGE_TYPE.RSA,
  securityLevel: Keychain.SECURITY_LEVEL.SECURE_SOFTWARE,
};

/** Save the login for biometric sign-in (username + password + property). */
export async function saveBiometricCredentials(
  username: string,
  password: string,
  propertyId?: number,
  propertyName?: string,
): Promise<void> {
  const ok = await Keychain.setGenericPassword(username, password, SECURE_OPTIONS);
  if (!ok) throw new Error('Could not save to the secure keychain.');
  await AsyncStorage.multiSet([
    [KEY_ENABLED, 'true'],
    [KEY_USERNAME, username],
    [KEY_PROP_ID, propertyId != null ? String(propertyId) : ''],
    [KEY_PROP_NAME, propertyName ?? ''],
  ]);
  await AsyncStorage.removeItem(LEGACY_PASSWORD).catch(() => {});
}

/** Remember the property to open on the next biometric sign-in (no scan needed — not secret). */
export async function updateBiometricProperty(propertyId: number, propertyName: string): Promise<void> {
  if (!(await isBiometricEnabled())) return;
  await AsyncStorage.multiSet([[KEY_PROP_ID, String(propertyId)], [KEY_PROP_NAME, propertyName]]);
}

/** Non-secret state for the UI — never triggers a scan. */
export async function getBiometricState(): Promise<{ enabled: boolean; username: string | null; propertyName: string | null }> {
  try {
    await migrateLegacy();
    const [[, enabled], [, username], [, propName]] = await AsyncStorage.multiGet([KEY_ENABLED, KEY_USERNAME, KEY_PROP_NAME]);
    return { enabled: enabled === 'true' && !!username, username: username || null, propertyName: propName || null };
  } catch {
    return { enabled: false, username: null, propertyName: null };
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  return (await getBiometricState()).enabled;
}

/**
 * Shows Face ID / fingerprint and, when it succeeds, returns the saved login.
 * Returns null if the user cancels or the scan fails. If the saved item was invalidated (new
 * face / finger enrolled), biometric login is turned off and null is returned.
 */
export async function unlockBiometricCredentials(prompt: { title: string; subtitle?: string; cancel?: string }): Promise<BiometricCredentials | null> {
  try {
    const res = await Keychain.getGenericPassword({
      service: SERVICE,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
      authenticationPrompt: { title: prompt.title, subtitle: prompt.subtitle, cancel: prompt.cancel ?? 'Cancel' },
    });
    if (!res) {
      // Nothing stored (or invalidated by a biometric change) → turn the feature off cleanly
      if (!(await Keychain.hasGenericPassword({ service: SERVICE }).catch(() => false))) await clearBiometricCredentials();
      return null;
    }
    const [[, propId], [, propName]] = await AsyncStorage.multiGet([KEY_PROP_ID, KEY_PROP_NAME]);
    return {
      username: res.username,
      password: res.password,
      propertyId: propId ? Number(propId) : undefined,
      propertyName: propName || undefined,
    };
  } catch {
    // User cancelled, too many attempts, or sensor locked
    return null;
  }
}

/** @deprecated kept for older call sites — use unlockBiometricCredentials (one scan, secure). */
export async function loadBiometricCredentials(): Promise<BiometricCredentials | null> {
  return unlockBiometricCredentials({ title: 'Sign in' });
}

/** Turn biometric login off and remove the saved password. */
export async function clearBiometricCredentials(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE }).catch(() => {});
  await AsyncStorage.multiRemove([KEY_ENABLED, KEY_USERNAME, KEY_PROP_ID, KEY_PROP_NAME, LEGACY_PASSWORD]).catch(() => {});
}

/** One-time move of a plain-text password (old builds) into the Keychain. */
let migrated = false;
async function migrateLegacy() {
  if (migrated) return;
  migrated = true;
  const [[, legacy], [, username]] = await AsyncStorage.multiGet([LEGACY_PASSWORD, KEY_USERNAME]);
  if (!legacy) return;
  try {
    if (username) await Keychain.setGenericPassword(username, legacy, SECURE_OPTIONS);
  } finally {
    await AsyncStorage.removeItem(LEGACY_PASSWORD).catch(() => {});
  }
}
