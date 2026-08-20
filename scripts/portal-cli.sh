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

PORTAL_DIR="/opt/dn42-peering-portal"
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

  r|restart)
    echo -e "${YELLOW}🔄 正在重启 DN42 Portal 服务...${NC}"
    systemctl restart "${SERVICE_NAME}"
    echo -e "${GREEN}✓ 重启完成！${NC}"
    ;;

  u|update|upgrade)
    echo -e "${CYAN}🚀 正在从 GitHub 拉取最新代码并热升级...${NC}"
    cd "${PORTAL_DIR}"
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
    echo -e "  ${YELLOW}dnp c${NC}  (config)   - 快速编辑节点与 ASN 统一配置 (保存即生效)"
    echo -e "  ${YELLOW}dnp l${NC}  (logs)     - 查看实时滚动日志 (谁在查 LG、谁在申请 Peer)"
    echo -e "  ${YELLOW}dnp s${NC}  (status)   - 查看服务运行状态与内存开销"
    echo -e "  ${YELLOW}dnp r${NC}  (restart)  - 重启门户服务"
    echo -e "  ${YELLOW}dnp u${NC}  (update)   - 一键拉取 GitHub 最新版本并自动重新构建"
    echo -e "  ${YELLOW}dnp e${NC}  (env)      - 编辑 .env 私密密钥与 Telegram Token"
    echo ""
    ;;
esac
