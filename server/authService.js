import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import './env.js';
import { getAsnIdentity } from './registrySync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// JWT / Secret configuration
function getJwtSecret() {
  return process.env.AUTH_JWT_SECRET || 'dev-insecure-secret-placeholder-please-set-auth-jwt-secret';
}
const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In-Memory challenge store
const activeChallenges = new Map();
const activeEmailOtps = new Map();

// Periodic cleanup of expired challenges and OTPs (every 60 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of activeChallenges) {
    if (now > val.expiresAt) activeChallenges.delete(key);
  }
  for (const [key, val] of activeEmailOtps) {
    if (now > val.expiresAt) activeEmailOtps.delete(key);
  }
}, 60 * 1000);

/**
 * Creates a lightweight HMAC SHA-256 JWT Token with configurable TTL
 * @param {Object} payload
 * @param {number} expiresInSeconds - Default 2400 (40 mins fallback), rememberMe: 172800 (48 hours)
 */
function signJwt(payload, expiresInSeconds = 2400) {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const signature = crypto.createHmac('sha256', getJwtSecret()).update(`${header}.${body}`).digest('base64url');
  return {
    token: `${header}.${body}.${signature}`,
    expiresAt: exp * 1000,
    expiresIn: expiresInSeconds,
  };
}

/**
 * Verifies and decodes JWT Token
 */
export function verifyJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;

  const expectedSig = crypto.createHmac('sha256', getJwtSecret()).update(`${header}.${body}`).digest('base64url');
  if (expectedSig.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signature))) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Masks an email for privacy, e.g. admin@akira.moe -> ad***@akira.moe
 */
