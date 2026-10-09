import React, { useState, useEffect, useRef } from 'react';
import { User, Room } from '../../types';
import { Backend } from '../../utils/backend';
import { Sound } from '../../utils/sound';
import { ChatBox } from '../ChatBox';
import { PlayerBadge } from '../PlayerBadge';
import {
  CHESS_BOTS,
  ALL_CHESS_PLAYERS,
  ChessBotPersonality,
} from '../../utils/chessBots';
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
} from 'lucide-react';

type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
type PieceColor = 'w' | 'b';

interface ChessPiece {
  t: PieceType;
  w: boolean; // true = white, false = black
}

type ChessBoard = (ChessPiece | null)[][];

interface ChessMove {
  fr: number;
  fc: number;
  tr: number;
  tc: number;
  promo?: PieceType;
  castle?: 'k' | 'q';
  ep?: boolean;
}

const CHESS_SYMBOLS: Record<PieceType, [string, string]> = {
  k: ['♚', '♔'],
  q: ['♛', '♕'],
  r: ['♜', '♖'],
  b: ['♝', '♗'],
  n: ['♞', '♘'],
  p: ['♟', '♙'],
};

// Piece-Square positional values for Black (from Black's perspective [0][0] to [7][7])
const PAWN_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const KNIGHT_PST = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];

const BISHOP_PST = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];

const KING_PST_MID = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20],
];

function initialChessBoard(): ChessBoard {
  const back: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const b: ChessBoard = Array.from({ length: 8 }, () => Array(8).fill(null));

  for (let i = 0; i < 8; i++) {
    b[0][i] = { t: back[i], w: false };
    b[1][i] = { t: 'p', w: false };
    b[6][i] = { t: 'p', w: true };
    b[7][i] = { t: back[i], w: true };
  }
  return b;
}

function isAttacked(b: ChessBoard, r: number, c: number, byWhite: boolean): boolean {
  const pd = byWhite ? 1 : -1;
  // Pawn attacks
  for (const dc of [-1, 1]) {
    const pr = r + pd;
    const pc = c + dc;
    if (pr >= 0 && pr < 8 && pc >= 0 && pc < 8) {
      const p = b[pr][pc];
      if (p && p.t === 'p' && p.w === byWhite) return true;
    }
  }

  // Knight attacks
  const knDirs = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];
  for (const [dr, dc] of knDirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = b[nr][nc];
      if (p && p.t === 'n' && p.w === byWhite) return true;
    }
  }

  // Line attacks (Rook, Bishop, Queen, King)
  const lineDirs = [
    [-1, -1], [-1, 1], [1, -1], [1, 1],
    [-1, 0], [1, 0], [0, -1], [0, 1],
  ];
  for (const [dr, dc] of lineDirs) {
    let nr = r + dr;
    let nc = c + dc;
    let dist = 1;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = b[nr][nc];
      if (p) {
        if (p.w === byWhite) {
          const isDiag = dr !== 0 && dc !== 0;
          if (isDiag && (p.t === 'b' || p.t === 'q')) return true;
          if (!isDiag && (p.t === 'r' || p.t === 'q')) return true;
          if (dist === 1 && p.t === 'k') return true;
        }
        break;
      }
      nr += dr;
      nc += dc;
      dist++;
    }
  }

  return false;
}

function findKing(b: ChessBoard, isWhite: boolean): [number, number] | null {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (p && p.t === 'k' && p.w === isWhite) return [r, c];
    }
  }
  return null;
}

function getPseudoMoves(b: ChessBoard, r: number, c: number): ChessMove[] {
  const p = b[r][c];
  if (!p) return [];

  const ms: ChessMove[] = [];
  const isW = p.w;

  const add = (tr: number, tc: number, extra?: Partial<ChessMove>): boolean => {
    if (tr < 0 || tr > 7 || tc < 0 || tc > 7) return false;
    const dest = b[tr][tc];
    if (!dest) {
      ms.push({ fr: r, fc: c, tr, tc, ...extra });
      return true;
    }
    if (dest.w !== isW) {
      ms.push({ fr: r, fc: c, tr, tc, ...extra });
    }
    return false;
  };

  if (p.t === 'p') {
    const dir = isW ? -1 : 1;
    const startRow = isW ? 6 : 1;

    // Single push
    if (r + dir >= 0 && r + dir < 8 && !b[r + dir][c]) {
      const isPromo = r + dir === 0 || r + dir === 7;
      ms.push({ fr: r, fc: c, tr: r + dir, tc: c, promo: isPromo ? 'q' : undefined });

      // Double push
      if (r === startRow && !b[r + 2 * dir][c]) {
        ms.push({ fr: r, fc: c, tr: r + 2 * dir, tc: c });
      }
    }

    // Diagonal captures
    for (const dc of [-1, 1]) {
      const tr = r + dir;
      const tc = c + dc;
      if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
        const dest = b[tr][tc];
        if (dest && dest.w !== isW) {
          const isPromo = tr === 0 || tr === 7;
          ms.push({ fr: r, fc: c, tr, tc, promo: isPromo ? 'q' : undefined });
        }
      }
    }
  } else if (p.t === 'n') {
    const knDirs = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1],
    ];
    for (const [dr, dc] of knDirs) add(r + dr, c + dc);
  } else if (p.t === 'k') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        add(r + dr, c + dc);
      }
    }
  } else {
    // Sliding pieces: Rook, Bishop, Queen
    const dirs: [number, number][] = [];
    if (p.t === 'r' || p.t === 'q') {
      dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    }
    if (p.t === 'b' || p.t === 'q') {
      dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    }
    for (const [dr, dc] of dirs) {
      let step = 1;
      while (true) {
        const ok = add(r + dr * step, c + dc * step);
        if (!ok) break;
        step++;
      }
    }
  }

  return ms;
}

