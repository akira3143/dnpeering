import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanBaselineExistingPorts } from './portScanner.js';
import { getActiveConfig } from './configLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'peering_sessions.json');
const PORT_LEDGER_FILE = path.join(DATA_DIR, 'port_ledger.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const PORT_LEDGER_HEADER = `// ==============================================================================
// 📊 AkiLab DN42 - WireGuard 端口占用与已锁定账本 (port_ledger.json)
//
// 💡 字段与类型说明 (type):
//   • "in_use"   : 已使用 / 正式活跃 (老 Peer 或已审核通车的互联，永久占用)
//   • "locked"   : 申请中 / 临时锁定 (前台申请待审核，7 天未连通可回收)
//   • "reserved" : 预留端口 / 禁止分配 (管理员保留自用)
//
// 🔍 系统级端口占用扫描命令参考:
//   • 快速查看监听: ss -tulnp | grep -E ":(2[0-9]{4}|3[0-9]{4})"
//   • 查看 WG 端口: wg show all listen-port
//   • 一键基线扫描: dnp scan
// ==============================================================================
`;

/**
 * Safely strips single-line and multi-line comments and trailing commas from JSON strings (JSONC)
 */
function stripJsonComments(str) {
  if (!str) return '{}';
  return str
    .replace(/("(?:\\.|[^"\\])*")|(\/\/[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?\*\/)/g, (match, strLiteral) => {
      return strLiteral || '';
    })
    .replace(/,\s*([\]}])/g, '$1');
}

// Helper to safely load JSON (supports JSONC comments and trailing commas)
function loadJson(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(stripJsonComments(content));
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return defaultValue;
}

// Helper to safely save JSON
function saveJson(filePath, data) {
  try {
    let content = JSON.stringify(data, null, 2);
    if (filePath === PORT_LEDGER_FILE) {
      content = PORT_LEDGER_HEADER + content;
    }
    fs.writeFileSync(filePath, content, 'utf-8');
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
}

/**
 * Determines the local node ID running on the current host machine
 */
export function getLocalNodeId() {
  try {
    const activeCfg = getActiveConfig();
    const nodes = activeCfg?.nodes || [];
    // 1. Match node pointing to 127.0.0.1 or localhost in lgProxyUrl
    const localNode = nodes.find(n => 
      n.lgProxyUrl && (n.lgProxyUrl.includes('127.0.0.1') || n.lgProxyUrl.includes('localhost'))
    );
    if (localNode?.id) return String(localNode.id).toLowerCase();

    // 2. Match process.env.LG_DEFAULT_NODE
    if (process.env.LG_DEFAULT_NODE) return String(process.env.LG_DEFAULT_NODE).toLowerCase();

    // 3. Fallback to first node
    return nodes[0]?.id ? String(nodes[0].id).toLowerCase() : 'jp07';
  } catch {
    return 'jp07';
  }
}

/**
 * Baseline scan executed ONCE on server startup
 * Strictly records ports discovered on THIS local machine into THIS local node only
 */
export function initPortLedgerWithBaselineScan(targetNodeId) {
  try {
    const localId = targetNodeId ? String(targetNodeId).toLowerCase() : getLocalNodeId();
    const portLedger = loadJson(PORT_LEDGER_FILE, {});
    const activeCfg = getActiveConfig();
    const nodes = activeCfg?.nodes || [];
    
    // Clean up historical duplicate pollution on other remote nodes
    for (const node of nodes) {
      const nid = String(node.id || node.code || '').toLowerCase();
      if (nid && nid !== localId && portLedger[nid]) {
        // If remote node has existing/system_socket baseline entries that were wrongly duplicated, clean them
        for (const [pKey, pVal] of Object.entries(portLedger[nid])) {
          if (pVal?.source === 'system_socket' || pVal?.source === 'procfs_udp' || (pVal?.status === 'existing' && !pVal?.asn)) {
            delete portLedger[nid][pKey];
          }
        }
      }
    }

    if (!portLedger[localId]) {
      portLedger[localId] = {};
    }

    const baselinePorts = scanBaselineExistingPorts();
    if (baselinePorts.length === 0) {
      saveJson(PORT_LEDGER_FILE, portLedger);
      return { updated: false, count: 0, items: [], localId };
    }

    let totalUpdated = 0;

    for (const item of baselinePorts) {
      const portKey = String(item.port);
      const existing = portLedger[localId][portKey];

      if (!existing) {
        portLedger[localId][portKey] = {
          label: item.label,
          port: item.port,
          type: 'in_use',
          status: 'existing',
          name: item.name,
          source: item.source,
          scannedAt: new Date().toISOString(),
        };
        totalUpdated++;
      } else if (existing.status === 'existing') {
        // Upgrade generic label if specific wireguard interface name was detected
        if (item.name && item.name !== 'wireguard' && item.name !== 'udp_service' && item.name !== 'udp_in_use') {
          existing.label = item.label;
          existing.name = item.name;
          existing.source = item.source;
          totalUpdated++;
        }
      }
    }

    saveJson(PORT_LEDGER_FILE, portLedger);
    return { updated: totalUpdated > 0, count: baselinePorts.length, items: baselinePorts, localId };
  } catch (err) {
    console.error('Error during baseline port scan:', err);
    return { updated: false, count: 0, items: [], localId: 'jp07' };
  }
}

// Silently perform baseline scan on initial server startup for local node
initPortLedgerWithBaselineScan();

// Periodic baseline scan every 1 hour (incremental append only: 限本机本地节点，绝不污染远端 PoP 节点)
const scanTimer = setInterval(() => {
  initPortLedgerWithBaselineScan();
}, 60 * 60 * 1000);
if (typeof scanTimer?.unref === 'function') {
  scanTimer.unref();
}

/**
 * Generates a memorable, unique session ticket ID
 * e.g., PEER-JP07-1234-A8F2
 */
function generateSessionId(nodeCode, asn) {
  const cleanCode = (nodeCode || 'NODE').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanAsn = String(asn || '0').replace(/\D/g, '');
  const suffix = cleanAsn.slice(-4).padStart(4, '0');
  const randomHash = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PEER-${cleanCode}-${suffix}-${randomHash}`;
}

