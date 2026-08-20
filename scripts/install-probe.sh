#!/usr/bin/env bash
# ==============================================================================
# 🚀 AkiLab Networks - BIRD Looking Glass 探针一键极速安装脚本
# 支持 Debian 11/12/13, Ubuntu 20.04+, Alpine Linux (x86_64 / aarch64)
#
# 远程一键调用方式:
#   1. 交互式安装:
#      curl -sSL https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/scripts/install-probe.sh | sudo bash
#
#   2. 静默快速安装 (参数指定):
#      curl -sSL ... | sudo bash -s -- --listen 127.0.0.1:5000 --token YOUR_TOKEN
# ==============================================================================

set -euo pipefail

# 颜色与样式
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

BIRD_LG_VER="v1.3.4"
DEFAULT_PORT=5000
DEFAULT_SOCKET="/var/run/bird/bird.ctl"

echo -e "${CYAN}${BOLD}"
echo "  ╔═════════════════════════════════════════════════════════════════════╗"
echo "  ║         🌐 AkiLab DN42 - bird-lgproxy 探针自动部署套件              ║"
echo "  ║          Author: AkiLab Networks · Compatible with Debian 13        ║"
echo "  ╚═════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 1. 检查 root 权限
if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}❌ 错误：请使用 root 用户或 sudo 执行此脚本。${NC}"
  exit 1
fi

# 2. 解析命令行参数
LISTEN_IP="127.0.0.1"
LISTEN_PORT="${DEFAULT_PORT}"
PROXY_TOKEN=""
BIRD_SOCKET="${DEFAULT_SOCKET}"
INTERACTIVE=true

while [[ $# -gt 0 ]]; do
  case $1 in
    -l|--listen)
      LISTEN_ADDR="$2"
      LISTEN_IP="${LISTEN_ADDR%:*}"
      LISTEN_PORT="${LISTEN_ADDR##*:}"
      INTERACTIVE=false
      shift 2
      ;;
    -t|--token)
      PROXY_TOKEN="$2"
      INTERACTIVE=false
      shift 2
      ;;
    -s|--socket)
      BIRD_SOCKET="$2"
      INTERACTIVE=false
      shift 2
      ;;
    -h|--help)
      echo "用法: sudo ./install-probe.sh [选项]"
      echo "选项:"
      echo "  -l, --listen <IP:PORT>   设置监听地址 (默认: 127.0.0.1:5000)"
      echo "  -t, --token <STRING>     设置 API 认证 Token (可选)"
      echo "  -s, --socket <PATH>      设置 BIRD 控制 Socket 路径 (默认: /var/run/bird/bird.ctl)"
      exit 0
      ;;
    *)
      # 位置参数兼容
      if [ -z "$PROXY_TOKEN" ] && [[ "$1" != *":"* ]]; then
        PROXY_TOKEN="$1"
      fi
      shift
      ;;
  esac
done

# 3. 交互式配置向导 (当未传入参数时)
if [ "$INTERACTIVE" = true ]; then
  echo -e "${YELLOW}⚙️  未检测到静默参数，进入交互式配置向导：${NC}\n"
  
  echo -e "${BOLD}1. 选择部署模式 / 监听目标:${NC}"
  echo "   [1] 本地模式 (127.0.0.1:5000) - 适用与 Portal 部署在同台 VPS (如 JP-7 主机)"
  echo "   [2] 内网/全网模式 (0.0.0.0:5000) - 适用远端 PoP 节点 (如 US-01, DE-02)"
  echo "   [3] 自定义 IP 与端口"
  read -rp "请选择 [默认 1]: " MODE_CHOICE
  MODE_CHOICE="${MODE_CHOICE:-1}"

  case "$MODE_CHOICE" in
    2)
      LISTEN_IP="0.0.0.0"
      LISTEN_PORT=5000
      ;;
    3)
      read -rp "请输入监听 IP [127.0.0.1]: " CUSTOM_IP
      LISTEN_IP="${CUSTOM_IP:-127.0.0.1}"
      read -rp "请输入监听端口 [5000]: " CUSTOM_PORT
      LISTEN_PORT="${CUSTOM_PORT:-5000}"
      ;;
    *)
      LISTEN_IP="127.0.0.1"
      LISTEN_PORT=5000
      ;;
  esac

  echo ""
  echo -e "${BOLD}2. 设置安全 Token (防扫描 / 远端通信鉴权):${NC}"
  read -rp "请输入安全 Token (直接回车表示不使用 Token): " INPUT_TOKEN
  PROXY_TOKEN="${INPUT_TOKEN:-}"

  echo ""
