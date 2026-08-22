import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';
import { mergeProbeReportedPorts } from './sessionManager.js';
import './env.js';

/**
 * @typedef {Object} ProbeConnection
 * @property {string} nodeId
 * @property {import('ws').WebSocket} ws
 * @property {string} ip
 * @property {number} connectedAt
 * @property {number} lastHeartbeat
 * @property {number} latencyMs
 * @property {string} [version]
 * @property {Object} [systemInfo]
 */

/** @type {Map<string, ProbeConnection>} */
const activeProbeConnections = new Map();

/** @type {Map<string, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>} */
const pendingLgRequests = new Map();

let wss = null;
let heartbeatInterval = null;

/**
 * Initializes the WebSocket server attached to the HTTP server
 * @param {import('node:http').Server} httpServer
 */
export function initProbeWsServer(httpServer) {
  if (wss) return wss;

  wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/ws/probe' || url.pathname === '/api/probe/ws') {
        const token = url.searchParams.get('token') || (request.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
        const nodeId = (url.searchParams.get('nodeId') || request.headers['x-node-id'] || '').toLowerCase().trim();

        const configuredToken = process.env.PROBE_AUTH_TOKEN || process.env.BIRD_LG_TOKEN;

        // Verify token
        let isAuthorized = false;
        if (configuredToken && token) {
          try {
            if (token.length === configuredToken.length) {
              isAuthorized = crypto.timingSafeEqual(Buffer.from(token), Buffer.from(configuredToken));
            }
          } catch {
            isAuthorized = false;
          }
        }

        if (!isAuthorized || !nodeId) {
          socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\n\r\nUnauthorized probe token or missing nodeId\r\n');
          socket.destroy();
          return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request, { nodeId, token });
        });
      }
    } catch (err) {
      socket.destroy();
    }
  });

  wss.on('connection', (ws, request, { nodeId }) => {
    const clientIp = request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'unknown';
    const cleanIp = Array.isArray(clientIp) ? clientIp[0] : String(clientIp).split(',')[0].trim();

    // Close any previous connection for this node
    const existing = activeProbeConnections.get(nodeId);
    if (existing && existing.ws.readyState === ws.OPEN) {
      try {
        existing.ws.close(1000, 'New connection replaced previous session');
      } catch {}
    }

    const conn = {
      nodeId,
      ws,
      ip: cleanIp,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
      latencyMs: 1,
    };

    activeProbeConnections.set(nodeId, conn);
    console.log(`\x1b[32m[Probe WS] ✓ 远端探针节点 [${nodeId.toUpperCase()}] 已建立反向长连接 (来源 IP: ${cleanIp})\x1b[0m`);

    // Send welcome
    ws.send(JSON.stringify({
      type: 'welcome',
      message: 'Connected to Master Core',
      nodeId,
      serverTime: Date.now(),
    }));

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        conn.lastHeartbeat = Date.now();

        switch (msg.type) {
          case 'pong':
            if (msg.timestamp) {
              conn.latencyMs = Math.max(1, Date.now() - msg.timestamp);
            }
            break;

          case 'port_report':
            if (Array.isArray(msg.ports)) {
              mergeProbeReportedPorts(nodeId, msg.ports);
              ws.send(JSON.stringify({
                type: 'port_ack',
                count: msg.ports.length,
                timestamp: Date.now(),
              }));
            }
            break;

          case 'lg_response':
            if (msg.id && pendingLgRequests.has(msg.id)) {
              const pending = pendingLgRequests.get(msg.id);
              clearTimeout(pending.timer);
              pendingLgRequests.delete(msg.id);
              pending.resolve({
                success: Boolean(msg.success),
                output: msg.output || '',
                error: msg.error,
                durationMs: msg.durationMs || 0,
              });
            }
            break;

          case 'agent_info':
            conn.version = msg.version;
            conn.systemInfo = msg.systemInfo;
            break;
        }
      } catch (err) {
        console.warn(`[Probe WS] Parse message error from [${nodeId}]:`, err);
      }
    });

    ws.on('close', (code) => {
      if (activeProbeConnections.get(nodeId)?.ws === ws) {
        activeProbeConnections.delete(nodeId);
        console.log(`\x1b[33m[Probe WS] ⚠️ 远端探针节点 [${nodeId.toUpperCase()}] 已断开连接 (Code: ${code})\x1b[0m`);
      }
    });

    ws.on('error', (err) => {
      console.warn(`[Probe WS] Socket error from [${nodeId}]:`, err.message);
    });
  });

  // Start periodic heartbeat ping (every 15s)
  if (!heartbeatInterval) {
    heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const [nodeId, conn] of activeProbeConnections.entries()) {
        if (conn.ws.readyState === conn.ws.OPEN) {
          if (now - conn.lastHeartbeat > 45000) {
            console.warn(`[Probe WS] 节点 [${nodeId}] 心跳超时，关闭连接`);
            conn.ws.terminate();
            activeProbeConnections.delete(nodeId);
            continue;
          }

          try {
            conn.ws.send(JSON.stringify({ type: 'ping', timestamp: now }));
          } catch {
            activeProbeConnections.delete(nodeId);
          }
        } else {
          activeProbeConnections.delete(nodeId);
        }
      }
    }, 15000);
  }

  return wss;
}

