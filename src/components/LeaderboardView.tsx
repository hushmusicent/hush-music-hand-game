import React, { useEffect, useState } from 'react';
import { Trophy, Medal } from 'lucide-react';
import { User } from '../types';
import { Backend } from '../utils/backend';
import { UserAvatar } from './UserAvatar';

interface LeaderboardViewProps {
  currentUser: User;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ currentUser }) => {
  const [leaders, setLeaders] = useState<User[]>([]);

  useEffect(() => {
    Backend.getLeaderboardAsync().then((list) => setLeaders(list));
  }, []);

  const myRank = leaders.findIndex((u) => u?.uid === currentUser?.uid) + 1;

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-black text-slate-100">Top 50 Leaderboard</h2>
        </div>
        {myRank > 0 && (
          <span className="text-xs text-amber-400 font-bold bg-slate-900 border border-amber-500/30 px-2.5 py-1 rounded-lg">
            Your Rank: #{myRank}
          </span>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs md:text-sm">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider">
                <th className="py-3 px-3 w-12 text-center">#</th>
                <th className="py-3 px-4">Player</th>
                <th className="py-3 px-4 text-right">Points</th>
                <th className="py-3 px-4 text-right">Total Wins</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {leaders.filter(Boolean).map((player, idx) => {
                const isMe = player.uid === currentUser?.uid;
                const totalWins = Object.values(player.wins || {}).reduce(
                  (a, b) => (typeof b === 'number' ? a + b : a),
                  0
                );
                const points = typeof player.points === 'number' ? player.points : 0;

                return (
                  <tr
                    key={player.uid || `player_${idx}`}
                    className={`transition-colors ${
                      isMe
                        ? 'bg-amber-500/10 text-amber-300 font-bold'
                        : 'text-slate-300 hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-3 px-3 text-center">
                      {idx === 0 ? (
                        <Medal className="w-4 h-4 text-yellow-400 mx-auto" />
                      ) : idx === 1 ? (
                        <Medal className="w-4 h-4 text-slate-300 mx-auto" />
                      ) : idx === 2 ? (
                        <Medal className="w-4 h-4 text-amber-600 mx-auto" />
                      ) : (
                        <span className="text-slate-500 font-medium tabular-nums">{idx + 1}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          avatar={player.avatar}
                          username={player.username || 'Player'}
                          size="xs"
                        />
                        <span className="truncate max-w-[130px] md:max-w-[200px]">
                          {player.username || 'Player'}
                        </span>
                        {isMe && (
                          <span className="text-[10px] bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded font-extrabold uppercase">
                            YOU
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums font-bold text-amber-400">
                      ⭐ {points.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-slate-400 font-semibold">
                      {totalWins}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
