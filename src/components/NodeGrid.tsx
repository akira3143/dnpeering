import React, { useState, useMemo } from 'react';
import { useNetwork } from '../context/NetworkContext';
import { useAuth } from '../context/AuthContext';
import type { RegionType } from '../types/network';
import { useToast } from './Toast';
import { Layers, Copy, Terminal, Activity } from 'lucide-react';

interface NodeGridProps {
  onSelectNode?: (nodeId: string) => void;
}

export const NodeGrid: React.FC<NodeGridProps> = ({ onSelectNode }) => {
  const { nodes } = useNetwork();
  const { activeSessions, setIsDashboardOpen } = useAuth();
  const [selectedRegion, setSelectedRegion] = useState<RegionType>('all');
  const { copyToClipboard } = useToast();

  const filteredNodes = useMemo(() => {
    return nodes.filter((node) => {
      return selectedRegion === 'all' || node.region === selectedRegion;
    });
  }, [nodes, selectedRegion]);

  const allRegionTabs: { id: RegionType; label: string; count: number }[] = [
    { id: 'all', label: '全部可用节点', count: nodes.length },
    { id: 'apac', label: '亚太地区 (APAC)', count: nodes.filter((n) => n.region === 'apac').length },
    { id: 'na', label: '北美地区 (NA)', count: nodes.filter((n) => n.region === 'na').length },
    { id: 'eu', label: '欧洲地区 (EU)', count: nodes.filter((n) => n.region === 'eu').length },
  ];

  const regionTabs = allRegionTabs.filter((tab) => tab.id === 'all' || tab.count > 0);

  return (
    <section id="nodes" className="w-full py-8 scroll-mt-20">
      <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono tracking-widest uppercase mb-1">
              <Layers className="w-4 h-4" />
              Global Available PoPs
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-sans">
              可用节点列表
            </h2>
          </div>
        </div>

        {/* Region Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
          {regionTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedRegion(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-2 border cursor-pointer ${
                selectedRegion === tab.id
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-950/40 font-semibold'
                  : 'bg-white/[0.02] border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                selectedRegion === tab.id ? 'bg-cyan-400 text-black font-bold' : 'bg-white/10 text-slate-400'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Table / List View */}
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
          <div className="overflow-x-auto">
            <div className="min-w-[780px]">
              
              {/* Table Header */}
              <div className="grid grid-cols-[minmax(240px,2.8fr)_100px_minmax(200px,2.2fr)_80px_120px] items-center px-5 py-3 bg-black/60 border-b border-white/10 text-slate-500 text-[11px] uppercase tracking-wider font-sans select-none font-medium">
                <div className="pl-2">节点名称 / 代号</div>
                <div className="text-center">状态</div>
                <div className="text-center">Endpoint</div>
                <div className="text-center">MTU</div>
                <div className="text-center">操作</div>
              </div>

              {/* Table Body Rows */}
              <div className="divide-y divide-white/[0.04] font-mono text-xs">
                {filteredNodes.map((node, idx) => {
                  const userSession = activeSessions.find((s) => s.nodeId === node.id);
                  return (
                    <div
                      key={node.id}
                      className={`grid grid-cols-[minmax(240px,2.8fr)_100px_minmax(200px,2.2fr)_80px_120px] items-center px-5 py-3.5 hover:bg-white/[0.03] transition-colors group ${idx % 2 === 1 ? 'bg-white/[0.01]' : ''}`}
                    >
                      {/* Column 1: Node Name & Code */}
                      <div className="flex items-center gap-3 pl-2 min-w-0">
                        <span className="text-lg shrink-0 select-none leading-none">{node.flag}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-sans font-semibold text-[13px] text-white group-hover:text-cyan-300 transition-colors truncate leading-snug">
                            {node.name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 mt-0.5 flex items-center gap-1.5 truncate">
                            <span className="text-cyan-400/80 font-semibold">{node.code}</span>
                            <span className="text-slate-600">·</span>
                            <span>{node.city}</span>
                            <span className="text-slate-600">·</span>
                            <span className="text-slate-500/80">{node.isp}</span>
                          </div>
                        </div>
                      </div>

                      {/* Column 2: Status */}
                      <div className="flex items-center justify-center">
                        {userSession ? (
                          <button
                            onClick={() => setIsDashboardOpen(true)}
                            className="px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5 text-[10px] hover:bg-emerald-900/80 transition-colors cursor-pointer"
                            title="你在此节点已有对等互联会话，点击查看详情"
                          >
                            <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
                            <span>已互联</span>
                          </button>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium ${
                            node.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${node.status === 'active' ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`}></span>
                            <span>{node.status === 'active' ? 'ACTIVE' : 'MAINT'}</span>
                          </span>
                        )}
                      </div>

                      {/* Column 3: Endpoint */}
                      <div className="flex items-center justify-center gap-1.5">
                        <code className="truncate text-slate-300 group-hover:text-cyan-200 transition-colors text-[12px]" title={node.endpointDomain}>
                          {node.endpointDomain}
                        </code>
                        <button
                          onClick={() => copyToClipboard(node.endpointDomain, 'Endpoint')}
                          className="text-slate-600 hover:text-cyan-300 p-1 rounded hover:bg-white/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100"
                          title="复制 Endpoint"
                          aria-label="复制 Endpoint"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Column 4: MTU */}
                      <div className="text-center">
                        <span className="font-mono text-slate-400 text-xs tabular-nums">
                          {node.mtu}
                        </span>
                      </div>

                      {/* Column 5: Action */}
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => {
                            if (onSelectNode) onSelectNode(node.id);
                          }}
                          className="btn-primary px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-md shadow-cyan-950/40"
                        >
                          <Terminal className="w-3.5 h-3.5" />
                          <span>发起 Peer</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
