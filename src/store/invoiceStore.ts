// Local cache of invoice *details* the API doesn't return (meter readings, notes,
// electricity/water split). Persisted to AsyncStorage so it survives app reloads.
// Whether an invoice exists is decided by the API, not by this store.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type InvoiceRecord = {
  tenantId: string;
  billingMonth: string; // "November 2026" or "2026-11" — normalised by monthKey()
  currKwh: number;
  currWater: number;
  notes: string;
  scheduledDate: string;
  total: number;
  elecCost: number;
  waterCost: number;
  usageKwh: number;
  usageWater: number;
};

const STORAGE_KEY = 'invoiceStore:v1';
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

const store = new Map<string, InvoiceRecord>();
let hydratePromise: Promise<void> | null = null;

/** Normalise "2026-11", "2026-11-01" or "November 2026" to "2026-11". */
export function monthKey(month: string | null | undefined): string {
  if (!month) return '';
  const iso = /^(\d{4})-(\d{2})/.exec(month);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const named = /^([A-Za-z]+)\s+(\d{4})$/.exec(month.trim());
  if (named) {
    const idx = MONTHS.findIndex(m => m.startsWith(named[1].toLowerCase().slice(0, 3)));
    if (idx >= 0) return `${named[2]}-${String(idx + 1).padStart(2, '0')}`;
  }
  return month;
}

/** Current calendar month as "YYYY-MM". */
export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function key(tenantId: string, month: string) {
  return `${tenantId}::${monthKey(month)}`;
}

/** Load persisted records once. Safe to call repeatedly. */
export function hydrateInvoices(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (!raw) return;
        const records: InvoiceRecord[] = JSON.parse(raw);
        records.forEach(r => store.set(key(r.tenantId, r.billingMonth), r));
      })
      .catch(() => {/* corrupt or unavailable storage — start empty */});
  }
  return hydratePromise;
}

function persist() {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...store.values()])).catch(() => {});
}

export function getInvoice(tenantId: string, month: string): InvoiceRecord | undefined {
  return store.get(key(tenantId, month));
}

export function saveInvoice(record: InvoiceRecord): void {
  store.set(key(record.tenantId, record.billingMonth), record);
  persist();
}

export function hasInvoice(tenantId: string, month: string): boolean {
  return store.has(key(tenantId, month));
}