fi

# 4. 自动检测 BIRD 控制 Socket 路径
if [ ! -S "$BIRD_SOCKET" ]; then
  # 尝试常见备用路径
  if [ -S "/run/bird/bird.ctl" ]; then
    BIRD_SOCKET="/run/bird/bird.ctl"
  elif [ -S "/run/bird.ctl" ]; then
    BIRD_SOCKET="/run/bird.ctl"
  elif [ -S "/var/run/bird.ctl" ]; then
    BIRD_SOCKET="/var/run/bird.ctl"
  fi
fi

echo -e "${CYAN}🔍 检测系统环境与必要依赖...${NC}"
# 自动安装网络探测依赖
if command -v apt-get &>/dev/null; then
  apt-get update -qq && apt-get install -y -qq curl iproute2 traceroute iputils-ping
elif command -v apk &>/dev/null; then
  apk add --no-cache curl iproute2 traceroute iputils
fi

# 5. 架构检测 (x86_64 / arm64)
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64)
    BIN_ARCH="linux_amd64"
    ;;
  aarch64|arm64)
    BIN_ARCH="linux_arm64"
    ;;
  *)
    echo -e "${RED}❌ 抱歉，不支持的 CPU 架构: ${ARCH}${NC}"
    exit 1
    ;;
esac

# 6. 下载 bird-lgproxy 官方预编译二进制
DOWNLOAD_URL="https://github.com/xddxdd/bird-lg-go/releases/download/${BIRD_LG_VER}/bird-lgproxy_${BIN_ARCH}"
echo -e "${CYAN}⬇️  正在下载探针可执行文件 (${BIN_ARCH})...${NC}"

if ! curl -sSL --connect-timeout 10 "$DOWNLOAD_URL" -o /usr/local/bin/bird-lgproxy; then
  echo -e "${YELLOW}⚠️  官方源直连受限，自动切换为加速镜像源...${NC}"
  curl -sSL "https://ghproxy.com/${DOWNLOAD_URL}" -o /usr/local/bin/bird-lgproxy
fi

chmod +x /usr/local/bin/bird-lgproxy
echo -e "${GREEN}✅ 二进制文件安装成功: /usr/local/bin/bird-lgproxy${NC}"

# 7. 生成 systemd 服务文件
SERVICE_FILE="/etc/systemd/system/bird-lgproxy.service"
EXEC_CMD="/usr/local/bin/bird-lgproxy -listen ${LISTEN_IP}:${LISTEN_PORT} -birdsocket ${BIRD_SOCKET}"

if [ -n "$PROXY_TOKEN" ]; then
  EXEC_CMD="${EXEC_CMD} -token ${PROXY_TOKEN}"
fi

cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=AkiLab Networks BIRD Looking Glass Proxy
After=network.target bird.service
Wants=bird.service

[Service]
Type=simple
User=root
Group=root
ExecStart=${EXEC_CMD}
Restart=always
RestartSec=3
LimitNOFILE=65535

# 安全沙盒隔离
ProtectSystem=full
ProtectHome=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

# 8. 启动与自启管理
if command -v systemctl &>/dev/null; then
  systemctl daemon-reload
  systemctl enable bird-lgproxy
  systemctl restart bird-lgproxy
  sleep 1.5

  if systemctl is-active --quiet bird-lgproxy; then
    echo ""
    echo -e "${GREEN}${BOLD}================================================================${NC}"
    echo -e "${GREEN}${BOLD}🎉 bird-lgproxy 探针已成功安装并运行！${NC}"
    echo -e "${GREEN}${BOLD}================================================================${NC}"
    echo -e "  📍 监听地址:   ${CYAN}${LISTEN_IP}:${LISTEN_PORT}${NC}"
    echo -e "  🦅 BIRD Socket: ${CYAN}${BIRD_SOCKET}${NC}"
    echo -e "  🔑 认证 Token: ${CYAN}${PROXY_TOKEN:-'(无 Token)'}${NC}"
    echo -e "  📋 管理命令:   ${YELLOW}systemctl status bird-lgproxy${NC}"
    echo -e "  📄 查看日志:   ${YELLOW}journalctl -u bird-lgproxy -f${NC}"
    echo -e "${GREEN}${BOLD}================================================================${NC}"
  else
    echo -e "${RED}❌ 服务未能成功启动，请执行: journalctl -u bird-lgproxy -e 查看报错原因。${NC}"
    exit 1
  fi
fi
