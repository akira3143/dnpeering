import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNetwork } from '../context/NetworkContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import {
  Terminal,
  Activity,
  Radio,
  Search,
  Zap,
  Play,
  RotateCcw,
  Copy,
  Server,
  Cpu,
  Layers,
  Globe,
  Sparkles,
} from 'lucide-react';

export type LgCommandType = 'route' | 'ping' | 'traceroute' | 'protocols' | 'status' | 'memory';

interface LgQueryResponse {
  success: boolean;
  isLive: boolean;
  isMock?: boolean;
  nodeId: string;
  command: string;
  output: string;
  durationMs: number;
  error?: string;
}

export const LookingGlass: React.FC = () => {
  const { nodes, networkMeta } = useNetwork();
  const { user } = useAuth();
  const { showToast, copyToClipboard } = useToast();

  const [selectedNodeId, setSelectedNodeId] = useState<string>(nodes[0]?.id || 'jp07');
  const [commandType, setCommandType] = useState<LgCommandType>('route');
  const [targetInput, setTargetInput] = useState<string>('172.20.0.53');
  const [pingCount, setPingCount] = useState<number>(4);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [historyResults, setHistoryResults] = useState<LgQueryResponse | null>(null);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const autoRunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) || nodes[0];
  }, [nodes, selectedNodeId]);

  // Preset target list
  const presetTargets = useMemo(() => {
    const list: { label: string; value: string }[] = [
      { label: 'DN42 Anycast DNS (v4)', value: '172.20.0.53' },
      { label: 'DN42 Anycast DNS (v6)', value: 'fd42:d42:d42:54::1' },
    ];

    if (activeNode.tunnelIpv4) {
      list.push({ label: `${activeNode.code} 本地 IPv4`, value: activeNode.tunnelIpv4 });
    }
    if (activeNode.tunnelIpv6ULA) {
      list.push({ label: `${activeNode.code} 本地 IPv6`, value: activeNode.tunnelIpv6ULA });
    }

    if (user?.cleanAsn) {
      list.unshift({ label: `我的 ASN (AS${user.cleanAsn})`, value: `AS${user.cleanAsn}` });
    }
    return list;
  }, [activeNode, user]);

  // Execute query handler
  const handleExecuteQuery = useCallback(async (nodeOverride?: string, typeOverride?: LgCommandType, targetOverride?: string) => {
    const node = nodeOverride || selectedNodeId;
    const type = typeOverride || commandType;
    const target = (targetOverride !== undefined ? targetOverride : targetInput).trim();

    // Validation
    if ((type === 'ping' || type === 'traceroute') && !target) {
      showToast('Ping 和 Traceroute 探测必须提供目标 IP 或主机名', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/looking-glass/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: node,
          commandType: type,
          target,
          options: { count: pingCount },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || '该节点未响应或离线', 'error');
        setHistoryResults(data.output ? data : {
          success: false,
          isLive: false,
          nodeId: node,
          command: `${type} ${target}`,
          output: `❌ 诊断服务异常：${data.error || '无法连接到探测节点'}`,
          durationMs: data.durationMs || 0,
        });
      } else {
        setHistoryResults(data);
      }
    } catch {
      showToast('网络通信异常，请检查连接后重试', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [selectedNodeId, commandType, targetInput, pingCount, showToast]);

  // Listen for custom trigger event from other components (NodeCard / Dashboard)
  useEffect(() => {
    const handleCustomTrigger = (e: CustomEvent<{ nodeId?: string; commandType?: LgCommandType; target?: string; autoRun?: boolean }>) => {
      if (!e.detail) return;
      if (e.detail.nodeId && nodes.some((n) => n.id === e.detail.nodeId)) {
        setSelectedNodeId(e.detail.nodeId);
      }
      if (e.detail.commandType) {
        setCommandType(e.detail.commandType);
      }
      if (e.detail.target) {
        setTargetInput(e.detail.target);
      }

      // Scroll to Looking Glass smoothly
      const el = document.getElementById('looking-glass');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }

      if (e.detail.autoRun) {
        if (autoRunTimerRef.current) clearTimeout(autoRunTimerRef.current);
        autoRunTimerRef.current = setTimeout(() => {
          handleExecuteQuery(e.detail.nodeId || selectedNodeId, e.detail.commandType || commandType, e.detail.target || targetInput);
        }, 300);
      }
    };

    window.addEventListener('akilab-open-looking-glass' as any, handleCustomTrigger as any);
    return () => {
      window.removeEventListener('akilab-open-looking-glass' as any, handleCustomTrigger as any);
      if (autoRunTimerRef.current) clearTimeout(autoRunTimerRef.current);
    };
  }, [selectedNodeId, commandType, targetInput, handleExecuteQuery]);

  // Keyboard shortcut: Enter to execute
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleExecuteQuery();
    }
  };

  // Syntax highlighting for BIRD terminal output
  const renderHighlightedOutput = (text: string) => {
    if (!text) return null;

    const lines = text.split('\n');
    return lines.map((line, idx) => {
      // Highlight comments or headers
      if (line.startsWith('BIRD ') || line.startsWith('Table ')) {
        return (
          <div key={idx} className="text-cyan-400 font-semibold">
            {line}
          </div>
        );
      }
      if (line.startsWith('PING ') || line.startsWith('traceroute to ')) {
        return (
          <div key={idx} className="text-emerald-400 font-semibold">
            {line}
          </div>
        );
      }
      if (line.includes('Established') || line.includes('ROA_VALID')) {
        return (
          <div key={idx} className="text-emerald-300">
            {line}
          </div>
        );
      }
      if (line.includes('Active') || line.includes('Connect') || line.includes('ROA_UNKNOWN')) {
        return (
          <div key={idx} className="text-amber-300">
            {line}
          </div>
        );
      }
      if (line.includes('Down') || line.includes('Idle') || line.includes('ROA_INVALID') || line.includes('❌')) {
        return (
          <div key={idx} className="text-rose-400">
            {line}
          </div>
        );
      }
      if (line.trim().startsWith('via ') || line.trim().startsWith('BGP.')) {
        return (
          <div key={idx} className="text-slate-300 pl-2">
            {line}
          </div>
        );
      }

      return (
        <div key={idx} className="text-slate-300">
          {line}
        </div>
      );
    });
  };

  return (
    <section id="looking-glass" className="w-full py-10 scroll-mt-20">
      <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Title Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono tracking-widest uppercase">
              <Terminal className="w-4 h-4" />
              <span>BGP Routing & Network Inspector</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-sans flex items-center gap-3">
              <span>全网路由透视与网络诊断</span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono font-normal">
                bird-lg-go Engine
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 font-sans max-w-2xl">
              直接从 AkiLab 全球边缘 PoP 节点与 BIRD 核心路由反射器发起实时 Ping、Traceroute 与 BGP 路由表穿透查询。
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-black/40 px-3.5 py-2 rounded-xl border border-white/10 shrink-0">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>核心 RR 协议中枢：</span>
            <span className="text-cyan-300 font-semibold">{networkMeta.asn}</span>
          </div>
        </div>

        {/* Control Deck (Glass Panel) */}
        <div className="glass-panel p-5 sm:p-6 border border-cyan-500/20 shadow-2xl space-y-6">
          
          {/* Step 1: Select Source Probe Node */}
          <div className="space-y-2.5">
            <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider font-mono pl-1.5 flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-cyan-400" />
              <span>1. 选择探测源节点 (Source PoP Node)</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {nodes.map((node) => {
                const isSelected = node.id === selectedNodeId;
                return (
                  <button
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex items-center justify-between group ${
                      isSelected
                        ? 'bg-gradient-to-r from-cyan-950/80 to-blue-950/60 border-cyan-400 text-white shadow-lg shadow-cyan-950/50 scale-[1.01]'
                        : 'bg-black/40 hover:bg-white/5 border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{node.flag}</span>
                      <div>
                        <div className="text-xs font-bold font-sans flex items-center gap-1.5">
                          <span>{node.code}</span>
                          <span className="text-slate-500">&middot;</span>
                          <span className="text-slate-300 font-normal">{node.city}</span>
                        </div>
                        <div className="text-[11px] font-mono text-cyan-300/80 mt-0.5">
                          {node.endpointDomain}
                        </div>
                      </div>
                    </div>

                    <div className={`w-3 h-3 rounded-full border flex items-center justify-center transition-colors ${
                      isSelected ? 'border-cyan-400 bg-cyan-400' : 'border-white/20 group-hover:border-cyan-400/50'
                    }`}>
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-black"></div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Select Command Mode */}
          <div className="space-y-2.5 pt-2 border-t border-white/5">
            <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider font-mono pl-1.5 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>2. 诊断指令模式 (Diagnostic Mode)</span>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {[
                { id: 'route', label: 'BGP 路由查询', cmd: 'show route', icon: Globe },
                { id: 'ping', label: 'Ping 连通性', cmd: 'ping -c 4', icon: Zap },
                { id: 'traceroute', label: 'Traceroute 追踪', cmd: 'traceroute', icon: Activity },
                { id: 'protocols', label: 'BGP 邻居概览', cmd: 'show protocols', icon: Radio },
                { id: 'status', label: 'BIRD 运行健康度', cmd: 'show status', icon: Cpu },
              ].map((m) => {
                const isSelected = commandType === m.id;
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      setCommandType(m.id as LgCommandType);
                      if (m.id === 'status') {
                        setTargetInput('');
                      } else if (m.id === 'protocols' && !targetInput.startsWith('dn42_')) {
                        setTargetInput('');
                      }
                    }}
                    className={`px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[58px] ${
                      isSelected
                        ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-md shadow-cyan-950/40'
                        : 'bg-black/30 hover:bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold font-sans">{m.label}</span>
                      <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-cyan-400' : 'text-slate-500'}`} />
                    </div>
                    <span className="text-[10px] font-mono text-cyan-300/70">{m.cmd}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3: Target Input & Quick Preset Chips */}
          <div className="space-y-3 pt-2 border-t border-white/5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider font-mono pl-1.5 flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-cyan-400" />
                <span>3. 目标参数 (Target IPv4 / IPv6 / Prefix / ASN)</span>
              </label>

              {commandType === 'ping' && (
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <span>发包数:</span>
                  {[3, 4, 8].map((c) => (
                    <button
                      key={c}
                      onClick={() => setPingCount(c)}
                      className={`px-2 py-0.5 rounded-md border text-[11px] cursor-pointer ${
                        pingCount === c ? 'bg-cyan-950 border-cyan-400 text-cyan-300' : 'bg-black/40 border-white/10 text-slate-400'
                      }`}
                    >
                      {c} 次
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Input Bar & Action Button */}
            <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    commandType === 'route'
                      ? '输入 IPv4 / IPv6 前缀或 ASN (如 172.20.0.53, fda2::1, AS4242421234，留空查全表)'
                      : commandType === 'protocols'
                      ? '输入协议名 (如 dn42_akilab_jp7，留空查询全部会话)'
                      : commandType === 'status'
                      ? '（无需指定目标，直接运行即可）'
                      : '输入目标 IP 地址或域名 (如 172.20.0.53, fd42:d42:d42:54::1)'
                  }
                  disabled={commandType === 'status'}
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-[#080d19] border border-white/15 font-mono text-xs text-cyan-200 focus:border-cyan-400 focus:outline-none placeholder:text-slate-600 transition-colors disabled:opacity-50"
                />
                {targetInput && commandType !== 'status' && (
                  <button
                    onClick={() => setTargetInput('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs cursor-pointer"
                    aria-label="清空输入框"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                onClick={() => handleExecuteQuery()}
                disabled={isLoading}
                className="btn-primary px-6 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shrink-0 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>探测中...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>执行诊断</span>
                    <span className="hidden lg:inline text-[10px] opacity-75 font-mono">↵</span>
                  </>
                )}
              </button>
            </div>

            {/* Smart Preset Chips */}
            {commandType !== 'status' && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1 pl-1">
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  <span>快捷填入:</span>
                </span>
                {presetTargets.map((chip, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setTargetInput(chip.value);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-black/40 hover:bg-cyan-950/60 border border-white/10 hover:border-cyan-500/40 text-[11px] font-mono text-slate-300 hover:text-cyan-300 transition-all cursor-pointer"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

          </div>

        </div>

        {/* Terminal Output Console */}
        <div className="rounded-2xl bg-[#050811] border border-white/10 shadow-2xl overflow-hidden flex flex-col font-mono text-xs">
          
          {/* Terminal Titlebar */}
          <div className="px-4 py-2.5 bg-black/60 border-b border-white/10 flex items-center justify-between gap-3 text-slate-400 select-none">
            
            {/* Left: macOS Dots & Node Header */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
              </div>

              <div className="text-[11px] font-mono text-slate-300 flex items-center gap-1.5">
                <span className="text-cyan-400 font-bold">{activeNode.flag} {activeNode.code}</span>
                <span className="text-slate-600">:~#</span>
                <span className="text-slate-400">{historyResults?.command || 'birdc'}</span>
              </div>
            </div>

            {/* Right: Metrics & Actions */}
            <div className="flex items-center gap-3 text-[11px]">
              {historyResults && (
                <>
                  {historyResults.isLive ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>LIVE SOCKET</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-500/40 text-rose-300 font-mono text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                      <span>NODE OFFLINE</span>
                    </span>
                  )}

                  <span className="text-slate-400 font-mono">
                    ⏱️ {historyResults.durationMs}ms
                  </span>
                </>
              )}

              <button
                onClick={() => {
                  if (historyResults?.output) {
                    copyToClipboard(historyResults.output, '控制台输出');
                  }
                }}
                disabled={!historyResults?.output}
                className="p-1 sm:px-2 sm:py-0.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-cyan-300 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-30"
                title="复制输出结果"
              >
                <Copy className="w-3 h-3" />
                <span className="hidden sm:inline">复制</span>
              </button>

              <button
                onClick={() => setHistoryResults(null)}
                disabled={!historyResults}
                className="p-1 sm:px-2 sm:py-0.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-rose-300 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-30"
                title="清空终端"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">清空</span>
              </button>
            </div>

          </div>

          {/* Terminal Console Canvas */}
          <div className="p-4 sm:p-5 min-h-[260px] max-h-[460px] overflow-y-auto space-y-1 text-[12px] leading-relaxed select-text">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center min-h-[220px] text-slate-500 space-y-3">
                <div className="w-7 h-7 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin"></div>
                <div className="text-xs font-mono text-cyan-300 animate-pulse">
                  正在与 {activeNode.code} 节点建立 BIRD 控制管道并执行诊断指令...
                </div>
              </div>
            ) : historyResults ? (
              <div className="space-y-1">
                {renderHighlightedOutput(historyResults.output)}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[220px] text-slate-500 space-y-3">
                <Terminal className="w-8 h-8 text-slate-600" />
                <div className="text-center space-y-1">
                  <p className="text-xs font-mono text-slate-400">
                    控制台就绪 · 点击上方的「执行诊断」或快捷芯片开始探测
                  </p>
                  <p className="text-[11px] font-mono text-slate-600">
                    支持 IPv4/IPv6 前缀、BGP 团体属性、链路延迟与逐跳跃点实时解析
                  </p>
                </div>
              </div>
            )}
            <div ref={terminalEndRef} />
          </div>

          {/* Terminal Bottom Status Bar */}
          <div className="px-4 py-2 bg-black/40 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400">Node:</span>
              <span className="text-slate-300">{activeNode.code} ({activeNode.city})</span>
              <span className="text-slate-600">|</span>
              <span className="text-cyan-400">LLA:</span>
              <span className="text-slate-300">{activeNode.tunnelIpv6LLA}</span>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-slate-500">
              <span>Ready for BIRD2 BGP Probing</span>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
