import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import {
  ShieldCheck,
  Copy,
  X,
  Loader2,
  CheckCircle2,
  ArrowRight,
  FolderLock,
  FolderOpen,
  Edit3,
  Lock,
  KeyRound,
  Key,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, setIsAuthModalOpen, loginWithToken, setIsDashboardOpen } = useAuth();
  const { copyToClipboard, showToast } = useToast();

  // Mode: 'password' (Fast Login) or 'ssh' (SSH Challenge / Password Reset)
  const [authMode, setAuthMode] = useState<'password' | 'ssh'>('password');
  const [step, setStep] = useState<'input_asn' | 'verify_ssh' | 'set_password'>('input_asn');
  const [osType, setOsType] = useState<'windows' | 'unix'>('windows');

  // Inputs
  const [asnInput, setAsnInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // New Password Setup
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tempAuthResult, setTempAuthResult] = useState<any>(null);

  // SSH Custom Key Path & File Picker
  const [customKeyPath, setCustomKeyPath] = useState('');
  const [isEditingKeyPath, setIsEditingKeyPath] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const basePath = osType === 'windows' ? '$HOME\\.ssh\\' : '~/.ssh/';
      setCustomKeyPath(`${basePath}${file.name}`);
      showToast(`已选定私钥: ${file.name}`, 'info');
    }
  };

  // Loading & Data
  const [isLoading, setIsLoading] = useState(false);
  const [challengeData, setChallengeData] = useState<any>(null);
  const [signatureInput, setSignatureInput] = useState('');

  if (!isAuthModalOpen) return null;

  const defaultWinPath = '$HOME\\.ssh\\id_ed25519';
  const defaultUnixPath = '~/.ssh/id_ed25519';
  const effectiveKeyPath = customKeyPath.trim() || (osType === 'windows' ? defaultWinPath : defaultUnixPath);

  // Dynamic command generation based on user's selected OS and custom key path
  const generatedCommand = osType === 'windows'
    ? `rm $env:TEMP\\m.sig -ea 0; '${challengeData?.challengeText || ''}' | Out-File $env:TEMP\\m -NoNewline -Encoding ascii; ssh-keygen -Y sign -n akilab -f "${effectiveKeyPath}" $env:TEMP\\m; gc $env:TEMP\\m.sig | Set-Clipboard; gc $env:TEMP\\m.sig`
    : `printf '%s' "${challengeData?.challengeText || ''}" > /tmp/m && ssh-keygen -Y sign -n akilab -f ${effectiveKeyPath} /tmp/m && cat /tmp/m.sig`;

  const handleClose = () => {
    setIsAuthModalOpen(false);
    setStep('input_asn');
    setSignatureInput('');
    setPasswordInput('');
    setNewPassword('');
    setConfirmPassword('');
    setTempAuthResult(null);
    setCustomKeyPath('');
    setIsEditingKeyPath(false);
  };

  // 1. Password Quick Login
  const handlePasswordLogin = async () => {
    const userInput = asnInput.trim();
    if (!userInput) {
      showToast('请输入有效的 ASN 号码', 'error');
      return;
    }
    if (!passwordInput) {
      showToast('请输入登录密码', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asn: userInput, password: passwordInput, rememberMe }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || '登录失败，请检查密码', 'error');
        return;
      }

      loginWithToken(data.token, data.user, rememberMe);
      handleClose();
      setIsDashboardOpen(true);
      showToast(
        data.user.isAdmin
          ? `👑 欢迎管理员 ${data.user.username || data.user.asn}，已授予管理权限！`
          : `🎉 欢迎回来，${data.user.asn} (${data.user.maintainer || data.user.asName})`,
        'success'
      );
    } catch {
      showToast('登录请求异常，请稍后重试', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Fetch SSH Challenge from DN42 Registry
  const handleFetchChallenge = async () => {
    const cleanAsn = asnInput.replace(/\D/g, '');
    if (!cleanAsn) {
      showToast('请输入有效的 ASN 号码', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asn: cleanAsn }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || '查询 DN42 Registry 失败', 'error');
        return;
      }

      setChallengeData(data.challenge);
      setStep('verify_ssh');
      showToast(`已成功匹配 ${data.challenge.asn} 的 Registry 记录`, 'success');
    } catch {
      showToast('网络请求异常，请稍后重试', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Verify SSH Signature
  const handleVerifySsh = async () => {
    if (!signatureInput.trim()) {
      showToast('请粘贴终端中生成的 SSH 签名', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/verify-ssh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asn: challengeData.cleanAsn,
          signature: signatureInput.trim(),
          rememberMe,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || 'SSH 签名校验失败', 'error');
        return;
      }

      setTempAuthResult(data);

      // Transition to Set Password step
      setStep('set_password');
      showToast('🎉 签名确权通过！你可以设定或重置登录密码', 'success');
    } catch {
      showToast('验签请求异常，请稍后重试', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Save Custom Password & Complete Login
  const handleSavePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      showToast('密码长度至少需要 6 个字符', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('两次输入的密码不一致', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tempAuthResult.token}`,
        },
        body: JSON.stringify({
          asn: tempAuthResult.user.cleanAsn,
          password: newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || '密码设置失败', 'error');
        return;
      }

      // Finish login
      loginWithToken(tempAuthResult.token, tempAuthResult.user, rememberMe);
      handleClose();
      setIsDashboardOpen(true);
      showToast('🎉 密码已成功保存！可直接使用 ASN + 密码登入', 'success');
    } catch {
      showToast('请求异常，请稍后重试', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Skip Password Setup (Direct Enter Dashboard)
  const handleSkipPassword = () => {
    if (tempAuthResult) {
      loginWithToken(tempAuthResult.token, tempAuthResult.user, rememberMe);
      handleClose();
      setIsDashboardOpen(true);
      showToast(`欢迎 ${tempAuthResult.user.asn}，已通过 SSH 签名登入`, 'success');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl bg-[#090d19] border border-cyan-500/30 shadow-2xl shadow-cyan-950/50 flex flex-col overflow-hidden text-slate-100 relative">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-white font-sans flex items-center gap-2">
              <span>DN42 节点登录</span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30 text-cyan-300">
                {authMode === 'password' ? 'PASSWORD' : 'SSH AUTH'}
              </span>
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Auth Mode Tabs (Only visible when not in sub-step) */}
        {step === 'input_asn' && (
          <div className="flex border-b border-white/10 bg-white/[0.01] p-1.5 gap-1.5">
            <button
              type="button"
              onClick={() => setAuthMode('password')}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                authMode === 'password'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>🔐 密码快速登录</span>
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('ssh')}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                authMode === 'ssh'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Key className="w-4 h-4" />
              <span>🛡️ SSH 签名登录 / 设密</span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          
          {/* TAB 1: Password Login */}
          {authMode === 'password' && step === 'input_asn' && (
            <div className="min-h-[236px] flex flex-col justify-between">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block pl-1.5">
                    DN42 ASN 号码
                  </label>
                  <div className="flex items-center w-full h-10 rounded-xl bg-[#040813] border border-white/15 focus-within:border-cyan-400 transition-colors overflow-hidden shadow-inner">
                    <span className="w-12 h-full flex items-center justify-center bg-white/[0.04] border-r border-white/10 text-slate-400 font-mono text-xs font-semibold select-none shrink-0">
                      AS
                    </span>
                    <input
                      type="text"
                      value={asnInput}
                      onChange={(e) => setAsnInput(e.target.value)}
                      placeholder="424242xxxx"
                      autoFocus
                      className="flex-1 h-full px-3.5 bg-transparent border-0 text-slate-100 font-mono text-xs focus:outline-none placeholder:text-slate-600"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs px-1.5">
                    <label className="font-semibold text-slate-300">登录密码</label>
                    <button
                      type="button"
                      onClick={() => { setAuthMode('ssh'); setStep('input_asn'); }}
                      className="text-cyan-400 hover:underline text-[11px] cursor-pointer"
                    >
                      首次使用 / 忘记密码？
                    </button>
                  </div>
                  <div className="relative flex items-center w-full h-10 rounded-xl bg-[#040813] border border-white/15 focus-within:border-cyan-400 transition-colors overflow-hidden shadow-inner">
                    <span className="w-12 h-full flex items-center justify-center bg-white/[0.04] border-r border-white/10 text-slate-400 shrink-0">
                      <Lock className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handlePasswordLogin()}
                      placeholder="输入自设的管理密码"
                      className="flex-1 h-full px-3.5 bg-transparent border-0 text-slate-100 font-mono text-xs focus:outline-none placeholder:text-slate-600 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me Checkbox (Unchecked by default) */}
                <div className="flex items-center pl-1.5 pt-0.5">
                  <label className="flex items-center gap-2 text-xs text-slate-300 select-none cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-0 focus:ring-offset-0 transition-colors cursor-pointer accent-cyan-500"
                    />
                    <span className="group-hover:text-white transition-colors">保持登录状态</span>
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePasswordLogin}
                disabled={isLoading || !asnInput.trim() || !passwordInput.trim()}
                className="w-full btn-primary py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-all"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>正在登录...</span>
                  </>
                ) : (
                  <>
                    <span>登录</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 2 - STEP 1: Input ASN for SSH Challenge */}
          {authMode === 'ssh' && step === 'input_asn' && (
            <div className="min-h-[236px] flex flex-col justify-between">
              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block pl-1.5">
                    DN42 ASN 号码
                  </label>
                  <div className="flex items-center w-full h-10 rounded-xl bg-[#040813] border border-white/15 focus-within:border-cyan-400 transition-colors overflow-hidden shadow-inner">
                    <span className="w-12 h-full flex items-center justify-center bg-white/[0.04] border-r border-white/10 text-slate-400 font-mono text-xs font-semibold select-none shrink-0">
                      AS
                    </span>
                    <input
                      type="text"
                      value={asnInput}
                      onChange={(e) => setAsnInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleFetchChallenge()}
                      placeholder="424242xxxx"
                      autoFocus
                      className="flex-1 h-full px-3.5 bg-transparent border-0 text-slate-100 font-mono text-xs focus:outline-none placeholder:text-slate-600"
                    />
                  </div>
                </div>

                {/* Concise Explanatory Note */}
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 text-[11px] text-slate-400 space-y-1 leading-relaxed">
                  <div className="flex items-center gap-1.5 text-cyan-300 font-medium text-xs">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>密码学所有权认证</span>
                  </div>
                  <p className="text-slate-400">
                    自动从 DN42 读取 Maintainer 登记公钥并生成考题，完成签名即可设密或重置。
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleFetchChallenge}
                disabled={isLoading || !asnInput.trim()}
                className="w-full btn-primary py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-all"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>正在检索 Registry 记录...</span>
                  </>
                ) : (
                  <>
                    <span>通过 SSH KEY 认证</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 2 - STEP 2: SSH Challenge Signing */}
          {step === 'verify_ssh' && (
            <div className="space-y-4">
              {/* ASN Profile Badge */}
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between font-mono text-xs">
                <div>
                  <div className="font-bold text-cyan-300 flex items-center gap-2">
                    <span>{challengeData?.asn}</span>
                    <span className="text-[10px] text-slate-400 font-normal">({challengeData?.asName})</span>
                  </div>
                  <div className="text-[11px] text-slate-400">Maintainer: {challengeData?.maintainer || 'N/A'}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('input_asn')}
                  className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
                >
                  更换 ASN
                </button>
              </div>

              {/* Key Path Customizer */}
              <div className="p-3 rounded-xl bg-[#040813] border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                    <FolderLock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>本地私钥路径设置 (Key Path):</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditingKeyPath(!isEditingKeyPath)}
                    className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>{isEditingKeyPath ? '收起' : '自定义路径'}</span>
                  </button>
                </div>

                {/* Path Input & File Picker */}
                {isEditingKeyPath ? (
                  <div className="space-y-1.5 animate-in fade-in duration-150">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={customKeyPath}
                        onChange={(e) => setCustomKeyPath(e.target.value)}
                        placeholder={osType === 'windows' ? '例如 $HOME\\.ssh\\id_ed25519 或 D:\\keys\\my_key' : '例如 ~/.ssh/id_ed25519 或 ~/keys/my_key'}
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/50 border border-cyan-500/40 text-slate-100 font-mono text-[11px] focus:outline-none placeholder:text-slate-600"
                      />
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-300 hover:text-white text-[11px] font-sans flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                        title="弹出文件选择器选择本地私钥"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>选择文件</span>
                      </button>
                      {customKeyPath && (
                        <button
                          type="button"
                          onClick={() => setCustomKeyPath('')}
                          className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 text-[11px] font-sans cursor-pointer transition-colors"
                          title="恢复默认私钥路径"
                        >
                          重置默认
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] font-mono text-cyan-300/90 truncate bg-black/40 px-2.5 py-1.5 rounded-lg border border-white/5 flex items-center justify-between">
                    <span>{effectiveKeyPath}</span>
                  </div>
                )}
              </div>

              {/* Challenge Token Pill */}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.02] border border-white/10 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-[11px]">待签考题 (Challenge):</span>
                  <code className="font-mono text-cyan-300 font-semibold px-2 py-0.5 rounded bg-black/50 border border-cyan-500/20 text-[11px]">
                    {challengeData?.challengeText}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(challengeData?.challengeText, '考题字符串')}
                  className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                  title="单独复制考题"
                >
                  <Copy className="w-3 h-3" />
                  <span>复制考题</span>
                </button>
              </div>

              {/* SSH Challenge Instructions */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px] text-slate-300 font-medium px-1.5">
                    <span>1. 在终端运行命令:</span>
                    <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-lg border border-white/10 text-[10px] self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setOsType('windows')}
                        className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                          osType === 'windows' ? 'bg-cyan-500/30 text-cyan-200 font-semibold' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        🪟 PowerShell
                      </button>
                      <button
                        type="button"
                        onClick={() => setOsType('unix')}
                        className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                          osType === 'unix' ? 'bg-cyan-500/30 text-cyan-200 font-semibold' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        🐧 Linux / macOS
                      </button>
                    </div>
                  </div>

                  <div className="relative group">
                    <pre className="p-3 rounded-xl bg-[#040813] border border-white/15 text-[11px] font-mono text-cyan-300 overflow-x-auto select-all whitespace-pre-wrap break-all">
                      <code>{generatedCommand}</code>
                    </pre>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(generatedCommand, '终端签名命令')}
                      className="absolute right-2 top-2 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                      title="复制命令"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-300 block pl-1.5">
                    2. 粘贴生成的签名输出 (SSH Signature)
                  </label>
                  <textarea
                    rows={3}
                    value={signatureInput}
                    onChange={(e) => setSignatureInput(e.target.value)}
                    placeholder="-----BEGIN SSH SIGNATURE-----&#10;...&#10;-----END SSH SIGNATURE-----"
                    className="w-full p-2.5 rounded-xl bg-[#040813] border border-white/15 focus:border-cyan-400 text-slate-100 font-mono text-xs focus:outline-none placeholder:text-slate-600 resize-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleVerifySsh}
                  disabled={isLoading || !signatureInput.trim()}
                  className="w-full btn-primary py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-all"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>正在校验签名...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>验证签名并继续</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          )}

          {/* STEP 3: Setup or Reset Custom Password */}
          {step === 'set_password' && tempAuthResult && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-center">
                <h4 className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span>{tempAuthResult.hasPassword ? '身份验真成功！重设登录密码' : '首次确权成功！设定登录密码'}</span>
                </h4>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block pl-1.5">设定新管理密码 (至少 6 位)</label>
                  <div className="flex items-center w-full h-10 rounded-xl bg-[#040813] border border-white/15 focus-within:border-cyan-400 transition-colors overflow-hidden shadow-inner">
                    <span className="w-12 h-full flex items-center justify-center bg-white/[0.04] border-r border-white/10 text-slate-400 shrink-0">
                      <Lock className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="输入安全登录密码"
                      className="flex-1 h-full px-3.5 bg-transparent border-0 text-slate-100 font-mono text-xs focus:outline-none placeholder:text-slate-600"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block pl-1.5">确认新管理密码</label>
                  <div className="flex items-center w-full h-10 rounded-xl bg-[#040813] border border-white/15 focus-within:border-cyan-400 transition-colors overflow-hidden shadow-inner">
                    <span className="w-12 h-full flex items-center justify-center bg-white/[0.04] border-r border-white/10 text-slate-400 shrink-0">
                      <Lock className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSavePassword()}
                      placeholder="再次输入以确认"
                      className="flex-1 h-full px-3.5 bg-transparent border-0 text-slate-100 font-mono text-xs focus:outline-none placeholder:text-slate-600"
                    />
                  </div>
                </div>

                {/* Remember Me Checkbox */}
                <div className="flex items-center pl-1.5 pt-0.5">
                  <label className="flex items-center gap-2 text-xs text-slate-300 select-none cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-0 focus:ring-offset-0 transition-colors cursor-pointer accent-cyan-500"
                    />
                    <span className="group-hover:text-white transition-colors">保持登录状态</span>
                  </label>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSavePassword}
                    disabled={isLoading || !newPassword || !confirmPassword}
                    className="flex-1 btn-primary py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-all"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>保存密码并进入看板</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleSkipPassword}
                    className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    暂时跳过
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
