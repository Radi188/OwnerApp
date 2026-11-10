// API types — mirror FRONTEND_GUIDE.md / REPORTS_API.md.
// Money columns arrive as strings ("120.00") — always pass them through `num()` before maths.

export type Money = string | number;

export type UnitStatus = 'Available' | 'Occupied' | 'Reserved' | 'Maintenance';
export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'cancelled';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid' | 'cancelled';
export type PaymentRecordStatus = 'pending' | 'verified' | 'rejected';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'khqr' | 'other';
export type BillingStrategy = 'anniversary' | 'unified';
export type RentMode = 'prorated' | 'full' | 'none';
export type DailyRateBasis = 'actual' | 'fixed30';
export type Gender = 'male' | 'female' | 'other';
export type ContractKind = 'contract' | 'simple';

export interface Payment {
  id: number;
  invoiceId: number;
  amount: Money;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  transactionId?: string | null;
  status: PaymentRecordStatus;
  note?: string | null;
  attachment?: string | null;
  invoice?: Invoice;
}

export interface InvoiceLine {
  id: number;
  description: string;
  amount: Money;
  type: 'rent' | 'electricity' | 'water' | 'parking' | 'internet' | 'garbage' | 'management' | 'additional' | 'charge' | 'maintenance';
  usage?: Money; previousReading?: Money; currentReading?: Money; readingDate?: string; rate?: Money; maintenanceId?: number;
}

export interface Invoice {
  id: number;
  invoiceNumber: string;
  contractId: number; unitId: number; tenantId: number;
  billingMonth: string;
  subTotal: Money; discount: Money; totalAmount: Money; totalAmountKhr: Money; exchangeRate: number;
  dueDate: string;
  status: InvoiceStatus;
  note: string | null;
  // Balance fields (computed by the server)
  paidAmount: number; pendingAmount: number; remainingAmount: number;
  paymentStatus: PaymentStatus; isOverdue: boolean; daysOverdue: number; lastPaymentDate: string | null;
  invoiceDetails?: InvoiceLine[];
  payments?: Payment[];
  unit?: any; tenant?: any; contract?: any;
}

export interface TenantCredentials { username: string; password: string; qrDataURL?: string }

export interface PropertyCharge { id: number; propertyId: number; name: string; amount: Money; isActive: boolean }

export interface MoveInBody {
  tenantId: number;
  moveInDate?: string;
  monthlyRent?: number;
  depositAmount?: number;
  startReadings?: { electricity?: number; water?: number };
  billingStrategy?: BillingStrategy;
  createFirstInvoice?: boolean;
  note?: string;
}

export interface MoveOutBody {
  moveOutDate?: string;
  finalReadings?: { electricity?: number; water?: number };
  rentMode?: RentMode;
  applyDeposit?: boolean;
  refundUnusedDays?: boolean;
  discount?: number;
  note?: string;
}

export interface Settlement {
  preview: boolean;
  contractId: number;
  kind: ContractKind;
  tenant: { id: number; name: string };
  unit: { id: number; unitCode: string };
  moveInDate: string;
  moveOutDate: string;
  rentMode: RentMode;
  settings: { rentMode: RentMode; applyDeposit: boolean; refundUnusedDays: boolean; dailyRateBasis: DailyRateBasis };
  rent: { paidThrough: string | null; coveredByPaidPeriod: boolean; extraFrom: string | null; extraDays: number; charged: number };
  credit: { enabled: boolean; total: number; unusedDays: number; lines: any[]; appliedToInvoice: number; appliedToFinalInvoice: number; refund: number };
  finalInvoice: (Partial<Invoice> & { invoiceDetails?: InvoiceLine[] }) | null;
  deposit: { amount: number; applied: number; appliedTo: any[]; refundable: number };
  outstanding: number;
  unpaidInvoices: { invoiceId: number; invoiceNumber: string; billingMonth: string; totalAmount: number; paidAmount: number; pendingAmount: number; remainingAmount: number }[];
  refundDue: number;
}

/** Property tenancy settings (defaults for move-in / move-out). */
export interface TenancySettings {
  defaultBillingStrategy: BillingStrategy;
  defaultMoveOutRentMode: RentMode;
  autoApplyDeposit: boolean;
  dailyRateBasis: DailyRateBasis;
  refundUnusedDays: boolean;
}

export interface PaymentStatusRow {
  invoiceId: number;
  invoiceNumber: string;
  month: string;
  tenant: { id: number; name: string; phoneNumber?: string } | null;
  unitId: number;
  unitCode: string;
  propertyName: string;
  dueDate: string;
  invoiceStatus: InvoiceStatus;
  invoiced: number; paid: number; pending: number; remaining: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  isOverdue: boolean;
  daysOverdue: number;
  lastPaymentDate: string | null;
  payments: Payment[];
}

export interface PaymentStatusReport {
  period: { from: string; to: string };
  summary: {
    invoices: number; paid: number; partial: number; unpaid: number;
    invoiced: number; collected: number; pending: number; remaining: number;
    overdue: number; overdueAmount: number; collectionRate: number;
  };
  rows: PaymentStatusRow[];
}

export interface DashboardMonth {
  month: string;
  invoiced: number; invoiceIncome: number; otherIncome: number; totalIncome: number;
  outstanding: number; expenses: number; netIncome: number;
  totalUnits: number; occupiedUnits: number; vacantUnits: number; occupancyRate: number;
}

export interface DashboardReport {
  period: { from: string; to: string };
  months: DashboardMonth[];
  totals: {
    invoiced: number; invoiceIncome: number; otherIncome: number; totalIncome: number;
    outstanding: number; expenses: number; netIncome: number; averageOccupancyRate: number;
  };
}
