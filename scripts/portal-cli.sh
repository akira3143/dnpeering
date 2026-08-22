#!/usr/bin/env bash
# ============================================================================== 
# 🌐 AkiLab DN42 Portal - CLI 极速运维指令管理器 (dnp / portal)
# ============================================================================== 

PORTAL_DIR="/opt/dnpeering"
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
    node "${PORTAL_DIR}/server/cliCommands.js" ports
    ;;

  scan|ports-sync)
    node "${PORTAL_DIR}/server/cliCommands.js" scan
    echo ""
    node "${PORTAL_DIR}/server/cliCommands.js" ports
    ;;

  nodes|node|n|probe|lg|agent)
    node "${PORTAL_DIR}/server/cliCommands.js" probe "${2:-}"
    ;;

  clean)
    node "${PORTAL_DIR}/server/cliCommands.js" clean
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
