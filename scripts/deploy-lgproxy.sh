#!/bin/bash
# ==============================================================================
# AkiLab DN42 - bird-lgproxy 一键自动化部署脚本 (Debian 12 / Debian 13)
# 用于将 bird-lgproxy (xddxdd/bird-lg-go) 探针部署在各个 BIRD 路由节点上
#
# 使用方式 (在目标 Linux 节点上作为 root 执行):
#   chmod +x deploy-lgproxy.sh
#   sudo ./deploy-lgproxy.sh [LISTEN_IP:PORT] [OPTIONAL_TOKEN]
#
# 示例:
#   1. JP07 本地主节点 (仅监听本地):
#      sudo ./deploy-lgproxy.sh 127.0.0.1:5000
#   2. US01 远端节点 (监听内网 DN42/WireGuard IP 并加 Token):
#      sudo ./deploy-lgproxy.sh 172.20.14.2:5000 my_secure_token_123
# ==============================================================================

set -e

LISTEN_ADDR="${1:-127.0.0.1:5000}"
PROXY_TOKEN="${2:-}"
BIRD_SOCKET="${3:-/var/run/bird/bird.ctl}"
BIRD_LG_VER="v1.3.4"

echo "=========================================================="
echo "🚀 开始部署 bird-lgproxy 探针服务..."
echo "  - 监听地址: ${LISTEN_ADDR}"
echo "  - BIRD 控制 Socket: ${BIRD_SOCKET}"
echo "  - 认证 Token: ${PROXY_TOKEN:-'(无 / 仅依赖内网白名单)'}"
echo "=========================================================="

# 1. 检查 root 权限
if [ "$EUID" -ne 0 ]; then
  echo "❌ 错误：请使用 sudo 或 root 用户运行此脚本。"
  exit 1
fi

# 2. 检查必要的系统依赖 (兼容 Debian/Ubuntu, Alpine, RHEL/Fedora, Arch)
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y -qq curl iproute2 traceroute iputils-ping || true
elif command -v apk >/dev/null 2>&1; then
  apk add --no-cache curl iproute2 traceroute iputils || true
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y -q curl iproute traceroute iputils || true
elif command -v yum >/dev/null 2>&1; then
  yum install -y -q curl iproute traceroute iputils || true
elif command -v pacman >/dev/null 2>&1; then
  pacman -Sy --noconfirm curl iproute2 traceroute iputils || true
fi

# 3. 确定架构 (x86_64 / arm64)
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)
    BIN_ARCH="linux_amd64"
    ;;
  aarch64|arm64)
    BIN_ARCH="linux_arm64"
    ;;
  *)
    echo "❌ 不支持的 CPU 架构: $ARCH"
    exit 1
    ;;
esac

# 4. 下载官方预编译单文件二进制
DOWNLOAD_URL="https://github.com/xddxdd/bird-lg-go/releases/download/${BIRD_LG_VER}/bird-lgproxy_${BIN_ARCH}"
echo "⬇️ 正在下载 bird-lgproxy (${BIN_ARCH})..."
curl -sSL "$DOWNLOAD_URL" -o /usr/local/bin/bird-lgproxy || {
  echo "⚠️ 官方 Release 直连受限，尝试备用镜像源..."
  curl -sSL "https://ghproxy.com/${DOWNLOAD_URL}" -o /usr/local/bin/bird-lgproxy
}

chmod +x /usr/local/bin/bird-lgproxy
echo "✅ 二进制文件已就绪: /usr/local/bin/bird-lgproxy"

# 5. 生成 systemd 服务配置文件
SERVICE_FILE="/etc/systemd/system/bird-lgproxy.service"

EXEC_CMD="/usr/local/bin/bird-lgproxy -listen ${LISTEN_ADDR} -birdsocket ${BIRD_SOCKET}"
if [ -n "$PROXY_TOKEN" ]; then
  EXEC_CMD="${EXEC_CMD} -token ${PROXY_TOKEN}"
fi

cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=AkiLab BIRD Looking Glass Proxy
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

# 安全沙盒隔离选项
ProtectSystem=full
ProtectHome=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

# 6. 重载并启动 systemd 服务
systemctl daemon-reload
systemctl enable bird-lgproxy
systemctl restart bird-lgproxy

sleep 2

# 7. 检查运行状态
if systemctl is-active --quiet bird-lgproxy; then
  echo "=========================================================="
  echo "🎉 bird-lgproxy 部署成功并已启动！"
  echo "  - 状态检查: systemctl status bird-lgproxy"
  echo "  - 本地测试命令: curl \"http://${LISTEN_ADDR}/bird?q=show+status\""
  echo "=========================================================="
else
  echo "❌ 服务启动异常，请查看日志: journalctl -u bird-lgproxy -e"
  exit 1
fi
