import React from 'react';
import { MIN_DN42_PORT, MAX_DN42_PORT } from '../data/network';
import { useNetwork } from '../context/NetworkContext';
import { usePeering } from '../context/PeeringContext';
import { useToast } from './Toast';
import { Calculator, Copy, ShieldAlert, CheckCircle2, Settings2, AlertOctagon, ChevronDown } from 'lucide-react';

export const PortCalculator: React.FC = () => {
  const { nodes } = useNetwork();
  const { copyToClipboard } = useToast();
  const {
    peerAsn,
    setPeerAsn,
    targetNodeId,
    setTargetNodeId,
    customHostPort,
    setCustomHostPort,
    isCustomPortExpanded,
    setIsCustomPortExpanded,
    usePeerFallbackPort,
    setUsePeerFallbackPort,
    hostPortInfo,
    peerPort,
    selectedNode,
    finalHostPort,
  } = usePeering();

  return (
    <section id="calculator" className="w-full py-6 scroll-mt-20">
      <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="glass-panel p-6 sm:p-7 border border-cyan-500/20 shadow-2xl space-y-5">
          
          {/* Header & Concise Rule */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono uppercase tracking-wider">
                <Calculator className="w-4 h-4" />
                <span>Deterministic Port Calculator</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-sans">
                WireGuard 互听端口快速计算与冲突校验
              </h2>
            </div>

            <div className="text-xs font-mono text-slate-300 bg-black/40 px-3.5 py-2 rounded-xl border border-white/10 flex items-center gap-2">
              <span className="text-cyan-400">AkiLab 节点监听:</span> 20000+ASN (备用 30000/40000+ASN)
              <span className="text-slate-600">|</span>
              <span className="text-purple-400">你的本地监听:</span> 23143 (备用 33143)
            </div>
          </div>

          {/* Standard 12-Column Responsive Grid (5 Cols Left : 7 Cols Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            
            {/* Left Inputs Card (5 Cols) */}
            <div className="lg:col-span-5 glass-card p-4.5 rounded-2xl border border-white/10 flex flex-col justify-between min-h-[175px]">
              
              <div className="space-y-3">
                {/* Row 1: Inputs Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 text-xs font-medium mb-1.5 font-sans pl-1.5">你的 ASN：</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-slate-500">AS</span>
                      <input
                        type="text"
                        value={peerAsn}
                        onChange={(e) => setPeerAsn(e.target.value)}
                        placeholder="424242"
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#080d19] border border-white/15 font-mono text-xs text-cyan-200 focus:border-cyan-400 focus:outline-none placeholder:text-slate-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 text-xs font-medium mb-1.5 font-sans pl-1.5">目标接入节点：</label>
                    <div className="relative">
                      <select
                        value={targetNodeId}
                        onChange={(e) => setTargetNodeId(e.target.value)}
                        className="w-full pl-3.5 pr-10 py-2 rounded-xl bg-[#080d19] border border-white/15 font-mono text-xs text-white focus:border-cyan-400 focus:outline-none transition-colors cursor-pointer appearance-none"
                      >
                        {nodes.map((n) => (
                          <option key={n.id} value={n.id} className="bg-[#0c1424] text-slate-100 py-2">
                            {n.code} &middot; {n.city}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>
                </div>

                {/* Smooth Collapsible Custom Port Input Drawer */}
                {isCustomPortExpanded && (
                  <div className={`p-2.5 rounded-xl bg-black/50 border transition-all animate-in fade-in-50 ${
                    !hostPortInfo.isAvailable ? 'border-red-500/50' : 'border-cyan-500/30'
                  }`}>
                    <div className="flex items-center justify-between mb-1 text-[11px] text-slate-300 pl-1.5">
                      <span>自定义 AkiLab 监听端口：</span>
                      <span className="text-slate-500 text-[10px]">范围 {MIN_DN42_PORT}~{MAX_DN42_PORT}</span>
                    </div>
                    <input
                      type="text"
                      value={customHostPort}
                      onChange={(e) => setCustomHostPort(e.target.value)}
                      placeholder=""
                      className={`w-full px-3 py-1.5 rounded-lg bg-[#080d19] border font-mono text-xs focus:outline-none transition-colors ${
                        !hostPortInfo.isAvailable
                          ? 'border-red-500 text-red-300'
                          : 'border-white/15 text-cyan-200 focus:border-cyan-400'
                      }`}
                    />
                  </div>
                )}
              </div>

              {/* Bottom Action Bar with standardized button & status */}
              <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsCustomPortExpanded(!isCustomPortExpanded)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-cyan-300 transition-colors cursor-pointer font-sans flex items-center gap-1.5"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  <span>{isCustomPortExpanded ? '收起自定义' : '自定义端口'}</span>
                </button>

                {hostPortInfo.isAvailable ? (
                  <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>已自动分配端口</span>
                  </span>
                ) : (
                  <span className="text-red-400 font-mono text-[11px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                    <span>端口已占用</span>
                  </span>
                )}
              </div>
            </div>

            {/* Right Container: 2 Standard Wide Result Cards (7 Cols) */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
              
              {/* Card 2: Host ListenPort Result */}
              <div className={`p-4.5 rounded-2xl border transition-all flex flex-col justify-between min-h-[175px] ${
                !hostPortInfo.isAvailable
                  ? 'bg-red-950/20 border-red-500/40'
                  : hostPortInfo.isFallback
                  ? 'bg-amber-950/20 border-amber-500/30'
                  : 'bg-black/60 border-cyan-500/30'
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-sans text-slate-400">
                      AkiLab 节点分配端口 ({selectedNode.code})
                    </div>
                    <div className="text-2xl font-extrabold font-mono mt-1">
                      {!hostPortInfo.isAvailable ? (
                        <span className="text-red-400 line-through">{finalHostPort}</span>
                      ) : (
                        <span className="text-cyan-300">{finalHostPort}</span>
                      )}
                    </div>
                  </div>

                  {hostPortInfo.isAvailable && (
                    <button
                      onClick={() => copyToClipboard(finalHostPort.toString(), 'AkiLab 监听端口')}
                      className="btn-cyber py-1.5 px-3 rounded-lg text-xs font-mono flex items-center gap-1 cursor-pointer shrink-0"
                      title="复制端口"
                    >
                      <Copy className="w-3 h-3" />
                      <span>复制</span>
                    </button>
                  )}
                </div>

                <div className="pt-2.5 border-t border-white/10 text-xs font-sans">
                  {!hostPortInfo.isAvailable ? (
                    <div className="text-red-300 flex items-center gap-1.5">
                      <AlertOctagon className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <span>{hostPortInfo.label}</span>
                    </div>
                  ) : hostPortInfo.isFallback ? (
                    <div className="text-amber-300 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{hostPortInfo.label} (已自动顺延防冲突)</span>
                    </div>
                  ) : (
                    <div className="text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{hostPortInfo.label} 空闲可用</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 3: Client ListenPort Result */}
              <div className="p-4.5 rounded-2xl bg-black/60 border border-purple-500/30 flex flex-col justify-between min-h-[175px]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-sans text-slate-400">对端本地监听端口 (ListenPort)</div>
                    <div className="text-2xl font-extrabold font-mono text-purple-300 mt-1">
                      {peerPort}
                    </div>
                  </div>

                  <button
                    onClick={() => copyToClipboard(peerPort.toString(), '对端监听端口')}
                    className="btn-cyber py-1.5 px-3 rounded-lg text-xs font-mono flex items-center gap-1 cursor-pointer shrink-0"
                    title="复制端口"
                  >
                    <Copy className="w-3 h-3" />
                    <span>复制</span>
                  </button>
                </div>

                <div className="pt-2.5 border-t border-white/10 flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-sans">固定监听 AkiLab ASN</span>
                  <label className="flex items-center gap-1.5 text-xs text-purple-300 cursor-pointer font-sans">
                    <input
                      type="checkbox"
                      checked={usePeerFallbackPort}
                      onChange={(e) => setUsePeerFallbackPort(e.target.checked)}
                      className="rounded border-white/20 bg-black/60 text-purple-500 focus:ring-0"
                    />
                    <span>切换备用 (33143)</span>
                  </label>
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
