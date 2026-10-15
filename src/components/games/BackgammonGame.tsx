import React, { useState, useEffect, useRef } from 'react';
import { User, Room } from '../../types';
import { Backend } from '../../utils/backend';
import { Sound } from '../../utils/sound';
import { ChatBox } from '../ChatBox';
import { PlayerBadge } from '../PlayerBadge';
import {
  RotateCcw,
  Sparkles,
  Bot,
  Trophy,
  Dices,
  ShieldCheck,
  CheckCircle,
  HelpCircle,
} from 'lucide-react';

interface PointState {
  w: number; // White checkers
  b: number; // Red / Black checkers
}

interface BackgammonState {
  pts: PointState[]; // 1 to 24 (index 0 unused)
  bar: { w: number; b: number };
  off: { w: number; b: number };
  turn: 'w' | 'b';
  dice: number[]; // Available dice remaining this turn
  initialDice: number[]; // Full dice roll for this turn
  rolled: boolean;
  over: boolean;
  winner: 'w' | 'b' | null;
  history: string[];
}

// Standard International Backgammon Starting Setup
function initialBackgammon(): BackgammonState {
  const pts: PointState[] = Array.from({ length: 25 }, () => ({ w: 0, b: 0 }));

  // White moves 24 down to 1
  pts[24].w = 2;
  pts[13].w = 5;
  pts[8].w = 3;
  pts[6].w = 5;

  // Red / Black moves 1 up to 24
  pts[1].b = 2;
  pts[12].b = 5;
  pts[17].b = 3;
  pts[19].b = 5;

  return {
    pts,
    bar: { w: 0, b: 0 },
    off: { w: 0, b: 0 },
    turn: 'w',
    dice: [],
    initialDice: [],
    rolled: false,
    over: false,
    winner: null,
    history: ['Game started. White rolls first!'],
  };
}

interface BackgammonGameProps {
  user: User;
  onUpdateUser: (updated: User) => void;
  pvpRoom?: Room | null;
}

