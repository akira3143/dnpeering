import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { loadUnifiedConfig, getActiveConfig } from './configLoader.js';
import { getOccupiedPortsForNode, mergeProbeReportedPorts, cleanupExpiredUnconnectedSessions } from './sessionManager.js';
import './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function getEnvConfig() {
  const envFile = path.join(ROOT_DIR, '.env');
  let envContent = '';
  try {
    envContent = fs.readFileSync(envFile, 'utf-8');
  } catch {}

  const lines = envContent.split(/\r?\n/);
  let token = '';
  let coreUrl = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx !== -1) {
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if (!val.startsWith('"') && !val.startsWith("'")) {
        val = val.replace(/\s+#.*$/, '').trim();
      } else {
        val = val.replace(/^[\"']|[\"']$/g, '').trim();
      }
      if ((key === 'PROBE_AUTH_TOKEN' || key === 'BIRD_LG_TOKEN') && val && !val.startsWith('#')) {
        token = val;
      }
      if ((key === 'PORTAL_CORE_URL' || key === 'MASTER_URL') && val && !val.startsWith('#')) {
        coreUrl = val;
      }
    }
  }

  if (!token) {
    token = crypto.randomBytes(16).toString('hex');
    fs.appendFileSync(envFile, '\nPROBE_AUTH_TOKEN="' + token + '"\n');
    console.log('\x1b[33m⚡ 已自动为您生成并保存全局通信鉴权密钥 PROBE_AUTH_TOKEN 到 .env\x1b[0m');
  }

  return { token, coreUrl };
}

export async function handleCliProbe(targetNodeArg = '') {
  const { token, coreUrl: envCoreUrl } = getEnvConfig();
  const config = (await loadUnifiedConfig()) || getActiveConfig();
  const nodes = config.nodes || [];

  let coreUrl = envCoreUrl || config?.network?.masterUrl || '';
  if (!coreUrl || coreUrl.includes('127.0.0.1') || coreUrl.includes('localhost')) {
    const hubNode = nodes.find((n) => n.features && n.features.some((f) => f.includes('Hub') || f.includes('Core'))) || nodes[0];
    const rawDomain = hubNode?.endpointDomain || hubNode?.endpoint;
    if (rawDomain && !rawDomain.includes('example') && !rawDomain.includes('127.0.0.1')) {
      const hasProto = rawDomain.startsWith('http://') || rawDomain.startsWith('https://');
      const hasPort = rawDomain.includes(':') && !rawDomain.startsWith('http');
      coreUrl = (hasProto ? '' : 'http://') + rawDomain + (hasPort || hasProto ? '' : ':4242');
    } else {
      coreUrl = 'http://127.0.0.1:4242';
    }
  }

  let liveProbes = {};
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const probeRes = await fetch('http://127.0.0.1:4242/api/probe/status', { signal: controller.signal });
    clearTimeout(timer);
    if (probeRes.ok) {
      const probeData = await probeRes.json();
      liveProbes = probeData.probes || {};
    }
  } catch {}

  const printNodeCommand = (matched) => {
    const isLocal = matched.id === 'jp07' || (matched.features && matched.features.some((f) => f.includes('Hub') || f.includes('Core')));
    const probe = liveProbes[matched.id.toLowerCase()];
    const isOnline = isLocal || Boolean(probe && probe.online);
    const latency = probe?.latencyMs;
    const proxyPort = matched.lgProxyUrl ? (matched.lgProxyUrl.match(/:(\d+)/)?.[1] || 5000) : 5000;
    const proxyToken = process.env.LG_PROXY_TOKEN || '';

    console.log('\n\x1b[36m==================================================================\x1b[0m');
    console.log('  🦅 节点官方 bird-lgproxy 探针一键安装指令 (' + (matched.flag || '🌐') + ' \x1b[32m' + matched.id + ' · ' + matched.name + '\x1b[0m)');
    console.log('\x1b[36m==================================================================\x1b[0m');
    console.log('  节点唯一 ID   : \x1b[33m' + matched.id + '\x1b[0m');
    console.log('  探针运行状态 : ' + (isOnline ? ('\x1b[32m🟢 在线' + (isLocal ? ' (本地主节点)' : ' (' + (latency || 1) + 'ms)') + '\x1b[0m') : '\x1b[90m⚪ 离线 (未部署或未放行 ' + proxyPort + ' 端口)\x1b[0m'));
    console.log('  公网探测地址 : \x1b[32m' + (matched.lgProxyUrl || ('http://' + (matched.endpoint || matched.id) + ':' + proxyPort)) + '\x1b[0m');
    if (proxyToken) {
      console.log('  安全认证 Token: \x1b[33m' + proxyToken + '\x1b[0m');
    }
    console.log('\n\x1b[33m👉 请直接在目标 VPS 终端执行以下单行命令，一键安装官方原生 bird-lgproxy：\x1b[0m\n');
    const cmd = proxyToken
      ? `curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/deploy-lgproxy.sh | sudo bash -s -- 0.0.0.0:${proxyPort} "${proxyToken}"`
      : `curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/deploy-lgproxy.sh | sudo bash -s -- 0.0.0.0:${proxyPort}`;
    console.log('\x1b[1m\x1b[32m' + cmd + '\x1b[0m\n');
    console.log('\x1b[90m💡 提示：安装后若防火墙开启，请放行 TCP ' + proxyPort + ' 端口：ufw allow ' + proxyPort + '/tcp\x1b[0m\n');
  };

  const targetArg = String(targetNodeArg).toLowerCase().trim();

  // If user passed a specific node argument directly (e.g. dnp probe 4 or dnp probe us01)
  if (targetArg && targetArg !== 'gen' && targetArg !== 'list' && targetArg !== 'all' && targetArg !== 'nodes') {
    let matched = null;
    const num = parseInt(targetArg, 10);
    if (!isNaN(num) && num >= 1 && num <= nodes.length) {
      matched = nodes[num - 1];
    } else {
      matched = nodes.find((n) => n.id.toLowerCase() === targetArg || (n.code && n.code.toLowerCase() === targetArg));
    }

    if (matched) {
      printNodeCommand(matched);
      return;
    } else {
      console.log('\n\x1b[31m❌ 未找到代号为 [' + targetArg + '] 的节点。\x1b[0m');
      console.log('当前可用的节点唯一 ID 如下: ' + nodes.map((n) => '\x1b[33m' + n.id + '\x1b[0m (' + n.name + ')').join(', '));
      console.log('');
    }
  }

  // Print Node list table overview
  console.log('\n\x1b[36m==================================================================\x1b[0m');
  console.log('  🦅 AkiLab DN42 - 全网 PoP 节点与探针部署管理 (Node Probe Manager)');
  console.log('\x1b[36m==================================================================\x1b[0m');
  console.log('  主控端 Master 地址 : \x1b[32m' + coreUrl + '\x1b[0m');
  console.log('  通信鉴权 Token 模式: \x1b[33mHMAC-SHA256 动态派生\x1b[0m (每个节点拥有独立唯一密钥)');
  console.log('\n\x1b[36m📡 全网 PoP 节点在线状态与代号清单 (Node List)：\x1b[0m');
  console.log('\x1b[90m──────────────────────────────────────────────────────────────────\x1b[0m');
  console.log('  序号 | 节点唯一 ID (ID)   | 节点名称与地区              | 探针在线状态');
  console.log('\x1b[90m──────────────────────────────────────────────────────────────────\x1b[0m');

  nodes.forEach((n, idx) => {
    const isLocal = idx === 0 || n.id === 'jp07';
    const probe = liveProbes[n.id.toLowerCase()];
    const isOnline = isLocal || Boolean(probe && probe.online);
    const latency = probe?.latencyMs;

    const idPad = String(n.id).padEnd(18);
    const namePad = ((n.flag || '🌐') + ' ' + n.name).padEnd(26);
    const statusText = isOnline
      ? (isLocal ? '\x1b[32m🟢 在线 (本地主节点)\x1b[0m' : (`\x1b[32m🟢 在线 (${latency || 1}ms)\x1b[0m`))
      : '\x1b[90m⚪ 离线 (未部署/未连接)\x1b[0m';

    console.log('  [' + (idx + 1) + ']   ' + idPad + ' | ' + namePad + ' | ' + statusText);
  });
  console.log('\x1b[90m──────────────────────────────────────────────────────────────────\x1b[0m\n');

  // Interactive selection if running in terminal
  if (process.stdin.isTTY) {
    const readline = await import('node:readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    return new Promise((resolve) => {
      rl.question('\x1b[36m👉 请输入节点序号 [1-' + nodes.length + '] 或代号 ID (如 4 或 us01，输入 q 退出): \x1b[0m', (ans) => {
        rl.close();
        const input = (ans || '').trim().toLowerCase();
        if (!input || input === 'q' || input === 'exit') {
          console.log('\n\x1b[90m已退出。\x1b[0m\n');
          return resolve();
        }
        let chosen = null;
        const num = parseInt(input, 10);
        if (!isNaN(num) && num >= 1 && num <= nodes.length) {
          chosen = nodes[num - 1];
        } else {
          chosen = nodes.find((n) => n.id.toLowerCase() === input || (n.code && n.code.toLowerCase() === input));
        }

        if (chosen) {
          printNodeCommand(chosen);
        } else {
          console.log('\n\x1b[31m❌ 输入无效，未找到匹配的节点。\x1b[0m\n');
        }
        resolve();
      });
    });
  } else {
    console.log('\x1b[90m💡 提示: 执行 dnp probe <节点序号/ID/Code> (如 dnp probe 4 或 dnp probe us01) 可直接生成专属安装指令。\x1b[0m\n');
  }
}