/**
 * Computes human-readable field diffs between two session states
 */
function computeDiff(oldData, newData) {
  const diffs = [];
  const fields = [
    { key: 'peerName', label: '隧道名称 (Name)' },
    { key: 'peerWgPubKey', label: 'WireGuard 公钥' },
    { key: 'peerEndpoint', label: '公网 Endpoint' },
    { key: 'peerIpv6LLA', label: 'IPv6 LLA' },
    { key: 'peerIpv6ULA', label: 'IPv6 ULA' },
    { key: 'peerIpv4', label: 'IPv4 隧道' },
    { key: 'hostPort', label: 'AkiLab 端口' },
    { key: 'bgpMode', label: 'BGP 协议模式' },
    { key: 'mtu', label: 'MTU' },
    { key: 'userNote', label: '附加留言' },
  ];

  for (const field of fields) {
    const oldVal = oldData[field.key] ? String(oldData[field.key]).trim() : '';
    const newVal = newData[field.key] ? String(newData[field.key]).trim() : '';

    if (oldVal !== newVal) {
      if (!oldVal && newVal) {
        diffs.push(`• <b>${field.label}</b>: 新增 <code>${newVal}</code>`);
      } else if (oldVal && !newVal) {
        diffs.push(`• <b>${field.label}</b>: 已清除`);
      } else {
        diffs.push(`• <b>${field.label}</b>: 由 <code>${oldVal}</code> 变更为 <code>${newVal}</code>`);
      }
    }
  }

  return diffs;
}

/**
 * Retrieves all occupied (locked or in-use) ports for a specific node
 * @param {string} nodeId 
 * @returns {number[]}
 */