/**
 * Dispatches a Looking Glass command over the reverse WebSocket tunnel
 * @param {string} nodeId
 * @param {string} commandType
 * @param {string} target
 * @param {Object} [options]
 * @param {number} [timeoutMs=15000]
 * @returns {Promise<{success: boolean, output: string, durationMs: number, error?: string}>}
 */
export function dispatchLgCommandOverWs(nodeId, commandType, target, options = {}, timeoutMs = 15000) {
  const cleanId = String(nodeId).toLowerCase().trim();
  const conn = activeProbeConnections.get(cleanId);

  if (!conn || conn.ws.readyState !== conn.ws.OPEN) {
    return Promise.resolve({
      success: false,
      output: `❌ 节点 [${nodeId.toUpperCase()}] 探针当前处于离线状态 (Offline)。\n请确保目标服务器已安装并运行探针守护进程。`,
      durationMs: 0,
      error: 'Node probe is offline',
    });
  }

  const reqId = crypto.randomUUID();
  const startTime = Date.now();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingLgRequests.delete(reqId);
      resolve({
        success: false,
        output: `❌ 节点 [${nodeId.toUpperCase()}] 响应超时 (${timeoutMs / 1000}s)，请检查该节点的 BIRD 进程运行状态。`,
        durationMs: Date.now() - startTime,
        error: 'Execution timeout',
      });
    }, timeoutMs);

    pendingLgRequests.set(reqId, { resolve, reject: resolve, timer });

    try {
      conn.ws.send(JSON.stringify({
        type: 'lg_exec',
        id: reqId,
        commandType,
        target,
        options,
      }));
    } catch (err) {
      clearTimeout(timer);
      pendingLgRequests.delete(reqId);
      resolve({
        success: false,
        output: `❌ 下发指令失败: ${err.message}`,
        durationMs: Date.now() - startTime,
        error: err.message,
      });
    }
  });
}

/**
 * Returns a map of all connected node statuses
 * @returns {Record<string, { online: boolean, latencyMs: number, lastSeen: number, ip: string, version?: string }>}
 */
export function getConnectedNodesStatus() {
  const statusMap = {};
  for (const [nodeId, conn] of activeProbeConnections.entries()) {
    statusMap[nodeId] = {
      online: conn.ws.readyState === conn.ws.OPEN,
      latencyMs: conn.latencyMs || 1,
      lastSeen: conn.lastHeartbeat,
      ip: conn.ip,
      version: conn.version,
    };
  }
  return statusMap;
}

/**
 * Checks if a specific node probe is currently connected
 * @param {string} nodeId
 * @returns {boolean}
 */
export function isNodeConnected(nodeId) {
  const conn = activeProbeConnections.get(String(nodeId).toLowerCase().trim());
  return Boolean(conn && conn.ws.readyState === conn.ws.OPEN);
}
