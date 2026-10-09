import React, { useState } from 'react';
import { Volume2, VolumeX, Mic, MicOff, Sparkles, Users } from 'lucide-react';
import hushLogo from '../assets/images/hush_gold_black_bright.png';
import { Sound } from '../utils/sound';
import { ViewType } from '../types';
import { UserAvatar } from './UserAvatar';

interface HeaderProps {
  points: number;
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onOpenMultiplayer?: () => void;
  voiceActive?: boolean;
  onToggleVoice?: () => void;
  userAvatar?: string;
  username?: string;
  friendRequestCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  points,
  currentView,
  onNavigate,
  onOpenMultiplayer,
  voiceActive = false,
  onToggleVoice,
  userAvatar,
  username,
  friendRequestCount = 0,
}) => {
  const [muted, setMuted] = useState(Sound.muted);
  const [micMuted, setMicMuted] = useState(false);

  const handleToggleSound = () => {
    const isMuted = Sound.toggleMute();
    setMuted(isMuted);
  };

  const handleToggleMic = () => {
    setMicMuted(!micMuted);
    if (onToggleVoice) onToggleVoice();
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-slate-950/90 backdrop-blur-md border-b border-amber-500/20 px-3 py-2.5 md:px-6">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
        {/* Zone 1: Single Brand Title */}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="flex items-center gap-2 text-left group"
        >
          <div className="w-9 h-9 rounded-xl bg-linear-to-tr from-amber-500 via-yellow-400 to-amber-200 p-0.5 flex items-center justify-center shadow-md shadow-amber-500/25 ring-1 ring-amber-400/30">
            <div className="w-full h-full bg-slate-950 rounded-[10px] overflow-hidden flex items-center justify-center">
              <img
                src={hushLogo}
                alt="Hush Music Logo"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
              />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold tracking-tight text-sm md:text-base text-amber-400 group-hover:text-amber-300 transition-colors whitespace-nowrap">
              Hush Music Hand Game
            </span>
          </div>
        </button>

        {/* Zone 2: Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className={`transition-colors ${
              currentView === 'home' ? 'text-amber-400 font-semibold' : 'hover:text-white'
            }`}
          >
            Games
          </button>
          <button
            type="button"
            onClick={() => onNavigate('friends')}
            className={`transition-colors relative flex items-center gap-1.5 ${
              currentView === 'friends' ? 'text-amber-400 font-semibold' : 'hover:text-white'
            }`}
          >
            <span>Friends</span>
            {friendRequestCount > 0 && (
              <span className="px-1.5 py-0.2 bg-rose-500 text-white text-[10px] font-black rounded-full animate-pulse shadow-sm">
                {friendRequestCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('leaderboard')}
            className={`transition-colors ${
              currentView === 'leaderboard' ? 'text-amber-400 font-semibold' : 'hover:text-white'
            }`}
          >
            Top 50
          </button>
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className={`transition-colors ${
              currentView === 'profile' ? 'text-amber-400 font-semibold' : 'hover:text-white'
            }`}
          >
            Profile
          </button>
        </nav>

        {/* Zone 3: Actions & Player Stats */}
        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Avatar button */}
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="flex items-center gap-1.5 hover:scale-105 transition-transform cursor-pointer"
            title="View Profile"
          >
            <UserAvatar
              avatar={userAvatar}
              username={username}
              size="sm"
              className={currentView === 'profile' ? 'ring-2 ring-amber-400' : ''}
            />
          </button>

          {/* Points Pill */}
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900 border border-amber-500/30 rounded-xl text-amber-300 text-xs md:text-sm font-bold shadow-inner hover:border-amber-400 transition-all cursor-pointer"
            title="Your Point Balance - Click to view profile"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="tabular-nums">⭐ {(points ?? 0).toLocaleString()}</span>
          </button>

          {/* Multiplayer Quick Launch */}
          {onOpenMultiplayer && (
            <button
              type="button"
              onClick={onOpenMultiplayer}
              title="Join or Create Multiplayer Room"
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 rounded-xl text-amber-300 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Rooms</span>
            </button>
          )}

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={handleToggleSound}
            title={muted ? 'Unmute game sounds' : 'Mute game sounds'}
            className={`p-2 rounded-xl border transition-all text-xs flex items-center justify-center ${
              muted
                ? 'bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-300'
                : 'bg-slate-900 border-slate-700/80 text-amber-300 hover:border-amber-400'
            }`}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Voice Chat Toggle */}
          {voiceActive && (
            <button
              type="button"
              onClick={handleToggleMic}
              title={micMuted ? 'Unmute microphone' : 'Mute microphone'}
              className={`p-2 rounded-xl border transition-all text-xs flex items-center justify-center ${
                micMuted
                  ? 'bg-rose-950/40 border-rose-800 text-rose-400'
                  : 'bg-emerald-950/40 border-emerald-700 text-emerald-400'
              }`}
            >
              {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