export function getOccupiedPortsForNode(nodeId) {
  const cleanId = String(nodeId || 'jp07').toLowerCase().trim();
  const portLedger = loadJson(PORT_LEDGER_FILE, {});
  const nodePorts = portLedger[cleanId] || {};
  
  const occupiedSet = new Set();
  
  // 1. Read from port_ledger.json
  for (const [portStr] of Object.entries(nodePorts)) {
    const p = parseInt(portStr, 10);
    if (!isNaN(p)) occupiedSet.add(p);
  }

  // 2. Read from portal.config.yaml (if any declared in config)
  try {
    const activeCfg = getActiveConfig();
    if (activeCfg && Array.isArray(activeCfg.nodes)) {
      const matched = activeCfg.nodes.find((n) => n.id === cleanId);
      if (matched && Array.isArray(matched.occupiedPorts)) {
        matched.occupiedPorts.forEach((p) => {
          const num = parseInt(p, 10);
          if (!isNaN(num)) occupiedSet.add(num);
        });
      }
    }
  } catch {}

  return Array.from(occupiedSet).sort((a, b) => a - b);
}

/**
 * Gets detailed port ledger separating locked vs in_use ports
 * @param {string} nodeId 
 */
export function getDetailedPortLedger(nodeId) {
  const cleanId = String(nodeId || 'jp07').toLowerCase().trim();
  const portLedger = loadJson(PORT_LEDGER_FILE, {});
  return portLedger[cleanId] || {};
}

/**
 * Allocates or re-allocates a port in the port ledger
 * Clearly marks type as 'locked' (pending review) vs 'in_use' (active session)
 */
export function updatePortLedger(nodeId, sessionId, asn, newPort, oldPort, peerName = '', portType = 'locked', status = 'pending_review') {
  const portLedger = loadJson(PORT_LEDGER_FILE, {});
  if (!portLedger[nodeId]) {
    portLedger[nodeId] = {};
  }

  // Release old port if it changed and belonged to this session
  if (oldPort && oldPort !== newPort && portLedger[nodeId][oldPort]?.sessionId === sessionId) {
    delete portLedger[nodeId][oldPort];
  }

  // Claim new port with standard human-friendly format "服务器或wg隧道名 + 端口号"
  if (newPort) {
    const cleanAsn = String(asn || '').replace(/\D/g, '');
    const ifaceName = (peerName || `wg-peer-${cleanAsn || 'peer'}`).trim();
    const isLocked = portType === 'locked' || status === 'pending_review';
    
    portLedger[nodeId][newPort] = {
      label: `${ifaceName} : ${newPort}`,
      port: Number(newPort),
      type: isLocked ? 'locked' : 'in_use', // 'locked' vs 'in_use'
      status: status || (isLocked ? 'pending_review' : 'active'),
      name: ifaceName,
      asn: cleanAsn,
      sessionId,
      updatedAt: new Date().toISOString(),
      source: 'peer_application',
    };
  }

  saveJson(PORT_LEDGER_FILE, portLedger);
}

/**
 * Finds an active session for the given ASN and Node
 */
export function findSessionByAsnAndNode(asn, nodeId) {
  const sessions = loadJson(SESSIONS_FILE, {});
  const cleanAsn = String(asn || '').replace(/\D/g, '');
  return Object.values(sessions).find(
    s => s.asn === cleanAsn && s.nodeId === nodeId
  );
}

/**
 * Creates or updates a peering session with atomic port ledger updates & diff tracking
 * @param {Object} payload 
 * @param {string} clientIp 
 * @returns {{session: Object, isNew: boolean, diffs: string[], previousVersion: number}}
 */
