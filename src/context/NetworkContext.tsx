import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { NetworkMeta, NodeInfo, ContactMethod, BGPCommunity } from '../types/network';
import {
  NETWORK_META as DEFAULT_META,
  NETWORK_NODES as DEFAULT_NODES,
  CONTACT_METHODS as DEFAULT_CONTACTS,
  BGP_COMMUNITIES as DEFAULT_COMMUNITIES,
  MIN_DN42_PORT,
  MAX_DN42_PORT,
  type PortResolutionResult,
} from '../data/network';

interface NetworkContextType {
  networkMeta: NetworkMeta;
  nodes: NodeInfo[];
  contacts: ContactMethod[];
  communities: BGPCommunity[];
  isLoading: boolean;
  refetchNetworkMeta: () => Promise<void>;
  resolveHostPort: (asnInput: string | number, nodeId?: string, customPort?: number | string) => PortResolutionResult;
  calculateClientPort: (nodeId?: string, forceFallback?: boolean) => number;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [networkMeta, setNetworkMeta] = useState<NetworkMeta>(DEFAULT_META);
  const [nodes, setNodes] = useState<NodeInfo[]>(DEFAULT_NODES);
  const [contacts, setContacts] = useState<ContactMethod[]>(DEFAULT_CONTACTS);
  const [communities, setCommunities] = useState<BGPCommunity[]>(DEFAULT_COMMUNITIES);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchMeta = useCallback(async () => {
    try {
      const res = await fetch('/api/network-meta');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (data.network) setNetworkMeta((prev) => ({ ...prev, ...data.network }));
          if (Array.isArray(data.nodes) && data.nodes.length > 0) setNodes(data.nodes);
          if (Array.isArray(data.contacts) && data.contacts.length > 0) setContacts(data.contacts);
          if (Array.isArray(data.communities) && data.communities.length > 0) setCommunities(data.communities);
        }
      }
    } catch {
      // Fallback silently uses DEFAULT_META / DEFAULT_NODES
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  /**
   * Deterministic Port Resolution with Dynamic Nodes & Meta
   */
  const resolveHostPort = useCallback(
    (asnInput: string | number, nodeId?: string, customPort?: number | string): PortResolutionResult => {
      const cleanAsnStr = asnInput.toString().replace(/[^0-9]/g, '');
      const asnNum = parseInt(cleanAsnStr, 10);

      const targetNode = nodes.find((n) => n.id === nodeId) || nodes[0] || DEFAULT_NODES[0];
      const occupiedList = targetNode.occupiedPorts || [];

      const safeAsn = isNaN(asnNum) || asnNum <= 0 ? 0 : asnNum;
      const suffix = safeAsn % 10000;
      const defaultPort = 20000 + suffix;

      if (customPort !== undefined && customPort !== null && customPort !== '') {
        const parsedCustom = parseInt(customPort.toString(), 10);
        if (!isNaN(parsedCustom)) {
          if (parsedCustom < MIN_DN42_PORT || parsedCustom > MAX_DN42_PORT) {
            return {
              port: parsedCustom,
              defaultPort,
              tier: 0,
              status: 'custom_occupied',
              label: `端口必须在 ${MIN_DN42_PORT} ~ ${MAX_DN42_PORT} 之间`,
              isFallback: false,
              isAvailable: false,
            };
          }

          const isOccupied = occupiedList.includes(parsedCustom);
          return {
            port: parsedCustom,
            defaultPort,
            tier: 0,
            status: isOccupied ? 'custom_occupied' : 'custom_valid',
            label: isOccupied ? `端口 ${parsedCustom} 已被占用` : `自定义端口 ${parsedCustom}`,
            isFallback: false,
            isAvailable: !isOccupied,
          };
        }
      }

      if (!occupiedList.includes(defaultPort)) {
        return {
          port: defaultPort,
          defaultPort,
          tier: 0,
          status: 'default',
          label: `默认端口 ${defaultPort}`,
          isFallback: false,
          isAvailable: true,
        };
      }

      const tier1Port = 30000 + suffix;
      if (!occupiedList.includes(tier1Port) && tier1Port <= MAX_DN42_PORT) {
        return {
          port: tier1Port,
          defaultPort,
          tier: 1,
          status: 'fallback_1',
          label: `备用端口 ${tier1Port}`,
          isFallback: true,
          isAvailable: true,
        };
      }

      const tier2Port = 40000 + suffix;
      if (!occupiedList.includes(tier2Port) && tier2Port <= MAX_DN42_PORT) {
        return {
          port: tier2Port,
          defaultPort,
          tier: 2,
          status: 'fallback_2',
          label: `备用端口 ${tier2Port}`,
          isFallback: true,
          isAvailable: true,
        };
      }

      const tier3Port = 50000 + suffix;
      if (!occupiedList.includes(tier3Port) && tier3Port <= MAX_DN42_PORT) {
        return {
          port: tier3Port,
          defaultPort,
          tier: 3,
          status: 'fallback_multi',
          label: `备用端口 ${tier3Port}`,
          isFallback: true,
          isAvailable: true,
        };
      }

      let offsetPort = Math.max(MIN_DN42_PORT, defaultPort + 1);
      if (offsetPort > MAX_DN42_PORT) offsetPort = 20000;

      while ((occupiedList.includes(offsetPort) || offsetPort < MIN_DN42_PORT) && offsetPort <= MAX_DN42_PORT) {
        offsetPort++;
      }
      if (offsetPort > MAX_DN42_PORT) offsetPort = 20000;

      return {
        port: offsetPort,
        defaultPort,
        tier: 4,
        status: 'fallback_multi',
        label: `动态顺延端口 ${offsetPort}`,
        isFallback: true,
        isAvailable: true,
      };
    },
    [nodes]
  );

  const calculateClientPort = useCallback(
    (_nodeId?: string, forceFallback: boolean = false): number => {
      const hostSuffix = (networkMeta.asnNumber || 1337) % 10000;
      if (forceFallback) {
        return 30000 + hostSuffix;
      }
      return 20000 + hostSuffix;
    },
    [networkMeta.asnNumber]
  );

  return (
    <NetworkContext.Provider
      value={{
        networkMeta,
        nodes,
        contacts,
        communities,
        isLoading,
        refetchNetworkMeta: fetchMeta,
        resolveHostPort,
        calculateClientPort,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = (): NetworkContextType => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
};
