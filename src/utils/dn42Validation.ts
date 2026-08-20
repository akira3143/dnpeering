/**
 * DN42 规范校验与冲突排查工具集 (遵循 DN42 官方 Wiki & RFC 规范)
 * 涵盖：ASN 格式、WireGuard 44位 Base64 公钥、IPv6 LLA 链路本地地址范围、
 * IPv6 ULA (RFC 4193 fd00::/8) 范围、DN42 IPv4 (172.20.0.0/14) 范围及 ENH 模式冲突校验。
 */

export interface ValidationItem {
  isValid: boolean;
  status: 'valid' | 'warning' | 'error' | 'empty';
  message?: string;
}

/**
 * 1. 校验 DN42 自治系统号 (ASN)
 * 官方标准：32位 ASN 主体区间为 AS4242420000 ~ AS4242429999 (即 424242xxxx)
 * 兼容私有区间：64512 ~ 65534 (16-bit)
 */
export function validateDn42Asn(rawAsn: string): ValidationItem {
  if (!rawAsn || !rawAsn.trim()) {
    return { isValid: true, status: 'empty' };
  }

  const cleanNum = parseInt(rawAsn.replace(/\D/g, ''), 10);
  if (isNaN(cleanNum) || cleanNum <= 0) {
    return { isValid: false, status: 'error', message: 'ASN 必须为有效正整数' };
  }

  // DN42 主流 32-bit ASN 区间 (4242420000 ~ 4242429999)
  if (cleanNum >= 4242420000 && cleanNum <= 4242429999) {
    return { isValid: true, status: 'valid' };
  }

  // 16-bit 私有/历史 ASN (64512 ~ 65534)
  if (cleanNum >= 64512 && cleanNum <= 65534) {
    return { isValid: true, status: 'valid', message: '16-bit 私有 ASN 模式' };
  }

  // 其它扩展互联自治系统 (如 NeoNetwork 424240xxxx 等)
  if (cleanNum >= 4200000000 && cleanNum <= 4294967295) {
    return { isValid: true, status: 'valid', message: '扩展实验网 ASN' };
  }

  return {
    isValid: false,
    status: 'warning',
    message: '非典型 DN42 ASN（标准格式通常为 AS424242xxxx）',
  };
}

/**
 * 2. 校验 WireGuard 公钥 (Curve25519)
 * 官方标准：32 字节 Base64 编码，长度恒为 44 字符，以 '=' 结尾。
 */
export function validateWgPublicKey(rawKey: string): ValidationItem {
  if (!rawKey || !rawKey.trim()) {
    return { isValid: true, status: 'empty' };
  }

  const trimmed = rawKey.trim();
  const base64Regex = /^[A-Za-z0-9+/]{43}=$/;

  if (base64Regex.test(trimmed)) {
    return { isValid: true, status: 'valid' };
  }

  if (trimmed.length !== 44) {
    return {
      isValid: false,
      status: 'error',
      message: `公钥长度应为 44 字符（当前 ${trimmed.length} 字符）`,
    };
  }

  return {
    isValid: false,
    status: 'error',
    message: '公钥格式无效（必须为有效 Base64 格式并以 = 结尾）',
  };
}

/**
 * 3. 校验 IPv6 Link-Local Address (LLA)
 * 官方标准：必须在 fe80::/10 范围内（即以 fe80: 开头）
 * 关键防呆：若用户误填了 ULA (fdxx:) 或公网 IPv6 (2001:)，需提示并引导。
 */
export function validateIpv6LLA(rawLLA: string): ValidationItem {
  if (!rawLLA || !rawLLA.trim()) {
    return { isValid: true, status: 'empty' };
  }

  const clean = rawLLA.trim().toLowerCase();

  // 误将 ULA (fdxx:) 填入 LLA
  if (clean.startsWith('fd')) {
    return {
      isValid: false,
      status: 'error',
      message: '这是 ULA 地址（fd 开头），LLA 必须为链路本地地址（fe80:: 开头）',
    };
  }

  // 误将公网 IPv6 填入 LLA
  if (clean.startsWith('2') || clean.startsWith('3')) {
    return {
      isValid: false,
      status: 'error',
      message: '这是公网 IPv6 地址，LLA 必须为 fe80:: 开头的链路本地地址',
    };
  }

  // 正确以 fe80: 开头
  if (/^fe80:[0-9a-f:]+$/i.test(clean)) {
    return { isValid: true, status: 'valid' };
  }

  return {
    isValid: false,
    status: 'error',
    message: '无效的 IPv6 LLA 格式（示例：fe80::xxxx 或 fe80::9998）',
  };
}

