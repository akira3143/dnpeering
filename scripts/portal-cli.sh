#!/usr/bin/env bash
# ==============================================================================
# 🌐 AkiLab DN42 Portal - CLI 快捷运维指令管理器 (/usr/local/bin/portal)
# ==============================================================================

PORTAL_DIR="/opt/dn42-peering-portal"
SERVICE_NAME="dn42-portal"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

case "$1" in
  config|edit)
    echo -e "${CYAN}📝 正在打开统一配置文件 (修改后保存即生效)...${NC}"
    ${EDITOR:-nano} "${PORTAL_DIR}/portal.config.yaml"
    ;;
  
  env)
    echo -e "${CYAN}🔒 正在打开 .env 密钥配置 (修改后需执行 portal restart)...${NC}"
    ${EDITOR:-nano} "${PORTAL_DIR}/.env"
    ;;

  log|logs)
    echo -e "${CYAN}📜 正在追踪实时运行日志 (Ctrl+C 退出)...${NC}"
    journalctl -u "${SERVICE_NAME}" -f -n 50
    ;;

  status)
    systemctl status "${SERVICE_NAME}"
    ;;

  restart)
    echo -e "${YELLOW}🔄 正在重启 DN42 Portal 服务...${NC}"
    systemctl restart "${SERVICE_NAME}"
    echo -e "${GREEN}✓ 重启完成！${NC}"
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

  update)
    echo -e "${CYAN}🚀 正在从 GitHub 拉取最新代码并热升级...${NC}"
    cd "${PORTAL_DIR}"
    git pull origin main
    npm install --loglevel=error
    npm run build
    systemctl restart "${SERVICE_NAME}"
    echo -e "${GREEN}✓ 升级完成并已成功热加载！${NC}"
    ;;

  *)
    echo -e "${CYAN}====================================================${NC}"
    echo -e "   🌐 AkiLab DN42 Portal 快捷运维管理工具"
    echo -e "${CYAN}====================================================${NC}"
    echo -e "用法: ${GREEN}portal <指令>${NC}"
    echo ""
    echo -e "  ${YELLOW}portal config${NC}   - 快捷编辑节点与 ASN 统一配置 (保存即生效)"
    echo -e "  ${YELLOW}portal logs${NC}     - 查看实时滚动日志"
    echo -e "  ${YELLOW}portal status${NC}   - 查看服务运行状态"
    echo -e "  ${YELLOW}portal restart${NC}  - 重启门户服务"
    echo -e "  ${YELLOW}portal update${NC}   - 一键拉取 GitHub 最新版本并重新构建"
    echo -e "  ${YELLOW}portal env${NC}      - 编辑 .env 密钥与 Telegram Token"
    echo ""
    ;;
esac
