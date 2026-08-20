import React, { useState, useMemo } from 'react';
import { BGP_COMMUNITIES } from '../data/network';
import { useToast } from './Toast';
import { ShieldCheck, Search, Tag, CheckCircle, Copy } from 'lucide-react';

export const RoutingPolicy: React.FC = () => {
  const [communityCategory, setCommunityCategory] = useState<string>('all');
  const [searchCommunity, setSearchCommunity] = useState<string>('');
  const { copyToClipboard } = useToast();

  const filteredCommunities = useMemo(() => {
    return BGP_COMMUNITIES.filter((item) => {
      const matchCat = communityCategory === 'all' || item.category === communityCategory;
      const query = searchCommunity.toLowerCase().trim();
      const matchSearch =
        !query ||
        item.community.toLowerCase().includes(query) ||
        item.action.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query);

      return matchCat && matchSearch;
    });
  }, [communityCategory, searchCommunity]);

  return (
    <section id="policy" className="w-full py-8 scroll-mt-20">
      <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Title */}
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono tracking-widest uppercase mb-1">
            <ShieldCheck className="w-4 h-4" />
            BGP Routing Policy & Filters
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-sans">
            路由策略与 BGP 团体属性 (Communities)
          </h2>
        </div>

        {/* 3 Core Policy Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Policy Card 1 */}
          <div className="glass-panel p-6 space-y-3 border-t-2 border-t-cyan-400 shadow-xl">
            <div className="flex items-center gap-2.5 text-cyan-300 font-bold text-sm font-sans">
              <CheckCircle className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>ROA / RPKI 严格校验</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              所有接入节点均启用了自动化 DN42 官方 Registry ROA 表同步机制。对于 <strong className="text-rose-400 font-mono">ROA_INVALID</strong>（无效签名或前缀超标）的路由将自动丢弃，杜绝 BGP 路由劫持。
            </p>
          </div>

          {/* Policy Card 2 */}
          <div className="glass-panel p-6 space-y-3 border-t-2 border-t-emerald-400 shadow-xl">
            <div className="flex items-center gap-2.5 text-emerald-300 font-bold text-sm font-sans">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Bogon & 前缀掩码限制</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              仅接收属于 DN42 合法分配范围内的地址。默认路由 (<code className="font-mono text-cyan-300">0.0.0.0/0</code>, <code className="font-mono text-cyan-300">::/0</code>) 将被自动过滤。IPv4 允许掩码 <code className="font-mono text-cyan-300">/21 ~ /29</code>，IPv6 允许 <code className="font-mono text-cyan-300">/29 ~ /64</code>。
            </p>
          </div>

          {/* Policy Card 3 */}
          <div className="glass-panel p-6 space-y-3 border-t-2 border-t-purple-400 shadow-xl">
            <div className="flex items-center gap-2.5 text-purple-300 font-bold text-sm font-sans">
              <CheckCircle className="w-4 h-4 text-purple-400 shrink-0" />
              <span>路由传播策略 (Propagation)</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              默认采用开放对等（Open Peering）与就近出口原则。支持通过标准 BGP Community 对特定路由进行导出控制或 AS-Path 附加调整。
            </p>
          </div>

        </div>

        {/* BGP Communities Matrix */}
        <div className="glass-panel p-6 space-y-5 border border-cyan-500/20 shadow-2xl">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2 font-sans">
                <Tag className="w-4 h-4 text-cyan-400" />
                <span>BGP Community 属性控制表</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-sans">
                在你的 BIRD/FRR 中标记以下 Community 即可控制在我方网络中的路由传播与优先级。
              </p>
            </div>

            {/* Category Filter & Search */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="搜索属性或动作..."
                  value={searchCommunity}
                  onChange={(e) => setSearchCommunity(e.target.value)}
                  className="pl-9 pr-3 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-sans"
                />
              </div>

              <select
                value={communityCategory}
                onChange={(e) => setCommunityCategory(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 font-sans"
              >
                <option value="all">全部分类</option>
                <option value="export">导出过滤 (Export Control)</option>
                <option value="prepend">AS-Prepend</option>
                <option value="local_pref">Local-Preference</option>
              </select>
            </div>
          </div>

          {/* Communities Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-black/50 text-slate-400 border-b border-white/10 uppercase text-[11px] font-sans">
                <tr>
                  <th className="py-3 px-4">Community 标识</th>
                  <th className="py-3 px-4">动作名称</th>
                  <th className="py-3 px-4">详细描述与作用</th>
                  <th className="py-3 px-4 text-right">复制</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-sans">
                {filteredCommunities.map((item) => (
                  <tr key={item.community} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-cyan-300">
                      {item.community}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-0.5 rounded text-[11px] font-mono bg-cyan-950/50 text-cyan-200 border border-cyan-500/25">
                        {item.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 text-xs font-sans">
                      {item.description}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => copyToClipboard(item.community, 'BGP Community')}
                        className="text-slate-500 hover:text-cyan-300 p-1.5 transition-colors cursor-pointer"
                        title="复制 Community"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>

      </div>
    </section>
  );
};
