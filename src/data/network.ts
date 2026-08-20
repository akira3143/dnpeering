import type { NetworkMeta, NodeInfo, BGPCommunity, ContactMethod } from '../types/network';

/**
 * 自治系统 (AS) 核心元数据配置 - AkiLab Networks
 */
export const NETWORK_META: NetworkMeta = {
  asn: 'AS4242423143',
  asnNumber: 4242423143,
  networkName: 'AkiLab Networks',
  maintainer: 'AKIRA-DN42',
  ipv4Pool: '172.20.188.0/27',
  ipv6Pool: 'fd5c:300e:8ae7::/48',
  routingPolicy: 'Open for all DN42 participants / MP-BGP (ENH) / Strict ROA Validation',
  bgpMode: 'MP-BGP + Extended Next Hop (ENH) / Dual-Stack Supported',
  portFormulaDisplay: '20000 + (ASN % 10000) [严格限制 10000~65535，多实例自动顺延 30000/40000+ASN]',
  lookingGlassUrl: 'https://lg.dn42.akira.moe',
  dn42WhoisUrl: 'https://explorer.burble.dn42/services/whois/?search=AS4242423143',
  topologyUrl: 'https://topo.dn42.akira.moe',
  flapAlertUrl: 'https://flap.dn42.akira.moe',
  autoPeerUrl: 'https://peer.dn42.akira.moe',
  lastUpdated: '2026-08-19',
};

export type PortStatusType = 'default' | 'fallback_1' | 'fallback_2' | 'fallback_multi' | 'custom_valid' | 'custom_occupied';

export interface PortResolutionResult {
  port: number;
  defaultPort: number;
  tier: number; // 0: 默认, 1: 备用1, 2: 备用2...
  status: PortStatusType;
  label: string; // "默认端口 29998" 或 "备用端口 39998"
  isFallback: boolean;
  isAvailable: boolean;
}

// DN42 专用端口安全区间定义：10000 以下端口保留给操作系统与其它常用服务 (SSH/Web/DNS等)
export const MIN_DN42_PORT = 10000;
export const MAX_DN42_PORT = 65535;

/**
 * 确定性多会话与冲突处理算法：
 * 支持用户自定义端口校验，若未自定义则按层级分配确定性递增端口：
 * 第 1 个会话 (默认): 20000 + (ASN % 10000)
 * 第 2 个会话 (备用 1): 30000 + (ASN % 10000)
 * 第 3 个会话 (备用 2): 40000 + (ASN % 10000)
 * 第 4 个会话 (备用 3): 50000 + (ASN % 10000)
 * 严格限制: 仅在 10000 ~ 65535 范围内分配，绝不占用 10000 以下常用服务端口。
 */
