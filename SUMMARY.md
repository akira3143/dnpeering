# 📋 dnpeering 项目全量更新、Looking Glass 集成细节与审查总结报告

> **项目主页**: [https://github.com/akira3143/dnpeering](https://github.com/akira3143/dnpeering)  
> **生成时间**: 2026-08-21  
> **核心定位**: 个人 DN42 自动化对等互联中枢、BGP Looking Glass 透视与分布式端口管控平台

---

## 🌟 一、统一集中配置中心与零编译热重载系统

### 1. 核心改进
* **唯一维护入口**：创建 [`portal.config.example.yaml`](portal.config.example.yaml)，将全站 ASN 信息、全球 PoP 节点列表（公钥/IP/Endpoint/MTU）、Looking Glass 探针映射、Telegram 凭证与联络方式彻底收敛到单文件；
* **免编译热重载引擎**：编写 [`server/configLoader.js`](server/configLoader.js)，基于文件监听器在 **200ms 内瞬间热重载内存配置**，彻底告别 `npm run build` 和 Node.js 重启；
* **全站动态响应式渲染**：新建 [`src/context/NetworkContext.tsx`](src/context/NetworkContext.tsx)，前台导航栏、节点卡片、配置生成器、Looking Glass 节点切换列表、端口计算器全面支持动态刷新。

---

## 🦅 二、Looking Glass 深度集成与 BIRD 2 协议栈开发细节

### 1. 协议集成架构与通信链路
我们摈弃了传统 Looking Glass 割裂的外部 iframe 或独立二级域名方案，实现了**原生全栈 Cyberpunk 终端一体化集成**：

```
[前端 React 终端控制台]
       │ (REST / JSON 协议交互: POST /api/looking-glass/query)
       ▼
[主站 Node.js 后端网关 (server/lookingGlassService.js)]
       │
       ├── 本地节点 (JP07): 直接通信 /var/run/bird/bird.ctl (Unix Domain Socket)
       │
       └── 远端 PoP 节点 (US01, DE02): HTTP REST 通信 bird-lgproxy 探针 (端口 5000)
              │
              ▼
       [BIRD 2 路由守护进程 / Linux 内核协议栈]
```

### 2. 支持的 7 大核心诊断命令与输出解析
* **`route` (BGP 路由透视)**：执行 `show route for <target> all`，实时解析 AS-Path、Local Preference、BGP Communities（如标准 DN42 延迟/地域属性）、NextHop 及多路径选路结果；
* **`protocols` (BGP 会话状态机)**：执行 `show protocols all <peer>`，实时提取会话状态（`Established` / `Connect` / `Active` / `Idle`）、收发路由计数器（Imported / Exported）、会话持续运行时间（Uptime）；
* **`ping` (ICMP 连通性测试)**：执行底层多包探测，统计最小/平均/最大往返延迟（RTT min/avg/max/mdev）与丢包率；
* **`traceroute` (多跳路径探测)**：跟踪跨自治系统（AS）的数据包逐跳转发路径；
* **`status` (BIRD 引擎状态)**：显示 BIRD 守护进程版本、Router ID、系统内存分配与各路由表汇总；
* **`memory`**：展示 BIRD 内部内存池（Memory Pools）占用；
* **`symbols`**：提取 BIRD 内部协议符号与过滤器列表。

### 3. 5 阶段智能会话健康诊断引擎 (5-Stage Smart Diagnosis)
在用户互联管理面板中，系统自动将底层 BGP 状态机翻译为直观的 **5 阶段诊断指示灯与排错指引**：
1. **Stage 1 (WireGuard 链路握手)**：判断底层 UDP 隧道是否成功握手；
2. **Stage 2 (BGP Connect / Active)**：判断 TCP 179 端口握手与 BGP 对等状态；
3. **Stage 3 (OpenConfirm / Established)**：判断 BGP 能力协商（Capability Negotiation）与 ASN 认证是否成功；
4. **Stage 4 (Route Exchange 路由交换)**：判断双方是否已开始正常交换路由（Imported / Exported Routes > 0）；
5. **Stage 5 (ROA & Policy Validation)**：结合 DN42 Registry 校验路由广播前缀的 ROA 签名有效性。

### 4. 严苛的安全防注入防护 (Security & Anti-Injection)
* **命令白名单机制**：输入严格限制在合法命令字典内；
* **正则级参数洗练器**：对用户输入的 IP、IPv6、CIDR 前缀、ASN 编号和协议名实施严格的字符白名单过滤；
* **命令分隔符强拦截**：全面剥离并拒绝包含 `;`, `|`, `&`, `` ` ``, `$()`, `\n` 等可能导致 Shell 逃逸与 RCE 注入的危险字符。

### 5. 优雅降级与开发仿真引擎 (Dev Simulation & Fallback)
* 当处于本地开发环境（无 BIRD 守护进程）或远端探针发生网络离线时，系统会自动平滑降级为内置的**高保真 BIRD 仿真引擎**；
* 仿真引擎能够输出标准真实的 BIRD 路由格式、AS-Path 与 Ping 统计，保证前后端联调与单元测试 100% 可用。

---

## 🔌 三、多节点分布式端口生命周期与自动发现引擎

### 1. 状态流转机制
| 端口状态 | 标识类型 (`type`) | 触发时机 | 业务影响 |
| :--- | :--- | :--- | :--- |
| **`[🔒 已锁定/申请中]`** | `locked` | 用户点击「提交申请」瞬间 | 端口立即锁定，其他访客不可再选 |
| **`[🟢 已使用/活跃]`** | `in_use` | 管理员批准 / 建立 BGP 会话 | 转换为正式运行态，永久保留 |
| **`[🟢 既有已存端口]`** | `in_use` | 部署初次启动基线扫描 | 自动继承服务器原本运行的老 Peer |
| **释放** | *(自动清理)* | 申请被拒绝 / 会话删除 / 7天未连通 | 端口自动归还给后续申请者 |

### 2. 核心代码改进
* **系统级 WireGuard 基线扫描**：[`server/portScanner.js`](server/portScanner.js) 在启动时单次静默扫描 Linux 内核 `wg show all listen-port` 与 `/etc/wireguard/*.conf`，自动导入已有老端口；
* **规范化存储格式**：`port_ledger.json` 统一格式化为 `服务器或wg隧道名 + 端口号`（如 `wg-peer-4242421234 : 21234`）；
* **智能碰撞避让算法**：相同尾号的 ASN 申请冲突时，服务端自动递增（`21234 ➔ 31234 ➔ 41234`）分配，彻底消灭写入竞争；
* **分布式探针上报与自动修剪**：
  * 主站新增 `POST /api/probe/report-ports` 接口；
  * 远端 PoP（如 `US-01`、`DE-02`）每 10 分钟自动快照上报；
  * 若远端 VPS 物理删除了某条 WireGuard 隧道，主站收到快照后自动 Prune 清除该陈旧端口。

---

## ⏳ 四、7 天未连通僵尸会话自动回收机制

* **超时自动清理引擎**：[`server/sessionManager.js`](server/sessionManager.js) 内置 `cleanupExpiredUnconnectedSessions` 算法；
* **判定标准**：任何提交后超过 7 天未建立 BGP 连接（仍为 `pending_review` 或未连通）的会话，判定为弃坑/僵尸申请；
* **触发机制**：服务端每次启动自检 + 后台每 6 小时自动巡检，彻底删除过期会话并归还释放被锁定的端口资源；
* **命令行指令**：支持通过 `dnp clean` 随时手动触发清理。

---

## 🚀 五、一键部署、升级与干净卸载运维套件

### 1. 远程极速安装命令
* **主站门户一键部署 (Portal Hub)**：
  ```bash
  curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/install-portal.sh | sudo bash
  ```
* **边缘 PoP 节点探针部署 (Probe Agent)**：
  ```bash
  # 交互式向导安装 (支持配置端口自动上报主站)
  curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/install-probe.sh | sudo bash

  # 静默快速安装 (远端 PoP 模式):
  curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/install-probe.sh | sudo bash -s -- \
    --listen 0.0.0.0:5000 \
    --core-url https://dn42.yourdomain.com \
    --node-id us01 \
    --token your_secret_token
  ```

### 2. 一键完全干净卸载
* **卸载向导 (自动停止 systemd、清理软链接、删除文件并自动备份配置)**：
  ```bash
  curl -sSL https://raw.githubusercontent.com/akira3143/dnpeering/main/scripts/uninstall.sh | sudo bash
  ```

---

## ⚡ 六、极速全局 CLI 指令手册 (`dnp`)

部署完成后，可在服务器任何路径下使用 `dnp` 指令进行极速运维：

| 极简命令 | 完整命令 | 功能说明 |
| :--- | :--- | :--- |
| **`dnp c`** | `dnp config` | 快速编辑统一配置 `portal.config.yaml`（保存全站即刻生效） |
| **`dnp l`** | `dnp logs` | 查看实时滚动运行日志 |
| **`dnp s`** | `dnp status` | 查看服务运行状态与内存开销 |
| **`dnp p`** | `dnp ports` | 查看已使用与已锁定端口彩色明细账本 |
| **`dnp scan`** | `dnp scan` | 重新执行一次系统 WireGuard 端口基线扫描 |
| **`dnp clean`** | `dnp clean` | 扫描并清理超过 7 天未建立会话并释放端口 |
| **`dnp r`** | `dnp restart` | 重启门户服务 |
| **`dnp u`** | `dnp update` | 一键拉取 GitHub 最新版本并热升级 |
| **`dnp e`** | `dnp env` | 快速编辑 `.env` 私密密钥与 Telegram Token |
| **`dnp rm`** | `dnp uninstall` | 启动一键完全干净卸载向导 |

---

## 🌐 七、Caddy 极简反代示例 (`/etc/caddy/Caddyfile`)

```caddyfile
dn42.yourdomain.com {
    reverse_proxy 127.0.0.1:4242
}
```
* 执行 `sudo systemctl reload caddy` 即可全自动启用 Let's Encrypt HTTPS 证书！
