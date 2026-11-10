// ─── Design tokens ───────────────────────────────────────────────────────────
// Single source of truth for the app's look. Screens should import from here
// rather than hard-coding hex values.

export const colors = {
  // Brand
  primary:      '#0F766E',
  primaryDark:  '#115E59',
  primaryDeep:  '#0B3B38',
  primarySoft:  '#F0FDFA',
  primaryTint:  '#CCFBF1',
  accent:       '#F59E0B',

  // Neutrals
  ink:          '#0F172A',
  text:         '#1E293B',
  textSecondary:'#475569',
  muted:        '#94A3B8',
  border:       '#E2E8F0',
  divider:      '#EEF2F6',
  bg:           '#F4F6F8',
  surface:      '#FFFFFF',
  surfaceAlt:   '#F8FAFC',
  white:        '#FFFFFF',
  overlay:      'rgba(15, 23, 42, 0.45)',

  // Semantic
  success:      '#16A34A',
  successSoft:  '#ECFDF3',
  warning:      '#D97706',
  warningSoft:  '#FFFBEB',
  danger:       '#DC2626',
  dangerSoft:   '#FEF2F2',
  info:         '#2563EB',
  infoSoft:     '#EFF6FF',
  violet:       '#7C3AED',
  violetSoft:   '#F5F3FF',
  orange:       '#EA580C',
  orangeSoft:   '#FFF7ED',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

export const font = {
  h1:      { fontSize: 26, fontWeight: '800' as const, color: colors.ink, letterSpacing: -0.5 },
  h2:      { fontSize: 20, fontWeight: '700' as const, color: colors.ink, letterSpacing: -0.3 },
  h3:      { fontSize: 16, fontWeight: '700' as const, color: colors.ink },
  body:    { fontSize: 14, fontWeight: '400' as const, color: colors.text },
  bodyStrong: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  caption: { fontSize: 12, fontWeight: '500' as const, color: colors.textSecondary },
  tiny:    { fontSize: 11, fontWeight: '600' as const, color: colors.muted, letterSpacing: 0.4 },
};

export const shadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
};

// Status → colour mapping shared by every list/badge in the app
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'neutral' | 'primary' | 'orange';

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  success: { fg: colors.success, bg: colors.successSoft },
  warning: { fg: colors.warning, bg: colors.warningSoft },
  danger:  { fg: colors.danger,  bg: colors.dangerSoft },
  info:    { fg: colors.info,    bg: colors.infoSoft },
  violet:  { fg: colors.violet,  bg: colors.violetSoft },
  orange:  { fg: colors.orange,  bg: colors.orangeSoft },
  primary: { fg: colors.primary, bg: colors.primarySoft },
  neutral: { fg: colors.textSecondary, bg: '#F1F5F9' },
};

export function statusTone(status?: string | null): Tone {
  const s = (status ?? '').toLowerCase();
  if (['paid', 'active', 'completed', 'occupied', 'income', 'success'].includes(s)) return 'success';
  if (['pending', 'unpaid', 'processing', 'medium', 'assigned', 'reserved'].includes(s)) return 'warning';
  if (['overdue', 'cancelled', 'canceled', 'terminated', 'expired', 'urgent', 'high', 'expense', 'inactive'].includes(s)) return 'danger';
  if (['in_progress', 'sent', 'available'].includes(s)) return 'info';
  if (['maintenance', 'under maintenance'].includes(s)) return 'orange';
  if (['draft', 'low'].includes(s)) return 'neutral';
  return 'neutral';
}
