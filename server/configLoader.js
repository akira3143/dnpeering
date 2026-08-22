/**
 * Unified Configuration Loader & Hot-Reload Manager
 * Loads portal.config.yaml / portal.config.json from local file or remote URL
 * Provides real-time network metadata, PoP nodes, and server credentials
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Default fallback paths
const LOCAL_CONFIG_YAML = path.join(ROOT_DIR, 'portal.config.yaml');
const LOCAL_CONFIG_JSON = path.join(ROOT_DIR, 'portal.config.json');

// Default static fallback structure
const DEFAULT_CONFIG = {
  network: {
    asn: 'AS4242421337',
    asnNumber: 4242421337,
    networkName: 'Example DN42 Network',
    shortName: 'example',
    tagline: '个人路由实验网络',
    description: '',
    maintainer: 'EXAMPLE-MNT',
    brandLogo: '',
    ipv4Pool: '172.20.0.0/24',
    ipv6Pool: 'fd00:4242:1337::/48',
    routingPolicy: 'Open for all DN42 participants / MP-BGP (ENH) / Strict ROA Validation',
    bgpMode: 'MP-BGP + Extended Next Hop (ENH) / Dual-Stack Supported',
    portFormulaDisplay: '20000 + (ASN % 10000) [限制 10000~65535，多实例自动顺延 30000/40000+ASN]',
    lookingGlassUrl: 'https://lg.example.dn42',
    dn42WhoisUrl: 'https://explorer.burble.com/#/AS4242421337',
    topologyUrl: 'https://topo.example.dn42',
    flapAlertUrl: 'https://flap.example.dn42',
    autoPeerUrl: 'https://peer.example.dn42',
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
  nodes: [
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
      lgProxyUrl: 'http://127.0.0.1:5000',
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
      lgProxyUrl: 'http://172.20.14.2:5000',
    },
  ],
  contacts: [
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
  ],
  communities: [
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
  ],
  server: {
    port: 3143,
  },
};

// In-memory active configuration
let activeConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
let isWatcherActive = false;

/**
 * Strips comments from a YAML line while preserving '#' inside quotes or URLs
 */
function stripYamlComment(line) {
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && !inSingle && (i === 0 || line[i - 1] !== '\\')) {
      inDouble = !inDouble;
    } else if (char === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (char === '#' && !inDouble && !inSingle) {
      // '#' only starts a YAML comment if at the beginning of the line or preceded by whitespace
      if (i === 0 || /\s/.test(line[i - 1])) {
        return line.slice(0, i);
      }
    }
  }
  return line;
}

/**
 * Lightweight Zero-Dependency YAML to JS Object Parser
 * Handles clean standard YAML structures used in configs
 */
export function parseYaml(yamlString) {
  if (!yamlString || typeof yamlString !== 'string') return {};

  const lines = yamlString.split('\n');
  const root = {};
  const stack = [{ indent: -1, target: root }];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineWithoutComment = stripYamlComment(rawLine);
    if (!lineWithoutComment.trim()) continue;

    const indent = rawLine.search(/\S/);
    const trimmed = lineWithoutComment.trim();

    // Adjust stack to current indentation level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const currentParent = stack[stack.length - 1].target;

    // 1. Array item (starts with -)
    if (trimmed.startsWith('-')) {
      const content = trimmed.slice(1).trim();

      if (!Array.isArray(currentParent)) {
        // If parent was an object waiting for an array key, convert to array
        continue;
      }

      if (content.includes(':')) {
        // Object item in array
        const obj = {};
        const colonIdx = content.indexOf(':');
        const key = content.slice(0, colonIdx).trim();
        const rawVal = content.slice(colonIdx + 1).trim();
        obj[key] = parseYamlScalar(rawVal);
        currentParent.push(obj);
        stack.push({ indent, target: obj });
      } else {
        // Scalar item in array
        currentParent.push(parseYamlScalar(content));
      }
      continue;
    }

    // 2. Key-Value mapping (key: value)
    if (trimmed.includes(':')) {
      const colonIdx = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIdx).trim();
      const rawVal = trimmed.slice(colonIdx + 1).trim();

      if (rawVal === '') {
        // Lookahead to check if next item is array or object
        let nextIsArray = false;
        for (let j = i + 1; j < lines.length; j++) {
          const lookLine = stripYamlComment(lines[j]);
          if (lookLine.trim()) {
            if (lookLine.trim().startsWith('-')) {
              nextIsArray = true;
            }
            break;
          }
        }

        const newTarget = nextIsArray ? [] : {};
        currentParent[key] = newTarget;
        stack.push({ indent, target: newTarget });
      } else {
        currentParent[key] = parseYamlScalar(rawVal);
      }
    }
  }

  return root;
}

