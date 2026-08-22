#!/usr/bin/env bash
# ==============================================================================
# 🌐 AkiLab DN42 Portal - CLI 极速运维指令管理器 (dnp / portal)
#
# 命令缩写映射:
#   dnp c  -> 快速编辑统一配置 (config)
#   dnp l  -> 实时滚动日志 (logs)
#   dnp s  -> 服务运行状态 (status)
#   dnp r  -> 重启门户服务 (restart)
#   dnp u  -> 从 GitHub 热更新升级 (update)
#   dnp e  -> 编辑 .env 密钥 (env)
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
    systemctl is-active dn42-probe-agent &>/dev/null && systemctl restart dn42-probe-agent 2>/dev/null || true
    echo -e "${GREEN}✓ 升级完成并已成功热加载！${NC}"
    ;;

  e|env)
    echo -e "${CYAN}🔒 正在打开 .env 密钥配置 (修改后需执行 dnp r 重启生效)...${NC}"
    ${EDITOR:-nano} "${PORTAL_DIR}/.env"
    ;;

  p|port|ports)
    echo -e "${CYAN}📊 正在读取当前端口占用与锁定账本 (${PORTAL_DIR}/server/data/port_ledger.json)...${NC}"
    node -e "
      import('${PORTAL_DIR}/server/sessionManager.js').then(m => {
        const fs = require('fs');
        const file = '${PORTAL_DIR}/server/data/port_ledger.json';
        let data = {};
        try {
          if (fs.existsSync(file)) {
            data = JSON.parse(fs.readFileSync(file, 'utf-8') || '{}');
          }
        } catch {}

        const totalEntries = Object.values(data).reduce((acc, p) => acc + Object.keys(p).length, 0);
        if (totalEntries === 0) {
          m.initPortLedgerWithBaselineScan();
          try {
            data = JSON.parse(fs.readFileSync(file, 'utf-8') || '{}');
          } catch {}
        }

        console.log('');
        for (const [nodeId, ports] of Object.entries(data)) {
          console.log('\x1b[36m=== 节点: ' + nodeId.toUpperCase() + ' ===\x1b[0m');
          const entries = Object.values(ports).sort((a, b) => (Number(a.port) || 0) - (Number(b.port) || 0));
          if (entries.length === 0) {
            console.log('  (暂无端口占用记录)');
          } else {
            for (const item of entries) {
              const tag = item.type === 'locked' 
                ? '\x1b[33m[🔒 申请中]\x1b[0m' 
                : '\x1b[32m[🟢 已占用]\x1b[0m';
              const namePadded = String(item.name || item.label || 'service').padEnd(20, ' ');
              const portStr = String(item.port || '').padStart(5, ' ');
              const extra = item.asn ? ' (ASN: AS' + item.asn + ')' : '';
              console.log('  ' + tag + ' ' + namePadded + ' : ' + portStr + extra);
            }
          }
          console.log('');
        }
        process.exit(0);
      }).catch(err => {
        console.error(err);
        process.exit(1);
      });
    "
    ;;

  clean|cleanup)
    echo -e "${CYAN}🧹 正在扫描并清理超过 7 天未建立 BGP 连接的僵尸会话...${NC}"
    node -e "
      import('${PORTAL_DIR}/server/sessionManager.js').then(m => {
        const deleted = m.cleanupExpiredUnconnectedSessions();
        if (deleted.length === 0) {
          console.log('\x1b[32m✓ 检查完毕：当前无超过 7 天未连通的过期会话。\x1b[0m');
        } else {
          console.log('\x1b[32m✓ 清理成功：已释放 ' + deleted.length + ' 个僵尸会话占用的端口资源：\x1b[0m');
          for (const s of deleted) {
            console.log('  - 会话 ' + s.sessionId + ' (ASN: AS' + s.asn + ', 端口: ' + s.hostPort + ', 节点: ' + s.nodeId + ')');
          }
        }
        process.exit(0);
      }).catch(err => {
        console.error(err);
        process.exit(1);
      });
    "
    ;;

  scan|scan-ports)
    echo -e "${CYAN}🔍 正在执行全网深度扫描 (ss -tulnp) 并自动下发指令同步所有节点...${NC}"
    node -e "
      import('${PORTAL_DIR}/server/sessionManager.js').then(async m => {
        const res = m.initPortLedgerWithBaselineScan();
        console.log('\x1b[32m✓ 本地节点 (' + (res.localId || 'JP07').toUpperCase() + ') 已完成物理扫描并精准同步 ' + res.count + ' 个监听端口！\x1b[0m');
        
        const remoteRes = await m.triggerAllRemoteProbesScan();
        if (remoteRes && remoteRes.length > 0) {
          const successNodes = remoteRes.filter(r => r.success).map(r => r.code);
          if (successNodes.length > 0) {
            console.log('\x1b[32m📡 远端探针联动：已成功向远端节点 [' + successNodes.join(', ') + '] 下发指令并完成即时同步！\x1b[0m');
          }
        }
        process.exit(0);
      }).catch(err => {
        console.error(err);
        process.exit(1);
      });
    "
    chown -R dnpeering:dnpeering "${PORTAL_DIR}/server/data" 2>/dev/null || true
    chmod 644 "${PORTAL_DIR}/server/data/port_ledger.json" 2>/dev/null || true
    echo ""
    echo -e "${CYAN}📊 整理后的全网端口占用账本明细（服务 + 端口）：${NC}"
    "${PORTAL_DIR}/scripts/portal-cli.sh" p
    ;;

  probe|lg|agent)
    TARGET_NODE="${2:-}"
    node -e "
      import('${PORTAL_DIR}/server/configLoader.js').then(async m => {
        const fs = require('fs');
        const path = require('path');
        const crypto = require('crypto');
        
        // 1. 读取 .env 配置
        const envFile = '${PORTAL_DIR}/.env';
        let envContent = '';
        try { envContent = fs.readFileSync(envFile, 'utf-8'); } catch {}
        
        let tokenMatch = envContent.match(/^PROBE_AUTH_TOKEN\s*=\s*(.+)$/m) || envContent.match(/^BIRD_LG_TOKEN\s*=\s*(.+)$/m);
        let token = tokenMatch ? tokenMatch[1].trim().replace(/^[\"']|[\"']$/g, '') : '';
        
        if (!token) {
          token = crypto.randomBytes(16).toString('hex');
          fs.appendFileSync(envFile, '\nPROBE_AUTH_TOKEN=\"' + token + '\"\n');
          console.log('\x1b[33m⚡ 已自动为您生成并保存全局通信鉴权密钥 PROBE_AUTH_TOKEN 到 .env\x1b[0m');
        }

        // 2. 获取主控 Core URL
        let coreUrlMatch = envContent.match(/^PORTAL_CORE_URL\s*=\s*(.+)$/m);
        let coreUrl = coreUrlMatch ? coreUrlMatch[1].trim().replace(/^[\"']|[\"']$/g, '') : '';
        
        const config = m.loadUnifiedConfig();
        const nodes = config.nodes || [];
        const network = config.network || {};

        if (!coreUrl) {
          // 优先使用主节点的公网域名/公网 IP (确保无 iBGP 时公网也能 100% 互通)
          const hubNode = nodes.find(n => n.features && n.features.some(f => f.includes('Hub') || f.includes('Core'))) || nodes[0];
          if (hubNode && hubNode.endpoint) {
            coreUrl = 'http://' + hubNode.endpoint + ':4242';
          } else if (hubNode && hubNode.ipv4) {
            coreUrl = 'http://' + hubNode.ipv4 + ':4242';
          } else {
            coreUrl = 'http://127.0.0.1:4242';
          }
        }

        const targetArg = '${TARGET_NODE}'.toLowerCase().trim();

        if (targetArg && targetArg !== 'gen' && targetArg !== 'list') {
          const matched = nodes.find(n => n.id.toLowerCase() === targetArg || n.code.toLowerCase() === targetArg);
          if (matched) {
            console.log('\n\x1b[36m==================================================================\x1b[0m');
            console.log('  🌐 节点专属探针一键安装指令 (\x1b[32m' + matched.flag + ' ' + matched.name + '\x1b[0m)');
            console.log('\x1b[36m==================================================================\x1b[0m');
            console.log('\x1b[33m👉 请直接复制以下单行命令，粘贴到目标 VPS 终端回车执行即可：\x1b[0m\n');
            const isLocal = matched.id === 'jp07' || matched.id.includes('local') || matched.id.includes('hub');
            const listenIp = isLocal ? '127.0.0.1:5000' : '0.0.0.0:5000';
            const cmd = 'curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/install-probe.sh | sudo bash -s -- --listen ' + listenIp + ' --token \"' + token + '\" --core-url \"' + coreUrl + '\" --node-id \"' + matched.id + '\"';
            console.log('\x1b[1m\x1b[32m' + cmd + '\x1b[0m\n');
            process.exit(0);
          }
        }

        console.log('\n\x1b[36m==================================================================\x1b[0m');
        console.log('  🦅 AkiLab DN42 - 探针套件与远端一键安装指令生成器 (Like Nezha)');
        console.log('\x1b[36m==================================================================\x1b[0m');
        console.log('  主控端 Core URL: \x1b[32m' + coreUrl + '\x1b[0m (用于远端节点自动回传已占用端口与状态)');
        console.log('  通信鉴权 Token : \x1b[33m' + token + '\x1b[0m');
        console.log('\n\x1b[36m👉 各节点专属一键无人值守安装指令（复制并在目标机器回车执行）：\x1b[0m\n');

        nodes.forEach((n, idx) => {
          const isLocal = idx === 0 || n.id === 'jp07';
          const listenIp = isLocal ? '127.0.0.1:5000' : '0.0.0.0:5000';
          const cmd = 'curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/install-probe.sh | sudo bash -s -- --listen ' + listenIp + ' --token \"' + token + '\" --core-url \"' + coreUrl + '\" --node-id \"' + n.id + '\"';
          
          console.log('\x1b[36m[' + (idx + 1) + '] ' + (n.flag || '🌐') + ' ' + n.code + ' - ' + n.name + ' (' + n.id + ')\x1b[0m');
          console.log('    \x1b[32m' + cmd + '\x1b[0m\n');
        });

        console.log('\x1b[90m💡 提示: 执行 dnp probe <节点ID> (如 dnp probe us01) 可单独获取该节点命令。\x1b[0m\n');
        process.exit(0);
      }).catch(err => {
        console.error(err);
        process.exit(1);
      });
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
    echo -e "  ${YELLOW}dnp c${NC}     (config)    - 快速编辑节点与 ASN 统一配置 (保存即生效)"
    echo -e "  ${YELLOW}dnp l${NC}     (logs)      - 查看实时滚动日志 (谁在查 LG、谁在申请 Peer)"
    echo -e "  ${YELLOW}dnp s${NC}     (status)    - 查看服务运行状态与内存开销"
    echo -e "  ${YELLOW}dnp p${NC}     (ports)     - 查看已使用与已锁定端口明细清单"
    echo -e "  ${YELLOW}dnp r${NC}     (restart)   - 重启门户服务"
    echo -e "  ${YELLOW}dnp u${NC}     (update)    - 一键拉取 GitHub 最新版本并自动重新构建"
    echo -e "  ${YELLOW}dnp scan${NC}  (scan)      - 触发全网端口深度扫描 (ss -tulnp 并自动下发指令)"
    echo -e "  ${YELLOW}dnp probe${NC} [节点ID]  - 一键生成远端探针无人值守安装指令 (Like 哪吒探针)"
    echo -e "  ${YELLOW}dnp clean${NC} (clean)     - 扫描并清理超过 7 天未建立会话并释放端口"
    echo -e "  ${YELLOW}dnp e${NC}     (env)       - 编辑 .env 私密密钥与 Telegram Token"
    echo -e "  ${YELLOW}dnp rm${NC}    (uninstall) - 干净卸载与清理"
    echo ""
    ;;
esac