function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [user, domain] = email.split('@');
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}***@${domain}`;
}

/**
 * Generates an SSH challenge for the specified ASN
 * @param {string|number} asn 
 * @returns {Promise<{success: boolean, challenge?: Object, error?: string}>}
 */
export async function createAuthChallenge(asn) {
  const cleanAsn = String(asn || '').replace(/\D/g, '');
  if (!cleanAsn) {
    return { success: false, error: '请输入有效的 ASN 号码' };
  }

  const identity = await getAsnIdentity(cleanAsn);
  if (!identity || !identity.valid) {
    return { success: false, error: `未能从 DN42 Registry 查询到 AS${cleanAsn}` };
  }

  const nonce = crypto.randomBytes(8).toString('hex');
  const challengeText = `akilab:${cleanAsn}:${nonce}`;

  activeChallenges.set(cleanAsn, {
    challengeText,
    cleanAsn,
    identity,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });

  const unixCommand = `printf '%s' "${challengeText}" > /tmp/m && ssh-keygen -Y sign -n akilab -f ~/.ssh/id_ed25519 /tmp/m && cat /tmp/m.sig`;
  const powershellCommand = `rm $env:TEMP\\m.sig -ea 0; '${challengeText}' | Out-File $env:TEMP\\m -NoNewline -Encoding ascii; ssh-keygen -Y sign -n akilab -f $HOME\\.ssh\\id_ed25519 $env:TEMP\\m; gc $env:TEMP\\m.sig | Set-Clipboard; gc $env:TEMP\\m.sig`;

  return {
    success: true,
    challenge: {
      asn: `AS${cleanAsn}`,
      cleanAsn,
      asName: identity.asName,
      maintainer: identity.maintainer,
      challengeText,
      sshKeysCount: identity.sshKeys?.length || 0,
      maskedEmails: (identity.emails || []).map(maskEmail),
      hasSshKeys: (identity.sshKeys && identity.sshKeys.length > 0),
      hasEmails: (identity.emails && identity.emails.length > 0),
      unixCommand,
      powershellCommand,
    },
  };
}

/**
 * Verifies SSH signature submitted by user
 * @param {string|number} asn 
 * @param {string} signatureText 
 * @returns {Promise<{success: boolean, token?: string, user?: Object, error?: string}>}
 */
export async function verifySshSignature(asn, rawSig, rememberMe = false) {
  const cleanAsn = String(asn || '').replace(/\D/g, '');
  if (!cleanAsn) {
    return { success: false, error: '请输入有效的 ASN 号码' };
  }

  const challengeData = activeChallenges.get(cleanAsn);
  if (!challengeData) {
    return { success: false, error: '挑战信息已过期或不存在，请重新生成' };
  }

  if (Date.now() > challengeData.expiresAt) {
    activeChallenges.delete(cleanAsn);
    return { success: false, error: '挑战信息已超时，请重新生成' };
  }

  if (!rawSig) {
    return { success: false, error: '请粘贴 ssh-keygen 签名结果' };
  }

  // Regex extract the pure signature block even if terminal output was copied
  const sigMatch = rawSig.match(/-----BEGIN SSH SIGNATURE-----[\s\S]*?-----END SSH SIGNATURE-----/);
  const cleanSig = sigMatch ? sigMatch[0].trim() : rawSig;

  const { identity, challengeText } = challengeData;
  const sshKeys = identity.sshKeys || [];

  if (sshKeys.length === 0) {
    return {
      success: false,
      error: `该 ASN (${identity.maintainer || cleanAsn}) 在 DN42 Registry 中尚未登记 SSH 公钥 (auth: ssh-...)。`,
    };
  }

  // Create temporary allowed_signers and signature files for ssh-keygen -Y verify
  const tmpDir = os.tmpdir();
  const allowedSignersFile = path.join(tmpDir, `allowed_signers_${cleanAsn}_${Date.now()}`);
  const sigFile = path.join(tmpDir, `sig_${cleanAsn}_${Date.now()}.sig`);

  try {
    const cleanKeys = sshKeys.map(k => k.replace(/^auth:\s*/i, '').trim());
    const allowedSignersContent = cleanKeys
      .map(k => `${cleanAsn},AS${cleanAsn} namespaces="akilab" ${k}`)
      .join('\n');
    fs.writeFileSync(allowedSignersFile, allowedSignersContent, 'utf-8');

    let formattedSig = cleanSig;
    if (!formattedSig.includes('-----BEGIN SSH SIGNATURE-----')) {
      formattedSig = `-----BEGIN SSH SIGNATURE-----\n${cleanSig}\n-----END SSH SIGNATURE-----`;
    }
    fs.writeFileSync(sigFile, formattedSig, 'utf-8');

    const verifySuccess = await new Promise((resolve) => {
      const child = execFile(
        'ssh-keygen',
        ['-Y', 'verify', '-n', 'akilab', '-f', allowedSignersFile, '-I', cleanAsn, '-s', sigFile],
        (error, stdout, stderr) => {
          if (error) {
            console.warn('ssh-keygen verify error:', stderr || error.message);
            resolve(false);
          } else {
            console.log('ssh-keygen verify success:', stdout);
            resolve(true);
          }
        }
      );

      if (child.stdin) {
        child.stdin.write(challengeText);
        child.stdin.end();
      }
    });

    try { fs.unlinkSync(allowedSignersFile); } catch {}
    try { fs.unlinkSync(sigFile); } catch {}

    if (!verifySuccess) {
      return {
        success: false,
        error: 'SSH 签名校验失败。请确认使用的是在 DN42 Registry 登记的对应 SSH 私钥。',
      };
    }

    // Verification Success!
    activeChallenges.delete(cleanAsn);

    // TTL: 48h if rememberMe, 40m if temporary session
    const ttlSeconds = rememberMe ? 48 * 3600 : 40 * 60;

    const userPayload = {
      asn: `AS${cleanAsn}`,
      cleanAsn,
      asName: identity.asName,
      maintainer: identity.maintainer,
      authMethod: 'ssh_signature',
      verifiedAt: new Date().toISOString(),
    };

    const { token, expiresAt, expiresIn } = signJwt(userPayload, ttlSeconds);
    const user = { ...userPayload, expiresAt };

    return {
      success: true,
      token,
      user,
      expiresAt,
      expiresIn,
      hasPassword: checkAsnHasPassword(cleanAsn),
    };
  } catch (err) {
    return {
      success: false,
      error: `验签过程异常: ${err.message}`,
    };
  }
}

// ----------------------------------------------------
// Password-Based Authentication & Credential Storage
// ----------------------------------------------------
const CREDENTIALS_FILE = path.join(__dirname, 'data', 'user_credentials.json');

function loadCredentials() {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.warn('Error reading user_credentials.json:', err);
  }
  return {};
}

function saveCredentials(data) {
  try {
    const dir = path.dirname(CREDENTIALS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving user_credentials.json:', err);
  }
}

/**
 * Checks if an ASN has a password set
 */
export function checkAsnHasPassword(asn) {
  const cleanAsn = String(asn || '').replace(/\D/g, '');
  const creds = loadCredentials();
  return Boolean(creds[cleanAsn] && creds[cleanAsn].hash && creds[cleanAsn].salt);
}

/**
 * Queries overall auth profile for an ASN
 */
export async function getAsnAuthStatus(asn) {
  const cleanAsn = String(asn || '').replace(/\D/g, '');
  if (!cleanAsn) return { success: false, error: 'ASN 不能为空' };

  const identity = await getAsnIdentity(cleanAsn);
  const hasPassword = checkAsnHasPassword(cleanAsn);

  return {
    success: true,
    asn: `AS${cleanAsn}`,
    cleanAsn,
    asName: identity?.asName || `AS${cleanAsn}`,
    maintainer: identity?.maintainer || 'N/A',
    hasPassword,
    hasSshKeys: Boolean(identity?.sshKeys && identity.sshKeys.length > 0),
  };
}

/**
 * Sets or resets password for an ASN
 */
export async function setPasswordForAsn(asn, newPassword) {
  const cleanAsn = String(asn || '').replace(/\D/g, '');
  if (!cleanAsn) return { success: false, error: 'ASN 不能为空' };

  const pwd = String(newPassword || '').trim();
  if (pwd.length < 8) {
    return { success: false, error: '密码长度至少需 8 位字符' };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pwd, salt, 64).toString('hex');

  const creds = loadCredentials();
  creds[cleanAsn] = {
    asn: `AS${cleanAsn}`,
    salt,
    hash,
    updatedAt: new Date().toISOString(),
  };

  saveCredentials(creds);

  return {
    success: true,
    message: '密码设置成功，后续可直接使用 ASN + 密码快速登入！',
  };
}

/**
 * Verifies password and logs in user
 */
export async function verifyPasswordLogin(userInput, password, rememberMe = false) {
  const rawInput = String(userInput || '').trim();
  if (!rawInput) return { success: false, error: '请输入有效的 ASN 或用户名' };

  // 1. Root Administrator Master Account (env-based)
  const normalized = rawInput.toLowerCase().replace(/^as/, '');
  if (normalized === 'akira' || rawInput.toLowerCase() === 'akira' || normalized === 'admin') {
    const adminHash = process.env.ADMIN_PASSWORD_HASH;
    const adminSalt = process.env.ADMIN_PASSWORD_SALT;
    if (!adminHash || !adminSalt) {
      return { success: false, error: '管理员账户未配置（缺少 ADMIN_PASSWORD_HASH/SALT 环境变量）' };
    }
    const inputHash = crypto.scryptSync(String(password || ''), adminSalt, 64).toString('hex');
    if (!crypto.timingSafeEqual(Buffer.from(inputHash, 'hex'), Buffer.from(adminHash, 'hex'))) {
      return { success: false, error: '管理员密码错误，请核对后重试。' };
    }
    const ttlSeconds = rememberMe ? 48 * 3600 : 40 * 60;
    const userPayload = {
      asn: 'akira',
      cleanAsn: '4343439696',
      username: 'akira',
      displayName: 'akira',
      asName: 'AkiLab Network Ops (Root Admin)',
      maintainer: 'AKIRA-MNT (Admin)',
      role: 'admin',
      isAdmin: true,
      isSuperAdmin: true,
      authMethod: 'admin_master_key',
      verifiedAt: new Date().toISOString(),
    };
    const { token, expiresAt, expiresIn } = signJwt(userPayload, ttlSeconds);
    return {
      success: true,
      token,
      user: { ...userPayload, expiresAt },
      expiresAt,
      expiresIn,
    };
  }

  // 2. Standard ASN Password Verification
  const cleanAsn = rawInput.replace(/\D/g, '');
  if (!cleanAsn) return { success: false, error: '请输入有效的 ASN 号码' };

  const creds = loadCredentials();
  const record = creds[cleanAsn];

  if (!record || !record.salt || !record.hash) {
    return {
      success: false,
      error: '该 ASN 尚未设置登录密码，请先通过 SSH 签名认证进行首次设密。',
    };
  }

  const inputHash = crypto.scryptSync(String(password || ''), record.salt, 64).toString('hex');

  if (!crypto.timingSafeEqual(Buffer.from(inputHash, 'hex'), Buffer.from(record.hash, 'hex'))) {
    return {
      success: false,
      error: '登录密码错误，请核对后重试（如遗忘可通过 SSH 签名重新覆盖重置）。',
    };
  }

  const identity = await getAsnIdentity(cleanAsn);
  const ttlSeconds = rememberMe ? 48 * 3600 : 40 * 60;

  const userPayload = {
    asn: `AS${cleanAsn}`,
    cleanAsn,
    asName: identity?.asName || `AS${cleanAsn}`,
    maintainer: identity?.maintainer || 'N/A',
    role: 'user',
    isAdmin: false,
    authMethod: 'password',
    verifiedAt: new Date().toISOString(),
  };

  const { token, expiresAt, expiresIn } = signJwt(userPayload, ttlSeconds);
  const user = { ...userPayload, expiresAt };

  return {
    success: true,
    token,
    user,
    expiresAt,
    expiresIn,
  };
}

/**
 * Requests Email OTP fallback for ASN (kept for future private mail server)
 */
export async function requestEmailOtp(asn) {
  const cleanAsn = String(asn || '').replace(/\D/g, '');
  const identity = await getAsnIdentity(cleanAsn);

  if (!identity || !identity.emails || identity.emails.length === 0) {
    return { success: false, error: '该 ASN 在 Registry 中未登记联系邮箱' };
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  activeEmailOtps.set(cleanAsn, {
    otp,
    identity,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  return {
    success: true,
    maskedEmail: maskEmail(identity.emails[0]),
    message: `验证码已发送至 ${maskEmail(identity.emails[0])}`,
  };
}

/**
 * Verifies Email OTP
 */
export async function verifyEmailOtp(asn, inputOtp) {
  const cleanAsn = String(asn || '').replace(/\D/g, '');
  const record = activeEmailOtps.get(cleanAsn);

  if (!record || Date.now() > record.expiresAt) {
    return { success: false, error: '验证码已过期或不存在，请重新获取' };
  }

  if (String(inputOtp).trim() !== String(record.otp).trim()) {
    return { success: false, error: '验证码错误，请重新输入' };
  }

  activeEmailOtps.delete(cleanAsn);

  const user = {
    asn: `AS${cleanAsn}`,
    cleanAsn,
    asName: record.identity.asName,
    maintainer: record.identity.maintainer,
    authMethod: 'email_otp',
    verifiedAt: new Date().toISOString(),
  };

  const token = signJwt(user);

  return {
    success: true,
    token,
    user,
  };
}
