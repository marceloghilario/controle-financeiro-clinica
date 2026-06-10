import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  api,
  getAuthToken,
  setAuthToken,
  setUnauthorizedHandler,
  type AppUser,
  type AuthConfig,
  type AuthResponse,
} from "./api";

type AuthContextValue = {
  user: AppUser | null;
  loading: boolean;
  config: AuthConfig | null;
  pendingUser: AppUser | null;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  registerWithPassword: (
    email: string,
    name: string,
    password: string,
  ) => Promise<void>;
  loginWithGoogle: (id_token: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [pendingUser, setPendingUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [config, setConfig] = useState<AuthConfig | null>(null);

  const handleUnauthorized = useCallback(() => {
    setAuthToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(handleUnauthorized);
    return () => setUnauthorizedHandler(null);
  }, [handleUnauthorized]);

  // carrega config (Google client ID) — endpoint público
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_BASE || ""}/api/auth/config`)
      .then((r) => r.json())
      .then((c: AuthConfig) => setConfig(c))
      .catch(() => setConfig({ google_client_id: "", google_enabled: false }));
  }, []);

  // valida token persistido
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<AppUser>("/api/auth/me")
      .then((u) => setUser(u))
      .catch(() => {
        setAuthToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const applyAuthResponse = (resp: AuthResponse) => {
    if (resp.access_token && resp.user) {
      setAuthToken(resp.access_token);
      setUser(resp.user);
      setPendingUser(null);
    } else if (resp.pending && resp.user) {
      setAuthToken(null);
      setUser(null);
      setPendingUser(resp.user);
    }
  };

  const loginWithPassword = async (email: string, password: string) => {
    const resp = await api.post<AuthResponse>("/api/auth/login", { email, password });
    if (resp.error) throw new Error(resp.error);
    applyAuthResponse(resp);
  };

  const registerWithPassword = async (
    email: string,
    name: string,
    password: string,
  ) => {
    const resp = await api.post<AuthResponse>("/api/auth/register", {
      email,
      name,
      password,
    });
    applyAuthResponse(resp);
  };

  const loginWithGoogle = async (id_token: string) => {
    const resp = await api.post<AuthResponse>("/api/auth/google", { id_token });
    applyAuthResponse(resp);
  };

  const logout = () => {
    setAuthToken(null);
    setUser(null);
    setPendingUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        config,
        pendingUser,
        loginWithPassword,
        registerWithPassword,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
