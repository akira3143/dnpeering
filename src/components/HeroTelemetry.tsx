import React from 'react';
import { useNetwork } from '../context/NetworkContext';
import { useToast } from './Toast';
import { Server, Copy, ArrowRight, ExternalLink, HeartHandshake } from 'lucide-react';

export const HeroTelemetry: React.FC = () => {
  const { networkMeta } = useNetwork();
  const { copyToClipboard } = useToast();

  return (
    <section className="w-full relative pt-8 pb-6 overflow-hidden">
      <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Humble & Welcoming Introduction */}
        <div className="space-y-4 max-w-3xl">
          
          {/* Friendly Welcome Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-xs font-mono">
            <HeartHandshake className="w-3.5 h-3.5 text-cyan-400" />
            <span>Open Peering &bull; 欢迎自由互联与技术交流</span>
          </div>

          {/* Clean Humble Title */}
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white font-sans leading-tight">
            AkiLab Networks <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-400">
              个人路由实验网络 & 互联门户
            </span>
          </h1>

          {/* Sincere, Low-profile & Humorous Description */}
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed font-sans">
            AkiLab 是由 <strong className="text-white font-semibold">AKIRA</strong> 维护的个人非盈利 DN42 实验网络（<code className="font-mono text-cyan-300 font-bold">{networkMeta.asn}</code>），由几台廉价服务器东拼西凑而成。纯粹用于学习与日常折腾（并保留因欠费或维护随时跑路的权利 🤪）。非常欢迎各位同好建立 BGP Peer 互联，一起愉快炸网与交流探索！
          </p>

          {/* Action Link */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a
              href="#nodes"
              className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold shadow-lg shadow-cyan-500/20 cursor-pointer"
            >
              <Server className="w-4 h-4" />
              <span>浏览可用节点列表</span>
              <ArrowRight className="w-4 h-4" />
            </a>
            {networkMeta.lookingGlassUrl && (
              <a
                href={networkMeta.lookingGlassUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs sm:text-sm font-medium transition-all inline-flex items-center gap-1.5"
              >
                <span>Looking Glass</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            )}
          </div>
        </div>

        {/* Compact 3-Column Practical Network Parameters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          
          {/* Card 1: ASN */}
          <div className="glass-panel p-4 flex items-center justify-between border-t-2 border-t-cyan-400 shadow-lg">
            <div>
              <span className="text-[11px] font-sans text-slate-400">自治系统编号 (ASN)</span>
              <div className="text-base font-mono font-bold text-white mt-0.5">{networkMeta.asn}</div>
            </div>
            <button
              onClick={() => copyToClipboard(networkMeta.asn, 'ASN')}
              className="p-2 rounded-lg bg-white/5 hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
              title="复制 ASN"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>

          {/* Card 2: IPv4 Pool */}
          <div className="glass-panel p-4 flex items-center justify-between border-t-2 border-t-emerald-400 shadow-lg">
            <div>
              <span className="text-[11px] font-sans text-slate-400">IPv4 广播地址池</span>
              <div className="text-base font-mono font-bold text-emerald-400 mt-0.5">{networkMeta.ipv4Pool}</div>
            </div>
            <button
              onClick={() => copyToClipboard(networkMeta.ipv4Pool, 'IPv4')}
              className="p-2 rounded-lg bg-white/5 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-300 transition-colors cursor-pointer"
              title="复制 IPv4"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>

          {/* Card 3: IPv6 Pool */}
          <div className="glass-panel p-4 flex items-center justify-between border-t-2 border-t-purple-400 shadow-lg">
            <div>
              <span className="text-[11px] font-sans text-slate-400">IPv6 ULA 地址池</span>
              <div className="text-base font-mono font-bold text-purple-400 mt-0.5">{networkMeta.ipv6Pool}</div>
            </div>
            <button
              onClick={() => copyToClipboard(networkMeta.ipv6Pool, 'IPv6')}
              className="p-2 rounded-lg bg-white/5 hover:bg-purple-500/20 text-slate-400 hover:text-purple-300 transition-colors cursor-pointer"
              title="复制 IPv6"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>
    </section>
  );
};
