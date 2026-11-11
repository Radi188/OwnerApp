import React from 'react';
import { ActionSheetIOS, Alert, Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { launchCamera, launchImageLibrary, type ImagePickerResponse } from 'react-native-image-picker';
import { Text } from '../Text';
import { toast } from '../Toast';
import { fileUrl, type UploadFile } from '../../services/api';
import { colors, radius, spacing } from '../../theme';

export type ImageUploadProps = {
  label?: string;
  /** A newly picked file, or the server path of the current image (shown as a preview). */
  value?: UploadFile | string | null;
  onChange: (file: UploadFile | null) => void;
  /** Empty-state title, e.g. "Upload ID card / passport". */
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  /** Ionicons name for the empty state (default: an ID card). */
  icon?: string;
  /** Preview shape, width / height (default 1.6 — an ID card). */
  aspectRatio?: number;
  /** Empty-state second line. */
  subtitle?: string;
};

const PICK_OPTIONS = {
  mediaType: 'photo' as const,
  quality: 0.8 as const,
  maxWidth: 1600,
  maxHeight: 1600,
  includeBase64: false,
  selectionLimit: 1,
};

/** Image picker response → multipart file, or null when cancelled / failed (failures toast). */
function toFile(res: ImagePickerResponse): UploadFile | null {
  if (res.didCancel) return null;
  if (res.errorCode) {
    toast.error(
      res.errorCode === 'camera_unavailable' ? 'No camera is available on this device.'
        : res.errorCode === 'permission' ? 'Allow access to the camera / photos in Settings to upload an image.'
          : res.errorMessage || 'Could not open the image.',
    );
    return null;
  }
  const a = res.assets?.[0];
  if (!a?.uri) return null;
  const type = a.type || 'image/jpeg';
  const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  return { uri: a.uri, type, name: a.fileName || `photo-${Date.now()}.${ext}` };
}

async function pickFrom(source: 'camera' | 'library'): Promise<UploadFile | null> {
  try {
    const res = source === 'camera' ? await launchCamera({ ...PICK_OPTIONS, saveToPhotos: false }) : await launchImageLibrary(PICK_OPTIONS);
    return toFile(res);
  } catch (e: any) {
    toast.error(e?.message ?? 'Could not open the image.');
    return null;
  }
}

/**
 * Asks "Take photo / Choose from library" and resolves with the picked image (null if cancelled).
 * Use it for custom image UIs (property logo, payment QR); <ImageUpload> uses it too.
 */
export function chooseImage(title?: string): Promise<UploadFile | null> {
  const opts = ['Take photo', 'Choose from library', 'Cancel'];
  return new Promise(resolve => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: opts, cancelButtonIndex: 2, title },
        i => resolve(i === 0 ? pickFrom('camera') : i === 1 ? pickFrom('library') : null),
      );
    } else {
      Alert.alert(title ?? 'Add photo', undefined, [
        { text: opts[0], onPress: () => resolve(pickFrom('camera')) },
        { text: opts[1], onPress: () => resolve(pickFrom('library')) },
        { text: opts[2], style: 'cancel', onPress: () => resolve(null) },
      ], { cancelable: true, onDismiss: () => resolve(null) });
    }
  });
}

/**
 * Photo field for uploads such as ID card / passport (`idCardPassport`). Lets the user take a
 * photo or choose one from the library, then shows a preview with Replace / Remove.
 */
export function ImageUpload({
  label, value, onChange, placeholder = 'Upload a photo', hint, disabled,
  icon = 'id-card-outline', aspectRatio = 1.6, subtitle = 'Take a photo or choose from your library',
}: ImageUploadProps) {
  const picked = value && typeof value === 'object' ? value : null;
  const previewUri = picked ? picked.uri : typeof value === 'string' ? fileUrl(value) : undefined;

  const choose = async () => {
    if (disabled) return;
    const file = await chooseImage(label);
    if (file) onChange(file);
  };

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      {previewUri ? (
        <View style={[styles.preview, { aspectRatio }]}>
          <Image source={{ uri: previewUri }} style={styles.image} resizeMode="cover" accessibilityLabel={label} />
          {!disabled ? (
            <View style={styles.actions}>
              <Pressable onPress={choose} style={({ pressed }) => [styles.action, pressed && styles.pressed]} hitSlop={4}>
                <Icon name="camera-reverse-outline" size={15} color={colors.white} />
                <Text style={styles.actionText}>Replace</Text>
              </Pressable>
              {picked ? (
                <Pressable onPress={() => onChange(null)} style={({ pressed }) => [styles.action, pressed && styles.pressed]} hitSlop={4}>
                  <Icon name="trash-outline" size={15} color={colors.white} />
                  <Text style={styles.actionText}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {picked ? (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>New</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Pressable
          onPress={choose}
          disabled={disabled}
          style={({ pressed }) => [styles.empty, pressed && styles.pressed, disabled && { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel={placeholder}
        >
          <View style={styles.emptyIcon}>
            <Icon name={icon} size={22} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>{placeholder}</Text>
          <Text style={styles.emptySub}>{subtitle}</Text>
        </Pressable>
      )}

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: { fontSize: 12, fontWeight: '600', color: colors.text, marginBottom: 6 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 6 },
  pressed: { opacity: 0.75 },

  empty: {
    alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 20, paddingHorizontal: 16,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primaryTint,
    borderRadius: radius.md, backgroundColor: colors.primarySoft,
  },
  emptyIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: colors.primary },
  emptySub: { fontSize: 12, color: colors.textSecondary },

  preview: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.divider },
  image: { width: '100%', height: '100%' },
  actions: { position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', gap: 8 },
  action: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, height: 32, borderRadius: 16, backgroundColor: 'rgba(23,21,59,0.72)',
  },
  actionText: { fontSize: 12, fontWeight: '700', color: colors.white },
  newBadge: {
    position: 'absolute', left: 8, top: 8, paddingHorizontal: 8, height: 22, borderRadius: 11,
    backgroundColor: colors.primary, justifyContent: 'center',
  },
  newBadgeText: { fontSize: 11, fontWeight: '700', color: colors.white },
});
