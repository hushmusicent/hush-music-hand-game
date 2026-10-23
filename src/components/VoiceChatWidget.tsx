import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  PhoneOff,
  Radio,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  Users,
} from 'lucide-react';
import { Room, User } from '../types';
import { useVoiceChat } from '../hooks/useVoiceChat';
import { UserAvatar } from './UserAvatar';

interface VoiceChatWidgetProps {
  room: Room | null;
  currentUser: User;
  className?: string;
  compactOnly?: boolean;
}

export const VoiceChatWidget: React.FC<VoiceChatWidgetProps> = ({
  room,
  currentUser,
  className = '',
  compactOnly = false,
}) => {
  const {
    isConnected,
    isConnecting,
    isMuted,
    isDeafened,
    isSpeaking,
    error,
    participants,
    joinVoice,
    leaveVoice,
    toggleMute,
    toggleDeafen,
  } = useVoiceChat(room, currentUser);

  const [isExpanded, setIsExpanded] = useState(true);

  if (!room) return null;

  // Render when NOT connected to voice
  if (!isConnected && !isConnecting) {
    return (
      <div className={`rounded-xl border border-slate-800 bg-slate-900/90 backdrop-blur-md p-3 shadow-lg ${className}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <span className="font-bold text-xs text-white block">
                Live Voice Conversation
              </span>
              <span className="text-[11px] text-slate-400">
                Talk in real-time with other humans at the table
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={joinVoice}
            className="px-3.5 py-1.5 bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-lg text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Join Voice Talk</span>
          </button>
        </div>

        {error && (
          <div className="mt-2.5 p-2 bg-rose-950/80 border border-rose-800 rounded-lg text-[11px] text-rose-300 flex items-center gap-1.5 animate-in fade-in">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}
      </div>
    );
  }

  // Connecting state
  if (isConnecting) {
    return (
      <div className={`rounded-xl border border-amber-500/30 bg-slate-900/90 backdrop-blur-md p-3 shadow-lg flex items-center justify-between gap-3 ${className}`}>
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          <span>Accessing microphone & connecting voice...</span>
        </div>
      </div>
    );
  }

  // Connected state - Compact banner or expandable panel
  return (
    <div className={`rounded-xl border border-emerald-500/40 bg-slate-900/95 backdrop-blur-md shadow-xl overflow-hidden transition-all duration-200 ${className}`}>
      {/* Top Header / Bar */}
      <div className="p-2.5 bg-emerald-950/40 border-b border-emerald-500/20 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block animate-ping absolute -top-0.5 -right-0.5" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
          </div>
          <span className="font-extrabold text-white flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span>Voice Connected</span>
          </span>
          <span className="text-[10px] text-emerald-300/80 bg-emerald-950/80 border border-emerald-800/60 px-1.5 py-0.2 rounded-full font-semibold">
            {participants.length} in call
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Mute Mic */}
          <button
            type="button"
            onClick={toggleMute}
            className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              isMuted
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
            }`}
            title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            {isMuted ? <MicOff className="w-3.5 h-3.5 text-rose-400" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
            <span className="text-[11px] hidden sm:inline">{isMuted ? 'Muted' : 'Mic On'}</span>
          </button>

          {/* Deafen / Speaker */}
          <button
            type="button"
            onClick={toggleDeafen}
            className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              isDeafened
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
            }`}
            title={isDeafened ? 'Undeafen Audio' : 'Deafen (Mute Incoming)'}
          >
            {isDeafened ? <VolumeX className="w-3.5 h-3.5 text-amber-400" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          {/* Leave Voice */}
          <button
            type="button"
            onClick={leaveVoice}
            className="p-1.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-800/60 text-rose-300 rounded-lg text-xs transition-colors cursor-pointer"
            title="Disconnect Voice Talk"
          >
            <PhoneOff className="w-3.5 h-3.5 text-rose-400" />
          </button>

          {!compactOnly && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer ml-1"
              title={isExpanded ? 'Collapse voice list' : 'Expand voice list'}
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-2 mx-2.5 mt-2 bg-rose-950/80 border border-rose-800 rounded-lg text-[11px] text-rose-300 flex items-center gap-1.5 animate-in fade-in">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Participants List */}
      {isExpanded && !compactOnly && (
        <div className="p-2.5 space-y-2 bg-slate-950/50 animate-in fade-in">
          <div className="flex flex-wrap gap-2">
            {participants.map((p) => {
              const isMe = p.uid === currentUser.uid;
              const isParticipantSpeaking = isMe ? isSpeaking : p.isSpeaking;

              return (
                <div
                  key={p.uid}
                  className={`flex items-center gap-2 p-1.5 pr-2.5 rounded-xl border text-xs transition-all ${
                    isParticipantSpeaking
                      ? 'bg-emerald-950/60 border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="relative">
                    <div
                      className={`rounded-full transition-all ${
                        isParticipantSpeaking
                          ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-slate-950'
                          : ''
                      }`}
                    >
                      <UserAvatar avatar={p.avatar} username={p.username} size="sm" />
                    </div>
                    {p.isMuted && (
                      <span className="absolute -bottom-1 -right-1 bg-rose-600 rounded-full p-0.5 border border-slate-950 text-white">
                        <MicOff className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1 font-bold text-slate-200">
                      <span className="truncate max-w-[90px]">{p.username}</span>
                      {isMe && <span className="text-[10px] text-slate-400">(You)</span>}
                    </div>

                    <div className="flex items-center gap-1 mt-0.5">
                      {isParticipantSpeaking ? (
                        <div className="flex items-center gap-0.5 text-emerald-400 text-[10px] font-bold">
                          <span className="inline-block w-1 h-2.5 bg-emerald-400 animate-pulse rounded-xs" />
                          <span className="inline-block w-1 h-3.5 bg-emerald-400 animate-pulse rounded-xs delay-75" />
                          <span className="inline-block w-1 h-1.5 bg-emerald-400 animate-pulse rounded-xs delay-150" />
                          <span className="ml-0.5">Speaking</span>
                        </div>
                      ) : p.isMuted ? (
                        <span className="text-[10px] text-rose-400 font-medium">Muted</span>
                      ) : (
                        <span className="text-[10px] text-slate-500">Connected</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
