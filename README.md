# 🌐 DN42 Peering Portal (现代高颜值自治系统门户)

一个专为 DN42 自治系统爱好者打造的**现代化、高交互性、全要素集成**的 Peer 互联门户网站。

---

## ✨ 核心特性

- 🛰 **Cyber 遥测仪表盘视觉**：深空暗黑主题 (`#06080d`)、磨砂玻璃拟态、微网格流光动效、全响应式排版。
- 🌍 **全球 PoP 节点交互式地图**：基于 Leaflet 定制暗黑瓦片，动态打点并绘制 PoP 节点间的虚拟 iBGP 骨干链路，支持点击 Marker 联动高亮卡片。
- 📋 **全要素节点卡片与表格视图**：参数独立代码框，全要素支持**一键复制**，支持按区域（亚太、北美、欧洲）与关键词快速检索。
- ⚡ **交互式 BGP / WireGuard 配置生成器**：访客输入其 ASN、公钥、Endpoint，页面**实时生成对应的 `wg.conf` 与 `bird.conf` (Bird 2/3 / FRR)**，并一键打包申请邮件/Telegram 文本。
- 🧮 **确定性端口计算器**：分段数学公式展示与实时输入计算小部件，输入 ASN 自动算出分配端口。
- 🛡 **BGP 团体属性 (Communities) 查询系统**：清晰分类展示 Export 控制、AS-Prepend 与 Local-Preference 动作。
- 📬 **联络渠道矩阵**：按响应时效分类排序，附带互联前自查规范清单。

---

## 🛠 本地开发与修改

### 1. 修改你的自治系统数据
所有网络数据均集中在单一配置文件中，修改即可全局同步更新：
👉 **[`src/data/network.ts`](./src/data/network.ts)**

```typescript
export const NETWORK_META: NetworkMeta = {
  asn: 'AS4242421337', // 改为你的 ASN
  maintainer: 'YOUR-MNT',
  ipv4Pool: '172.22.xx.xx/28',
  ipv6Pool: 'fdxx:xxxx:xxxx::/48',
  // ...
};

export const NETWORK_NODES: NodeInfo[] = [
  // 在此处增删修改你的 PoP 节点
];
```

### 2. 启动本地开发服务
```bash
npm install
npm run dev
```
访问浏览器控制台给出的 `http://localhost:5173` 即可实时预览修改。

### 3. 构建生产包
```bash
npm run build
```
编译产物位于 `dist/` 目录中。

---

## 🚀 部署到 4C4G 服务器

### 方案 A：Docker Compose 一键部署（推荐）
在服务器上拉取项目目录并运行：
```bash
docker compose up -d --build
```
服务将在 `http://你的服务器IP:8080` 上运行。你可以配合 Nginx 反代绑定域名或 HTTPS 证书。

### 方案 B：直接托管静态文件（Nginx / Caddy）
只需将 `dist/` 目录中的文件拷贝至服务器目录（如 `/var/www/dn42-portal`），并配置 Nginx：
```nginx
server {
    listen 80;
    server_name dn42.yourdomain.com;
    root /var/www/dn42-portal;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
