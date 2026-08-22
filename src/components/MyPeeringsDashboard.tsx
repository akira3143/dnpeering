import React, { useState, useEffect } from 'react';
import { useAuth, type PeeringSessionInfo } from '../context/AuthContext';
import { useRouter } from '../router/Router';
import { useToast } from './Toast';
import {
  Server,
  Activity,
  RefreshCw,
  Edit3,
  CheckCircle2,
  Clock,
  ShieldCheck,
  LogOut,
  X,
  Plus,
  Zap,
  KeyRound,
  Loader2,
  Trash2,
  AlertTriangle,
  Lock,
  Terminal,
} from 'lucide-react';

export const MyPeeringsDashboard: React.FC = () => {
  const {
    user,
    token,
    isAuthenticated,
    isDashboardOpen,
    setIsDashboardOpen,
    setIsAuthModalOpen,
    activeSessions,
    refreshSessions,
    refreshSessionBgpStatus,
    logout,
  } = useAuth();

  const { navigate } = useRouter();
  const { showToast } = useToast();
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);

  // Password Change Modal State
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Delete Session State
  const [sessionToDelete, setSessionToDelete] = useState<PeeringSessionInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isDashboardOpen) {
      refreshSessions();
    }
  }, [isDashboardOpen, refreshSessions]);

  if (!isDashboardOpen) return null;

  const handleSavePasswordChange = async () => {
    if (!newPassword || newPassword.length < 6) {
      showToast('密码长度至少需要 6 个字符', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('两次输入的密码不一致', 'error');
      return;
    }

    setIsSavingPassword(true);
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          asn: user?.cleanAsn,
          password: newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || '密码修改失败', 'error');
        return;
      }

      setIsPasswordModalOpen(false);
      setNewPassword('');
      setConfirmPassword('');
      showToast('🎉 登录密码已成功更新！', 'success');
    } catch {
      showToast('更新异常，请稍后重试', 'error');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!sessionToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/delete-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          sessionId: sessionToDelete.id || '',
          nodeId: sessionToDelete.nodeId || '',
          asn: user?.cleanAsn || sessionToDelete.asn || '',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || '撤销会话失败', 'error');
        return;
      }

      // Remove from local storage cache
      try {
        const localList = JSON.parse(localStorage.getItem('akilab_my_peerings') || '[]');
        const updated = localList.filter((s: any) => {
          if (sessionToDelete.id && s.id === sessionToDelete.id) return false;
          if (s.nodeId === sessionToDelete.nodeId && s.asn === sessionToDelete.asn) return false;
          return true;
        });
        localStorage.setItem('akilab_my_peerings', JSON.stringify(updated));
      } catch {}

      await refreshSessions();
      setSessionToDelete(null);
      showToast('🗑️ 会话已成功撤销，服务器端口已释放！', 'success');
    } catch {
      showToast('网络请求异常，请稍后重试', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRefreshAll = async () => {
    setIsRefreshingAll(true);
    await refreshSessions();
    for (const session of activeSessions) {
      await refreshSessionBgpStatus(session);
    }
    setIsRefreshingAll(false);
    showToast('已刷新全部对等节点的实时 BGP 与连通状态', 'info');
  };

  const handleOpenStudioForSession = (session: PeeringSessionInfo) => {
    setIsDashboardOpen(false);
    navigate(`/peer?node=${session.nodeId}&session=${session.id}`);
  };

  const handleOpenLookingGlassForSession = (session: PeeringSessionInfo) => {
    setIsDashboardOpen(false);
    const target = session.peerIpv4 || session.peerIpv6ULA || `AS${session.asn}`;
    window.dispatchEvent(
      new CustomEvent('akilab-open-looking-glass', {
        detail: {
          nodeId: session.nodeId || 'jp07',
          commandType: 'route',
          target,
          autoRun: true,
        },
      })
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl bg-[#090d19] border border-cyan-500/30 shadow-2xl shadow-cyan-950/50 flex flex-col overflow-hidden text-slate-100 relative">
        
        {/* Dashboard Header */}
        <div className="p-5 sm:p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02] shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white font-sans">
                  {user?.isAdmin ? '对等互联中枢管控看板' : '我的对等互联看板'}
                </h2>
                {user?.isAdmin ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-purple-950/80 to-pink-950/80 border border-purple-500/50 text-[10px] font-mono text-purple-300 font-bold shadow-md shadow-purple-950/50">
                    <Zap className="w-3 h-3 text-purple-400" />
                    <span>👑 管理员 ({user.username || 'akira'})</span>
                  </span>
                ) : isAuthenticated ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-[10px] font-mono text-emerald-400">
                    <ShieldCheck className="w-3 h-3" />
                    <span>已验真 {user?.asn}</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-500/30 text-amber-300">
                    未验证 (本地会话)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono">
                {user ? `${user.asName || 'DN42 Member'} · Maintainer: ${user.maintainer || 'N/A'}` : '管理你的 Peering 会话与实时 BGP 路由收敛状态'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshAll}
              disabled={isRefreshingAll}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-cyan-300 font-medium flex items-center gap-1.5 transition-all cursor-pointer"
              title="刷新全部状态"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAll ? 'animate-spin text-cyan-400' : ''}`} />
              <span className="hidden sm:inline">探测连通性</span>
            </button>

            {isAuthenticated ? (
              <>
                <button
                  onClick={() => setIsPasswordModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/30 text-xs text-cyan-300 font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                  title="修改日常登录密码"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">修改密码</span>
                </button>

                <button
                  onClick={() => { logout(); showToast('已安全退出登录', 'info'); }}
                  className="px-3 py-1.5 rounded-xl bg-red-950/30 hover:bg-red-900/40 border border-red-500/30 text-xs text-red-300 font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                  title="退出当前 ASN 登录"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">退出</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => { setIsDashboardOpen(false); setIsAuthModalOpen(true); }}
                className="btn-cyber px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>认证 ASN</span>
              </button>
            )}

            <button
              onClick={() => setIsDashboardOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer ml-1"
              aria-label="关闭面板"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Dashboard Content (Scrollable) */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          
          {activeSessions.length === 0 ? (
            /* Empty State */
            <div className="p-10 rounded-2xl bg-black/40 border border-white/10 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto">
                <Server className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white font-sans">暂无进行中的对等互联会话</h3>
                <p className="text-xs text-slate-400 font-sans max-w-md mx-auto">
                  你尚未向 AkiLab 提交任何节点的对等互联申请。选择任意节点即可开始快速接入！
                </p>
              </div>
              <button
                onClick={() => { setIsDashboardOpen(false); navigate('/peer?node=jp07'); }}
                className="btn-primary px-5 py-2.5 rounded-xl text-xs font-semibold inline-flex items-center gap-2 cursor-pointer shadow-lg"
              >
                <Plus className="w-4 h-4" />
                <span>立即创建首个对等互联</span>
              </button>
            </div>
          ) : (
            /* Active Sessions List */
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>共登记 {activeSessions.length} 个节点互联会话</span>
                <button
                  onClick={() => { setIsDashboardOpen(false); navigate('/peer'); }}
                  className="text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>申请接入其它节点</span>
                </button>
              </div>

              {activeSessions.map((session) => {
                const liveStatus = session.liveBgpStatus;
                const stage = liveStatus?.stage || 1;

                return (
                  <div
                    key={session.id}
                    className="rounded-2xl bg-black/40 border border-white/10 hover:border-cyan-500/30 transition-all p-4 sm:p-5 space-y-4 shadow-lg shadow-black/40 relative overflow-hidden group"
                  >
                    {/* Top Row: Node, Flag, Session Ticket & Port */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{session.flag || '🌐'}</span>
                        <div>
                          <div className="flex items-center gap-2 font-bold text-white text-sm sm:text-base font-sans">
                            <span>{session.nodeName || session.nodeCode}</span>
                            <span className="text-xs font-mono text-slate-400 font-normal">
                              ({session.nodeCode})
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">
                              v{session.version}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
                            <span>会话: <code className="text-slate-300 select-all">{session.id}</code></span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-slate-300">
                          AkiLab 端口: <b className="text-cyan-300">{session.hostPort}</b>
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-slate-300">
                          本地端口: <b className="text-purple-300">{session.clientPort}</b>
                        </span>
                      </div>
                    </div>

                    {/* Middle Row: 4-Stage Lifecycle Stepper */}
                    <div className="py-2">
                      <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
                        
                        {/* Stage 1: Submitted */}
                        <div className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                          stage >= 1
                            ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
                            : 'bg-white/[0.02] border-white/5 text-slate-500'
                        }`}>
                          <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                          <span className="font-semibold text-[11px]">1. 申请已提交</span>
                          <span className="text-[9px] opacity-70">Submitted</span>
                        </div>

                        {/* Stage 2: Deployed */}
                        <div className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                          stage >= 2
                            ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
                            : 'bg-white/[0.02] border-white/5 text-slate-500'
                        }`}>
                          <Clock className={`w-4 h-4 ${stage >= 2 ? 'text-cyan-400' : 'text-slate-600'}`} />
                          <span className="font-semibold text-[11px]">2. 节点已部署</span>
                          <span className="text-[9px] opacity-70">Deployed</span>
                        </div>

                        {/* Stage 3: Handshake */}
                        <div className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                          stage >= 3
                            ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
                            : 'bg-white/[0.02] border-white/5 text-slate-500'
                        }`}>
                          <Zap className={`w-4 h-4 ${stage >= 3 ? 'text-cyan-400' : 'text-slate-600'}`} />
                          <span className="font-semibold text-[11px]">3. 隧道握手</span>
                          <span className="text-[9px] opacity-70">Handshake</span>
                        </div>

                        {/* Stage 4: Established */}
                        <div className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                          stage >= 4
                            ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-300'
                            : 'bg-white/[0.02] border-white/5 text-slate-500'
                        }`}>
                          <Activity className={`w-4 h-4 ${stage >= 4 ? 'text-emerald-400' : 'text-slate-600'}`} />
                          <span className="font-semibold text-[11px]">4. 路由已建立</span>
                          <span className="text-[9px] opacity-70">Established</span>
                        </div>

                      </div>
                    </div>

                    {/* Diagnostic & Route Convergence Box */}
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          stage === 4 ? 'bg-emerald-400 animate-ping' : stage >= 2 ? 'bg-cyan-400' : 'bg-amber-400'
                        }`}></span>
                        <span className="text-slate-300 font-sans">
                          {liveStatus?.stageLabel || (stage === 1 ? '申请已投递 · 等待管理员审核与配置' : '配置生效中')}
                        </span>
                      </div>

                      {liveStatus && stage === 4 && (
                        <div className="flex items-center gap-3 font-mono text-[11px]">
                          <span className="text-emerald-400 font-semibold">
                            📥 接收路由: {liveStatus.routesImported} 条
                          </span>
                          <span className="text-slate-400">
                            📤 发送路由: {liveStatus.routesExported} 条
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="text-[11px] text-slate-400 font-mono">
                        {session.updatedAt ? `最后更新: ${new Date(session.updatedAt).toLocaleString()}` : ''}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenLookingGlassForSession(session)}
                          className="px-3 py-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-500/30 text-xs font-mono flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                          title="在 Looking Glass 中穿透诊断此 BGP 会话与路由"
                        >
                          <Terminal className="w-3 h-3 text-cyan-400" />
                          <span>BGP 诊断</span>
                        </button>

                        <button
                          onClick={() => refreshSessionBgpStatus(session)}
                          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-cyan-300 text-xs font-mono flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>探测连通</span>
                        </button>

                        <button
                          onClick={() => handleOpenStudioForSession(session)}
                          className="btn-cyber px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>修改配置</span>
                        </button>

                        <button
                          onClick={() => setSessionToDelete(session)}
                          className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                          title="删除该互联会话"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>撤销删除</span>
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* Change Password Sub-Modal */}
        {isPasswordModalOpen && (
          <div className="absolute inset-0 z-20 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-sm rounded-2xl bg-[#0d1322] border border-cyan-500/40 p-5 space-y-4 shadow-2xl text-slate-100">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2 font-bold text-sm text-white">
                  <KeyRound className="w-4 h-4 text-cyan-400" />
                  <span>修改登录密码 ({user?.asn})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block pl-1.5">新登录密码 (至少 6 位)</label>
                  <div className="flex items-center w-full h-10 rounded-xl bg-[#040813] border border-white/15 focus-within:border-cyan-400 transition-colors overflow-hidden shadow-inner">
                    <span className="w-12 h-full flex items-center justify-center bg-white/[0.04] border-r border-white/10 text-slate-400 shrink-0">
                      <Lock className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="输入新密码"
                      className="flex-1 h-full px-3.5 bg-transparent border-0 text-xs font-mono text-slate-100 focus:outline-none placeholder:text-slate-600"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block pl-1.5">确认新登录密码</label>
                  <div className="flex items-center w-full h-10 rounded-xl bg-[#040813] border border-white/15 focus-within:border-cyan-400 transition-colors overflow-hidden shadow-inner">
                    <span className="w-12 h-full flex items-center justify-center bg-white/[0.04] border-r border-white/10 text-slate-400 shrink-0">
                      <Lock className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSavePasswordChange()}
                      placeholder="再次输入新密码"
                      className="flex-1 h-full px-3.5 bg-transparent border-0 text-xs font-mono text-slate-100 focus:outline-none placeholder:text-slate-600"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleSavePasswordChange}
                    disabled={isSavingPassword || !newPassword || !confirmPassword}
                    className="flex-1 btn-primary py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                  >
                    {isSavingPassword ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>保存新密码</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPasswordModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-slate-300 font-semibold cursor-pointer"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Session Confirmation Modal */}
        {sessionToDelete && (
          <div className="absolute inset-0 z-30 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md rounded-2xl bg-[#140b0f] border border-red-500/40 p-5 space-y-4 shadow-2xl text-slate-100">
              <div className="flex items-center justify-between border-b border-red-500/20 pb-3">
                <div className="flex items-center gap-2 font-bold text-sm text-red-300">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span>确认删除互联会话？</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSessionToDelete(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 text-xs font-mono space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">互联节点:</span>
                  <span className="text-white font-semibold">{sessionToDelete.nodeName || sessionToDelete.nodeCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">会话编号:</span>
                  <span className="text-cyan-300">{sessionToDelete.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">占用端口:</span>
                  <span className="text-amber-300">AkiLab {sessionToDelete.hostPort}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/20 text-xs text-red-300/90 leading-relaxed">
                ⚠️ <b>操作警告：</b> 撤销后，该对等互联申请将从系统注销，为你预留的 AkiLab 服务端端口 <b>{sessionToDelete.hostPort}</b> 将被立即释放。
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-red-950/50 transition-all"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>确认删除</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setSessionToDelete(null)}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-slate-300 font-semibold cursor-pointer transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
