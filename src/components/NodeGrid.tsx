import React, { useState, useMemo } from 'react';
import { useNetwork } from '../context/NetworkContext';
import type { RegionType } from '../types/network';
import { NodeCard } from './NodeCard';
import { useToast } from './Toast';
import { Layers, LayoutGrid, Table as TableIcon, Copy, Terminal } from 'lucide-react';

interface NodeGridProps {
  onSelectNode?: (nodeId: string) => void;
}

export const NodeGrid: React.FC<NodeGridProps> = ({ onSelectNode }) => {
  const { nodes } = useNetwork();
  const [selectedRegion, setSelectedRegion] = useState<RegionType>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
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
        
        {/* Header & Controls Bar */}
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

          {/* View Mode Toggle (Grid vs Table) */}
          <div className="flex items-center self-start sm:self-auto bg-black/50 border border-white/10 rounded-xl p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 px-3 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'grid' ? 'bg-cyan-500/20 text-cyan-300 shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="卡片网格视图"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>卡片</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 px-3 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'table' ? 'bg-cyan-500/20 text-cyan-300 shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="参数表格视图"
            >
              <TableIcon className="w-4 h-4" />
              <span>表格</span>
            </button>
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

        {/* Grid View Mode */}
        {viewMode === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredNodes.map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                onSelectForPeering={onSelectNode}
              />
            ))}
          </div>
        )}

        {/* Table View Mode */}
        {viewMode === 'table' && (
          <div className="glass-panel overflow-x-auto border border-cyan-500/20 shadow-2xl">
            <table className="w-full text-left text-xs font-mono border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-black/60 border-b border-white/10 text-slate-400 text-[11px] uppercase tracking-wider font-sans">
                  <th className="py-3.5 px-4">节点名称 / 代号</th>
                  <th className="py-3.5 px-4">状态</th>
                  <th className="py-3.5 px-4">WireGuard Endpoint</th>
                  <th className="py-3.5 px-4">推荐 MTU</th>
                  <th className="py-3.5 px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredNodes.map((node) => (
                  <tr key={node.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-3 px-4 font-sans font-medium text-white flex items-center gap-2.5">
                      <span className="text-xl">{node.flag}</span>
                      <div>
                        <div className="font-semibold">{node.name}</div>
                        <div className="text-[11px] font-mono text-cyan-400">{node.code} &middot; {node.isp}</div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] ${
                        node.status === 'active' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}>
                        {node.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-cyan-300 font-semibold">
                      <div className="flex items-center gap-1.5">
                        <span>{node.endpointDomain}</span>
                        <button onClick={() => copyToClipboard(node.endpointDomain, 'Endpoint')} className="text-slate-500 hover:text-white p-1 cursor-pointer">
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-200 font-bold">{node.mtu}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          if (onSelectNode) onSelectNode(node.id);
                        }}
                        className="btn-cyber px-3 py-1.5 rounded-lg text-xs inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Terminal className="w-3.5 h-3.5" />
                        <span>Peer</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </section>
  );
};
