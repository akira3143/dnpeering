#!/usr/bin/env bash
# ==============================================================================
# 🌐 AkiLab DN42 Peering Portal - 生产环境一键部署与升级脚本
#
# 支持系统: Debian 11/12/13, Ubuntu 20.04/22.04/24.04
# 功能: 自动安装 Node.js 运行环境、拉取最新代码、编译生产包、生成私钥与配置文件、
#       注册 systemd 守护进程并启动开机自启、配置 Caddy 反代指引与健康自检。
# ==============================================================================

set -e

# ANSI Color Codes
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
PURPLE='\033[0;35m'
NC='\033[0m'

PORTAL_DIR="/opt/dnpeering"
REPO_URL="https://github.com/akira3143/dnpeering.git"
SERVICE_NAME="dn42-portal"
DEFAULT_PORT="4242"

echo -e "${CYAN}"
echo "=================================================================="
echo "   🌐 AkiLab DN42 Peering Portal & Looking Glass 一键部署脚本"
echo "=================================================================="
echo -e "${NC}"

# 1. 检查 root 权限
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}❌ 错误: 请使用 root 权限或 sudo 运行此脚本！${NC}"
    exit 1
fi

# 2. 基础工具安装
echo -e "${CYAN}🔍 [1/7] 检查系统基础组件 (git, curl, openssl)...${NC}"
apt-get update -qq
apt-get install -y -qq git curl openssl ca-certificates >/dev/null 2>&1
echo -e "${GREEN}✓ 基础系统组件就绪${NC}"

# 3. 检查并安装 Node.js 运行环境 (需 >= 18)
echo -e "${CYAN}⚡ [2/7] 检查 Node.js 运行环境...${NC}"
NODE_READY=0
if command -v node >/dev/null 2>&1; then
    NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VER" -ge 18 ]; then
        NODE_READY=1
        echo -e "${GREEN}✓ 检测到现存 Node.js $(node -v) (满足要求)${NC}"
    fi
fi

if [ "$NODE_READY" -eq 0 ]; then
    echo -e "${YELLOW}⚙️ 未检测到 Node.js 18+，正在自动安装官方 NodeSource LTS 环境...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    apt-get install -y -qq nodejs >/dev/null 2>&1
    echo -e "${GREEN}✓ Node.js $(node -v) 安装成功！${NC}"
fi

NODE_BIN=$(which node)

# 4. 代码部署与拉取
echo -e "${CYAN}📦 [3/7] 部署项目源码到 ${PORTAL_DIR}...${NC}"
if [ -d "$PORTAL_DIR/.git" ]; then
    echo -e "${YELLOW}📁 检测到已存在安装目录，正在拉取 GitHub 最新代码...${NC}"
    cd "$PORTAL_DIR"
    git fetch --all --tags >/dev/null 2>&1
    git reset --hard origin/main >/dev/null 2>&1
else
    echo -e "${CYAN}📥 正在从 GitHub 克隆源码仓库...${NC}"
    git clone "$REPO_URL" "$PORTAL_DIR" >/dev/null 2>&1
    cd "$PORTAL_DIR"
fi
echo -e "${GREEN}✓ 源码同步就绪${NC}"

# 5. 安装 NPM 依赖并构建前端生产包
echo -e "${CYAN}🔨 [4/7] 安装项目依赖并编译前端生产包...${NC}"
npm install --loglevel=error
npm run build
echo -e "${GREEN}✓ 生产包编译成功 (dist/ 构建完毕)${NC}"

# 6. 初始化配置文件与安全随机密钥
echo -e "${CYAN}🔑 [5/7] 检查并初始化配置与环境安全密钥...${NC}"

# 6.1 检查 .env
if [ ! -f "$PORTAL_DIR/.env" ]; then
    echo -e "${YELLOW}⚙️ 生成新的 .env 文件并生成安全 64 字节 JWT Secret...${NC}"
    JWT_SECRET=$(openssl rand -hex 64)
    cp "$PORTAL_DIR/.env.example" "$PORTAL_DIR/.env"
    sed -i "s|AUTH_JWT_SECRET=.*|AUTH_JWT_SECRET=${JWT_SECRET}|g" "$PORTAL_DIR/.env"
    sed -i "s|PORT=.*|PORT=${DEFAULT_PORT}|g" "$PORTAL_DIR/.env"
    echo -e "${GREEN}✓ .env 初始化完成 (已自动注入高强度安全密钥)${NC}"
else
    echo -e "${GREEN}✓ 已检测到现存 .env，保留原密钥${NC}"
fi