export function savePeeringSession(payload, clientIp) {
  const sessions = loadJson(SESSIONS_FILE, {});
  const cleanAsn = String(payload.peerAsn || '').replace(/\D/g, '');
  const nodeId = payload.node?.id || 'jp07';
  const nodeCode = payload.node?.code || 'JP7';

  // Check if session already exists for this ASN + Node combination
  let existingSession = payload.sessionId ? sessions[payload.sessionId] : null;
  if (!existingSession) {
    existingSession = findSessionByAsnAndNode(cleanAsn, nodeId);
  }

  const portLedger = loadJson(PORT_LEDGER_FILE, {});
  const nodePorts = portLedger[nodeId] || {};

  const asnNum = parseInt(cleanAsn, 10);
  const safeAsn = isNaN(asnNum) || asnNum <= 0 ? 0 : asnNum;
  let requestedPort = (payload.hostPort && Number(payload.hostPort) >= 10000 && Number(payload.hostPort) <= 65535)
    ? Number(payload.hostPort)
    : 20000 + (safeAsn % 10000);

  // If the requested port is already occupied/locked by a DIFFERENT ASN/session or baseline system interface, automatically step up!
  let allocatedPort = requestedPort;
  let attempts = 0;

  const isPortOccupiedByOther = (p) => {
    const entry = nodePorts[p];
    if (!entry) return false;
    if (existingSession && (entry.sessionId === existingSession.id || (entry.asn && entry.asn === cleanAsn))) {
      return false;
    }
    return true;
  };

  while (isPortOccupiedByOther(allocatedPort) && attempts < 50) {
    allocatedPort += 10000;
    if (allocatedPort > 65535) {
      allocatedPort = 20000 + ((allocatedPort + 1) % 10000);
    }
    attempts++;
  }
  const newPort = allocatedPort;

  const now = new Date().toISOString();
  let session;
  let isNew = false;
  let diffs = [];
  let previousVersion = 0;

  if (existingSession) {
    // UPDATE EXISTING SESSION
    isNew = false;
    previousVersion = existingSession.version || 1;
    diffs = computeDiff(existingSession, { ...payload, hostPort: newPort });

    const oldPort = existingSession.hostPort;

    session = {
      ...existingSession,
      ...payload,
      hostPort: newPort,
      asn: cleanAsn,
      nodeId,
      nodeCode,
      version: previousVersion + 1,
      lastClientIp: clientIp,
      updatedAt: now,
      history: [
        ...(existingSession.history || []),
        {
          version: previousVersion + 1,
          timestamp: now,
          clientIp,
          diffs,
        },
      ],
    };

    sessions[existingSession.id] = session;
    const isSessionActive = session.status === 'active' || session.status === 'established';
    updatePortLedger(
      nodeId,
      existingSession.id,
      cleanAsn,
      newPort,
      oldPort,
      payload.peerName || existingSession.peerName,
      isSessionActive ? 'in_use' : 'locked',
      session.status || 'pending_review'
    );
  } else {
    // CREATE NEW SESSION
    isNew = true;
    const sessionId = generateSessionId(nodeCode, cleanAsn);

    session = {
      id: sessionId,
      ...payload,
      hostPort: newPort,
      asn: cleanAsn,
      nodeId,
      nodeCode,
      version: 1,
      status: 'pending_review',
      clientIp,
      createdAt: now,
      updatedAt: now,
      history: [
        {
          version: 1,
          timestamp: now,
          clientIp,
          diffs: ['• 首次提交对等互联申请 (端口已锁定)'],
        },
      ],
    };

    sessions[sessionId] = session;
    // Lock the port immediately upon submission!
    updatePortLedger(
      nodeId,
      sessionId,
      cleanAsn,
      newPort,
      null,
      payload.peerName,
      'locked',
      'pending_review'
    );
  }

  saveJson(SESSIONS_FILE, sessions);

  return {
    session,
    isNew,
    diffs,
    previousVersion,
  };
}

/**
 * Gets a specific session by its ID
 */
export function getSessionById(sessionId) {
  const sessions = loadJson(SESSIONS_FILE, {});
  return sessions[sessionId] || null;
}

/**
 * Gets all sessions belonging to a specific ASN (Admin gets all active sessions)
 */
export function getSessionsByAsn(asn) {
  const raw = String(asn || '').trim();
  const cleanAsn = raw.replace(/\D/g, '');
  const sessions = loadJson(SESSIONS_FILE, {});
  // Admin query returns all sessions across all ASNs
  if (cleanAsn === '4343439696' || raw.toLowerCase() === 'akira' || raw.toLowerCase() === 'admin') {
    return Object.values(sessions);
  }
  return Object.values(sessions).filter(s => s.asn === cleanAsn);
}

/**
 * Deletes a session and releases its reserved ports
 * Supports fallback lookup by (asn + nodeId) for legacy sessions without explicit ID
 * @param {string} sessionId 
 * @param {string|number} [asn] 
 * @param {string} [nodeId]
 * @returns {{success: boolean, session?: Object, error?: string}}
 */