function parseYamlScalar(val) {
  if (!val) return '';
  const clean = val.trim();

  // Strip quotes
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    return clean.slice(1, -1);
  }

  // Boolean
  if (clean.toLowerCase() === 'true') return true;
  if (clean.toLowerCase() === 'false') return false;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(clean) && !clean.startsWith('0x') && clean.length < 15) {
    const num = Number(clean);
    if (!isNaN(num)) return num;
  }

  // Inline array: ["a", "b"]
  if (clean.startsWith('[') && clean.endsWith(']')) {
    try {
      // Convert single quotes to double quotes for JSON parsing
      const jsonArray = clean.replace(/'/g, '"');
      return JSON.parse(jsonArray);
    } catch {
      return clean.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
    }
  }

  return clean;
}

/**
 * Normalizes raw YAML/JSON into standard internal network structure
 */
function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return DEFAULT_CONFIG;

  const res = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  // Network meta mapping
  if (raw.network && typeof raw.network === 'object') {
    const n = raw.network;
    const cleanAsn = String(n.asn || res.network.asn).replace(/\D/g, '');
    res.network = {
      ...res.network,
      asn: n.asn ? (String(n.asn).startsWith('AS') ? String(n.asn) : `AS${n.asn}`) : res.network.asn,
      asnNumber: parseInt(cleanAsn, 10) || res.network.asnNumber,
      networkName: n.network_name || n.networkName || res.network.networkName,
      shortName: n.short_name || n.shortName || res.network.shortName || '',
      tagline: n.tagline !== undefined ? n.tagline : res.network.tagline,
      description: n.description !== undefined ? n.description : res.network.description,
      maintainer: n.maintainer || res.network.maintainer,
      brandLogo: n.brand_logo || n.brandLogo || res.network.brandLogo || '',
      ipv4Pool: n.ipv4_pool || n.ipv4Pool || res.network.ipv4Pool,
      ipv6Pool: n.ipv6_pool || n.ipv6Pool || res.network.ipv6Pool,
      routingPolicy: n.routing_policy || n.routingPolicy || res.network.routingPolicy,
      bgpMode: n.bgp_mode || n.bgpMode || res.network.bgpMode,
      portFormulaDisplay: n.port_formula || n.portFormulaDisplay || res.network.portFormulaDisplay,
      lookingGlassUrl: n.looking_glass_url || n.lookingGlassUrl || '',
      dn42WhoisUrl: n.whois_url || n.dn42_whois_url || n.dn42WhoisUrl || `https://explorer.burble.com/#/AS${cleanAsn}`,
      masterUrl: n.master_url || n.core_url || n.masterUrl || n.coreUrl || n.auto_peer_url || n.autoPeerUrl || '',
    };
  }

  // Nodes list mapping
  if (Array.isArray(raw.nodes) && raw.nodes.length > 0) {
    res.nodes = raw.nodes.map((node, idx) => {
      const cleanId = String(node.id || `node_${idx + 1}`).toLowerCase().trim();
      return {
        id: cleanId,
        code: node.code || cleanId.toUpperCase(),
        name: node.name || `${cleanId.toUpperCase()} Node`,
        flag: node.flag || '🌐',
        city: node.city || 'Unknown',
        country: node.country || 'Global',
        region: node.region || 'apac',
        coordinates: Array.isArray(node.coordinates) ? node.coordinates : [35.6762, 139.6503],
        status: node.status || 'active',
        isp: node.isp || 'Datacenter',
        endpointDomain: node.endpoint || node.endpointDomain || `${cleanId}.example.dn42`,
        wgPublicKey: node.wg_pubkey || node.wgPublicKey || 'EXAMPLE_WG_PUBKEY_REPLACE_ME=',
        tunnelIpv4: node.ipv4 || node.tunnelIpv4 || '',
        tunnelIpv6ULA: node.ipv6_ula || node.tunnelIpv6ULA || '',
        tunnelIpv6LLA: node.ipv6_lla || node.tunnelIpv6LLA || 'fe80::3143',
        mtu: parseInt(node.mtu, 10) || 1420,
        features: Array.isArray(node.features) ? node.features : ['MP-BGP', 'ENH'],
        notes: node.notes || '',
        occupiedPorts: Array.isArray(node.occupied_ports) ? node.occupied_ports : [],
        lgProxyUrl: node.lg_proxy_url || node.lgProxyUrl || (idx === 0 ? 'http://127.0.0.1:5000' : (node.endpoint ? `http://${node.endpoint}:5000` : (node.ipv4 ? `http://${node.ipv4}:5000` : ''))),
      };
    });
  }

  // Contacts mapping
  if (Array.isArray(raw.contacts) && raw.contacts.length > 0) {
    res.contacts = raw.contacts.map((c) => {
      let link = (c.link && c.link !== '#') ? String(c.link).trim() : '';
      if (link.includes('dn42.dev/whois') || link.includes('.dn42/')) {
        link = '';
      }
      return {
        platform: c.platform || 'Contact',
        handle: c.handle || '',
        link,
        type: c.type || (c.platform ? c.platform.toLowerCase() : 'other'),
        responseTime: c.response_time || c.responseTime || '< 12 小时',
        preferred: !!c.preferred,
      };
    });
  }

  // Communities mapping
  if (Array.isArray(raw.communities) && raw.communities.length > 0) {
    res.communities = raw.communities;
  }

  // Server credentials mapping (if provided in yaml, env takes priority unless empty)
  if (raw.server && typeof raw.server === 'object') {
    res.server = {
      port: parseInt(raw.server.port, 10) || 3143,
      ...raw.server,
    };
  }

  return res;
}

