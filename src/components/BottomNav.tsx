import React from 'react';
import { Gamepad2, Users, Trophy, User as UserIcon } from 'lucide-react';
import { ViewType } from '../types';
import { Sound } from '../utils/sound';

interface BottomNavProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  friendRequestCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentView, onNavigate, friendRequestCount = 0 }) => {
  const tabs: { id: ViewType; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Games', icon: <Gamepad2 className="w-5 h-5" /> },
    { id: 'friends', label: 'Friends', icon: <Users className="w-5 h-5" /> },
    { id: 'leaderboard', label: 'Top 50', icon: <Trophy className="w-5 h-5" /> },
    { id: 'profile', label: 'Profile', icon: <UserIcon className="w-5 h-5" /> },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800 flex items-center justify-around px-2 py-1.5 pb-safe">
      {tabs.map((tab) => {
        const isActive = currentView === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              Sound.click();
              onNavigate(tab.id);
            }}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg text-xs font-semibold transition-all duration-150 relative ${
              isActive
                ? 'text-amber-400 -translate-y-0.5'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              {tab.icon}
              {tab.id === 'friends' && friendRequestCount > 0 && (
                <span className="absolute -top-1 -right-2 px-1 py-0.2 bg-rose-500 text-white text-[9px] font-black rounded-full animate-pulse shadow-xs min-w-[14px] text-center">
                  {friendRequestCount}
                </span>
              )}
            </div>
            <span className="text-[11px] mt-0.5">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
