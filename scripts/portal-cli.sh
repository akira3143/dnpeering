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
    echo -e "${CYAN}🚀 正在从 GitHub 拉取最新代码并热升级...${NC}"
    cd "${PORTAL_DIR}"
    # 丢弃代码文件的本地变动（保护 .env、portal.config.yaml 与数据文件不受影响）
    git checkout -- . 2>/dev/null || git stash 2>/dev/null || true
    git pull origin main
    npm install --loglevel=error
    npm run build
    systemctl restart "${SERVICE_NAME}"
    echo -e "${GREEN}✓ 升级完成并已成功热加载！${NC}"
    ;;

  e|env)
    echo -e "${CYAN}🔒 正在打开 .env 密钥配置 (修改后需执行 dnp r 重启生效)...${NC}"
    ${EDITOR:-nano} "${PORTAL_DIR}/.env"
    ;;

  p|port|ports)
    echo -e "${CYAN}📊 正在读取当前端口占用与锁定账本 (${PORTAL_DIR}/server/data/port_ledger.json)...${NC}"
    if [ -f "${PORTAL_DIR}/server/data/port_ledger.json" ]; then
      node -e "
        const fs = require('fs');
        const file = '${PORTAL_DIR}/server/data/port_ledger.json';
        const data = JSON.parse(fs.readFileSync(file, 'utf-8') || '{}');
        console.log('');
        for (const [nodeId, ports] of Object.entries(data)) {
          console.log('\x1b[36m=== 节点: ' + nodeId.toUpperCase() + ' ===\x1b[0m');
          const entries = Object.values(ports);
          if (entries.length === 0) {
            console.log('  (暂无端口占用记录)');
          } else {
            for (const item of entries) {
              const tag = item.type === 'locked' 
                ? '\x1b[33m[🔒已锁定/申请中]\x1b[0m' 
                : '\x1b[32m[🟢已使用/活跃]\x1b[0m';
              console.log('  ' + tag + ' ' + item.label + (item.asn ? ' (ASN: AS' + item.asn + ')' : ''));
            }
          }
          console.log('');
        }
      " 2>/dev/null || cat "${PORTAL_DIR}/server/data/port_ledger.json"
    else
      echo -e "${YELLOW}暂无端口账本文件。${NC}"
    fi
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
      });
    "
    ;;

  scan|scan-ports)
    echo -e "${CYAN}🔍 正在深度扫描本机已有的 WireGuard 隧道与监听端口...${NC}"
    echo ""
    echo -e "  ${YELLOW}--- 1. Linux 内核实时 WireGuard 网卡监听端口 (wg show) ---${NC}"
    if command -v wg >/dev/null 2>&1; then
      wg show all listen-port 2>/dev/null || echo "  (暂无活跃 wg 接口或需 root 权限)"
    else
      echo "  (未安装 wg 命令)"
    fi
    echo ""
    echo -e "  ${YELLOW}--- 2. /etc/wireguard/*.conf 配置文件中声明的 ListenPort ---${NC}"
    if [ -d "/etc/wireguard" ]; then
      grep -rnE "^ListenPort\s*=" /etc/wireguard/ 2>/dev/null || echo "  (未在 /etc/wireguard/ 发现 ListenPort 声明)"
    else
      echo "  (/etc/wireguard 目录不存在)"
    fi
    echo ""
    echo -e "  ${YELLOW}--- 3. 正在监听的 UDP 端口 (10000-65535) ---${NC}"
    ss -ulnp 2>/dev/null | grep -E ":[1-6][0-9]{4}" || netstat -ulnp 2>/dev/null | grep -E ":[1-6][0-9]{4}" || echo "  (无相关 UDP 监听)"
    echo ""
    echo -e "${GREEN}✓ 提示: 后端已实装系统级端口自动融合引擎，以上所有端口均已被系统自动识别并纳入防冲突名单！${NC}"
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
    echo -e "  ${YELLOW}dnp scan${NC}  (scan)      - 重新执行一次系统 WireGuard 端口基线扫描"
    echo -e "  ${YELLOW}dnp clean${NC} (clean)     - 扫描并清理超过 7 天未建立会话并释放端口"
    echo -e "  ${YELLOW}dnp e${NC}     (env)       - 编辑 .env 私密密钥与 Telegram Token"
    echo -e "  ${YELLOW}dnp rm${NC}    (uninstall) - 干净卸载与清理"
    echo ""
    ;;
esac
