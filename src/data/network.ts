import type { NetworkMeta, NodeInfo, ContactMethod } from '../types/network';

/**
 * 自治系统 (AS) 核心元数据配置 (示例模板)
 */
export const NETWORK_META: NetworkMeta = {
  asn: 'AS4242421337',
  asnNumber: 4242421337,
  networkName: 'Example DN42 Network',
  maintainer: 'EXAMPLE-MNT',
  ipv4Pool: '172.20.0.0/24',
  ipv6Pool: 'fd00:4242:1337::/48',
  routingPolicy: 'Open for all DN42 participants / MP-BGP (ENH) / Strict ROA Validation',
  bgpMode: 'MP-BGP + Extended Next Hop (ENH) / Dual-Stack Supported',
  portFormulaDisplay: '20000 + (ASN % 10000) [严格限制 10000~65535，多实例自动顺延 30000/40000+ASN]',
  lookingGlassUrl: 'https://lg.example.dn42',
  dn42WhoisUrl: 'https://explorer.burble.com/#/AS4242421337',
  topologyUrl: 'https://topo.example.dn42',
  flapAlertUrl: 'https://flap.example.dn42',
  autoPeerUrl: 'https://peer.example.dn42',
  lastUpdated: '2026-08-20',
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
    tier: 4,
    status: 'fallback_multi',
    label: `动态顺延端口 ${offsetPort}`,
    isFallback: true,
    isAvailable: true,
  };
}

/**
 * 确定性计算对端应该监听的端口 (客户端端口):
 * - 默认分配 20000 + (本网 ASN % 10000)
 */
export function calculatePeerListenPort(_nodeId?: string, forceFallback: boolean = false): number {
  const hostSuffix = NETWORK_META.asnNumber % 10000;
  
  if (forceFallback) {
    return 30000 + hostSuffix;
  }

  return 20000 + hostSuffix;
}

/**
 * 全球 PoP 节点列表配置 (示例模板)
 */
export const NETWORK_NODES: NodeInfo[] = [
  {
    id: 'jp07',
    code: 'JP-1',
    name: 'Tokyo 01 (Japan Hub)',
    flag: '🇯🇵',
    city: 'Tokyo',
    country: 'Japan',
    region: 'apac',
    coordinates: [35.6762, 139.6503],
    status: 'active',
    isp: 'Example Datacenter',
    endpointDomain: 'jp1.example.dn42',
    wgPublicKey: 'EXAMPLE_WG_PUBKEY_REPLACE_WITH_YOUR_KEY_111111=',
    tunnelIpv4: '172.20.0.1',
    tunnelIpv6ULA: 'fd00:4242:1337::1',
    tunnelIpv6LLA: 'fe80::1337',
    mtu: 1420,
    features: ['★ Core Hub', 'MP-BGP', 'ENH', 'Extended Next Hop'],
    notes: '东亚互联核心枢纽，推荐日本、香港、台湾等东亚地区接入。',
    occupiedPorts: [],
  },
  {
    id: 'us01',
    code: 'US-1',
    name: 'Silicon Valley 01 (US West)',
    flag: '🇺🇸',
    city: 'San Jose',
    country: 'United States',
    region: 'na',
    coordinates: [37.3382, -121.8863],
    status: 'active',
    isp: 'Example Datacenter',
    endpointDomain: 'us1.example.dn42',
    wgPublicKey: 'EXAMPLE_WG_PUBKEY_REPLACE_WITH_YOUR_KEY_222222=',
    tunnelIpv4: '172.20.0.2',
    tunnelIpv6ULA: 'fd00:4242:1337::2',
    tunnelIpv6LLA: 'fe80::1337',
    mtu: 1420,
    features: ['MP-BGP', 'ENH', 'Trans-Pacific'],
    notes: '美洲及美西互联推荐节点，直连跨太平洋骨干。',
    occupiedPorts: [],
  },
  {
    id: 'de02',
    code: 'DE-1',
    name: 'Frankfurt 01 (Europe Hub)',
    flag: '🇩🇪',
    city: 'Frankfurt',
    country: 'Germany',
    region: 'eu',
    coordinates: [50.1109, 8.6821],
    status: 'active',
    isp: 'Example Datacenter',
    endpointDomain: 'de1.example.dn42',
    wgPublicKey: 'EXAMPLE_WG_PUBKEY_REPLACE_WITH_YOUR_KEY_333333=',
    tunnelIpv4: '172.20.0.3',
    tunnelIpv6ULA: 'fd00:4242:1337::3',
    tunnelIpv6LLA: 'fe80::1337',
    mtu: 1420,
    features: ['MP-BGP', 'ENH', 'DE-CIX Peering'],
    notes: '欧洲地区核心互联节点。',
    occupiedPorts: [],
  },
];

/**
 * 内部骨干链路连接关系
 */
export const BACKBONE_LINKS: [string, string][] = [
  ['jp07', 'us01'],
  ['jp07', 'de02'],
];

/**
 * 联络方式矩阵
 */
export const CONTACT_METHODS: ContactMethod[] = [
  {
    platform: 'Telegram',
    handle: '@example_dn42',
    link: 'https://t.me/example_dn42',
    type: 'telegram',
    responseTime: '< 2 小时 (推荐)',
    preferred: true,
  },
  {
    platform: 'Email',
    handle: 'dn42@example.com',
    link: 'mailto:dn42@example.com',
    type: 'email',
    responseTime: '< 12 小时',
  },
  {
    platform: 'Matrix',
    handle: '@admin:example.org',
    link: 'https://matrix.to/#/@admin:example.org',
    type: 'matrix',
    responseTime: '< 6 小时',
  },
];
