import React, { useState, useEffect, useRef } from 'react';
import { User, Room } from '../../types';
import { Backend } from '../../utils/backend';
import { Sound } from '../../utils/sound';
import { ChatBox } from '../ChatBox';
import { PlayerBadge } from '../PlayerBadge';
import { UserAvatar } from '../UserAvatar';
import {
  CHECKERS_BOTS,
  ALL_CHECKERS_PLAYERS,
  CheckersBotPersonality,
} from '../../utils/checkersBots';
import {
  Bot,
  Swords,
  RefreshCw,
  Sparkles,
  MessageSquare,
  ShieldAlert,
  Flame,
  Brain,
  Crown,
  ArrowLeft,
  Flag,
  Play,
  RotateCcw,
  Trophy,
} from 'lucide-react';

interface Piece {
  s: 'w' | 'b'; // w = red (player 1 / traditional white), b = black (player 2)
  k: boolean;   // king
}

type Board = (Piece | null)[][];

interface CheckersMove {
  fr: number;
  fc: number;
  seq: [number, number][];
  caps: [number, number][];
}

function initialBoard(): Board {
  const b: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) b[r][c] = { s: 'b', k: false };
    }
  }
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) b[r][c] = { s: 'w', k: false };
    }
  }
  return b;
}

function getDirs(p: Piece): [number, number][] {
  if (p.k) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return p.s === 'w' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

function getLegalMoves(b: Board, side: 'w' | 'b'): CheckersMove[] {
  const caps: CheckersMove[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p || p.s !== side) continue;

      const dfs = (
        br: number,
        bc: number,
        bd: Board,
        path: [number, number][],
        capList: [number, number][]
      ) => {
        let moved = false;
        const currentPiece = bd[br][bc];
        if (!currentPiece) return;

        for (const [dr, dc] of getDirs(currentPiece)) {
          const mr = br + dr;
          const mc = bc + dc;
          const lr = br + 2 * dr;
          const lc = bc + 2 * dc;

          if (lr < 0 || lr > 7 || lc < 0 || lc > 7 || bd[lr][lc]) continue;
          const mid = bd[mr] && bd[mr][mc];
          if (mid && mid.s !== side && !capList.some(([x, y]) => x === mr && y === mc)) {
            moved = true;
            const nb = bd.map((row) => row.slice());
            const pc = nb[br][bc]!;
            const isCrown = currentPiece.k || (side === 'w' ? lr === 0 : lr === 7);
            nb[lr][lc] = { s: pc.s, k: isCrown };
            nb[br][bc] = null;
            dfs(lr, lc, nb, [...path, [lr, lc]], [...capList, [mr, mc]]);
          }
        }

        if (!moved && capList.length) {
          caps.push({ fr: r, fc: c, seq: path, caps: capList });
        }
      };

      dfs(r, c, b.map((row) => row.slice()), [], []);
    }
  }

  // Mandatory capture in checkers: if any jump is possible, only jumps are legal
  if (caps.length) return caps;

  const quiet: CheckersMove[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p || p.s !== side) continue;

      for (const [dr, dc] of getDirs(p)) {
        const lr = r + dr;
        const lc = c + dc;
        if (lr >= 0 && lr < 8 && lc >= 0 && lc < 8 && !b[lr][lc]) {
          quiet.push({ fr: r, fc: c, seq: [[lr, lc]], caps: [] });
        }
      }
    }
  }

  return quiet;
}

function applyMove(b: Board, m: CheckersMove): Board {
  const nb = b.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
  const p = nb[m.fr][m.fc]!;
  nb[m.fr][m.fc] = null;

  m.caps.forEach(([cr, cc]) => {
    nb[cr][cc] = null;
  });

  const [lr, lc] = m.seq[m.seq.length - 1];
  p.k = p.k || (p.s === 'w' ? lr === 0 : lr === 7);
  nb[lr][lc] = p;
  return nb;
}

// Checkers Board Evaluation from the perspective of botIsRed ('w') or botIsBlack ('b')
function evaluateCheckersBoard(
  bd: Board,
  bot: CheckersBotPersonality,
  botIsRed: boolean
): number {
  let score = 0;
  const botSide: 'w' | 'b' = botIsRed ? 'w' : 'b';
  const humanSide: 'w' | 'b' = botIsRed ? 'b' : 'w';

  const regularVal = 100;
  const kingVal = bot.strategy.kingValue || 180;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = bd[r][c];
      if (!p) continue;

      const isBot = p.s === botSide;
      const multiplier = isBot ? 1 : -1;

      // Base material
      let val = p.k ? kingVal : regularVal;

      // Advancement bonus for men
      if (!p.k) {
        const advance = p.s === 'w' ? (7 - r) : r;
        val += advance * 6 * bot.strategy.aggression;
      }

      // Back-row baseline protection (prevents enemy crowns)
      if (!p.k) {
        const isBackRow = p.s === 'w' ? r === 7 : r === 0;
        if (isBackRow) {
          val += 22 * bot.strategy.defense;
        }
      }

      // Center control bonus (squares in rows 3-4, cols 2-5)
      if ((r === 3 || r === 4) && (c >= 2 && c <= 5)) {
        val += 10 * bot.strategy.centerControl;
      }

      // Edge penalty (columns 0 and 7 have fewer diagonal options)
      if (c === 0 || c === 7) {
        val -= 8;
      }

      score += val * multiplier;
    }
  }

  // Mobility evaluation
  const botMoves = getLegalMoves(bd, botSide).length;
  const humanMoves = getLegalMoves(bd, humanSide).length;
  score += (botMoves - humanMoves) * 4;

  return score;
}

