import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  setTokens,
  clearTokens,
  setSessionExpiredHandler,
  setActiveProperty,
  authApi,
} from '../services/api';

const KEY_PROPERTY_ID   = '@owner:propertyId';
const KEY_PROPERTY_NAME = '@owner:propertyName';
const KEY_PERMISSIONS   = '@owner:permissions';

/** `{ function: { tenant: [{ name: 'create tenant' }, …] }, sidebar: {…}, report: {…} }` */
export type Permissions = Record<string, Record<string, { name: string }[]>>;
export type PermAction = 'view' | 'create' | 'edit' | 'delete' | 'verify' | 'assign';

export type AuthUser = {
  id: number;
  username: string;
  roleId: number;
  isActive: boolean;
  isBiometrics: boolean;
  /** New accounts must set their own password at first login. */
  mustChangePassword?: boolean;
  currentPropertyId?: number;
  role?: { id: number; name: string; description?: string; permissions?: Permissions };
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
  switchProperty:    (id: number, name: string) => Promise<void>;
  /** Whether the current role may perform `action` on `module` (e.g. can('create', 'tenant')). */
  can:               (action: PermAction, module: string) => boolean;
  /** Exact permission name check, e.g. hasPermission('verify payment'). */
  hasPermission:     (name: string) => boolean;
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
  switchProperty:    async () => {},
  can:               () => true,
  hasPermission:     () => true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,              setUser]              = useState<AuthUser | null>(null);
  const [propertyId,        setPropertyId]        = useState<number | null>(null);
  const [propertyName,      setPropertyName]      = useState<string | null>(null);
  const [quickLoginVisible, setQuickLoginVisible] = useState(false);
  const [permissions,       setPermissions]       = useState<Permissions | null>(null);

  // Keep the API layer's property scope in sync with the selected property
  useEffect(() => { setActiveProperty(propertyId); }, [propertyId]);

  // Restore persisted property selection + permissions on mount
  useEffect(() => {
    AsyncStorage.multiGet([KEY_PROPERTY_ID, KEY_PROPERTY_NAME, KEY_PERMISSIONS]).then(pairs => {
      const pid   = pairs[0][1];
      const pname = pairs[1][1];
      const perms = pairs[2][1];
      if (pid) {
        setActiveProperty(Number(pid));
        setPropertyId(Number(pid));
      }
      if (pname) setPropertyName(pname);
      if (perms) {
        try { setPermissions(JSON.parse(perms)); } catch {}
      }
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
  const storePermissions = useCallback((u: AuthUser) => {
    const perms = u.role?.permissions;
    if (perms && typeof perms === 'object') {
      setPermissions(perms);
      AsyncStorage.setItem(KEY_PERMISSIONS, JSON.stringify(perms)).catch(() => {});
    }
  }, []);

  const login = useCallback((u: AuthUser, accessToken: string, refreshToken: string, pid?: number, pname?: string) => {
    setTokens(accessToken, refreshToken);
    setUser(u);
    storePermissions(u);
    // Session restore (Splash) calls login() without a property — keep the persisted one.
    if (pid != null) {
      setActiveProperty(pid);
      setPropertyId(pid);
      setPropertyName(pname ?? null);
      AsyncStorage.setItem(KEY_PROPERTY_ID,   String(pid)).catch(() => {});
      AsyncStorage.setItem(KEY_PROPERTY_NAME, pname ?? '').catch(() => {});
    }
  }, [storePermissions]);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    setPropertyId(null);
    setPropertyName(null);
    setPermissions(null);
    AsyncStorage.multiRemove([KEY_PROPERTY_ID, KEY_PROPERTY_NAME, KEY_PERMISSIONS]).catch(() => {});
  }, []);

  // /users/me does not include role permissions — keep the ones from login.
  const updateUser = useCallback((u: AuthUser) => setUser(prev => ({
    ...u,
    role: u.role ? { ...u.role, permissions: u.role.permissions ?? prev?.role?.permissions } : prev?.role,
  })), []);

  const switchProperty = useCallback(async (id: number, name: string) => {
    await authApi.switchProperty(id);
    setActiveProperty(id);
    setPropertyId(id);
    setPropertyName(name);
    AsyncStorage.setItem(KEY_PROPERTY_ID,   String(id)).catch(() => {});
    AsyncStorage.setItem(KEY_PROPERTY_NAME, name).catch(() => {});
  }, []);

  const can = useCallback((action: PermAction, module: string) => {
    // No permission data (older session) → let the backend be the gatekeeper.
    if (!permissions) return true;
    const want = action === 'view' ? null : `${action} ${module}`;
    if (want) {
      const fn = permissions.function?.[module] ?? [];
      return fn.some(p => p.name === want);
    }
    const sb = permissions.sidebar?.[module] ?? permissions.report?.[module] ?? [];
    return sb.length > 0;
  }, [permissions]);

  const permissionNames = React.useMemo(() => {
    const out = new Set<string>();
    const walk = (v: any) => {
      if (Array.isArray(v)) v.forEach(p => p?.name && out.add(p.name));
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(permissions);
    return out;
  }, [permissions]);
  const hasPermission = useCallback((name: string) => !permissions || permissionNames.has(name), [permissions, permissionNames]);

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
      storePermissions(u);
      setQuickLoginVisible(false);
      pendingRef.current?.resolve();
      pendingRef.current = null;
    } else {
      throw new Error('Invalid credentials');
    }
  }, [user, propertyId, storePermissions]);

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
        switchProperty,
        can,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
