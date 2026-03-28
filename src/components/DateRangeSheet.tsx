import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DateRange {
  fromYM: string; // YYYY-MM
  toYM:   string; // YYYY-MM
  label:  string;
}

interface Props {
  visible:  boolean;
  value:    DateRange;
  onApply:  (range: DateRange) => void;
  onClose:  () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const SCREEN_H     = Dimensions.get('window').height;

type QuickKey = 'thisMonth' | 'lastMonth' | 'last3' | 'last6' | 'thisYear' | 'lastYear';

interface QuickPreset { key: QuickKey; label: string }

const PRESETS: QuickPreset[] = [
  { key: 'thisMonth',  label: 'This Month' },
  { key: 'lastMonth',  label: 'Last Month' },
  { key: 'last3',      label: 'Last 3M' },
  { key: 'last6',      label: 'Last 6M' },
  { key: 'thisYear',   label: 'This Year' },
  { key: 'lastYear',   label: 'Last Year' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function ymToLabel(ym: string) {
  const [y, m] = ym.split('-');
  return `${MONTHS_SHORT[parseInt(m, 10) - 1]} ${y}`;
}

function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function clampTo(ym: string, max: string): string {
  return ym > max ? max : ym;
}

function clampFrom(ym: string, min: string): string {
  return ym < min ? min : ym;
}

function presetRange(key: QuickKey): { fromYM: string; toYM: string; label: string } {
  const now  = new Date();
  const y    = now.getFullYear();
  const m    = now.getMonth() + 1;
  const curr = `${y}-${String(m).padStart(2, '0')}`;

  switch (key) {
    case 'thisMonth':
      return { fromYM: curr, toYM: curr, label: 'This Month' };
    case 'lastMonth': {
      const lm = addMonths(curr, -1);
      return { fromYM: lm, toYM: lm, label: 'Last Month' };
    }
    case 'last3':
      return { fromYM: addMonths(curr, -2), toYM: curr, label: 'Last 3 Months' };
    case 'last6':
      return { fromYM: addMonths(curr, -5), toYM: curr, label: 'Last 6 Months' };
    case 'thisYear':
      return { fromYM: `${y}-01`, toYM: curr, label: 'This Year' };
    case 'lastYear':
      return { fromYM: `${y - 1}-01`, toYM: `${y - 1}-12`, label: 'Last Year' };
  }
}

// ─── Month Picker ─────────────────────────────────────────────────────────────

function MonthPicker({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label:    string;
  value:    string;
  onChange: (ym: string) => void;
  min?:     string;
  max?:     string;
}) {
  const [year, setYear] = useState(() => parseInt(value.split('-')[0], 10));
  const selMonth = parseInt(value.split('-')[1], 10) - 1; // 0-indexed
  const selYear  = parseInt(value.split('-')[0], 10);

  const canPrev = !min || `${year - 1}-12` >= min;
  const canNext = !max || `${year + 1}-01` <= max;

  const pick = (monthIdx: number) => {
    const ym = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
    if (min && ym < min) return;
    if (max && ym > max) return;
    onChange(ym);
  };

  return (
    <View style={mp.wrap}>
      <Text style={mp.label}>{label}</Text>

      {/* Year navigation */}
      <View style={mp.yearRow}>
        <TouchableOpacity
          style={[mp.yearArrow, !canPrev && mp.yearArrowDisabled]}
          onPress={() => canPrev && setYear(y => y - 1)}
          activeOpacity={0.7}
        >
          <Icon name="chevron-back" size={18} color={canPrev ? '#374151' : '#D1D5DB'} />
        </TouchableOpacity>
        <Text style={mp.yearText}>{year}</Text>
        <TouchableOpacity
          style={[mp.yearArrow, !canNext && mp.yearArrowDisabled]}
          onPress={() => canNext && setYear(y => y + 1)}
          activeOpacity={0.7}
        >
          <Icon name="chevron-forward" size={18} color={canNext ? '#374151' : '#D1D5DB'} />
        </TouchableOpacity>
      </View>

      {/* Month grid: 4 columns × 3 rows */}
      <View style={mp.grid}>
        {MONTHS_SHORT.map((mon, i) => {
          const ym        = `${year}-${String(i + 1).padStart(2, '0')}`;
          const isSelected = i === selMonth && year === selYear;
          const isDisabled = (!!min && ym < min) || (!!max && ym > max);
          const isInRange  = !isSelected && value !== '' && !isDisabled;

          return (
            <TouchableOpacity
              key={mon}
              style={[
                mp.cell,
                isSelected && mp.cellSelected,
                isDisabled && mp.cellDisabled,
              ]}
              onPress={() => pick(i)}
              activeOpacity={isDisabled ? 1 : 0.7}
              disabled={isDisabled}
            >
              <Text
                style={[
                  mp.cellText,
                  isSelected  && mp.cellTextSelected,
                  isDisabled  && mp.cellTextDisabled,
                ]}
              >
                {mon}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const mp = StyleSheet.create({
  wrap:  { flex: 1, paddingHorizontal: 4 },
  label: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },

  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  yearArrow: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  yearArrowDisabled: { backgroundColor: '#FAFAFA' },
  yearText: { fontSize: 16, fontWeight: '800', color: '#111827' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: {
    width: '22%',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: { backgroundColor: '#6366F1' },
  cellDisabled: { backgroundColor: '#FAFAFA' },
  cellText:         { fontSize: 13, fontWeight: '600', color: '#374151' },
  cellTextSelected: { color: '#FFFFFF' },
  cellTextDisabled: { color: '#D1D5DB' },
});

// ─── Sheet ────────────────────────────────────────────────────────────────────

export default function DateRangeSheet({ visible, value, onApply, onClose }: Props) {
  const insets     = useSafeAreaInsets();
  const slideAnim  = useRef(new Animated.Value(SCREEN_H)).current;
  const fadeAnim   = useRef(new Animated.Value(0)).current;

  const [fromYM,  setFromYM]  = useState(value.fromYM);
  const [toYM,    setToYM]    = useState(value.toYM);
  const [activePreset, setActivePreset] = useState<QuickKey | null>(null);

  const today = nowYM();

  // Sync internal state when sheet opens
  useEffect(() => {
    if (visible) {
      setFromYM(value.fromYM);
      setToYM(value.toYM);
      setActivePreset(null);
      slideAnim.setValue(SCREEN_H);
      fadeAnim.setValue(0);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, damping: 20, stiffness: 160, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const close = () => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 220, useNativeDriver: true }),
    ]).start(onClose);
  };

  const apply = () => {
    const from = fromYM <= toYM ? fromYM : toYM;
    const to   = fromYM <= toYM ? toYM   : fromYM;
    const label = from === to ? ymToLabel(from) : `${ymToLabel(from)} – ${ymToLabel(to)}`;
    onApply({ fromYM: from, toYM: to, label });
    close();
  };

  const handleFromChange = (ym: string) => {
    setFromYM(ym);
    setActivePreset(null);
    if (ym > toYM) setToYM(ym);
  };

  const handleToChange = (ym: string) => {
    setToYM(ym);
    setActivePreset(null);
    if (ym < fromYM) setFromYM(ym);
  };

  const applyPreset = (key: QuickKey) => {
    const r = presetRange(key);
    setFromYM(r.fromYM);
    setToYM(r.toYM);
    setActivePreset(key);
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} statusBarTranslucent onRequestClose={close}>
      {/* Backdrop */}
      <Animated.View style={[sh.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          sh.sheet,
          { paddingBottom: insets.bottom + 16 },
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View style={sh.handle} />

        {/* Header */}
        <View style={sh.header}>
          <Text style={sh.headerTitle}>Select Period</Text>
          <TouchableOpacity onPress={close} style={sh.closeBtn} activeOpacity={0.7}>
            <Icon name="close" size={18} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Selected range preview */}
        <View style={sh.preview}>
          <View style={sh.previewChip}>
            <Icon name="calendar" size={14} color="#6366F1" />
            <Text style={sh.previewText}>{ymToLabel(fromYM)}</Text>
          </View>
          <View style={sh.previewArrow}>
            <Icon name="arrow-forward" size={14} color="#9CA3AF" />
          </View>
          <View style={sh.previewChip}>
            <Icon name="calendar" size={14} color="#6366F1" />
            <Text style={sh.previewText}>{ymToLabel(toYM)}</Text>
          </View>
        </View>

        {/* Quick presets */}
        <View style={sh.presetsWrap}>
          <View style={sh.presetsRow}>
            {PRESETS.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[sh.preset, activePreset === p.key && sh.presetActive]}
                onPress={() => applyPreset(p.key)}
                activeOpacity={0.7}
              >
                <Text style={[sh.presetText, activePreset === p.key && sh.presetTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Month pickers side-by-side */}
        <View style={sh.pickers}>
          <MonthPicker
            label="From"
            value={fromYM}
            onChange={handleFromChange}
            max={toYM}
          />
          <View style={sh.pickerDivider} />
          <MonthPicker
            label="To"
            value={toYM}
            onChange={handleToChange}
            min={fromYM}
            max={today}
          />
        </View>

        {/* Apply button */}
        <TouchableOpacity style={sh.applyBtn} onPress={apply} activeOpacity={0.85}>
          <Icon name="checkmark" size={18} color="#FFFFFF" />
          <Text style={sh.applyText}>Apply</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const sh = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center', marginBottom: 16,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },

  // Preview strip
  preview: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginBottom: 16,
    backgroundColor: '#F5F3FF', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 16,
  },
  previewChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewArrow: {},
  previewText: { fontSize: 14, fontWeight: '700', color: '#6366F1' },

  // Presets
  presetsWrap:  { marginBottom: 20 },
  presetsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, backgroundColor: '#F3F4F6',
  },
  presetActive:     { backgroundColor: '#6366F1' },
  presetText:       { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  presetTextActive: { color: '#FFFFFF' },

  // Pickers
  pickers:       { flexDirection: 'row', marginBottom: 20, gap: 0 },
  pickerDivider: { width: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB', marginHorizontal: 12 },

  // Apply
  applyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#6366F1',
    borderRadius: 16, paddingVertical: 16,
    shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  applyText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
