#!/usr/bin/env bash
# ==============================================================================
# 🚀 AkiLab Networks - 反向 WebSocket 轻量探针部署脚本 (dn42-agent)
# 模式: 类似哪吒探针 (NAT 穿透 · 零公网端口暴露 · 纯 Python 3 原生守护)
#
# 使用方式 (在任何 Linux 节点作为 root 执行):
#   curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/install-probe.sh | sudo bash -s -- --master "https://dn42.akilab.meme" --token "YOUR_TOKEN" --node-id "us01"
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}"
echo "  ╔═════════════════════════════════════════════════════════════════════╗"
echo "  ║      🦅 AkiLab DN42 - 轻量级反向 WebSocket 探针套件 (dn42-agent)    ║"
echo "  ║          模式: 反向长连接 · NAT 穿透 · 毫秒级 BGP 穿透诊断         ║"
echo "  ╚═════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 1. 检查 root 权限
if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}❌ 错误：请使用 root 用户或 sudo 执行此脚本。${NC}"
  exit 1
fi

prompt_user() {
  local prompt_text="$1"
  local var_name="$2"
  local default_value="${3:-}"

  if [ -c /dev/tty ]; then
    read -rp "$prompt_text" "$var_name" </dev/tty || true
  else
    read -rp "$prompt_text" "$var_name" || true
  fi

  local val
  eval "val=\$${var_name}"
  if [ -z "$val" ] && [ -n "$default_value" ]; then
    eval "$var_name=\"$default_value\""
  fi
}

# 2. 解析参数
MASTER_URL=""
TOKEN=""
NODE_ID=""
INTERACTIVE=true

while [[ $# -gt 0 ]]; do
  case $1 in
    -m|--master|--core-url|-c)
      MASTER_URL="$2"
      INTERACTIVE=false
      shift 2
      ;;
    -t|--token)
      TOKEN="$2"
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
      echo "  -m, --master <URL>      Master 主控端面板网址 (如 https://dn42.akilab.meme)"
      echo "  -t, --token <STRING>    通信鉴权 Token"
      echo "  -n, --node-id <ID>      当前节点唯一代号 (如 us01, hk01, jp02)"
      exit 0
      ;;
    *)
      shift
      ;;
  esac
done

if [ "$INTERACTIVE" = true ]; then
  echo -e "${YELLOW}⚙️  未检测到静默参数，进入交互式配置向导：${NC}\n"
  prompt_user "1. 请输入 Master 主控端面板地址 (如 https://dn42.akilab.meme): " MASTER_URL ""
  prompt_user "2. 请输入通信鉴权 Token (与主控端 .env 一致): " TOKEN ""
  prompt_user "3. 请输入本节点的代号 (如 us01, hk01, jp02): " NODE_ID "us01"
fi

if [ -z "$MASTER_URL" ] || [ -z "$TOKEN" ] || [ -z "$NODE_ID" ]; then
  echo -e "${RED}❌ 错误: 缺少必要参数 (--master, --token, --node-id)。${NC}"
  exit 1
fi

MASTER_URL="${MASTER_URL%/}"

echo -e "\n${CYAN}📦 正在检查并安装系统依赖 (Python 3, birdc, iputils, traceroute)...${NC}"

if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq python3 curl traceroute iputils-ping bird2 >/dev/null 2>&1 || apt-get install -y -qq python3 curl traceroute iputils-ping >/dev/null 2>&1 || true
elif command -v apk >/dev/null 2>&1; then
  apk add --no-cache python3 curl iputils traceroute >/dev/null 2>&1 || true
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y -q python3 curl traceroute iputils >/dev/null 2>&1 || true
fi

echo -e "${CYAN}⬇️ 正在配置 dn42-agent 守护进程...${NC}"

AGENT_DIR="/opt/dn42-agent"
mkdir -p "${AGENT_DIR}"

AGENT_SCRIPT="${AGENT_DIR}/dn42-agent.py"

# 下载或复制 Python agent
curl -sSL "https://raw.githubusercontent.com/akira3143/dnpeering/main/agent/dn42-agent.py" -o "${AGENT_SCRIPT}" 2>/dev/null || {
  if [ -f "/opt/dnpeering/agent/dn42-agent.py" ]; then
    cp "/opt/dnpeering/agent/dn42-agent.py" "${AGENT_SCRIPT}"
  fi
}

chmod +x "${AGENT_SCRIPT}"
ln -sf "${AGENT_SCRIPT}" /usr/local/bin/dn42-agent 2>/dev/null || true

# 写入环境变量
cat <<EOF > /etc/dn42-agent.env
MASTER_URL="${MASTER_URL}"
NODE_ID="${NODE_ID}"
TOKEN="${TOKEN}"
EOF

chmod 600 /etc/dn42-agent.env

# 注册 systemd 守护服务
cat <<EOF > /etc/systemd/system/dn42-agent.service
[Unit]
Description=AkiLab DN42 Reverse WebSocket Probe Agent
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/dn42-agent.env
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 -u ${AGENT_SCRIPT} --master ${MASTER_URL} --node-id ${NODE_ID} --token ${TOKEN}
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload
  systemctl enable --now dn42-agent.service >/dev/null 2>&1
  systemctl restart dn42-agent.service >/dev/null 2>&1
fi

echo -e "\n${GREEN}${BOLD}"
echo "  ╔═════════════════════════════════════════════════════════════════════╗"
echo "  ║      🎉 恭喜！AkiLab DN42 探针守护服务部署成功！                     ║"
echo "  ╚═════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  - 节点代号: ${CYAN}${NODE_ID}${NC}"
echo -e "  - 主控中心: ${CYAN}${MASTER_URL}${NC}"
echo -e "  - 服务状态: ${GREEN}dn42-agent.service (Running / Active)${NC}"
echo -e "  - 探针模式: ${YELLOW}反向 WebSocket 长连接 (已在主站点亮 🟢 在线)${NC}"
echo ""
echo -e "💡 运维小贴士:"
echo "   - 查看探针实时日志: journalctl -u dn42-agent -f"
echo "   - 重启探针守护进程: systemctl restart dn42-agent"
echo ""