function applyChessMove(b: ChessBoard, m: ChessMove): ChessBoard {
  const nb = b.map((row) => [...row]);
  const p = nb[m.fr][m.fc];
  if (!p) return nb;

  nb[m.fr][m.fc] = null;
  if (m.promo) {
    nb[m.tr][m.tc] = { t: m.promo, w: p.w };
  } else {
    nb[m.tr][m.tc] = p;
  }
  return nb;
}

function getLegalChessMoves(b: ChessBoard, isWhite: boolean): ChessMove[] {
  const legal: ChessMove[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (p && p.w === isWhite) {
        const pseudo = getPseudoMoves(b, r, c);
        for (const m of pseudo) {
          const nb = applyChessMove(b, m);
          const king = findKing(nb, isWhite);
          if (king && !isAttacked(nb, king[0], king[1], !isWhite)) {
            legal.push(m);
          }
        }
      }
    }
  }
  return legal;
}

// Bot Board Evaluation
function evaluateBoardForBot(
  b: ChessBoard,
  bot: ChessBotPersonality,
  botIsWhite: boolean
): number {
  let score = 0;
  const pieceVals: Record<PieceType, number> = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000,
  };

  const botKing = findKing(b, botIsWhite);
  const humanKing = findKing(b, !botIsWhite);

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p) continue;

      const baseVal = pieceVals[p.t];
      let positional = 0;

      // Positional tables
      const rowIdx = p.w ? 7 - r : r;
      if (p.t === 'p') {
        positional = PAWN_PST[rowIdx][c];
      } else if (p.t === 'n') {
        positional = KNIGHT_PST[rowIdx][c];
      } else if (p.t === 'b') {
        positional = BISHOP_PST[rowIdx][c];
      } else if (p.t === 'k') {
        positional = KING_PST_MID[rowIdx][c];
      }

      // Center control (e4, d4, e5, d5)
      const isCenter = (r === 3 || r === 4) && (c === 3 || c === 4);
      if (isCenter) {
        positional += 25 * bot.strategy.centerControl;
      }

      // Aggression: bonus for Bot pieces close to Human King
      if (p.w === botIsWhite && humanKing) {
        const dist = Math.abs(r - humanKing[0]) + Math.abs(c - humanKing[1]);
        positional += (14 - dist) * 6 * bot.strategy.aggression;
      }

      const totalVal = baseVal + positional;
      if (p.w === botIsWhite) {
        score += totalVal;
      } else {
        score -= totalVal;
      }
    }
  }

  // King safety evaluation for Bot
  if (botKing) {
    const isBotKingSafe = !isAttacked(b, botKing[0], botKing[1], !botIsWhite);
    if (!isBotKingSafe) {
      score -= 350 * bot.strategy.kingSafety;
    }
  }

  // Checks on Human King
  if (humanKing && isAttacked(b, humanKing[0], humanKing[1], botIsWhite)) {
    score += 150 * bot.strategy.aggression;
  }

  // Capablanca Trade Preference: reward reducing pieces when ahead
  if (score > 150 && bot.strategy.tradePreference > 0) {
    score += 50 * bot.strategy.tradePreference;
  }

  return score;
}

