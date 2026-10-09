import React from 'react';
import { Bot, Mic, MicOff } from 'lucide-react';
import { UserAvatar } from './UserAvatar';

interface PlayerBadgeProps {
  name: string;
  avatar?: string;
  isRobot?: boolean;
  subtitle?: string;
  isTurn?: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
  size?: 'sm' | 'md';
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export const PlayerBadge: React.FC<PlayerBadgeProps> = ({
  name,
  avatar,
  isRobot = false,
  subtitle,
  isTurn = false,
  isSpeaking = false,
  isMuted = false,
  size = 'md',
  align = 'left',
  className = '',
}) => {
  const isActuallyRobot =
    isRobot ||
    name.toLowerCase().includes('bot') ||
    name.toLowerCase().includes('dealer') ||
    name.toLowerCase().includes('computer');

  return (
    <div
      className={`inline-flex items-center gap-2 select-none ${
        align === 'right' ? 'flex-row-reverse text-right' : align === 'center' ? 'flex-col text-center' : 'text-left'
      } ${className}`}
    >
      {/* Avatar or Robot Icon */}
      <div className="relative shrink-0">
        <div
          className={`rounded-full transition-all duration-150 ${
            isSpeaking ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.4)] animate-pulse' : ''
          }`}
        >
          {isActuallyRobot ? (
            <div
              className={`rounded-full bg-linear-to-tr from-indigo-700 to-indigo-500 border border-indigo-400/50 shadow-md flex items-center justify-center text-white ${
                size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'
              }`}
              title="Computer / Robot AI Player"
            >
              <Bot className={size === 'sm' ? 'w-4 h-4 text-indigo-100' : 'w-5 h-5 text-indigo-100'} />
            </div>
          ) : (
            <UserAvatar
              avatar={avatar}
              username={name}
              size={size === 'sm' ? 'sm' : 'md'}
            />
          )}
        </div>

        {isTurn && (
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-slate-950 absolute -top-0.5 -right-0.5 animate-pulse" />
        )}

        {isSpeaking && !isActuallyRobot && (
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 border border-slate-950 absolute -bottom-0.5 -right-0.5 animate-ping" />
        )}

        {isMuted && !isActuallyRobot && (
          <span className="bg-rose-600 rounded-full p-0.5 border border-slate-950 absolute -bottom-1 -right-1 text-white">
            <MicOff className="w-2 h-2" />
          </span>
        )}
      </div>

      {/* Name and optional subtitle */}
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-extrabold text-xs md:text-sm text-slate-100 truncate">
            {name}
          </span>
          {isActuallyRobot ? (
            <span className="text-[10px] bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 px-1.5 py-0.2 rounded font-semibold uppercase tracking-wider">
              AI
            </span>
          ) : isSpeaking ? (
            <span className="text-[9px] bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 px-1 py-0.1 rounded font-bold uppercase tracking-wider flex items-center gap-0.5">
              <Mic className="w-2 h-2 text-emerald-400" />
              <span>Live</span>
            </span>
          ) : null}
        </div>
        {subtitle && (
          <span className="text-[10px] text-slate-400 truncate leading-tight">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
};
