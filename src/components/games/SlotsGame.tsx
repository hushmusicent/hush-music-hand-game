import React, { useState, useEffect, useRef } from 'react';
import { User } from '../../types';
import { PlayerBadge } from '../PlayerBadge';
import { Backend } from '../../utils/backend';
import { Sound } from '../../utils/sound';
import hushLogo from '../../assets/images/hush_gold_black_bright.png';
import {
  Sparkles,
  Trophy,
  HelpCircle,
  Zap,
  RotateCcw,
  Gift,
  X,
} from 'lucide-react';

export interface SlotSymbol {
  id: string;
  s: string;
  name: string;
  weight: number;
  payout: number; // 3-of-a-kind line multiplier
  payout2?: number; // 2-of-a-kind line multiplier (for cherry)
  isWild?: boolean;
  isScatter?: boolean;
}

export const SYMBOLS: SlotSymbol[] = [
  {
    id: 'wild',
    s: '👑',
    name: 'Hush Music Logo (Wild)',
    weight: 5,
    payout: 200,
    isWild: true,
  },
  {
    id: 'scatter',
    s: '🎧',
    name: 'Music Scatter',
    weight: 5,
    payout: 25, // Multiplies total bet on 3 scatters + Free Spins
    isScatter: true,
  },
  {
    id: 'seven',
    s: '7️⃣',
    name: 'Lucky 7',
    weight: 6,
    payout: 100,
  },
  {
    id: 'diamond',
    s: '💎',
    name: 'Diamond',
    weight: 9,
    payout: 50,
  },
  {
    id: 'bell',
    s: '🔔',
    name: 'Golden Bell',
    weight: 12,
    payout: 30,
  },
  {
    id: 'mic',
    s: '🎙️',
    name: 'Gold Mic',
    weight: 15,
    payout: 20,
  },
  {
    id: 'watermelon',
    s: '🍉',
    name: 'Watermelon',
    weight: 18,
    payout: 15,
  },
  {
    id: 'grapes',
    s: '🍇',
    name: 'Grapes',
    weight: 22,
    payout: 10,
  },
  {
    id: 'lemon',
    s: '🍋',
    name: 'Lemon',
    weight: 26,
    payout: 8,
  },
  {
    id: 'cherry',
    s: '🍒',
    name: 'Cherry',
    weight: 30,
    payout: 5,
    payout2: 2, // 2 cherries = 2x
  },
];

const WEIGHTED_POOL: string[] = [];
SYMBOLS.forEach((sym) => {
  for (let i = 0; i < sym.weight; i++) {
    WEIGHTED_POOL.push(sym.s);
  }
});

function randomSymbol(): string {
  return WEIGHTED_POOL[Math.floor(Math.random() * WEIGHTED_POOL.length)];
}

// Exactly 5 Classic Paylines across 3 Reels (0..2) and 3 Rows (0=Top, 1=Middle, 2=Bottom)
export interface Payline {
  id: number;
  name: string;
  description: string;
  color: string;
  coords: [number, number, number]; // [row on reel 0, row on reel 1, row on reel 2]
}

export const PAYLINES: Payline[] = [
  {
    id: 1,
    name: 'Middle Line',
    description: 'Horizontal Center Row',
    color: '#f59e0b', // Amber
    coords: [1, 1, 1],
  },
  {
    id: 2,
    name: 'Top Line',
    description: 'Horizontal Top Row',
    color: '#10b981', // Emerald
    coords: [0, 0, 0],
  },
  {
    id: 3,
    name: 'Bottom Line',
    description: 'Horizontal Bottom Row',
    color: '#06b6d4', // Cyan
    coords: [2, 2, 2],
  },
  {
    id: 4,
    name: 'Diagonal Down',
    description: 'Top-Left to Bottom-Right',
    color: '#8b5cf6', // Violet
    coords: [0, 1, 2],
  },
  {
    id: 5,
    name: 'Diagonal Up',
    description: 'Bottom-Left to Top-Right',
    color: '#ec4899', // Pink
    coords: [2, 1, 0],
  },
];

