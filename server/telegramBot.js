/**
 * Telegram Bot Peering Notification Service
 * Optimized for Administrator Quick Action & One-Click Deployment
 * Supports Session ID, Revision Tracking & Field Diffs
 */

import './env.js';
import { getActiveConfig } from './configLoader.js';

/**
 * Dynamically resolves Telegram bot token and chat ID
 * Supports both .env and portal.config.yaml
 */
function getTelegramConfig() {
  const config = getActiveConfig() || {};
  const botToken = config?.telegram?.bot_token || config?.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = config?.telegram?.chat_id || config?.telegram?.chatId || process.env.TELEGRAM_CHAT_ID;
  return { botToken, chatId };
}

/**
 * Escapes HTML characters for Telegram parse_mode: 'HTML'
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Formats and sends high-efficiency peering configuration directly to Telegram admin
 * @param {Object} data - Application payload
 * @param {Object} [sessionInfo] - Session metadata ({ session, isNew, diffs, previousVersion })
 * @returns {Promise<{success: boolean, messageId?: number, error?: string}>}
 */
export async function sendPeeringNotification(data, sessionInfo = {}) {
  const {
    node,
    hostPort,
    peerAsn,
    peerName,
    peerEndpoint,
    peerWgPubKey,
    peerIpv6LLA,
    peerIpv6ULA,
    peerIpv4,
    userNote,
  } = data;

  const { session, isNew = true, diffs = [] } = sessionInfo;

  const cleanAsn = String(peerAsn || '').replace(/^AS/i, '').trim();

  const { botToken, chatId } = getTelegramConfig();

  // Skip if Telegram is not configured
  if (!botToken || !chatId) {
    console.log('[Telegram] Skipping notification (bot not configured)');
    return { success: true, messageId: null };
  }
  
  // Format Name: sanitized to alphanumeric only, max 12 chars, lowercase for tunnel naming
  const rawName = String(peerName || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  const cleanTunnelName = (rawName || (cleanAsn ? `as${cleanAsn.slice(-4)}` : 'peer')).toLowerCase();
  const displayName = rawName || cleanTunnelName;

  const nodeCleanCode = (node?.code || 'node').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ifaceName = `dn42_${cleanTunnelName}_${nodeCleanCode}`;

  const sessionId = session?.id || `PEER-${nodeCleanCode.toUpperCase()}-${cleanAsn.slice(-4)}`;
  const version = session?.version || 1;

  // 1. High-Efficiency Header Summary (Session ID, Revision, ASN, Name, Peer, Conditional v6/v4, Note)
  const headerLines = [];

  if (isNew) {
    headerLines.push(`🔔 <b>【新 DN42 对等申请 · 首次投递】</b>`);
  } else {
    headerLines.push(`⚠️ <b>【对等申请更新 · 第 ${version} 次修改】</b>`);
  }

  headerLines.push(`━━━━━━━━━━━━━━━━━━━━`);
  headerLines.push(`🔑 <b>会话:</b> <code>${escapeHtml(sessionId)}</code>${!isNew ? ` <i>(v${version})</i>` : ''}`);
  headerLines.push(`👤 <b>ASN:</b> <code>AS${escapeHtml(cleanAsn)}</code>`);
  if (sessionInfo.authUser) {
    headerLines.push(`🛡️ <b>身份确权:</b> <code>DN42 Registry 密码学验真通过 ✅ (${escapeHtml(sessionInfo.authUser.authMethod || 'SSH')})</code>`);
  } else {
    headerLines.push(`🛡️ <b>身份确权:</b> <i>未认证草稿 (建议引导验证) ⚠️</i>`);
  }
  headerLines.push(`🏷️ <b>Name:</b> <code>${escapeHtml(displayName)}</code>`);
  headerLines.push(`🎯 <b>Peer:</b> <b>${escapeHtml(node?.flag || '🌐')} ${escapeHtml(node?.code || '')} · ${escapeHtml(node?.name || '')}</b> (<code>${escapeHtml(node?.endpointDomain || '')}</code>)`);

  // Conditional IPv6 ULA & IPv4 display (omitted if not provided)
  if (peerIpv6ULA && String(peerIpv6ULA).trim()) {
    headerLines.push(`📦 <b>IPv6 ULA:</b> <code>${escapeHtml(String(peerIpv6ULA).trim())}</code>`);
  }
  if (peerIpv4 && String(peerIpv4).trim()) {
    headerLines.push(`⚡ <b>IPv4 隧道:</b> <code>${escapeHtml(String(peerIpv4).trim())}</code>`);
  }

  if (userNote && userNote !== '你好！我在 DN42 上看到了你的节点，希望能建立 BGP 对等互联。期待你的回复！' && userNote !== '你好！我在 DN42 上看到了 AkiLab 的节点，希望能建立 BGP 对等互联。期待你的回复！') {
    headerLines.push(`💬 <b>留言:</b> <i>${escapeHtml(userNote)}</i>`);
  }

  headerLines.push(`🕒 <b>时间:</b> ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} (UTC+8)`);

  // 2. Clear Diff Section (if updating an existing session)
  if (!isNew && diffs.length > 0) {
    headerLines.push(``);
    headerLines.push(`📝 <b>【变更字段明细 (Diff)】:</b>`);
    for (const diff of diffs) {
      headerLines.push(`  • <b>${escapeHtml(diff.label)}:</b> <s>${escapeHtml(diff.oldValue)}</s> ➔ <code>${escapeHtml(diff.newValue)}</code>`);
    }
  }

  // 3. Complete Ready-to-Apply Server Configurations
  const serverWgConfig = [
    `[Interface]`,
    `PrivateKey = <YOUR_SERVER_PRIVATE_KEY>`,
    `ListenPort = ${hostPort}`,
    `PostUp = ip addr add ${node?.tunnelIpv6LLA || 'fe80::...'} dev %i`,
    node?.tunnelIpv6ULA ? `PostUp = ip addr add ${node.tunnelIpv6ULA}/128 dev %i` : null,
    node?.tunnelIpv4 ? `PostUp = ip addr add ${node.tunnelIpv4}/32 peer ${peerIpv4 || '172.20.x.x'} dev %i` : null,
    ``,
    `[Peer]`,
    `PublicKey = ${peerWgPubKey}`,
    peerEndpoint ? `Endpoint = ${peerEndpoint}` : `# Endpoint = <Dynamic>`,
    `AllowedIPs = 10.0.0.0/8, 172.20.0.0/14, 172.31.0.0/16, fd00::/8, fe80::/64`,
  ].filter(Boolean).join('\n');

  const birdConfig = [
    `protocol bgp ${cleanTunnelName}_${nodeCleanCode} from dnpeers {`,
    `    neighbor ${peerIpv6LLA} % '${ifaceName}' as ${cleanAsn};`,
    `    direct;`,
    `}`,
  ].join('\n');

  // Assemble Complete Telegram Message
  const messageText = [
    headerLines.join('\n'),
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🚀 <b>【服务端一键部署配置】</b>`,
    `⚙️ <b>WireGuard (/etc/wireguard/${escapeHtml(ifaceName)}.conf):</b>`,
    `<pre><code>${escapeHtml(serverWgConfig)}</code></pre>`,
    `🦅 <b>Bird2 BGP Neighbor 配置:</b>`,
    `<pre><code>${escapeHtml(birdConfig)}</code></pre>`,
  ].join('\n');

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      console.error('Telegram Bot API Error:', result);
      return {
        success: false,
        error: result.description || 'Telegram 接口调用失败',
      };
    }

    return {
      success: true,
      messageId: result.result?.message_id,
    };
  } catch (err) {
    console.error('Telegram send error:', err);
    return {
      success: false,
      error: err.message || '网络通信异常',
    };
  }
}

/**
 * Sends a notification when a peering session is deleted/cancelled by user
 */
export async function sendDeleteNotification(session) {
  const { botToken, chatId } = getTelegramConfig();
  if (!botToken || !chatId) {
    return { success: true };
  }

  const cleanAsn = String(session.asn || '').replace(/^AS/i, '').trim();
  const messageText = [
    `🗑️ <b>[互联会话撤销通知]</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `👤 <b>Peer ASN:</b> AS${escapeHtml(cleanAsn)}`,
    `🌐 <b>互联节点:</b> ${escapeHtml(session.nodeName || session.nodeCode || session.nodeId)}`,
    `🎫 <b>会话编号:</b> <code>${escapeHtml(session.id)}</code> (v${session.version || 1})`,
    `🔌 <b>释放端口:</b> AkiLab <code>${escapeHtml(session.hostPort)}</code> / 本地 <code>${escapeHtml(session.clientPort || 'N/A')}</code>`,
    `🕒 <b>撤销时间:</b> ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} (UTC+8)`,
    `ℹ️ <i>该互联会话已注销，对应的服务器端口已完成解绑释放。</i>`,
  ].join('\n');

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    return { success: response.ok };
  } catch (err) {
    console.error('Telegram delete notify error:', err);
    return { success: false };
  }
}
