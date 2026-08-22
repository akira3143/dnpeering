export type RegionType = 'all' | 'apac' | 'na' | 'eu' | 'ixp';
export type NodeStatusType = 'active' | 'limited' | 'maintenance' | 'direct_ix';

export interface NodeInfo {
  id: string;
  name: string;
  code: string;
  flag: string;
  city: string;
  country: string;
  region: 'apac' | 'na' | 'eu' | 'ixp';
  coordinates: [number, number]; // [lat, lng]
  status: NodeStatusType;
  isp: string;
  sponsor?: {
    name: string;
    url?: string;
  };
  endpointDomain: string;
  endpointIpv4?: string;
  endpointIpv6?: string;
  portFormula?: string;
  defaultPort?: number;
  wgPublicKey: string;
  tunnelIpv4?: string;
  tunnelIpv6ULA: string;
  tunnelIpv6LLA: string;
  mtu: number;
  features: string[];
  occupiedPorts?: number[];
  ixpName?: string;
  ixpUrl?: string;
  notes?: string;
}

export interface NetworkMeta {
  asn: string;
  asnNumber: number;
  networkName: string;
  maintainer: string;
  ipv4Pool: string;
  ipv6Pool: string;
  routingPolicy: string;
  bgpMode: string;
  portFormulaDisplay: string;
  lookingGlassUrl?: string;
  dn42WhoisUrl?: string;
  topologyUrl?: string;
  flapAlertUrl?: string;
  autoPeerUrl?: string;
  lastUpdated: string;
}

export interface ContactMethod {
  platform: string;
  handle: string;
  link?: string;
  responseTime: string;
  preferred?: boolean;
  type: 'email' | 'telegram' | 'matrix' | 'discord' | 'xmpp' | 'github';
}

export interface PeerGeneratorInput {
  peerAsn: string;
  peerWgEndpoint: string;
  peerWgPublicKey: string;
  peerIpv6LLA: string;
  peerIpv6ULA?: string;
  peerIpv4?: string;
  targetNodeId: string;
  bgpMode: 'mpbgp_enh' | 'dual_stack' | 'ipv6_only';
  customMtu?: number;
  usePresharedKey?: boolean;
  presharedKey?: string;
}
