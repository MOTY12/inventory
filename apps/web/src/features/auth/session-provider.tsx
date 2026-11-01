"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
let sessionRestore: Promise<void> | null = null;

type User = { id: string; email: string; emailVerifiedAt: string | null };
type Organization = { id: string; name: string; slug: string; role?: string };
type SessionState = "loading" | "authenticated" | "anonymous";

type SessionContextValue = {
  state: SessionState;
  user: User | null;
  organizations: Organization[];
  organization: Organization | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<string>;
  verifyEmail: (token: string) => Promise<string>;
  forgotPassword: (email: string) => Promise<string>;
  resetPassword: (token: string, password: string) => Promise<string>;
  logout: () => Promise<void>;
  authenticatedRequest: <T>(
    path: string,
    body?: unknown,
    method?: "GET" | "POST" | "PATCH" | "PUT",
  ) => Promise<T>;
  adoptAccessToken: (token: string) => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("csrf_token="))
    ?.slice("csrf_token=".length);
  return value ? decodeURIComponent(value) : "";
}

async function request<T>(
  path: string,
  body?: unknown,
  accessToken?: string,
  csrfOverride?: string | null,
  method?: "GET" | "POST" | "PATCH" | "PUT",
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    credentials: "include",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(path === "/auth/refresh" || path === "/auth/logout"
        ? { "X-CSRF-Token": csrfOverride ?? csrfToken() }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  } & T;
  if (!response.ok) {
    throw new Error(
      result.error?.message ?? "The request could not be completed.",
    );
  }
  return result;
}

function restoreSessionOnce(restore: () => Promise<void>): Promise<void> {
  if (!sessionRestore) {
    sessionRestore = restore().finally(() => {
      sessionRestore = null;
    });
  }
  return sessionRestore;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const accessToken = useRef<string | null>(null);
  const csrfHeader = useRef<string | null>(null);
  const [state, setState] = useState<SessionState>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUser = useCallback(async (token: string) => {
    const currentUser = await request<User>("/auth/me", undefined, token);
    const memberships = await request<
      { role: string; organization: Organization }[]
    >("/organizations", undefined, token);
    let activeOrganization: Organization | null = null;
    try {
      activeOrganization = await request<Organization>(
        "/organizations/current",
        undefined,
        token,
      );
    } catch {
      activeOrganization = null;
    }
    accessToken.current = token;
    setUser(currentUser);
    setOrganizations(
      memberships.map((membership) => ({
        ...membership.organization,
        role: membership.role,
      })),
    );
    setOrganization(activeOrganization);
    setState("authenticated");
  }, []);

  const restore = useCallback(async () => {
    try {
      const csrf = await request<{ csrfToken: string }>("/auth/csrf");
      csrfHeader.current = csrf.csrfToken;
      const tokens = await request<{
        accessToken: string;
        csrfToken: string;
      }>("/auth/refresh", {}, undefined, csrf.csrfToken);
      csrfHeader.current = tokens.csrfToken;
      await loadUser(tokens.accessToken);
    } catch {
      accessToken.current = null;
      csrfHeader.current = null;
      setUser(null);
      setOrganizations([]);
      setOrganization(null);
      setState("anonymous");
    }
  }, [loadUser]);

  const authenticatedRequest = useCallback(
    <T,>(
      path: string,
      body?: unknown,
      method?: "GET" | "POST" | "PATCH" | "PUT",
    ) => {
      if (!accessToken.current) throw new Error("Sign in to continue.");
      return request<T>(path, body, accessToken.current, undefined, method);
    },
    [],
  );

  const adoptAccessToken = useCallback(
    async (token: string) => {
      await loadUser(token);
    },
    [loadUser],
  );

  useEffect(() => {
    void restoreSessionOnce(restore);
  }, [restore]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const result = await request<{
          accessToken: string;
          csrfToken: string;
        }>("/auth/login", { email, password });
        csrfHeader.current = result.csrfToken;
        await loadUser(result.accessToken);
        router.replace("/");
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Sign in failed.";
        setError(message);
        throw cause;
      }
    },
    [loadUser, router],
  );

  const register = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const result = await request<{ message: string }>("/auth/register", {
        email,
        password,
      });
      return result.message;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Registration failed.";
      setError(message);
      throw cause;
    }
  }, []);

  const verifyEmail = useCallback(async (token: string) => {
    const result = await request<{ message: string }>("/auth/verify-email", {
      token,
    });
    return result.message;
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    const result = await request<{ message: string }>("/auth/forgot-password", {
      email,
    });
    return result.message;
  }, []);

  const resetPassword = useCallback(async (token: string, password: string) => {
    const result = await request<{ message: string }>("/auth/reset-password", {
      token,
      password,
    });
    return result.message;
  }, []);

  const logout = useCallback(async () => {
    try {
      await request<void>("/auth/logout", {}, undefined, csrfHeader.current);
    } finally {
      accessToken.current = null;
      csrfHeader.current = null;
      setUser(null);
      setOrganizations([]);
      setOrganization(null);
      setState("anonymous");
      router.replace("/login");
    }
  }, [router]);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      user,
      organizations,
      organization,
      error,
      login,
      register,
      verifyEmail,
      forgotPassword,
      resetPassword,
      logout,
      authenticatedRequest,
      adoptAccessToken,
    }),
    [
      state,
      user,
      organizations,
      organization,
      error,
      login,
      register,
      verifyEmail,
      forgotPassword,
      resetPassword,
      logout,
      authenticatedRequest,
      adoptAccessToken,
    ],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context)
    throw new Error("useSession must be used inside SessionProvider");
  return context;
}

export function ProtectedContent({ children }: { children: ReactNode }) {
  const { state } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (state === "anonymous") router.replace("/login");
  }, [state, router]);

  if (state === "loading" || state === "anonymous") {
    return (
      <main className="auth-loading" aria-live="polite">
        Checking your session…
      </main>
    );
  }
  return children;
}
