import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AuthenticatedUser {
  asn: string;
  cleanAsn: string;
  username?: string;
  asName?: string;
  maintainer?: string;
  authMethod?: string;
  role?: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  verifiedAt?: string;
  expiresAt?: number;
}

export interface PeeringSessionInfo {
  id: string;
  asn: string;
  name?: string;
  nodeId: string;
  nodeCode: string;
  nodeName?: string;
  flag?: string;
  version: number;
  hostPort: number;
  clientPort: number;
  peerEndpoint?: string;
  peerWgPubKey?: string;
  peerIpv6LLA?: string;
  peerIpv6ULA?: string;
  peerIpv4?: string;
  bgpMode?: string;
  mtu?: number;
  userNote?: string;
  status: 'pending_review' | 'deployed' | 'handshake_ok' | 'established' | 'rejected';
  createdAt?: string;
  updatedAt?: string;
  liveBgpStatus?: {
    stage: number;
    stageLabel: string;
    bgpState: string;
    routesImported: number;
    routesExported: number;
    uptime: string;
    diagnosticTips: string;
  };
}

interface AuthContextType {
  user: AuthenticatedUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  isDashboardOpen: boolean;
  setIsDashboardOpen: (open: boolean) => void;
  activeSessions: PeeringSessionInfo[];
  loginWithToken: (token: string, user: AuthenticatedUser, rememberMe?: boolean) => void;
  logout: () => void;
  refreshSessions: () => Promise<void>;
  refreshSessionBgpStatus: (session: PeeringSessionInfo) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    try {
      const stored = sessionStorage.getItem('akilab_auth_user') || localStorage.getItem('akilab_auth_user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u.expiresAt && Date.now() > u.expiresAt) {
          localStorage.removeItem('akilab_auth_token');
          localStorage.removeItem('akilab_auth_user');
          sessionStorage.removeItem('akilab_auth_token');
          sessionStorage.removeItem('akilab_auth_user');
          return null;
        }
      }
      return sessionStorage.getItem('akilab_auth_token') || localStorage.getItem('akilab_auth_token');
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState<AuthenticatedUser | null>(() => {
    try {
      const stored = sessionStorage.getItem('akilab_auth_user') || localStorage.getItem('akilab_auth_user');
      if (!stored) return null;
      const u = JSON.parse(stored);
      if (u.expiresAt && Date.now() > u.expiresAt) {
        localStorage.removeItem('akilab_auth_token');
        localStorage.removeItem('akilab_auth_user');
        sessionStorage.removeItem('akilab_auth_token');
        sessionStorage.removeItem('akilab_auth_user');
        return null;
      }
      return u;
    } catch {
      return null;
    }
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [activeSessions, setActiveSessions] = useState<PeeringSessionInfo[]>([]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setActiveSessions([]);
    localStorage.removeItem('akilab_auth_token');
    localStorage.removeItem('akilab_auth_user');
    sessionStorage.removeItem('akilab_auth_token');
    sessionStorage.removeItem('akilab_auth_user');
  }, []);

  const loginWithToken = useCallback((newToken: string, newUser: AuthenticatedUser, rememberMe: boolean = false) => {
    // Expiration: 48h (172800s) for Remember Me, 40m (2400s) safety fallback for temporary session
    const ttlMs = rememberMe ? 48 * 3600 * 1000 : 40 * 60 * 1000;
    const expiresAt = newUser.expiresAt || (Date.now() + ttlMs);
    const userWithExpiry: AuthenticatedUser = { ...newUser, expiresAt };

    setToken(newToken);
    setUser(userWithExpiry);

    if (rememberMe) {
      localStorage.setItem('akilab_auth_token', newToken);
      localStorage.setItem('akilab_auth_user', JSON.stringify(userWithExpiry));
      sessionStorage.removeItem('akilab_auth_token');
      sessionStorage.removeItem('akilab_auth_user');
    } else {
      sessionStorage.setItem('akilab_auth_token', newToken);
      sessionStorage.setItem('akilab_auth_user', JSON.stringify(userWithExpiry));
      localStorage.removeItem('akilab_auth_token');
      localStorage.removeItem('akilab_auth_user');
    }
  }, []);

  // Periodic expiration guard every 30 seconds
  useEffect(() => {
    if (!user?.expiresAt) return;
    const timer = setInterval(() => {
      if (Date.now() > (user.expiresAt || 0)) {
        logout();
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [user, logout]);

  // Fetch and sync sessions for the current user
  const refreshSessions = useCallback(async () => {
    const targetAsn = user?.cleanAsn || '';

    // 1. First fetch local storage sessions
    let localList: any[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem('akilab_my_peerings') || '[]');
      localList = (Array.isArray(raw) ? raw : []).map((s: any) => ({
        ...s,
        id: s.id || s.sessionId || `PEER-${(s.nodeCode || s.nodeId || 'JP07').toUpperCase()}-${String(s.asn || '0').replace(/\D/g, '').slice(-4)}`,
      }));
    } catch {}

    if (!targetAsn) {
      setActiveSessions(localList);
      return;
    }

    // 2. Fetch server-side sessions for this ASN
    try {
      const currentToken = sessionStorage.getItem('akilab_auth_token') || localStorage.getItem('akilab_auth_token');
      const res = await fetch(`/api/sessions-by-asn?asn=${encodeURIComponent(targetAsn)}`, {
        headers: currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.sessions)) {
          // Merge server sessions with local storage
          const serverSessions: PeeringSessionInfo[] = data.sessions;
          setActiveSessions(serverSessions);
          return;
        }
      }
    } catch (err) {
      console.warn('Failed to fetch server sessions:', err);
    }

    // Fallback to local sessions filtered by ASN
    const filtered = localList.filter((s: any) => !targetAsn || s.asn === targetAsn);
    setActiveSessions(filtered);
  }, [user]);

  // Query live BGP & Looking Glass status for a session
  const refreshSessionBgpStatus = useCallback(async (session: PeeringSessionInfo) => {
    try {
      const res = await fetch(`/api/peer-status?asn=${encodeURIComponent(session.asn)}&node=${encodeURIComponent(session.nodeId)}&name=${encodeURIComponent(session.name || '')}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setActiveSessions((prev) =>
            prev.map((s) =>
              s.id === session.id
                ? {
                    ...s,
                    liveBgpStatus: {
                      stage: data.stage,
                      stageLabel: data.stageLabel,
                      bgpState: data.bgpState,
                      routesImported: data.routesImported,
                      routesExported: data.routesExported,
                      uptime: data.uptime,
                      diagnosticTips: data.diagnosticTips,
                    },
                  }
                : s
            )
          );
        }
      }
    } catch (err) {
      console.warn('Failed to fetch BGP status:', err);
    }
  }, []);

  // Sync on user change
  useEffect(() => {
    refreshSessions();
  }, [user, refreshSessions]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isAuthModalOpen,
        setIsAuthModalOpen,
        isDashboardOpen,
        setIsDashboardOpen,
        activeSessions,
        loginWithToken,
        logout,
        refreshSessions,
        refreshSessionBgpStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
