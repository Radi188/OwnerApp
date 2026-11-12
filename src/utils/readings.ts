import type { GroupedMeterReading, GroupedReadingRow, MeterType } from '../services/types';
import { toneColors } from '../theme';

/** Helpers for `GET /utility-readings/grouped` rows (one room on one date, both meters). */

export const METER_TYPES: MeterType[] = ['electricity', 'water'];

export const METER: Record<MeterType, { icon: string; unit: string; tone: { fg: string; bg: string } }> = {
  electricity: { icon: 'flash', unit: 'kWh', tone: toneColors.warning },
  water:       { icon: 'water', unit: 'm³',  tone: toneColors.info },
};

/** Meters that have a reading in this row. */
export const rowMeters = (row: GroupedReadingRow): MeterType[] => METER_TYPES.filter(k => row[k]);

/** Meters the server still lets you edit / delete (present and not on a live invoice). */
export const editableMeters = (row: GroupedReadingRow): MeterType[] =>
  METER_TYPES.filter(k => row[k] && !row[k]!.locked);

/** Some meter of the row is on an invoice that isn't cancelled. */
export const hasLockedMeter = (row: GroupedReadingRow): boolean => METER_TYPES.some(k => row[k]?.locked);

/** Every meter of the row is billed — nothing left to edit. */
export const isRowBilled = (row: GroupedReadingRow): boolean =>
  rowMeters(row).length > 0 && editableMeters(row).length === 0;

/** The invoice a locked meter of the row is billed on. */
export const rowInvoice = (row: GroupedReadingRow): GroupedMeterReading['invoice'] =>
  METER_TYPES.map(k => row[k]).find(m => m?.locked)?.invoice ?? null;

/** Newest first; same-day duplicates by the later-created reading. */
export const byNewest = (a: GroupedReadingRow, b: GroupedReadingRow): number =>
  b.readingDate.localeCompare(a.readingDate) || maxId(b) - maxId(a);

const maxId = (r: GroupedReadingRow) => Math.max(r.electricity?.id ?? 0, r.water?.id ?? 0);

/** unitId → key of that room's newest row. Only that row may get a missing meter added (§1). */
export function newestRowKeys(rows: GroupedReadingRow[]): Map<number, string> {
  const map = new Map<number, string>();
  [...rows].sort(byNewest).forEach(r => { if (!map.has(r.unitId)) map.set(r.unitId, r.key); });
  return map;
}
