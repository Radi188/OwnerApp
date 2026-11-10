import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';
import type {
  BillingStrategy, ContractKind, DashboardReport, Gender, InvoiceStatus, Money, MoveInBody, MoveOutBody,
  PaymentMethod, PaymentStatusReport, Settlement, TenantCredentials,
} from './types';

export * from './types';

const BASE_URL = 'https://testing-api.bongclock.cloud/api/v1';
/** API origin (no /api/v1) — uploaded files are served from here. */
export const API_ORIGIN = BASE_URL.replace(/\/api\/v\d+\/?$/, '');

/**
 * URL for an uploaded file. Image paths come back from the API already signed
 * (`images/x.jpeg?exp=…&sig=…`) — use them exactly as returned; links expire after ~6 h.
 */
export function fileUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path) || path.startsWith('data:')) return path;
  return `${API_ORIGIN}/${path.replace(/^\/+/, '')}`;
}

/** Money / numeric strings → number ("120.00" → 120). */
export const num = (v: unknown): number => Number(v ?? 0) || 0;
/** "85.50%" | "85.50" | 0 → 85.5 */
export const pct = (v: unknown): number => parseFloat(String(v ?? 0).replace('%', '')) || 0;

const DEVICE_ID = 'owner-mobile-' + Math.random().toString(36).substring(2, 10);
const KEY_ACCESS_TOKEN = '@owner:access';
const KEY_REFRESH_TOKEN = '@owner:refresh';

let _accessToken: string | null = null;
let _refreshToken: string | null = null;
let _refreshPromise: Promise<boolean> | null = null;
let _activePropertyId: number | null = null;

/** Lists & reports are scoped to this property (the API returns every property otherwise). */
export function setActiveProperty(id: number | null) {
  _activePropertyId = id;
}

// Called when refresh fails — shows quick re-login modal and retries
type SessionExpiredHandler = () => Promise<void>;
let _sessionExpiredHandler: SessionExpiredHandler | null = null;

export function setSessionExpiredHandler(fn: SessionExpiredHandler) {
  _sessionExpiredHandler = fn;
}

// ─── Token helpers ────────────────────────────────────────────────────────────

export function setTokens(access: string, refresh: string) {
  _accessToken = access;
  _refreshToken = refresh;
  // Persist in background
  try {
    AsyncStorage.setItem(KEY_ACCESS_TOKEN, access).catch(() => {});
  } catch {}
  try {
    AsyncStorage.setItem(KEY_REFRESH_TOKEN, refresh).catch(() => {});
  } catch {}
}

/** Absolute URL + auth header for raw downloads (files can't go through apiFetch's JSON parsing). */
export function apiRequestInfo(path: string): { url: string; headers: Record<string, string> } {
  const lang = i18n.language === 'km' ? 'kh' : null;
  const url = `${BASE_URL}${path}${lang && !/[?&]lang=/.test(path) ? `${path.includes('?') ? '&' : '?'}lang=${lang}` : ''}`;
  return { url, headers: _accessToken ? { Authorization: `Bearer ${_accessToken}` } : {} };
}

export function clearTokens() {
  _accessToken = null;
  _refreshToken = null;
  try {
    AsyncStorage.removeItem(KEY_ACCESS_TOKEN).catch(() => {});
  } catch {}
  try {
    AsyncStorage.removeItem(KEY_REFRESH_TOKEN).catch(() => {});
  } catch {}
}