# 6.2 检查 portal.config.yaml
if [ ! -f "$PORTAL_DIR/portal.config.yaml" ]; then
    echo -e "${YELLOW}⚙️ 生成新的 portal.config.yaml 集中配置文件...${NC}"
    cp "$PORTAL_DIR/portal.config.example.yaml" "$PORTAL_DIR/portal.config.yaml"
    echo -e "${GREEN}✓ portal.config.yaml 初始化就绪 (可随时 nano 编辑)${NC}"
else
    echo -e "${GREEN}✓ 已检测到现存 portal.config.yaml，保留原配置${NC}"
fi

# 确保运行时数据目录权限正常
mkdir -p "$PORTAL_DIR/server/data"
# Create dedicated service user (if not exists)
id -u dnpeering &>/dev/null || useradd -r -s /bin/false -d "$PORTAL_DIR" dnpeering
chown -R dnpeering:dnpeering "$PORTAL_DIR/server/data"
chmod 700 "$PORTAL_DIR/server/data"

# 7. 配置 systemd 守护进程
echo -e "${CYAN}🚀 [6/7] 配置 systemd 服务 (${SERVICE_NAME})...${NC}"
cat <<EOF > /etc/systemd/system/${SERVICE_NAME}.service
[Unit]
Description=AkiLab DN42 Peering Portal & Looking Glass Hub
After=network.target network-online.target bird.service
Wants=network-online.target

[Service]
Type=simple
User=dnpeering
Group=dnpeering
WorkingDirectory=${PORTAL_DIR}
ExecStart=${NODE_BIN} server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now ${SERVICE_NAME} >/dev/null 2>&1
echo -e "${GREEN}✓ systemd 服务已注册并启动！${NC}"

# 安装 CLI 极速快捷指令 (dnp 与 portal)
chmod +x "$PORTAL_DIR/scripts/portal-cli.sh"
ln -sf "$PORTAL_DIR/scripts/portal-cli.sh" /usr/local/bin/dnp
ln -sf "$PORTAL_DIR/scripts/portal-cli.sh" /usr/local/bin/portal
echo -e "${GREEN}✓ 极速快捷指令 'dnp' 与 'portal' 已安装至 /usr/local/bin/${NC}"

# 8. 健康自检
echo -e "${CYAN}🏥 [7/7] 执行服务健康自检...${NC}"
sleep 2

if curl -s -f "http://127.0.0.1:${DEFAULT_PORT}/health" >/dev/null 2>&1; then
    echo -e "${GREEN}✓ 状态健康：服务正在监听 127.0.0.1:${DEFAULT_PORT}${NC}"
else
    echo -e "${YELLOW}⚠️ 服务已启动，但在首轮探测中尚未返回 200，请稍后检查 journalctl 日志。${NC}"
fi

echo ""
echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN} 🎉 DN42 Peering Portal 部署/升级完成！${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo ""
echo -e "📍 ${CYAN}项目主目录:${NC}  ${PORTAL_DIR}"
echo -e "⚙️ ${CYAN}统一配置文件:${NC} ${PORTAL_DIR}/portal.config.yaml"
echo -e "🔑 ${CYAN}密钥与环境:${NC}   ${PORTAL_DIR}/.env"
echo ""
echo -e "${YELLOW}⚡ 极速快捷指令 (只需敲这几个字母):${NC}"
echo -e "  • ${GREEN}dnp c${NC}  (config)   - 编辑节点与 ASN 统一配置 (修改保存即全站生效)"
echo -e "  • ${GREEN}dnp l${NC}  (logs)     - 查看实时滚动日志 (实时看谁在查 LG、谁在申请 Peer)"
echo -e "  • ${GREEN}dnp s${NC}  (status)   - 查看服务运行状态与内存开销"
echo -e "  • ${GREEN}dnp r${NC}  (restart)  - 重启门户服务"
echo -e "  • ${GREEN}dnp u${NC}  (update)   - 一键拉取 GitHub 最新版本并热升级"
echo -e "  • ${GREEN}dnp e${NC}  (env)      - 编辑 .env 密钥与 Telegram Token"
echo ""
echo -e "${YELLOW}🌐 Caddy 反向代理配置建议 (/etc/caddy/Caddyfile):${NC}"
echo -e "${CYAN}------------------------------------------------------------------${NC}"
echo -e "  dn42.yourdomain.com {"
echo -e "      reverse_proxy 127.0.0.1:${DEFAULT_PORT}"
echo -e "  }"
echo -e "${CYAN}------------------------------------------------------------------${NC}"
echo -e "  配置完成后执行: ${PURPLE}systemctl reload caddy${NC} 即可全自动启用 HTTPS！"
echo ""
