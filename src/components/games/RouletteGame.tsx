import React, { useState, useEffect, useRef } from 'react';
import { User } from '../../types';
import { PlayerBadge } from '../PlayerBadge';
import { Backend } from '../../utils/backend';
import { Sound } from '../../utils/sound';
import hushLogo from '../../assets/images/hush_gold_black_bright.png';
import {
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  Trash2,
  Zap,
  Info,
  Sliders,
} from 'lucide-react';

// Standard American Roulette 38 pockets order (with 0 and 00 directly opposite)
export const AMERICAN_WHEEL_NUMBERS: (number | '00')[] = [
  0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1,
  '00', 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2,
];

// European single-zero 37 pockets order
export const EUROPEAN_WHEEL_NUMBERS: (number | '00')[] = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export const RED_NUMBERS: number[] = [
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
];

export const BLACK_NUMBERS: number[] = [
  2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
];

export type BetSpotType =
  | 'number' // straight up 35:1 (0, 00, 1-36)
  | 'split0_00' // 0 and 00 split (17:1)
  | 'basket5' // 5-number bet: 0, 00, 1, 2, 3 (6:1)
  | 'red' // 1:1
  | 'black' // 1:1
  | 'even' // 1:1
  | 'odd' // 1:1
  | 'low' // 1-18 (1:1)
  | 'high' // 19-36 (1:1)
  | 'dozen1' // 1-12 (2:1)
  | 'dozen2' // 13-24 (2:1)
  | 'dozen3' // 25-36 (2:1)
  | 'col1' // column 1: 1, 4, 7... (2:1)
  | 'col2' // column 2: 2, 5, 8... (2:1)
  | 'col3'; // column 3: 3, 6, 9... (2:1)

export interface ChipDenomination {
  value: number;
  label: string;
  color: string;
  textColor: string;
  borderColor: string;
  ringColor: string;
}

export const CHIP_DENOMINATIONS: ChipDenomination[] = [
  { value: 1, label: '1', color: 'from-slate-100 to-slate-300', textColor: 'text-slate-900', borderColor: 'border-slate-300', ringColor: 'ring-slate-300' },
  { value: 5, label: '5', color: 'from-rose-600 to-rose-800', textColor: 'text-white', borderColor: 'border-rose-300', ringColor: 'ring-rose-400' },
  { value: 25, label: '25', color: 'from-emerald-600 to-emerald-800', textColor: 'text-white', borderColor: 'border-emerald-300', ringColor: 'ring-emerald-400' },
  { value: 100, label: '100', color: 'from-slate-800 to-black', textColor: 'text-amber-300', borderColor: 'border-amber-400', ringColor: 'ring-amber-400' },
  { value: 500, label: '500', color: 'from-purple-700 to-purple-950', textColor: 'text-amber-200', borderColor: 'border-purple-300', ringColor: 'ring-purple-400' },
  { value: 1000, label: '1K', color: 'from-amber-400 via-amber-500 to-amber-700', textColor: 'text-black', borderColor: 'border-amber-200', ringColor: 'ring-amber-300' },
];

export interface PlacedBet {
  key: string;
  spotType: BetSpotType;
  number?: number | '00';
  amount: number;
  chips: number[];
}

interface RouletteGameProps {
  user: User;
  onUpdateUser: (updated: User) => void;
}

