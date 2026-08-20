import React, { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { NETWORK_META, NETWORK_NODES } from '../data/network';
import { usePeering } from '../context/PeeringContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { CodeViewer } from './CodeViewer';
import {
  validateDn42Asn,
  validateWgPublicKey,
  validateIpv6LLA,
  validateIpv6ULA,
  validateDn42Ipv4,
  validateEndpointHost,
} from '../utils/dn42Validation';
import {
  Terminal,
  Copy,
  Download,
  Send,
  FileCode,
  Mail,
  CheckCircle2,
  MessageSquare,
  ChevronDown,
  AlertTriangle,
  Info,
  Zap,
  Trash2,
  Loader2,
  Clock,
  Settings2,
  ShieldCheck,
  Lock,
} from 'lucide-react';

export const ConfigGenerator: React.FC = () => {
  const { copyToClipboard, showToast } = useToast();
  const {
    peerAsn,
    setPeerAsn,
    peerName,
    setPeerName,
    targetNodeId,
    setTargetNodeId,
    peerEndpointHost,
    setPeerEndpointHost,
    peerWgPubKey,
    setPeerWgPubKey,
    peerIpv6LLA,
    setPeerIpv6LLA,
    peerIpv6ULA,
    setPeerIpv6ULA,
    peerIpv4,
    setPeerIpv4,
    bgpMode,
    setBgpMode,
    mtu,
    setMtu,
    userNote,
    setUserNote,
    customHostPort,
    setCustomHostPort,
    isCustomPortExpanded,
    setIsCustomPortExpanded,
    usePeerFallbackPort,
    setUsePeerFallbackPort,
    cleanAsn,
    cleanPeerName,
    selectedNode,
    hostPortInfo,
    finalHostPort,
    finalClientPort,
    fullPeerEndpoint,
    isVerifiedUser,
  } = usePeering();

  const { token, setIsAuthModalOpen } = useAuth();

  const [activeTab, setActiveTab] = useState<'wg' | 'bird' | 'markdown'>('wg');

  // Real-time DN42 Form Validations
  const asnValidation = useMemo(() => validateDn42Asn(peerAsn), [peerAsn]);
  const pubKeyValidation = useMemo(() => validateWgPublicKey(peerWgPubKey), [peerWgPubKey]);
  const llaValidation = useMemo(() => validateIpv6LLA(peerIpv6LLA), [peerIpv6LLA]);
  const ulaValidation = useMemo(() => validateIpv6ULA(peerIpv6ULA), [peerIpv6ULA]);
  const ipv4Validation = useMemo(() => validateDn42Ipv4(peerIpv4, bgpMode === 'mpbgp_enh'), [peerIpv4, bgpMode]);
  const endpointValidation = useMemo(() => validateEndpointHost(peerEndpointHost), [peerEndpointHost]);

  // Interface Name on Peer's Side (Following: dn42_akilab_<节点/对端>)
  const nodeSlug = selectedNode.code.toLowerCase().replace(/[^a-z0-9]/g, '');
  const clientIfaceName = `dn42_akilab_${nodeSlug}`;

  // 1. Client Side WireGuard Config
  const generatedClientWgConfig = useMemo(() => {
    const effectiveLLA = peerIpv6LLA.trim()
      ? peerIpv6LLA.trim()
      : cleanAsn
      ? `fe80::${cleanAsn.slice(-4)}`
      : '<YOUR_IPV6_LLA>';

    // 合并多地址为单行 Address = ...
    const addressList = [`${effectiveLLA}/64`];
    if (peerIpv6ULA.trim()) {
      addressList.push(`${peerIpv6ULA.trim()}/128`);
    }
    if (peerIpv4.trim()) {
      addressList.push(`${peerIpv4.trim()}/32`);
    }
    const addressLine = `Address = ${addressList.join(', ')}`;

    // 动态生成传统点对点（P2P Peer）PostUp 绑定 (仅当手动填写了 IPv4 或 IPv6 ULA 时生成精准 P2P 绑定)
    const postUpLines: string[] = [];
    if (peerIpv4.trim() && selectedNode.tunnelIpv4) {
      postUpLines.push(`PostUp = ip addr del dev %i ${peerIpv4.trim()}/32`);
      postUpLines.push(`PostUp = ip addr add dev %i ${peerIpv4.trim()}/32 peer ${selectedNode.tunnelIpv4}/32`);
    }
    if (peerIpv6ULA.trim() && selectedNode.tunnelIpv6ULA) {
      postUpLines.push(`PostUp = ip addr del dev %i ${peerIpv6ULA.trim()}/128`);
      postUpLines.push(`PostUp = ip addr add dev %i ${peerIpv6ULA.trim()}/128 peer ${selectedNode.tunnelIpv6ULA}/128`);
    }
    const postUpBlock = postUpLines.length > 0 ? `${postUpLines.join('\n')}\n` : '';

    return `[Interface]
PrivateKey = <YOUR_PRIVATE_KEY>
ListenPort = ${finalClientPort}
${addressLine}
MTU = ${mtu}
${postUpBlock}
[Peer]
PublicKey = ${selectedNode.wgPublicKey}
Endpoint = ${selectedNode.endpointDomain}:${finalHostPort}
AllowedIPs = 10.0.0.0/8, 172.20.0.0/14, 172.31.0.0/16, fd00::/8, fe80::/64
PersistentKeepalive = 25
`.trim();
  }, [finalClientPort, peerIpv6LLA, cleanAsn, peerIpv6ULA, peerIpv4, mtu, selectedNode, finalHostPort]);

  // 2. Client Side BIRD 2 / BIRD 3 Config
  const generatedBirdConfig = useMemo(() => {
    const referenceComment = '# 仅供参考：请根据你本地 bird.conf 中的模板名称（如 dnpeers）与过滤器定义按需调整\n';

    if (bgpMode === 'mpbgp_enh') {
      return `${referenceComment}protocol bgp dn42_akilab_${nodeSlug} from dnpeers {
    neighbor ${selectedNode.tunnelIpv6LLA}%${clientIfaceName} as ${NETWORK_META.asnNumber};

    ipv4 {
        extended next hop on;
        import filter dn42_import_filter;
        export filter dn42_export_filter;
    };

    ipv6 {
        import filter dn42_import_filter;
        export filter dn42_export_filter;
    };
}
`.trim();
    } else if (bgpMode === 'dual_stack') {
      return `${referenceComment}protocol bgp dn42_akilab_${nodeSlug}_v6 from dnpeers {
    neighbor ${selectedNode.tunnelIpv6LLA}%${clientIfaceName} as ${NETWORK_META.asnNumber};
    ipv6 {
        import filter dn42_import_filter;
        export filter dn42_export_filter;
    };
}

protocol bgp dn42_akilab_${nodeSlug}_v4 from dnpeers {
    neighbor ${selectedNode.tunnelIpv4 || '172.20.0.x'} as ${NETWORK_META.asnNumber};
    ipv4 {
        import filter dn42_import_filter;
        export filter dn42_export_filter;
    };
}
`.trim();
    } else {
      return `${referenceComment}protocol bgp dn42_akilab_${nodeSlug}_v6 from dnpeers {
    neighbor ${selectedNode.tunnelIpv6LLA}%${clientIfaceName} as ${NETWORK_META.asnNumber};
    ipv6 {
        import filter dn42_import_filter;
        export filter dn42_export_filter;
    };
}
`.trim();
    }
  }, [bgpMode, nodeSlug, selectedNode, clientIfaceName]);

  // 3. Immutable Core Parameters Block for Markdown
  const immutableParamsBlock = useMemo(() => {
    const effectiveLLA = peerIpv6LLA.trim()
      ? peerIpv6LLA.trim()
      : cleanAsn
      ? `fe80::${cleanAsn.slice(-4)}`
      : '（未填）';

    const ulaLine = peerIpv6ULA.trim() ? `- **你的 IPv6 ULA:** \`${peerIpv6ULA.trim()}\`\n` : '';
    const ipv4Line = peerIpv4.trim() ? `- **你的 IPv4 P2P:** \`${peerIpv4.trim()}\`\n` : '';
    const protocolDesc =
      bgpMode === 'mpbgp_enh'
        ? 'MP-BGP + Extended Next Hop (ENH)'
        : bgpMode === 'dual_stack'
        ? 'Dual-Stack (Independent Sessions)'
        : 'IPv6-Only';

    return `### 🌐 DN42 Peering Request

> **申请人 ASN:** ${cleanAsn ? `AS${cleanAsn}` : '（未填）'}
> **称呼 / 标识 (Name):** ${cleanPeerName || '（未填）'}
> **目标接入节点:** ${selectedNode.flag} ${selectedNode.name} (${selectedNode.code})

#### 📡 互联参数清单 (Peering Parameters)
- **你的 ASN:** ${cleanAsn ? `AS${cleanAsn}` : '（未填）'}
- **称呼 / 代号:** ${cleanPeerName || '（未填）'}
- **AkiLab 节点 Endpoint:** \`${selectedNode.endpointDomain}:${finalHostPort}\`
- **你的公网 Endpoint:** \`${fullPeerEndpoint || 'N/A (Behind NAT)'}\` (你的 ListenPort: \`${finalClientPort}\`)
- **你的 WireGuard 公钥:** \`${peerWgPubKey.trim() || '（未填）'}\`
- **你的 IPv6 Link-Local (LLA):** \`${effectiveLLA}\`
${ulaLine}${ipv4Line}- **BGP 协议模式:** ${protocolDesc}
- **推荐 MTU:** ${mtu}`.trim();
  }, [cleanAsn, cleanPeerName, selectedNode, finalHostPort, fullPeerEndpoint, finalClientPort, peerWgPubKey, peerIpv6LLA, peerIpv6ULA, peerIpv4, bgpMode, mtu]);

  // Full Combined Markdown
  const fullCombinedMarkdown = useMemo(() => {
    const noteSection = userNote.trim()
      ? `#### 💬 附加留言 (可选)\n${userNote.trim()}`
      : `#### 💬 附加留言 (可选)\n（无额外留言）`;

    return `${immutableParamsBlock}\n\n${noteSection}`;
  }, [immutableParamsBlock, userNote]);

  // Current Active Code to Copy / Download
  const currentOutputCode = useMemo(() => {
    switch (activeTab) {
      case 'wg':
        return generatedClientWgConfig;
      case 'bird':
        return generatedBirdConfig;
      case 'markdown':
        return fullCombinedMarkdown;
      default:
        return '';
    }
  }, [activeTab, generatedClientWgConfig, generatedBirdConfig, fullCombinedMarkdown]);

  // Handle Download Configuration File
  const handleDownload = () => {
    const filenames: Record<string, string> = {
      wg: `${clientIfaceName}.conf`,
      bird: `bird_${clientIfaceName}.conf`,
      markdown: `dn42_peering_request_${cleanAsn || 'peer'}.md`,
    };
    const filename = filenames[activeTab] || 'config.txt';
    const blob = new Blob([currentOutputCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`配置文件 ${filename} 已开始下载`, 'success');
  };

  const triggerCelebration = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.7 },
      colors: ['#06b6d4', '#3b82f6', '#10b981', '#a855f7'],
    });
  };

  const handleCopyCurrent = () => {
    copyToClipboard(currentOutputCode, `[${activeTab.toUpperCase()}] 内容`);
    triggerCelebration();
  };

  const handleResetNote = () => {
    setUserNote('你好！我在 DN42 上看到了你的节点，希望能建立 BGP 对等互联。期待你的回复！');
    showToast('附加留言已恢复默认内容', 'info');
  };

  // Cooldown & Submitting State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('akilab_peer_cooldown_until');
      if (stored) {
        const remaining = Math.ceil((parseInt(stored, 10) - Date.now()) / 1000);
        return remaining > 0 ? remaining : 0;
      }
    } catch {}
    return 0;
  });

  // Cooldown countdown timer effect
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          try { localStorage.removeItem('akilab_peer_cooldown_until'); } catch {}
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  // Handle In-App Direct Telegram Bot Submission
  const handleSubmitApplication = async () => {
    if (isSubmitting || cooldownSeconds > 0) return;

    // Validate inputs
    if (!peerAsn || !cleanAsn) {
      showToast('请先填写你的 DN42 ASN', 'error');
      return;
    }
    if (asnValidation.status === 'error') {
      showToast(asnValidation.message || 'ASN 格式不正确', 'error');
      return;
    }
    if (!peerWgPubKey || pubKeyValidation.status === 'error') {
      showToast('请提供有效的 WireGuard Base64 公钥', 'error');
      return;
    }
    if (!peerIpv6LLA || llaValidation.status === 'error') {
      showToast('请提供有效的 IPv6 Link-Local (fe80::) 地址', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/submit-peering', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          node: {
            id: selectedNode.id,
            name: selectedNode.name,
            code: selectedNode.code,
            flag: selectedNode.flag,
            city: selectedNode.city,
            region: selectedNode.region,
            endpointDomain: selectedNode.endpointDomain,
            tunnelIpv6LLA: selectedNode.tunnelIpv6LLA,
            tunnelIpv4: selectedNode.tunnelIpv4,
          },
          hostPort: finalHostPort,
          peerAsn: cleanAsn,
          peerName: peerName.trim() || cleanPeerName,
          peerEndpoint: fullPeerEndpoint,
          peerWgPubKey,
          peerIpv6LLA,
          peerIpv6ULA,
          peerIpv4,
          bgpMode,
          mtu,
          userNote,
          fullMarkdown: fullCombinedMarkdown,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (response.status === 429 && data.retryAfter) {
          const cooldownTime = data.retryAfter;
          setCooldownSeconds(cooldownTime);
          try {
            localStorage.setItem('akilab_peer_cooldown_until', String(Date.now() + cooldownTime * 1000));
          } catch {}
        }
        showToast(data.error || '提交失败，请稍后重试', 'error');
        return;
      }

      // Success
      triggerCelebration();

      // Store in local active peerings list
      try {
        const stored = JSON.parse(localStorage.getItem('akilab_my_peerings') || '[]');
        const filtered = stored.filter((item: any) => item.sessionId !== data.sessionId && !(item.asn === cleanAsn && item.nodeId === selectedNode.id));
        const updatedList = [
          {
            sessionId: data.sessionId,
            asn: cleanAsn,
            name: peerName.trim() || cleanPeerName,
            nodeId: selectedNode.id,
            nodeCode: selectedNode.code,
            nodeName: selectedNode.name,
            flag: selectedNode.flag,
            version: data.version || 1,
            hostPort: finalHostPort,
            clientPort: finalClientPort,
            status: 'pending_review',
            updatedAt: new Date().toISOString(),
          },
          ...filtered,
        ];
        localStorage.setItem('akilab_my_peerings', JSON.stringify(updatedList));
      } catch {}

      showToast(
        data.isNew
          ? `🎉 对等申请已投递！会话 ID: ${data.sessionId}`
          : `🔄 申请已更新至版本 v${data.version}！会话 ID: ${data.sessionId}`,
        'success'
      );
      
      // Start 60s cooldown
      const cooldownTime = 60;
      setCooldownSeconds(cooldownTime);
      try {
        localStorage.setItem('akilab_peer_cooldown_until', String(Date.now() + cooldownTime * 1000));
      } catch {}

    } catch {
      showToast('网络请求异常，请检查连接后重试', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Demo Data Fill & Reset Helpers
  const handleFillDemoData = () => {
    setPeerAsn('4242429998');
    setPeerName('Akira');
    setPeerEndpointHost('peer.example.dn42');
    setPeerWgPubKey('zG8r7QGqR+V9YjK6iFmP7a4b8cD9eF0g1H2i3J4k5L6=');
    setPeerIpv6LLA('fe80::9998');
    setPeerIpv6ULA('fd42:4242:9998::1');
    setPeerIpv4('172.20.0.99');
    showToast('已填入 DN42 互联规范示例数据', 'info');
  };

  const handleClearForm = () => {
    setPeerAsn('');
    setPeerEndpointHost('');
    setPeerWgPubKey('');
    setPeerIpv6LLA('');
    setPeerIpv6ULA('');
    setPeerIpv4('');
    showToast('表单已清空', 'info');
  };

  return (
    <section id="generator" className="w-full py-1">
      <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6">

        {/* Magazine Editorial Step Typography (Balanced S = 01/02 with Nested tep) */}
        <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-8 mb-3.5 px-1 select-none">
          {/* Step 1 Typography Header */}
          <div className="w-full lg:w-[41%] shrink-0 flex items-center gap-3.5 animate-step-1">
            {/* Step 01 Typographic Lockup: S and 01 equal size */}
            <div className="flex items-baseline shrink-0">
              <span className="text-3xl sm:text-4xl font-black italic text-cyan-400 font-sans leading-none">
                S
              </span>
              <span className="text-base sm:text-lg font-bold italic text-slate-200 font-sans tracking-wide leading-none ml-0.5">
                tep
              </span>
              <span className="ml-2 text-3xl sm:text-4xl font-black italic tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-cyan-300 via-cyan-400 to-blue-500 font-sans leading-none pr-1 drop-shadow-[0_0_18px_rgba(6,182,212,0.4)]">
                01
              </span>
            </div>

            {/* Locked Content Block */}
            <div className="flex-1 min-w-0 border-l border-white/15 pl-3.5 space-y-0.5">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black tracking-tight text-white font-sans uppercase">
                  填写对等互联参数
                </h2>
                <span className="text-[9px] font-mono text-cyan-300 uppercase tracking-widest px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30">
                  INPUT
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 tracking-wider truncate">
                PARAMETERS SETUP &middot; 实时参数校验与端口联动
              </p>
            </div>
          </div>

          {/* Symmetrical Spacer for Top Header Divider Alignment */}
          <div className="hidden lg:flex w-px shrink-0 opacity-0"></div>

          {/* Step 2 Typography Header */}
          <div className="w-full lg:flex-1 min-w-0 flex items-center gap-3.5 animate-step-2">
            {/* Step 02 Typographic Lockup: S and 02 equal size */}
            <div className="flex items-baseline shrink-0">
              <span className="text-3xl sm:text-4xl font-black italic text-purple-400 font-sans leading-none">
                S
              </span>
              <span className="text-base sm:text-lg font-bold italic text-slate-200 font-sans tracking-wide leading-none ml-0.5">
                tep
              </span>
              <span className="ml-2 text-3xl sm:text-4xl font-black italic tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-purple-300 via-purple-400 to-pink-500 font-sans leading-none pr-1 drop-shadow-[0_0_18px_rgba(168,85,247,0.4)]">
                02
              </span>
            </div>

            {/* Locked Content Block */}
            <div className="flex-1 min-w-0 border-l border-white/15 pl-3.5 space-y-0.5">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black tracking-tight text-white font-sans uppercase">
                  核对配置并投递申请
                </h2>
                <span className="text-[9px] font-mono text-purple-300 uppercase tracking-widest px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-500/30">
                  OUTPUT & SUBMIT
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 tracking-wider truncate">
                LIVE CONFIG ENGINE &middot; 实时生成客户端配置与一键投递
              </p>
            </div>
          </div>
        </div>

        {/* Generator Studio Flexbox: Left 41% (Compact) | Divider with Equal Bilateral Spacing | Right Flex-1 (Spacious) */}
        <div className="flex flex-col lg:flex-row items-stretch gap-6 lg:gap-8 relative">
          
          {/* Left Panel: Form Input Fields (Compact 41%) */}
          <div className="w-full lg:w-[41%] shrink-0 rounded-2xl bg-[#080d1a]/85 border border-cyan-500/20 backdrop-blur-xl p-5 sm:p-6 flex flex-col justify-between shadow-2xl shadow-black/60 relative">
            
            <div className="space-y-4">
              {/* Form Top Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                  <h3 className="font-bold text-white text-sm sm:text-base font-sans tracking-wide">
                    互联参数配置
                  </h3>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleFillDemoData}
                    type="button"
                    className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-sans flex items-center gap-1 transition-all cursor-pointer font-medium"
                    title="一键填入测试示例数据"
                  >
                    <Zap className="w-3 h-3 text-cyan-400" />
                    <span>示例</span>
                  </button>
                  {(peerAsn || peerEndpointHost || peerWgPubKey || peerIpv6LLA || peerIpv6ULA || peerIpv4) && (
                    <button
                      onClick={handleClearForm}
                      type="button"
                      className="px-2 py-1 rounded-lg bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-300 border border-white/10 hover:border-red-500/30 text-[11px] font-sans transition-all cursor-pointer"
                      title="清空所有输入项"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3.5 text-xs font-sans">
                
                {/* 1. Target Node Selector with Structured Micro Badges */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1.5">
                    <label className="text-slate-300 font-medium">目标接入节点 (AkiLab Node)</label>
                    <span className="text-[11px] font-mono text-cyan-400">{selectedNode.region.toUpperCase()} &middot; {selectedNode.city}</span>
                  </div>
                  <div className="relative">
                    <select
                      value={targetNodeId}
                      onChange={(e) => setTargetNodeId(e.target.value)}
                      className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#040813] border border-white/15 text-slate-100 text-xs font-mono focus:border-cyan-400 focus:outline-none transition-colors cursor-pointer appearance-none shadow-inner"
                    >
                      {NETWORK_NODES.map((node) => (
                        <option key={node.id} value={node.id} className="bg-[#0c1424] text-slate-100 py-2">
                          {node.flag} {node.code} &middot; {node.name} ({node.city})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                  
                  {/* Styled Chip Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/10 text-[10px] font-mono text-slate-300">
                      <span className="text-slate-500">Host:</span>
                      <code className="text-cyan-300">{selectedNode.endpointDomain}</code>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/10 text-[10px] font-mono text-slate-300">
                      <span className="text-slate-500">LLA:</span>
                      <code className="text-purple-300">{selectedNode.tunnelIpv6LLA}</code>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/10 text-[10px] font-mono text-slate-300">
                      <span className="text-slate-500">v4:</span>
                      <code className="text-slate-300">{selectedNode.tunnelIpv4}</code>
                    </span>
                  </div>
                </div>

                {/* 2. Peer ASN & Peer Name in 2 Columns */}
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Peer ASN */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between px-1.5">
                        <div className="flex items-center gap-1.5">
                          <label className="text-slate-300 font-medium">你的 ASN</label>
                          {isVerifiedUser ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-emerald-950/80 border border-emerald-500/40 text-[9px] font-mono text-emerald-300">
                              <ShieldCheck className="w-2.5 h-2.5" />
                              <span>已确权</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsAuthModalOpen(true)}
                              className="text-[10px] text-cyan-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                              title="使用 DN42 Registry 密码学签名或密码确认归属"
                            >
                              <ShieldCheck className="w-2.5 h-2.5" />
                              <span>一键确权</span>
                            </button>
                          )}
                        </div>
                        
                        {/* Dynamic Port Conflict / Fallback Badge with Drawer Trigger */}
                        <button
                          type="button"
                          onClick={() => setIsCustomPortExpanded(!isCustomPortExpanded)}
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 cursor-pointer transition-all ${
                            hostPortInfo.isFallback
                              ? 'text-amber-300 bg-amber-950/80 border-amber-500/50 hover:bg-amber-900/80 animate-pulse'
                              : hostPortInfo.status === 'custom_occupied'
                              ? 'text-red-300 bg-red-950/80 border-red-500/50 hover:bg-red-900/80'
                              : 'text-cyan-300 bg-cyan-950/60 border-cyan-500/30 hover:bg-cyan-900/60'
                          }`}
                          title="点击查看端口计算规则、冲突检测与自定义端口"
                        >
                          <span>{hostPortInfo.isFallback ? `⚡ 备用端口: ${finalHostPort}` : `端口: ${finalHostPort}`}</span>
                          <Settings2 className="w-2.5 h-2.5 opacity-70" />
                        </button>
                      </div>

                      <div className={`flex items-center w-full rounded-xl border transition-colors overflow-hidden shadow-inner ${
                        isVerifiedUser
                          ? 'bg-emerald-950/20 border-emerald-500/40'
                          : 'bg-[#040813] border-white/15 focus-within:border-cyan-400'
                      }`}>
                        <span className={`px-3 py-2 border-r font-mono text-xs font-semibold select-none flex items-center gap-1 ${
                          isVerifiedUser
                            ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-400'
                            : 'bg-white/[0.04] border-white/10 text-slate-400'
                        }`}>
                          {isVerifiedUser && <Lock className="w-3 h-3 text-emerald-400" />}
                          <span>AS</span>
                        </span>
                        <input
                          type="text"
                          value={peerAsn}
                          readOnly={isVerifiedUser}
                          onChange={(e) => !isVerifiedUser && setPeerAsn(e.target.value)}
                          placeholder="424242xxxx"
                          className={`flex-1 px-3 py-2 bg-transparent border-0 font-mono text-xs focus:outline-none placeholder:text-slate-600 ${
                            isVerifiedUser ? 'text-emerald-300 font-bold cursor-not-allowed select-all' : 'text-slate-100'
                          }`}
                          title={isVerifiedUser ? '当前 ASN 已通过安全确权绑定锁定，不可随意修改。如需变更请更换登录账号。' : ''}
                        />
                      </div>
                      {asnValidation.message && (
                        <div className={`text-[11px] pl-1 flex items-center gap-1 font-sans ${
                          asnValidation.status === 'error' ? 'text-red-400' : 'text-amber-300'
                        }`}>
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>{asnValidation.message}</span>
                        </div>
                      )}
                    </div>

                    {/* Peer Name / Identifier */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between px-1.5">
                        <label className="text-slate-300 font-medium">隧道称呼 (Name)</label>
                        <span className="text-[10px] font-mono text-slate-400">英数最长12位</span>
                      </div>
                      <div className="flex items-center w-full rounded-xl bg-[#040813] border border-white/15 focus-within:border-cyan-400 transition-colors overflow-hidden shadow-inner">
                        <input
                          type="text"
                          value={peerName}
                          onChange={(e) => setPeerName(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12))}
                          placeholder="例如 Akira"
                          maxLength={12}
                          className="flex-1 px-3 py-2 bg-transparent border-0 text-slate-100 font-mono text-xs focus:outline-none placeholder:text-slate-600"
                        />
                      </div>
                      <div className="text-[10px] text-slate-500 pl-1 font-mono truncate">
                        用于命名: dn42_{cleanPeerName}_{nodeSlug}
                      </div>
                    </div>
                  </div>

                  {/* Collapsible Advanced Port & Conflict Inspector */}
                  {isCustomPortExpanded && (
                    <div className="p-3.5 rounded-xl bg-black/50 border border-cyan-500/30 space-y-2.5 transition-all">
                      <div className="flex items-center justify-between text-xs font-semibold text-cyan-300">
                        <span className="flex items-center gap-1.5 font-mono">
                          <Zap className="w-3.5 h-3.5 text-cyan-400" />
                          端口计算规则与冲突检测 (Port Resolution)
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsCustomPortExpanded(false)}
                          className="text-slate-400 hover:text-white text-[11px] cursor-pointer"
                        >
                          收起 ✕
                        </button>
                      </div>

                      {/* AkiLab Host Port Calculation Info */}
                      <div className="text-[11px] space-y-1.5 text-slate-300 font-sans">
                        <div className="flex items-center justify-between font-mono bg-white/[0.03] p-2 rounded-lg border border-white/5">
                          <span className="text-slate-400">AkiLab 默认计算:</span>
                          <span className="text-cyan-300">20000 + ({cleanAsn || '0'} % 10000) = {hostPortInfo.defaultPort}</span>
                        </div>
                        
                        <div className="flex items-center justify-between font-mono bg-white/[0.03] p-2 rounded-lg border border-white/5">
                          <span className="text-slate-400">冲突检测 / 分配状态:</span>
                          <span className={hostPortInfo.isFallback ? 'text-amber-300 font-semibold' : 'text-emerald-400 font-semibold'}>
                            {hostPortInfo.label}
                          </span>
                        </div>
                      </div>

                      {/* Custom Port Override */}
                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-400 flex items-center justify-between px-1.5">
                          <span>自定义 AkiLab 监听端口 (可选覆盖, 10000~65535):</span>
                          {customHostPort && (
                            <button
                              type="button"
                              onClick={() => setCustomHostPort('')}
                              className="text-[10px] text-cyan-400 hover:underline cursor-pointer"
                            >
                              恢复自动计算
                            </button>
                          )}
                        </label>
                        <input
                          type="number"
                          min={10000}
                          max={65535}
                          value={customHostPort}
                          onChange={(e) => setCustomHostPort(e.target.value)}
                          placeholder={`默认端口: ${hostPortInfo.defaultPort}`}
                          className="w-full px-3 py-1.5 rounded-lg bg-[#040813] border border-white/15 focus:border-cyan-400 text-slate-100 font-mono text-xs focus:outline-none placeholder:text-slate-600"
                        />
                      </div>

                      {/* Client Fallback Port Toggle */}
                      <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                        <div className="text-[11px]">
                          <div className="text-slate-200 font-medium">你本地 VPS 监听端口: <span className="font-mono text-purple-300">{finalClientPort}</span></div>
                          <div className="text-[10px] text-slate-400">同 VPS 连接多个节点时可开启备用端口</div>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-mono text-slate-300 select-none">
                          <input
                            type="checkbox"
                            checked={usePeerFallbackPort}
                            onChange={(e) => setUsePeerFallbackPort(e.target.checked)}
                            className="rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-cyan-500"
                          />
                          <span>备用端口 (33143)</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. WireGuard Endpoint */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1.5">
                    <label className="text-slate-300 font-medium">你的 WireGuard 公网 Endpoint</label>
                    <span className="text-[10px] font-mono text-slate-400">(可选, 动态 IP 可留空)</span>
                  </div>
                  
                  <div className="flex items-center w-full rounded-xl bg-[#040813] border border-white/15 focus-within:border-cyan-400 transition-colors overflow-hidden shadow-inner">
                    <input
                      type="text"
                      value={peerEndpointHost}
                      onChange={(e) => setPeerEndpointHost(e.target.value.replace(/:\d+$/, ''))}
                      placeholder="域名或公网 IPv4/IPv6"
                      className="flex-1 px-3.5 py-2.5 bg-transparent border-0 text-slate-100 font-mono text-xs focus:outline-none placeholder:text-slate-600"
                    />
                    <div className="px-3.5 py-2.5 bg-white/[0.04] border-l border-white/10 text-cyan-300 font-mono text-xs font-semibold select-none flex items-center shrink-0">
                      <span>:{finalClientPort}</span>
                    </div>
                  </div>
                  {endpointValidation.message && (
                    <div className="text-[11px] pl-1 flex items-center gap-1 text-amber-300 font-sans">
                      <Info className="w-3 h-3 shrink-0" />
                      <span>{endpointValidation.message}</span>
                    </div>
                  )}
                </div>

                {/* 4. Peer WG Public Key */}
                <div className="space-y-1.5">
                  <label className="block text-slate-300 font-medium pl-1.5">你的 WireGuard 公钥 (Public Key)</label>
                  <input
                    type="text"
                    value={peerWgPubKey}
                    onChange={(e) => setPeerWgPubKey(e.target.value)}
                    placeholder="base64 公钥字符串"
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-[#040813] border font-mono text-xs focus:outline-none placeholder:text-slate-600 transition-colors shadow-inner ${
                      pubKeyValidation.status === 'error'
                        ? 'border-red-500/80 text-red-200 focus:border-red-400'
                        : pubKeyValidation.status === 'valid' && peerWgPubKey
                        ? 'border-emerald-500/50 text-slate-100 focus:border-emerald-400'
                        : 'border-white/15 text-slate-100 focus:border-cyan-400'
                    }`}
                  />
                  {pubKeyValidation.message && (
                    <div className="text-[11px] pl-1 flex items-center gap-1 text-red-400 font-sans">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>{pubKeyValidation.message}</span>
                    </div>
                  )}
                </div>

                {/* 5. IPv6 Link-Local (LLA) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1.5">
                    <label className="text-slate-300 font-medium">你的 IPv6 Link-Local (LLA)</label>
                    <span className="text-[10px] font-mono text-cyan-400">(推荐 fe80::/64)</span>
                  </div>
                  <input
                    type="text"
                    value={peerIpv6LLA}
                    onChange={(e) => setPeerIpv6LLA(e.target.value)}
                    placeholder="fe80::"
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-[#040813] border font-mono text-xs focus:outline-none placeholder:text-slate-600 transition-colors shadow-inner ${
                      llaValidation.status === 'error'
                        ? 'border-red-500/80 text-red-200 focus:border-red-400'
                        : llaValidation.status === 'valid' && peerIpv6LLA
                        ? 'border-emerald-500/50 text-slate-100 focus:border-emerald-400'
                        : 'border-white/15 text-slate-100 focus:border-cyan-400'
                    }`}
                  />
                  {llaValidation.message && (
                    <div className="text-[11px] pl-1 flex items-center gap-1 text-red-400 font-sans">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>{llaValidation.message}</span>
                    </div>
                  )}
                </div>

                {/* 6. Optional IPs (ULA & IPv4) in 2 Columns */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-medium pl-1.5">IPv6 ULA (可选)</label>
                    <input
                      type="text"
                      value={peerIpv6ULA}
                      onChange={(e) => setPeerIpv6ULA(e.target.value)}
                      placeholder="fdxx::"
                      className={`w-full px-3.5 py-2.5 rounded-xl bg-[#040813] border font-mono text-xs focus:outline-none placeholder:text-slate-600 transition-colors shadow-inner ${
                        ulaValidation.status === 'error'
                          ? 'border-red-500/80 text-red-200 focus:border-red-400'
                          : ulaValidation.status === 'warning'
                          ? 'border-amber-500/70 text-amber-100 focus:border-amber-400'
                          : ulaValidation.status === 'valid' && peerIpv6ULA
                          ? 'border-emerald-500/50 text-slate-100 focus:border-emerald-400'
                          : 'border-white/15 text-slate-100 focus:border-cyan-400'
                      }`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-medium pl-1.5">IPv4 隧道地址 (可选)</label>
                    <input
                      type="text"
                      value={peerIpv4}
                      onChange={(e) => setPeerIpv4(e.target.value)}
                      placeholder="172.2x.xx.xx"
                      className={`w-full px-3.5 py-2.5 rounded-xl bg-[#040813] border font-mono text-xs focus:outline-none placeholder:text-slate-600 transition-colors shadow-inner ${
                        ipv4Validation.status === 'error'
                          ? 'border-red-500/80 text-red-200 focus:border-red-400'
                          : ipv4Validation.status === 'warning'
                          ? 'border-amber-500/70 text-amber-100 focus:border-amber-400'
                          : ipv4Validation.status === 'valid' && peerIpv4
                          ? 'border-emerald-500/50 text-slate-100 focus:border-emerald-400'
                          : 'border-white/15 text-slate-100 focus:border-cyan-400'
                      }`}
                    />
                  </div>
                </div>

                {/* 7. BGP Mode & MTU in 2 Columns */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-medium pl-1.5">BGP 模式</label>
                    <div className="relative">
                      <select
                        value={bgpMode}
                        onChange={(e) => setBgpMode(e.target.value as any)}
                        className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#040813] border border-white/15 text-slate-100 text-xs font-mono focus:border-cyan-400 focus:outline-none transition-colors cursor-pointer appearance-none shadow-inner"
                      >
                        <option value="mpbgp_enh" className="bg-[#0c1424] text-slate-100 py-2">MP-BGP + ENH (推荐)</option>
                        <option value="dual_stack" className="bg-[#0c1424] text-slate-100 py-2">双栈独立会话 (Dual)</option>
                        <option value="ipv6_only" className="bg-[#0c1424] text-slate-100 py-2">仅 IPv6 会话</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-medium pl-1.5">WireGuard MTU</label>
                    <div className="relative">
                      <select
                        value={mtu}
                        onChange={(e) => setMtu(parseInt(e.target.value, 10))}
                        className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#040813] border border-white/15 text-slate-100 text-xs font-mono focus:border-cyan-400 focus:outline-none transition-colors cursor-pointer appearance-none shadow-inner"
                      >
                        <option value={1420} className="bg-[#0c1424] text-slate-100 py-2">1420 (标准推荐)</option>
                        <option value={1408} className="bg-[#0c1424] text-slate-100 py-2">1408 (PPPoE/嵌套隧道)</option>
                        <option value={1370} className="bg-[#0c1424] text-slate-100 py-2">1370 (多层封装)</option>
                        <option value={1280} className="bg-[#0c1424] text-slate-100 py-2">1280 (IPv6 最小 MTU)</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>
                </div>

              </div>
            </div>

            <div className="pt-2"></div>

          </div>

          {/* Central Book-Spine Divider with Equal Bilateral Spacing */}
          <div className="hidden lg:flex flex-col items-center justify-center shrink-0">
            <div className="w-px h-full bg-gradient-to-b from-cyan-500/40 via-white/20 to-purple-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]"></div>
          </div>

          {/* Right Panel: Output Canvas, Live Code Renderer & Sending Actions (Spacious flex-1) */}
          <div className="w-full lg:flex-1 min-w-0 rounded-2xl bg-[#080d1a]/85 border border-cyan-500/20 backdrop-blur-xl flex flex-col justify-between overflow-hidden shadow-2xl shadow-black/60">
            
            <div className="flex-1 flex flex-col min-h-0">
              {/* Studio Canvas Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 bg-black/50 border-b border-white/10 shrink-0">
                
                {/* 3 Core Tabs */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setActiveTab('wg')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-mono transition-all flex items-center gap-2 border cursor-pointer ${
                      activeTab === 'wg'
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-950/40 font-semibold'
                        : 'bg-white/[0.02] border-transparent text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileCode className="w-4 h-4 text-cyan-400" />
                    <span>wg0.conf</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('bird')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-mono transition-all flex items-center gap-2 border cursor-pointer ${
                      activeTab === 'bird'
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-950/40 font-semibold'
                        : 'bg-white/[0.02] border-transparent text-slate-400 hover:text-white'
                    }`}
                  >
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <span>bird.conf</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('markdown')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-mono transition-all flex items-center gap-2 border cursor-pointer ${
                      activeTab === 'markdown'
                        ? 'bg-purple-500/20 border-purple-400 text-purple-200 shadow-md shadow-purple-950/40 font-semibold'
                        : 'bg-white/[0.02] border-transparent text-slate-400 hover:text-white'
                    }`}
                  >
                    <Mail className="w-4 h-4 text-purple-400" />
                    <span>申请模板</span>
                  </button>
                </div>

                {/* Copy & Download Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyCurrent}
                    className="px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-white/10 hover:border-cyan-500/30 text-xs font-sans flex items-center gap-1.5 transition-all cursor-pointer"
                    title="复制当前激活面板内容"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>复制</span>
                  </button>

                  <button
                    onClick={handleDownload}
                    className="p-1.5 rounded-xl bg-white/[0.05] hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-white/10 hover:border-cyan-500/30 transition-all cursor-pointer"
                    title="下载当前配置文件"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Dynamic Code Viewer Area */}
              <div className="flex-1 min-h-[380px] sm:min-h-[420px] flex flex-col bg-[#050914] relative">
                {activeTab === 'markdown' ? (
                  <div className="flex-1 flex flex-col h-full bg-[#030712]">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.03] border-b border-white/10 text-xs font-mono select-none">
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-purple-400" />
                        <span className="text-slate-300 font-mono text-xs font-medium">
                          peering_request.md
                        </span>
                      </div>
                      <span className="text-slate-500 font-mono text-[11px]">
                        纯文本申请信
                      </span>
                    </div>

                    <div className="flex-1 overflow-auto p-4 text-xs font-mono leading-relaxed text-slate-200 whitespace-pre scrollbar-thin select-all">
                      {fullCombinedMarkdown}
                    </div>

                    {/* Compact Bottom Note Input */}
                    <div className="p-2.5 bg-white/[0.02] border-t border-white/10 flex items-center gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-purple-400 shrink-0 ml-1" />
                      <input
                        type="text"
                        value={userNote}
                        onChange={(e) => setUserNote(e.target.value)}
                        placeholder="附加留言 (如期望互联方式、路由偏好)..."
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/10 text-slate-200 text-xs font-sans focus:border-purple-400 focus:outline-none"
                      />
                      {userNote !== '你好！我在 DN42 上看到了你的节点，希望能建立 BGP 对等互联。期待你的回复！' && (
                        <button
                          onClick={handleResetNote}
                          type="button"
                          className="text-[11px] text-amber-300 hover:underline px-2 cursor-pointer shrink-0 font-sans"
                        >
                          恢复默认
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <CodeViewer code={currentOutputCode} language={activeTab} showLineNumbers={true} />
                )}
              </div>
            </div>

            {/* Bottom Action Footer with Single Direct Cyber Submit Button */}
            <div className="p-4 bg-black/50 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
              <div className="text-xs text-slate-400 flex items-center gap-2 font-sans min-w-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate">
                  {activeTab === 'markdown'
                    ? '申请信已整合安全参数与附加留言，点击右侧按钮直接一键提交。'
                    : '配置代码已严格根据参数实时渲染，点击右侧按钮直接一键投递。'}
                </span>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end shrink-0">
                <button
                  type="button"
                  onClick={handleSubmitApplication}
                  disabled={isSubmitting || cooldownSeconds > 0}
                  className={`btn-primary px-6 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-all whitespace-nowrap shrink-0 ${
                    isSubmitting || cooldownSeconds > 0
                      ? 'opacity-70 cursor-not-allowed filter grayscale-[0.3]'
                      : 'hover:scale-[1.02] active:scale-[0.98]'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>正在投递申请到 AkiLab...</span>
                    </>
                  ) : cooldownSeconds > 0 ? (
                    <>
                      <Clock className="w-4 h-4 text-cyan-200" />
                      <span>提交冷却中 ({cooldownSeconds}s)</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>提交对等互联申请</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
