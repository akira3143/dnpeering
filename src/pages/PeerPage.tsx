import React, { useEffect } from 'react';
import { useRouter } from '../router/Router';
import { usePeering } from '../context/PeeringContext';
import { useNetwork } from '../context/NetworkContext';
import { useAuth } from '../context/AuthContext';
import { ConfigGenerator } from '../components/ConfigGenerator';
import {
  ArrowLeft,
  X,
  Cpu,
  Server,
  Lock,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';

export const PeerPage: React.FC = () => {
  const { navigate, queryParams } = useRouter();
  const { nodes, networkMeta } = useNetwork();
  const { setTargetNodeId, selectedNode, finalHostPort, finalClientPort } = usePeering();
  const { isAuthenticated, setIsAuthModalOpen } = useAuth();

  // If URL has ?node=xxx, sync it with context
  useEffect(() => {
    if (queryParams.node && nodes.some((n) => n.id === queryParams.node)) {
      setTargetNodeId(queryParams.node);
    }
  }, [queryParams.node, nodes, setTargetNodeId]);

  // Support ESC key to return to home page smoothly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigate('/');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  // Auto-pop auth modal if unauthenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setIsAuthModalOpen(true);
    }
  }, [isAuthenticated, setIsAuthModalOpen]);

  // 🔒 Unauthenticated Interceptor Gatekeeper View
  if (!isAuthenticated) {
    return (
      <div className="w-full min-h-[85vh] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-3xl bg-[#090d19]/95 border border-cyan-500/30 p-6 sm:p-8 shadow-2xl shadow-cyan-950/60 text-slate-100 text-center space-y-6 animate-in zoom-in-95 duration-200 relative overflow-hidden">
          
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/40 flex items-center justify-center text-cyan-400 mx-auto shadow-lg shadow-cyan-950/50">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 font-mono text-xs">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>身份确权门禁 · AUTH REQUIRED</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white font-sans">
              建立互联需先登录验证 ASN 身份
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans max-w-md mx-auto">
              为防止恶意占用服务端端口与伪造广播，AkiLab 门户强制要求在建立互联前登录并确认你的 <b>DN42 ASN 归属所有权</b>。
            </p>
          </div>

          <div className="p-4 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-slate-400 text-left space-y-2">
            <div className="flex items-center gap-2 text-cyan-300 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>登录特性与安全保障：</span>
            </div>
            <p className="pl-6">• 首次通过 DN42 Registry SSH 签名验真并自设密码</p>
            <p className="pl-6">• 以后凭 ASN + 密码一秒免终端快速登入与管理</p>
            <p className="pl-6">• 互联申请直连 Telegram 自动化通知，优先部署</p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="w-full sm:flex-1 btn-primary py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>立即登录</span>
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white font-medium transition-colors cursor-pointer"
            >
              返回主页浏览
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Peering Studio Workbench
  return (
    <div className="w-full min-h-screen flex flex-col justify-start pb-8 space-y-3 sm:space-y-4">
      
      {/* 1. Studio-Grade Unified Navigation & Telemetry Header */}
      <header className="w-full border-b border-white/10 bg-[#060913]/90 backdrop-blur-2xl sticky top-0 z-40 shadow-2xl">
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          
          {/* Left: Navigation & Node Identity */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-sans transition-all cursor-pointer group"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform text-cyan-400" />
              <span className="font-medium">返回主页</span>
            </button>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-950/50 to-blue-950/30 border border-cyan-500/30 shadow-inner text-xs font-mono">
              <span className="text-cyan-300 font-semibold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{selectedNode.flag} {selectedNode.id}</span>
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-300 font-sans font-medium">{selectedNode.name}</span>
            </div>
          </div>

          {/* Center: Live Port & Node Telemetry Pills */}
          <div className="hidden lg:flex items-center gap-2 text-xs font-mono">
            {/* Host Port Telemetry */}
            <div className="px-3 py-1.5 rounded-xl bg-black/50 border border-cyan-500/20 text-slate-300 flex items-center gap-2 shadow-sm">
              <Server className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400">{networkMeta.networkName || '节点'} 监听:</span>
              <span className="text-cyan-300 font-bold tracking-wide">{finalHostPort}</span>
              <span className="text-[10px] text-cyan-500/80 font-sans">(随 ASN 联动)</span>
            </div>

            {/* Client Port Telemetry */}
            <div className="px-3 py-1.5 rounded-xl bg-black/50 border border-purple-500/20 text-slate-300 flex items-center gap-2 shadow-sm">
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-slate-400">你的监听:</span>
              <span className="text-purple-300 font-bold tracking-wide">{finalClientPort}</span>
            </div>

            {/* Endpoint & LLA Micro Pills */}
            <div className="px-3 py-1.5 rounded-xl bg-black/50 border border-white/10 text-slate-400 flex items-center gap-2 text-[11px]">
              <span>{selectedNode.endpointDomain}</span>
              <span className="text-slate-600">&middot;</span>
              <span className="text-slate-300">{selectedNode.tunnelIpv6LLA}</span>
            </div>
          </div>

          {/* Right: Quick ESC / Status */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate('/')}
              className="p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-sans"
              title="按 ESC 或点击关闭返回主页"
            >
              <span className="hidden sm:inline text-slate-400">ESC 退出</span>
              <X className="w-4 h-4" />
            </button>
          </div>

        </div>
      </header>

      {/* 2. Interactive Peering Studio Main Workbench */}
      <main className="w-full flex-1">
        <ConfigGenerator />
      </main>

    </div>
  );
};
