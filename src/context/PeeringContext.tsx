import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import {
  NETWORK_NODES,
  resolveHostListenPort,
  calculatePeerListenPort,
  type PortResolutionResult,
} from '../data/network';
import type { NodeInfo } from '../types/network';
import { useAuth, type AuthenticatedUser } from './AuthContext';

interface PeeringContextType {
  // Form Inputs
  peerAsn: string;
  setPeerAsn: (asn: string) => void;
  peerName: string;
  setPeerName: (name: string) => void;
  targetNodeId: string;
  setTargetNodeId: (nodeId: string) => void;
  peerEndpointHost: string;
  setPeerEndpointHost: (host: string) => void;
  peerWgPubKey: string;
  setPeerWgPubKey: (pubKey: string) => void;
  peerIpv6LLA: string;
  setPeerIpv6LLA: (lla: string) => void;
  peerIpv6ULA: string;
  setPeerIpv6ULA: (ula: string) => void;
  peerIpv4: string;
  setPeerIpv4: (ipv4: string) => void;
  bgpMode: 'mpbgp_enh' | 'dual_stack' | 'ipv6_only';
  setBgpMode: (mode: 'mpbgp_enh' | 'dual_stack' | 'ipv6_only') => void;
  mtu: number;
  setMtu: (mtu: number) => void;
  userNote: string;
  setUserNote: (note: string) => void;

  // Custom Port State
  customHostPort: string;
  setCustomHostPort: (port: string) => void;
  isCustomPortExpanded: boolean;
  setIsCustomPortExpanded: (expanded: boolean) => void;

  // Fallback Toggle State
  usePeerFallbackPort: boolean;
  setUsePeerFallbackPort: (useFallback: boolean) => void;

  // Auth Integration
  authenticatedUser: AuthenticatedUser | null;
  isVerifiedUser: boolean;

  // Derived Values
  cleanAsn: string;
  cleanPeerName: string;
  selectedNode: NodeInfo;
  hostPortInfo: PortResolutionResult;
  peerPort: number;
  finalHostPort: number;
  finalClientPort: number;
  fullPeerEndpoint: string;
}

const PeeringContext = createContext<PeeringContextType | undefined>(undefined);

export const PeeringProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();

  const [peerAsn, setPeerAsn] = useState<string>(() => user?.cleanAsn || '');
  const [peerName, setPeerName] = useState<string>('');
  const [targetNodeId, setTargetNodeId] = useState<string>('jp07');
  const [peerEndpointHost, setPeerEndpointHost] = useState<string>('');
  const [peerWgPubKey, setPeerWgPubKey] = useState<string>('');
  const [peerIpv6LLA, setPeerIpv6LLA] = useState<string>('');
  const [peerIpv6ULA, setPeerIpv6ULA] = useState<string>('');
  const [peerIpv4, setPeerIpv4] = useState<string>('');
  const [bgpMode, setBgpMode] = useState<'mpbgp_enh' | 'dual_stack' | 'ipv6_only'>('mpbgp_enh');
  const [mtu, setMtu] = useState<number>(1420);
  const [userNote, setUserNote] = useState<string>('你好！我在 DN42 上看到了 AkiLab 的节点，希望能建立 BGP 对等互联。期待你的回复！');

  const [customHostPort, setCustomHostPort] = useState<string>('');
  const [isCustomPortExpanded, setIsCustomPortExpanded] = useState<boolean>(false);
  const [usePeerFallbackPort, setUsePeerFallbackPort] = useState<boolean>(false);

  // Auto-sync ASN when user logs in
  useEffect(() => {
    if (user?.cleanAsn && !peerAsn) {
      setPeerAsn(user.cleanAsn);
    }
  }, [user]);

  // Clean ASN
  const cleanAsn = useMemo(() => {
    return peerAsn.replace(/\D/g, '') || '';
  }, [peerAsn]);

  const isVerifiedUser = useMemo(() => {
    return Boolean(isAuthenticated && user?.cleanAsn && cleanAsn && user.cleanAsn === cleanAsn);
  }, [isAuthenticated, user, cleanAsn]);

  // Clean Peer Name (Alphanumeric only, max 12 chars, lowercase)
  const cleanPeerName = useMemo(() => {
    const raw = peerName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toLowerCase();
    if (raw) return raw;
    return cleanAsn ? `as${cleanAsn.slice(-4)}` : 'peer';
  }, [peerName, cleanAsn]);

  // Selected Target Node
  const selectedNode = useMemo(() => {
    return NETWORK_NODES.find((n) => n.id === targetNodeId) || NETWORK_NODES[0];
  }, [targetNodeId]);

  // Real-time Deterministic Host ListenPort Resolution
  const hostPortInfo = useMemo(() => {
    return resolveHostListenPort(cleanAsn, targetNodeId, customHostPort);
  }, [cleanAsn, targetNodeId, customHostPort]);

  // Client ListenPort (Automatic per target node / fallback)
  const peerPort = useMemo(() => {
    return calculatePeerListenPort(targetNodeId, usePeerFallbackPort);
  }, [targetNodeId, usePeerFallbackPort]);

  const finalHostPort = hostPortInfo.port;
  const finalClientPort = peerPort;

  // Stitched Full Peer Endpoint (Domain/IP + Fixed Port)
  const fullPeerEndpoint = useMemo(() => {
    if (!peerEndpointHost.trim()) return '';
    const cleanHost = peerEndpointHost.replace(/:\d+$/, '').trim();
    return cleanHost ? `${cleanHost}:${finalClientPort}` : '';
  }, [peerEndpointHost, finalClientPort]);

  return (
    <PeeringContext.Provider
      value={{
        peerAsn,
        setPeerAsn,
        peerName,
        setPeerName,
        targetNodeId,
        setTargetNodeId,
        peerEndpointHost,
        setPeerEndpointHost,
        peerWgPubKey,
        setPeerWgPubKey,
        peerIpv6LLA,
        setPeerIpv6LLA,
        peerIpv6ULA,
        setPeerIpv6ULA,
        peerIpv4,
        setPeerIpv4,
        bgpMode,
        setBgpMode,
        mtu,
        setMtu,
        userNote,
        setUserNote,
        customHostPort,
        setCustomHostPort,
        isCustomPortExpanded,
        setIsCustomPortExpanded,
        usePeerFallbackPort,
        setUsePeerFallbackPort,
        cleanAsn,
        cleanPeerName,
        selectedNode,
        hostPortInfo,
        peerPort,
        finalHostPort,
        finalClientPort,
        fullPeerEndpoint,
        authenticatedUser: user,
        isVerifiedUser,
      }}
    >
      {children}
    </PeeringContext.Provider>
  );
};

export const usePeering = () => {
  const context = useContext(PeeringContext);
  if (!context) {
    throw new Error('usePeering must be used within a PeeringProvider');
  }
  return context;
};
