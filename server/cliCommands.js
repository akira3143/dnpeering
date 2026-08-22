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

  let coreUrl = envCoreUrl;
  if (!coreUrl) {
    const hubNode = nodes.find((n) => n.features && n.features.some((f) => f.includes('Hub') || f.includes('Core'))) || nodes[0];
    if (hubNode && hubNode.endpoint) {
      coreUrl = 'http://' + hubNode.endpoint + ':4242';
    } else if (hubNode && hubNode.ipv4) {
      coreUrl = 'http://' + hubNode.ipv4 + ':4242';
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

  const targetArg = String(targetNodeArg).toLowerCase().trim();

  if (targetArg && targetArg !== 'gen' && targetArg !== 'list' && targetArg !== 'all' && targetArg !== 'nodes') {
    const matched = nodes.find((n) => n.id.toLowerCase() === targetArg || (n.code && n.code.toLowerCase() === targetArg));
    if (matched) {
      const isLocal = matched.id === 'jp07' || matched.id.includes('local') || matched.id.includes('hub');
      const probe = liveProbes[matched.id.toLowerCase()];
      const isOnline = isLocal || Boolean(probe && probe.online);
      const latency = probe?.latencyMs;

      console.log('\n\x1b[36m==================================================================\x1b[0m');
      console.log('  🌐 节点专属探针配置与一键安装指令 (' + (matched.flag || '🌐') + ' \x1b[32m' + matched.code + ' - ' + matched.name + '\x1b[0m)');
      console.log('\x1b[36m==================================================================\x1b[0m');
      console.log('  节点代号 ID   : \x1b[33m' + matched.id + '\x1b[0m (Code: ' + matched.code + ')');
      console.log('  当前探针状态 : ' + (isOnline ? ('\x1b[32m🟢 在线' + (isLocal ? ' (本地主节点)' : ' (' + (latency || 1) + 'ms)') + '\x1b[0m') : '\x1b[90m⚪ 离线 (未部署/未连接)\x1b[0m'));
      console.log('  主控 Master  : \x1b[32m' + coreUrl + '\x1b[0m');
      console.log('\n\x1b[33m👉 请直接复制以下单行命令，粘贴到目标 VPS 终端回车执行即可（0 交互）：\x1b[0m\n');
      const cmd = 'curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/install-probe.sh | sudo bash -s -- --master "' + coreUrl + '" --token "' + token + '" --node-id "' + matched.id + '"';
      console.log('\x1b[1m\x1b[32m' + cmd + '\x1b[0m\n');
      return;
    } else {
      console.log('\n\x1b[31m❌ 未找到代号为 [' + targetArg + '] 的节点。\x1b[0m');
      console.log('当前可用的节点代号 ID 如下: ' + nodes.map((n) => '\x1b[33m' + n.id + '\x1b[0m (' + n.code + ')').join(', '));
      console.log('');
    }
  }

  console.log('\n\x1b[36m==================================================================\x1b[0m');
  console.log('  🦅 AkiLab DN42 - 全网 PoP 节点与探针部署管理 (Node Probe Manager)');
  console.log('\x1b[36m==================================================================\x1b[0m');
  console.log('  主控端 Master 地址 : \x1b[32m' + coreUrl + '\x1b[0m');
  console.log('  全局通信鉴权 Token : \x1b[33m' + token + '\x1b[0m');
  console.log('\n\x1b[36m📡 全网 PoP 节点在线状态与代号清单 (Node List)：\x1b[0m');
  console.log('\x1b[90m──────────────────────────────────────────────────────────────────\x1b[0m');
  console.log('  序号 | 节点代号 (ID / Code) | 节点名称与地区              | 探针在线状态');
  console.log('\x1b[90m──────────────────────────────────────────────────────────────────\x1b[0m');

  nodes.forEach((n, idx) => {
    const isLocal = idx === 0 || n.id === 'jp07';
    const probe = liveProbes[n.id.toLowerCase()];
    const isOnline = isLocal || Boolean(probe && probe.online);
    const latency = probe?.latencyMs;

    const idPad = (n.id + '  /  ' + n.code).padEnd(20);
    const namePad = ((n.flag || '🌐') + ' ' + n.name).padEnd(26);
    const statusText = isOnline
      ? (isLocal ? '\x1b[32m🟢 在线 (本地主节点)\x1b[0m' : ('\x1b[32m🟢 在线 (' + (latency || 1) + 'ms)\x1b[0m'))
      : '\x1b[90m⚪ 离线 (未部署/未连接)\x1b[0m';

    console.log('  [' + (idx + 1) + ']   ' + idPad + ' | ' + namePad + ' | ' + statusText);
  });
  console.log('\x1b[90m──────────────────────────────────────────────────────────────────\x1b[0m\n');

  console.log('\x1b[36m👉 远端节点专属一键无人值守安装指令（复制并在目标机器回车执行）：\x1b[0m\n');

  nodes.forEach((n, idx) => {
    if (idx === 0 || n.id === 'jp07') return;
    const cmd = 'curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/install-probe.sh | sudo bash -s -- --master "' + coreUrl + '" --token "' + token + '" --node-id "' + n.id + '"';
    console.log('  \x1b[1m\x1b[33m[' + n.id + ']\x1b[0m ' + (n.flag || '🌐') + ' ' + n.code + ' - ' + n.name + ':');
    console.log('  \x1b[32m' + cmd + '\x1b[0m\n');
  });

  console.log('\x1b[90m💡 提示: 执行 dnp probe <节点ID或Code> (如 dnp probe us01 或 dnp probe US-1) 可单独获取该节点专属指令。\x1b[0m\n');
}

export async function handleCliPorts() {
  const config = (await loadUnifiedConfig()) || getActiveConfig();
  const nodes = config.nodes || [];

  console.log('\n\x1b[36m==================================================================\x1b[0m');
  console.log('  📊 AkiLab DN42 - 全网 PoP 节点端口占用与已锁定账本清单');
  console.log('\x1b[36m==================================================================\x1b[0m');

  nodes.forEach((n) => {
    const ports = getOccupiedPortsForNode(n.id);
    console.log('\n\x1b[33m[' + (n.flag || '🌐') + ' ' + n.code + ' - ' + n.name + ' (' + n.id + ')]\x1b[0m 已占用端口数: \x1b[32m' + ports.length + '\x1b[0m');
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

  mergeProbeReportedPorts('jp07', localPorts);
  console.log('\x1b[32m✓ 本地主节点 (jp07) 端口扫描完成，已合并入端口账本！\x1b[0m');
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