import React from 'react';
import type { NodeInfo } from '../types/network';
import { useToast } from './Toast';
import { useAuth } from '../context/AuthContext';
import { CountryFlag } from './CountryFlag';
import { Copy, Terminal, Activity } from 'lucide-react';

interface NodeCardProps {
  node: NodeInfo;
  onSelectForPeering?: (nodeId: string) => void;
}

export const NodeCard: React.FC<NodeCardProps> = ({ node, onSelectForPeering }) => {
  const { copyToClipboard } = useToast();
  const { activeSessions, setIsDashboardOpen } = useAuth();

  const userSession = activeSessions.find(s => s.nodeId === node.id);

  return (
    <div className="glass-panel p-5 sm:p-6 flex flex-col justify-between space-y-4 border border-white/[0.08] hover:border-cyan-500/40 hover:shadow-2xl hover:shadow-cyan-950/40 transition-all duration-300 group rounded-2xl relative">
      
      {/* Card Header & Parameters */}
      <div className="space-y-3.5">
        
        {/* Top Meta: Code Pill + Region & City + Status */}
        <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <CountryFlag flag={node.flag} code={node.code} country={node.country} className="w-5 h-3.5 object-cover rounded-[2px] shadow-sm" />
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

        {/* Key Parameters Table (Only Endpoint) */}
        <div className="rounded-xl bg-black/40 border border-white/5 font-mono text-xs overflow-hidden">
          {/* Endpoint Domain */}
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-white/[0.02] transition-colors">
            <span className="text-slate-400 font-sans text-xs shrink-0">Endpoint:</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-200 truncate max-w-[200px]" title={node.endpointDomain}>
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

      {/* Bottom Action Button (Full width 发起 Peer) */}
      <div className="pt-3 border-t border-white/10">
        <button
          onClick={() => {
            if (onSelectForPeering) onSelectForPeering(node.id);
          }}
          className="btn-primary w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md shadow-cyan-950/40 cursor-pointer"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>发起 Peer</span>
        </button>
      </div>

    </div>
  );
};
