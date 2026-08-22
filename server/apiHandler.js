import { sendPeeringNotification, sendDeleteNotification } from './telegramBot.js';
import { checkRateLimit, recordSubmission } from './rateLimiter.js';
import {
  savePeeringSession,
  getOccupiedPortsForNode,
  getSessionById,
  getSessionsByAsn,
  deleteSession,
  mergeProbeReportedPorts,
} from './sessionManager.js';
import { getAsnIdentity } from './registrySync.js';
import {
  createAuthChallenge,
  verifySshSignature,
  requestEmailOtp,
  verifyEmailOtp,
  verifyJwt,
  getAsnAuthStatus,
  setPasswordForAsn,
  verifyPasswordLogin,
} from './authService.js';
import { queryPeerBgpStatus, executeLgCommand } from './lookingGlassService.js';
import { getPublicNetworkData, loadUnifiedConfig } from './configLoader.js';
import crypto from 'node:crypto';

/**
 * Handles POST /api/submit-peering requests
 * @param {Object} body - Parsed JSON body
 * @param {string} clientIp - Client IP address
 * @returns {Promise<{status: number, data: Object}>}
 */
export async function handlePeeringSubmission(body, clientIp, authHeader) {
  if (!body || typeof body !== 'object') {
    return {
      status: 400,
      data: { success: false, error: '无效的请求载荷 (Invalid payload)' },
    };
  }

  const { peerAsn, peerWgPubKey, peerIpv6LLA } = body;

  // Basic validation
  if (!peerAsn || !String(peerAsn).trim()) {
    return {
      status: 400,
      data: { success: false, error: '请填写你的 ASN' },
    };
  }

  const cleanAsn = String(peerAsn).replace(/\D/g, '');

  // 🔒 Authentication Check:
  // If logged in, verify identity matches the submitted ASN (admins can submit for any ASN)
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
  const authUser = verifyJwt(token);

  if (authUser && !authUser.isAdmin) {
    if (authUser.cleanAsn !== cleanAsn && authUser.asn !== `AS${cleanAsn}`) {
      return {
        status: 403,
        data: {
          success: false,
          error: `登录身份 (AS${authUser.cleanAsn}) 与当前申请的 ASN (AS${cleanAsn}) 不一致！`,
        },
      };
    }
  }

  if (!peerWgPubKey || !String(peerWgPubKey).trim()) {
    return {
      status: 400,
      data: { success: false, error: '请填写你的 WireGuard 公钥' },
    };
  }

  if (!peerIpv6LLA || !String(peerIpv6LLA).trim()) {
    return {
      status: 400,
      data: { success: false, error: '请填写你的 IPv6 Link-Local (LLA) 地址' },
    };
  }

  // Rate Limiting Check
  const rateLimitResult = checkRateLimit(clientIp, peerAsn);
  if (!rateLimitResult.allowed) {
    return {
      status: 429,
      data: {
        success: false,
        error: rateLimitResult.message,
        retryAfter: rateLimitResult.retryAfter,
      },
    };
  }

  // 1. Save or Update Peering Session with Atomic Port Ledger & Diff Tracking
  const { session, isNew, diffs, previousVersion } = savePeeringSession({ ...body, authUser }, clientIp);

  // 2. Forward to Telegram Bot with Session & Diff context
  const payload = {
    ...body,
    clientIp,
  };

  const botResult = await sendPeeringNotification(payload, {
    session,
    isNew,
    diffs,
    previousVersion,
    authUser,
  });

  if (!botResult.success) {
    return {
      status: 500,
      data: {
        success: false,
        error: botResult.error || '推送失败，请稍后重试',
      },
    };
  }

  // Record successful submission for rate limiting
  recordSubmission(clientIp, peerAsn);

  return {
    status: 200,
    data: {
      success: true,
      message: isNew
        ? '🎉 对等互联申请已成功投递'
        : `🔄 对等互联申请已更新至版本 v${session.version}，变更已实时同步`,
      sessionId: session.id,
      version: session.version,
      isNew,
      allocatedPort: session.hostPort,
      messageId: botResult.messageId,
    },
  };
}

/**
 * Handles GET /api/node-ports?nodeId=jp07
 */
export function handleGetOccupiedPorts(nodeId) {
  const ports = getOccupiedPortsForNode(nodeId || 'jp07');
  return {
    status: 200,
    data: { success: true, nodeId, occupiedPorts: ports },
  };
}

/**
 * Handles GET /api/session?id=PEER-JP07-1234-A8F2
 */
export function handleGetSession(sessionId, authHeader) {
  if (!sessionId) {
    return { status: 400, data: { success: false, error: '缺少 sessionId' } };
  }
  const session = getSessionById(sessionId);
  if (!session) {
    return { status: 404, data: { success: false, error: '未找到该互联会话' } };
  }
  // Auth check: verify requester owns this session or is admin
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
  const user = verifyJwt(token);
  const isAdmin = user?.isAdmin || user?.cleanAsn === '4343439696' || user?.username === 'akira';
  if (!isAdmin && (!user || user.cleanAsn !== session.asn)) {
    // Return limited info for unauthenticated users
    return { status: 200, data: { success: true, session: { id: session.id, nodeId: session.nodeId, status: session.status } } };
  }
  return { status: 200, data: { success: true, session } };
}

