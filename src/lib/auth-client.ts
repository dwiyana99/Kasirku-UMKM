/**
 * Better Auth React Client Helper
 * Connects browser login, registration, and Google OAuth flows to `/api/auth/*`.
 */

import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : undefined,
  basePath: '/api/auth',
});

export const { signIn, signUp, signOut, useSession } = authClient;

export interface AuthConfigStatusResponse {
  googleAuthConfigured: boolean;
  betterAuthSecretConfigured: boolean;
  databaseConfigured: boolean;
  betterAuthReady: boolean;
  storageConfigured?: boolean;
}

export async function fetchAuthConfigStatus(): Promise<AuthConfigStatusResponse> {
  try {
    const res = await fetch('/api/auth/config-status', {
      credentials: 'include',
    });
    if (!res.ok) {
      return {
        googleAuthConfigured: false,
        betterAuthSecretConfigured: false,
        databaseConfigured: false,
        betterAuthReady: false,
      };
    }
    return (await res.json()) as AuthConfigStatusResponse;
  } catch {
    return {
      googleAuthConfigured: false,
      betterAuthSecretConfigured: false,
      databaseConfigured: false,
      betterAuthReady: false,
    };
  }
}

export interface BetterAuthCurrentSessionResponse {
  authenticated: boolean;
  user?: {
    userId: string;
    email: string;
    fullName: string;
    role: 'MASTER_ADMIN' | 'TENANT_OWNER' | 'STAFF';
    allowedTenantIds: string[];
    accountScope: 'MASTER' | 'PAID' | 'SIMULATION' | 'DEMO';
    idleTimeoutMinutes?: number;
    needsOnboarding: boolean;
    image?: string | null;
  };
}

export async function fetchBetterAuthAppSession(): Promise<BetterAuthCurrentSessionResponse> {
  try {
    const res = await fetch('/api/auth/me', {
      credentials: 'include',
    });
    if (!res.ok) return { authenticated: false };
    return (await res.json()) as BetterAuthCurrentSessionResponse;
  } catch {
    return { authenticated: false };
  }
}

export type BetterAuthExchangeResponse =
  | {
      authenticated: false;
      betterAuthReady?: boolean;
      error?: string;
    }
  | {
      authenticated: true;
      needsOnboarding: true;
      authProvider?: 'BETTER_AUTH_GOOGLE' | 'BETTER_AUTH_EMAIL';
      profile: {
        userId: string;
        email: string;
        fullName: string;
        image?: string | null;
      };
    }
  | {
      authenticated: true;
      needsOnboarding?: false;
      role: 'MASTER_ADMIN';
      accountScope: 'REAL';
      authProvider?: 'BETTER_AUTH_GOOGLE' | 'BETTER_AUTH_EMAIL';
      email: string;
      username?: string;
      fullName: string;
      phone?: string;
      idleTimeoutMinutes?: number;
      token: string;
      customers: unknown[];
      workspaces: unknown[];
    }
  | {
      authenticated: true;
      needsOnboarding?: false;
      role: 'CUSTOMER';
      accountScope: 'REAL' | 'SIMULATION' | 'DEMO';
      authProvider?: 'BETTER_AUTH_GOOGLE' | 'BETTER_AUTH_EMAIL';
      idleTimeoutMinutes?: number;
      token: string;
      customer: unknown;
      workspaces: unknown[];
    }
  | {
      authenticated: true;
      needsOnboarding?: false;
      role: 'STAFF';
      accountScope: 'REAL' | 'SIMULATION' | 'DEMO';
      authProvider?: 'BETTER_AUTH_GOOGLE' | 'BETTER_AUTH_EMAIL';
      idleTimeoutMinutes?: number;
      token: string;
      staff: unknown;
      ownerAccount: unknown | null;
      workspaces: unknown[];
    };

export async function exchangeBetterAuthSession(
  handoffCode?: string,
): Promise<BetterAuthExchangeResponse> {
  try {
    const headers: Record<string, string> = {};
    if (handoffCode && handoffCode.trim()) {
      headers['x-oauth-handoff'] = handoffCode.trim();
    }
    const res = await fetch('/api/auth/better-auth/exchange', {
      credentials: 'include',
      headers,
    });
    const data = (await res.json()) as BetterAuthExchangeResponse;
    if (!res.ok) {
      return {
        authenticated: false,
        error:
          'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Gagal memverifikasi sesi Better Auth.',
      };
    }
    return data;
  } catch {
    return { authenticated: false };
  }
}

