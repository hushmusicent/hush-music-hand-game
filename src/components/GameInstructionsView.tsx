import React from 'react';
import { BookOpen, Target, CheckCircle2, Award, Lightbulb, Play } from 'lucide-react';
import { GameMetadata } from '../types';
import { Sound } from '../utils/sound';

interface GameInstructionsViewProps {
  game: GameMetadata;
  onBackToGame: () => void;
}

export const GameInstructionsView: React.FC<GameInstructionsViewProps> = ({
  game,
  onBackToGame,
}) => {
  const instructions = game.instructions;

  if (!instructions) {
    return (
      <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-3">
        <p className="text-xs text-slate-400">Instructions coming soon for this game.</p>
        <button
          type="button"
          onClick={onBackToGame}
          className="py-2.5 px-4 bg-amber-500 text-slate-950 font-bold rounded-xl text-xs"
        >
          Return to Game
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-2xl space-y-5 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xl">
            {game.icon}
          </div>
          <div>
            <h2 className="text-base md:text-lg font-black text-slate-100 flex items-center gap-2">
              <span>{game.name} Instructions</span>
            </h2>
            <span className="text-[11px] text-amber-400 font-semibold">{game.tags}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            Sound.click();
            onBackToGame();
          }}
          className="py-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
        >
          <Play className="w-3 h-3 fill-slate-950" />
          <span>Back to Game</span>
        </button>
      </div>

      {/* Overview & Objective */}
      <div className="space-y-3">
        <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 uppercase tracking-wider">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Overview</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{instructions.overview}</p>
        </div>

        <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
            <Target className="w-3.5 h-3.5" />
            <span>Objective</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{instructions.objective}</p>
        </div>
      </div>

      {/* Step by Step How to Play */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
          <span>How to Play</span>
        </h3>
        <ol className="space-y-2 list-none">
          {instructions.howToPlay.map((step, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2.5 p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/60 text-xs text-slate-300 leading-relaxed"
            >
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-extrabold text-[11px] flex items-center justify-center shrink-0 border border-amber-500/30">
                {idx + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Official Game Rules */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <span>Key Rules</span>
        </h3>
        <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 space-y-1.5 text-xs text-slate-300">
          {instructions.rules.map((rule, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-amber-400 font-bold">•</span>
              <span>{rule}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scoring & Payouts */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5" />
          <span>Scoring & Payouts</span>
        </h3>
        <div className="p-3 bg-amber-950/20 rounded-xl border border-amber-500/20 space-y-1.5 text-xs text-slate-300">
          {instructions.scoring.map((scoreItem, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-amber-400 font-bold">⭐</span>
              <span>{scoreItem}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pro Tips */}
      {instructions.proTips && instructions.proTips.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" />
            <span>Winning Strategy & Pro Tips</span>
          </h3>
          <div className="p-3 bg-sky-950/20 rounded-xl border border-sky-500/20 space-y-1.5 text-xs text-slate-300">
            {instructions.proTips.map((tip, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-sky-400 font-bold">💡</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Action Button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => {
            Sound.click();
            onBackToGame();
          }}
          className="w-full py-3 bg-linear-to-r from-amber-500 to-amber-400 hover:from-amber-400 text-slate-950 font-black text-xs md:text-sm rounded-xl shadow-lg shadow-amber-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Play className="w-4 h-4 fill-slate-950" />
          <span>Back to Playing {game.name}</span>
        </button>
      </div>
    </div>
  );
};