/**
 * Loads configuration from local file or remote URL
 */
export async function loadUnifiedConfig() {
  const remoteUrl = process.env.REMOTE_CONFIG_URL || process.env.CONFIG_URL || '';

  // 1. Try remote URL if configured
  if (remoteUrl) {
    // Security: enforce HTTPS for remote configuration sources
    if (!remoteUrl.startsWith('https://') && !remoteUrl.startsWith('http://127.0.0.1') && !remoteUrl.startsWith('http://localhost')) {
      console.warn(`⚠️ [Config] Remote config URL must use HTTPS (got: ${remoteUrl}). Skipping remote load.`);
    } else {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(remoteUrl, { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        const text = await res.text();
        let parsed = {};
        if (remoteUrl.endsWith('.json') || text.trim().startsWith('{')) {
          parsed = JSON.parse(text);
        } else {
          parsed = parseYaml(text);
        }
        activeConfig = normalizeConfig(parsed);
        console.log(`🌐 [Config] Loaded unified configuration from remote URL: ${remoteUrl}`);
        return activeConfig;
      }
    } catch (err) {
      console.warn(`⚠️ [Config] Failed to fetch remote config from ${remoteUrl}, falling back to local file:`, err.message);
    }
    } // end HTTPS enforcement else block
  }

  // 2. Try local YAML file
  if (fs.existsSync(LOCAL_CONFIG_YAML)) {
    try {
      const content = fs.readFileSync(LOCAL_CONFIG_YAML, 'utf-8');
      const parsed = parseYaml(content);
      activeConfig = normalizeConfig(parsed);
      setupLocalWatcher(LOCAL_CONFIG_YAML);
      return activeConfig;
    } catch (err) {
      console.error(`❌ [Config] Error parsing ${LOCAL_CONFIG_YAML}:`, err.message);
    }
  }

  // 3. Try local JSON file
  if (fs.existsSync(LOCAL_CONFIG_JSON)) {
    try {
      const content = fs.readFileSync(LOCAL_CONFIG_JSON, 'utf-8');
      const parsed = JSON.parse(content);
      activeConfig = normalizeConfig(parsed);
      setupLocalWatcher(LOCAL_CONFIG_JSON);
      return activeConfig;
    } catch (err) {
      console.error(`❌ [Config] Error parsing ${LOCAL_CONFIG_JSON}:`, err.message);
    }
  }

  return activeConfig;
}

/**
 * Sets up file watching for instant hot-reload without restarting server or rebuilding
 */
function setupLocalWatcher(targetPath) {
  if (isWatcherActive) return;
  isWatcherActive = true;

  try {
    fs.watch(targetPath, { persistent: false }, (eventType) => {
      if (eventType === 'change' || eventType === 'rename') {
        setTimeout(async () => {
          try {
            if (fs.existsSync(targetPath)) {
              const content = fs.readFileSync(targetPath, 'utf-8');
              const parsed = targetPath.endsWith('.json') ? JSON.parse(content) : parseYaml(content);
              activeConfig = normalizeConfig(parsed);
              console.log(`🔄 [Config Hot-Reload] Configuration file "${path.basename(targetPath)}" reloaded instantly in memory!`);
            }
          } catch (e) {
            console.error('Error during config hot-reload:', e.message);
          }
        }, 200);
      }
    });
  } catch {}
}

/**
 * Returns current public network metadata (safe for client-side consumption)
 */
export function getPublicNetworkData() {
  return {
    network: activeConfig.network,
    nodes: activeConfig.nodes.map((node) => {
      // Exclude internal probe URLs from public client payload if desired
      const { lgProxyUrl, ...publicNode } = node;
      return publicNode;
    }),
    contacts: activeConfig.contacts,
    communities: activeConfig.communities,
  };
}

/**
 * Returns complete active configuration
 */
export function getActiveConfig() {
  return activeConfig;
}

// Initial synchronous attempt
try {
  if (fs.existsSync(LOCAL_CONFIG_YAML)) {
    const c = fs.readFileSync(LOCAL_CONFIG_YAML, 'utf-8');
    activeConfig = normalizeConfig(parseYaml(c));
    setupLocalWatcher(LOCAL_CONFIG_YAML);
  } else if (fs.existsSync(LOCAL_CONFIG_JSON)) {
    const c = fs.readFileSync(LOCAL_CONFIG_JSON, 'utf-8');
    activeConfig = normalizeConfig(JSON.parse(c));
    setupLocalWatcher(LOCAL_CONFIG_JSON);
  }
} catch {}
