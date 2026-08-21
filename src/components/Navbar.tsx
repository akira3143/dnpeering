import React, { useState, useEffect } from 'react';
import { useRouter } from '../router/Router';
import { useNetwork } from '../context/NetworkContext';
import { useAuth } from '../context/AuthContext';
import { CURRENT_BRAND_LOGO } from '../utils/brandLogo';
import {
  Menu,
  X,
  Layers,
  Mail,
  Terminal,
  Activity,
  ShieldCheck,
  LogIn,
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { path, navigate } = useRouter();
  const { networkMeta } = useNetwork();
  const {
    user,
    isAuthenticated,
    activeSessions,
    setIsAuthModalOpen,
    setIsDashboardOpen,
  } = useAuth();

  const [utcTime, setUtcTime] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toUTCString().slice(17, 25) + ' UTC');
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const isPeerStudio = path.startsWith('/peer');

  const homeNavLinks = [
    { label: '节点列表', href: '#nodes', icon: Layers },
    { label: 'Looking Glass', href: '#looking-glass', icon: Terminal },
    { label: '联络我们', href: '#contact', icon: Mail },
  ];

  const handleNavClick = (href: string) => {
    setMobileMenuOpen(false);
    if (isPeerStudio) {
      navigate('/' + href);
    } else {
      const element = document.querySelector(href);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.08] bg-[#070a11]/90 backdrop-blur-xl transition-all">
      <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3 group text-left cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/40 flex items-center justify-center group-hover:border-cyan-400 transition-all duration-300 shadow-lg shadow-cyan-950/40 overflow-hidden shrink-0">
              <img
                src={CURRENT_BRAND_LOGO}
                alt="AkiLab Logo"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
              />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-base tracking-tight text-white font-sans leading-tight">
                {networkMeta.networkName}
              </span>
              <span className="text-[10px] uppercase font-mono text-cyan-400/80 tracking-widest">
                DN42 Autonomous System
              </span>
            </div>
          </button>
        </div>

        {/* Center: Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-2">
          {homeNavLinks.map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.href}
                onClick={() => handleNavClick(link.href)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm text-slate-300 hover:text-cyan-300 hover:bg-white/[0.05] transition-all font-medium cursor-pointer"
              >
                <Icon className="w-4 h-4 text-slate-400 group-hover:text-cyan-400" />
                {link.label}
              </button>
            );
          })}
        </nav>

        {/* Right: Live UTC Clock & User Dashboard / Auth Entry */}
        <div className="flex items-center gap-2.5">
          <div className="hidden xl:flex flex-col text-right font-mono text-[11px] text-slate-400 bg-black/50 px-3 py-1 rounded-lg border border-white/5">
            <span className="text-slate-500 text-[9px] uppercase">Telemetry Sync</span>
            <span className="text-cyan-300 font-semibold">{utcTime}</span>
          </div>

          {/* My Peerings Dashboard Trigger */}
          <button
            onClick={() => setIsDashboardOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-cyan-500/40 text-xs text-slate-200 hover:text-cyan-300 font-medium transition-all cursor-pointer shadow-sm"
            title="查看我的对等互联会话与连通状态"
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-sans">我的互联</span>
            {activeSessions.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-mono text-[10px]">
                {activeSessions.length}
              </span>
            )}
          </button>

          {/* Auth / Login Button */}
          {isAuthenticated ? (
            <button
              onClick={() => setIsDashboardOpen(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer shadow-sm ${
                user?.isAdmin || user?.username === 'akira'
                  ? 'bg-purple-950/40 hover:bg-purple-900/50 border-purple-500/40 text-purple-300 shadow-purple-950/50'
                  : 'bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-500/40 text-emerald-300'
              }`}
              title={user?.isAdmin ? '最高管理员 (Root Ops)' : '已通过 DN42 Registry 验真'}
            >
              <ShieldCheck className={`w-3.5 h-3.5 ${user?.isAdmin ? 'text-purple-400' : 'text-emerald-400'}`} />
              <span>{user?.isAdmin ? (user.username || 'akira') : user?.asn}</span>
            </button>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/40 text-xs font-medium text-cyan-300 hover:text-white transition-all cursor-pointer shadow-sm"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>登录</span>
            </button>
          )}

          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors"
            aria-label="打开菜单"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-white/10 bg-[#070a11]/95 backdrop-blur-2xl p-4 space-y-3 animate-in slide-in-from-top-4 duration-200">
          <div className="grid grid-cols-1 gap-2">
            {homeNavLinks.map((link) => {
              const Icon = link.icon;
              return (
                <button
                  key={link.href}
                  onClick={() => handleNavClick(link.href)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-white/[0.03] border border-white/5 text-slate-200 text-xs font-medium text-left"
                >
                  <Icon className="w-4 h-4 text-cyan-400" />
                  <span>{link.label}</span>
                </button>
              );
            })}

            <button
              onClick={() => { setMobileMenuOpen(false); setIsDashboardOpen(true); }}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-xs font-medium text-left"
            >
              <Activity className="w-4 h-4" />
              <span>我的对等互联看板 ({activeSessions.length})</span>
            </button>

            {!isAuthenticated && (
              <button
                onClick={() => { setMobileMenuOpen(false); setIsAuthModalOpen(true); }}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-white/[0.04] border border-white/10 text-slate-200 text-xs font-medium text-left"
              >
                <LogIn className="w-4 h-4 text-cyan-400" />
                <span>登录 / 认证</span>
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
