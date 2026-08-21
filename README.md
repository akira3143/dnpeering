# dnpeering

Personal DN42 peering management page and Looking Glass diagnostic portal.

---

### 简介

个人自用的 DN42 自动化对等互联与 BGP 探测面板，主要功能包含：
- 节点参数展示与 WireGuard / BIRD 配置文件一键生成
- 基于 BIRD 2 Socket 与 bird-lgproxy 的 BGP 路由穿透查询、Ping 与 Traceroute
- 基于 DN42 Registry 的 SSH 签名 / 邮箱 OTP 验真与会话管理
- Telegram Bot 申请审批与状态通知
- 统一集中配置文件（`portal.config.yaml`）与 200ms 免编译热重载
- 极速 CLI 运维指令工具（`dnp`）

---

### 🚀 一键快速部署

#### 1. 主站门户部署 (Portal Hub)
在 Debian 11/12/13 或 Ubuntu 服务器上执行（自动安装 Node.js、拉取代码、编译生产包、生成私钥与注册 systemd 守护）：

```bash
curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/install-portal.sh | sudo bash
```

#### 2. 边缘 PoP 节点探针部署 (Probe Agent)
在各个路由节点服务器上执行（自动下载对应架构的 `bird-lgproxy` 二进制、寻址 BIRD socket 并注册守护进程）：

```bash
# 交互式向导安装 (支持本地模式 / 远端 PoP 模式选择)
curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/install-probe.sh | sudo bash

# 或指定参数静默安装:
# 主站同机模式:
curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/install-probe.sh | sudo bash -s -- --listen 127.0.0.1:5000

# 远端节点模式 (带安全 Token):
curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/install-probe.sh | sudo bash -s -- --listen 0.0.0.0:5000 --token your_secret_token
```

---

### ⚡ 极速 CLI 运维指令 (`dnp`)

部署完成后，可在服务器任何路径下使用 `dnp` 指令进行极速运维：

| 极简命令 | 完整命令 | 说明 |
| :--- | :--- | :--- |
| **`dnp c`** | `dnp config` | 快速编辑节点与 ASN 统一配置（保存即全站生效，无需重启） |
| **`dnp l`** | `dnp logs` | 查看实时滚动运行日志（谁在查 LG、谁在申请 Peer） |
| **`dnp s`** | `dnp status` | 查看服务运行状态与内存占用 |
| **`dnp p`** | `dnp ports` | 查看已使用与已锁定端口明细清单 |
| **`dnp r`** | `dnp restart` | 重启门户服务 |
| **`dnp u`** | `dnp update` | 从 GitHub 拉取最新版本并自动重新构建热升级 |
| **`dnp scan`** | `dnp scan` | 重新执行一次系统 WireGuard 端口基线扫描 |
| **`dnp clean`** | `dnp clean` | 扫描并清理超过 7 天未建立会话并释放端口 |
| **`dnp e`** | `dnp env` | 快速编辑 `.env` 私密密钥与 Telegram Token |
| **`dnp rm`** | `dnp uninstall` | 启动一键完全干净卸载与清理向导 |

---

### 🧹 一键干净卸载 (Uninstall)

若在测试后需要彻底卸载清理服务器（自动停用注销 systemd、清理全局命令、删除安装目录）：

```bash
# 交互式向导卸载 (支持选择卸载 Portal、探针或全部清理)
curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/uninstall.sh | sudo bash

# 或静默彻底清理所有组件与数据:
curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/uninstall.sh | sudo bash -s -- --all
```

---

### 🌐 Caddy 反向代理示例

推荐配合 Caddy 自动申请 HTTPS 证书，编辑 `/etc/caddy/Caddyfile`：

```caddyfile
dn42.yourdomain.com {
    reverse_proxy 127.0.0.1:3143
}
```

重载 Caddy 即可生效：
```bash
sudo systemctl reload caddy
```

---

### ⚙️ 统一配置维护 (`portal.config.yaml`)

全站绝大多数日常维护（增删 PoP 节点、修改公网 IP/公钥、更换联系方式）只需维护项目目录下的 **`portal.config.yaml`**：

```yaml
network:
  asn: "AS4242421337"
  network_name: "Example DN42 Network"
  maintainer: "EXAMPLE-MNT"
  ipv4_pool: "172.20.0.0/24"
  ipv6_pool: "fd00:4242:1337::/48"

nodes:
  - id: "jp07"
    code: "JP-1"
    name: "Tokyo 01 (Japan Hub)"
    flag: "🇯🇵"
    city: "Tokyo"
    endpoint: "jp1.example.dn42"
    wg_pubkey: "EXAMPLE_WG_PUBKEY_REPLACE_ME="
    ipv4: "172.20.0.1"
    ipv6_ula: "fd00:4242:1337::1"
    ipv6_lla: "fe80::1337"
    features: ["★ Core Hub", "MP-BGP", "ENH"]
    lg_proxy_url: "http://127.0.0.1:5000"

contacts:
  - platform: "Telegram"
    handle: "@example_dn42"
    link: "https://t.me/example_dn42"
    preferred: true
```

* 💡 **保存后系统自动在 200ms 内热重载，无需重新构建前端，无需重启服务。**

---

### Credits & License

- Core Portal: [MIT License](LICENSE)
- Looking Glass probe agent powered by [xddxdd/bird-lg-go](https://github.com/xddxdd/bird-lg-go) (GPL-3.0).
