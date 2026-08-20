# dn42-peering-portal

Personal DN42 peering management page and Looking Glass diagnostic tool.

---

### 简介

个人自用的 DN42 自动化对等互联与网络探测面板，主要功能包含：
- 节点配置与 WireGuard / BIRD 配置文件生成
- 基于 bird-lg-go 协议的 BGP 路由查询与连通性测试 (Ping / Traceroute)
- 基于 DN42 Registry 的 SSH Key / OTP 鉴权与会话管理
- Telegram 申请审核与状态通知

---

### 快速开始

#### 1. 安装与构建
```bash
# 安装依赖
npm install

# 生产构建
npm run build

# 启动服务 (默认端口 3143)
npm start
```

#### 2. 环境配置 (`.env`)
复制 `.env.example` 并按需填写：
```bash
cp .env.example .env
```

核心配置项：
- `PORT`: 服务端口（默认 3143）
- `AUTH_JWT_SECRET`: 登录凭证加密密钥
- `ADMIN_PASSWORD_HASH` / `ADMIN_PASSWORD_SALT`: 管理员密码 hash
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`: 通知推送配置
- `LG_NODE_ENDPOINTS`: Looking Glass 探针地址映射（如 `{"jp07":"http://127.0.0.1:5000"}`）

---

### 探针部署 (bird-lgproxy)

在路由节点上运行探针脚本：

```bash
# 交互式向导安装
sudo bash scripts/install-probe.sh

# 或指定参数
sudo bash scripts/install-probe.sh -l 127.0.0.1:5000
```

---

### License

MIT
