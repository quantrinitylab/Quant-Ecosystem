'use client';

import { createContext, useContext, useState } from 'react';

/**
 * QuantTrinity is the OWNER tier — a level above the operational `admin` app.
 * The owner is the single root principal who can provision team accounts,
 * assign sectors/roles, place AI agents as "employees", and govern the
 * ecosystem economy and AI model registry.
 */
export interface OwnerUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: 'OWNER';
}

interface OwnerAuthContextValue {
  owner: OwnerUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isOwner: boolean;
}

const OwnerAuthContext = createContext<OwnerAuthContextValue | undefined>(undefined);

export function OwnerProvider({ children }: { children: React.ReactNode }) {
  const [owner] = useState<OwnerUser>({
    id: 'owner-001',
    email: 'owner@quant.dev',
    username: 'owner',
    displayName: 'Quant Owner',
    role: 'OWNER',
  });

  const value: OwnerAuthContextValue = {
    owner,
    isLoading: false,
    isAuthenticated: true,
    isOwner: owner.role === 'OWNER',
  };

  return <OwnerAuthContext.Provider value={value}>{children}</OwnerAuthContext.Provider>;
}

export function useOwner(): OwnerAuthContextValue {
  const ctx = useContext(OwnerAuthContext);
  if (ctx === undefined) {
    throw new Error('useOwner must be used within an OwnerProvider');
  }
  return ctx;
}
