#!/usr/bin/env bash
# ==============================================================================
# 🌐 AkiLab DN42 Portal - CLI 极速运维指令管理器 (dnp / portal)
#
# 命令缩写映射:
#   dnp c      -> 快速编辑统一配置 (config)
#   dnp n      -> 查看全网节点列表与探针在线状态 (nodes)
#   dnp probe  -> 生成远端探针无人值守安装指令 (Like 哪吒探针)
#   dnp l      -> 实时滚动日志 (logs)
#   dnp s      -> 服务运行状态 (status)
#   dnp r      -> 重启门户服务 (restart)
#   dnp u      -> 从 GitHub 热更新升级 (update)
#   dnp e      -> 编辑 .env 密钥 (env)
# ==============================================================================

PORTAL_DIR="/opt/dnpeering"
# Security: validate PORTAL_DIR exists and is a directory
if [ ! -d "$PORTAL_DIR" ]; then
  echo -e "\033[0;31m❌ 错误: 门户安装目录 ${PORTAL_DIR} 不存在，请先执行安装。\033[0m"
  exit 1
fi
SERVICE_NAME="dn42-portal"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
RED='\033[0;31m'
NC='\033[0m'

case "$1" in
  c|conf|config|edit)
    echo -e "${CYAN}📝 正在打开统一配置文件 (修改保存后全站 200ms 内即刻生效)...${NC}"
    ${EDITOR:-nano} "${PORTAL_DIR}/portal.config.yaml"
    ;;

  l|log|logs)
    echo -e "${CYAN}📜 正在追踪实时运行日志 (Ctrl+C 退出)...${NC}"
    journalctl -u "${SERVICE_NAME}" -f -n 50
    ;;

  s|status)
    systemctl status "${SERVICE_NAME}"
    ;;

  r|restart|reload)
    echo -e "${YELLOW}🔄 正在重启/重载 DN42 Portal 服务...${NC}"
    systemctl restart "${SERVICE_NAME}"
    echo -e "${GREEN}✓ 服务重载完成！${NC}"
    ;;

  u|update|upgrade)
    echo -e "${CYAN}🚀 正在从 GitHub 同步最新版本并热升级...${NC}"
    cd "${PORTAL_DIR}"
    git fetch origin main --quiet
    git reset --hard origin/main
    chmod +x "${PORTAL_DIR}"/scripts/*.sh 2>/dev/null || true
    npm install --loglevel=error
    npm run build
    systemctl restart "${SERVICE_NAME}"
    systemctl is-active bird-lgproxy &>/dev/null && systemctl restart bird-lgproxy 2>/dev/null || true
    systemctl is-active dn42-agent &>/dev/null && systemctl restart dn42-agent 2>/dev/null || true
    echo -e "${GREEN}✓ 门户与探针系统已升级至最新版本并重启！${NC}"
    ;;

  e|env)
    echo -e "${CYAN}🔐 正在编辑环境变量与 Telegram Bot 密钥...${NC}"
    ${EDITOR:-nano} "${PORTAL_DIR}/.env"
    echo -e "${YELLOW}💡 修改 .env 后需执行 dnp r 生效。${NC}"
    ;;

  p|port|ports|list)
    node -e "
      import('${PORTAL_DIR}/server/sessionManager.js').then(async m => {
        const { getOccupiedPortsForNode } = m;
        const configLoader = await import('${PORTAL_DIR}/server/configLoader.js');
        const config = await configLoader.loadUnifiedConfig() || configLoader.getActiveConfig();
        const nodes = config.nodes || [];
        
        console.log('\n\x1b[36m==================================================================\x1b[0m');
        console.log('  📊 AkiLab DN42 - 全网 PoP 节点端口占用与已锁定账本清单');
        console.log('\x1b[36m==================================================================\x1b[0m');
        
        nodes.forEach(n => {
          const ports = getOccupiedPortsForNode(n.id);
          console.log('\n\x1b[33m[' + (n.flag || '🌐') + ' ' + n.code + ' - ' + n.name + ' (' + n.id + ')]\x1b[0m 已占用端口数: \x1b[32m' + ports.length + '\x1b[0m');
          if (ports.length === 0) {
            console.log('  \x1b[90m(当前暂无占用端口)\x1b[0m');
          } else {
            ports.forEach(p => {
              const src = p.source === 'remote_probe' ? '\x1b[35m[探针实测]\x1b[0m' : (p.status === 'locked' ? '\x1b[33m[申请锁定]\x1b[0m' : '\x1b[36m[配置预设]\x1b[0m');
              console.log('  - 端口 \x1b[1m' + p.port + '\x1b[0m | ' + src + ' ' + (p.label || p.name || ''));
            });
          }
        });
        console.log('\n\x1b[90m💡 提示: 远端探针会自动回传端口变动，也可执行 dnp scan 触发全局深度扫描。\x1b[0m\n');
      }).catch(err => {
        console.error(err);
        process.exit(1);
      });
    "
    ;;

  scan|ports-sync)
    echo -e "${CYAN}🔍 正在触发全网 WireGuard 与网络端口深度自检...${NC}"
    node -e "
      const { execSync } = require('child_process');
      const fs = require('fs');
      const path = require('path');
      
      const sessionManager = require('${PORTAL_DIR}/server/sessionManager.js');
      const configLoader = require('${PORTAL_DIR}/server/configLoader.js');
      
      let localPorts = [];
      try {
        const wgOut = execSync('wg show all listen-port', { encoding: 'utf-8', timeout: 5000 });
        wgOut.trim().split('\n').forEach(line => {
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
        ssOut.trim().split('\n').forEach(line => {
          const m = line.match(/:(\d+)\s+/);
          if (m) {
            const p = parseInt(m[1], 10);
            if (p >= 10000 && p <= 65535 && !localPorts.some(x => x.port === p)) {
              localPorts.push({ port: p, name: 'service', label: 'service : ' + p, type: 'in_use', status: 'existing', source: 'remote_probe' });
            }
          }
        });
      } catch {}

      sessionManager.mergeProbeReportedPorts('jp07', localPorts);
      console.log('\x1b[32m✓ 本地主节点 (jp07) 端口扫描完成，已合并入端口账本！\x1b[0m');
    "
    echo ""
    echo -e "${CYAN}📊 整理后的全网端口占用账本明细（服务 + 端口）：${NC}"
    "${PORTAL_DIR}/scripts/portal-cli.sh" p
    ;;

  nodes|node|n|probe|lg|agent)
    TARGET_NODE="${2:-}"
    node -e "
      import('${PORTAL_DIR}/server/configLoader.js').then(async m => {
        const fs = require('fs');
        const path = require('path');
        const crypto = require('crypto');
        
        // 1. 读取 .env 配置 (严格健壮解析)
        const envFile = '${PORTAL_DIR}/.env';
        let envContent = '';
        try { envContent = fs.readFileSync(envFile, 'utf-8'); } catch {}
        
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

        // 2. 加载全网节点配置
        const config = await m.loadUnifiedConfig() || m.getActiveConfig();
        const nodes = config.nodes || [];
        const network = config.network || {};

        if (!coreUrl) {
          const hubNode = nodes.find(n => n.features && n.features.some(f => f.includes('Hub') || f.includes('Core'))) || nodes[0];
          if (hubNode && hubNode.endpoint) {
            coreUrl = 'http://' + hubNode.endpoint + ':4242';
          } else if (hubNode && hubNode.ipv4) {
            coreUrl = 'http://' + hubNode.ipv4 + ':4242';
          } else {
            coreUrl = 'http://127.0.0.1:4242';
          }
        }

        // 3. 尝试从运行中的服务获取实时 WebSocket 探针状态
        let liveProbes = {};
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 1000);
          const probeRes = await fetch('http://127.0.0.1:4242/api/probe/status', { signal: controller.signal });
          clearTimeout(timer);
          if (probeRes.ok) {
            const probeData = await probeRes.json();
            liveProbes = probeData.probes || {};
          }
        } catch {}

        const targetArg = '${TARGET_NODE}'.toLowerCase().trim();

        // 单节点指令查询 (如 dnp probe us01 或 dnp probe US-1)
        if (targetArg && targetArg !== 'gen' && targetArg !== 'list' && targetArg !== 'all') {
          const matched = nodes.find(n => n.id.toLowerCase() === targetArg || n.code.toLowerCase() === targetArg);
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
            process.exit(0);
          } else {
            console.log('\n\x1b[31m❌ 未找到代号为 [' + targetArg + '] 的节点。\x1b[0m');
            console.log('当前可用的节点代号 ID 如下: ' + nodes.map(n => '\x1b[33m' + n.id + '\x1b[0m (' + n.code + ')').join(', '));
            console.log('');
          }
        }

        // 全网节点总览与安装命令列表
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
        process.exit(0);
      }).catch(err => {
        console.error(err);
        process.exit(1);
      });
    "
    ;;

  clean)
    echo -e "${CYAN}🧹 正在扫描超过 7 天未建立 WireGuard 会话的过期申请...${NC}"
    node -e "
      const sessionManager = require('${PORTAL_DIR}/server/sessionManager.js');
      const res = sessionManager.cleanupExpiredPendingSessions(7);
      console.log('\x1b[32m✓ 清理完成！共回收释放了 ' + res.cleanedCount + ' 个超时占用的端口。\x1b[0m');
    "
    ;;

  uninstall|rm)
    if [ -f "${PORTAL_DIR}/scripts/uninstall.sh" ]; then
      bash "${PORTAL_DIR}/scripts/uninstall.sh"
    else
      curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/uninstall.sh | bash
    fi
    ;;

  stop)
    echo -e "${RED}⏹️ 正在停止服务...${NC}"
    systemctl stop "${SERVICE_NAME}"
    echo -e "${GREEN}✓ 服务已停止${NC}"
    ;;

  start)
    echo -e "${GREEN}▶️ 正在启动服务...${NC}"
    systemctl start "${SERVICE_NAME}"
    echo -e "${GREEN}✓ 服务已启动${NC}"
    ;;

  h|help|*)
    echo -e "${CYAN}==================================================================${NC}"
    echo -e "   🌐 AkiLab DN42 Peering Portal 极速运维工具 (dnp)"
    echo -e "${CYAN}==================================================================${NC}"
    echo -e "极简用法: ${GREEN}dnp <单字母或指令>${NC}"
    echo ""
    echo -e "  ${YELLOW}dnp n${NC}     (nodes)     - 查看全网节点清单与探针实时在线状态 (Node List)"
    echo -e "  ${YELLOW}dnp probe${NC} [节点ID]  - 一键生成远端探针无人值守安装指令 (Like 哪吒探针)"
    echo -e "  ${YELLOW}dnp c${NC}     (config)    - 快速编辑节点与 ASN 统一配置 (保存即生效)"
    echo -e "  ${YELLOW}dnp l${NC}     (logs)      - 查看实时滚动日志 (谁在查 LG、谁在申请 Peer)"
    echo -e "  ${YELLOW}dnp s${NC}     (status)    - 查看服务运行状态与内存开销"
    echo -e "  ${YELLOW}dnp p${NC}     (ports)     - 查看已使用与已锁定端口明细清单"
    echo -e "  ${YELLOW}dnp r${NC}     (restart)   - 重启门户服务"
    echo -e "  ${YELLOW}dnp u${NC}     (update)    - 一键拉取 GitHub 最新版本并自动重新构建"
    echo -e "  ${YELLOW}dnp scan${NC}  (scan)      - 触发全网端口深度扫描 (ss -tulnp 并自动下发指令)"
    echo -e "  ${YELLOW}dnp clean${NC} (clean)     - 扫描并清理超过 7 天未建立会话并释放端口"
    echo -e "  ${YELLOW}dnp e${NC}     (env)       - 编辑 .env 私密密钥与 Telegram Token"
    echo -e "  ${YELLOW}dnp rm${NC}    (uninstall) - 干净卸载与清理"
    echo ""
    ;;
esac
