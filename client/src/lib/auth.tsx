import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiRequest, setAccessToken, getAccessToken, refreshAccessToken, queryClient } from "./queryClient";
import { useLocation } from "wouter";
import type { Organization, BillingAccount, FounderAgreement } from "@shared/schema";

interface SafeUser {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  founderFlag: boolean | null;
  isPlatformOwner: boolean | null;
  fullName: string;
  createdAt: string | null;
  updatedAt: string | null;
  emailVerifiedAt: string | null;
}

interface AuthData {
  user: SafeUser;
  org: Organization;
  billing: BillingAccount | null;
  founderAgreement: FounderAgreement | null;
  isPlatformOwner: boolean;
  isImpersonation: boolean;
}

interface AuthContextType {
  data: AuthData | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; fullName: string; orgName: string }) => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
  stopImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AuthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  const fetchMe = useCallback(async () => {
    try {
      if (!getAccessToken()) {
        const token = await refreshAccessToken();
        if (!token) {
          setData(null);
          setIsLoading(false);
          return;
        }
      }

      const res = await apiRequest("GET", "/api/auth/me");
      const me = await res.json();
      setData(me);
    } catch {
      setData(null);
      setAccessToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const result = await res.json();
    setAccessToken(result.accessToken);
    await fetchMe();
  };

  const register = async (input: { email: string; password: string; fullName: string; orgName: string }) => {
    const res = await apiRequest("POST", "/api/auth/register", input);
    const result = await res.json();
    setAccessToken(result.accessToken);
    await fetchMe();
  };

  const logout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {}
    setAccessToken(null);
    setData(null);
    queryClient.clear();
    setLocation("/");
  };

  const stopImpersonation = async () => {
    try {
      const res = await apiRequest("POST", "/api/admin/stop-impersonation");
      const result = await res.json();
      setAccessToken(result.accessToken);
      await fetchMe();
      setLocation("/admin");
    } catch {
      await logout();
    }
  };

  const refetch = async () => {
    await fetchMe();
  };

  return (
    <AuthContext.Provider value={{ data, isLoading, login, register, logout, refetch, stopImpersonation }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
