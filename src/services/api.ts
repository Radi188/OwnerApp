import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'https://testing-api.bongclock.cloud/api/v1';

const DEVICE_ID = 'owner-mobile-' + Math.random().toString(36).substring(2, 10);
const KEY_ACCESS_TOKEN = '@owner:access';
const KEY_REFRESH_TOKEN = '@owner:refresh';

let _accessToken: string | null = null;
let _refreshToken: string | null = null;
let _refreshPromise: Promise<boolean> | null = null;

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

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const makeRequest = async () => {
    const defaultHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (_accessToken) {
      defaultHeaders.Authorization = `Bearer ${_accessToken}`;
    }
    return fetch(`${BASE_URL}${path}`, {
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

  const data = await res.json();
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
  const headers: Record<string, string> = {};
  if (_accessToken) {
    headers.Authorization = `Bearer ${_accessToken}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(res.status, data?.message ?? 'Upload failed');
  }
  return data as T;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  lookupProperties: (username: string) =>
    apiFetch('/auth/lookup-properties', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),
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
  logout: () => apiFetch('/auth/logout', { method: 'POST' }),
  changePassword: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) =>
    apiFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    }),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersApi = {
  me: () => apiFetch('/users/me'),
  list: () => apiFetch('/users?limit=200'),
  updateMe: (data: Record<string, any>) =>
    apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
};

// ─── Dashboard & Finance ──────────────────────────────────────────────────────
export const dashboardApi = {
  ownerMobile: () => apiFetch('/dashboard/owner-mobile'),
  overview: () => apiFetch('/dashboard/overview'),
  balance: (params: Record<string, string> = {}) => {
    const qs = Object.keys(params).length
      ? '?' + new URLSearchParams(params).toString()
      : '';
    return apiFetch(`/finance/balance${qs}`);
  },
};

// ─── Properties & Units ───────────────────────────────────────────────────────
export const propertiesApi = {
  list: () => apiFetch('/properties?limit=200'),
  get: (id: number) => apiFetch(`/properties/${id}`),
};

export const unitsApi = {
  get: (id: number) => apiFetch(`/units/${id}`),
};

// ─── Tenants ──────────────────────────────────────────────────────────────────
export const tenantsApi = {
  list: () => apiFetch('/tenants?limit=200'),
  get: (id: number) => apiFetch(`/tenants/${id}`),
  invoices: (id: number, range: string) =>
    apiFetch(`/tenants/${id}/invoices?range=${range}`),
  create: (data: {
    name: string;
    phoneNumber: string;
    emergencyContact?: string;
    occupation?: string;
    status?: string;
  }) => {
    const form = new FormData();
    form.append('name', data.name);
    form.append('phoneNumber', data.phoneNumber);
    if (data.emergencyContact)
      form.append('emergencyContact', data.emergencyContact);
    if (data.occupation) form.append('occupation', data.occupation);
    if (data.status) form.append('status', data.status ?? 'Active');
    return apiUpload('/tenants', form);
  },
};

// ─── Contracts ────────────────────────────────────────────────────────────────
export const contractsApi = {
  list: (qs = '') => apiFetch(`/contracts?limit=200${qs ? '&' + qs : ''}`),
};

// ─── Utility Readings ─────────────────────────────────────────────────────────
export const utilityApi = {
  lastReading: (unitId: number) => apiFetch(`/utility-readings/init/${unitId}`),
  bulk: (body: {
    unitId: number;
    electricityReading?: number;
    waterReading?: number;
    readingDate?: string;
    note?: string;
  }) =>
    apiFetch('/utility-readings/bulk', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

// ─── Invoices ─────────────────────────────────────────────────────────────────
export const invoicesApi = {
  list: (qs = '') => apiFetch(`/invoices?limit=200${qs ? '&' + qs : ''}`),
  create: (body: {
    contractId: number;
    billingMonth?: string;
    dueDate?: string;
    discount?: number;
  }) => apiFetch('/invoices', { method: 'POST', body: JSON.stringify(body) }),
};

// ─── Maintenance ──────────────────────────────────────────────────────────────
export const maintenanceApi = {
  list: (qs = '') => apiFetch(`/maintenance?limit=200${qs ? '&' + qs : ''}`),
  get: (id: number) => apiFetch(`/maintenance/${id}`),
  assign: (id: number, assignedTo: number) =>
    apiFetch(`/maintenance/${id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ assignedTo }),
    }),
  start: (id: number) =>
    apiFetch(`/maintenance/${id}/start`, { method: 'PATCH' }),
  complete: (
    id: number,
    body?: { cost?: number; note?: string; isBillable?: boolean },
  ) =>
    apiFetch(`/maintenance/${id}/complete`, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),
  cancel: (id: number) =>
    apiFetch(`/maintenance/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' }),
    }),
};

// ─── Reports ──────────────────────────────────────────────────────────────────
export const reportsApi = {
  paymentMethods: () => apiFetch('/reports/payment-methods'),
  maintenanceSummary: () => apiFetch('/reports/maintenance-summary'),
  categoryBreakdown: () => apiFetch('/reports/category-breakdown'),
  tenantBalances: () => apiFetch('/reports/tenant-balances'),
  financialSummary: (from?: string, to?: string) => {
    const qs = from && to ? `?from=${from}&to=${to}` : '';
    return apiFetch(`/reports/financial-summary${qs}`);
  },
  unpaidInvoices: () => apiFetch('/reports/unpaid-invoices'),
  occupancySummary: () => apiFetch('/reports/occupancy-summary'),
  occupancyTrend: (from: string, to: string) =>
    apiFetch(`/reports/occupancy-trend?from=${from}&to=${to}`),
  monthlySummary: (from?: string, to?: string) => {
    const qs = from && to ? `?from=${from}&to=${to}` : '';
    return apiFetch(`/reports/monthly-summary${qs}`);
  },
};

// ─── Announcements ────────────────────────────────────────────────────────────
export const announcementsApi = {
  list: () => apiFetch('/announcements?limit=100'),
  get: (id: number) => apiFetch(`/announcements/${id}`),
  create: (data: {
    title: string;
    content: string;
    audience: string;
    unitIds?: number[];
  }) => {
    const form = new FormData();
    form.append('title', data.title);
    form.append('content', data.content);
    form.append('audience', data.audience);
    data.unitIds?.forEach(id => form.append('unitIds', String(id)));
    return apiUpload('/announcements', form);
  },
};

// ─── Device Token ─────────────────────────────────────────────────────────────
export const deviceApi = {
  registerToken: (fcmToken: string) =>
    apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify({ fcmToken }) }),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsApi = {
  list: () => apiFetch('/notifications?limit=50'),
  send: (body: {
    title: string;
    body: string;
    type?: string;
    userId?: number;
    userIds?: number[];
    sendToAll?: boolean;
  }) =>
    apiFetch('/notifications', { method: 'POST', body: JSON.stringify(body) }),
  markRead: (id: number) =>
    apiFetch(`/notifications/${id}/read`, { method: 'PATCH' }),
};