/**
 * Handles GET /api/sessions-by-asn?asn=4242421234
 */
export function handleGetSessionsByAsn(asn, authHeader) {
  if (!asn) {
    return { status: 400, data: { success: false, error: '缺少 ASN' } };
  }
  // Auth check: require valid JWT to query sessions
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
  const user = verifyJwt(token);
  if (!user) {
    return { status: 401, data: { success: false, error: '查询互联会话需要先完成身份认证' } };
  }
  const cleanAsn = String(asn || '').replace(/\D/g, '');
  const isAdmin = user.isAdmin || user.cleanAsn === '4343439696' || user.username === 'akira';
  // Non-admin users can only query their own sessions
  if (!isAdmin && user.cleanAsn !== cleanAsn) {
    return { status: 403, data: { success: false, error: '无权查询其他 ASN 的互联会话' } };
  }
  const sessions = getSessionsByAsn(asn);
  return { status: 200, data: { success: true, sessions } };
}

/**
 * Handles GET /api/dn42-lookup?asn=4242421337
 */
export async function handleDn42Lookup(asn) {
  const identity = await getAsnIdentity(asn);
  return {
    status: 200,
    data: { success: true, identity },
  };
}

/**
 * Handles POST /api/auth/challenge
 */
export async function handleAuthChallenge(body) {
  const { asn } = body || {};
  const result = await createAuthChallenge(asn);
  return {
    status: result.success ? 200 : 400,
    data: result,
  };
}

/**
 * Handles POST /api/auth/verify-ssh
 */
export async function handleVerifySsh(body) {
  const { asn, signature, rememberMe } = body || {};
  const result = await verifySshSignature(asn, signature, Boolean(rememberMe));
  return {
    status: result.success ? 200 : 400,
    data: result,
  };
}

/**
 * Handles POST /api/auth/request-otp
 */
export async function handleRequestOtp(body) {
  const { asn } = body || {};
  const result = await requestEmailOtp(asn);
  return {
    status: result.success ? 200 : 400,
    data: result,
  };
}

/**
 * Handles POST /api/auth/verify-otp
 */
export async function handleVerifyOtp(body) {
  const { asn, otp } = body || {};
  const result = await verifyEmailOtp(asn, otp);
  return {
    status: result.success ? 200 : 400,
    data: result,
  };
}

/**
 * Handles GET /api/auth/me
 */
export function handleAuthMe(authHeader) {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
  const user = verifyJwt(token);
  if (!user) {
    return { status: 401, data: { success: false, error: '未授权或 Token 已过期' } };
  }
  return { status: 200, data: { success: true, user } };
}

/**
 * Handles GET /api/peer-status?asn=...&node=...&name=...
 */
export async function handlePeerStatus(asn, node, name) {
  if (!asn) {
    return { status: 400, data: { success: false, error: '缺少 ASN' } };
  }
  const result = await queryPeerBgpStatus(asn, node || 'jp07', name || '');
  return {
    status: 200,
    data: result,
  };
}

/**
 * Handles POST /api/looking-glass/query
 */
export async function handleLookingGlassQuery(body) {
  const { nodeId, commandType, target, options } = body || {};
  if (!commandType) {
    return { status: 400, data: { success: false, error: '缺少诊断命令类型 (commandType)' } };
  }

  const result = await executeLgCommand({
    nodeId: nodeId || 'jp07',
    commandType,
    target: target || '',
    options: options || {},
  });

  return {
    status: 200,
    data: result,
  };
}

/**
 * Handles POST /api/auth/status
 */
export async function handleAuthStatus(body) {
  const { asn } = body || {};
  const result = await getAsnAuthStatus(asn);
  return {
    status: result.success ? 200 : 400,
    data: result,
  };
}

/**
 * Handles POST /api/auth/login-password
 */
export async function handleLoginPassword(body) {
  try {
    const { asn, password, rememberMe } = body || {};
    const result = await verifyPasswordLogin(asn, password, Boolean(rememberMe));
    return {
      status: result.success ? 200 : 400,
      data: result,
    };
  } catch (err) {
    console.error('[API] handleLoginPassword error:', err);
    return {
      status: 500,
      data: { success: false, error: '登录处理异常，请检查配置或稍后重试' },
    };
  }
}

/**
 * Handles POST /api/auth/set-password
 */
