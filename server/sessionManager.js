import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getUnifiedOccupiedPorts } from './portScanner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'peering_sessions.json');
const PORT_LEDGER_FILE = path.join(DATA_DIR, 'port_ledger.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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
 * Retrieves all occupied ports for a specific node (merging ledger, config, and live kernel WireGuard ports)
 * @param {string} nodeId 
 * @returns {number[]}
 */
export function getOccupiedPortsForNode(nodeId) {
  const portLedger = loadJson(PORT_LEDGER_FILE, {});
  const nodePorts = portLedger[nodeId] || {};
  const ledgerPorts = Object.keys(nodePorts).map(p => parseInt(p, 10)).filter(p => !isNaN(p));
  return getUnifiedOccupiedPorts(nodeId, ledgerPorts);
}

/**
 * Allocates or re-allocates a port in the port ledger
 */
function updatePortLedger(nodeId, sessionId, asn, newPort, oldPort) {
  const portLedger = loadJson(PORT_LEDGER_FILE, {});
  if (!portLedger[nodeId]) {
    portLedger[nodeId] = {};
  }

  // Release old port if it changed and belonged to this session
  if (oldPort && oldPort !== newPort && portLedger[nodeId][oldPort]?.sessionId === sessionId) {
    delete portLedger[nodeId][oldPort];
  }

  // Claim new port
  if (newPort) {
    portLedger[nodeId][newPort] = {
      sessionId,
      asn: String(asn),
      allocatedAt: new Date().toISOString(),
      status: 'allocated',
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
    updatePortLedger(nodeId, existingSession.id, cleanAsn, newPort, oldPort);
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
          diffs: ['• 首次提交对等互联申请'],
        },
      ],
    };

    sessions[sessionId] = session;
    updatePortLedger(nodeId, sessionId, cleanAsn, newPort, null);
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