// Checkers Minimax with Alpha-Beta Pruning
function checkersMinimax(
  bd: Board,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  bot: CheckersBotPersonality,
  botIsRed: boolean
): number {
  const botSide: 'w' | 'b' = botIsRed ? 'w' : 'b';
  const humanSide: 'w' | 'b' = botIsRed ? 'b' : 'w';
  const currentSide = isMaximizing ? botSide : humanSide;

  const legalMoves = getLegalMoves(bd, currentSide);

  if (legalMoves.length === 0) {
    // Current player has lost (no legal moves)
    return isMaximizing ? -10000 : 10000;
  }

  if (depth <= 0) {
    return evaluateCheckersBoard(bd, bot, botIsRed);
  }

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const m of legalMoves) {
      const nextBoard = applyMove(bd, m);
      const ev = checkersMinimax(nextBoard, depth - 1, alpha, beta, false, bot, botIsRed);
      maxEval = Math.max(maxEval, ev);
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const m of legalMoves) {
      const nextBoard = applyMove(bd, m);
      const ev = checkersMinimax(nextBoard, depth - 1, alpha, beta, true, bot, botIsRed);
      minEval = Math.min(minEval, ev);
      beta = Math.min(beta, ev);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

interface CheckersGameProps {
  user: User;
  onUpdateUser: (updated: User) => void;
  pvpRoom?: Room | null;
}

export const CheckersGame: React.FC<CheckersGameProps> = ({
  user,
  onUpdateUser,
  pvpRoom,
}) => {
  // Pre-game match selection state
  const [selectedBot, setSelectedBot] = useState<CheckersBotPersonality>(CHECKERS_BOTS[0]);
  const [chosenColor, setChosenColor] = useState<'w' | 'b' | 'random'>('w');
  const [gameStarted, setGameStarted] = useState<boolean>(!!pvpRoom);

  // In-Game State
  const [board, setBoard] = useState<Board>(initialBoard);
  const [turn, setTurn] = useState<'w' | 'b'>('w'); // 'w' moves first in checkers
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null);
  const [availableMoves, setAvailableMoves] = useState<CheckersMove[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [gameResult, setGameResult] = useState<'win' | 'loss' | 'draw' | null>(null);
  const [statusMessage, setStatusMessage] = useState('Your turn');
  const [botQuote, setBotQuote] = useState<string>('');

  // Human player piece color in single-player
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const isPvp = !!pvpRoom && pvpRoom.game === 'checkers';
  const mySide: 'w' | 'b' = isPvp && Array.isArray(pvpRoom?.seats)
    ? (pvpRoom.seats.indexOf(user.uid) === 0 ? 'w' : 'b')
    : playerColor;
  const botSide: 'w' | 'b' = mySide === 'w' ? 'b' : 'w';

  // PvP opponent info
  const oppUid = pvpRoom && Array.isArray(pvpRoom.seats) ? pvpRoom.seats.find((s) => s !== user.uid) : undefined;
  const oppAvatar = oppUid ? pvpRoom?.avatars?.[oppUid] : undefined;
  const oppName = oppUid ? pvpRoom?.names?.[oppUid] || 'Opponent' : 'Opponent';

  // Opponent dialogue timer
  const quoteTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const recordedWinRef = useRef(false);

  // PvP sync
  useEffect(() => {
    if (pvpRoom && pvpRoom.game === 'checkers' && pvpRoom.state && Array.isArray(pvpRoom.state.board)) {
      setBoard(pvpRoom.state.board);
      setTurn(pvpRoom.state.turn ?? 'w');
      if (pvpRoom.status === 'done') {
        setGameOver(true);
        if (
          (pvpRoom.state.winner === mySide || pvpRoom.state.winner === user.uid) &&
          !recordedWinRef.current
        ) {
          recordedWinRef.current = true;
          const { user: updatedUser } = Backend.recordWin(user, 'checkers');
          onUpdateUser(updatedUser);
          setGameResult('win');
          setStatusMessage('🎉 Victory! You won the checkers match!');
        }
      }
      setGameStarted(true);
    } else if (pvpRoom && pvpRoom.game === 'checkers' && !pvpRoom.state && pvpRoom.host === user.uid) {
      Backend.updateRoom({
        ...pvpRoom,
        state: { board, turn },
        turn: 0,
      });
      setGameStarted(true);
    }
  }, [pvpRoom, mySide]);

  // Handle Level Selection (Levels 1 to 10)
  const handleSelectLevel = (lvl: number) => {
    const match = ALL_CHECKERS_PLAYERS.find((b) => b.level === lvl) || CHECKERS_BOTS[0];
    setSelectedBot(match);
    Sound.click();
  };

  // Handle Specific Opponent Selection Card
  const handleSelectBotCard = (bot: CheckersBotPersonality) => {
    setSelectedBot(bot);
    Sound.click();
  };

  // Start Single-Player Match
  const handleStartMatch = () => {
    Sound.click();
    let assignedColor: 'w' | 'b' = 'w';
    if (chosenColor === 'random') {
      assignedColor = Math.random() < 0.5 ? 'w' : 'b';
    } else {
      assignedColor = chosenColor;
    }

    setPlayerColor(assignedColor);
    setBoard(initialBoard());
    setTurn('w'); // 'w' always moves first
    setSelectedCell(null);
    setAvailableMoves([]);
    setGameOver(false);
    setGameResult(null);
    setBotQuote(selectedBot.dialogues.greeting);

    if (assignedColor === 'w') {
      setStatusMessage('Your turn (Red pieces move first)');
    } else {
      setStatusMessage(`${selectedBot.name} is thinking (Red moves first)...`);
    }

    setGameStarted(true);

    // If human is Black ('b'), bot ('w') moves first!
    if (assignedColor === 'b') {
      setTimeout(() => {
        executeBotTurn(initialBoard(), selectedBot, true);
      }, 700);
    }
  };

  // Return to Setup Screen
  const handleBackToSetup = () => {
    Sound.click();
    setGameStarted(false);
    setGameOver(false);
    setGameResult(null);
  };

  // Rematch with same bot
  const handleRematch = () => {
    handleStartMatch();
  };

  // Resign match
  const handleResign = () => {
    if (gameOver) return;
    Sound.lose();
    setGameOver(true);
    setGameResult('loss');
    setStatusMessage(`You resigned against ${selectedBot.name}.`);
    setBotQuote(selectedBot.dialogues.onWin);
    if (pvpRoom) {
      const oppSide = mySide === 'w' ? 'b' : 'w';
      Backend.updateRoom({
        ...pvpRoom,
        state: { board, turn, winner: oppSide },
        status: 'done',
      });
    }
  };

  // Handle Cell Click during gameplay
  const handleCellClick = (r: number, c: number) => {
    if (gameOver || turn !== mySide) return;

    // Check if clicked cell is a destination of an already selected piece
    if (selectedCell) {
      const matchMove = availableMoves.find(
        (m) =>
          m.fr === selectedCell[0] &&
          m.fc === selectedCell[1] &&
          m.seq[m.seq.length - 1][0] === r &&
          m.seq[m.seq.length - 1][1] === c
      );

      if (matchMove) {
        executeHumanMove(matchMove);
        return;
      }
    }

    // Select piece
    const piece = board[r][c];
    if (piece && piece.s === turn) {
      const allLegalMoves = getLegalMoves(board, turn);
      const pieceMoves = allLegalMoves.filter((m) => m.fr === r && m.fc === c);

      if (pieceMoves.length > 0) {
        setSelectedCell([r, c]);
        setAvailableMoves(pieceMoves);
        Sound.click();
      } else {
        // If other pieces have mandatory jumps, notify user
        const hasAnyJumps = allLegalMoves.some((m) => m.caps.length > 0);
        if (hasAnyJumps) {
          setStatusMessage('⚠️ A jump is available and mandatory!');
        }
      }
    } else {
      setSelectedCell(null);
      setAvailableMoves([]);
    }
  };

  // Execute Human Move
  const executeHumanMove = (m: CheckersMove) => {
    const isJump = m.caps.length > 0;
    const nextBoard = applyMove(board, m);
    const nextTurn: 'w' | 'b' = turn === 'w' ? 'b' : 'w';

    setBoard(nextBoard);
    setTurn(nextTurn);
    setSelectedCell(null);
    setAvailableMoves([]);
    Sound.click();

    // Human made a jump -> bot reaction
    if (isJump && selectedBot.dialogues.onLosing.length > 0) {
      const randomReaction =
        selectedBot.dialogues.onLosing[
          Math.floor(Math.random() * selectedBot.dialogues.onLosing.length)
        ];
      setBotQuote(randomReaction);
    }

    // Check game over
    const oppMoves = getLegalMoves(nextBoard, nextTurn);
    if (oppMoves.length === 0) {
      setGameOver(true);
      recordedWinRef.current = true;
      const { user: updatedUser } = Backend.recordWin(user, 'checkers');
      onUpdateUser(updatedUser);
      setGameResult('win');
      setStatusMessage(`🎉 Victory! You defeated ${selectedBot.name} in Checkers!`);
      setBotQuote(selectedBot.dialogues.onDefeat);

      if (pvpRoom) {
        Backend.updateRoom({
          ...pvpRoom,
          state: { board: nextBoard, turn: nextTurn, winner: mySide },
          status: 'done',
        });
      }
      return;
    }

    if (pvpRoom) {
      Backend.updateRoom({
        ...pvpRoom,
        state: { board: nextBoard, turn: nextTurn },
        turn: pvpRoom.seats.indexOf(user.uid) === 0 ? 1 : 0,
      });
    } else {
      // Offline Bot Turn
      setStatusMessage(`${selectedBot.name}'s turn...`);
      setTimeout(() => {
        executeBotTurn(nextBoard, selectedBot, botSide === 'w');
      }, 550);
    }
  };

  // Execute Bot Turn
  const executeBotTurn = (
    currentBoard: Board,
    bot: CheckersBotPersonality,
    botIsRed: boolean
  ) => {
    const currentBotSide: 'w' | 'b' = botIsRed ? 'w' : 'b';
    const moves = getLegalMoves(currentBoard, currentBotSide);

    if (moves.length === 0) {
      setGameOver(true);
      const { user: updatedUser } = Backend.recordWin(user, 'checkers');
      onUpdateUser(updatedUser);
      setGameResult('win');
      setStatusMessage(`🎉 Victory! ${bot.name} has no legal moves!`);
      setBotQuote(bot.dialogues.onDefeat);
      return;
    }

    let chosen: CheckersMove;
    const isBlunder = Math.random() < bot.strategy.blunderChance;

    if (isBlunder && moves.length > 1) {
      chosen = moves[Math.floor(Math.random() * moves.length)];
    } else {
      // Minimax search
      const depth = Math.min(bot.strategy.depth, 5);
      let bestScore = -Infinity;
      let candidates: { move: CheckersMove; score: number }[] = [];

      for (const m of moves) {
        const nextBoard = applyMove(currentBoard, m);
        let moveScore = checkersMinimax(
          nextBoard,
          depth - 1,
          -Infinity,
          Infinity,
          false,
          bot,
          botIsRed
        );

        if (bot.strategy.randomJitter > 0) {
          moveScore += (Math.random() - 0.5) * bot.strategy.randomJitter;
        }

        // Extra weight for multi-jumps and crowning
        if (m.caps.length > 1) {
          moveScore += 40 * bot.strategy.aggression;
        }

        const [lastR] = m.seq[m.seq.length - 1];
        const isCrowned = botIsRed ? lastR === 0 : lastR === 7;
        if (isCrowned) {
          moveScore += 50;
        }

        candidates.push({ move: m, score: moveScore });
        if (moveScore > bestScore) {
          bestScore = moveScore;
        }
      }

      const threshold = bot.level >= 9 ? 2 : 15;
      const topMoves = candidates.filter((c) => c.score >= bestScore - threshold);
      chosen = topMoves[Math.floor(Math.random() * topMoves.length)]?.move || moves[0];
    }

    const wasJump = chosen.caps.length > 0;
    const [lr] = chosen.seq[chosen.seq.length - 1];
    const becameKing = botIsRed ? lr === 0 : lr === 7;
    const nextBoard = applyMove(currentBoard, chosen);
    const nextTurn: 'w' | 'b' = currentBotSide === 'w' ? 'b' : 'w';

    setBoard(nextBoard);
    setTurn(nextTurn);
    Sound.click();

    // Select dynamic speech bubble quote
    if (becameKing && bot.dialogues.onKing.length > 0) {
      const q = bot.dialogues.onKing[Math.floor(Math.random() * bot.dialogues.onKing.length)];
      setBotQuote(q);
    } else if (wasJump && bot.dialogues.onJump.length > 0) {
      const q = bot.dialogues.onJump[Math.floor(Math.random() * bot.dialogues.onJump.length)];
      setBotQuote(q);
    } else if (bot.dialogues.onMove.length > 0 && Math.random() < 0.4) {
      const q = bot.dialogues.onMove[Math.floor(Math.random() * bot.dialogues.onMove.length)];
      setBotQuote(q);
    }

    // Check if human has legal moves
    const humanMoves = getLegalMoves(nextBoard, mySide);
    if (humanMoves.length === 0) {
      setGameOver(true);
      Sound.lose();
      setGameResult('loss');
      setStatusMessage(`Defeat. ${bot.name} wins the match.`);
      setBotQuote(bot.dialogues.onWin);
    } else {
      setStatusMessage(mySide === 'w' ? 'Your turn (Red pieces)' : 'Your turn (Black pieces)');
    }
  };

  const isHighlighted = (r: number, c: number) => {
    return availableMoves.some(
      (m) =>
        m.seq[m.seq.length - 1][0] === r &&
        m.seq[m.seq.length - 1][1] === c
    );
  };

  // Count captured pieces
  const redCount = board.flat().filter((p) => p?.s === 'w').length;
  const blackCount = board.flat().filter((p) => p?.s === 'b').length;
  const redCaptured = 12 - redCount;
  const blackCaptured = 12 - blackCount;

  // Render display orientation (Human pieces always at the bottom)
  const displayRows = mySide === 'b' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const displayCols = mySide === 'b' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  // ==========================================
  // PRE-GAME SELECTION SCREEN (When not in game)
  // ==========================================
  if (!gameStarted && !pvpRoom) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 pb-8 animate-fadeIn">
        {/* Header Title Banner */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-wider">
            <Swords className="w-3.5 h-3.5 text-amber-400" />
            Checkers Match Preparation
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            Choose Difficulty & Checkers Champion
          </h2>
          <p className="text-xs md:text-sm text-slate-400 max-w-lg mx-auto">
            Select your skill level from 1 to 10 and challenge legendary world draughts champions, each with authentic playing likeness and strategies.
          </p>
        </div>

        {/* SECTION 1: SKILL LEVELS 1 - 10 PICKER */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs md:text-sm font-bold text-white flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-amber-400" />
              Skill Level (1 – 10)
            </span>
            <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
              Selected: Level {selectedBot.level} ({selectedBot.elo} ELO)
            </span>
          </div>

          {/* 10 Level Selector Grid */}
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
            {CHECKERS_BOTS.map((bot) => {
              const isSelected = selectedBot.level === bot.level;
              return (
                <button
                  key={bot.level}
                  type="button"
                  onClick={() => handleSelectLevel(bot.level)}
                  className={`p-2 rounded-xl text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center gap-0.5 border ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 font-black border-amber-300 shadow-md shadow-amber-400/20 scale-105 ring-2 ring-amber-300'
                      : 'bg-slate-950/80 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
                  }`}
                  title={`Level ${bot.level}: ${bot.name} (${bot.elo} ELO)`}
                >
                  <span className="text-sm font-extrabold">{bot.level}</span>
                  <span
                    className={`text-[10px] font-mono leading-none ${
                      isSelected ? 'text-slate-900 font-bold' : 'text-slate-400'
                    }`}
                  >
                    {bot.elo}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Skill Tier Helper Guide */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] text-slate-400">
            <div className="bg-slate-950/60 rounded-lg p-2 border border-slate-800/80">
              <div className="font-bold text-emerald-400">Levels 1–3</div>
              <div className="text-[10px]">Beginner & Club (600–1200)</div>
            </div>
            <div className="bg-slate-950/60 rounded-lg p-2 border border-slate-800/80">
              <div className="font-bold text-blue-400">Levels 4–6</div>
              <div className="text-[10px]">Tactical & Sharp (1450–2050)</div>
            </div>
            <div className="bg-slate-950/60 rounded-lg p-2 border border-slate-800/80">
              <div className="font-bold text-amber-400">Levels 7–8</div>
              <div className="text-[10px]">Master & Grandmaster (2300–2550)</div>
            </div>
            <div className="bg-slate-950/60 rounded-lg p-2 border border-slate-800/80">
              <div className="font-bold text-purple-400">Levels 9–10</div>
              <div className="text-[10px]">World Champion & GOAT (2750–3000)</div>
            </div>
          </div>
        </div>

        {/* SECTION 2: CURRENT SELECTED OPPONENT SPOTLIGHT CARD */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 border-2 border-amber-500/40 rounded-2xl p-4 md:p-5 shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            {/* Big Avatar */}
            <div className="relative shrink-0">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-amber-600 via-red-600 to-amber-400 p-1 shadow-xl flex items-center justify-center">
                <div className="w-full h-full bg-slate-950 rounded-xl flex items-center justify-center text-4xl">
                  {selectedBot.avatar}
                </div>
              </div>
              <span className="absolute -bottom-2 -right-2 bg-amber-400 text-slate-950 font-black text-xs px-2.5 py-0.5 rounded-full shadow-md border-2 border-slate-900">
                Lvl {selectedBot.level}
              </span>
            </div>

            {/* Profile Info */}
            <div className="flex-1 text-center sm:text-left space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h3 className="font-black text-lg md:text-xl text-white">{selectedBot.name}</h3>
                <span className="bg-amber-500/20 text-amber-300 font-mono font-bold text-xs px-2 py-0.5 rounded-full border border-amber-500/30">
                  {selectedBot.elo} ELO
                </span>
                <span className="bg-slate-800 text-slate-300 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-slate-700">
                  {selectedBot.title}
                </span>
              </div>

              {/* Style badge */}
              <div className="text-xs font-semibold text-amber-300/90 flex items-center justify-center sm:justify-start gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Style: {selectedBot.style}</span>
              </div>

              {/* Description */}
              <p className="text-xs text-slate-300 leading-relaxed">
                {selectedBot.description}
              </p>

              {/* Signature Tactics */}
              <div className="text-xs bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 text-slate-300 space-y-1">
                <div>
                  <strong className="text-amber-400">Signature Strategy: </strong>
                  <span>{selectedBot.signatureTactics}</span>
                </div>
                <div className="text-slate-400 italic text-[11px]">
                  "{selectedBot.quote}"
                </div>
              </div>
            </div>
          </div>

          {/* Strategy Stat Gauges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-xs">
            <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800/80 flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-400">Aggression</div>
                <div className="font-bold text-white">
                  {selectedBot.strategy.aggression >= 2 ? 'Fierce Jumper' : selectedBot.strategy.aggression >= 1.2 ? 'Active' : 'Solid'}
                </div>
              </div>
            </div>
            <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800/80 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-400">Defense & Fortress</div>
                <div className="font-bold text-white">
                  {selectedBot.strategy.defense >= 2 ? 'Iron Baseline' : selectedBot.strategy.defense >= 1 ? 'Careful' : 'Open'}
                </div>
              </div>
            </div>
            <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800/80 flex items-center gap-2">
              <Brain className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-400">Blunder Chance</div>
                <div className="font-bold text-white">
                  {selectedBot.strategy.blunderChance === 0 ? '0% (Flawless)' : `${Math.round(selectedBot.strategy.blunderChance * 100)}%`}
                </div>
              </div>
            </div>
            <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800/80 flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-400">Search Depth</div>
                <div className="font-bold text-white">Level {selectedBot.strategy.depth}</div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: CHOOSE YOUR PIECE COLOR */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <div className="text-xs md:text-sm font-bold text-white">Choose Your Piece Color</div>
            <div className="text-[11px] text-slate-400">Red pieces move first; Black pieces respond second</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                Sound.click();
                setChosenColor('w');
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer border ${
                chosenColor === 'w'
                  ? 'bg-rose-600 text-white border-rose-400 shadow-md ring-2 ring-rose-400 font-extrabold'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span className="w-3.5 h-3.5 rounded-full bg-rose-500 border border-rose-300 shadow-xs inline-block" />
              <span>Red (Moves 1st)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                Sound.click();
                setChosenColor('b');
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer border ${
                chosenColor === 'b'
                  ? 'bg-slate-800 text-amber-300 border-amber-400 shadow-md ring-2 ring-amber-400 font-extrabold'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span className="w-3.5 h-3.5 rounded-full bg-slate-900 border border-slate-600 shadow-xs inline-block" />
              <span>Black (Moves 2nd)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                Sound.click();
                setChosenColor('random');
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                chosenColor === 'random'
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md ring-2 ring-amber-300 font-extrabold'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span>🎲</span>
              <span>Random</span>
            </button>
          </div>
        </div>

        {/* SECTION 4: START MATCH BUTTON */}
        <div className="pt-1">
          <button
            type="button"
            onClick={handleStartMatch}
            className="w-full py-4 px-6 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 active:scale-[0.99] text-slate-950 font-black text-base md:text-lg rounded-2xl shadow-xl shadow-amber-500/20 transition-all flex items-center justify-center gap-2.5 cursor-pointer uppercase tracking-wide"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Start Match vs {selectedBot.name} (Lvl {selectedBot.level})</span>
          </button>
        </div>

        {/* SECTION 5: FULL OPPONENT ROSTER GALLERY */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs md:text-sm font-bold text-white">
              Or Choose Any Checkers Legend
            </span>
            <span className="text-[11px] text-slate-400">
              Click any opponent card to challenge
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[400px] overflow-y-auto pr-1">
            {ALL_CHECKERS_PLAYERS.map((bot) => {
              const isSelected = selectedBot.id === bot.id;
              return (
                <button
                  key={bot.id}
                  type="button"
                  onClick={() => handleSelectBotCard(bot)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                    isSelected
                      ? 'bg-amber-950/50 border-amber-400 shadow-md ring-1 ring-amber-400'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-amber-600 to-red-600 p-0.5 shadow-sm flex items-center justify-center text-xl shrink-0">
                    <div className="w-full h-full bg-slate-900 rounded-lg flex items-center justify-center">
                      {bot.avatar}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-extrabold text-xs text-white truncate">{bot.name}</span>
                      <span className="text-[10px] text-amber-400 font-mono font-bold shrink-0">
                        {bot.elo} ELO
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium truncate">
                      Level {bot.level} • {bot.title}
                    </div>
                    <div className="text-[10px] text-amber-300/80 font-medium truncate mt-0.5">
                      {bot.style}
                    </div>
                  </div>

                  {isSelected && (
                    <span className="text-[10px] bg-amber-400 text-slate-950 font-bold px-1.5 py-0.5 rounded shrink-0">
                      Active
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // IN-GAME SCREEN (Clean board, no mid-game selectors!)
  // ==========================================
  return (
    <div className="max-w-xl mx-auto space-y-3 pb-8">
      {/* TOP CONTROLS & HEADER */}
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={handleBackToSetup}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Change Opponent / Level</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRematch}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-amber-400 bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-800 transition-colors cursor-pointer"
            title="Restart Match"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Restart</span>
          </button>

          {!gameOver && !pvpRoom && (
            <button
              type="button"
              onClick={handleResign}
              className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-800 transition-colors cursor-pointer"
              title="Resign"
            >
              <Flag className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Resign</span>
            </button>
          )}
        </div>
      </div>

      {/* OPPONENT HUD BAR */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-3 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          {/* Opponent Info */}
          <div className="flex items-center gap-2.5 min-w-0">
            {pvpRoom ? (
              <UserAvatar avatar={oppAvatar} username={oppName} size="md" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-red-600 p-0.5 shrink-0 shadow-md">
                <div className="w-full h-full bg-slate-950 rounded-lg flex items-center justify-center text-xl">
                  {selectedBot.avatar}
                </div>
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-white truncate">
                  {pvpRoom ? oppName : selectedBot.name}
                </span>
                {!pvpRoom && (
                  <span className="text-[10px] bg-amber-400/20 text-amber-300 border border-amber-400/30 px-1.5 py-0.2 rounded font-mono font-bold">
                    Lvl {selectedBot.level} • {selectedBot.elo}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full inline-block border ${
                    botSide === 'w' ? 'bg-rose-500 border-rose-300' : 'bg-slate-950 border-slate-600'
                  }`}
                />
                <span>{botSide === 'w' ? 'Red Checkers' : 'Black Checkers'}</span>
              </div>
            </div>
          </div>

          {/* Captured Pieces Count by Opponent */}
          <div className="flex items-center gap-1 bg-slate-950/70 px-2.5 py-1.5 rounded-xl border border-slate-800 shrink-0">
            <span className="text-[10px] text-slate-400 font-semibold mr-1">Captured:</span>
            <div className="flex items-center gap-1">
              <span
                className={`w-3.5 h-3.5 rounded-full inline-block border ${
                  mySide === 'w' ? 'bg-rose-500 border-rose-300' : 'bg-slate-900 border-slate-600'
                }`}
              />
              <span className="text-xs font-mono font-bold text-white">
                {mySide === 'w' ? redCaptured : blackCaptured}
              </span>
            </div>
          </div>
        </div>

        {/* Live Bot Speech Bubble */}
        {!pvpRoom && botQuote && (
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-start gap-2 text-xs text-amber-200/90 bg-amber-950/20 px-3 py-1.5 rounded-xl border border-amber-500/20">
            <MessageSquare className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span className="italic leading-relaxed">{botQuote}</span>
          </div>
        )}
      </div>

      {/* GAME STATUS BANNER */}
      <div className="flex items-center justify-between px-2 text-xs">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              turn === mySide ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span className="font-extrabold text-slate-200">{statusMessage}</span>
        </div>

        <div className="text-[11px] font-semibold text-slate-400">
          Turn: <span className="text-amber-400 font-bold">{turn === 'w' ? 'Red' : 'Black'}</span>
        </div>
      </div>

      {/* CHECKERS BOARD CONTAINER (STRICT 1:1 SQUARE) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-3 md:p-4 shadow-2xl flex flex-col items-center">
        <div className="w-full max-w-[420px] aspect-square rounded-2xl overflow-hidden p-2.5 bg-gradient-to-br from-amber-900 via-amber-950 to-stone-950 border-4 border-amber-800/80 shadow-2xl relative">
          <div
            className="w-full h-full grid grid-cols-8 grid-rows-8 gap-0 rounded-lg overflow-hidden border border-amber-950/80 shadow-inner"
            style={{
              aspectRatio: '1 / 1',
              gridTemplateRows: 'repeat(8, minmax(0, 1fr))',
              gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
            }}
          >
            {displayRows.map((r) =>
              displayCols.map((c) => {
                const isDark = (r + c) % 2 === 1;
                const cell = board[r][c];
                const isSelected = selectedCell && selectedCell[0] === r && selectedCell[1] === c;
                const isTarget = isHighlighted(r, c);

                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    onClick={() => handleCellClick(r, c)}
                    disabled={gameOver || turn !== mySide}
                    className={`w-full h-full aspect-square flex items-center justify-center relative select-none p-0 transition-colors ${
                      isDark ? 'bg-[#451a03]' : 'bg-[#fef3c7]'
                    } ${isSelected ? 'ring-3 ring-amber-400 z-10' : ''}`}
                    title={`(${r}, ${c})`}
                  >
                    {/* Destination Marker Ring / Dot */}
                    {isTarget && (
                      <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                        <div className="w-4 h-4 rounded-full bg-emerald-400/90 shadow-md shadow-emerald-400/50 animate-pulse border-2 border-white ring-2 ring-emerald-500/50" />
                      </div>
                    )}

                    {/* Checkers Piece */}
                    {cell && (
                      <div
                        className={`w-[78%] h-[78%] rounded-full flex items-center justify-center font-bold text-sm select-none transition-transform duration-150 ${
                          isSelected ? 'scale-110 shadow-2xl' : 'hover:scale-105'
                        } ${
                          cell.s === 'w'
                            ? 'bg-gradient-to-br from-rose-500 via-red-600 to-rose-900 border-2 border-rose-300 text-white shadow-md shadow-black/50 ring-1 ring-rose-400/60'
                            : 'bg-gradient-to-br from-slate-700 via-slate-900 to-black border-2 border-slate-500 text-amber-300 shadow-md shadow-black/70 ring-1 ring-slate-700'
                        }`}
                      >
                        {/* Concentric Ridged Ring */}
                        <div className="w-[82%] h-[82%] rounded-full border border-white/20 flex items-center justify-center">
                          {cell.k ? (
                            <span className="text-base drop-shadow-md filter select-none leading-none">
                              👑
                            </span>
                          ) : (
                            <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
                          )}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* HUMAN PLAYER HUD (BOTTOM) */}
        <div className="w-full flex items-center justify-between pt-3 mt-3 border-t border-slate-800 px-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <UserAvatar avatar={user.avatar} username={user.username} size="md" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-white truncate">
                  {user.username} (You)
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.2 rounded font-mono font-bold">
                  {(user.points ?? 0).toLocaleString()} pts
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full inline-block border ${
                    mySide === 'w' ? 'bg-rose-500 border-rose-300' : 'bg-slate-950 border-slate-600'
                  }`}
                />
                <span>{mySide === 'w' ? 'Red Checkers' : 'Black Checkers'}</span>
              </div>
            </div>
          </div>

          {/* Captured Pieces Count by Human */}
          <div className="flex items-center gap-1 bg-slate-950/70 px-2.5 py-1.5 rounded-xl border border-slate-800 shrink-0">
            <span className="text-[10px] text-slate-400 font-semibold mr-1">Captured:</span>
            <div className="flex items-center gap-1">
              <span
                className={`w-3.5 h-3.5 rounded-full inline-block border ${
                  botSide === 'w' ? 'bg-rose-500 border-rose-300' : 'bg-slate-900 border-slate-600'
                }`}
              />
              <span className="text-xs font-mono font-bold text-white">
                {botSide === 'w' ? redCaptured : blackCaptured}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* GAME OVER MODAL / BANNER */}
      {gameOver && (
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/50 border-2 border-amber-500/50 rounded-3xl p-5 shadow-2xl text-center space-y-4 animate-scaleUp">
          <div className="space-y-1">
            <div className="text-3xl mb-1">
              {gameResult === 'win' ? '🏆' : gameResult === 'loss' ? '🎖️' : '🤝'}
            </div>
            <h3 className="font-black text-xl md:text-2xl text-white">
              {gameResult === 'win'
                ? 'Checkers Victory!'
                : gameResult === 'loss'
                ? 'Match Concluded'
                : 'Draw Game'}
            </h3>
            <p className="text-xs md:text-sm text-slate-300 max-w-sm mx-auto">
              {statusMessage}
            </p>
          </div>

          {!pvpRoom && botQuote && (
            <div className="text-xs bg-slate-950/80 rounded-xl p-3 border border-slate-800 text-amber-200/90 italic max-w-md mx-auto">
              "{botQuote}"
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleRematch}
              className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer uppercase tracking-wider"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Play Rematch</span>
            </button>

            <button
              type="button"
              onClick={handleBackToSetup}
              className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-700 transition-all cursor-pointer"
            >
              <Bot className="w-4 h-4 text-amber-400" />
              <span>Change Opponent & Level</span>
            </button>
          </div>
        </div>
      )}

      {/* PVP CHAT */}
      {pvpRoom && <ChatBox channel={`room_${pvpRoom.code}`} currentUser={user} />}
    </div>
  );
};
