import React, { useState, useRef } from 'react';
import {
  UserCheck,
  Camera,
  X,
  Image as ImageIcon,
  Sparkles,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  Check,
  Copy,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';
import { signInWithPopup, GoogleAuthProvider, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import hushLogo from '../assets/images/hush_gold_black_bright.png';
import { User } from '../types';
import { Backend } from '../utils/backend';
import { Sound } from '../utils/sound';
import { UserAvatar, PRESET_AVATARS, processImageUpload } from './UserAvatar';

interface AuthModalProps {
  onSuccess: (user: User) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess }) => {
  const [tab, setTab] = useState<'login' | 'signup' | 'recovery'>('login');
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  // Recovery state
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<'request' | 'reset'>('request');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [recoveryUser, setRecoveryUser] = useState<{ username: string; email?: string; maskedEmail?: string } | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  const [avatar, setAvatar] = useState<string>('🎧');
  const [uploadError, setUploadError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError('');
    try {
      const dataUrl = await processImageUpload(file);
      setAvatar(dataUrl);
      Sound.win();
    } catch (err: unknown) {
      setUploadError((err as Error).message || 'Failed to process image');
      Sound.lose();
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('Please enter your username or email');
      return;
    }
    if (!loginPassword.trim()) {
      setError('Please enter your password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const u = await Backend.login(identifier.trim(), loginPassword);
      Sound.win();
      onSuccess(u);
    } catch (err: unknown) {
      setError((err as Error).message);
      Sound.lose();
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !email.trim()) {
      setError('Please fill in username and email');
      return;
    }
    if (!signupPassword) {
      setError('Please choose a password');
      return;
    }
    if (signupPassword.length < 4) {
      setError('Password must be at least 4 characters long');
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const u = await Backend.signup(username.trim(), email.trim(), signupPassword, avatar);
      Sound.jackpot();
      onSuccess(u);
    } catch (err: unknown) {
      setError((err as Error).message);
      Sound.lose();
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const googleUser = result.user;
      const displayName = googleUser.displayName || googleUser.email?.split('@')[0] || 'Player';
      const email = googleUser.email || `${googleUser.uid}@google.com`;
      const photo = googleUser.photoURL || avatar;

      const u = await Backend.googleAuth(displayName, email, photo);
      Sound.jackpot();
      onSuccess(u);
    } catch (err: unknown) {
      const errorMsg = (err as Error).message || 'Google sign-in cancelled or failed';
      if (!errorMsg.includes('popup-closed-by-user')) {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGuestPlay = async () => {
    setLoading(true);
    setError('');
    try {
      const guest = await Backend.loginGuest(avatar);
      Sound.win();
      onSuccess(guest);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryIdentifier.trim()) {
      setError('Please enter your username or registered email');
      return;
    }
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await Backend.requestPasswordRecovery(recoveryIdentifier.trim());
      setRecoveryUser({ username: res.username, email: res.email, maskedEmail: res.maskedEmail });
      setRecoveryCode(res.recoveryCode);
      setInputCode(res.recoveryCode);
      setRecoveryStep('reset');
      setSuccessMsg(`Account found for "${res.username}". Verification code generated below.`);
      Sound.win();

      // Also trigger Firebase password reset email if email is provided
      if (res.email && res.email.includes('@')) {
        sendPasswordResetEmail(auth, res.email).catch(() => {});
      }
    } catch (err: unknown) {
      setError((err as Error).message);
      Sound.lose();
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) {
      setError('Please enter the 6-digit recovery code');
      return;
    }
    if (!newPassword.trim()) {
      setError('Please enter your new password');
      return;
    }
    if (newPassword.length < 4) {
      setError('Password must be at least 4 characters long');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const u = await Backend.resetPassword(recoveryIdentifier.trim(), inputCode.trim(), newPassword);
      Sound.jackpot();
      onSuccess(u);
    } catch (err: unknown) {
      setError((err as Error).message);
      Sound.lose();
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (recoveryCode) {
      navigator.clipboard.writeText(recoveryCode).catch(() => {});
      setCodeCopied(true);
      Sound.click();
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-2xl relative space-y-4 my-auto">
        {/* Brand Lockup */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-linear-to-tr from-amber-500 via-yellow-400 to-amber-200 p-0.5 shadow-xl shadow-amber-500/25 ring-1 ring-amber-400/30">
            <div className="w-full h-full bg-slate-950 rounded-[14px] overflow-hidden flex items-center justify-center">
              <img
                src={hushLogo}
                alt="Hush Music Logo"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-100 tracking-tight">
              Hush Music Hand Game
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              12 Classic Card, Board & Casino Games with Points
            </p>
          </div>
        </div>

        {/* Tab Selection */}
        {tab === 'recovery' ? (
          <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-black text-amber-400 uppercase tracking-wider">Password Recovery</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setError('');
                setSuccessMsg('');
                Sound.click();
              }}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 font-semibold cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Log In</span>
            </button>
          </div>
        ) : (
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setError('');
                setSuccessMsg('');
                Sound.click();
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                tab === 'login'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('signup');
                setError('');
                setSuccessMsg('');
                Sound.click();
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                tab === 'signup'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign Up (1,000 ⭐ Free)
            </button>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-xl text-emerald-300 text-xs flex items-start gap-2 shadow-xs">
            <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* Forms */}
        {tab === 'recovery' ? (
          recoveryStep === 'request' ? (
            <form onSubmit={handleRequestRecovery} className="space-y-3.5">
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                Forgot your password? Enter your username or registered email address to verify your account and generate a 6-digit recovery code.
              </p>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Username or Email Address
                </label>
                <input
                  type="text"
                  value={recoveryIdentifier}
                  onChange={(e) => setRecoveryIdentifier(e.target.value)}
                  placeholder="e.g. PlayerOne or user@example.com"
                  autoComplete="username"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !recoveryIdentifier.trim()}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 active:scale-95 disabled:opacity-50 text-slate-950 font-black text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{loading ? 'VERIFYING ACCOUNT...' : 'GET RECOVERY CODE'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  setError('');
                  setSuccessMsg('');
                }}
                className="w-full py-1 text-center text-xs text-slate-400 hover:text-slate-200 font-semibold cursor-pointer"
              >
                Cancel and return to Log In
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-3.5">
              {/* Account Verified Banner */}
              <div className="p-3 bg-slate-950 rounded-xl border border-amber-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Account: {recoveryUser?.username}</span>
                  </div>
                  {recoveryUser?.maskedEmail && (
                    <span className="text-[11px] text-slate-400">{recoveryUser.maskedEmail}</span>
                  )}
                </div>

                {recoveryCode && (
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 block">
                        6-Digit Recovery Passcode
                      </span>
                      <span className="text-base font-black text-amber-300 font-mono tracking-widest">
                        {recoveryCode}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-xs font-bold border border-amber-500/30 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      {codeCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{codeCopied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  6-Digit Recovery Passcode
                </label>
                <input
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.trim())}
                  placeholder="e.g. 123456"
                  maxLength={6}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono tracking-widest focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  New Password (min 4 characters)
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    autoComplete="new-password"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Confirm New Password
                </label>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !inputCode.trim() || !newPassword.trim()}
                className="w-full py-3 bg-linear-to-r from-amber-500 to-amber-400 hover:from-amber-400 text-slate-950 font-black text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{loading ? 'RESETTING PASSWORD...' : 'RESET PASSWORD & SIGN IN'}</span>
              </button>

              <div className="flex items-center justify-between pt-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryStep('request');
                    setError('');
                  }}
                  className="text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                >
                  Request new code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab('login');
                    setError('');
                    setSuccessMsg('');
                  }}
                  className="text-slate-400 hover:text-slate-200 font-semibold cursor-pointer"
                >
                  Return to Log In
                </button>
              </div>
            </form>
          )
        ) : tab === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Email or Username
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. PlayerOne or user@example.com"
                autoComplete="username"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-400 block">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setTab('recovery');
                    setRecoveryStep('request');
                    if (identifier) setRecoveryIdentifier(identifier);
                    setError('');
                    setSuccessMsg('');
                    Sound.click();
                  }}
                  className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold transition-colors cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1 transition-colors"
                  tabIndex={-1}
                  title={showLoginPassword ? 'Hide password' : 'Show password'}
                >
                  {showLoginPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 active:scale-95 disabled:opacity-50 text-slate-950 font-black text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{loading ? 'LOGGING IN...' : 'LOG IN'}</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup} className="space-y-3.5">
            {/* Profile Picture Uploader Section */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">
                  Profile Picture
                </span>
                <span className="text-[11px] text-amber-400/80">
                  Upload photo or choose icon
                </span>
              </div>

              {/* Avatar Preview & Action Button */}
              <div className="flex items-center gap-3">
                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <UserAvatar
                    avatar={avatar}
                    username={username || 'Player'}
                    size="lg"
                    className="ring-2 ring-amber-400/40"
                  />
                  <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-4 h-4 text-white" />
                  </div>
                </div>

                <div className="flex-1 space-y-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-lg border border-slate-700 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                      <span>Upload Photo</span>
                    </button>

                    {avatar && avatar.startsWith('data:image/') && (
                      <button
                        type="button"
                        onClick={() => setAvatar('🎧')}
                        className="py-1.5 px-2 bg-slate-900 hover:bg-slate-800 text-rose-400 font-medium text-xs rounded-lg transition-all cursor-pointer"
                        title="Remove photo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    Auto-cropped square (JPG, PNG, WebP)
                  </span>
                </div>
              </div>

              {uploadError && (
                <div className="text-[11px] text-rose-400">{uploadError}</div>
              )}

              {/* Quick Preset Icon Avatars */}
              <div className="pt-1">
                <span className="text-[10px] font-semibold text-slate-400 block mb-1.5 uppercase tracking-wider">
                  Or select game icon
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {PRESET_AVATARS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setAvatar(emoji);
                        Sound.click();
                      }}
                      className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs transition-all ${
                        avatar === emoji
                          ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 scale-110 shadow-xs'
                          : 'bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Choose Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. AcePlayer"
                autoComplete="username"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. player@gmail.com"
                autoComplete="email"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Password (min. 4 chars)
                </label>
                <div className="relative">
                  <input
                    type={showSignupPassword ? 'text' : 'password'}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="Create password"
                    autoComplete="new-password"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignupPassword(!showSignupPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                    tabIndex={-1}
                    title={showSignupPassword ? 'Hide password' : 'Show password'}
                  >
                    {showSignupPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Confirm Password
                </label>
                <input
                  type={showSignupPassword ? 'text' : 'password'}
                  value={signupConfirmPassword}
                  onChange={(e) => setSignupConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-linear-to-r from-amber-500 to-amber-400 hover:from-amber-400 text-slate-950 font-black text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT (+1,000 ⭐ FREE)'}</span>
            </button>
          </form>
        )}

        {/* Guest and Google Auth Options */}
        <div className="relative flex items-center justify-center">
          <div className="border-t border-slate-800 w-full" />
          <span className="bg-slate-900 px-3 text-[11px] text-slate-500 uppercase tracking-widest">
            OR
          </span>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-100 font-bold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Continue with Google Account</span>
          </button>

          <button
            type="button"
            onClick={handleGuestPlay}
            disabled={loading}
            className="w-full py-2.5 bg-slate-950 hover:bg-slate-900 active:scale-95 text-slate-300 font-bold text-xs rounded-xl border border-slate-800 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span>Quick Guest Demo Play (Instant Access)</span>
          </button>
        </div>

        <p className="text-[11px] text-slate-500 text-center">
          Ready for mobile and desktop. No credit card or installation required.
        </p>
      </div>
    </div>
  );
};
