import React, { useState } from 'react';
import { Coins } from 'lucide-react';
import { Sound } from '../utils/sound';

interface BetWidgetProps {
  balance: number;
  onBet: (amount: number) => void;
  options?: number[];
  disabled?: boolean;
}

export const BetWidget: React.FC<BetWidgetProps> = ({
  balance,
  onBet,
  options = [10, 25, 50, 100, 250],
  disabled = false,
}) => {
  const [selectedBet, setSelectedBet] = useState(options[1] || 25);

  const handlePlaceBet = () => {
    if (selectedBet > balance) {
      Sound.lose();
      return;
    }
    Sound.chipBet();
    onBet(selectedBet);
  };

  return (
    <div className="w-full bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
          Wager Selection
        </span>
        <span className="text-xs text-amber-400/90 font-medium">
          Available: ⭐ {(balance ?? 0).toLocaleString()}
        </span>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={disabled || opt > balance}
            onClick={() => {
              setSelectedBet(opt);
              Sound.click();
            }}
            className={`py-2 px-1 text-sm font-bold rounded-lg border transition-all duration-150 flex flex-col items-center justify-center gap-0.5 ${
              selectedBet === opt
                ? 'bg-amber-500/20 border-amber-400 text-amber-300 ring-2 ring-amber-400/30'
                : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800'
            } ${opt > balance ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <span className="text-xs text-slate-400">⭐</span>
            <span>{opt}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={disabled || selectedBet > balance}
        onClick={handlePlaceBet}
        className="w-full mt-1 py-3 px-4 bg-linear-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-extrabold text-sm rounded-xl shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2 transition-all"
      >
        <Coins className="w-4 h-4" />
        <span>PLACE BET ({selectedBet} ⭐)</span>
      </button>
    </div>
  );
};