export const RouletteGame: React.FC<RouletteGameProps> = ({ user, onUpdateUser }) => {
  const [tableMode, setTableMode] = useState<'american' | 'european'>('american');
  const [selectedChipValue, setSelectedChipValue] = useState<number>(25);
  const [bets, setBets] = useState<Record<string, PlacedBet>>({});
  const [spinning, setSpinning] = useState<boolean>(false);
  const [winningNumber, setWinningNumber] = useState<number | '00' | null>(null);
  const [wheelRotation, setWheelRotation] = useState<number>(0);
  const [ballRotation, setBallRotation] = useState<number>(0);
  const [ballDistance, setBallDistance] = useState<number>(108);
  const [lastHistory, setLastHistory] = useState<(number | '00')[]>([17, '00', 0, 32, 7]);
  const [lastWinAmount, setLastWinAmount] = useState<number | null>(null);
  const [lastBetAmount, setLastBetAmount] = useState<number | null>(null);
  const [hoveredSpot, setHoveredSpot] = useState<string | null>(null);
  const [showTableGuide, setShowTableGuide] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'win' | 'lose' | 'info' }>({
    text: 'Tap any number or outside box to place chips on the American roulette table felt, then tap Spin!',
    type: 'info',
  });

  const animFrameRef = useRef<number | null>(null);

  const activeWheelPockets = tableMode === 'american' ? AMERICAN_WHEEL_NUMBERS : EUROPEAN_WHEEL_NUMBERS;

  // Total bet on table
  const totalBet = Object.values(bets).reduce((acc, b) => acc + b.amount, 0);

  const getNumberColor = (num: number | '00'): 'green' | 'red' | 'black' => {
    if (num === 0 || num === '00') return 'green';
    return RED_NUMBERS.includes(num as number) ? 'red' : 'black';
  };

  // Place chip on a specific spot
  const handlePlaceBet = (spotKey: string, spotType: BetSpotType, numberVal?: number | '00') => {
    if (spinning) return;
    if (user.points < totalBet + selectedChipValue) {
      Sound.lose();
      setMessage({
        text: `Not enough ⭐ points to bet ${selectedChipValue}. Available: ${user.points - totalBet}`,
        type: 'lose',
      });
      return;
    }

    Sound.chipBet();
    setBets((prev) => {
      const existing = prev[spotKey];
      if (existing) {
        return {
          ...prev,
          [spotKey]: {
            ...existing,
            amount: existing.amount + selectedChipValue,
            chips: [...existing.chips, selectedChipValue],
          },
        };
      }
      return {
        ...prev,
        [spotKey]: {
          key: spotKey,
          spotType,
          number: numberVal,
          amount: selectedChipValue,
          chips: [selectedChipValue],
        },
      };
    });
  };

  // Clear all bets
  const handleClearBets = () => {
    if (spinning || totalBet === 0) return;
    Sound.click();
    setBets({});
    setMessage({
      text: 'All bets cleared from table. Place your chips.',
      type: 'info',
    });
  };

  // Double bets
  const handleDoubleBets = () => {
    if (spinning || totalBet === 0) return;
    if (user.points < totalBet * 2) {
      Sound.lose();
      setMessage({ text: 'Not enough ⭐ points to double table bets.', type: 'lose' });
      return;
    }
    Sound.chipBet();
    setBets((prev) => {
      const updated: Record<string, PlacedBet> = {};
      Object.entries(prev).forEach(([k, v]) => {
        updated[k] = {
          ...v,
          amount: v.amount * 2,
          chips: [...v.chips, ...v.chips],
        };
      });
      return updated;
    });
  };

  // Spin the wheel
  const handleSpin = () => {
    if (spinning) return;
    if (totalBet === 0) {
      Sound.click();
      setMessage({
        text: 'Please place at least one chip on the table felt before spinning!',
        type: 'info',
      });
      return;
    }

    if (user.points < totalBet) {
      Sound.lose();
      setMessage({ text: 'Insufficient ⭐ points for this bet!', type: 'lose' });
      return;
    }

    // Deduct bet from balance
    const userAfterBet = Backend.updatePoints(user, -totalBet, 'roulette_bet');
    onUpdateUser(userAfterBet);

    setSpinning(true);
    setWinningNumber(null);
    setLastBetAmount(totalBet);
    setLastWinAmount(null);
    Sound.chipBet();
    setMessage({ text: 'No more bets! The croupier spins the ball around the wheel...', type: 'info' });

    // Pick winning pocket
    const wheelList = activeWheelPockets;
    const randomIndex = Math.floor(Math.random() * wheelList.length);
    const chosenPocket = wheelList[randomIndex];

    // Compute wheel target rotation and ball physics
    const pocketIndex = randomIndex;
    const sliceAngle = 360 / wheelList.length;
    const currentWheelMod = wheelRotation % 360;
    const additionalWheelTurns = 4 * 360;
    const targetWheelAngle =
      wheelRotation +
      additionalWheelTurns +
      (360 - currentWheelMod) +
      (wheelList.length - 1 - pocketIndex) * sliceAngle;

    // Ball spins in reverse direction
    const ballExtraSpins = -1 * (6 * 360 + Math.random() * 180);
    const targetBallAngle = ballRotation + ballExtraSpins;

    const startTime = performance.now();
    const duration = 4600;

    const initialWheel = wheelRotation;
    const initialBall = ballRotation;
    let lastTickAngle = initialBall;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const easeWheel = 1 - Math.pow(1 - progress, 3);
      const easeBall = 1 - Math.pow(1 - progress, 2.5);

      const curWheelAngle = initialWheel + (targetWheelAngle - initialWheel) * easeWheel;
      const curBallAngle = initialBall + (targetBallAngle - initialBall) * easeBall;

      setWheelRotation(curWheelAngle);
      setBallRotation(curBallAngle);

      if (progress < 0.6) {
        setBallDistance(106);
      } else {
        const dropProgress = (progress - 0.6) / 0.4;
        const bounce = Math.sin(dropProgress * Math.PI * 4) * 4 * (1 - dropProgress);
        setBallDistance(106 - dropProgress * 24 + bounce);
      }

      if (Math.abs(curBallAngle - lastTickAngle) > 22) {
        Sound.click();
        lastTickAngle = curBallAngle;
      }

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        finalizeSpin(userAfterBet, chosenPocket, totalBet);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // Evaluate all table bets against the winning number
  const finalizeSpin = (userState: User, finalPocket: number | '00', wagered: number) => {
    setSpinning(false);
    setWinningNumber(finalPocket);
    setLastHistory((prev) => [finalPocket, ...prev.slice(0, 9)]);

    const winColor = getNumberColor(finalPocket);
    let totalPayout = 0;
    const winDetails: string[] = [];

    const isNumeric = typeof finalPocket === 'number';
    const numVal = isNumeric ? (finalPocket as number) : null;

    Object.values(bets).forEach((bet) => {
      let hit = false;
      let multiplier = 0;

      switch (bet.spotType) {
        case 'number':
          if (bet.number === finalPocket) {
            hit = true;
            multiplier = 36; // 35:1 net + stake = 36x
            winDetails.push(`Single #${finalPocket} (35:1)`);
          }
          break;
        case 'split0_00':
          if (finalPocket === 0 || finalPocket === '00') {
            hit = true;
            multiplier = 18; // 17:1 net + stake = 18x
            winDetails.push('0/00 Split (17:1)');
          }
          break;
        case 'basket5':
          // Covers 0, 00, 1, 2, 3
          if (
            finalPocket === 0 ||
            finalPocket === '00' ||
            finalPocket === 1 ||
            finalPocket === 2 ||
            finalPocket === 3
          ) {
            hit = true;
            multiplier = 7; // 6:1 net + stake = 7x
            winDetails.push('Top Line 5-Basket (6:1)');
          }
          break;
        case 'red':
          if (winColor === 'red') {
            hit = true;
            multiplier = 2;
            winDetails.push('Red (1:1)');
          }
          break;
        case 'black':
          if (winColor === 'black') {
            hit = true;
            multiplier = 2;
            winDetails.push('Black (1:1)');
          }
          break;
        case 'even':
          if (numVal !== null && numVal !== 0 && numVal % 2 === 0) {
            hit = true;
            multiplier = 2;
            winDetails.push('Even (1:1)');
          }
          break;
        case 'odd':
          if (numVal !== null && numVal % 2 === 1) {
            hit = true;
            multiplier = 2;
            winDetails.push('Odd (1:1)');
          }
          break;
        case 'low': // 1-18
          if (numVal !== null && numVal >= 1 && numVal <= 18) {
            hit = true;
            multiplier = 2;
            winDetails.push('1-18 Low (1:1)');
          }
          break;
        case 'high': // 19-36
          if (numVal !== null && numVal >= 19 && numVal <= 36) {
            hit = true;
            multiplier = 2;
            winDetails.push('19-36 High (1:1)');
          }
          break;
        case 'dozen1': // 1-12
          if (numVal !== null && numVal >= 1 && numVal <= 12) {
            hit = true;
            multiplier = 3;
            winDetails.push('1st 12 (2:1)');
          }
          break;
        case 'dozen2': // 13-24
          if (numVal !== null && numVal >= 13 && numVal <= 24) {
            hit = true;
            multiplier = 3;
            winDetails.push('2nd 12 (2:1)');
          }
          break;
        case 'dozen3': // 25-36
          if (numVal !== null && numVal >= 25 && numVal <= 36) {
            hit = true;
            multiplier = 3;
            winDetails.push('3rd 12 (2:1)');
          }
          break;
        case 'col1': // 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34
          if (numVal !== null && numVal > 0 && numVal % 3 === 1) {
            hit = true;
            multiplier = 3;
            winDetails.push('Column 1 (2:1)');
          }
          break;
        case 'col2': // 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35
          if (numVal !== null && numVal > 0 && numVal % 3 === 2) {
            hit = true;
            multiplier = 3;
            winDetails.push('Column 2 (2:1)');
          }
          break;
        case 'col3': // 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36
          if (numVal !== null && numVal > 0 && numVal % 3 === 0) {
            hit = true;
            multiplier = 3;
            winDetails.push('Column 3 (2:1)');
          }
          break;
      }

      if (hit) {
        totalPayout += bet.amount * multiplier;
      }
    });

    setLastWinAmount(totalPayout);

    if (totalPayout > 0) {
      const netProfit = totalPayout - wagered;
      const winUser = Backend.updatePoints(userState, totalPayout, 'roulette_win');
      onUpdateUser(winUser);
      Sound.win();
      setMessage({
        text: `🎉 Ball landed on ${finalPocket} (${winColor.toUpperCase()})! You won +${totalPayout.toLocaleString()} ⭐ (${netProfit >= 0 ? `+${netProfit} profit` : ''})! Hits: ${winDetails.join(', ')}`,
        type: 'win',
      });
    } else {
      Sound.lose();
      setMessage({
        text: `Ball landed on ${finalPocket} (${winColor.toUpperCase()}). Table sweep! Lost ${wagered.toLocaleString()} ⭐.`,
        type: 'lose',
      });
    }
  };

  // Helper to render chip stack badge on a spot
  const renderChipBadge = (spotKey: string) => {
    const bet = bets[spotKey];
    if (!bet || bet.amount === 0) return null;

    const topVal = bet.chips[bet.chips.length - 1] || bet.amount;
    const denom =
      CHIP_DENOMINATIONS.find((c) => c.value === topVal) ||
      CHIP_DENOMINATIONS[CHIP_DENOMINATIONS.length - 1];

    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
        <div
          className={`w-6 h-6 md:w-7 md:h-7 rounded-full bg-gradient-to-br ${denom.color} border-2 ${denom.borderColor} shadow-[0_3px_8px_rgba(0,0,0,0.9)] flex items-center justify-center font-black text-[9px] md:text-[10px] ${denom.textColor} transform transition-transform animate-scale-in`}
        >
          {bet.amount >= 1000 ? `${(bet.amount / 1000).toFixed(0)}k` : bet.amount}
          {bet.chips.length > 1 && (
            <span className="absolute -bottom-1 -right-1 bg-amber-400 text-black text-[8px] font-black rounded-full px-1 border border-black shadow">
              {bet.chips.length}
            </span>
          )}
        </div>
      </div>
    );
  };

  // Highlights which numbers are covered when hovering an outside bet
  const isNumberCoveredByHover = (num: number | '00'): boolean => {
    if (!hoveredSpot) return false;
    const isNum = typeof num === 'number';
    const n = isNum ? (num as number) : null;

    if (hoveredSpot === 'spot-red') return isNum && RED_NUMBERS.includes(num as number);
    if (hoveredSpot === 'spot-black') return isNum && BLACK_NUMBERS.includes(num as number);
    if (hoveredSpot === 'spot-even') return isNum && num !== 0 && (num as number) % 2 === 0;
    if (hoveredSpot === 'spot-odd') return isNum && (num as number) % 2 === 1;
    if (hoveredSpot === 'spot-low') return isNum && (num as number) >= 1 && (num as number) <= 18;
    if (hoveredSpot === 'spot-high') return isNum && (num as number) >= 19 && (num as number) <= 36;
    if (hoveredSpot === 'spot-dozen1') return isNum && (num as number) >= 1 && (num as number) <= 12;
    if (hoveredSpot === 'spot-dozen2') return isNum && (num as number) >= 13 && (num as number) <= 24;
    if (hoveredSpot === 'spot-dozen3') return isNum && (num as number) >= 25 && (num as number) <= 36;
    if (hoveredSpot === 'spot-col1') return isNum && (num as number) > 0 && (num as number) % 3 === 1;
    if (hoveredSpot === 'spot-col2') return isNum && (num as number) > 0 && (num as number) % 3 === 2;
    if (hoveredSpot === 'spot-col3') return isNum && (num as number) > 0 && (num as number) % 3 === 0;
    if (hoveredSpot === 'spot-split0_00') return num === 0 || num === '00';
    if (hoveredSpot === 'spot-basket5') return num === 0 || num === '00' || num === 1 || num === 2 || num === 3;
    return false;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-12 select-none">
      {/* Top HUD with Player, Live Mode & Info */}
      <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-2xl px-4 py-2.5 shadow-xl backdrop-blur-sm">
        <PlayerBadge
          name={user.username}
          avatar={user.avatar}
          subtitle={`⭐ ${(user.points ?? 0).toLocaleString()} Points`}
          size="sm"
        />

        {/* Center Live Status Banner & Mode Switch */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-950/80 border border-emerald-500/30 rounded-full text-emerald-300 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Roulette Royale</span>
          </div>

          {/* American / European Table Switch */}
          <div className="hidden sm:flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-[11px] font-bold">
            <button
              type="button"
              disabled={spinning}
              onClick={() => {
                setTableMode('american');
                Sound.click();
              }}
              className={`px-2 py-0.5 rounded transition-all ${
                tableMode === 'american'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              American (0 & 00)
            </button>
            <button
              type="button"
              disabled={spinning}
              onClick={() => {
                setTableMode('european');
                Sound.click();
              }}
              className={`px-2 py-0.5 rounded transition-all ${
                tableMode === 'european'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              European (Single 0)
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowTableGuide(!showTableGuide)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="View Payouts & Rules"
          >
            <Info className="w-4 h-4 text-amber-400" />
          </button>
        </div>

        {/* Balance Display */}
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
            Chips in Play
          </div>
          <div className="text-base font-black text-amber-400">
            ⭐ {totalBet.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Main Roulette Arena: Real Spinning Wheel on Left + Authentic Felt Table on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left Column: Authentic Spinning Wheel */}
        <div className="lg:col-span-5 bg-gradient-to-b from-stone-900 via-stone-950 to-black border-4 border-amber-600/70 rounded-3xl p-4 shadow-[inset_0_4px_24px_rgba(0,0,0,0.8),0_12px_40px_rgba(0,0,0,0.9)] flex flex-col items-center justify-between relative overflow-hidden">
          {/* Wheel Header */}
          <div className="w-full flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                {tableMode === 'american' ? 'American Wheel' : 'European Wheel'}
              </span>
              <span className="text-[10px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700">
                {tableMode === 'american' ? '38 Pockets (0 & 00)' : '37 Pockets (Single 0)'}
              </span>
            </div>
            {winningNumber !== null && (
              <div
                className={`px-2.5 py-0.5 rounded-full text-xs font-black shadow-md flex items-center gap-1 ${
                  getNumberColor(winningNumber) === 'green'
                    ? 'bg-emerald-600 text-white'
                    : getNumberColor(winningNumber) === 'red'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-900 text-white border border-slate-700'
                }`}
              >
                <span>Result:</span>
                <span className="text-sm">{winningNumber}</span>
              </div>
            )}
          </div>

          {/* Wheel Frame Visual */}
          <div className="relative w-64 h-64 md:w-72 md:h-72 rounded-full p-2 bg-gradient-to-tr from-amber-950 via-amber-800 to-amber-600 shadow-[inset_0_4px_16px_rgba(0,0,0,0.8),0_10px_30px_rgba(0,0,0,0.9)] flex items-center justify-center border-4 border-amber-600/60">
            {/* Outer Mahogany Wood Rim */}
            <div className="absolute inset-1 rounded-full bg-gradient-to-br from-[#381c0f] via-[#241107] to-[#120803] border-2 border-amber-900/80 shadow-[inset_0_2px_10px_rgba(255,215,0,0.2)]" />

            {/* Brass Outer Track */}
            <div className="absolute inset-4 rounded-full border border-amber-500/40 bg-gradient-to-b from-stone-900 to-black shadow-inner" />

            {/* Rotating Wheel Rotor (SVG with 38 or 37 Pockets) */}
            <div
              className="relative w-52 h-52 md:w-56 md:h-56 rounded-full flex items-center justify-center transition-transform"
              style={{
                transform: `rotate(${wheelRotation}deg)`,
                willChange: 'transform',
              }}
            >
              <svg viewBox="0 0 300 300" className="w-full h-full filter drop-shadow-md">
                <defs>
                  <radialGradient id="turntableCenter" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#d4af37" />
                    <stop offset="60%" stopColor="#996515" />
                    <stop offset="100%" stopColor="#4a3000" />
                  </radialGradient>
                </defs>

                {/* Colored Pockets */}
                {activeWheelPockets.map((num, idx) => {
                  const numCount = activeWheelPockets.length;
                  const sliceAngle = 360 / numCount;
                  const startAngle = idx * sliceAngle - 90;
                  const endAngle = (idx + 1) * sliceAngle - 90;
                  const startRad = (startAngle * Math.PI) / 180;
                  const endRad = (endAngle * Math.PI) / 180;
                  const rOuter = 145;
                  const rInner = 88;

                  const x1 = 150 + rOuter * Math.cos(startRad);
                  const y1 = 150 + rOuter * Math.sin(startRad);
                  const x2 = 150 + rOuter * Math.cos(endRad);
                  const y2 = 150 + rOuter * Math.sin(endRad);
                  const x3 = 150 + rInner * Math.cos(endRad);
                  const y3 = 150 + rInner * Math.sin(endRad);
                  const x4 = 150 + rInner * Math.cos(startRad);
                  const y4 = 150 + rInner * Math.sin(startRad);

                  const pathData = `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 0 0 ${x4} ${y4} Z`;
                  const color = getNumberColor(num);
                  const fillColor =
                    color === 'green' ? '#059669' : color === 'red' ? '#dc2626' : '#1e293b';

                  const midAngle = (((startAngle + endAngle) / 2) * Math.PI) / 180;
                  const textR = 116;
                  const tx = 150 + textR * Math.cos(midAngle);
                  const ty = 150 + textR * Math.sin(midAngle);
                  const textRot = (startAngle + endAngle) / 2 + 90;

                  return (
                    <g key={`${num}-${idx}`}>
                      <path
                        d={pathData}
                        fill={fillColor}
                        stroke="#f59e0b"
                        strokeWidth="0.8"
                        opacity={winningNumber === num ? 1 : 0.95}
                      />
                      <text
                        x={tx}
                        y={ty}
                        fill="#ffffff"
                        fontSize={num === '00' ? '9' : '10'}
                        fontWeight="900"
                        textAnchor="middle"
                        dominantBaseline="central"
                        transform={`rotate(${textRot}, ${tx}, ${ty})`}
                      >
                        {num}
                      </text>
                    </g>
                  );
                })}

                {/* Inner Brass Ring */}
                <circle cx="150" cy="150" r="88" fill="none" stroke="#d97706" strokeWidth="2.5" />
                <circle cx="150" cy="150" r="50" fill="url(#turntableCenter)" stroke="#fbbf24" strokeWidth="2" />

                {/* Center Turret Cone & Turret Cross Spindles */}
                <circle cx="150" cy="150" r="24" fill="#78350f" stroke="#fef08a" strokeWidth="1.5" />
                <line x1="150" y1="120" x2="150" y2="180" stroke="#fef08a" strokeWidth="3" strokeLinecap="round" />
                <line x1="120" y1="150" x2="180" y2="150" stroke="#fef08a" strokeWidth="3" strokeLinecap="round" />
                <circle cx="150" cy="150" r="8" fill="#fef08a" />
              </svg>
            </div>

            {/* Center Brass Cap / Hush Logo Emblem */}
            <div className="absolute w-12 h-12 rounded-full overflow-hidden border-2 border-amber-300 shadow-xl pointer-events-none z-10 flex items-center justify-center bg-black/80">
              <img
                src={hushLogo}
                alt="Hush Music Logo"
                className="w-9 h-9 object-contain drop-shadow"
              />
            </div>

            {/* Ivory Ball in Ball-Track / Pockets */}
            <div
              className="absolute w-full h-full pointer-events-none flex items-center justify-center"
              style={{
                transform: `rotate(${ballRotation}deg)`,
                willChange: 'transform',
              }}
            >
              <div
                className="w-3.5 h-3.5 md:w-4 md:h-4 rounded-full bg-gradient-to-tr from-stone-200 via-white to-stone-100 shadow-[0_0_10px_rgba(255,255,255,0.9),0_2px_4px_rgba(0,0,0,0.8)] border border-stone-300 transform -translate-y-1/2"
                style={{
                  transform: `translateY(-${ballDistance}px)`,
                  transition: spinning ? 'none' : 'transform 0.2s ease-out',
                }}
              />
            </div>

            {/* 12-O'Clock Pointer Marker */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[10px] border-t-amber-400 drop-shadow z-20" />
          </div>

          {/* History Pill Strip */}
          <div className="w-full mt-4 flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Recent:
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {lastHistory.map((num, i) => {
                const color = getNumberColor(num);
                return (
                  <span
                    key={`${num}-${i}`}
                    className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-[11px] shadow text-white ${
                      i === 0 ? 'ring-2 ring-amber-300 scale-110' : 'opacity-85'
                    } ${
                      color === 'green'
                        ? 'bg-emerald-600'
                        : color === 'red'
                        ? 'bg-rose-600'
                        : 'bg-slate-800'
                    }`}
                  >
                    {num}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Real American Casino Roulette Felt Table */}
        <div className="lg:col-span-7 bg-emerald-900 border-4 border-amber-600/70 rounded-3xl p-3 md:p-4 shadow-[inset_0_4px_24px_rgba(0,0,0,0.6),0_12px_40px_rgba(0,0,0,0.8)] relative overflow-hidden flex flex-col justify-between">
          {/* Green Felt Texture & Subtle Hush Watermark */}
          <div className="absolute inset-0 bg-[radial-gradient(#065f46_1px,transparent_1px)] [background-size:16px_16px] opacity-25 pointer-events-none" />
          <div className="absolute right-4 bottom-4 w-40 h-40 opacity-10 pointer-events-none flex items-center justify-center">
            <img src={hushLogo} alt="" className="w-full h-full object-contain filter invert" />
          </div>

          <div>
            {/* Table Header Bar */}
            <div className="flex items-center justify-between text-white/90 text-xs pb-2 border-b border-emerald-700/60 mb-2">
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-widest uppercase text-amber-300 text-xs">
                  {tableMode === 'american' ? 'American Roulette Table Felt' : 'European Roulette Table Felt'}
                </span>
                <span className="text-[10px] bg-emerald-950/80 px-2 py-0.5 rounded text-emerald-200 border border-emerald-600/40">
                  Tap grid cells to place chips
                </span>
              </div>
              <div className="font-bold text-amber-200">
                Table Bet: <span className="text-white text-sm">⭐ {totalBet.toLocaleString()}</span>
              </div>
            </div>

            {/* Special American Bets Quick Strip (Basket & Split 0/00) */}
            {tableMode === 'american' && (
              <div className="flex items-center gap-2 mb-2 text-xs">
                {/* 0 / 00 Row Split */}
                <button
                  type="button"
                  disabled={spinning}
                  onClick={() => handlePlaceBet('spot-split0_00', 'split0_00')}
                  onMouseEnter={() => setHoveredSpot('spot-split0_00')}
                  onMouseLeave={() => setHoveredSpot(null)}
                  className="flex-1 py-1 px-2 rounded-lg bg-emerald-950/90 hover:bg-emerald-800 border border-amber-400/60 text-amber-200 font-bold flex items-center justify-between relative transition-colors shadow"
                >
                  <span className="text-[10px] md:text-xs">0 & 00 Split</span>
                  <span className="text-[9px] bg-emerald-800 px-1 rounded text-white">17:1</span>
                  {renderChipBadge('spot-split0_00')}
                </button>

                {/* 5-Number Basket (Top Line: 0, 00, 1, 2, 3) */}
                <button
                  type="button"
                  disabled={spinning}
                  onClick={() => handlePlaceBet('spot-basket5', 'basket5')}
                  onMouseEnter={() => setHoveredSpot('spot-basket5')}
                  onMouseLeave={() => setHoveredSpot(null)}
                  className="flex-1 py-1 px-2 rounded-lg bg-emerald-950/90 hover:bg-emerald-800 border border-amber-400/60 text-amber-200 font-bold flex items-center justify-between relative transition-colors shadow"
                >
                  <span className="text-[10px] md:text-xs">Basket (0, 00, 1, 2, 3)</span>
                  <span className="text-[9px] bg-emerald-800 px-1 rounded text-white">6:1</span>
                  {renderChipBadge('spot-basket5')}
                </button>
              </div>
            )}

            {/* THE AUTHENTIC NUMBER PART OF THE ROULETTE TABLE */}
            {/* Overflow wrapper to ensure perfect fit and horizontal scroll on small screens */}
            <div className="overflow-x-auto pb-1">
              <div className="min-w-[540px] border-2 border-amber-400/90 rounded-xl overflow-hidden shadow-2xl bg-emerald-950/95 text-white">
                <div className="flex">
                  {/* LEFT HEAD: GREEN ZEROES (0 and 00 for American, or single 0 for European) */}
                  {tableMode === 'american' ? (
                    <div className="w-12 md:w-16 border-r-2 border-amber-400/90 flex flex-col flex-shrink-0 bg-emerald-800">
                      {/* Top Zero Pocket: 0 */}
                      <button
                        type="button"
                        disabled={spinning}
                        onClick={() => handlePlaceBet('num-0', 'number', 0)}
                        onMouseEnter={() => setHoveredSpot('num-0')}
                        onMouseLeave={() => setHoveredSpot(null)}
                        className={`flex-1 min-h-[58px] md:min-h-[64px] border-b border-amber-400/80 bg-emerald-700 hover:bg-emerald-600 flex flex-col items-center justify-center relative transition-all group ${
                          winningNumber === 0 ? 'ring-4 ring-amber-300 animate-pulse' : ''
                        } ${isNumberCoveredByHover(0) ? 'ring-2 ring-amber-300 bg-amber-500/30' : ''}`}
                      >
                        <span className="text-base md:text-lg font-black text-white">0</span>
                        <span className="text-[8px] md:text-[9px] uppercase tracking-tighter text-emerald-200">Zero</span>
                        {renderChipBadge('num-0')}
                      </button>

                      {/* Bottom Double-Zero Pocket: 00 */}
                      <button
                        type="button"
                        disabled={spinning}
                        onClick={() => handlePlaceBet('num-00', 'number', '00')}
                        onMouseEnter={() => setHoveredSpot('num-00')}
                        onMouseLeave={() => setHoveredSpot(null)}
                        className={`flex-1 min-h-[58px] md:min-h-[64px] bg-emerald-700 hover:bg-emerald-600 flex flex-col items-center justify-center relative transition-all group ${
                          winningNumber === '00' ? 'ring-4 ring-amber-300 animate-pulse' : ''
                        } ${isNumberCoveredByHover('00') ? 'ring-2 ring-amber-300 bg-amber-500/30' : ''}`}
                      >
                        <span className="text-base md:text-lg font-black text-white">00</span>
                        <span className="text-[8px] md:text-[9px] uppercase tracking-tighter text-emerald-200">Double 0</span>
                        {renderChipBadge('num-00')}
                      </button>
                    </div>
                  ) : (
                    /* European Single Zero Column spanning full 3 rows */
                    <button
                      type="button"
                      disabled={spinning}
                      onClick={() => handlePlaceBet('num-0', 'number', 0)}
                      onMouseEnter={() => setHoveredSpot('num-0')}
                      onMouseLeave={() => setHoveredSpot(null)}
                      className={`w-12 md:w-16 border-r-2 border-amber-400/90 bg-emerald-700 hover:bg-emerald-600 flex flex-col items-center justify-center relative transition-all flex-shrink-0 ${
                        winningNumber === 0 ? 'ring-4 ring-amber-300 animate-pulse' : ''
                      } ${isNumberCoveredByHover(0) ? 'ring-2 ring-amber-300 bg-amber-500/30' : ''}`}
                    >
                      <span className="text-lg md:text-xl font-black text-white">0</span>
                      <span className="text-[9px] text-emerald-200 uppercase tracking-tighter">Zero</span>
                      {renderChipBadge('num-0')}
                    </button>
                  )}

                  {/* MAIN NUMBER GRID & COLUMN BETS */}
                  <div className="flex-1 flex flex-col min-w-0">
                    {/* The 3 Horizontal Number Rows with Right 2:1 Column Bets */}
                    <div className="flex">
                      {/* The 12 Columns of Numbers (1 to 36) */}
                      <div className="grid grid-cols-12 flex-1">
                        {/* ROW 3 (Top Row): 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36 */}
                        {Array.from({ length: 12 }, (_, colIdx) => {
                          const num = (colIdx + 1) * 3;
                          const isRed = RED_NUMBERS.includes(num);
                          const isCovered = isNumberCoveredByHover(num);
                          const isWinner = winningNumber === num;
                          return (
                            <button
                              key={`r3-${num}`}
                              type="button"
                              disabled={spinning}
                              onClick={() => handlePlaceBet(`num-${num}`, 'number', num)}
                              onMouseEnter={() => setHoveredSpot(`num-${num}`)}
                              onMouseLeave={() => setHoveredSpot(null)}
                              className={`h-10 md:h-11 border-r border-b border-amber-400/60 flex items-center justify-center font-black text-xs md:text-sm relative transition-all ${
                                isRed
                                  ? 'bg-rose-700 hover:bg-rose-600 text-white'
                                  : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                              } ${isCovered ? 'ring-2 ring-amber-300 bg-amber-500/30' : ''} ${
                                isWinner ? 'ring-4 ring-amber-300 z-10 animate-bounce' : ''
                              }`}
                            >
                              <span>{num}</span>
                              {renderChipBadge(`num-${num}`)}
                            </button>
                          );
                        })}

                        {/* ROW 2 (Middle Row): 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35 */}
                        {Array.from({ length: 12 }, (_, colIdx) => {
                          const num = colIdx * 3 + 2;
                          const isRed = RED_NUMBERS.includes(num);
                          const isCovered = isNumberCoveredByHover(num);
                          const isWinner = winningNumber === num;
                          return (
                            <button
                              key={`r2-${num}`}
                              type="button"
                              disabled={spinning}
                              onClick={() => handlePlaceBet(`num-${num}`, 'number', num)}
                              onMouseEnter={() => setHoveredSpot(`num-${num}`)}
                              onMouseLeave={() => setHoveredSpot(null)}
                              className={`h-10 md:h-11 border-r border-b border-amber-400/60 flex items-center justify-center font-black text-xs md:text-sm relative transition-all ${
                                isRed
                                  ? 'bg-rose-700 hover:bg-rose-600 text-white'
                                  : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                              } ${isCovered ? 'ring-2 ring-amber-300 bg-amber-500/30' : ''} ${
                                isWinner ? 'ring-4 ring-amber-300 z-10 animate-bounce' : ''
                              }`}
                            >
                              <span>{num}</span>
                              {renderChipBadge(`num-${num}`)}
                            </button>
                          );
                        })}

                        {/* ROW 1 (Bottom Row): 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34 */}
                        {Array.from({ length: 12 }, (_, colIdx) => {
                          const num = colIdx * 3 + 1;
                          const isRed = RED_NUMBERS.includes(num);
                          const isCovered = isNumberCoveredByHover(num);
                          const isWinner = winningNumber === num;
                          return (
                            <button
                              key={`r1-${num}`}
                              type="button"
                              disabled={spinning}
                              onClick={() => handlePlaceBet(`num-${num}`, 'number', num)}
                              onMouseEnter={() => setHoveredSpot(`num-${num}`)}
                              onMouseLeave={() => setHoveredSpot(null)}
                              className={`h-10 md:h-11 border-r border-amber-400/60 flex items-center justify-center font-black text-xs md:text-sm relative transition-all ${
                                isRed
                                  ? 'bg-rose-700 hover:bg-rose-600 text-white'
                                  : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                              } ${isCovered ? 'ring-2 ring-amber-300 bg-amber-500/30' : ''} ${
                                isWinner ? 'ring-4 ring-amber-300 z-10 animate-bounce' : ''
                              }`}
                            >
                              <span>{num}</span>
                              {renderChipBadge(`num-${num}`)}
                            </button>
                          );
                        })}
                      </div>

                      {/* Right 2:1 Column Bets */}
                      <div className="w-12 md:w-14 flex flex-col flex-shrink-0 bg-emerald-850">
                        {/* Top Column 3 Bet (3 to 36) */}
                        <button
                          type="button"
                          disabled={spinning}
                          onClick={() => handlePlaceBet('spot-col3', 'col3')}
                          onMouseEnter={() => setHoveredSpot('spot-col3')}
                          onMouseLeave={() => setHoveredSpot(null)}
                          className="h-10 md:h-11 border-b border-amber-400/60 bg-emerald-800 hover:bg-emerald-700 text-[10px] md:text-xs font-black relative flex items-center justify-center uppercase tracking-tight text-amber-200 transition-colors"
                        >
                          2:1
                          {renderChipBadge('spot-col3')}
                        </button>

                        {/* Middle Column 2 Bet (2 to 35) */}
                        <button
                          type="button"
                          disabled={spinning}
                          onClick={() => handlePlaceBet('spot-col2', 'col2')}
                          onMouseEnter={() => setHoveredSpot('spot-col2')}
                          onMouseLeave={() => setHoveredSpot(null)}
                          className="h-10 md:h-11 border-b border-amber-400/60 bg-emerald-800 hover:bg-emerald-700 text-[10px] md:text-xs font-black relative flex items-center justify-center uppercase tracking-tight text-amber-200 transition-colors"
                        >
                          2:1
                          {renderChipBadge('spot-col2')}
                        </button>

                        {/* Bottom Column 1 Bet (1 to 34) */}
                        <button
                          type="button"
                          disabled={spinning}
                          onClick={() => handlePlaceBet('spot-col1', 'col1')}
                          onMouseEnter={() => setHoveredSpot('spot-col1')}
                          onMouseLeave={() => setHoveredSpot(null)}
                          className="h-10 md:h-11 bg-emerald-800 hover:bg-emerald-700 text-[10px] md:text-xs font-black relative flex items-center justify-center uppercase tracking-tight text-amber-200 transition-colors"
                        >
                          2:1
                          {renderChipBadge('spot-col1')}
                        </button>
                      </div>
                    </div>

                    {/* DOZENS ROW (1st 12, 2nd 12, 3rd 12) - Aligned under the 12 columns */}
                    <div className="grid grid-cols-12 border-t-2 border-amber-400/90 text-center font-bold text-xs bg-emerald-900">
                      <button
                        type="button"
                        disabled={spinning}
                        onClick={() => handlePlaceBet('spot-dozen1', 'dozen1')}
                        onMouseEnter={() => setHoveredSpot('spot-dozen1')}
                        onMouseLeave={() => setHoveredSpot(null)}
                        className="col-span-4 py-2 border-r border-amber-400/60 bg-emerald-850 hover:bg-emerald-750 transition-colors uppercase font-black text-amber-200 relative text-[11px] md:text-xs tracking-wider"
                      >
                        1st 12 (1-12)
                        {renderChipBadge('spot-dozen1')}
                      </button>

                      <button
                        type="button"
                        disabled={spinning}
                        onClick={() => handlePlaceBet('spot-dozen2', 'dozen2')}
                        onMouseEnter={() => setHoveredSpot('spot-dozen2')}
                        onMouseLeave={() => setHoveredSpot(null)}
                        className="col-span-4 py-2 border-r border-amber-400/60 bg-emerald-850 hover:bg-emerald-750 transition-colors uppercase font-black text-amber-200 relative text-[11px] md:text-xs tracking-wider"
                      >
                        2nd 12 (13-24)
                        {renderChipBadge('spot-dozen2')}
                      </button>

                      <button
                        type="button"
                        disabled={spinning}
                        onClick={() => handlePlaceBet('spot-dozen3', 'dozen3')}
                        onMouseEnter={() => setHoveredSpot('spot-dozen3')}
                        onMouseLeave={() => setHoveredSpot(null)}
                        className="col-span-4 py-2 bg-emerald-850 hover:bg-emerald-750 transition-colors uppercase font-black text-amber-200 relative text-[11px] md:text-xs tracking-wider"
                      >
                        3rd 12 (25-36)
                        {renderChipBadge('spot-dozen3')}
                      </button>
                    </div>

                    {/* OUTSIDE BETS ROW (1-18, EVEN, RED, BLACK, ODD, 19-36) - Aligned under the 12 columns */}
                    <div className="grid grid-cols-12 border-t border-amber-400/60 text-center font-bold text-xs bg-emerald-950">
                      <button
                        type="button"
                        disabled={spinning}
                        onClick={() => handlePlaceBet('spot-low', 'low')}
                        onMouseEnter={() => setHoveredSpot('spot-low')}
                        onMouseLeave={() => setHoveredSpot(null)}
                        className="col-span-2 py-2 border-r border-amber-400/40 hover:bg-emerald-800 transition-colors text-amber-100 uppercase text-[10px] md:text-xs relative font-black"
                      >
                        1-18
                        {renderChipBadge('spot-low')}
                      </button>

                      <button
                        type="button"
                        disabled={spinning}
                        onClick={() => handlePlaceBet('spot-even', 'even')}
                        onMouseEnter={() => setHoveredSpot('spot-even')}
                        onMouseLeave={() => setHoveredSpot(null)}
                        className="col-span-2 py-2 border-r border-amber-400/40 hover:bg-emerald-800 transition-colors text-amber-100 uppercase text-[10px] md:text-xs relative font-black"
                      >
                        EVEN
                        {renderChipBadge('spot-even')}
                      </button>

                      {/* RED LOZENGE BET */}
                      <button
                        type="button"
                        disabled={spinning}
                        onClick={() => handlePlaceBet('spot-red', 'red')}
                        onMouseEnter={() => setHoveredSpot('spot-red')}
                        onMouseLeave={() => setHoveredSpot(null)}
                        className="col-span-2 py-2 border-r border-amber-400/40 bg-rose-700/80 hover:bg-rose-600 transition-colors text-white uppercase text-[10px] md:text-xs relative font-black flex items-center justify-center gap-1"
                      >
                        <span className="w-3.5 h-3.5 bg-rose-500 rotate-45 border border-white/60 inline-block" />
                        <span>RED</span>
                        {renderChipBadge('spot-red')}
                      </button>

                      {/* BLACK LOZENGE BET */}
                      <button
                        type="button"
                        disabled={spinning}
                        onClick={() => handlePlaceBet('spot-black', 'black')}
                        onMouseEnter={() => setHoveredSpot('spot-black')}
                        onMouseLeave={() => setHoveredSpot(null)}
                        className="col-span-2 py-2 border-r border-amber-400/40 bg-zinc-900/90 hover:bg-zinc-800 transition-colors text-white uppercase text-[10px] md:text-xs relative font-black flex items-center justify-center gap-1"
                      >
                        <span className="w-3.5 h-3.5 bg-black rotate-45 border border-white/60 inline-block" />
                        <span>BLACK</span>
                        {renderChipBadge('spot-black')}
                      </button>

                      <button
                        type="button"
                        disabled={spinning}
                        onClick={() => handlePlaceBet('spot-odd', 'odd')}
                        onMouseEnter={() => setHoveredSpot('spot-odd')}
                        onMouseLeave={() => setHoveredSpot(null)}
                        className="col-span-2 py-2 border-r border-amber-400/40 hover:bg-emerald-800 transition-colors text-amber-100 uppercase text-[10px] md:text-xs relative font-black"
                      >
                        ODD
                        {renderChipBadge('spot-odd')}
                      </button>

                      <button
                        type="button"
                        disabled={spinning}
                        onClick={() => handlePlaceBet('spot-high', 'high')}
                        onMouseEnter={() => setHoveredSpot('spot-high')}
                        onMouseLeave={() => setHoveredSpot(null)}
                        className="col-span-2 py-2 hover:bg-emerald-800 transition-colors text-amber-100 uppercase text-[10px] md:text-xs relative font-black"
                      >
                        19-36
                        {renderChipBadge('spot-high')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Chips Selector Bar */}
          <div className="mt-4 pt-3 border-t border-emerald-700/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Select Chip Denomination
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={spinning || totalBet === 0}
                  onClick={handleDoubleBets}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-amber-300 border border-slate-700 text-[10px] font-bold transition-all"
                >
                  Double (2x)
                </button>
                <button
                  type="button"
                  disabled={spinning || totalBet === 0}
                  onClick={handleClearBets}
                  className="px-2 py-1 rounded bg-rose-950/80 hover:bg-rose-900 disabled:opacity-40 text-rose-300 border border-rose-800 text-[10px] font-bold flex items-center gap-1 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear Felt</span>
                </button>
              </div>
            </div>

            {/* Casino Chips Rack */}
            <div className="flex items-center justify-around gap-2 p-2 bg-emerald-950/90 rounded-2xl border-2 border-amber-500/40 shadow-inner">
              {CHIP_DENOMINATIONS.map((chip) => {
                const isSelected = selectedChipValue === chip.value;
                const canAfford = user.points >= chip.value;
                return (
                  <button
                    key={chip.value}
                    type="button"
                    disabled={spinning || !canAfford}
                    onClick={() => {
                      setSelectedChipValue(chip.value);
                      Sound.click();
                    }}
                    className={`relative group flex flex-col items-center transition-all ${
                      isSelected ? '-translate-y-1.5 scale-110' : 'hover:-translate-y-0.5'
                    } ${!canAfford ? 'opacity-30 cursor-not-allowed' : ''}`}
                  >
                    {/* Chip Graphic */}
                    <div
                      className={`w-11 h-11 md:w-12 md:h-12 rounded-full bg-gradient-to-br ${chip.color} border-4 ${chip.borderColor} shadow-[0_4px_12px_rgba(0,0,0,0.8)] flex items-center justify-center font-black text-xs md:text-sm ${chip.textColor} ${
                        isSelected ? `ring-4 ${chip.ringColor} ring-offset-2 ring-offset-emerald-950` : ''
                      }`}
                    >
                      <div className="w-8 h-8 md:w-9 md:h-9 rounded-full border border-dashed border-white/50 flex items-center justify-center">
                        {chip.label}
                      </div>
                    </div>
                    <span className="text-[10px] text-emerald-200 font-bold mt-1">
                      ⭐ {chip.value}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Row: Spin Button & Table Marquee */}
          <div className="mt-3 flex items-center gap-3">
            <div
              className={`flex-1 min-h-[44px] flex items-center justify-center text-center px-3 py-2 rounded-xl border text-xs font-medium ${
                message.type === 'win'
                  ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
                  : message.type === 'lose'
                  ? 'bg-rose-950/90 border-rose-500 text-rose-200'
                  : 'bg-emerald-950/70 border-emerald-700/60 text-emerald-100'
              }`}
            >
              {message.text}
            </div>

            <button
              type="button"
              disabled={spinning || totalBet === 0}
              onClick={handleSpin}
              className={`px-6 py-3 rounded-2xl font-black text-base uppercase tracking-wider text-slate-950 shadow-xl transition-all flex items-center gap-2 ${
                spinning || totalBet === 0
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed border border-slate-600'
                  : 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 hover:brightness-110 active:scale-95 border-2 border-yellow-200 shadow-amber-500/30 animate-pulse'
              }`}
            >
              <Zap className="w-5 h-5 fill-slate-950" />
              <span>{spinning ? 'Spinning...' : 'Spin'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Rules / Paytable Modal */}
      {showTableGuide && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border-2 border-amber-500/40 rounded-2xl max-w-lg w-full p-5 shadow-2xl text-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-base text-amber-300 uppercase tracking-wide">
                  {tableMode === 'american' ? 'American Roulette Payouts' : 'European Roulette Payouts'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTableGuide(false)}
                className="text-slate-400 hover:text-white font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                  <div className="font-bold text-amber-300">Inside Bets (Highest Payout)</div>
                  <div className="flex justify-between">
                    <span>Straight Up (0, 00, 1-36)</span>
                    <span className="font-bold text-emerald-400">35 : 1</span>
                  </div>
                  <div className="flex justify-between">
                    <span>0 & 00 Row Split</span>
                    <span className="font-bold text-emerald-400">17 : 1</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Top Line Basket (0, 00, 1, 2, 3)</span>
                    <span className="font-bold text-emerald-400">6 : 1</span>
                  </div>
                </div>

                <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                  <div className="font-bold text-amber-300">Columns & Dozens</div>
                  <div className="flex justify-between">
                    <span>1st, 2nd, 3rd 12 (Dozens)</span>
                    <span className="font-bold text-emerald-400">2 : 1</span>
                  </div>
                  <div className="flex justify-between">
                    <span>2:1 Columns (12 Numbers)</span>
                    <span className="font-bold text-emerald-400">2 : 1</span>
                  </div>
                </div>
              </div>

              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <div className="font-bold text-amber-300">Outside Bets (Even Money 1:1)</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div className="flex justify-between">
                    <span>🔴 Red / ⚫ Black</span>
                    <span className="font-bold text-emerald-400">1 : 1</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Even / Odd</span>
                    <span className="font-bold text-emerald-400">1 : 1</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Low (1-18) / High (19-36)</span>
                    <span className="font-bold text-emerald-400">1 : 1</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Green Pockets (0 & 00)</span>
                    <span className="font-bold text-amber-400">House Edge</span>
                  </div>
                </div>
              </div>

              <div className="p-2.5 bg-amber-950/40 border border-amber-500/30 rounded-xl text-[11px] text-amber-200">
                💡 <strong>Pro Tip:</strong> Tap chip denominations from the rack below, then place chips directly on the table. You can place multiple chips across single numbers, 0/00 split, dozens, columns, and red/black in the same round!
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowTableGuide(false)}
              className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider"
            >
              Back to Table
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