export const BackgammonGame: React.FC<BackgammonGameProps> = ({
  user,
  onUpdateUser,
  pvpRoom,
}) => {
  const [state, setState] = useState<BackgammonState>(initialBackgammon);
  const [selectedPoint, setSelectedPoint] = useState<number | 'bar' | null>(null);
  const [validMoves, setValidMoves] = useState<{ to: number; dieUsed: number }[]>([]);
  const [statusMessage, setStatusMessage] = useState('Roll the dice to start your turn!');
  const [botMoving, setBotMoving] = useState(false);
  const botTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const mySide: 'w' | 'b' = pvpRoom
    ? pvpRoom.seats.indexOf(user.uid) === 0
      ? 'w'
      : 'b'
    : 'w';
  const isMyTurn = !state.over && state.turn === mySide && !botMoving;

  const recordedWinRef = useRef(false);

  // Sync PvP room state
  useEffect(() => {
    if (pvpRoom && pvpRoom.state) {
      setState(pvpRoom.state);
      if (
        (pvpRoom.status === 'done' || pvpRoom.state.over) &&
        pvpRoom.state.winner === mySide &&
        !recordedWinRef.current
      ) {
        recordedWinRef.current = true;
        const { user: updatedUser } = Backend.recordWin(user, 'backgammon');
        onUpdateUser(updatedUser);
      }
    } else if (pvpRoom && !pvpRoom.state && pvpRoom.host === user.uid) {
      Backend.updateRoom({
        ...pvpRoom,
        state,
        turn: 0,
      });
    }
  }, [pvpRoom, mySide]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
    };
  }, []);

  // Check if player can bear off
  const canBearOff = (side: 'w' | 'b', s: BackgammonState = state): boolean => {
    if (s.bar[side] > 0) return false;
    if (side === 'w') {
      // All White checkers must be in points 1..6 or already off
      for (let p = 7; p <= 24; p++) {
        if (s.pts[p].w > 0) return false;
      }
      return true;
    } else {
      // All Red checkers must be in points 19..24 or already off
      for (let p = 1; p <= 18; p++) {
        if (s.pts[p].b > 0) return false;
      }
      return true;
    }
  };

  // Calculate valid moves for a selected point / bar
  const computeValidMovesFor = (
    from: number | 'bar',
    side: 'w' | 'b',
    curState: BackgammonState
  ): { to: number; dieUsed: number }[] => {
    if (curState.dice.length === 0) return [];
    const opp = side === 'w' ? 'b' : 'w';
    const moves: { to: number; dieUsed: number }[] = [];
    const uniqueDice = Array.from(new Set(curState.dice));

    // If player has checkers on bar, they MUST move from bar first
    if (from !== 'bar' && curState.bar[side] > 0) {
      return [];
    }

    if (from === 'bar') {
      for (const d of uniqueDice) {
        const dest = side === 'w' ? 25 - d : d;
        if (curState.pts[dest][opp] < 2) {
          moves.push({ to: dest, dieUsed: d });
        }
      }
      return moves;
    }

    // Normal point moves
    for (const d of uniqueDice) {
      if (side === 'w') {
        const dest = from - d;
        if (dest >= 1) {
          // Normal move
          if (curState.pts[dest][opp] < 2) {
            moves.push({ to: dest, dieUsed: d });
          }
        } else if (canBearOff('w', curState)) {
          // Bearing off White (dest <= 0)
          if (from === d) {
            moves.push({ to: 0, dieUsed: d }); // Exact roll bear off
          } else if (d > from) {
            // Can bear off with higher die if no checkers on higher points in home board
            let higherCheckers = 0;
            for (let p = from + 1; p <= 6; p++) {
              higherCheckers += curState.pts[p].w;
            }
            if (higherCheckers === 0) {
              moves.push({ to: 0, dieUsed: d });
            }
          }
        }
      } else {
        // Red moves forward (from + d)
        const dest = from + d;
        if (dest <= 24) {
          if (curState.pts[dest][opp] < 2) {
            moves.push({ to: dest, dieUsed: d });
          }
        } else if (canBearOff('b', curState)) {
          // Bearing off Red (dest >= 25)
          const distToBear = 25 - from;
          if (distToBear === d) {
            moves.push({ to: 25, dieUsed: d }); // Exact roll
          } else if (d > distToBear) {
            let higherCheckers = 0;
            for (let p = 19; p < from; p++) {
              higherCheckers += curState.pts[p].b;
            }
            if (higherCheckers === 0) {
              moves.push({ to: 25, dieUsed: d });
            }
          }
        }
      }
    }

    return moves;
  };

  // Check if player has ANY legal moves with current dice
  const hasAnyLegalMoves = (side: 'w' | 'b', curState: BackgammonState): boolean => {
    if (curState.dice.length === 0) return false;
    if (curState.bar[side] > 0) {
      return computeValidMovesFor('bar', side, curState).length > 0;
    }
    for (let p = 1; p <= 24; p++) {
      if (curState.pts[p][side] > 0) {
        if (computeValidMovesFor(p, side, curState).length > 0) {
          return true;
        }
      }
    }
    return false;
  };

  // Roll dice for current turn
  const rollDice = () => {
    if (!isMyTurn || state.rolled || state.over) return;
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const isDouble = d1 === d2;
    const dice = isDouble ? [d1, d1, d1, d1] : [d1, d2];

    Sound.diceRoll();

    const rolledState: BackgammonState = {
      ...state,
      dice,
      initialDice: [...dice],
      rolled: true,
      history: [
        `White rolled ${d1} & ${d2}${isDouble ? ' (Doubles x4!)' : ''}`,
        ...state.history.slice(0, 8),
      ],
    };

    // Check if there are legal moves
    if (!hasAnyLegalMoves('w', rolledState)) {
      setStatusMessage(`Rolled ${d1} & ${d2} — No legal moves possible! Passing turn.`);
      setState(rolledState);
      setTimeout(() => {
        endTurn(rolledState);
      }, 1200);
      return;
    }

    setState(rolledState);
    setStatusMessage(
      isDouble
        ? `Doubles! 4 moves of ${d1}. Tap a checker to move.`
        : `Rolled ${d1} & ${d2}. Tap a checker to move.`
    );

    // If checkers on bar, auto-select bar
    if (rolledState.bar.w > 0) {
      const moves = computeValidMovesFor('bar', 'w', rolledState);
      setSelectedPoint('bar');
      setValidMoves(moves);
      setStatusMessage('Checkers on the Bar! You must enter them first.');
    }
  };

  // Handle clicking on a point or checker
  const handlePointClick = (ptNum: number) => {
    if (!isMyTurn || !state.rolled || state.over || state.dice.length === 0) return;

    // If we have a selected checker and clicked on a valid destination
    if (selectedPoint !== null) {
      const move = validMoves.find((m) => m.to === ptNum);
      if (move) {
        executeMove(selectedPoint, ptNum, move.dieUsed);
        return;
      }
    }

    // Must move from bar first if bar has checkers
    if (state.bar.w > 0) {
      const moves = computeValidMovesFor('bar', 'w', state);
      setSelectedPoint('bar');
      setValidMoves(moves);
      Sound.click();
      setStatusMessage('Must enter your checker from the bar first!');
      return;
    }

    // Select point if it has our checkers
    if (state.pts[ptNum].w > 0) {
      const moves = computeValidMovesFor(ptNum, 'w', state);
      if (moves.length === 0) {
        Sound.lose();
        setStatusMessage(`Point ${ptNum} has no legal moves with remaining dice.`);
        return;
      }
      setSelectedPoint(ptNum);
      setValidMoves(moves);
      Sound.click();
      setStatusMessage(`Point ${ptNum} selected. Tap a highlighted triangle to move.`);
    } else {
      setSelectedPoint(null);
      setValidMoves([]);
    }
  };

  // Click on Bar directly
  const handleBarClick = () => {
    if (!isMyTurn || !state.rolled || state.over || state.bar.w === 0) return;
    const moves = computeValidMovesFor('bar', 'w', state);
    setSelectedPoint('bar');
    setValidMoves(moves);
    Sound.click();
    setStatusMessage('Bar selected. Tap a highlighted triangle in Red’s home board to enter.');
  };

  // Click on Bear Off Tray
  const handleBearOffClick = () => {
    if (selectedPoint === null || !isMyTurn) return;
    const move = validMoves.find((m) => m.to === 0);
    if (move) {
      executeMove(selectedPoint, 0, move.dieUsed);
    }
  };

  // Execute a validated move
  const executeMove = (from: number | 'bar', to: number, dieUsed: number) => {
    const opp = 'b';
    const nextPts = state.pts.map((p) => ({ ...p }));
    const nextBar = { ...state.bar };
    const nextOff = { ...state.off };

    // Remove from source
    if (from === 'bar') {
      nextBar.w--;
    } else {
      nextPts[from].w--;
    }

    let hit = false;
    // Add to destination or bear off
    if (to === 0) {
      // Borne off
      nextOff.w++;
      Sound.win();
    } else {
      // Check for Blot Hit on opponent
      if (nextPts[to][opp] === 1) {
        nextPts[to][opp] = 0;
        nextBar[opp]++;
        hit = true;
        Sound.win();
      } else {
        Sound.chipBet();
      }
      nextPts[to].w++;
    }

    // Consume die
    const dieIdx = state.dice.indexOf(dieUsed);
    const nextDice = [...state.dice];
    if (dieIdx !== -1) {
      nextDice.splice(dieIdx, 1);
    }

    // Check Win
    if (nextOff.w === 15) {
      const wonState: BackgammonState = {
        ...state,
        pts: nextPts,
        bar: nextBar,
        off: nextOff,
        dice: [],
        rolled: false,
        over: true,
        winner: 'w',
        history: ['🏆 White wins the game! Congratulations!', ...state.history],
      };
      setState(wonState);
      setSelectedPoint(null);
      setValidMoves([]);
      setStatusMessage('🎉 Victory! You bore off all 15 checkers!');
      Sound.jackpot();
      recordedWinRef.current = true;
      const { user: updatedUser } = Backend.recordWin(user, 'backgammon');
      onUpdateUser(updatedUser);
      if (pvpRoom) {
        Backend.updateRoom({
          ...pvpRoom,
          state: wonState,
          status: 'done',
        });
      }
      return;
    }

    const nextState: BackgammonState = {
      ...state,
      pts: nextPts,
      bar: nextBar,
      off: nextOff,
      dice: nextDice,
      history: [
        hit
          ? `White hit Red blot on point ${to}!`
          : to === 0
          ? `White bore off a checker!`
          : `White moved from ${from} to ${to}`,
        ...state.history.slice(0, 8),
      ],
    };

    setSelectedPoint(null);
    setValidMoves([]);

    // Check if turn ends
    if (nextDice.length === 0) {
      endTurn(nextState);
    } else if (!hasAnyLegalMoves('w', nextState)) {
      setStatusMessage(`No legal moves left with die ${nextDice.join(', ')}. Passing turn.`);
      setState(nextState);
      setTimeout(() => {
        endTurn(nextState);
      }, 1000);
    } else {
      setState(nextState);
      setStatusMessage(`${nextDice.length} move(s) left with dice: [${nextDice.join(', ')}]`);
    }
  };

  // End turn and transition to next player or bot
  const endTurn = (curState: BackgammonState) => {
    const nextTurn = 'b';
    const nextState: BackgammonState = {
      ...curState,
      turn: nextTurn,
      dice: [],
      initialDice: [],
      rolled: false,
    };

    setState(nextState);

    if (pvpRoom) {
      Backend.updateRoom({
        ...pvpRoom,
        state: nextState,
        turn: pvpRoom.seats.indexOf(user.uid) === 0 ? 1 : 0,
      });
    } else {
      // Trigger Bot Turn
      setBotMoving(true);
      setStatusMessage("Computer's turn (Red)...");
      botTimeoutRef.current = setTimeout(() => {
        executeBotTurn(nextState);
      }, 700);
    }
  };

  // Smart Computer AI Turn
  const executeBotTurn = (s: BackgammonState) => {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const isDouble = d1 === d2;
    const dice = isDouble ? [d1, d1, d1, d1] : [d1, d2];
    Sound.diceRoll();

    let curState: BackgammonState = {
      ...s,
      dice,
      initialDice: [...dice],
      rolled: true,
      history: [
        `Red rolled ${d1} & ${d2}${isDouble ? ' (Doubles x4!)' : ''}`,
        ...s.history.slice(0, 8),
      ],
    };
    setState(curState);
    setStatusMessage(`Red rolled ${d1} & ${d2}. Thinking...`);

    // Sequentially play all available dice moves
    const playBotMove = () => {
      if (curState.dice.length === 0 || !hasAnyLegalMoves('b', curState)) {
        // Finish bot turn
        const endState: BackgammonState = {
          ...curState,
          turn: 'w',
          dice: [],
          initialDice: [],
          rolled: false,
        };
        setState(endState);
        setBotMoving(false);
        setStatusMessage('Your turn (White) — Roll the dice!');
        return;
      }

      // Collect all possible legal moves
      interface CandidateMove {
        from: number | 'bar';
        to: number;
        die: number;
        score: number;
      }
      const candidates: CandidateMove[] = [];

      if (curState.bar.b > 0) {
        const barMoves = computeValidMovesFor('bar', 'b', curState);
        for (const m of barMoves) {
          candidates.push({
            from: 'bar',
            to: m.to,
            die: m.dieUsed,
            score: 100, // Bar re-entry is mandatory
          });
        }
      } else {
        for (let p = 1; p <= 24; p++) {
          if (curState.pts[p].b > 0) {
            const moves = computeValidMovesFor(p, 'b', curState);
            for (const m of moves) {
              let score = 10;
              if (m.to === 25) score += 50; // Bear off!
              else if (curState.pts[m.to].w === 1) score += 35; // Hit human blot!
              else if (curState.pts[m.to].b === 1) score += 20; // Make an anchor (2+ checkers)
              candidates.push({
                from: p,
                to: m.to,
                die: m.dieUsed,
                score,
              });
            }
          }
        }
      }

      if (candidates.length === 0) {
        // No moves possible
        const endState: BackgammonState = {
          ...curState,
          turn: 'w',
          dice: [],
          initialDice: [],
          rolled: false,
        };
        setState(endState);
        setBotMoving(false);
        setStatusMessage('Red has no moves. Your turn — Roll dice!');
        return;
      }

      // Pick highest score move
      candidates.sort((a, b) => b.score - a.score);
      const chosen = candidates[0];

      // Execute this bot move
      const nextPts = curState.pts.map((p) => ({ ...p }));
      const nextBar = { ...curState.bar };
      const nextOff = { ...curState.off };

      if (chosen.from === 'bar') {
        nextBar.b--;
      } else {
        nextPts[chosen.from].b--;
      }

      let hit = false;
      if (chosen.to === 25) {
        nextOff.b++;
      } else {
        if (nextPts[chosen.to].w === 1) {
          nextPts[chosen.to].w = 0;
          nextBar.w++;
          hit = true;
          Sound.lose();
        } else {
          Sound.chipBet();
        }
        nextPts[chosen.to].b++;
      }

      const dieIdx = curState.dice.indexOf(chosen.die);
      const nextDice = [...curState.dice];
      if (dieIdx !== -1) nextDice.splice(dieIdx, 1);

      // Check Bot Win
      if (nextOff.b === 15) {
        const botWon: BackgammonState = {
          ...curState,
          pts: nextPts,
          bar: nextBar,
          off: nextOff,
          dice: [],
          over: true,
          winner: 'b',
          history: ['Red (Computer) has won the game!', ...curState.history],
        };
        setState(botWon);
        setBotMoving(false);
        setStatusMessage('Red won! Better luck next match.');
        Sound.lose();
        return;
      }

      curState = {
        ...curState,
        pts: nextPts,
        bar: nextBar,
        off: nextOff,
        dice: nextDice,
        history: [
          hit
            ? `Red hit White blot on point ${chosen.to}!`
            : chosen.to === 25
            ? `Red bore off a checker!`
            : `Red moved from ${chosen.from} to ${chosen.to}`,
          ...curState.history.slice(0, 8),
        ],
      };
      setState(curState);

      // Delay between bot dice moves
      botTimeoutRef.current = setTimeout(playBotMove, 650);
    };

    botTimeoutRef.current = setTimeout(playBotMove, 650);
  };

  const handleRestart = () => {
    if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
    setState(initialBackgammon());
    setSelectedPoint(null);
    setValidMoves([]);
    setBotMoving(false);
    setStatusMessage('New match started. White rolls first!');
    Sound.click();
  };

  // Helper to render checkers on a point
  const renderCheckers = (ptNum: number, isTop: boolean) => {
    const point = state.pts[ptNum];
    const totalW = point.w;
    const totalB = point.b;
    const count = totalW > 0 ? totalW : totalB;
    const color = totalW > 0 ? 'white' : 'red';

    if (count === 0) return null;

    const maxVisual = Math.min(5, count);
    const extra = count > 5 ? count - 5 : 0;

    return (
      <div
        className={`absolute inset-x-0 ${
          isTop ? 'top-1 flex-col' : 'bottom-1 flex-col-reverse'
        } flex items-center justify-start pointer-events-none z-10`}
      >
        {Array.from({ length: maxVisual }).map((_, i) => (
          <div
            key={i}
            className={`w-6 h-6 md:w-8 md:h-8 rounded-full border-2 shadow-md flex items-center justify-center font-bold text-[10px] md:text-xs transition-transform ${
              color === 'white'
                ? 'bg-linear-to-b from-slate-50 via-slate-100 to-slate-200 border-amber-300/80 text-slate-900 shadow-slate-950/40 ring-1 ring-amber-400/40'
                : 'bg-linear-to-b from-rose-500 via-red-600 to-red-800 border-amber-400/70 text-amber-100 shadow-black/60 ring-1 ring-red-950/60'
            } ${i > 0 ? (isTop ? '-mt-2.5 md:-mt-3.5' : '-mb-2.5 md:-mb-3.5') : ''}`}
          >
            {/* Show count badge on top-most checker if > 5 */}
            {i === maxVisual - 1 && extra > 0 && (
              <span className="bg-amber-400 text-slate-950 rounded-full w-4 h-4 md:w-5 md:h-5 text-[9px] md:text-[10px] font-black flex items-center justify-center shadow-xs">
                +{extra}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Point triangle render
  const renderTriangle = (ptNum: number, isTop: boolean, colIdx: number) => {
    const isEven = (colIdx + (isTop ? 0 : 1)) % 2 === 0;
    const isSelected = selectedPoint === ptNum;
    const isTarget = validMoves.some((m) => m.to === ptNum);

    return (
      <button
        key={ptNum}
        type="button"
        onClick={() => handlePointClick(ptNum)}
        className={`relative flex-1 h-full flex flex-col ${
          isTop ? 'justify-start' : 'justify-end'
        } items-center select-none cursor-pointer group transition-all`}
      >
        {/* SVG Triangle Pip */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          preserveAspectRatio="none"
          viewBox="0 0 100 200"
        >
          <polygon
            points={isTop ? '0,0 100,0 50,185' : '0,200 100,200 50,15'}
            fill={isEven ? '#1e4d2b' : '#739e82'}
            stroke="#14361e"
            strokeWidth="1.5"
            className={`transition-colors ${
              isTarget
                ? 'fill-amber-400/70!'
                : isSelected
                ? 'fill-amber-300/80!'
                : 'group-hover:opacity-90'
            }`}
          />
        </svg>

        {/* Target indicator ring */}
        {isTarget && (
          <div
            className={`absolute ${
              isTop ? 'bottom-6' : 'top-6'
            } z-20 w-5 h-5 md:w-6 md:h-6 rounded-full bg-amber-400 border-2 border-slate-950 flex items-center justify-center shadow-lg animate-bounce`}
          >
            <div className="w-2 h-2 rounded-full bg-slate-950" />
          </div>
        )}

        {/* Checkers Container */}
        {renderCheckers(ptNum, isTop)}

        {/* Point Label Number */}
        <span
          className={`relative z-10 px-1 py-0.5 text-[9px] md:text-[11px] font-black ${
            isTop ? 'mt-0.5' : 'mb-0.5'
          } ${
            isSelected
              ? 'text-amber-400 bg-slate-950/80 rounded-md ring-1 ring-amber-400'
              : 'text-stone-900/80'
          }`}
        >
          {ptNum}
        </span>
      </button>
    );
  };

  const oppUid = pvpRoom ? pvpRoom.seats.find((s) => s !== user.uid) : null;
  const oppName = oppUid ? pvpRoom?.names[oppUid] || 'Opponent' : 'Backgammon AI (Red)';
  const oppAvatar = oppUid ? pvpRoom?.avatars?.[oppUid] : '🤖';

  return (
    <div className="max-w-4xl mx-auto space-y-3 font-sans">
      {/* Top Header Match Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-xs shadow-md">
        <div className="flex items-center gap-3">
          <PlayerBadge
            name={oppName}
            avatar={oppAvatar}
            isRobot={!pvpRoom}
            subtitle="Red Checkers (Moves 1 ➔ 24)"
            isTurn={!isMyTurn}
            size="sm"
          />
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-red-950/40 border border-red-800/40 rounded-lg text-red-300 font-bold text-[11px]">
            <span>Off: {state.off.b}/15</span>
            {state.bar.b > 0 && <span className="text-amber-400 font-extrabold">· Bar: {state.bar.b}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRestart}
            className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg text-xs flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Main Board Container */}
      <div className="relative rounded-2xl bg-linear-to-b from-[#4a2211] via-[#3a1a0c] to-[#2b1208] border-4 md:border-8 border-[#261107] shadow-2xl p-2 md:p-3 text-slate-100 select-none ring-1 ring-amber-500/20">
        {/* Top Header Strip: Labels matching screenshot */}
        <div className="flex justify-between items-center text-[10px] md:text-xs font-black text-amber-200/80 px-2 pb-1.5 tracking-wider uppercase">
          <span className="flex items-center gap-1">
            <span className="text-amber-400">⟵</span> Outer Board
          </span>
          <span className="text-amber-400/90 text-center font-bold normal-case">
            Red moves Top 13 ➔ 24
          </span>
          <span className="flex items-center gap-1 text-right">
            Red’s Home Board <span className="text-amber-400">⟶</span>
          </span>
        </div>

        {/* The Felt Table Surface */}
        <div className="relative w-full aspect-16/10 md:aspect-16/9 bg-[#d8a47f] rounded-xl border-2 md:border-4 border-[#7a3b18] overflow-hidden flex shadow-[inset_0_4px_16px_rgba(0,0,0,0.6)]">
          {/* LEFT HALF: Outer Board (Points 13-18 top, 12-7 bottom) */}
          <div className="flex-1 h-full flex flex-col justify-between">
            {/* Top Row: Points 13 to 18 */}
            <div className="w-full h-1/2 flex border-b border-[#7a3b18]/40">
              {[13, 14, 15, 16, 17, 18].map((pt, idx) => renderTriangle(pt, true, idx))}
            </div>
            {/* Bottom Row: Points 12 to 7 */}
            <div className="w-full h-1/2 flex border-t border-[#7a3b18]/40">
              {[12, 11, 10, 9, 8, 7].map((pt, idx) => renderTriangle(pt, false, idx))}
            </div>
          </div>

          {/* CENTER BAR: Vertical Divider */}
          <div
            onClick={handleBarClick}
            className={`w-10 md:w-14 h-full bg-linear-to-r from-[#3d1a0d] via-[#5c2a15] to-[#3d1a0d] border-x-2 border-[#200c05] flex flex-col justify-between items-center py-2 relative z-20 cursor-pointer shadow-xl ${
              selectedPoint === 'bar' ? 'ring-2 ring-amber-400' : ''
            }`}
          >
            {/* Red Checkers on Bar */}
            <div className="flex flex-col items-center gap-1">
              {state.bar.b > 0 && (
                <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-linear-to-b from-rose-500 via-red-600 to-red-800 border border-amber-300 text-amber-100 font-black text-[10px] md:text-xs flex items-center justify-center shadow-lg animate-pulse">
                  {state.bar.b}
                </div>
              )}
            </div>

            {/* Bar Label */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] md:text-xs font-black tracking-widest text-amber-400 rotate-90 md:rotate-0 uppercase">
                BAR
              </span>
              {state.bar.w > 0 && (
                <span className="text-[9px] text-amber-300 font-bold mt-1 text-center leading-tight">
                  TAP
                </span>
              )}
            </div>

            {/* White Checkers on Bar */}
            <div className="flex flex-col-reverse items-center gap-1">
              {state.bar.w > 0 && (
                <div
                  className={`w-6 h-6 md:w-8 md:h-8 rounded-full bg-linear-to-b from-slate-50 via-slate-100 to-slate-200 border-2 border-amber-400 text-slate-900 font-black text-[10px] md:text-xs flex items-center justify-center shadow-lg ${
                    selectedPoint === 'bar' ? 'ring-2 ring-amber-400' : 'animate-bounce'
                  }`}
                >
                  {state.bar.w}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT HALF: Home Board (Points 19-24 top, 6-1 bottom) */}
          <div className="flex-1 h-full flex flex-col justify-between">
            {/* Top Row: Points 19 to 24 */}
            <div className="w-full h-1/2 flex border-b border-[#7a3b18]/40">
              {[19, 20, 21, 22, 23, 24].map((pt, idx) => renderTriangle(pt, true, idx))}
            </div>
            {/* Bottom Row: Points 6 to 1 */}
            <div className="w-full h-1/2 flex border-t border-[#7a3b18]/40">
              {[6, 5, 4, 3, 2, 1].map((pt, idx) => renderTriangle(pt, false, idx))}
            </div>
          </div>

          {/* BEAR-OFF TRAY ON FAR RIGHT */}
          <div
            onClick={handleBearOffClick}
            className={`w-10 md:w-14 h-full bg-[#2a1309] border-l-2 md:border-l-4 border-[#1c0c05] flex flex-col justify-between items-center py-2 px-1 relative z-20 select-none ${
              validMoves.some((m) => m.to === 0)
                ? 'ring-2 ring-amber-400 bg-amber-950/60 cursor-pointer animate-pulse'
                : ''
            }`}
          >
            {/* Red Borne Off */}
            <div className="flex flex-col items-center">
              <span className="text-[8px] md:text-[9px] font-bold text-red-400 uppercase">
                Red Off
              </span>
              <span className="text-xs md:text-sm font-black text-red-400 mt-0.5">
                {state.off.b}/15
              </span>
              <div className="flex flex-col gap-0.5 mt-1">
                {Array.from({ length: Math.min(5, state.off.b) }).map((_, i) => (
                  <div
                    key={i}
                    className="w-5 h-1.5 md:w-7 md:h-2 rounded-xs bg-red-600 border border-amber-300"
                  />
                ))}
              </div>
            </div>

            {/* Bear Off Center Prompt */}
            <div className="text-center">
              <span className="text-[9px] md:text-[10px] font-extrabold text-amber-300 tracking-tighter uppercase block">
                BEAR OFF
              </span>
              {validMoves.some((m) => m.to === 0) && (
                <span className="text-[8px] bg-amber-400 text-slate-950 font-black px-1 rounded-sm mt-0.5 block">
                  DROP
                </span>
              )}
            </div>

            {/* White Borne Off */}
            <div className="flex flex-col items-center">
              <div className="flex flex-col gap-0.5 mb-1">
                {Array.from({ length: Math.min(5, state.off.w) }).map((_, i) => (
                  <div
                    key={i}
                    className="w-5 h-1.5 md:w-7 md:h-2 rounded-xs bg-slate-100 border border-amber-400"
                  />
                ))}
              </div>
              <span className="text-xs md:text-sm font-black text-amber-400">
                {state.off.w}/15
              </span>
              <span className="text-[8px] md:text-[9px] font-bold text-slate-300 uppercase">
                White Off
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Header Strip: Labels matching screenshot */}
        <div className="flex justify-between items-center text-[10px] md:text-xs font-black text-amber-200/80 px-2 pt-1.5 tracking-wider uppercase">
          <span className="flex items-center gap-1">
            <span className="text-amber-400">⟵</span> Outer Board
          </span>
          <span className="text-amber-400/90 text-center font-bold normal-case">
            White moves Bottom 24 ➔ 1
          </span>
          <span className="flex items-center gap-1 text-right">
            White’s Home Board <span className="text-amber-400">⟶</span>
          </span>
        </div>
      </div>

      {/* Interactive Controls & Dice Area */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 md:p-4 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Status message */}
        <div className="flex items-center gap-2 text-xs md:text-sm font-bold text-amber-300 text-center sm:text-left">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>

        {/* Dice Area & Roll Action */}
        <div className="flex items-center gap-3">
          {/* Dice display */}
          <div className="flex items-center gap-1.5">
            {state.initialDice.length > 0 ? (
              state.initialDice.map((d, idx) => {
                const isAvailable = state.dice.filter((die) => die === d).length > 0;
                return (
                  <div
                    key={idx}
                    className={`w-9 h-9 md:w-10 md:h-10 rounded-xl font-black text-base md:text-lg flex items-center justify-center border shadow-md transition-all ${
                      isAvailable
                        ? state.turn === 'w'
                          ? 'bg-amber-400 text-slate-950 border-amber-300 scale-105 shadow-amber-500/20'
                          : 'bg-red-500 text-white border-red-400'
                        : 'bg-slate-800 text-slate-600 border-slate-700 opacity-40 line-through'
                    }`}
                  >
                    {d}
                  </div>
                );
              })
            ) : (
              <span className="text-xs text-slate-500 italic">Dice ready</span>
            )}
          </div>

          {/* Roll Button */}
          {isMyTurn && !state.rolled && (
            <button
              type="button"
              onClick={rollDice}
              className="py-2.5 px-5 bg-linear-to-r from-amber-500 to-amber-400 hover:from-amber-400 text-slate-950 font-black text-xs md:text-sm rounded-xl shadow-lg shadow-amber-500/20 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <Dices className="w-4 h-4" />
              <span>ROLL DICE</span>
            </button>
          )}

          {/* Bearing Off Button Shortcut if valid */}
          {validMoves.some((m) => m.to === 0) && (
            <button
              type="button"
              onClick={handleBearOffClick}
              className="py-2 px-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer animate-pulse"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Bear Off</span>
            </button>
          )}
        </div>
      </div>

      {/* Rules Quick Reference Bar */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-3 text-[11px] text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            <strong>Goal:</strong> Move all 15 checkers into your Home Board (points 1–6) and bear
            them off before your opponent.
          </span>
        </div>
        <div className="flex items-center gap-2 text-slate-300 font-semibold shrink-0">
          <span>⚪ White: 24 ➔ 1</span>
          <span>·</span>
          <span>🔴 Red: 1 ➔ 24</span>
        </div>
      </div>

      {pvpRoom && <ChatBox channel={`room_${pvpRoom.code}`} currentUser={user} />}
    </div>
  );
};
