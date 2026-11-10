import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { maintenanceApi, notificationsApi, pickList } from '../services/api';
import { useAuth } from './AuthContext';

type BadgeContextType = {
  requestCount:     number;
  notificationCount: number;
  refreshBadges:    () => void;
};

const BadgeContext = createContext<BadgeContextType>({
  requestCount:      0,
  notificationCount: 0,
  refreshBadges:     () => {},
});

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const [requestCount,     setRequestCount]     = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);

  const fetchBadges = useCallback(async () => {
    try {
      const [maintenanceRes, notifRes] = await Promise.allSettled([
        maintenanceApi.list(),
        notificationsApi.list(),
      ]);

      if (maintenanceRes.status === 'fulfilled') {
        const items: any[] = pickList(maintenanceRes.value, 'maintenanceRequests', 'maintenances');
        const active = items.filter(
          (r: any) => r.status !== 'completed' && r.status !== 'cancelled',
        );
        setRequestCount(active.length);
      }

      if (notifRes.status === 'fulfilled') {
        const items: any[] = pickList(notifRes.value, 'notifications');
        const unread = items.filter((n: any) => !n.readAt && !n.isRead);
        setNotificationCount(unread.length);
      }
    } catch {
      // silently fail — badge counts are non-critical
    }
  }, []);

  const { isAuthenticated, propertyId } = useAuth();
  useEffect(() => {
    if (isAuthenticated) fetchBadges();
  }, [fetchBadges, isAuthenticated, propertyId]);

  return (
    <BadgeContext.Provider
      value={{ requestCount, notificationCount, refreshBadges: fetchBadges }}
    >
      {children}
    </BadgeContext.Provider>
  );
}

export function useBadges() {
  return useContext(BadgeContext);
}