export function resolveHostListenPort(
  asnInput: string | number,
  nodeId?: string,
  customPort?: number | string
): PortResolutionResult {
  const cleanAsnStr = asnInput.toString().replace(/[^0-9]/g, '');
  const asnNum = parseInt(cleanAsnStr, 10);
  
  // 查找目标节点及其已占用端口列表
  const targetNode = NETWORK_NODES.find((n) => n.id === nodeId) || NETWORK_NODES[0];
  const occupiedList = targetNode.occupiedPorts || [];

  // 计算基础默认端口
  const safeAsn = isNaN(asnNum) || asnNum <= 0 ? 0 : asnNum;
  const suffix = safeAsn % 10000;
  const defaultPort = 20000 + suffix;

  // 1. 如果用户输入了自定义端口 (Custom Port Mode)
  if (customPort !== undefined && customPort !== null && customPort !== '') {
    const parsedCustom = parseInt(customPort.toString(), 10);
    if (!isNaN(parsedCustom)) {
      // 校验端口合法性区间 [10000, 65535]
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

  // 2. 确定性层级分配 (Deterministic Fallback Tiers)
  // Tier 0 (默认): 20000 + (ASN % 10000)
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

  // Tier 1 (第一备用): 30000 + (ASN % 10000)
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

  // Tier 2 (第二备用): 40000 + (ASN % 10000)
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

  // Tier 3 (第三备用): 50000 + (ASN % 10000)
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

  // 3. 极端备用兜底（在 10000 ~ 65535 范围内寻找空闲端口，严格避开 <10000）
  let offsetPort = Math.max(MIN_DN42_PORT, defaultPort + 1);
  if (offsetPort > MAX_DN42_PORT) offsetPort = 20000;
  
  while ((occupiedList.includes(offsetPort) || offsetPort < MIN_DN42_PORT) && offsetPort <= MAX_DN42_PORT) {
    offsetPort++;
  }
  if (offsetPort > MAX_DN42_PORT) offsetPort = 20000;

  return {
    port: offsetPort,
    defaultPort,
    tier: 99,
    status: 'fallback_multi',
    label: `备用端口 ${offsetPort}`,
    isFallback: true,
    isAvailable: true,
  };
}

export function calculateWgPort(asnInput: string | number, nodeId?: string): number {
  return resolveHostListenPort(asnInput, nodeId).port;
}

/**
 * 计算对端在其自己 VPS 上监听站长的端口 (Peer Client ListenPort)
 * 智能同地域多节点支持：
 * - 针对 JP-7 (核心): 默认 23143 (20000 + 3143)
 * - 针对同机房的 JP-2 (二号机): 智能默认 33143 (30000 + 3143)，对端在同一台 VPS 连接两台 JP 节点时 0 冲突！
 */
export function calculatePeerListenPort(nodeId?: string, forceFallback: boolean = false): number {
  const hostSuffix = NETWORK_META.asnNumber % 10000; // 3143
  
  if (forceFallback) {
    return 30000 + hostSuffix; // 33143
  }

  // 智能避免对端在同一 VPS 连接 JP-7 与 JP-2 时本机 23143 端口冲突
  if (nodeId === 'jp02') {
    return 30000 + hostSuffix; // 33143
  }

  return 20000 + hostSuffix; // 23143
}

/**
 * 全球 PoP 节点列表配置 (AkiLab 真实节点清单)
 */
export const NETWORK_NODES: NodeInfo[] = [
  {
    id: 'jp07',
    code: 'JP-7',
    name: 'Tokyo 07 (Japan Hub)',
    flag: '🇯🇵',
    city: 'Tokyo',
    country: 'Japan',
    region: 'apac',
    coordinates: [35.6762, 139.6503],
    status: 'active',
    isp: 'Tokyo Datacenter',
    endpointDomain: 'jp7-dn42.akilab.meme',
    wgPublicKey: 'ma9vpr25iBDKthbd8tUFuCxbyzfJ2YHJ+K8bgdzOqzk=',
    tunnelIpv4: '172.20.188.7',
    tunnelIpv6ULA: 'fd5c:300e:8ae7::7',
    tunnelIpv6LLA: 'fe80::3143',
    mtu: 1420,
    features: ['★ Core Hub', 'MP-BGP', 'ENH', 'tyix Direct'],
    notes: '东亚互联核心枢纽，推荐日本、香港、台湾等东亚地区接入。',
    occupiedPorts: [],
  },
  {
    id: 'jp02',
    code: 'JP-2',
    name: 'Tokyo 02 (DC Peer / Direct)',
    flag: '🇯🇵',
    city: 'Tokyo',
    country: 'Japan',
    region: 'apac',
    coordinates: [35.6895, 139.6917],
    status: 'active',
    isp: 'Tokyo Datacenter',
    endpointDomain: 'jp2-dn42.akilab.meme',
    wgPublicKey: 'ay/2GTy1T4gcmqqvbeU2scM4uJ6FBXfp9TdF0yT540I=',
    tunnelIpv4: '172.20.188.2',
    tunnelIpv6ULA: 'fd5c:300e:8ae7::2',
    tunnelIpv6LLA: 'fe80::3143',
    mtu: 1420,
    features: ['MP-BGP', 'ENH', 'tyix Direct'],
    notes: '与 JP-7 同属东京机房，推荐东亚地区互联。',
    occupiedPorts: [],
  },
  {
    id: 'hk01',
    code: 'HK-1',
    name: 'Hong Kong 01 (Kwai Chung)',
    flag: '🇭🇰',
    city: 'Hong Kong SAR',
    country: 'China',
    region: 'apac',
    coordinates: [22.3193, 114.1694],
    status: 'active',
    isp: 'Hong Kong Datacenter',
    endpointDomain: 'hk1-dn42.akilab.meme',
    wgPublicKey: 'XV/dM5hZf/ulCo0GmYhYfngdESUdobvjxYtbv7v3chM=',
    tunnelIpv4: '172.20.188.3',
    tunnelIpv6ULA: 'fd5c:300e:8ae7::3',
    tunnelIpv6LLA: 'fe80::3143',
    mtu: 1420,
    features: ['MP-BGP', 'ENH', 'SEA Low Latency'],
    notes: '推荐香港、大陆、新加坡及东南亚地区接入。',
    occupiedPorts: [],
  },
  {
    id: 'usla01',
    code: 'US-LA',
    name: 'Los Angeles 01 (One Wilshire)',
    flag: '🇺🇸',
    city: 'Los Angeles',
    country: 'United States',
    region: 'na',
    coordinates: [34.0522, -118.2437],
    status: 'active',
    isp: 'CoreSite LA1 / One Wilshire',
    endpointDomain: 'akiusla1-dn42.akilab.meme',
    wgPublicKey: 'CBbv9qUv/u7j/keioB3yx7NaL5yxlI+0ej+SsXVuJ1o=',
    tunnelIpv4: '172.20.188.1',
    tunnelIpv6ULA: 'fd5c:300e:8ae7::1',
    tunnelIpv6LLA: 'fe80::3143',
    mtu: 1420,
    features: ['MP-BGP', 'ENH', 'Trans-Pacific Hub'],
    notes: '美洲及美西互联推荐节点，直连跨太平洋骨干。',
    occupiedPorts: [],
  },
];

/**
 * 内部骨干链路连接关系
 */
export const BACKBONE_LINKS: [string, string][] = [
  ['jp07', 'jp02'], // tyix Direct
  ['jp07', 'hk01'], // JP <-> HK
  ['jp07', 'usla01'], // JP <-> US-LA Trans-Pacific
];

/**
 * BGP 团体属性
 */
export const BGP_COMMUNITIES: BGPCommunity[] = [
  {
    community: '64511:21',
    action: 'NO_EXPORT_UPSTREAM',
    description: '不向任何上游 (Upstream) Transit 提供商转发该前缀',
    category: 'export',
  },
  {
    community: '64511:22',
    action: 'NO_EXPORT_PEERS',
    description: '仅保留在本地 AS 内部，不向任何外部 BGP Peers 广播',
    category: 'export',
  },
];

/**
 * 联络方式矩阵
 */
export const CONTACT_METHODS: ContactMethod[] = [
  {
    platform: 'Telegram',
    handle: '@akira_dn42',
    link: 'https://t.me/akira_dn42',
    type: 'telegram',
    responseTime: '< 2 小时 (推荐)',
    preferred: true,
  },
  {
    platform: 'Email',
    handle: 'dn42@akira.moe',
    link: 'mailto:dn42@akira.moe',
    type: 'email',
    responseTime: '< 12 小时',
  },
  {
    platform: 'Matrix',
    handle: '@akira:matrix.org',
    link: 'https://matrix.to/#/@akira:matrix.org',
    type: 'matrix',
    responseTime: '< 6 小时',
  },
];
