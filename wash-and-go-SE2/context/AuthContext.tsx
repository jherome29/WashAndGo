import React, { createContext, useContext } from 'react';
import type { AppUser } from '../App';

interface AuthContextValue {
  user: AppUser | null;
  token: string | null;
  forceRecoveryMode: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  user,
  token,
  forceRecoveryMode,
  children,
}: AuthContextValue & { children: React.ReactNode }) {
  return (
    <AuthContext.Provider value={{ user, token, forceRecoveryMode }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
