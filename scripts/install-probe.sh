#!/usr/bin/env bash
# ==============================================================================
# 🚀 AkiLab Networks - BIRD Looking Glass 探针与端口自动上报套件
# 支持 Debian 11/12/13, Ubuntu 20.04+, Alpine Linux (x86_64 / aarch64)
#
# 远程一键调用方式:
#   1. 交互式安装:
#      curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/install-probe.sh | sudo bash
#
#   2. 静默快速安装 (参数指定):
#      curl -sSL ... | sudo bash -s -- --listen 0.0.0.0:5000 --token YOUR_TOKEN --core-url https://dn42.yourdomain.com --node-id us01
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
echo "  ║      🌐 AkiLab DN42 - bird-lgproxy 探针与端口自动上报套件           ║"
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
CORE_URL=""
NODE_ID=""
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
    -c|--core-url)
      CORE_URL="$2"
      INTERACTIVE=false
      shift 2
      ;;
    -n|--node-id)
      NODE_ID="$2"
      INTERACTIVE=false
      shift 2
      ;;
    -h|--help)
      echo "用法: sudo ./install-probe.sh [选项]"
      echo "选项:"
      echo "  -l, --listen <IP:PORT>     设置监听地址 (默认: 127.0.0.1:5000)"
      echo "  -t, --token <STRING>       设置 API 认证 Token (可选)"
      echo "  -s, --socket <PATH>        设置 BIRD 控制 Socket 路径 (默认: /var/run/bird/bird.ctl)"
      echo "  -c, --core-url <URL>       设置主站 Core Portal 网址 (用于端口自动上报)"
      echo "  -n, --node-id <NODE_ID>    设置当前节点的唯一代号 (如 us01, de02)"
      exit 0
      ;;
    *)
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
  echo -e "${BOLD}2. 设置安全通信 Token (防扫描 / 远端鉴权):${NC}"
  read -rp "请输入通信 Token (直接回车表示不使用 Token): " INPUT_TOKEN
  PROXY_TOKEN="${INPUT_TOKEN:-}"

  echo ""
  echo -e "${BOLD}3. 自动向主站同步本节点已占用端口 (推荐远端 PoP 开启):${NC}"
  read -rp "是否配置自动上报端口到 Core 主站? (y/N): " SYNC_CHOICE
  if [[ "$SYNC_CHOICE" =~ ^[Yy]$ ]]; then
    read -rp "请输入主站地址 (如 https://dn42.yourdomain.com): " INPUT_CORE_URL
    CORE_URL="${INPUT_CORE_URL%/}"
    read -rp "请输入本节点的 ID 代号 (与 portal.config.yaml 保持一致，如 us01): " INPUT_NODE_ID
    NODE_ID="${INPUT_NODE_ID:-}"
  fi

  echo ""
fi

# 4. 依赖项检查
echo -e "${CYAN}🔍 检查系统基础依赖 (curl, tar, iproute2)...${NC}"
if command -v apt-get &>/dev/null; then
  apt-get update -qq && apt-get install -y -qq curl tar iproute2 wireguard-tools jq >/dev/null 2>&1 || true
elif command -v apk &>/dev/null; then
  apk add --no-cache curl tar iproute2 wireguard-tools jq >/dev/null 2>&1 || true
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
  echo -e "${YELLOW}⚠️  官方源直连受限，自动切换为镜像源...${NC}"
  curl -sSL "https://ghproxy.com/${DOWNLOAD_URL}" -o /usr/local/bin/bird-lgproxy || true
fi

chmod +x /usr/local/bin/bird-lgproxy
echo -e "${GREEN}✅ 二进制文件安装成功: /usr/local/bin/bird-lgproxy${NC}"

# 7. 生成 systemd 服务文件 (bird-lgproxy)
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

[Install]
WantedBy=multi-user.target
EOF

# 8. 配置端口自动上报工具 (如果提供了 CORE_URL 和 NODE_ID)
if [ -n "$CORE_URL" ] && [ -n "$NODE_ID" ]; then
  echo -e "${CYAN}📡 配置向主站自动上报端口的服务 (dn42-probe-sync)...${NC}"

  cat <<'EOF' > /usr/local/bin/dnp-probe-report
#!/usr/bin/env bash
# Automatically scans local WireGuard listening ports and reports to Core Portal
set -e

