import React, { createContext, forwardRef, useContext, useSyncExternalStore } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  TextInputProps,
  TextProps,
  TextStyle,
} from 'react-native';
import i18n from '../i18n';

/**
 * Drop-in replacements for React Native's <Text> / <TextInput> that render Khmer properly.
 *
 * The system Khmer font has very different metrics from the Latin UI font, so Khmer words,
 * numbers and English sit at different heights and stacked vowels get clipped. When Khmer is
 * on screen we switch to Kantumruy Pro — one family with matching Khmer + Latin glyphs — and
 * give each line enough height for Khmer's above/below marks.
 *
 *  - App language = km  → every Text uses Kantumruy Pro (so numbers match the Khmer text).
 *  - App language = en  → only strings that contain Khmer (e.g. tenant names) switch font.
 *  - Explicit `fontFamily` (icon fonts, etc.) is always respected.
 */

// Weight → static font file (PostScript name == file name, works on iOS and Android)
const FAMILY: Record<string, string> = {
  '100': 'KantumruyPro-Regular',
  '200': 'KantumruyPro-Regular',
  '300': 'KantumruyPro-Regular',
  '400': 'KantumruyPro-Regular',
  normal: 'KantumruyPro-Regular',
  '500': 'KantumruyPro-Medium',
  '600': 'KantumruyPro-SemiBold',
  '700': 'KantumruyPro-Bold',
  '800': 'KantumruyPro-Bold',
  '900': 'KantumruyPro-Bold',
  bold: 'KantumruyPro-Bold',
};

/** Khmer + Khmer Symbols blocks */
const KHMER = /[ក-៿᧠-᧿]/;
/**
 * Line height Khmer needs so stacked vowels/subscripts are not clipped.
 * Measured with Kantumruy Pro (HarfBuzz): marks above reach 1.03 em (e.g. ប៊ឺ in Bold) and coeng
 * subscripts go down to −0.46 em (e.g. ខ្ញុំ). React Native centres glyphs in the line box, so with
 * the font's 0.92 / 0.26 em ascent/descent a 1.6 ratio leaves room for both (1.13 em / 0.47 em).
 * NOTE: this only holds while Kantumruy Pro is actually linked (Info.plist UIAppFonts + Xcode
 * resources on iOS, android/app/src/main/assets/fonts on Android). The system Khmer fallback font
 * is taller, and React Native stops centring when lineHeight < the font's own line height.
 */
const LINE_RATIO = 1.6;

// ── Language subscription (one tiny listener set, no per-Text i18n binding) ──
const listeners = new Set<() => void>();
i18n.on('languageChanged', () => listeners.forEach(l => l()));
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getLanguage = () => i18n.language;

export function useLanguage(): string {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}

/** True when any string inside `children` contains Khmer characters. */
function hasKhmer(node: React.ReactNode): boolean {
  if (node == null || typeof node === 'boolean') return false;
  if (typeof node === 'string') return KHMER.test(node);
  if (typeof node === 'number') return false;
  if (Array.isArray(node)) return node.some(hasKhmer);
  if (React.isValidElement(node)) return hasKhmer((node.props as { children?: React.ReactNode }).children);
  return false;
}

/** Style patch that switches to Kantumruy Pro, or null when nothing should change. */
function khmerPatch(style: StyleProp<TextStyle>, opts: { lineHeight: boolean }): TextStyle | null {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  if (flat.fontFamily) return null;

  const patch: TextStyle = {
    fontFamily: FAMILY[String(flat.fontWeight ?? '400')] ?? FAMILY['400'],
    // Weight comes from the font file; keeping fontWeight would fake-bold it on Android.
    fontWeight: 'normal',
  };
  // Negative tracking breaks Khmer clusters apart.
  if (flat.letterSpacing && flat.letterSpacing < 0) patch.letterSpacing = 0;

  if (opts.lineHeight) {
    const size = flat.fontSize ?? 14;
    patch.lineHeight = Math.max(flat.lineHeight ?? 0, Math.round(size * LINE_RATIO));
  }
  return patch;
}

// Nested <Text> inherits the paragraph's line height — only the outermost Text sets it.
const InsideText = createContext(false);

export const Text = forwardRef<RNText, TextProps>(function Text(props, ref) {
  const lang = useLanguage();
  const nested = useContext(InsideText);
  const active = lang === 'km' || hasKhmer(props.children);
  // No fixed lineHeight on shrink-to-fit text: iOS scales only the font, so a fixed line height
  // can make every size "not fit" and React Native drops to its 4pt minimum (tiny "A03" codes).
  const patch = active ? khmerPatch(props.style, { lineHeight: !nested && !props.adjustsFontSizeToFit }) : null;

  const el = <RNText ref={ref} {...props} style={patch ? [props.style, patch] : props.style} />;
  return nested ? el : <InsideText.Provider value>{el}</InsideText.Provider>;
});
// Allow `Text` to be used as a type too (e.g. useRef<Text>)
export type Text = RNText;

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(props, ref) {
  const lang = useLanguage();
  const active = lang === 'km' || KHMER.test(String(props.value ?? props.defaultValue ?? ''));
  // Single-line inputs must not get a lineHeight (it misplaces the caret on iOS).
  const patch = active ? khmerPatch(props.style, { lineHeight: !!props.multiline }) : null;
  return <RNTextInput ref={ref} {...props} style={patch ? [props.style, patch] : props.style} />;
});
// Allow `TextInput` to be used as a type too (e.g. useRef<TextInput>)
export type TextInput = RNTextInput;