// Alpha-Beta Minimax search
function minimax(
  b: ChessBoard,
  depth: number,
  alpha: number,
  beta: number,
  isBotTurn: boolean,
  bot: ChessBotPersonality,
  botIsWhite: boolean
): number {
  if (depth <= 0) {
    return evaluateBoardForBot(b, bot, botIsWhite);
  }

  const currentTurnWhite = isBotTurn ? botIsWhite : !botIsWhite;
  const moves = getLegalChessMoves(b, currentTurnWhite);
  if (moves.length === 0) {
    const king = findKing(b, currentTurnWhite);
    const inCheck = king ? isAttacked(b, king[0], king[1], !currentTurnWhite) : false;
    if (inCheck) {
      return isBotTurn ? -90000 - depth : 90000 + depth;
    }
    return 0; // Stalemate
  }

  if (isBotTurn) {
    let maxEval = -Infinity;
    for (const m of moves) {
      const nb = applyChessMove(b, m);
      const evalScore = minimax(nb, depth - 1, alpha, beta, false, bot, botIsWhite);
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const m of moves) {
      const nb = applyChessMove(b, m);
      const evalScore = minimax(nb, depth - 1, alpha, beta, true, bot, botIsWhite);
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

interface ChessGameProps {
  user: User;
  onUpdateUser: (updated: User) => void;
  pvpRoom?: Room | null;
}

export const ChessGame: React.FC<ChessGameProps> = ({
  user,
  onUpdateUser,
  pvpRoom,
}) => {
  // Game Setup State (before the game starts)
  // When PvP is active, we bypass setup and start immediately
  const [isGameStarted, setIsGameStarted] = useState<boolean>(() => !!pvpRoom);
  const [selectedBot, setSelectedBot] = useState<ChessBotPersonality>(() => {
    return CHESS_BOTS.find((b) => b.level === 3) || CHESS_BOTS[0];
  });
  const [chosenColor, setChosenColor] = useState<'w' | 'b' | 'random'>('w');
  const [activePlayerColor, setActivePlayerColor] = useState<PieceColor>('w');

  // Active Game State
  const [board, setBoard] = useState<ChessBoard>(initialChessBoard);
  const [turn, setTurn] = useState<PieceColor>('w');
  const [selectedSquare, setSelectedSquare] = useState<[number, number] | null>(null);
  const [validMoves, setValidMoves] = useState<ChessMove[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [gameResult, setGameResult] = useState<'win' | 'loss' | 'draw' | null>(null);
  const [statusMessage, setStatusMessage] = useState('Your turn (White pieces)');

  // Bot in-game dialogue
  const [botQuote, setBotQuote] = useState<string>(() => selectedBot.dialogues.greeting);

  const isPvp = !!pvpRoom && pvpRoom.game === 'chess';
  const myColor: PieceColor = isPvp && Array.isArray(pvpRoom?.seats)
    ? pvpRoom.seats.indexOf(user.uid) === 0
      ? 'w'
      : 'b'
    : activePlayerColor;

  const botColor: PieceColor = myColor === 'w' ? 'b' : 'w';

  // Sync with PvP if active
  useEffect(() => {
    if (pvpRoom && pvpRoom.game === 'chess') {
      setIsGameStarted(true);
      if (pvpRoom.state && Array.isArray(pvpRoom.state.board)) {
        setBoard(pvpRoom.state.board);
        setTurn(pvpRoom.state.turn ?? 'w');
        if (pvpRoom.status === 'done') setGameOver(true);
      } else if (!pvpRoom.state && pvpRoom.host === user.uid) {
        Backend.updateRoom({
          ...pvpRoom,
          state: { board, turn },
          turn: 0,
        });
      }
    }
  }, [pvpRoom]);

  // Start the match from pre-game setup screen
  const handleStartMatch = () => {
    Sound.click();
    let assignedColor: PieceColor = 'w';
    if (chosenColor === 'random') {
      assignedColor = Math.random() < 0.5 ? 'w' : 'b';
    } else {
      assignedColor = chosenColor;
    }

    setActivePlayerColor(assignedColor);
    const freshBoard = initialChessBoard();
    setBoard(freshBoard);
    setTurn('w');
    setSelectedSquare(null);
    setValidMoves([]);
    setGameOver(false);
    setGameResult(null);
    setBotQuote(selectedBot.dialogues.greeting);
    setIsGameStarted(true);

    if (assignedColor === 'w') {
      setStatusMessage('Your turn (White pieces)');
    } else {
      setStatusMessage(`${selectedBot.name}'s turn (White pieces)...`);
      // Bot moves first as White
      setTimeout(() => {
        executeBotMove(freshBoard, true);
      }, 600);
    }
  };

  // Return to Setup Screen (Change Opponent / Level)
  const handleBackToSetup = () => {
    Sound.click();
    setIsGameStarted(false);
    setGameOver(false);
    setGameResult(null);
    setSelectedSquare(null);
    setValidMoves([]);
  };

  // Quick select a level 1-10 on the setup screen
  const handleSelectLevel = (lvl: number) => {
    Sound.click();
    const bot = CHESS_BOTS.find((b) => b.level === lvl);
    if (bot) {
      setSelectedBot(bot);
      setBotQuote(bot.dialogues.greeting);
    }
  };

  // Select an opponent card on the setup screen
  const handleSelectBotCard = (bot: ChessBotPersonality) => {
    Sound.click();
    setSelectedBot(bot);
    setBotQuote(bot.dialogues.greeting);
  };

  // Reset/Rematch with the same opponent
  const handleRematch = () => {
    Sound.click();
    const freshBoard = initialChessBoard();
    setBoard(freshBoard);
    setTurn('w');
    setSelectedSquare(null);
    setValidMoves([]);
    setGameOver(false);
    setGameResult(null);
    setBotQuote(selectedBot.dialogues.greeting);

    if (myColor === 'w') {
      setStatusMessage('Your turn (White pieces)');
    } else {
      setStatusMessage(`${selectedBot.name}'s turn (White pieces)...`);
      setTimeout(() => {
        executeBotMove(freshBoard, true);
      }, 600);
    }
  };

  // Resign match
  const handleResign = () => {
    if (gameOver) return;
    Sound.lose();
    setGameOver(true);
    setGameResult('loss');
    setStatusMessage(`You resigned. ${selectedBot.name} wins.`);
    setBotQuote(selectedBot.dialogues.onWin);
  };

  // Square click during active game
  const handleSquareClick = (r: number, c: number) => {
    if (gameOver || turn !== myColor) return;

    if (selectedSquare) {
      const move = validMoves.find((m) => m.tr === r && m.tc === c);
      if (move) {
        executeMove(move);
        return;
      }
    }

    const p = board[r][c];
    if (p && ((p.w && turn === 'w') || (!p.w && turn === 'b'))) {
      const allMoves = getLegalChessMoves(board, turn === 'w');
      const pieceMoves = allMoves.filter((m) => m.fr === r && m.fc === c);
      setSelectedSquare([r, c]);
      setValidMoves(pieceMoves);
      Sound.click();
    } else {
      setSelectedSquare(null);
      setValidMoves([]);
    }
  };

  // Execute human move
  const executeMove = (m: ChessMove) => {
    const nextBoard = applyChessMove(board, m);
    const nextTurn = turn === 'w' ? 'b' : 'w';

    setBoard(nextBoard);
    setTurn(nextTurn);
    setSelectedSquare(null);
    setValidMoves([]);
    Sound.click();

    // Check checkmate / stalemate for opponent
    const oppMoves = getLegalChessMoves(nextBoard, nextTurn === 'w');
    const oppKing = findKing(nextBoard, nextTurn === 'w');
    const isOppInCheck = oppKing ? isAttacked(nextBoard, oppKing[0], oppKing[1], turn === 'w') : false;

    if (oppMoves.length === 0) {
      setGameOver(true);
      if (isOppInCheck) {
        // Human delivered checkmate!
        const { user: updatedUser } = Backend.recordWin(user, 'chess');
        onUpdateUser(updatedUser);
        setGameResult('win');
        setStatusMessage(`🎉 Checkmate! You defeated ${selectedBot.name}!`);
        setBotQuote(selectedBot.dialogues.onDefeat);
      } else {
        // Stalemate
        setGameResult('draw');
        setStatusMessage('Stalemate! The game ends in a draw.');
        setBotQuote('A dead draw! Perfectly balanced.');
      }

      if (pvpRoom) {
        Backend.updateRoom({
          ...pvpRoom,
          state: { board: nextBoard, turn: nextTurn },
          status: 'done',
        });
      }
      return;
    }

    if (isOppInCheck) {
      setStatusMessage('Check! Protect the King.');
      if (selectedBot.dialogues.onLosing.length > 0) {
        const quote = selectedBot.dialogues.onLosing[Math.floor(Math.random() * selectedBot.dialogues.onLosing.length)];
        setBotQuote(quote);
      }
    } else {
      setStatusMessage(nextTurn === myColor ? 'Your turn' : `${selectedBot.name}'s turn...`);
    }

    if (pvpRoom) {
      Backend.updateRoom({
        ...pvpRoom,
        state: { board: nextBoard, turn: nextTurn },
        turn: pvpRoom.seats.indexOf(user.uid) === 0 ? 1 : 0,
      });
    } else if (nextTurn === botColor) {
      // Trigger bot move
      setTimeout(() => {
        executeBotMove(nextBoard, botColor === 'w');
      }, 550);
    }
  };

  // Execute bot move
  const executeBotMove = (curBoard: ChessBoard, botIsWhite: boolean) => {
    const moves = getLegalChessMoves(curBoard, botIsWhite);
    if (moves.length === 0) {
      setGameOver(true);
      const { user: updatedUser } = Backend.recordWin(user, 'chess');
      onUpdateUser(updatedUser);
      setGameResult('win');
      setStatusMessage(`🎉 Checkmate! You defeated ${selectedBot.name}!`);
      setBotQuote(selectedBot.dialogues.onDefeat);
      return;
    }

    let chosenMove: ChessMove;
    const isBlunder = Math.random() < selectedBot.strategy.blunderChance;

    if (isBlunder && moves.length > 1) {
      const randIdx = Math.floor(Math.random() * moves.length);
      chosenMove = moves[randIdx];
    } else {
      const depth = Math.min(selectedBot.strategy.depth, 3);
      let bestScore = -Infinity;
      let candidates: { move: ChessMove; score: number }[] = [];

      for (const m of moves) {
        const nextBoard = applyChessMove(curBoard, m);
        let moveScore = minimax(
          nextBoard,
          depth - 1,
          -Infinity,
          Infinity,
          false,
          selectedBot,
          botIsWhite
        );

        if (selectedBot.strategy.randomJitter > 0) {
          moveScore += (Math.random() - 0.5) * selectedBot.strategy.randomJitter;
        }

        const humanKing = findKing(nextBoard, !botIsWhite);
        if (humanKing && isAttacked(nextBoard, humanKing[0], humanKing[1], botIsWhite)) {
          moveScore += 180 * selectedBot.strategy.aggression;
        }

        candidates.push({ move: m, score: moveScore });
        if (moveScore > bestScore) {
          bestScore = moveScore;
        }
      }

      const threshold = selectedBot.level >= 9 ? 5 : 25;
      const topMoves = candidates.filter((c) => c.score >= bestScore - threshold);
      chosenMove = topMoves[Math.floor(Math.random() * topMoves.length)]?.move || moves[0];
    }

    const wasCapture = !!curBoard[chosenMove.tr][chosenMove.tc];
    const nextBoard = applyChessMove(curBoard, chosenMove);
    const nextTurn = botIsWhite ? 'b' : 'w';

    setBoard(nextBoard);
    setTurn(nextTurn);
    Sound.click();

    const humanMoves = getLegalChessMoves(nextBoard, !botIsWhite);
    const humanKing = findKing(nextBoard, !botIsWhite);
    const isHumanCheck = humanKing ? isAttacked(nextBoard, humanKing[0], humanKing[1], botIsWhite) : false;

    // Pick dynamic quote
    if (isHumanCheck && selectedBot.dialogues.onCheck.length > 0) {
      const q = selectedBot.dialogues.onCheck[Math.floor(Math.random() * selectedBot.dialogues.onCheck.length)];
      setBotQuote(q);
    } else if (wasCapture && selectedBot.dialogues.onCapture.length > 0) {
      const q = selectedBot.dialogues.onCapture[Math.floor(Math.random() * selectedBot.dialogues.onCapture.length)];
      setBotQuote(q);
    } else if (selectedBot.dialogues.onMove.length > 0) {
      const q = selectedBot.dialogues.onMove[Math.floor(Math.random() * selectedBot.dialogues.onMove.length)];
      setBotQuote(q);
    }

    if (humanMoves.length === 0) {
      setGameOver(true);
      if (isHumanCheck) {
        Sound.lose();
        setGameResult('loss');
        setStatusMessage(`Checkmate. ${selectedBot.name} wins the match.`);
        setBotQuote(selectedBot.dialogues.onWin);
      } else {
        setGameResult('draw');
        setStatusMessage('Stalemate. Draw.');
      }
    } else if (isHumanCheck) {
      setStatusMessage('⚠️ Check! Your King is under attack.');
    } else {
      setStatusMessage('Your turn');
    }
  };

  const oppUid = pvpRoom && Array.isArray(pvpRoom.seats) ? pvpRoom.seats.find((s) => s !== user.uid) : null;
  const oppName = oppUid ? pvpRoom?.names?.[oppUid] || 'Opponent' : selectedBot.name;
  const isOppRobot = !pvpRoom;

  // =========================================================================
  // PRE-GAME SELECTION SCREEN (Shown BEFORE the chess game starts)
  // =========================================================================
  if (!isGameStarted && !pvpRoom) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 select-none animate-in fade-in duration-200">
        {/* Header Banner */}
        <div className="bg-linear-to-r from-amber-950/60 via-slate-900 to-amber-950/60 border border-amber-500/30 rounded-2xl p-4 md:p-5 shadow-xl text-center relative overflow-hidden">
          <div className="relative z-10 space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold tracking-wide uppercase">
              <Swords className="w-3.5 h-3.5" />
              <span>Match Setup</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
              Choose Difficulty & Opponent
            </h2>
            <p className="text-xs md:text-sm text-slate-300 max-w-lg mx-auto">
              Select a skill level (1–10) or choose a chess master robot before starting your game.
              Each opponent features their real-world strategy, ELO rating, and playing style.
            </p>
          </div>
        </div>

        {/* SECTION 1: SKILL LEVEL SELECTOR (1 - 10) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-amber-400" />
              <span className="text-xs md:text-sm font-bold text-white">Select Skill Level (1 – 10)</span>
            </div>
            <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
              Level {selectedBot.level}: {selectedBot.elo} ELO
            </span>
          </div>

          {/* Quick Level 1 - 10 Buttons */}
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
            {CHESS_BOTS.map((bot) => {
              const isSelected = selectedBot.level === bot.level;
              return (
                <div
                  key={bot.level}
                  onClick={() => handleSelectLevel(bot.level)}
                  className={`p-2 rounded-xl text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center gap-0.5 border ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 font-black border-amber-300 shadow-md shadow-amber-400/20 scale-105 ring-2 ring-amber-300'
                      : 'bg-slate-950/80 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
                  }`}
                  role="button"
                  tabIndex={0}
                  title={`Level ${bot.level}: ${bot.name} (${bot.elo} ELO)`}
                >
                  <span className="text-sm font-extrabold">{bot.level}</span>
                  <span className={`text-[10px] font-mono leading-none ${isSelected ? 'text-slate-900 font-bold' : 'text-slate-400'}`}>
                    {bot.elo}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Skill Tier Helper Guide */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] text-slate-400">
            <div className="bg-slate-950/60 rounded-lg p-2 border border-slate-800/80">
              <div className="font-bold text-emerald-400">Levels 1–3</div>
              <div className="text-[10px]">Beginner & Casual (600–1200)</div>
            </div>
            <div className="bg-slate-950/60 rounded-lg p-2 border border-slate-800/80">
              <div className="font-bold text-blue-400">Levels 4–6</div>
              <div className="text-[10px]">Tactical & Sharp (1500–2050)</div>
            </div>
            <div className="bg-slate-950/60 rounded-lg p-2 border border-slate-800/80">
              <div className="font-bold text-amber-400">Levels 7–8</div>
              <div className="text-[10px]">Master Attack (2250–2450)</div>
            </div>
            <div className="bg-slate-950/60 rounded-lg p-2 border border-slate-800/80">
              <div className="font-bold text-purple-400">Levels 9–10</div>
              <div className="text-[10px]">Grandmaster King (2650–2850)</div>
            </div>
          </div>
        </div>

        {/* SECTION 2: CURRENT SELECTED OPPONENT SPOTLIGHT CARD */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 border-2 border-amber-500/40 rounded-2xl p-4 md:p-5 shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            {/* Big Avatar */}
            <div className="relative shrink-0">
              <div className="w-20 h-20 rounded-2xl bg-linear-to-tr from-amber-600 via-indigo-600 to-amber-400 p-1 shadow-xl flex items-center justify-center">
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
                  {selectedBot.strategy.aggression >= 2 ? 'Fierce Attack' : selectedBot.strategy.aggression >= 1.2 ? 'Active' : 'Solid'}
                </div>
              </div>
            </div>
            <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800/80 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-400">King Safety</div>
                <div className="font-bold text-white">
                  {selectedBot.strategy.kingSafety >= 2 ? 'Fortress' : selectedBot.strategy.kingSafety >= 1 ? 'Careful' : 'Romantic'}
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
            <div className="text-xs md:text-sm font-bold text-white">Choose Your Color</div>
            <div className="text-[11px] text-slate-400">White moves first; Black responds to opponent</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                Sound.click();
                setChosenColor('w');
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                chosenColor === 'w'
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md ring-2 ring-amber-300 font-extrabold'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span className="text-lg leading-none">♔</span>
              <span>White (1st)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                Sound.click();
                setChosenColor('b');
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                chosenColor === 'b'
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md ring-2 ring-amber-300 font-extrabold'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span className="text-lg leading-none">♚</span>
              <span>Black (2nd)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                Sound.click();
                setChosenColor('random');
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
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
            <span>Start Game vs {selectedBot.name} (Lvl {selectedBot.level})</span>
          </button>
        </div>

        {/* SECTION 5: FULL OPPONENT ROSTER GALLERY */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs md:text-sm font-bold text-white">
              Or Choose Any Chess Opponent
            </span>
            <span className="text-[11px] text-slate-400">
              Click any opponent card to select
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
            {ALL_CHESS_PLAYERS.map((bot) => {
              const isSelected = selectedBot.id === bot.id;
              return (
                <div
                  key={bot.id}
                  onClick={() => handleSelectBotCard(bot)}
                  role="button"
                  tabIndex={0}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                    isSelected
                      ? 'bg-amber-950/50 border-amber-400 shadow-md ring-1 ring-amber-400'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-amber-600 to-indigo-600 p-0.5 shadow-sm flex items-center justify-center text-xl shrink-0">
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
                    <span className="bg-amber-400 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0">
                      Active
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ACTIVE CHESS MATCH SCREEN (Shown during the game)
  // No skill level selector or opponent switcher bar shown during the game!
  // =========================================================================
  return (
    <div className="max-w-md mx-auto space-y-3 select-none animate-in fade-in duration-150">
      {/* Top HUD with Opponent Info (PvP or Robot) */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl px-3.5 py-2.5 text-xs shadow-md">
        <div className="flex items-center gap-2.5">
          {isOppRobot ? (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-linear-to-tr from-amber-600 to-indigo-600 p-0.5 shadow-sm">
                <div className="w-full h-full bg-slate-950 rounded-full flex items-center justify-center text-base">
                  {selectedBot.avatar}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-bold text-white text-xs">
                  <span>{selectedBot.name}</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1 rounded-sm font-mono font-bold">
                    Lvl {selectedBot.level}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">({selectedBot.elo})</span>
                </div>
                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                  <span>{botColor === 'w' ? 'White Pieces (Moves 1st)' : 'Black Pieces'}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-amber-400/90 truncate max-w-[120px]">{selectedBot.style}</span>
                </div>
              </div>
            </div>
          ) : (
            <PlayerBadge
              name={oppName}
              subtitle={myColor === 'w' ? 'Black Pieces' : 'White Pieces'}
              isTurn={turn !== myColor}
              size="sm"
            />
          )}
        </div>

        {/* Turn Status indicator & Change Opponent Button */}
        <div className="flex items-center gap-2 text-right">
          <div>
            <span
              className={`text-[11px] font-black block ${
                turn === myColor ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {turn === myColor ? 'YOUR TURN' : `${selectedBot.name.toUpperCase()}'S TURN`}
            </span>
            {pvpRoom && (
              <span className="text-[10px] text-slate-500">Room #{pvpRoom.code}</span>
            )}
          </div>

          {!pvpRoom && (
            <button
              type="button"
              onClick={handleBackToSetup}
              title="Change opponent or skill level before starting a new game"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-amber-400" />
              <span className="hidden sm:inline">Change</span>
            </button>
          )}
        </div>
      </div>

      {/* Opponent Real-time Reaction Speech Bubble (Single player) */}
      {!pvpRoom && (
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl px-3 py-1.5 text-[11px] text-amber-200/90 italic flex items-center gap-2 shadow-inner">
          <MessageSquare className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate">
            <strong>{selectedBot.name}:</strong> "{botQuote}"
          </span>
        </div>
      )}

      {/* CHESS BOARD CARD - GUARANTEED SQUARE GRID NEVER TURNING INTO RECTANGLES */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-2xl flex flex-col items-center">
        <div className="text-xs font-bold text-amber-400 mb-2 flex items-center justify-between w-full px-1">
          <span>{statusMessage}</span>
          {!pvpRoom && !gameOver && (
            <button
              type="button"
              onClick={handleResign}
              className="text-[10px] font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
            >
              <Flag className="w-3 h-3" />
              <span>Resign</span>
            </button>
          )}
        </div>

        {/* 
          CHESS BOARD WRAPPER:
          Strict 1:1 aspect ratio grid container with repeat(8, minmax(0, 1fr)) and absolute piece overlays
          so that squares NEVER deform into rectangles when pieces move or empty out!
        */}
        <div
          className="w-full max-w-[360px] aspect-square mx-auto p-1.5 rounded-2xl bg-amber-950/70 border-2 border-amber-800/80 shadow-[0_10px_25px_rgba(0,0,0,0.8)]"
          style={{ aspectRatio: '1 / 1' }}
        >
          <div
            className="w-full h-full aspect-square grid grid-cols-8 grid-rows-8 gap-0.5 bg-slate-950 p-1 rounded-xl"
            style={{
              aspectRatio: '1 / 1',
              display: 'grid',
              gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
              gridTemplateRows: 'repeat(8, minmax(0, 1fr))',
            }}
          >
            {board.map((row, r) =>
              row.map((cell, c) => {
                const isDark = (r + c) % 2 === 1;
                const isSelected = selectedSquare && selectedSquare[0] === r && selectedSquare[1] === c;
                const isTarget = validMoves.some((m) => m.tr === r && m.tc === c);

                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    onClick={() => handleSquareClick(r, c)}
                    className={`relative w-full h-full aspect-square min-w-0 min-h-0 p-0 overflow-hidden rounded-xs flex items-center justify-center select-none transition-all cursor-pointer ${
                      isDark ? 'bg-amber-900/60 hover:bg-amber-800/70' : 'bg-amber-100/75 hover:bg-amber-200/90'
                    } ${isSelected ? 'ring-2 ring-amber-400 z-10' : ''}`}
                    style={{ aspectRatio: '1 / 1' }}
                  >
                    {/* Target move indicator dot */}
                    {isTarget && (
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/90 absolute z-20 pointer-events-none shadow-sm" />
                    )}

                    {/* Chess piece: positioned absolutely so it has 0 impact on square dimensions */}
                    {cell && (
                      <span
                        className={`absolute inset-0 flex items-center justify-center text-2xl md:text-3xl font-normal leading-none select-none pointer-events-none transition-transform duration-100 ${
                          cell.w ? 'text-amber-100' : 'text-slate-950'
                        } ${isSelected ? 'scale-110 z-10' : ''}`}
                        style={
                          cell.w
                            ? {
                                // White pieces: crisp 3D drop shadow
                                filter:
                                  'drop-shadow(0 2px 2px rgba(0,0,0,0.85)) drop-shadow(0 4px 5px rgba(0,0,0,0.5))',
                              }
                            : {
                                // Black pieces: crisp white outline + drop shadow
                                WebkitTextStroke: '1.2px #ffffff',
                                paintOrder: 'stroke fill',
                                textShadow:
                                  '-1px -1px 0 #ffffff, 1px -1px 0 #ffffff, -1px 1px 0 #ffffff, 1px 1px 0 #ffffff, 0 -1px 0 #ffffff, 0 1px 0 #ffffff, -1px 0 0 #ffffff, 1px 0 0 #ffffff',
                                filter:
                                  'drop-shadow(0 2px 2px rgba(0,0,0,0.95)) drop-shadow(0 4px 6px rgba(0,0,0,0.55))',
                              }
                        }
                      >
                        {CHESS_SYMBOLS[cell.t][cell.w ? 1 : 0]}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Player Badge (Bottom) */}
        <div className="w-full flex items-center justify-between pt-2.5 mt-2 border-t border-slate-800/80 px-1">
          <PlayerBadge
            name={user.username}
            avatar={user.avatar}
            subtitle={myColor === 'w' ? 'White Pieces (You)' : 'Black Pieces (You)'}
            isTurn={turn === myColor}
            size="sm"
          />
          <div className="flex items-center gap-2">
            {!pvpRoom && (
              <button
                type="button"
                onClick={handleRematch}
                className="text-[11px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700/80 cursor-pointer"
                title="Restart match vs current opponent"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Restart</span>
              </button>
            )}
            <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
              {myColor === 'w' ? (
                <>
                  <span className="text-amber-100 text-sm filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">♔</span>
                  <span>White</span>
                </>
              ) : (
                <>
                  <span
                    className="text-slate-950 text-sm"
                    style={{
                      WebkitTextStroke: '1px #ffffff',
                      paintOrder: 'stroke fill',
                      textShadow: '-0.8px -0.8px 0 #fff, 0.8px -0.8px 0 #fff, -0.8px 0.8px 0 #fff, 0.8px 0.8px 0 #fff',
                      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.85))',
                    }}
                  >
                    ♚
                  </span>
                  <span>Black</span>
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* GAME OVER BANNER & ACTION CONTROLS */}
      {gameOver && !pvpRoom && (
        <div className="bg-slate-900 border-2 border-amber-500/50 rounded-2xl p-4 shadow-xl space-y-3 text-center animate-in zoom-in-95 duration-200">
          <div className="space-y-1">
            <h4 className="font-black text-base text-white">
              {gameResult === 'win'
                ? `🏆 Victory against ${selectedBot.name}!`
                : gameResult === 'loss'
                ? `${selectedBot.name} Won the Match`
                : 'Match Ended in a Draw'}
            </h4>
            <p className="text-xs text-amber-300 italic">"{botQuote}"</p>
          </div>

          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleRematch}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Play Rematch</span>
            </button>
            <button
              type="button"
              onClick={handleBackToSetup}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Change Opponent & Level</span>
            </button>
          </div>
        </div>
      )}

      {pvpRoom && <ChatBox channel={`room_${pvpRoom.code}`} currentUser={user} />}
    </div>
  );
};
