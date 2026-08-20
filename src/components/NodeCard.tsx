import React from 'react';
import type { NodeInfo } from '../types/network';
import { useToast } from './Toast';
import { useAuth } from '../context/AuthContext';
import { Copy, Terminal, Activity } from 'lucide-react';

interface NodeCardProps {
  node: NodeInfo;
  onSelectForPeering?: (nodeId: string) => void;
}

export const NodeCard: React.FC<NodeCardProps> = ({ node, onSelectForPeering }) => {
  const { copyToClipboard } = useToast();
  const { activeSessions, setIsDashboardOpen } = useAuth();

  const userSession = activeSessions.find(s => s.nodeId === node.id);

  const handleOpenLookingGlass = () => {
    window.dispatchEvent(
      new CustomEvent('akilab-open-looking-glass', {
        detail: {
          nodeId: node.id,
          commandType: 'route',
          target: node.tunnelIpv4,
          autoRun: true,
        },
      })
    );
  };

  return (
    <div className="glass-panel p-5 sm:p-6 flex flex-col justify-between space-y-4 border border-white/[0.08] hover:border-cyan-500/40 hover:shadow-2xl hover:shadow-cyan-950/40 transition-all duration-300 group rounded-2xl relative">
      
      {/* Card Header & Parameters */}
      <div className="space-y-3.5">
        
        {/* Top Meta: Code Pill + Region & City + Status */}
        <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{node.flag}</span>
            <span className="font-mono text-sm font-bold text-white tracking-wide">
              {node.code}
            </span>
            <span className="text-xs text-slate-400 font-sans">
              {node.city}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono">
            {userSession ? (
              <button
                onClick={() => setIsDashboardOpen(true)}
                className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 flex items-center gap-1 text-[11px] hover:bg-emerald-900/80 transition-colors cursor-pointer"
                title="你在此节点已有对等互联会话，点击查看详情"
              >
                <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>已互联 (v{userSession.version || 1})</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Open Peering</span>
              </span>
            )}
          </div>
        </div>

        {/* Node Name & ISP */}
        <div>
          <h3 className="font-bold text-base text-white font-sans group-hover:text-cyan-300 transition-colors">
            {node.name}
          </h3>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            {node.isp} &middot; {node.endpointDomain}
          </p>
        </div>

        {/* Key Parameters Table */}
        <div className="rounded-xl bg-black/40 border border-white/5 divide-y divide-white/5 font-mono text-xs overflow-hidden">
          {/* IPv6 LLA */}
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-white/[0.02] transition-colors">
            <span className="text-slate-400 font-sans text-xs shrink-0">IPv6 (LLA):</span>
            <div className="flex items-center gap-2">
              <span className="text-cyan-300 font-semibold">{node.tunnelIpv6LLA}</span>
              <button
                onClick={() => copyToClipboard(node.tunnelIpv6LLA, 'IPv6 LLA')}
                className="text-slate-500 hover:text-cyan-300 p-0.5 transition-colors cursor-pointer shrink-0"
                title="复制 IPv6 LLA"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* IPv6 ULA */}
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-white/[0.02] transition-colors">
            <span className="text-slate-400 font-sans text-xs shrink-0">IPv6 (ULA):</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-200">{node.tunnelIpv6ULA}</span>
              <button
                onClick={() => copyToClipboard(node.tunnelIpv6ULA || '', 'IPv6 ULA')}
                className="text-slate-500 hover:text-cyan-300 p-0.5 transition-colors cursor-pointer shrink-0"
                title="复制 IPv6 ULA"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* IPv4 */}
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-white/[0.02] transition-colors">
            <span className="text-slate-400 font-sans text-xs shrink-0">IPv4 (DN42):</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-200">{node.tunnelIpv4}</span>
              <button
                onClick={() => copyToClipboard(node.tunnelIpv4 || '', 'IPv4')}
                className="text-slate-500 hover:text-cyan-300 p-0.5 transition-colors cursor-pointer shrink-0"
                title="复制 IPv4"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Endpoint Domain */}
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-white/[0.02] transition-colors">
            <span className="text-slate-400 font-sans text-xs shrink-0">Endpoint:</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-200 truncate max-w-[170px]" title={node.endpointDomain}>
                {node.endpointDomain}
              </span>
              <button
                onClick={() => copyToClipboard(node.endpointDomain, 'Endpoint')}
                className="text-slate-500 hover:text-cyan-300 p-0.5 transition-colors cursor-pointer shrink-0"
                title="复制 Endpoint"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Buttons */}
      <div className="flex items-center gap-2 pt-3 border-t border-white/10">
        <button
          onClick={handleOpenLookingGlass}
          className="flex-1 py-2 px-2.5 rounded-xl bg-white/5 hover:bg-cyan-950/60 border border-white/10 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          title="使用 Looking Glass 探测此节点"
        >
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span>路由探测</span>
        </button>

        <button
          onClick={() => {
            if (onSelectForPeering) onSelectForPeering(node.id);
          }}
          className="btn-primary py-2 px-3.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-cyan-950/40 cursor-pointer shrink-0"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>发起 Peer</span>
        </button>
      </div>

    </div>
  );
};
