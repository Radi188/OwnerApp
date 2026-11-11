import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

export function navigate(name: string, params?: object) {
  if (navigationRef.isReady()) {
    (navigationRef.navigate as (n: string, p?: object) => void)(name, params);
  }
}

/** `data` of an app / push notification may arrive as an object or a JSON string. */
function dataOf(raw: any): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

/**
 * Where a notification should take staff (FRONTEND_UPDATE 2026-11-11 §11):
 * payment_pending → the invoice (verify / reject there) or Billing → Payments; else Notifications.
 * Returns true when it navigated somewhere specific.
 */
export function openNotificationTarget(type?: string, rawData?: any): boolean {
  const data = dataOf(rawData);
  const kind = String(type ?? data.type ?? '').toLowerCase();
  if (kind.startsWith('payment_')) {
    const invoiceId = Number(data.invoiceId);
    if (invoiceId) navigate('InvoiceDetail', { invoiceId });
    else navigate('Main', { screen: 'Billing', params: { tab: 'payments' } });
    return true;
  }
  return false;
}
