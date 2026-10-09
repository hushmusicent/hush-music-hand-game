import React, { useState, useRef, useEffect } from 'react';
import { Gift, LogOut, Award, Settings, CheckCircle2, AlertCircle, Camera, X, Clock, Trash2, Loader2 } from 'lucide-react';
import { User } from '../types';
import { Backend } from '../utils/backend';
import { Sound } from '../utils/sound';
import { UserAvatar, PRESET_AVATARS, processImageUpload } from './UserAvatar';

interface ProfileViewProps {
  user: User;
  onUpdateUser: (updated: User) => void;
  onLogout: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  onUpdateUser,
  onLogout,
}) => {
  const [isChangingAvatar, setIsChangingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [resetRemainingMs, setResetRemainingMs] = useState(() => Backend.getDailyResetRemainingMs(user));
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setResetRemainingMs(Backend.getDailyResetRemainingMs(user));
    }, 1000);
    return () => clearInterval(timer);
  }, [user]);

  const canClaimDaily = Backend.canClaimDaily(user) || resetRemainingMs <= 0;

  const handleClaimDaily = () => {
    try {
      const updated = Backend.claimDailyBonus(user);
      onUpdateUser(updated);
    } catch {
      Sound.lose();
    }
  };

  const handleEraseAccount = async () => {
    setIsDeleting(true);
    try {
      await Backend.deleteUserAccount(user.uid);
      Sound.lose();
      onLogout();
    } catch {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError('');
    try {
      const dataUrl = await processImageUpload(file);
      const updated = { ...user, avatar: dataUrl };
      Backend.updateUser(updated);
      onUpdateUser(updated);
      Sound.win();
    } catch (err: unknown) {
      setAvatarError((err as Error).message || 'Failed to upload photo');
      Sound.lose();
    }
  };

  const handleSelectPresetAvatar = (emoji: string) => {
    const updated = { ...user, avatar: emoji };
    Backend.updateUser(updated);
    onUpdateUser(updated);
    Sound.click();
  };

  const handleRemoveAvatar = () => {
    const updated = { ...user, avatar: undefined };
    Backend.updateUser(updated);
    onUpdateUser(updated);
    Sound.click();
  };

  const totalWins = Object.values(user.wins || {}).reduce((a, b) => a + b, 0);

  return (
    <div className="max-w-xl mx-auto space-y-4">
      {/* Profile Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="relative group">
              <UserAvatar
                avatar={user.avatar}
                username={user.username}
                size="lg"
                className="ring-2 ring-amber-400/40"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 p-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-full shadow-md transition-all cursor-pointer"
                title="Change profile picture"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <h2 className="text-lg font-black text-slate-100">{user.username}</h2>
              <span className="text-xs text-slate-400 block">{user.email}</span>
              <button
                type="button"
                onClick={() => setIsChangingAvatar(!isChangingAvatar)}
                className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold mt-0.5"
              >
                {isChangingAvatar ? 'Done' : 'Change Avatar'}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded-xl transition-all"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarFile}
          className="hidden"
        />

        {avatarError && (
          <div className="p-2 bg-rose-950/40 border border-rose-800 rounded-lg text-rose-300 text-xs">
            {avatarError}
          </div>
        )}

        {/* Avatar change panel */}
        {isChangingAvatar && (
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">Choose Profile Icon or Photo</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1 bg-amber-500 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-1 shadow-xs"
              >
                <Camera className="w-3 h-3" />
                <span>Upload From Device</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {PRESET_AVATARS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleSelectPresetAvatar(emoji)}
                  className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm transition-all ${
                    user.avatar === emoji
                      ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 scale-110 shadow-xs'
                      : 'bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  {emoji}
                </button>
              ))}

              {user.avatar && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="px-2 py-1 text-[11px] text-rose-400 hover:text-rose-300 border border-rose-900/60 rounded-lg shrink-0"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Wallet Points
            </span>
            <span className="text-xl font-black text-amber-400">
              ⭐ {(typeof user.points === 'number' ? user.points : 0).toLocaleString()}
            </span>
          </div>
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Victories Recorded
            </span>
            <span className="text-xl font-black text-emerald-400">
              {totalWins} Wins
            </span>
          </div>
        </div>

        {/* Daily Bonus Button & Countdown */}
        {canClaimDaily ? (
          <button
            type="button"
            onClick={handleClaimDaily}
            className="w-full py-3 bg-linear-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 transition-all active:scale-95 cursor-pointer"
          >
            <Gift className="w-4 h-4" />
            <span>CLAIM DAILY BONUS (+500 ⭐)</span>
          </button>
        ) : (
          <div className="w-full py-3 px-4 bg-slate-950 border border-slate-800/80 rounded-xl text-xs text-slate-300 font-semibold text-center flex flex-col items-center justify-center gap-1.5 shadow-inner">
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <Clock className="w-4 h-4 animate-spin text-amber-400" style={{ animationDuration: '6s' }} />
              <span>Next Reset In: {Backend.formatResetCountdown(resetRemainingMs)}</span>
            </div>
            <span className="text-[11px] text-slate-500">
              Daily bonuses reset automatically every 20 hours after your last claim.
            </span>
          </div>
        )}
      </div>

      {/* Game Wins Breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
          <Award className="w-4 h-4 text-amber-400" />
          <span>Game Victories Breakdown</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {Object.entries({
            Checkers: user.wins?.checkers || 0,
            Chess: user.wins?.chess || 0,
            Dominoes: user.wins?.dominoes || 0,
            Spades: user.wins?.spades || 0,
            Rummy: user.wins?.rummy || 0,
            Backgammon: user.wins?.backgammon || 0,
            Mahjong: user.wins?.mahjong || 0,
          }).map(([gameName, winCount]) => (
            <div
              key={gameName}
              className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-center"
            >
              <span className="text-[11px] text-slate-400 block">{gameName}</span>
              <span className="text-base font-extrabold text-amber-300">{winCount}</span>
            </div>
          ))}
        </div>
      </div>

      {/* System & Cloud Integration Status */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-slate-200">
            System & Cloud Integration
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">Firebase Database:</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-lg text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" /> Connected
            </span>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">In-Game Voice Talk:</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-lg text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" /> Connected
            </span>
          </div>
        </div>
      </div>

      {/* Account Deletion / Erase Option */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-rose-400 block">Erase Account</span>
          <span className="text-[11px] text-slate-400 block">
            Permanently delete your profile, stats, chats, and friends.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/80 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Erase Account</span>
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-800/80 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2 bg-rose-950/80 rounded-xl border border-rose-800/60">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-100">Permanently Erase Account?</h3>
                <p className="text-[11px] text-slate-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800">
              Your account <strong className="text-rose-400">{user.username}</strong> ({user.email}) will be completely erased from the database, including game points, friends, and chat logs.
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleEraseAccount}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-rose-900/40"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Erasing...</span>
                  </>
                ) : (
                  <span>Yes, Erase</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
