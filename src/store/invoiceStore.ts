// Module-level singleton — persists for the lifetime of the app session.

export type InvoiceRecord = {
  tenantId: string;
  billingMonth: string; // e.g. "March 2026"
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

const store = new Map<string, InvoiceRecord>();

function key(tenantId: string, month: string) {
  return `${tenantId}::${month}`;
}

export function getInvoice(tenantId: string, month: string): InvoiceRecord | undefined {
  return store.get(key(tenantId, month));
}

export function saveInvoice(record: InvoiceRecord): void {
  store.set(key(record.tenantId, record.billingMonth), record);
}

export function hasInvoice(tenantId: string, month: string): boolean {
  return store.has(key(tenantId, month));
}