export async function handleSetPassword(body, authHeader) {
  const { asn, password } = body || {};
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
  const user = verifyJwt(token);

  const cleanAsn = String(asn || '').replace(/\D/g, '');

  // Must either have a valid JWT for this ASN, or provide token in body
  if (!user || (user.cleanAsn !== cleanAsn && user.asn !== `AS${cleanAsn}`)) {
    return {
      status: 401,
      data: { success: false, error: '设置密码需要先完成身份验证授权' },
    };
  }

  const result = await setPasswordForAsn(cleanAsn, password);
  return {
    status: result.success ? 200 : 400,
    data: result,
  };
}

/**
 * Handles POST /api/delete-session
 */
export async function handleDeleteSession(body, authHeader) {
  const { sessionId, nodeId } = body || {};
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
  const user = verifyJwt(token);

  // 🔒 Strict Auth: Must be authenticated to delete sessions
  if (!user) {
    return {
      status: 401,
      data: { success: false, error: '撤销互联会话必须先完成身份认证登录' },
    };
  }
  const targetAsn = user.cleanAsn;

  const result = deleteSession(sessionId, targetAsn, nodeId);

  if (!result.success) {
    return {
      status: 400,
      data: { success: false, error: result.error || '撤销会话失败' },
    };
  }

  // Send asynchronous Telegram alert to admin about session deletion & port release
  if (result.session && result.session.hostPort) {
    sendDeleteNotification(result.session).catch(err => console.warn('TG Delete Alert error:', err));
  }

  return {
    status: 200,
    data: {
      success: true,
      message: `会话 ${sessionId} 已成功撤销，服务器端口 ${result.session.hostPort} 已释放。`,
      sessionId,
    },
  };
}

/**
 * Handles GET /api/network-meta (Dynamic Unified Config)
 */
export function handleGetNetworkMeta() {
  const data = getPublicNetworkData();
  return {
    status: 200,
    data: {
      success: true,
      ...data,
    },
  };
}

/**
 * Handles POST /api/probe/report-ports
 * Allows remote PoP probes to report their local WireGuard & socket port usages to the Core hub
 */
export function handleReportProbePorts(body, authHeader) {
  if (!body || !body.nodeId || !Array.isArray(body.ports)) {
    return { status: 400, data: { success: false, error: '缺少 nodeId 或 ports 列表' } };
  }

  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
  const configuredToken = process.env.PROBE_AUTH_TOKEN;

  // Require explicit PROBE_AUTH_TOKEN configuration
  if (!configuredToken) {
    return { status: 503, data: { success: false, error: '探针上报未配置 (PROBE_AUTH_TOKEN not set)' } };
  }

  // Verify auth token with timing-safe comparison, or accept valid admin JWT
  let isTokenValid = false;
  if (token && configuredToken && token.length === configuredToken.length) {
    try {
      isTokenValid = crypto.timingSafeEqual(Buffer.from(token), Buffer.from(configuredToken));
    } catch { isTokenValid = false; }
  }
  if (!isTokenValid) {
    // Fallback: check if it's a valid admin JWT
    isTokenValid = !!verifyJwt(token)?.isAdmin;
  }

  if (!isTokenValid) {
    return { status: 401, data: { success: false, error: '探针上报凭据无效 (Unauthorized probe token)' } };
  }

  const result = mergeProbeReportedPorts(body.nodeId, body.ports);
  return { status: 200, data: { success: true, ...result } };
}

/**
 * Handles GET /api/probe/status
 * Returns live online status and latency for all nodes
 */
export function handleGetProbeStatus() {
  try {
    const { getConnectedNodesStatus } = awaitImportProbeWs();
    const probeMap = getConnectedNodesStatus();
    return {
      status: 200,
      data: {
        success: true,
        probes: probeMap,
      },
    };
  } catch (err) {
    return {
      status: 200,
      data: {
        success: true,
        probes: {},
      },
    };
  }
}

// Lazy helper to avoid circular reference
let _probeWs = null;
async function awaitImportProbeWs() {
  if (!_probeWs) {
    _probeWs = await import('./probeWsServer.js');
  }
  return _probeWs;
}

/**
 * Handles GET /api/probe/install-command
 * Dynamically computes one-click curl install command using request's Host / X-Forwarded-Host
 */
export function handleGetProbeInstallCommand(reqUrl, reqHeaders) {
  const nodeId = (reqUrl.searchParams.get('nodeId') || 'jp07').toLowerCase().trim();
  const host = reqHeaders['x-forwarded-host'] || reqHeaders['host'] || 'localhost:4242';
  const proto = reqHeaders['x-forwarded-proto'] || (reqHeaders['referer'] && reqHeaders['referer'].startsWith('https') ? 'https' : 'http');
  const masterUrl = `${proto}://${host}`;
  const token = process.env.PROBE_AUTH_TOKEN || process.env.BIRD_LG_TOKEN || '';

  const command = `curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/install-probe.sh | sudo bash -s -- --master "${masterUrl}" --token "${token}" --node-id "${nodeId}"`;

  return {
    status: 200,
    data: {
      success: true,
      nodeId,
      masterUrl,
      command,
    },
  };
}