/**
 * 4. 校验 IPv6 Unique Local Address (ULA) (可选)
 * 官方标准：RFC 4193 fd00::/8，DN42 核心地址池均为 fd 开头 (/48)
 */
export function validateIpv6ULA(rawULA: string): ValidationItem {
  if (!rawULA || !rawULA.trim()) {
    return { isValid: true, status: 'empty' };
  }

  const clean = rawULA.trim().toLowerCase();

  // 误将 LLA (fe80:) 填入 ULA
  if (clean.startsWith('fe80:')) {
    return {
      isValid: false,
      status: 'error',
      message: '这是 Link-Local 地址，ULA 必须为 fd 开头（RFC 4193）',
    };
  }

  // 正规 fd00::/8
  if (/^fd[0-9a-f]{2}:[0-9a-f:]+$/i.test(clean)) {
    return { isValid: true, status: 'valid' };
  }

  return {
    isValid: false,
    status: 'warning',
    message: '建议使用合规的 DN42 ULA 前缀（fdxx:xxxx:xxxx::x）',
  };
}

/**
 * 5. 校验 IPv4 隧道内点对点地址 (可选)
 * 官方标准：DN42 IPv4 官方分配区间为 172.20.0.0/14 (即 172.20.0.0 ~ 172.23.255.255)
 * 冲突规避：
 * - 严禁使用公网 IP 或 192.168.x.x
 * - 在 MP-BGP (ENH) 模式下无需分配 IPv4 隧道地址，直接通过 IPv6 LLA 交换 v4 路由，零地址消耗且绝对避免冲突！
 */
export function validateDn42Ipv4(rawIpv4: string, isEnhMode: boolean): ValidationItem {
  if (!rawIpv4 || !rawIpv4.trim()) {
    return { isValid: true, status: 'empty' };
  }

  const clean = rawIpv4.trim();
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = clean.match(ipv4Regex);

  if (!match) {
    return { isValid: false, status: 'error', message: '无效的 IPv4 地址格式' };
  }

  const octets = match.slice(1, 5).map((o) => parseInt(o, 10));
  if (octets.some((o) => o < 0 || o > 255)) {
    return { isValid: false, status: 'error', message: 'IPv4 单字节取值需在 0~255 之间' };
  }

  const [o1, o2] = octets;

  // DN42 核心地址池: 172.20.0.0/14 (172.20.x.x ~ 172.23.x.x)
  if (o1 === 172 && o2 >= 20 && o2 <= 23) {
    return { isValid: true, status: 'valid' };
  }

  // 扩展试验网 (如 NeoNetwork 10.127.0.0/16 等)
  if (o1 === 10) {
    return { isValid: true, status: 'valid', message: '使用 10.x.x.x 扩展网段' };
  }

  // 误填公网 IP 或家庭内网 IP
  if (o1 === 192 && o2 === 168) {
    return {
      isValid: false,
      status: 'error',
      message: '192.168.x.x 为本地局域网私有网段，严禁用于 DN42 路由互联',
    };
  }

  if (isEnhMode) {
    return {
      isValid: true,
      status: 'warning',
      message: '在 MP-BGP (ENH) 模式下推荐留空此项，直接使用 IPv6 LLA 传输 v4 路由',
    };
  }

  return {
    isValid: false,
    status: 'warning',
    message: '该 IPv4 地址不在 DN42 核心池（172.20.0.0/14）内',
  };
}

/**
 * 6. 校验公网 Endpoint 格式
 * 自动拦截误带 http:// 或端口号的输入
 */
export function validateEndpointHost(rawEndpoint: string): ValidationItem {
  if (!rawEndpoint || !rawEndpoint.trim()) {
    return { isValid: true, status: 'empty' };
  }

  const clean = rawEndpoint.trim();

  if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('wg://')) {
    return {
      isValid: false,
      status: 'warning',
      message: '无需填写 http:// 或协议前缀，仅需域名或公网 IP',
    };
  }

  if (clean.includes(':') && !clean.includes('::')) {
    // 包含单冒号（可能是带了端口）
    return {
      isValid: true,
      status: 'warning',
      message: '右侧端口已自动锁定分配，无需重复输入端口',
    };
  }

  return { isValid: true, status: 'valid' };
}
