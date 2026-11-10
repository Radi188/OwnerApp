import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Text } from '../Text';
import { Sheet } from '../Sheet';
import i18n from '../../i18n';
import { colors, radius } from '../../theme';
import { FieldShell } from './FieldShell';

const pad = (n: number) => String(n).padStart(2, '0');
const ymdOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthNames = () => i18n.t('common.monthsShort').split(',');

export type DateFieldProps = {
  label?: string;
  value?: string | null;
  onChange: (v: string) => void;
  required?: boolean;
  error?: string;
  hint?: string;
  /** `month` stores YYYY-MM, otherwise YYYY-MM-DD. */
  mode?: 'date' | 'month';
  placeholder?: string;
  /** Show a ✕ to empty the field (calls onChange('')). */
  clearable?: boolean;
};

/** Date / month picker: floating-label field + calendar sheet with quick picks. Pure JS. */
export function DateField({
  label, value, onChange, required, error, hint, mode = 'date', placeholder, clearable,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const init = value ? new Date((mode === 'month' ? value + '-01' : value) + 'T00:00:00') : new Date();
  const [cursor, setCursor] = useState({ y: init.getFullYear(), m: init.getMonth() });
  const months = monthNames();
  const today = new Date();
  const todayYmd = ymdOf(today);

  const display = value
    ? mode === 'month'
      ? `${months[parseInt(value.split('-')[1], 10) - 1] ?? ''} ${value.split('-')[0]}`
      : (() => { const d = new Date(value + 'T00:00:00'); return isNaN(d.getTime()) ? value : `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; })()
    : null;

  const days = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1).getDay();
    const count = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const cells: (number | null)[] = Array(first).fill(null);
    for (let d = 1; d <= count; d++) cells.push(d);
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [cursor]);

  const shift = (delta: number) => setCursor(c => {
    if (mode === 'month') return { y: c.y + delta, m: c.m };
    const m = c.m + delta;
    return { y: c.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
  });

  const pick = (v: string) => { onChange(v); setOpen(false); };
  const openSheet = () => {
    const d = value ? new Date((mode === 'month' ? value + '-01' : value) + 'T00:00:00') : new Date();
    if (!isNaN(d.getTime())) setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setOpen(true);
  };

  const quick = mode === 'month'
    ? [
        { label: i18n.t('form.thisMonth'), v: `${today.getFullYear()}-${pad(today.getMonth() + 1)}` },
        { label: i18n.t('form.lastMonth'), v: (() => { const d = new Date(today.getFullYear(), today.getMonth() - 1, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; })() },
      ]
    : [
        { label: i18n.t('form.today'), v: todayYmd },
        { label: i18n.t('form.plusMonth'), v: ymdOf(new Date(today.getFullYear(), today.getMonth() + 1, today.getDate())) },
        { label: i18n.t('form.plusSixMonths'), v: ymdOf(new Date(today.getFullYear(), today.getMonth() + 6, today.getDate())) },
        { label: i18n.t('form.plusYear'), v: ymdOf(new Date(today.getFullYear() + 1, today.getMonth(), today.getDate())) },
      ];

  const sheetTitle = label ?? (mode === 'month' ? i18n.t('form.selectMonth') : i18n.t('form.selectDate'));

  return (
    <>
      <FieldShell
        label={label}
        required={required}
        error={error}
        hint={hint}
        focused={open}
        filled={!!display}
        icon="calendar-outline"
        onPress={openSheet}
        right={clearable && value ? (
          <TouchableOpacity onPress={() => onChange('')} hitSlop={10} accessibilityLabel={i18n.t('form.clear')}>
            <Icon name="close-circle" size={18} color={colors.muted} />
          </TouchableOpacity>
        ) : (
          <Icon name="chevron-down" size={18} color={open ? colors.primary : colors.muted} />
        )}
      >
        {display ? (
          <Text style={styles.value} numberOfLines={1}>{display}</Text>
        ) : !label ? (
          <Text style={[styles.value, { color: colors.muted }]} numberOfLines={1}>{placeholder ?? sheetTitle}</Text>
        ) : null}
      </FieldShell>

      <Sheet visible={open} onClose={() => setOpen(false)} title={sheetTitle}>
        <View style={styles.quickRow}>
          {quick.map(qp => (
            <Pressable
              key={qp.label}
              onPress={() => pick(qp.v)}
              style={({ pressed }) => [styles.quick, value === qp.v && styles.quickActive, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.quickText, value === qp.v && styles.quickTextActive]}>{qp.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.calHead}>
          <TouchableOpacity style={styles.calNav} onPress={() => shift(-1)} hitSlop={6}>
            <Icon name="chevron-back" size={18} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.calTitle}>{mode === 'month' ? cursor.y : `${months[cursor.m]} ${cursor.y}`}</Text>
          <TouchableOpacity style={styles.calNav} onPress={() => shift(1)} hitSlop={6}>
            <Icon name="chevron-forward" size={18} color={colors.ink} />
          </TouchableOpacity>
        </View>

        {mode === 'month' ? (
          <View style={styles.monthGrid}>
            {months.map((m, i) => {
              const v = `${cursor.y}-${pad(i + 1)}`;
              const active = v === value;
              const isNow = v === todayYmd.slice(0, 7);
              return (
                <TouchableOpacity key={v} style={[styles.monthCell, isNow && styles.cellToday, active && styles.cellActive]} onPress={() => pick(v)}>
                  <Text style={[styles.cellText, isNow && { color: colors.primary }, active && { color: colors.white }]} numberOfLines={1} adjustsFontSizeToFit>{m}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <>
            <View style={styles.calWeek}>
              {i18n.t('form.weekdays').split(',').map((d, i) => <Text key={i} style={styles.calWeekText}>{d}</Text>)}
            </View>
            <View style={styles.calGrid}>
              {days.map((d, i) => {
                const v = d ? `${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}` : '';
                const active = !!d && v === value;
                const isToday = !!d && v === todayYmd;
                return (
                  <TouchableOpacity key={i} disabled={!d} style={styles.calCell} onPress={() => pick(v)}>
                    <View style={[styles.dayDot, isToday && styles.cellToday, active && styles.cellActive]}>
                      <Text style={[styles.cellText, isToday && { color: colors.primary, fontWeight: '700' }, active && { color: colors.white }]}>{d ?? ''}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  value: { fontSize: 15, color: colors.ink },

  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  quick: {
    paddingHorizontal: 12, height: 34, borderRadius: radius.pill, justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface,
  },
  quickActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  quickText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  quickTextActive: { color: colors.primary },

  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  calNav: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  calTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  calWeek: { flexDirection: 'row' },
  calWeekText: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: colors.muted, paddingVertical: 6 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayDot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cellToday: { borderWidth: 1.5, borderColor: colors.primaryTint },
  cellActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  cellText: { fontSize: 15, color: colors.ink, fontWeight: '500' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthCell: {
    width: '31.5%', height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt, paddingHorizontal: 6,
  },
});
