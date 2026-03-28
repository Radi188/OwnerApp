import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  setTokens,
  clearTokens,
  setSessionExpiredHandler,
  authApi,
} from '../services/api';

const KEY_PROPERTY_ID   = '@owner:propertyId';
const KEY_PROPERTY_NAME = '@owner:propertyName';

export type AuthUser = {
  id: number;
  username: string;
  roleId: number;
  isActive: boolean;
  isBiometrics: boolean;
  role?: { id: number; name: string; description?: string };
  settings?: { language?: string; theme?: string; notify?: boolean; deviceId?: string };
  tenant?: any;
};

type AuthContextType = {
  user:              AuthUser | null;
  propertyId:        number | null;
  propertyName:      string | null;
  isAuthenticated:   boolean;
  quickLoginVisible: boolean;
  login:             (user: AuthUser, accessToken: string, refreshToken: string, propertyId?: number, propertyName?: string) => void;
  logout:            () => void;
  updateUser:        (user: AuthUser) => void;
  submitQuickLogin:  (password: string) => Promise<void>;
  cancelQuickLogin:  () => void;
};

const AuthContext = createContext<AuthContextType>({
  user:              null,
  propertyId:        null,
  propertyName:      null,
  isAuthenticated:   false,
  quickLoginVisible: false,
  login:             () => {},
  logout:            () => {},
  updateUser:        () => {},
  submitQuickLogin:  async () => {},
  cancelQuickLogin:  () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,              setUser]              = useState<AuthUser | null>(null);
  const [propertyId,        setPropertyId]        = useState<number | null>(null);
  const [propertyName,      setPropertyName]      = useState<string | null>(null);
  const [quickLoginVisible, setQuickLoginVisible] = useState(false);

  // Restore persisted property selection on mount
  useEffect(() => {
    AsyncStorage.multiGet([KEY_PROPERTY_ID, KEY_PROPERTY_NAME]).then(pairs => {
      const pid  = pairs[0][1];
      const pname = pairs[1][1];
      if (pid)   setPropertyId(Number(pid));
      if (pname) setPropertyName(pname);
    }).catch(() => {});
  }, []);

  const pendingRef = useRef<{ resolve: () => void; reject: () => void } | null>(null);
  // Use a ref so the session handler (registered once) always sees the latest user
  const userRef = useRef<AuthUser | null>(null);

  // Register the global 401-expired handler once on mount
  useEffect(() => {
    setSessionExpiredHandler(() =>
      new Promise<void>((resolve, reject) => {
        // If no user is logged in (Splash / Login screens) silently reject
        // so api.ts clears tokens and throws — those screens handle it already
        if (!userRef.current) {
          reject();
          return;
        }
        pendingRef.current = { resolve, reject };
        setQuickLoginVisible(true);
      }),
    );
  }, []);

  // Keep userRef in sync so the session handler always has the latest value
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // ── Auth actions ─────────────────────────────────────────────────────────
  const login = useCallback((u: AuthUser, accessToken: string, refreshToken: string, pid?: number, pname?: string) => {
    setTokens(accessToken, refreshToken);
    setUser(u);
    setPropertyId(pid ?? null);
    setPropertyName(pname ?? null);
    if (pid != null) {
      AsyncStorage.setItem(KEY_PROPERTY_ID,   String(pid)).catch(() => {});
      AsyncStorage.setItem(KEY_PROPERTY_NAME, pname ?? '').catch(() => {});
    } else {
      AsyncStorage.multiRemove([KEY_PROPERTY_ID, KEY_PROPERTY_NAME]).catch(() => {});
    }
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    setPropertyId(null);
    setPropertyName(null);
    AsyncStorage.multiRemove([KEY_PROPERTY_ID, KEY_PROPERTY_NAME]).catch(() => {});
  }, []);

  const updateUser = useCallback((u: AuthUser) => setUser(u), []);

  // ── Quick re-login (called from QuickLoginModal) ──────────────────────────
  const submitQuickLogin = useCallback(async (password: string) => {
    if (!user) throw new Error('No active user');
    const res = await authApi.login(user.username, password, propertyId ?? undefined);
    const u   = res?.data?.user ?? res?.user;
    const at  = res?.accessToken  ?? res?.data?.accessToken;
    const rt  = res?.refreshToken ?? res?.data?.refreshToken;
    if (u && at && rt) {
      setTokens(at, rt);
      setUser(u);
      setQuickLoginVisible(false);
      pendingRef.current?.resolve();
      pendingRef.current = null;
    } else {
      throw new Error('Invalid credentials');
    }
  }, [user, propertyId]);

  const cancelQuickLogin = useCallback(() => {
    setQuickLoginVisible(false);
    pendingRef.current?.reject();
    pendingRef.current = null;
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        propertyId,
        propertyName,
        isAuthenticated:   !!user,
        quickLoginVisible,
        login,
        logout,
        updateUser,
        submitQuickLogin,
        cancelQuickLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