CONFIG_FILE="/etc/bird-lgproxy.env"
if [ -f "$CONFIG_FILE" ]; then
  source "$CONFIG_FILE"
fi

NODE_ID="${NODE_ID:-}"
CORE_URL="${CORE_URL:-}"
TOKEN="${PROXY_TOKEN:-}"

if [ -z "$NODE_ID" ] || [ -z "$CORE_URL" ]; then
  exit 0
fi

# 1. 扫描内核 WireGuard 接口与 /etc/wireguard/*.conf
declare -A DETECTED_PORTS

if command -v wg >/dev/null 2>&1; then
  while read -r iface port; do
    if [ -n "$port" ] && [ "$port" -ge 10000 ] && [ "$port" -le 65535 ]; then
      DETECTED_PORTS["$port"]="$iface"
    fi
  done < <(wg show all listen-port 2>/dev/null || true)
fi

if [ -d "/etc/wireguard" ]; then
  for conf in /etc/wireguard/*.conf; do
    if [ -f "$conf" ]; then
      iface=$(basename "$conf" .conf)
      port=$(grep -iE "^ListenPort\s*=" "$conf" 2>/dev/null | awk -F'=' '{print $2}' | tr -d ' \r\n' || true)
      if [ -n "$port" ] && [ "$port" -ge 10000 ] && [ "$port" -le 65535 ]; then
        if [ -z "${DETECTED_PORTS[$port]:-}" ]; then
          DETECTED_PORTS["$port"]="$iface"
        fi
      fi
    fi
  done
fi

# 2. 构建 JSON Payload
PORTS_JSON="[]"
for port in "${!DETECTED_PORTS[@]}"; do
  iface="${DETECTED_PORTS[$port]}"
  ITEM=$(cat <<JSON_ITEM
{"port": $port, "name": "$iface", "label": "$iface : $port", "type": "in_use", "status": "existing", "source": "remote_probe"}
JSON_ITEM
)
  if command -v jq >/dev/null 2>&1; then
    PORTS_JSON=$(echo "$PORTS_JSON" | jq --argjson item "$ITEM" '. += [$item]')
  fi
done

PAYLOAD=$(cat <<JSON_PAYLOAD
{"nodeId": "$NODE_ID", "ports": $PORTS_JSON}
JSON_PAYLOAD
)

# 3. 发送上报请求
curl -sSL -X POST "${CORE_URL}/api/probe/report-ports" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" >/dev/null 2>&1 || true
EOF

  chmod +x /usr/local/bin/dnp-probe-report

  # 保存环境变量配置
  cat <<EOF > /etc/bird-lgproxy.env
CORE_URL="${CORE_URL}"
NODE_ID="${NODE_ID}"
PROXY_TOKEN="${PROXY_TOKEN}"
EOF

  # 注册 systemd 报送服务与定时器
  cat <<EOF > /etc/systemd/system/dn42-probe-sync.service
[Unit]
Description=AkiLab DN42 Probe Port Sync Reporter
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/dnp-probe-report
EOF

  cat <<EOF > /etc/systemd/system/dn42-probe-sync.timer
[Unit]
Description=Periodic Port Sync Timer for AkiLab DN42
After=network.target

[Timer]
OnBootSec=15sec
OnUnitActiveSec=10min
Persistent=true

[Install]
WantedBy=timers.target
EOF

  if command -v systemctl &>/dev/null; then
    systemctl daemon-reload
    systemctl enable --now dn42-probe-sync.timer >/dev/null 2>&1 || true
    # 立即执行一次上报
    /usr/local/bin/dnp-probe-report || true
    echo -e "${GREEN}✓ 端口自动同步服务已就绪 (每 10 分钟自动向 Core 主站同步)${NC}"
  fi
fi

# 9. 启动与自启管理
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
    if [ -n "$CORE_URL" ]; then
      echo -e "  📡 端口同步:   ${CYAN}已连接到 ${CORE_URL} (节点: ${NODE_ID})${NC}"
    fi
    echo -e "  📋 管理命令:   ${YELLOW}systemctl status bird-lgproxy${NC}"
    echo -e "  📄 查看日志:   ${YELLOW}journalctl -u bird-lgproxy -f${NC}"
    echo -e "${GREEN}${BOLD}================================================================${NC}"
  else
    echo -e "${RED}❌ 服务未能成功启动，请执行: journalctl -u bird-lgproxy -e 查看报错原因。${NC}"
    exit 1
  fi
fi