export interface LineWin {
  lineId: number;
  lineName: string;
  lineColor: string;
  symbol: string;
  count: number;
  multiplier: number;
  payout: number;
  winningCoords: [number, number][]; // [row, col]
}

interface SlotsGameProps {
  user: User;
  onUpdateUser: (updated: User) => void;
}

export const SlotsGame: React.FC<SlotsGameProps> = ({ user, onUpdateUser }) => {
  // 3 rows x 3 reels grid
  const [grid, setGrid] = useState<string[][]>([
    ['7️⃣', '👑', '💎'],
    ['🍒', '🎙️', '🔔'],
    ['🍉', '🍇', '🍒'],
  ]);

  const [activeLines, setActiveLines] = useState<number>(5); // Exactly 1 to 5 lines
  const [betPerLine, setBetPerLine] = useState<number>(10); // 1, 2, 5, 10, 25, 50, 100
  const [spinning, setSpinning] = useState<boolean>(false);
  const [reelsSpinning, setReelsSpinning] = useState<boolean[]>([false, false, false]);

  const [winningLines, setWinningLines] = useState<LineWin[]>([]);
  const [totalWin, setTotalWin] = useState<number>(0);
  const [freeSpinsRemaining, setFreeSpinsRemaining] = useState<number>(0);
  const [highlightedLineId, setHighlightedLineId] = useState<number | null>(null);
  const [showAllLinesOverlay, setShowAllLinesOverlay] = useState<boolean>(false);
  const [showPaytable, setShowPaytable] = useState<boolean>(false);

  // Auto spin
  const [autoSpinCount, setAutoSpinCount] = useState<number>(0);
  const autoSpinRef = useRef<number>(0);

  const totalBet = activeLines * betPerLine;

  useEffect(() => {
    autoSpinRef.current = autoSpinCount;
  }, [autoSpinCount]);

  const handleLineCountChange = (lines: number) => {
    if (spinning) return;
    setActiveLines(Math.min(5, Math.max(1, lines)));
    Sound.click();
  };

  const handleBetChange = (amount: number) => {
    if (spinning) return;
    setBetPerLine(amount);
    Sound.click();
  };

  const handleMaxBet = () => {
    if (spinning) return;
    setActiveLines(5);
    const maxPerLine = [50, 25, 10, 5, 2, 1].find((b) => b * 5 <= user.points) || 1;
    setBetPerLine(maxPerLine);
    Sound.click();
  };

  const handleSpin = () => {
    if (spinning) return;

    const isFreeSpin = freeSpinsRemaining > 0;
    if (!isFreeSpin && user.points < totalBet) {
      Sound.lose();
      return;
    }

    let updatedUser = user;
    if (!isFreeSpin) {
      updatedUser = Backend.updatePoints(user, -totalBet, 'slots_bet');
      onUpdateUser(updatedUser);
    }

    setSpinning(true);
    setWinningLines([]);
    setTotalWin(0);
    setHighlightedLineId(null);
    Sound.chipBet();

    // Start 3 reels spinning
    setReelsSpinning([true, true, true]);

    const tickInterval = setInterval(() => {
      setGrid((prev) => prev.map((row) => row.map(() => randomSymbol())));
    }, 70);

    // Final outcome
    const finalGrid: string[][] = [
      [randomSymbol(), randomSymbol(), randomSymbol()],
      [randomSymbol(), randomSymbol(), randomSymbol()],
      [randomSymbol(), randomSymbol(), randomSymbol()],
    ];

    // Reel 1 stops at 400ms
    setTimeout(() => {
      setReelsSpinning([false, true, true]);
      Sound.click();
    }, 400);

    // Reel 2 stops at 600ms
    setTimeout(() => {
      setReelsSpinning([false, false, true]);
      Sound.click();
    }, 600);

    // Reel 3 stops at 800ms
    setTimeout(() => {
      clearInterval(tickInterval);
      setReelsSpinning([false, false, false]);
      setGrid(finalGrid);
      setSpinning(false);
      Sound.click();

      evaluateResults(finalGrid, updatedUser, isFreeSpin);
    }, 800);
  };

  const evaluateResults = (curGrid: string[][], curUser: User, isFreeSpin: boolean) => {
    const linesToEvaluate = PAYLINES.slice(0, activeLines);
    const lineWins: LineWin[] = [];
    let calculatedTotalWin = 0;
    const multiplierBonus = isFreeSpin ? 2 : 1;

    // Check each active line of the 5 paylines
    linesToEvaluate.forEach((line) => {
      const s0 = curGrid[line.coords[0]][0];
      const s1 = curGrid[line.coords[1]][1];
      const s2 = curGrid[line.coords[2]][2];

      const syms = [s0, s1, s2];

      // Identify target matching symbol
      const nonWild = syms.find((s) => s !== '👑') || '👑';
      const def = SYMBOLS.find((s) => s.s === nonWild);
      if (!def || def.isScatter) return;

      // Check 3-of-a-kind (any symbol or wild)
      const isThreeOfAKind = syms.every((s) => s === nonWild || s === '👑');

      if (isThreeOfAKind) {
        const mult = (nonWild === '👑' ? 200 : def.payout) * multiplierBonus;
        const winAmt = mult * betPerLine;
        calculatedTotalWin += winAmt;

        lineWins.push({
          lineId: line.id,
          lineName: line.name,
          lineColor: line.color,
          symbol: nonWild,
          count: 3,
          multiplier: mult,
          payout: winAmt,
          winningCoords: [
            [line.coords[0], 0],
            [line.coords[1], 1],
            [line.coords[2], 2],
          ],
        });
      } else if (nonWild === '🍒') {
        // Cherry pays for 2 on line from left (s0 + s1)
        const isTwoCherries =
          (s0 === '🍒' || s0 === '👑') && (s1 === '🍒' || s1 === '👑');
        if (isTwoCherries) {
          const mult = 2 * multiplierBonus;
          const winAmt = mult * betPerLine;
          calculatedTotalWin += winAmt;

          lineWins.push({
            lineId: line.id,
            lineName: line.name,
            lineColor: line.color,
            symbol: '🍒',
            count: 2,
            multiplier: mult,
            payout: winAmt,
            winningCoords: [
              [line.coords[0], 0],
              [line.coords[1], 1],
            ],
          });
        }
      }
    });

    // Check Scatters (🎧 Music Headphone anywhere on the 3x3 grid)
    let totalScatters = 0;
    curGrid.forEach((row) => {
      row.forEach((sym) => {
        if (sym === '🎧') totalScatters++;
      });
    });

    if (totalScatters >= 3) {
      const scatterWin = 25 * totalBet * multiplierBonus;
      calculatedTotalWin += scatterWin;
      setFreeSpinsRemaining((prev) => prev + 10);
      Sound.jackpot();
    }

    setWinningLines(lineWins);
    setTotalWin(calculatedTotalWin);

    let finalUser = curUser;
    if (calculatedTotalWin > 0) {
      finalUser = Backend.updatePoints(curUser, calculatedTotalWin, 'slots_win');
      onUpdateUser(finalUser);

      if (calculatedTotalWin >= totalBet * 10) {
        Sound.jackpot();
      } else {
        Sound.win();
      }
    } else {
      Sound.lose();
    }

    if (isFreeSpin) {
      setFreeSpinsRemaining((prev) => Math.max(0, prev - 1));
    }

    // Auto-spin handler
    if (autoSpinRef.current > 0) {
      const remaining = autoSpinRef.current - 1;
      setAutoSpinCount(remaining);
      if (remaining > 0 && finalUser.points >= totalBet) {
        setTimeout(() => {
          handleSpin();
        }, 700);
      } else {
        setAutoSpinCount(0);
      }
    }
  };

  const handleStartAutoSpin = (count: number) => {
    setAutoSpinCount(count);
    Sound.click();
    if (!spinning) {
      handleSpin();
    }
  };

  const isCellWinning = (row: number, col: number): boolean => {
    if (highlightedLineId !== null) {
      const activeLine = winningLines.find((w) => w.lineId === highlightedLineId);
      return activeLine?.winningCoords.some(([r, c]) => r === row && c === col) ?? false;
    }
    return winningLines.some((w) =>
      w.winningCoords.some(([r, c]) => r === row && c === col)
    );
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 font-sans select-none">
      {/* HUD Header */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs shadow-md">
        <PlayerBadge
          name={user.username}
          avatar={user.avatar}
          subtitle={`⭐ ${(user.points ?? 0).toLocaleString()}`}
          size="sm"
        />

        <div className="flex items-center gap-2">
          {freeSpinsRemaining > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 border border-amber-500/40 rounded-lg text-amber-300 font-extrabold text-xs animate-pulse">
              <Gift className="w-3.5 h-3.5 text-amber-400" />
              <span>FREE SPINS: {freeSpinsRemaining} (2x)</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              Sound.click();
              setShowPaytable(true);
            }}
            className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg text-xs flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>5 Lines Guide</span>
          </button>
        </div>
      </div>

      {/* 5-Line Slot Machine Cabinet */}
      <div className="relative rounded-2xl bg-linear-to-b from-slate-900 via-amber-950/40 to-slate-950 border-4 md:border-6 border-amber-600/40 shadow-2xl p-4 md:p-5 ring-1 ring-amber-400/30 overflow-hidden">
        {/* Machine Header */}
        <div className="flex items-center justify-between pb-3 mb-2 border-b border-amber-500/20">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-linear-to-tr from-amber-500 to-amber-200 p-0.5 shadow-md">
              <img
                src={hushLogo}
                alt="Hush Music Logo"
                className="w-full h-full object-contain rounded-[8px]"
              />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-black tracking-wider text-amber-400 uppercase flex items-center gap-1.5">
                <span>HUSH 5-LINE SLOTS</span>
                <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
              </h2>
              <span className="text-[10px] text-slate-400 font-semibold">
                3 REELS · 5 PAYLINES · 3 HORIZONTAL & 2 DIAGONAL
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">
              Win
            </span>
            <span
              className={`text-sm md:text-lg font-black ${
                totalWin > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-500'
              }`}
            >
              {totalWin > 0 ? `+${totalWin.toLocaleString()} ⭐` : '0 ⭐'}
            </span>
          </div>
        </div>

        {/* 3x3 Reel Matrix with 5 Payline Tabs */}
        <div className="relative flex items-center justify-between gap-2 my-2">
          {/* Left Line Number Badges (1 to 5) */}
          <div className="flex flex-col justify-around h-68 md:h-76 gap-2 py-1">
            {PAYLINES.map((line) => {
              const isActive = line.id <= activeLines;
              const isWinning = winningLines.some((w) => w.lineId === line.id);
              const isHovered = highlightedLineId === line.id;

              return (
                <button
                  key={line.id}
                  type="button"
                  onMouseEnter={() => setHighlightedLineId(line.id)}
                  onMouseLeave={() => setHighlightedLineId(null)}
                  onClick={() => handleLineCountChange(line.id)}
                  className={`w-7 h-7 md:w-8 md:h-8 rounded-lg font-black text-xs md:text-sm flex items-center justify-center transition-all cursor-pointer shadow-md ${
                    isWinning
                      ? 'bg-amber-400 text-slate-950 scale-110 ring-2 ring-amber-300 animate-bounce'
                      : isHovered
                      ? 'bg-white text-slate-950 scale-105'
                      : isActive
                      ? 'text-white'
                      : 'bg-slate-800 text-slate-600 opacity-40'
                  }`}
                  style={{
                    backgroundColor: isActive && !isWinning && !isHovered ? line.color : undefined,
                  }}
                  title={`Line ${line.id}: ${line.name} (${line.description})`}
                >
                  {line.id}
                </button>
              );
            })}
          </div>

          {/* 3x3 Reel Frame */}
          <div className="relative flex-1 bg-slate-950/95 rounded-2xl border-2 border-amber-500/30 p-3 md:p-4 shadow-[inset_0_4px_20px_rgba(0,0,0,0.85)] overflow-hidden">
            {/* Subtle Hush Logo Watermark on Reel Background */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.06] select-none">
              <img src={hushLogo} alt="" className="w-56 h-56 object-contain" />
            </div>

            {/* SVG Connecting Overlay for the 5 Paylines */}
            <svg
              className="absolute inset-3 md:inset-4 w-[calc(100%-1.5rem)] md:w-[calc(100%-2rem)] h-[calc(100%-1.5rem)] md:h-[calc(100%-2rem)] pointer-events-none z-30"
              viewBox="0 0 300 300"
              preserveAspectRatio="none"
            >
              {PAYLINES.filter((p) =>
                showAllLinesOverlay
                  ? p.id <= activeLines
                  : highlightedLineId !== null
                  ? p.id === highlightedLineId
                  : winningLines.some((w) => w.lineId === p.id)
              ).map((line) => {
                const points = line.coords
                  .map((row, col) => `${50 + col * 100},${50 + row * 100}`)
                  .join(' ');
                const isWin = winningLines.some((w) => w.lineId === line.id);

                return (
                  <polyline
                    key={line.id}
                    points={points}
                    fill="none"
                    stroke={line.color}
                    strokeWidth={isWin ? '6' : '4'}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeOpacity={isWin ? '0.95' : showAllLinesOverlay ? '0.8' : '0.65'}
                    strokeDasharray={isWin ? 'none' : showAllLinesOverlay ? 'none' : '8 6'}
                    className={isWin ? 'drop-shadow-[0_0_14px_rgba(245,158,11,0.9)] animate-pulse' : ''}
                  />
                );
              })}
            </svg>

            {/* 3 Columns x 3 Rows Grid */}
            <div className="grid grid-cols-3 gap-2.5 md:gap-4 relative z-10">
              {[0, 1, 2].map((colIdx) => {
                const isColSpinning = reelsSpinning[colIdx];
                return (
                  <div
                    key={colIdx}
                    className={`flex flex-col gap-2.5 md:gap-4 rounded-xl p-1 bg-slate-900/60 border border-slate-800/80 transition-transform ${
                      isColSpinning ? 'animate-pulse' : ''
                    }`}
                  >
                    {[0, 1, 2].map((rowIdx) => {
                      const sym = grid[rowIdx][colIdx];
                      const winning = isCellWinning(rowIdx, colIdx);

                      return (
                        <div
                          key={rowIdx}
                          className={`w-full aspect-square rounded-2xl bg-linear-to-b from-slate-900 via-slate-950 to-slate-900 flex items-center justify-center select-none transition-all duration-150 relative shadow-inner overflow-hidden ${
                            winning
                              ? 'border-3 border-amber-400 bg-amber-500/25 scale-105 z-20 shadow-[0_0_16px_rgba(245,158,11,0.6)] ring-2 ring-amber-400/50'
                              : 'border border-slate-800/90'
                          }`}
                        >
                          {sym === '👑' ? (
                            <div className="w-full h-full p-2 md:p-3 flex items-center justify-center">
                              <img
                                src={hushLogo}
                                alt="Hush Music Logo"
                                className={`w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(245,158,11,0.7)] transition-transform duration-150 ${
                                  winning ? 'scale-115 rotate-1' : ''
                                }`}
                              />
                            </div>
                          ) : (
                            <span
                              className={`text-4xl md:text-6xl transform transition-transform ${
                                winning ? 'scale-115' : ''
                              }`}
                            >
                              {sym}
                            </span>
                          )}

                          {sym === '👑' && (
                            <span className="absolute bottom-1 right-1 text-[8px] md:text-[9px] bg-linear-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 font-black px-1.5 py-0.5 rounded-sm uppercase leading-none shadow-md">
                              HUSH WILD
                            </span>
                          )}

                          {sym === '🎧' && (
                            <span className="absolute bottom-1 right-1 text-[8px] md:text-[9px] bg-indigo-500 text-white font-black px-1.5 py-0.5 rounded-sm uppercase leading-none shadow-md">
                              SCATTER
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Line Number Badges (1 to 5) */}
          <div className="flex flex-col justify-around h-68 md:h-76 gap-2 py-1">
            {PAYLINES.map((line) => {
              const isActive = line.id <= activeLines;
              const isWinning = winningLines.some((w) => w.lineId === line.id);
              const isHovered = highlightedLineId === line.id;

              return (
                <button
                  key={line.id}
                  type="button"
                  onMouseEnter={() => setHighlightedLineId(line.id)}
                  onMouseLeave={() => setHighlightedLineId(null)}
                  onClick={() => handleLineCountChange(line.id)}
                  className={`w-7 h-7 md:w-8 md:h-8 rounded-lg font-black text-xs md:text-sm flex items-center justify-center transition-all cursor-pointer shadow-md ${
                    isWinning
                      ? 'bg-amber-400 text-slate-950 scale-110 ring-2 ring-amber-300 animate-bounce'
                      : isHovered
                      ? 'bg-white text-slate-950 scale-105'
                      : isActive
                      ? 'text-white'
                      : 'bg-slate-800 text-slate-600 opacity-40'
                  }`}
                  style={{
                    backgroundColor: isActive && !isWinning && !isHovered ? line.color : undefined,
                  }}
                  title={`Line ${line.id}: ${line.name} (${line.description})`}
                >
                  {line.id}
                </button>
              );
            })}
          </div>
        </div>

        {/* 5 Paylines Quick Interactive Guide Bar */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 p-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs my-2">
          <div className="flex items-center gap-1.5 text-slate-400 font-bold text-[11px] uppercase tracking-wider pl-1">
            <span className="text-amber-400">5 Lines:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PAYLINES.map((p) => {
              const isSelected = highlightedLineId === p.id;
              const isWin = winningLines.some((w) => w.lineId === p.id);
              const isActive = p.id <= activeLines;

              return (
                <button
                  key={p.id}
                  type="button"
                  onMouseEnter={() => setHighlightedLineId(p.id)}
                  onMouseLeave={() => setHighlightedLineId(null)}
                  onClick={() => {
                    Sound.click();
                    setHighlightedLineId((prev) => (prev === p.id ? null : p.id));
                  }}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ${
                    isWin
                      ? 'ring-2 ring-amber-300 text-slate-950 font-black animate-bounce'
                      : isSelected
                      ? 'ring-2 ring-white text-white scale-105'
                      : isActive
                      ? 'text-slate-200 hover:text-white'
                      : 'text-slate-500 opacity-50'
                  }`}
                  style={{
                    backgroundColor: isWin ? '#fbbf24' : isSelected ? p.color : `${p.color}25`,
                    borderLeft: `3px solid ${p.color}`,
                  }}
                  title={`Line ${p.id}: ${p.name} (${p.description})`}
                >
                  <span className="font-extrabold">L{p.id}</span>
                  <span className="hidden sm:inline">{p.name.replace(' Line', '')}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              Sound.click();
              setShowAllLinesOverlay((prev) => !prev);
            }}
            className={`py-1 px-2.5 rounded-lg font-bold text-[11px] transition-all cursor-pointer ml-auto shrink-0 border ${
              showAllLinesOverlay
                ? 'bg-amber-400 border-amber-300 text-slate-950 shadow-md font-black'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            {showAllLinesOverlay ? 'Hide Lines' : 'View 5 Lines'}
          </button>
        </div>

        {/* Win Status Marquee */}
        <div className="min-h-7 flex items-center justify-center text-center px-3 py-1.5 bg-slate-950/80 border border-amber-500/20 rounded-xl my-2">
          {winningLines.length > 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-amber-300">
              <span className="text-amber-400">
                🎉 {winningLines.length} WINNING LINE{winningLines.length > 1 ? 'S' : ''}!
              </span>
              <span>
                {winningLines
                  .map((w) => `${w.lineName}: ${w.count}x ${w.symbol === '👑' ? 'Hush Logo 👑' : w.symbol} (+${w.payout} ⭐)`)
                  .join(' · ')}
              </span>
            </div>
          ) : (
            <span className="text-xs text-slate-400 font-semibold">
              Classic 5-Line Slot · Select 1 to 5 lines, set bet, and spin!
            </span>
          )}
        </div>

        {/* Controls Console */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Line Selection: 1 to 5 */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Paylines (1-5)</span>
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  disabled={spinning || activeLines <= 1}
                  onClick={() => handleLineCountChange(activeLines - 1)}
                  className="w-7 h-7 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded-lg font-black text-xs text-slate-300 flex items-center justify-center cursor-pointer"
                >
                  -
                </button>
                <span className="w-7 text-center font-black text-amber-400 text-sm">
                  {activeLines}
                </span>
                <button
                  type="button"
                  disabled={spinning || activeLines >= 5}
                  onClick={() => handleLineCountChange(activeLines + 1)}
                  className="w-7 h-7 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded-lg font-black text-xs text-slate-300 flex items-center justify-center cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            {/* Quick 1L, 3L, 5L ALL buttons */}
            <div className="flex gap-1 pt-3.5">
              {[1, 3, 5].map((count) => (
                <button
                  key={count}
                  type="button"
                  disabled={spinning}
                  onClick={() => handleLineCountChange(count)}
                  className={`py-1 px-2.5 rounded-lg font-extrabold text-[11px] transition-all cursor-pointer ${
                    activeLines === count
                      ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
                  }`}
                >
                  {count === 5 ? 'ALL 5' : `${count}L`}
                </button>
              ))}
            </div>
          </div>

          {/* Bet per Line & Total Bet */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Bet / Line</span>
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  disabled={spinning || betPerLine <= 1}
                  onClick={() => {
                    const idx = [1, 2, 5, 10, 25, 50, 100].indexOf(betPerLine);
                    if (idx > 0) handleBetChange([1, 2, 5, 10, 25, 50, 100][idx - 1]);
                  }}
                  className="w-7 h-7 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded-lg font-black text-xs text-slate-300 flex items-center justify-center cursor-pointer"
                >
                  -
                </button>
                <span className="w-9 text-center font-black text-amber-400 text-sm">
                  {betPerLine}
                </span>
                <button
                  type="button"
                  disabled={spinning || betPerLine >= 100}
                  onClick={() => {
                    const idx = [1, 2, 5, 10, 25, 50, 100].indexOf(betPerLine);
                    if (idx < 6 && idx !== -1) handleBetChange([1, 2, 5, 10, 25, 50, 100][idx + 1]);
                  }}
                  className="w-7 h-7 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded-lg font-black text-xs text-slate-300 flex items-center justify-center cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex flex-col text-right">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Total Bet</span>
              <span className="text-base font-black text-amber-400 tracking-tight">
                {totalBet} ⭐
              </span>
            </div>

            <button
              type="button"
              disabled={spinning}
              onClick={handleMaxBet}
              className="py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-400 font-black text-xs rounded-xl transition-all cursor-pointer active:scale-95 mt-3.5"
            >
              MAX
            </button>
          </div>

          {/* Spin Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {autoSpinCount > 0 ? (
              <button
                type="button"
                onClick={() => setAutoSpinCount(0)}
                className="flex-1 sm:flex-none py-3 px-4 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                STOP ({autoSpinCount})
              </button>
            ) : (
              <button
                type="button"
                disabled={spinning || user.points < totalBet}
                onClick={() => handleStartAutoSpin(10)}
                className="py-3 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 font-black text-xs rounded-xl border border-slate-700 transition-all active:scale-95 cursor-pointer"
              >
                AUTO 10
              </button>
            )}

            <button
              type="button"
              disabled={spinning || (freeSpinsRemaining === 0 && user.points < totalBet)}
              onClick={handleSpin}
              className={`flex-2 sm:flex-none py-3 px-7 rounded-xl font-black text-sm md:text-base tracking-wider uppercase shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer ${
                spinning
                  ? 'bg-amber-600/50 text-slate-900 cursor-not-allowed animate-pulse'
                  : freeSpinsRemaining > 0
                  ? 'bg-linear-to-r from-indigo-500 to-purple-500 text-white shadow-indigo-500/30'
                  : 'bg-linear-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 shadow-amber-500/25 hover:brightness-110'
              }`}
            >
              <Zap className="w-5 h-5 fill-current" />
              <span>{freeSpinsRemaining > 0 ? `FREE SPIN (${freeSpinsRemaining})` : 'SPIN'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5 Paylines Diagram & Paytable Modal */}
      {showPaytable && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 md:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-black text-slate-100 uppercase tracking-wider">
                  5 Paylines & Payouts
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPaytable(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* The 5 Paylines Visual Reference */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                The 5 Classic Paylines
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {PAYLINES.map((line) => (
                  <div
                    key={line.id}
                    className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-xl flex items-center justify-between gap-3"
                  >
                    <div>
                      <span className="font-extrabold text-sm" style={{ color: line.color }}>
                        Line {line.id}
                      </span>
                      <div className="text-[11px] font-bold text-slate-200">{line.name}</div>
                      <div className="text-[10px] text-slate-400">{line.description}</div>
                    </div>
                    {/* Mini 3x3 dot representation */}
                    <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1.5 rounded-lg border border-slate-800">
                      {[0, 1, 2].map((col) => (
                        <div key={col} className="flex flex-col gap-1 items-center">
                          {[0, 1, 2].map((row) => (
                            <div
                              key={row}
                              className={`w-2.5 h-2.5 rounded-full ${
                                line.coords[col] === row ? 'ring-1 ring-white' : 'bg-slate-800'
                              }`}
                              style={{
                                backgroundColor:
                                  line.coords[col] === row ? line.color : undefined,
                              }}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Symbol Payouts */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Symbol Payouts (Line Bet Multipliers)
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {SYMBOLS.map((s) => (
                  <div
                    key={s.id}
                    className="p-2 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center gap-2"
                  >
                    {s.id === 'wild' ? (
                      <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 p-0.5 flex items-center justify-center shrink-0">
                        <img src={hushLogo} alt="Hush Music Logo" className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <span className="text-2xl">{s.s}</span>
                    )}
                    <div className="flex flex-col text-[11px]">
                      <span className="font-bold text-slate-200">{s.name}</span>
                      <span className="text-amber-400 font-mono font-bold">
                        {s.isScatter
                          ? '3+ = 25x Total + 10 Free Spins'
                          : s.payout2
                          ? `3x=${s.payout}x · 2x=${s.payout2}x`
                          : `3x = ${s.payout}x`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowPaytable(false)}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition-all cursor-pointer"
              >
                Back to Slots
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