export async function handleCliPorts() {
  const config = (await loadUnifiedConfig()) || getActiveConfig();
  const nodes = config.nodes || [];

  console.log('\n\x1b[36m==================================================================\x1b[0m');
  console.log('  📊 AkiLab DN42 - 全网 PoP 节点端口占用与已锁定账本清单');
  console.log('\x1b[36m==================================================================\x1b[0m');

  nodes.forEach((n) => {
    const ports = getOccupiedPortsForNode(n.id);
    console.log('\n\x1b[33m[' + (n.flag || '🌐') + ' ' + n.id + ' · ' + n.name + ']\x1b[0m 已占用端口数: \x1b[32m' + ports.length + '\x1b[0m');
    if (ports.length === 0) {
      console.log('  \x1b[90m(当前暂无占用端口)\x1b[0m');
    } else {
      ports.forEach((p) => {
        const src = p.source === 'remote_probe' ? '\x1b[35m[探针实测]\x1b[0m' : p.status === 'locked' ? '\x1b[33m[申请锁定]\x1b[0m' : '\x1b[36m[配置预设]\x1b[0m';
        console.log('  - 端口 \x1b[1m' + p.port + '\x1b[0m | ' + src + ' ' + (p.label || p.name || ''));
      });
    }
  });
  console.log('\n\x1b[90m💡 提示: 远端探针会自动回传端口变动，也可执行 dnp scan 触发全局深度扫描。\x1b[0m\n');
}