/** Load persisted tokens from storage into memory. Returns tokens if found. */
export async function loadStoredTokens(): Promise<{
  access: string;
  refresh: string;
} | null> {
  try {
    const access = await AsyncStorage.getItem(KEY_ACCESS_TOKEN);
    const refresh = await AsyncStorage.getItem(KEY_REFRESH_TOKEN);
    if (access && refresh) {
      _accessToken = access;
      _refreshToken = refresh;
      return { access, refresh };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Error class ─────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

async function doRefresh(): Promise<boolean> {
  if (!_refreshToken) return false;
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: _refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.accessToken && data.refreshToken) {
      setTokens(data.accessToken, data.refreshToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ─── Core fetch ──────────────────────────────────────────────────────────────

async function parseBody(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

/** Build a query string from a params object, skipping empty values. */
export function toQuery(params: Record<string, unknown> = {}): string {
  const parts: string[] = [];
  Object.keys(params).forEach(k => {
    const v = params[k];
    if (v === undefined || v === null || v === '' || v === 'all') return;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Build multipart form data, skipping undefined/null values. Arrays repeat the key. */
export function toForm(fields: Record<string, unknown>): FormData {
  const form = new FormData();
  Object.keys(fields).forEach(k => {
    const v = fields[k];
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach(item => form.append(k, String(item)));
    else if (typeof v === 'object') form.append(k, JSON.stringify(v));
    else form.append(k, String(v));
  });
  return form;
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const makeRequest = async () => {
    const defaultHeaders: Record<string, string> = {};
    if (!isForm) defaultHeaders['Content-Type'] = 'application/json';
    if (_accessToken) {
      defaultHeaders.Authorization = `Bearer ${_accessToken}`;
    }
    // Server error messages in the app's language (`lang=kh`); English is the default
    const lang = i18n.language === 'km' ? 'kh' : null;
    const url = `${BASE_URL}${path}${lang && !/[?&]lang=/.test(path) ? `${path.includes('?') ? '&' : '?'}lang=${lang}` : ''}`;
    return fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers as Record<string, string>),
      },
    });
  };

  let res = await makeRequest();

  if (res.status === 401) {
    const wasAuthenticated = !!_refreshToken;

    // Step 1: try silent token refresh (only if we had tokens)
    if (_refreshToken) {
      if (!_refreshPromise) {
        _refreshPromise = doRefresh().finally(() => {
          _refreshPromise = null;
        });
      }
      const refreshed = await _refreshPromise;
      if (refreshed) {
        res = await makeRequest();
      }
    }

    // Step 2: if still 401 — only show quick re-login modal if user was authenticated.
    // If they weren't (e.g. the login request itself returned 401), just throw.
    if (res.status === 401) {
      if (wasAuthenticated && _sessionExpiredHandler) {
        try {
          await _sessionExpiredHandler(); // resolves when user re-logs in
          res = await makeRequest(); // retry with fresh tokens
        } catch {
          clearTokens();
          throw new ApiError(401, 'Session expired. Please log in again.');
        }
      } else {
        clearTokens();
        throw new ApiError(401, 'Session expired. Please log in again.');
      }
    }
  }

  const data = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(res.status, data?.message ?? 'Request failed');
  }
  return data as T;
}

export async function apiUpload<T = any>(
  path: string,
  formData: FormData,
  method = 'POST',
): Promise<T> {
  return apiFetch<T>(path, { method, body: formData });
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  lookupProperties: (username: string) =>
    apiFetch('/auth/lookup-properties', json('POST', { username })),
  login: (username: string, password: string, propertyId?: number) =>
    apiFetch('/auth/login', {
      method: 'POST',
      headers: { 'x-platform': 'mobile', 'x-device-id': DEVICE_ID },
      body: JSON.stringify({
        username,
        password,
        deviceId: DEVICE_ID,
        ...(propertyId != null ? { propertyId } : {}),
      }),
    }),
  /** Removes this device's push token first, then clears the refresh token on the server. */
  logout: () =>
    notificationsApi.unregisterToken().catch(() => {}).then(() => apiFetch('/auth/logout', { method: 'POST' })),
  /** Always answers success (even for unknown users). 429 = cooldown. */
  forgotPassword: (identifier: string) => apiFetch('/auth/forgot-password', json('POST', { identifier })),
  /** → `{ resetToken }` */
  verifyOtp: (identifier: string, otp: string) =>
    apiFetch('/auth/verify-otp', json('POST', { identifier, otp })).then((r: any) => r?.data?.resetToken ?? r?.resetToken),
  resetPassword: (identifier: string, resetToken: string, newPassword: string, confirmPassword: string) =>
    apiFetch('/auth/reset-password', json('POST', { identifier, resetToken, newPassword, confirmPassword })),
  switchProperty: (propertyId: number) =>
    apiFetch('/auth/switch-property', json('POST', { propertyId })),
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    apiFetch('/auth/change-password', json('POST', { currentPassword, newPassword, confirmPassword })),
};

export type ListParams = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  status?: string;
  [key: string]: unknown;
};

const list = (path: string, params: ListParams = {}) =>
  apiFetch(`${path}${toQuery({ limit: 200, ...params })}`);

/** Property-scoped list: adds the current property as `propertyId` unless the caller sets one. */
const scopedList = (path: string, params: ListParams = {}) =>
  list(path, { propertyId: _activePropertyId ?? undefined, ...params });

/** Legacy string query (`'status=Active'`) + active property scope. */
const legacyList = (path: string, qs: string) => {
  const prop = _activePropertyId != null ? `&propertyId=${_activePropertyId}` : '';
  return apiFetch(`${path}?limit=200${prop}${qs ? '&' + qs : ''}`);
};

const del = (path: string) => apiFetch(path, { method: 'DELETE' });

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersApi = {
  me: () => apiFetch('/users/me'),
  list: (params: ListParams = {}) => list('/users', params),
  get: (id: number) => apiFetch(`/users/${id}`),
  create: (body: { username: string; password: string; confirmPassword: string; roleId: number }) =>
    apiFetch('/users', json('POST', body)),
  update: (id: number, body: Record<string, unknown>) => apiFetch(`/users/${id}`, json('PATCH', body)),
  remove: (id: number) => del(`/users/${id}`),
  updateMe: (data: Record<string, any>) => apiFetch('/users/me', json('PATCH', data)),
  /** Properties assigned to a user. */
  properties: (id: number) => apiFetch(`/users/${id}/properties`),
  /** Replaces the user's assignments among *your* properties — send every checked id. */
  assignProperties: (id: number, propertyIds: number[]) =>
    apiFetch(`/users/${id}/properties`, json('POST', { propertyIds })),
};

// ─── Roles & permissions ──────────────────────────────────────────────────────
export const rolesApi = {
  list: (params: ListParams = {}) => list('/roles', params),
  get: (id: number) => apiFetch(`/roles/${id}`),
  create: (body: { name: string; description?: string }) => apiFetch('/roles', json('POST', body)),
  update: (id: number, body: { name?: string; description?: string }) => apiFetch(`/roles/${id}`, json('PATCH', body)),
  remove: (id: number) => del(`/roles/${id}`),
  /** Replaces all permissions of the role. */
  setPermissions: (roleId: number, permissionIds: number[]) =>
    apiFetch(`/roles/${roleId}/permissions`, json('POST', { permissionIds })),
  groupedPermissions: () => apiFetch('/permissions/grouped'),
};

// ─── Dashboard & Finance ──────────────────────────────────────────────────────
export const dashboardApi = {
  ownerMobile: () => apiFetch('/dashboard/owner-mobile'),
  overview: (propertyId: number | null = _activePropertyId) => apiFetch(`/dashboard/overview${toQuery({ propertyId })}`),
  /** `{ startDate, endDate }` (YYYY-MM-DD); without dates it covers all time. */
  balance: (params: Record<string, string> = {}) => apiFetch(`/finance/balance${toQuery(params)}`),
};

export const formOptionsApi = {
  get: (includes?: string[]) =>
    apiFetch(`/form-options/pms${includes?.length ? toQuery({ includes: includes.join(',') }) : ''}`),
};

// ─── Properties, settings & charges ───────────────────────────────────────────
export const propertiesApi = {
  list: () => apiFetch('/properties?limit=200'),
  get: (id: number) => apiFetch(`/properties/${id}`),
  create: (fields: Record<string, unknown>) => apiFetch('/properties', { method: 'POST', body: toForm(fields) }),
  /** Multipart so `logo` / `paymentQrCode` uploads work; also used for prices & tenancy settings. */
  update: (id: number, fields: Record<string, unknown>) =>
    apiFetch(`/properties/${id}`, { method: 'PATCH', body: toForm(fields) }),
  remove: (id: number) => del(`/properties/${id}`),
};

/** Recurring charges added to every tenant's invoice in the property (internet, garbage, …). */
export const chargesApi = {
  list: (propertyId: number, activeOnly = false) =>
    apiFetch(`/properties/${propertyId}/charges${activeOnly ? '?active=true' : ''}`),
  get: (propertyId: number, id: number) => apiFetch(`/properties/${propertyId}/charges/${id}`),
  create: (propertyId: number, body: { name: string; amount: number; isActive?: boolean }) =>
    apiFetch(`/properties/${propertyId}/charges`, json('POST', body)),
  update: (propertyId: number, id: number, body: { name?: string; amount?: number; isActive?: boolean }) =>
    apiFetch(`/properties/${propertyId}/charges/${id}`, json('PATCH', body)),
  remove: (propertyId: number, id: number) => del(`/properties/${propertyId}/charges/${id}`),
};

// ─── Units & tenancy (move in / move out) ─────────────────────────────────────
export type UnitInput = {
  unitCode?: string;
  floorNumber?: string;
  roomType?: string;
  size?: string;
  monthlyRent?: number;
  dailyRent?: number;
  weeklyRent?: number;
  depositAmount?: number;
  parkingFee?: number;
  internetFee?: number;
  garbageFee?: number;
  managementFee?: number;
  additionalFee?: number;
  startElectricityReading?: number;
  startWaterReading?: number;
  /** Only Available / Reserved / Maintenance — Occupied is set by move-in. */
  status?: string;
  notes?: string;
  propertyId?: number;
};

export const unitsApi = {
  list: (params: ListParams = {}) => scopedList('/units', params),
  get: (id: number) => apiFetch(`/units/${id}`),
  create: (body: UnitInput) => apiFetch('/units', json('POST', body)),
  update: (id: number, body: UnitInput) => apiFetch(`/units/${id}`, json('PATCH', body)),
  remove: (id: number) => del(`/units/${id}`),
};

export const tenancyApi = {
  /** → `{ contract, firstInvoice }` (firstInvoice is null when not created). */
  moveIn: (unitId: number, body: MoveInBody) =>
    apiFetch(`/units/${unitId}/move-in`, json('POST', body)).then((r: any) => r?.data ?? r),
  /** Calculates the settlement without saving anything. */
  previewMoveOut: (unitId: number, body: MoveOutBody): Promise<Settlement> =>
    apiFetch(`/units/${unitId}/move-out/preview`, json('POST', body)).then((r: any) => r?.data?.settlement ?? r?.settlement),
  /** Ends the tenancy, creates the final invoice and handles the deposit. Same body as the preview. */
  moveOut: (unitId: number, body: MoveOutBody): Promise<Settlement> =>
    apiFetch(`/units/${unitId}/move-out`, json('POST', body)).then((r: any) => r?.data?.settlement ?? r?.settlement),
};

// ─── Tenants & Occupants ──────────────────────────────────────────────────────
export type TenantInput = {
  name: string;
  phoneNumber: string;
  gender?: Gender | '' | null;
  /** ID card number (the photo is `idCardPassport`). */
  idNumber?: string;
  emergencyContact?: string;
  occupation?: string;
  status?: string;
  plateNumber?: string;
  vehicleType?: string;
  vehicleModel?: string;
  propertyId?: number;
};

export const tenantsApi = {
  list: (params: ListParams = {}) => scopedList('/tenants', params),
  get: (id: number) => apiFetch(`/tenants/${id}`),
  /** `range` is required: last_month | 3_months | 6_months | 1_year. Rows include balance fields. */
  invoices: (id: number, range: string) => apiFetch(`/tenants/${id}/invoices?range=${range}`),
  /** → `{ tenant, credentials: { username, password, qrDataURL } }` — the password is shown only once. */
  create: (data: TenantInput): Promise<{ tenant: any; credentials: TenantCredentials | null }> =>
    apiFetch('/tenants', { method: 'POST', body: toForm(data) }).then((r: any) => ({
      tenant: r?.data?.tenant ?? null,
      credentials: r?.data?.credentials ?? null,
    })),
  update: (id: number, data: Partial<TenantInput>) =>
    apiFetch(`/tenants/${id}`, { method: 'PATCH', body: toForm(data) }),
  remove: (id: number) => del(`/tenants/${id}`),
  /** New password + QR (the old password stops working). Same credentials shape as create. */
  regenerateLogin: (id: number): Promise<TenantCredentials | null> =>
    apiFetch(`/tenants/${id}/regenerate-qr`, { method: 'POST' }).then((r: any) => r?.data?.credentials ?? r?.credentials ?? null),
};

export type OccupantInput = {
  tenantId: number;
  name: string;
  relationship?: string;
  phoneNumber?: string;
  plateNumber?: string;
  vehicleType?: string;
  vehicleModel?: string;
};

export const occupantsApi = {
  list: (params: ListParams = {}) => list('/occupants', params),
  create: (data: OccupantInput) => apiFetch('/occupants', { method: 'POST', body: toForm(data) }),
  update: (id: number, data: Partial<OccupantInput>) =>
    apiFetch(`/occupants/${id}`, { method: 'PATCH', body: toForm(data) }),
  remove: (id: number) => del(`/occupants/${id}`),
};

// ─── Contracts (formal) ───────────────────────────────────────────────────────
export type ContractInput = {
  tenantId: number;
  unitId: number;
  startDate: string;
  endDate?: string;
  monthlyRent: number;
  depositAmount?: number;
  terms?: string;
  billingStrategy?: BillingStrategy;
  rentCycle?: 'day' | 'week' | 'month';
  rentAmount?: number;
  status?: string;
};

export const contractsApi = {
  /** `qs` kept for backwards compatibility: contractsApi.list('status=Active'). Params accept `kind`. */
  list: (qsOrParams: string | (ListParams & { kind?: ContractKind }) = '') =>
    typeof qsOrParams === 'string'
      ? legacyList('/contracts', qsOrParams)
      : scopedList('/contracts', qsOrParams),
  get: (id: number) => apiFetch(`/contracts/${id}`),
  create: (data: ContractInput) => apiFetch('/contracts', { method: 'POST', body: toForm(data) }),
  update: (id: number, data: Partial<ContractInput>) =>
    apiFetch(`/contracts/${id}`, { method: 'PATCH', body: toForm(data) }),
  /** Only ends the contract — use tenancyApi.moveOut when the tenant leaves (final bill + deposit). */
  terminate: (id: number) => apiFetch(`/contracts/${id}/terminate`, { method: 'PATCH' }),
  remove: (id: number) => del(`/contracts/${id}`),
};

// ─── Meter readings ───────────────────────────────────────────────────────────
export type UtilityInput = {
  unitId: number;
  type: 'electricity' | 'water';
  currentReading: number;
  previousReading?: number;
  readingDate?: string;
  note?: string;
};

export const utilityApi = {
  /** Rows include `invoiceId` — non-null means billed, so edit/delete are blocked. */
  list: (params: ListParams = {}) => list('/utility-readings', params),
  get: (id: number) => apiFetch(`/utility-readings/${id}`),
  /** Pre-fill for the reading / invoice form: context, previous readings, prices, fees, billing info. */
  init: (unitId: number, billingMonth?: string) =>
    apiFetch(`/utility-readings/init/${unitId}${toQuery({ billingMonth })}`),
  /** @deprecated name kept for existing screens — same as `init`. */
  lastReading: (unitId: number) => apiFetch(`/utility-readings/init/${unitId}`),
  /** Last recorded meter values for a unit (move-in / move-out pre-fill). */
  last: (unitId: number) => apiFetch(`/utility-readings/last-reading/${unitId}`),
  create: (body: UtilityInput) => apiFetch('/utility-readings', json('POST', body)),
  update: (id: number, body: Partial<UtilityInput>) => apiFetch(`/utility-readings/${id}`, json('PATCH', body)),
  remove: (id: number) => del(`/utility-readings/${id}`),
  /** Both meters at once (recommended). → `{ readings: [...] }` */
  bulk: (body: {
    unitId: number;
    electricityReading?: number;
    waterReading?: number;
    readingDate?: string;
    note?: string;
  }) => apiFetch('/utility-readings/bulk', json('POST', body)),
};

// ─── Invoices ─────────────────────────────────────────────────────────────────
/** Invoice `status` values. Use `paymentStatus` + `remainingAmount` for "who paid what". */
export const INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'];

export const invoicesApi = {
  list: (qsOrParams: string | ListParams = '') =>
    typeof qsOrParams === 'string'
      ? legacyList('/invoices', qsOrParams)
      : scopedList('/invoices', qsOrParams),
  get: (id: number) => apiFetch(`/invoices/${id}`),
  /** Manual invoice (corrections / missed by the daily job). One per tenancy per billingMonth. */
  create: (body: { contractId: number; billingMonth?: string; dueDate?: string; discount?: number }) =>
    apiFetch('/invoices', json('POST', body)),
  /** Amounts can't be edited — change the total with `discount`, or cancel. */
  update: (id: number, body: { status?: InvoiceStatus; discount?: number; note?: string; dueDate?: string }) =>
    apiFetch(`/invoices/${id}`, json('PATCH', body)),
  /** @deprecated use `update(id, { status })` */
  updateStatus: (id: number, status: string) => apiFetch(`/invoices/${id}`, json('PATCH', { status })),
  /** Cancelling releases the invoice's meter readings onto the next invoice. */
  cancel: (id: number) => apiFetch(`/invoices/${id}`, json('PATCH', { status: 'cancelled' })),
  remove: (id: number) => del(`/invoices/${id}`),
  /** Re-sends the Khmer PDF + KHQR to the tenant on Telegram (400 if not linked). */
  sendTelegram: (id: number) => apiFetch(`/invoices/${id}/send-telegram`, { method: 'POST' }),
  /** Authenticated PDF endpoint path (needs the bearer token — fetch it, don't open it directly). */
  pdfPath: (id: number, download = false) => `/invoices/${id}/pdf${download ? '?download=true' : ''}`,
};

// ─── Payments ─────────────────────────────────────────────────────────────────
export type PaymentInput = {
  invoiceId: number;
  amount: number;
  paymentDate?: string;
  paymentMethod?: PaymentMethod;
  /** Bank / KHQR reference */
  transactionId?: string;
  note?: string;
};

export const paymentsApi = {
  /** e.g. `{ status: 'pending' }` for the verify queue. Rows include invoice.unit + invoice.tenant. */
  list: (params: ListParams = {}) => scopedList('/payments', params),
  get: (id: number) => apiFetch(`/payments/${id}`),
  /** Staff payments are verified straight away. 400 on overpayment (message includes the max). */
  create: (body: PaymentInput) =>
    apiFetch('/payments', { method: 'POST', body: toForm(body) }).then((r: any) => r?.data?.payment ?? r?.payment ?? r),
  verify: (id: number, status: 'verified' | 'rejected', note?: string) =>
    apiFetch(`/payments/${id}/verify`, json('POST', { status, note })),
  /** Can change amount, date, method, reference, note — not status or invoiceId. */
  update: (id: number, body: Partial<Omit<PaymentInput, 'invoiceId'>>) =>
    apiFetch(`/payments/${id}`, json('PATCH', body)),
  remove: (id: number) => del(`/payments/${id}`),
  /** Count for the "to verify" badge. */
  pendingCount: async (): Promise<number> => {
    const r: any = await scopedList('/payments', { status: 'pending', limit: 1 });
    return num(r?.total ?? r?.result ?? 0);
  },
};

/** Amount to pre-fill in "Record payment": what's left minus payments waiting for verification. */
export function payableAmount(inv: { remainingAmount?: Money; pendingAmount?: Money; totalAmount?: Money } | null | undefined): number {
  if (!inv) return 0;
  const remaining = inv.remainingAmount != null ? num(inv.remainingAmount) : num(inv.totalAmount);
  return Math.max(0, Math.round((remaining - num(inv.pendingAmount)) * 100) / 100);
}

// ─── Maintenance ──────────────────────────────────────────────────────────────
export type MaintenanceInput = {
  unitId: number;
  type: 'plumbing' | 'electrical' | 'structural' | 'appliance' | 'cleaning' | 'other';
  description: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  cost?: number;
  isBillable?: boolean;
  note?: string;
};

export const maintenanceApi = {
  list: (qsOrParams: string | ListParams = '') =>
    typeof qsOrParams === 'string'
      ? legacyList('/maintenance', qsOrParams)
      : scopedList('/maintenance', qsOrParams),
  get: (id: number) => apiFetch(`/maintenance/${id}`),
  create: (body: MaintenanceInput) => apiFetch('/maintenance', { method: 'POST', body: toForm(body) }),
  update: (id: number, body: Partial<MaintenanceInput>) => apiFetch(`/maintenance/${id}`, json('PATCH', body)),
  assign: (id: number, assignedTo: number) => apiFetch(`/maintenance/${id}/assign`, json('PATCH', { assignedTo })),
  start: (id: number) => apiFetch(`/maintenance/${id}/start`, { method: 'PATCH' }),
  /** A cost records an expense automatically; billable → next invoice (or `createInvoice`). */
  complete: (id: number, body?: { cost?: number; note?: string; isBillable?: boolean }) =>
    apiFetch(`/maintenance/${id}/complete`, json('PATCH', body)),
  cancel: (id: number) => apiFetch(`/maintenance/${id}/cancel`, { method: 'PATCH' }),
  /** Stand-alone maintenance invoice (INV-MANT-…, due in 3 days). */
  createInvoice: (id: number) => apiFetch(`/maintenance/${id}/invoice`, { method: 'POST' }),
  remove: (id: number) => del(`/maintenance/${id}`),
};

// ─── Expenses & income (transactions) ─────────────────────────────────────────
export type TransactionInput = {
  categoryId?: number;
  /** Use instead of categoryId to create/use a category by name. */
  categoryName?: string;
  amount: number;
  description: string;
  type?: 'income' | 'expense';
  transactionDate?: string;
  /** Send unitId for a room (property is filled in), propertyId for property-wide, or neither. */
  propertyId?: number;
  unitId?: number | null;
  vendor?: string;
  note?: string;
};

export const transactionsApi = {
  /** `from`/`to` (YYYY-MM-DD) filter on transactionDate. Accepts propertyId / propertyIds. */
  list: (params: ListParams & { type?: 'income' | 'expense'; from?: string; to?: string } = {}) =>
    scopedList('/transactions', params),
  get: (id: number) => apiFetch(`/transactions/${id}`),
  create: (body: TransactionInput) => apiFetch('/transactions', json('POST', body)),
  update: (id: number, body: Partial<TransactionInput>) => apiFetch(`/transactions/${id}`, json('PATCH', body)),
  remove: (id: number) => del(`/transactions/${id}`),
};

export const categoriesApi = {
  list: (params: ListParams & { type?: 'income' | 'expense' } = {}) => list('/transaction-categories', params),
  create: (body: { name: string; type: 'income' | 'expense' }) => apiFetch('/transaction-categories', json('POST', body)),
  update: (id: number, body: { name?: string; type?: 'income' | 'expense' }) =>
    apiFetch(`/transaction-categories/${id}`, json('PATCH', body)),
  /** System categories (isSystem) can't be deleted. */
  remove: (id: number) => del(`/transaction-categories/${id}`),
};

// ─── Reports ──────────────────────────────────────────────────────────────────
/** Scope: one property (default: the current one), several (`propertyIds`), or `'all'` assigned ones. */
export type ReportScope = { propertyId?: number | 'all' | null; propertyIds?: number[] };

const scopeParams = (s: ReportScope = {}) => {
  if (s.propertyIds?.length) return { propertyIds: s.propertyIds.join(',') };
  if (s.propertyId === 'all') return {};
  return { propertyId: s.propertyId ?? _activePropertyId ?? undefined };
};

const report = (name: string, params: Record<string, unknown> = {}, scope?: ReportScope) =>
  apiFetch(`/reports/${name}${toQuery({ ...scopeParams(scope), ...params })}`);

/** Unwrap `{ status, data }` → data */
const rdata = (r: any) => r?.data ?? r;

export const reportsApi = {
  // ── KPI / classic reports (from/to = YYYY-MM-DD unless noted; send both or neither) ──
  monthlyFor: (yearMonth: string, scope?: ReportScope) => report('monthly-summary', { yearMonth }, scope),
  occupancySummary: (scope?: ReportScope) => report('occupancy-summary', {}, scope),
  /** from/to = YYYY-MM, both required. */
  occupancyTrend: (from: string, to: string, scope?: ReportScope) => report('occupancy-trend', { from, to }, scope),
  categoryBreakdown: (from?: string, to?: string, type?: 'income' | 'expense', scope?: ReportScope) =>
    report('category-breakdown', { from, to, type }, scope),
  unpaidInvoices: (asOf?: string, scope?: ReportScope) => report('unpaid-invoices', { asOf }, scope),
  tenantBalances: (scope?: ReportScope) => report('tenant-balances', {}, scope),
  paymentMethods: (from?: string, to?: string, scope?: ReportScope) => report('payment-methods', { from, to }, scope),
  maintenanceSummary: (from?: string, to?: string, scope?: ReportScope) => report('maintenance-summary', { from, to }, scope),
  rentRoll: (scope?: ReportScope) => report('rent-roll', {}, scope),
  delinquency: (scope?: ReportScope) => report('delinquency', {}, scope),
  expenses: (from?: string, to?: string, scope?: ReportScope) => report('expenses', { from, to }, scope),

  // ── Client monthly reports (from/to = YYYY-MM, max 36 months) ──
  /** Income, expenses, net and occupancy per month. */
  dashboard: (from?: string, to?: string, scope?: ReportScope): Promise<DashboardReport> =>
    report('dashboard', { from, to }, scope).then(rdata),
  /** Every room + tenant, with paid / owed / utility usage per month. */
  roomTenants: (from?: string, to?: string, scope?: ReportScope) => report('room-tenants', { from, to }, scope).then(rdata),
  /** Expense categories × months + detail lines. */
  expenseMatrix: (from?: string, to?: string, opts: { hideEmpty?: boolean } = {}, scope?: ReportScope) =>
    report('expense-matrix', { from, to, hideEmpty: opts.hideEmpty ? 'true' : undefined }, scope).then(rdata),
  /** Who paid / partly paid / didn't pay, and how much is left. */
  paymentStatus: (
    from?: string, to?: string,
    opts: { status?: 'paid' | 'partial' | 'unpaid'; overdueOnly?: boolean } = {},
    scope?: ReportScope,
  ): Promise<PaymentStatusReport> =>
    report('payment-status', { from, to, status: opts.status, overdueOnly: opts.overdueOnly ? 'true' : undefined }, scope).then(rdata),
  /**
   * Excel download path (needs the bearer token). `name` = dashboard | room-tenants | expense-matrix |
   * payment-status (adds format=xlsx) or export (full workbook).
   */
  excelPath: (name: 'dashboard' | 'room-tenants' | 'expense-matrix' | 'payment-status' | 'export',
    params: { from?: string; to?: string; lang?: 'kh' | 'en' } = {}, scope?: ReportScope) =>
    `/reports/${name}${toQuery({ ...scopeParams(scope), ...params, format: name === 'export' ? undefined : 'xlsx' })}`,
};

// ─── Announcements & Templates ────────────────────────────────────────────────
export type AnnouncementInput = {
  title: string;
  content: string;
  audience: string;
  type?: string;
  propertyId?: number | null;
  unitId?: number | null;
  unitIds?: number[];
  templateId?: number;
};

export const announcementsApi = {
  list: (params: ListParams = {}) => scopedList('/announcements', { limit: 100, ...params }),
  get: (id: number) => apiFetch(`/announcements/${id}`),
  create: (data: AnnouncementInput) =>
    apiFetch('/announcements', { method: 'POST', body: toForm({ type: 'general', ...data }) }),
  update: (id: number, data: Partial<AnnouncementInput>) =>
    apiFetch(`/announcements/${id}`, { method: 'PATCH', body: toForm(data) }),
  remove: (id: number) => del(`/announcements/${id}`),
};

export type TemplateInput = { name: string; title: string; content: string; audience?: string; type?: string };

export const templatesApi = {
  list: (params: ListParams = {}) => scopedList('/announcement-templates', { limit: 100, ...params }),
  get: (id: number) => apiFetch(`/announcement-templates/${id}`),
  // JSON (no image upload on mobile) — parsed whether or not the route has multipart middleware
  create: (data: TemplateInput) =>
    apiFetch('/announcement-templates', json('POST', { audience: 'all', type: 'general', propertyId: _activePropertyId ?? undefined, ...data })),
  update: (id: number, data: Partial<TemplateInput>) =>
    apiFetch(`/announcement-templates/${id}`, json('PATCH', data)),
  remove: (id: number) => del(`/announcement-templates/${id}`),
};

// ─── Push notifications ───────────────────────────────────────────────────────
export const notificationsApi = {
  list: () => apiFetch('/notifications?limit=50'),
  /** Only users of your properties (403 otherwise). */
  send: (body: {
    title: string;
    body: string;
    type?: string;
    userId?: number;
    userIds?: number[];
    sendToAll?: boolean;
    imageUrl?: string;
    sendToTelegram?: boolean;
  }) => apiFetch('/notifications', json('POST', body)),
  markRead: (id: number) => apiFetch(`/notifications/${id}/read`, { method: 'PATCH' }),
  registerToken: (token: string) =>
    apiFetch('/notifications/token', json('POST', { token, fcmToken: token, deviceId: DEVICE_ID })),
  unregisterToken: (token?: string) =>
    apiFetch('/notifications/token', json('DELETE', token ? { token, fcmToken: token } : undefined)),
};

export const deviceApi = {
  /** Saves the FCM token (POST /notifications/token); falls back to the older /users/me field. */
  registerToken: (fcmToken: string) =>
    notificationsApi.registerToken(fcmToken).catch(() => apiFetch('/users/me', json('PATCH', { fcmToken }))),
};

// ─── Telegram link ────────────────────────────────────────────────────────────
export const telegramApi = {
  /** → `{ isLinked, telegramUsername, firstName?, lastName? }` */
  status: () => apiFetch('/telegram/status').then(rdata),
  /** → `{ deepLink, token, expiresIn }` — open deepLink, then poll status every 3 s. */
  generateLink: () => apiFetch('/telegram/generate-link', { method: 'POST' }).then(rdata),
  unlink: () => apiFetch('/telegram/unlink', { method: 'POST' }),
};

// ─── Response helpers ─────────────────────────────────────────────────────────
/** Pull the first array found under `data` (API nests lists under varying keys). */
export function pickList<T = any>(res: any, ...keys: string[]): T[] {
  const d = res?.data ?? res;
  for (const k of keys) {
    if (Array.isArray(d?.[k])) return d[k];
  }
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') {
    const arr = Object.values(d).find(v => Array.isArray(v));
    if (arr) return arr as T[];
  }
  return [];
}

/** Pull a single entity from `data` (API returns `{ data: { tenants: {...} } }`). */
export function pickOne<T = any>(res: any, ...keys: string[]): T | null {
  const d = res?.data ?? res;
  for (const k of keys) {
    if (d?.[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) return d[k];
  }
  if (d && typeof d === 'object') {
    const obj = Object.values(d).find(v => v && typeof v === 'object' && !Array.isArray(v));
    if (obj) return obj as T;
  }
  return null;
}