export function deleteSession(sessionId, asn, nodeId) {
  const cleanId = String(sessionId || '').trim();
  const rawAsn = String(asn || '').trim();
  const cleanAsn = rawAsn.replace(/\D/g, '');
  const cleanNode = String(nodeId || '').trim();
  const isAdmin = cleanAsn === '4343439696' || rawAsn.toLowerCase() === 'akira' || rawAsn.toLowerCase() === 'admin';

  const sessions = loadJson(SESSIONS_FILE, {});
  let targetId = cleanId;
  let session = targetId ? sessions[targetId] : null;

  // If not found by ID, attempt lookup by ASN and nodeId
  if (!session && cleanAsn) {
    const foundEntry = Object.entries(sessions).find(([, s]) => {
      if (cleanNode && s.nodeId !== cleanNode) return false;
      return s.asn === cleanAsn;
    });

    if (foundEntry) {
      targetId = foundEntry[0];
      session = foundEntry[1];
    }
  }

  // If still not found, check port ledger for any orphan allocations and clean them up
  if (!session) {
    if (cleanNode && cleanAsn) {
      const portLedger = loadJson(PORT_LEDGER_FILE, {});
      if (portLedger[cleanNode]) {
        for (const [port, item] of Object.entries(portLedger[cleanNode])) {
          if (item.asn === cleanAsn || (cleanId && item.sessionId === cleanId)) {
            delete portLedger[cleanNode][port];
          }
        }
        saveJson(PORT_LEDGER_FILE, portLedger);
      }
    }

    return {
      success: true,
      session: {
        id: cleanId || 'legacy-session',
        asn: cleanAsn,
        nodeId: cleanNode || 'jp07',
        hostPort: 0,
      },
    };
  }

  // If ASN is provided, verify ownership (admin bypasses ownership check)
  if (!isAdmin && cleanAsn && session.asn !== cleanAsn) {
    return { success: false, error: '无权操作此会话' };
  }

  // Release port in port ledger
  if (session.nodeId && session.hostPort) {
    updatePortLedger(session.nodeId, session.id, session.asn, null, session.hostPort);
  }

  // Remove session from file
  if (targetId && sessions[targetId]) {
    delete sessions[targetId];
    saveJson(SESSIONS_FILE, sessions);
  }

  return {
    success: true,
    session,
  };
}

/**
 * Updates a session status and updates the corresponding port to 'in_use' (active) or releases it
 * @param {string} sessionId 
 * @param {'active'|'established'|'rejected'|'revoked'|'pending_review'} newStatus 
 */
export function updateSessionStatus(sessionId, newStatus) {
  const sessions = loadJson(SESSIONS_FILE, {});
  const session = sessions[sessionId];
  if (!session) return false;

  session.status = newStatus;
  session.updatedAt = new Date().toISOString();
  sessions[sessionId] = session;
  saveJson(SESSIONS_FILE, sessions);

  if (session.nodeId && session.hostPort) {
    if (newStatus === 'active' || newStatus === 'established') {
      // Transition from 'locked' to 'in_use'
      updatePortLedger(
        session.nodeId,
        session.id,
        session.asn,
        session.hostPort,
        null,
        session.peerName,
        'in_use',
        'active'
      );
    } else if (newStatus === 'rejected' || newStatus === 'revoked') {
      // Release port
      updatePortLedger(session.nodeId, session.id, session.asn, null, session.hostPort);
    }
  }

  return true;
}

/**
 * Merges reported ports from a remote probe into port_ledger.json
 * @param {string} nodeId 
 * @param {Array<{port: number, name?: string, label?: string, type?: string, status?: string}>} reportedPorts 
 */