export function handleCliScan() {
  console.log('\x1b[36m🔍 正在触发本地 WireGuard 与网络端口深度自检...\x1b[0m');
  const localPorts = [];
  try {
    const wgOut = execSync('wg show all listen-port', { encoding: 'utf-8', timeout: 5000 });
    wgOut.trim().split('\n').forEach((line) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const iface = parts[0];
        const p = parseInt(parts[1], 10);
        if (p >= 10000 && p <= 65535) {
          localPorts.push({ port: p, name: iface, label: iface + ' : ' + p, type: 'in_use', status: 'existing', source: 'remote_probe' });
        }
      }
    });
  } catch {}

  try {
    const ssOut = execSync('ss -tulnp', { encoding: 'utf-8', timeout: 5000 });
    ssOut.trim().split('\n').forEach((line) => {
      const m = line.match(/:(\d+)\s+/);
      if (m) {
        const p = parseInt(m[1], 10);
        if (p >= 10000 && p <= 65535 && !localPorts.some((x) => x.port === p)) {
          localPorts.push({ port: p, name: 'service', label: 'service : ' + p, type: 'in_use', status: 'existing', source: 'remote_probe' });
        }
      }
    });
  } catch {}

  const config = getActiveConfig();
  const hubNode = config?.nodes?.find((n) => n.features && n.features.some((f) => f.includes('Hub') || f.includes('Core'))) || config?.nodes?.[0];
  const localNodeId = hubNode?.id || 'jp07';

  mergeProbeReportedPorts(localNodeId, localPorts);
  console.log('\x1b[32m✓ 本地主节点 (' + localNodeId + ') 端口扫描完成，已合并入端口账本！\x1b[0m');
}

export function handleCliClean() {
  console.log('\x1b[36m🧹 正在扫描超过 7 天未建立 WireGuard 会话的过期申请...\x1b[0m');
  const res = cleanupExpiredUnconnectedSessions();
  console.log('\x1b[32m✓ 清理完成！共回收释放了 ' + res.length + ' 个超时占用的端口。\x1b[0m');
}

const action = process.argv[2] || 'probe';
const arg = process.argv[3] || '';

if (action === 'probe' || action === 'nodes' || action === 'node' || action === 'n' || action === 'lg' || action === 'agent') {
  handleCliProbe(arg).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (action === 'ports' || action === 'port' || action === 'p' || action === 'list') {
  handleCliPorts().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (action === 'scan' || action === 'ports-sync') {
  handleCliScan();
} else if (action === 'clean') {
  handleCliClean();
}