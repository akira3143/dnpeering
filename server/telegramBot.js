/**
 * Telegram Bot Peering Notification Service
 * Optimized for Administrator Quick Action & One-Click Deployment
 * Supports Session ID, Revision Tracking & Field Diffs
 */

import './env.js';

const DEFAULT_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!DEFAULT_BOT_TOKEN || !DEFAULT_CHAT_ID) {
  console.warn('⚠️ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set. Telegram notifications will be disabled.');
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

  // Skip if Telegram is not configured
  if (!DEFAULT_BOT_TOKEN || !DEFAULT_CHAT_ID) {
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

  // If this is an update and has field diffs, highlight them!
  if (!isNew && diffs && diffs.length > 0) {
    headerLines.push(``);
    headerLines.push(`📝 <b>变更明细:</b>`);
    for (const diff of diffs) {
      headerLines.push(`  ${diff}`);
    }
  }

  // 2. Pre-formatted Server-Side WireGuard Configuration (Generic [Interface] + [Peer])
  const wgEndpointLine = peerEndpoint ? `Endpoint = ${escapeHtml(peerEndpoint)}\n` : '';
  const asnNum = parseInt(cleanAsn, 10);
  const safeAsn = isNaN(asnNum) || asnNum <= 0 ? 0 : asnNum;
  const calculatedHostPort = 20000 + (safeAsn % 10000);
  const serverListenPort = (hostPort && Number(hostPort) >= 10000 && Number(hostPort) <= 65535) ? Number(hostPort) : calculatedHostPort;
  const serverLLA = node?.tunnelIpv6LLA || 'fe80::3143';

  const serverWgConfig = `[Interface]
PrivateKey = &lt;YOUR_SERVER_PRIVATE_KEY&gt;
ListenPort = ${serverListenPort}
Address = ${serverLLA}/64
Table = off

[Peer]
PublicKey = ${escapeHtml(peerWgPubKey)}
${wgEndpointLine}AllowedIPs = 10.0.0.0/8, 172.20.0.0/14, 172.31.0.0/16, fd00::/8, fe80::/64
PersistentKeepalive = 25`;

  // 3. Pre-formatted Bird2 BGP Neighbor Configuration Block
  const birdConfig = `#DN42_${escapeHtml(cleanAsn)} ${escapeHtml(cleanTunnelName)} ${escapeHtml(nodeCleanCode)}
protocol bgp ${escapeHtml(ifaceName)} from dn42_peers {
    neighbor ${escapeHtml(peerIpv6LLA)}%${escapeHtml(ifaceName)} as ${escapeHtml(cleanAsn)};
}`;

  // Assemble Complete Telegram Message
  const messageText = [
    headerLines.join('\n'),
    `━━━━━━━━━━━━━━━━━━━━`,
    `🛠️ <b>WireGuard 服务端配置 (${escapeHtml(ifaceName)}.conf):</b>`,
    `<pre><code>${serverWgConfig}</code></pre>`,
    `🦅 <b>Bird2 BGP Neighbor 配置:</b>`,
    `<pre><code>${birdConfig}</code></pre>`,
  ].join('\n');

  try {
    const response = await fetch(`https://api.telegram.org/bot${DEFAULT_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: DEFAULT_CHAT_ID,
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
  if (!DEFAULT_BOT_TOKEN || !DEFAULT_CHAT_ID) {
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
    const response = await fetch(`https://api.telegram.org/bot${DEFAULT_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: DEFAULT_CHAT_ID,
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