export function mergeProbeReportedPorts(nodeId, reportedPorts = []) {
  const cleanId = String(nodeId || '').toLowerCase().trim();
  if (!cleanId || !Array.isArray(reportedPorts)) return { success: false, count: 0 };

  const portLedger = loadJson(PORT_LEDGER_FILE, {});
  if (!portLedger[cleanId]) {
    portLedger[cleanId] = {};
  }

  const reportedPortSet = new Set();
  let updatedCount = 0;
  for (const item of reportedPorts) {
    const portNum = parseInt(item.port, 10);
    if (isNaN(portNum) || portNum < 10000 || portNum > 65535) continue;

    reportedPortSet.add(portNum);
    const portKey = String(portNum);
    const existing = portLedger[cleanId][portKey];

    // If port is already locked by a pending user application, preserve the lock
    if (existing && existing.type === 'locked') {
      continue;
    }

    const ifaceName = (item.name || `wg-peer-${portNum}`).trim();
    portLedger[cleanId][portKey] = {
      label: item.label || `${ifaceName} : ${portNum}`,
      port: portNum,
      type: item.type || 'in_use',
      status: item.status || 'existing',
      name: ifaceName,
      source: 'remote_probe',
      reportedAt: new Date().toISOString(),
    };
    updatedCount++;
  }

  // Prune any stale 'remote_probe' ports that are no longer reported by the probe
  for (const [portKey, entry] of Object.entries(portLedger[cleanId])) {
    const p = parseInt(portKey, 10);
    if (entry.source === 'remote_probe' && !reportedPortSet.has(p)) {
      delete portLedger[cleanId][portKey];
    }
  }

  saveJson(PORT_LEDGER_FILE, portLedger);
  return { success: true, count: updatedCount, nodeId: cleanId };
}

const UNCONNECTED_EXPIRATION_DAYS = 7;
const UNCONNECTED_EXPIRATION_MS = UNCONNECTED_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Automatically cleans up inactive / un-established sessions older than 7 days
 * and releases their occupied ports back to the pool
 * @param {number} [expirationMs] 
 * @returns {Array<{sessionId: string, asn: string, nodeId: string, hostPort: number, reason: string}>}
 */
export function cleanupExpiredUnconnectedSessions(expirationMs = UNCONNECTED_EXPIRATION_MS) {
  const sessions = loadJson(SESSIONS_FILE, {});
  const portLedger = loadJson(PORT_LEDGER_FILE, {});
  const now = Date.now();
  const deletedSessions = [];

  for (const [id, session] of Object.entries(sessions)) {
    // If session is already established/active, it is permanent
    const isEstablished = session.status === 'established' || session.status === 'active';
    if (isEstablished) {
      continue;
    }

    // Calculate age based on updatedAt or createdAt
    const sessionTime = new Date(session.updatedAt || session.createdAt || 0).getTime();
    const ageMs = now - sessionTime;

    if (ageMs >= expirationMs) {
      // Expired! Clean up session & release its port
      const nodeId = session.nodeId || 'jp07';
      const hostPort = session.hostPort;

      // 1. Release port from port_ledger.json
      if (nodeId && hostPort && portLedger[nodeId] && portLedger[nodeId][hostPort]) {
        if (portLedger[nodeId][hostPort].sessionId === id || portLedger[nodeId][hostPort].asn === session.asn) {
          delete portLedger[nodeId][hostPort];
        }
      }

      // 2. Delete session
      deletedSessions.push({
        sessionId: id,
        asn: session.asn,
        nodeId,
        hostPort,
        peerName: session.peerName,
        ageDays: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
        reason: `超过 ${UNCONNECTED_EXPIRATION_DAYS} 天未建立 BGP 会话`,
      });

      delete sessions[id];
    }
  }

  if (deletedSessions.length > 0) {
    saveJson(SESSIONS_FILE, sessions);
    saveJson(PORT_LEDGER_FILE, portLedger);
    console.log(`🧹 [自动清理] 已自动清理 ${deletedSessions.length} 个超过 ${UNCONNECTED_EXPIRATION_DAYS} 天未连通的会话并释放端口:`, deletedSessions.map(s => `${s.sessionId} (AS${s.asn})`).join(', '));
  }

  return deletedSessions;
}

// Perform automated session expiry cleanup on startup and schedule periodic check every 6 hours
try {
  cleanupExpiredUnconnectedSessions();
  const sessionCleanupTimer = setInterval(() => {
    cleanupExpiredUnconnectedSessions();
  }, 6 * 60 * 60 * 1000);
  if (typeof sessionCleanupTimer?.unref === 'function') {
    sessionCleanupTimer.unref();
  }
} catch (err) {
  console.error('Error scheduling session cleanup:', err);
}


