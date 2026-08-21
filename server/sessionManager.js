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

/**
 * Baseline scan executed ONCE on server startup
 * Silently imports pre-existing WireGuard ports into port_ledger.json without overwriting
 */
export function initPortLedgerWithBaselineScan(defaultNodeId = 'jp07') {
  try {
    const portLedger = loadJson(PORT_LEDGER_FILE, {});
    if (!portLedger[defaultNodeId]) {
      portLedger[defaultNodeId] = {};
    }

    const baselinePorts = scanBaselineExistingPorts();
    let updated = false;

    for (const item of baselinePorts) {
      const portKey = String(item.port);
      if (!portLedger[defaultNodeId][portKey]) {
        portLedger[defaultNodeId][portKey] = {
          label: item.label,
          port: item.port,
          type: 'in_use',
          status: 'existing',
          name: item.name,
          source: item.source,
          scannedAt: new Date().toISOString(),
        };
        updated = true;
      }
    }

    if (updated) {
      saveJson(PORT_LEDGER_FILE, portLedger);
    }
  } catch (err) {
    console.error('Error during baseline port scan:', err);
  }
}

// Silently perform baseline scan on initial server startup
initPortLedgerWithBaselineScan('jp07');

// Helper to safely load JSON
function loadJson(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content || '{}');
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return defaultValue;
}

// Helper to safely save JSON
function saveJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
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
    { key: 'peerName', label: '隧道称呼 (Name)' },
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

  const asnNum = parseInt(cleanAsn, 10);
  const safeAsn = isNaN(asnNum) || asnNum <= 0 ? 0 : asnNum;
  const calculatedPort = 20000 + (safeAsn % 10000);
  const newPort = (payload.hostPort && Number(payload.hostPort) >= 10000) ? Number(payload.hostPort) : calculatedPort;

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

