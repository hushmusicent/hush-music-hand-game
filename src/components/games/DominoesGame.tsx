import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  RotateCcw,
  Sparkles,
  Trophy,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  HelpCircle,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crosshair,
} from 'lucide-react';
import { User, Room } from '../../types';
import { Backend } from '../../utils/backend';
import { Sound } from '../../utils/sound';
import { ChatBox } from '../ChatBox';
import { PlayerBadge } from '../PlayerBadge';
import { DominoTile } from '../DominoTile';

export type Tile = [number, number];
export type BranchDirection = 'left' | 'right' | 'top' | 'bottom';

export interface BranchTile {
  inner: number; // touches towards center
  outer: number; // faces towards table end
  isDouble: boolean;
  playedBy: number;
}

export interface SpinnerInfo {
  tile: Tile;
  playedBy: number;
  unlocked: boolean; // unlocked for top/bottom once left & right have >= 1 tile
}

export interface DominoesGameState {
  hands: [Tile[], Tile[]];
  boneyard: Tile[];
  centerTile: Tile | null; // first tile played (if double, it is also spinner)
  spinner: SpinnerInfo | null;
  branches: {
    left: BranchTile[];
    right: BranchTile[];
    top: BranchTile[];
    bottom: BranchTile[];
  };
  turn: number; // 0 = Player, 1 = Computer
  passes: number;
  scores: [number, number]; // cumulative match scores (race to 250)
  round: number;
  handOver: boolean;
  matchOver: boolean;
  matchWinner: number | null;
  lastScoreEvent: {
    player: number;
    points: number;
    endsSum: number;
    reason: string;
  } | null;
}

const TARGET_SCORE = 250;

function createDominoesSet(): Tile[] {
  const set: Tile[] = [];
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      set.push([a, b]);
    }
  }
  // Shuffle
  for (let i = set.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [set[i], set[j]] = [set[j], set[i]];
  }
  return set;
}

function initNewHand(existingScores: [number, number] = [0, 0], roundNum = 1): DominoesGameState {
  const deck = createDominoesSet();
  const hand0 = deck.slice(0, 7);
  const hand1 = deck.slice(7, 14);
  const boneyard = deck.slice(14); // 14 tiles in boneyard

  return {
    hands: [hand0, hand1],
    boneyard,
    centerTile: null,
    spinner: null,
    branches: {
      left: [],
      right: [],
      top: [],
      bottom: [],
    },
    turn: 0,
    passes: 0,
    scores: existingScores,
    round: roundNum,
    handOver: false,
    matchOver: false,
    matchWinner: null,
    lastScoreEvent: null,
  };
}

export interface ActiveEnd {
  direction: BranchDirection;
  pip: number;
  isDoubleEnd: boolean;
  pointsValue: number;
}

function getActiveEnds(state: DominoesGameState): ActiveEnd[] {
  if (!state.centerTile) return [];

  // Case 1: Only the center tile is on the board
  if (
    state.branches.left.length === 0 &&
    state.branches.right.length === 0 &&
    state.branches.top.length === 0 &&
    state.branches.bottom.length === 0
  ) {
    const [c1, c2] = state.centerTile;
    const isDouble = c1 === c2;
    return [
      {
        direction: 'left',
        pip: c1,
        isDoubleEnd: isDouble,
        pointsValue: c1,
      },
      {
        direction: 'right',
        pip: c2,
        isDoubleEnd: isDouble,
        pointsValue: c2,
      },
    ];
  }

  const ends: ActiveEnd[] = [];

  // Left branch end
  if (state.branches.left.length > 0) {
    const last = state.branches.left[state.branches.left.length - 1];
    ends.push({
      direction: 'left',
      pip: last.outer,
      isDoubleEnd: last.isDouble,
      pointsValue: last.isDouble ? last.outer * 2 : last.outer,
    });
  } else {
    // Open left side of center tile
    ends.push({
      direction: 'left',
      pip: state.centerTile[0],
      isDoubleEnd: state.centerTile[0] === state.centerTile[1],
      pointsValue: state.centerTile[0],
    });
  }

  // Right branch end
  if (state.branches.right.length > 0) {
    const last = state.branches.right[state.branches.right.length - 1];
    ends.push({
      direction: 'right',
      pip: last.outer,
      isDoubleEnd: last.isDouble,
      pointsValue: last.isDouble ? last.outer * 2 : last.outer,
    });
  } else {
    // Open right side of center tile
    ends.push({
      direction: 'right',
      pip: state.centerTile[1],
      isDoubleEnd: state.centerTile[0] === state.centerTile[1],
      pointsValue: state.centerTile[1],
    });
  }

  // Spinner Top & Bottom branches (available once unlocked)
  if (state.spinner && state.spinner.unlocked) {
    const spinnerPip = state.spinner.tile[0];

    // Top branch
    if (state.branches.top.length > 0) {
      const last = state.branches.top[state.branches.top.length - 1];
      ends.push({
        direction: 'top',
        pip: last.outer,
        isDoubleEnd: last.isDouble,
        pointsValue: last.isDouble ? last.outer * 2 : last.outer,
      });
    } else {
      ends.push({
        direction: 'top',
        pip: spinnerPip,
        isDoubleEnd: false,
        pointsValue: spinnerPip,
      });
    }

    // Bottom branch
    if (state.branches.bottom.length > 0) {
      const last = state.branches.bottom[state.branches.bottom.length - 1];
      ends.push({
        direction: 'bottom',
        pip: last.outer,
        isDoubleEnd: last.isDouble,
        pointsValue: last.isDouble ? last.outer * 2 : last.outer,
      });
    } else {
      ends.push({
        direction: 'bottom',
        pip: spinnerPip,
        isDoubleEnd: false,
        pointsValue: spinnerPip,
      });
    }
  }

  return ends;
}

function calculateEndsSum(ends: ActiveEnd[]): number {
  if (ends.length === 0) return 0;
  // Single double tile on table counts as both ends (2 * pip)
  if (ends.length === 2 && ends[0].direction === 'left' && ends[1].direction === 'right') {
    if (ends[0].isDoubleEnd && ends[1].isDoubleEnd && ends[0].pip === ends[1].pip) {
      return ends[0].pip * 2;
    }
  }
  return ends.reduce((sum, e) => sum + e.pointsValue, 0);
}

function getPlayableMovesForTile(tile: Tile, state: DominoesGameState): BranchDirection[] {
  if (!state.centerTile) {
    return ['left']; // any tile can open the table
  }
  const ends = getActiveEnds(state);
  const playableDirs: BranchDirection[] = [];

  for (const end of ends) {
    if (tile[0] === end.pip || tile[1] === end.pip) {
      if (!playableDirs.includes(end.direction)) {
        playableDirs.push(end.direction);
      }
    }
  }
  return playableDirs;
}

function countPips(hand: Tile[]): number {
  return hand.reduce((acc, t) => acc + t[0] + t[1], 0);
}

// Pure authoritative move executor: NEVER throws undefined errors
function executeMove(
  currentState: DominoesGameState,
  playerSeat: number,
  tileIdx: number,
  direction: BranchDirection
): { nextState: DominoesGameState; pointsScored: number; scoreReason: string } | null {
  const currentHand = currentState.hands[playerSeat];
  if (!currentHand || tileIdx < 0 || tileIdx >= currentHand.length) {
    return null;
  }

  const tileToPlay = currentHand[tileIdx];
  if (!tileToPlay) return null;

  const hands: [Tile[], Tile[]] = [
    currentState.hands[0].slice(),
    currentState.hands[1].slice(),
  ];
  const played = hands[playerSeat].splice(tileIdx, 1)[0];
  if (!played) return null;

  const isDouble = played[0] === played[1];

  let nextCenter = currentState.centerTile;
  let nextSpinner = currentState.spinner ? { ...currentState.spinner } : null;

  const nextBranches = {
    left: [...currentState.branches.left],
    right: [...currentState.branches.right],
    top: [...currentState.branches.top],
    bottom: [...currentState.branches.bottom],
  };

  // Case 1: First tile placed on board
  if (!currentState.centerTile) {
    nextCenter = played;
    if (isDouble) {
      nextSpinner = {
        tile: played,
        playedBy: playerSeat,
        unlocked: false,
      };
    }
  } else {
    // Find target open end for this direction
    const ends = getActiveEnds(currentState);
    const targetEnd = ends.find((e) => e.direction === direction);
    if (!targetEnd) return null;

    const touchingVal = targetEnd.pip;
    let outerVal: number;
    if (played[0] === touchingVal) {
      outerVal = played[1];
    } else if (played[1] === touchingVal) {
      outerVal = played[0];
    } else {
      // Tile doesn't match target end pip
      return null;
    }

    const newBranchTile: BranchTile = {
      inner: touchingVal,
      outer: outerVal,
      isDouble,
      playedBy: playerSeat,
    };
    nextBranches[direction].push(newBranchTile);

    // If first double played, it becomes the Spinner
    if (isDouble && !nextSpinner) {
      nextSpinner = {
        tile: played,
        playedBy: playerSeat,
        unlocked: false,
      };
    }

    // Check if spinner is now unlocked (left & right branches both have at least 1 tile)
    if (nextSpinner && !nextSpinner.unlocked) {
      if (nextBranches.left.length >= 1 && nextBranches.right.length >= 1) {
        nextSpinner.unlocked = true;
      }
    }
  }

  // Calculate All Fives score on newly exposed ends
  const tempState: DominoesGameState = {
    ...currentState,
    hands,
    centerTile: nextCenter,
    spinner: nextSpinner,
    branches: nextBranches,
  };

  const newEnds = getActiveEnds(tempState);
  const newEndsSum = calculateEndsSum(newEnds);

  let pointsScored = 0;
  let scoreReason = '';

  if (newEndsSum > 0 && newEndsSum % 5 === 0) {
    pointsScored = newEndsSum;
    scoreReason = `All Fives! Table ends sum is ${newEndsSum} (+${pointsScored} pts)`;
  }

  const nextScores: [number, number] = [currentState.scores[0], currentState.scores[1]];
  if (pointsScored > 0) {
    nextScores[playerSeat] += pointsScored;
  }

  // Check if player won the match by reaching 250 points
  if (nextScores[playerSeat] >= TARGET_SCORE) {
    return {
      nextState: {
        ...tempState,
        scores: nextScores,
        handOver: true,
        matchOver: true,
        matchWinner: playerSeat,
        lastScoreEvent: pointsScored > 0 ? {
          player: playerSeat,
          points: pointsScored,
          endsSum: newEndsSum,
          reason: scoreReason,
        } : null,
      },
      pointsScored,
      scoreReason,
    };
  }

  // Check if hand is won by domino (emptying rack)
  if (hands[playerSeat].length === 0) {
    const oppSeat = playerSeat === 0 ? 1 : 0;
    const oppPips = countPips(hands[oppSeat]);
    const bonusPoints = Math.max(5, Math.round(oppPips / 5) * 5);
    nextScores[playerSeat] += bonusPoints;
    const isMatchWinner = nextScores[playerSeat] >= TARGET_SCORE;

    return {
      nextState: {
        ...tempState,
        scores: nextScores,
        handOver: true,
        matchOver: isMatchWinner,
        matchWinner: isMatchWinner ? playerSeat : null,
        lastScoreEvent: {
          player: playerSeat,
          points: pointsScored + bonusPoints,
          endsSum: newEndsSum,
          reason: `Domino! Emptied rack (+${bonusPoints} pts)${pointsScored > 0 ? ` and All Fives (+${pointsScored} pts)` : ''}`,
        },
      },
      pointsScored,
      scoreReason,
    };
  }

  const nextTurn = playerSeat === 0 ? 1 : 0;
  return {
    nextState: {
      ...tempState,
      scores: nextScores,
      turn: nextTurn,
      passes: 0,
      lastScoreEvent: pointsScored > 0 ? {
        player: playerSeat,
        points: pointsScored,
        endsSum: newEndsSum,
        reason: scoreReason,
      } : null,
    },
    pointsScored,
    scoreReason,
  };
}

interface DominoesGameProps {
  user: User;
  onUpdateUser: (updated: User) => void;
  pvpRoom?: Room | null;
}

export const DominoesGame: React.FC<DominoesGameProps> = ({
  user,
  onUpdateUser,
  pvpRoom,
}) => {
  const [state, setState] = useState<DominoesGameState>(() => initNewHand([0, 0], 1));
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [message, setMessage] = useState('Your turn — select a domino from your rack or draw from boneyard.');
  const [showScoreFlash, setShowScoreFlash] = useState<number | null>(null);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);

  // Dynamic Table Zoom & Scale State
  const [isAutoFit, setIsAutoFit] = useState(true);
  const [manualZoom, setManualZoom] = useState(1.0);
  const [containerWidth, setContainerWidth] = useState<number>(750);
  const [isDragging, setIsDragging] = useState(false);

  const boardScrollRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number }>({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const botTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const rawSeat = pvpRoom ? pvpRoom.seats.indexOf(user.uid) : 0;
  const mySeat = rawSeat >= 0 ? rawSeat : (pvpRoom && pvpRoom.host === user.uid ? 0 : 1);
  const isMyTurn = !state.handOver && !state.matchOver && state.turn === mySeat;

  // Track container width for dynamic auto-fit
  useEffect(() => {
    const updateSize = () => {
      if (boardScrollRef.current) {
        setContainerWidth(boardScrollRef.current.clientWidth || 750);
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (pvpRoom && pvpRoom.state) {
      setState(pvpRoom.state);
    } else if (pvpRoom && !pvpRoom.state && pvpRoom.host === user.uid) {
      Backend.updateRoom({
        ...pvpRoom,
        state,
        turn: state.turn,
      });
    }
  }, [pvpRoom]);

  // Flash score banner when points by 5s are made
  useEffect(() => {
    if (state.lastScoreEvent && state.lastScoreEvent.points > 0) {
      setShowScoreFlash(state.lastScoreEvent.points);
      const timer = setTimeout(() => setShowScoreFlash(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [state.lastScoreEvent]);

  // Auto-centering helper
  const centerTable = () => {
    if (boardScrollRef.current) {
      boardScrollRef.current.scrollTo({
        left: Math.max(0, (boardScrollRef.current.scrollWidth - boardScrollRef.current.clientWidth) / 2),
        top: Math.max(0, (boardScrollRef.current.scrollHeight - boardScrollRef.current.clientHeight) / 2),
        behavior: 'smooth',
      });
    }
  };

  const jumpToDirection = (dir: BranchDirection) => {
    if (!boardScrollRef.current) return;
    if (dir === 'left') {
      boardScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    } else if (dir === 'right') {
      boardScrollRef.current.scrollTo({
        left: boardScrollRef.current.scrollWidth - boardScrollRef.current.clientWidth,
        behavior: 'smooth',
      });
    } else if (dir === 'top') {
      boardScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (dir === 'bottom') {
      boardScrollRef.current.scrollTo({
        top: boardScrollRef.current.scrollHeight - boardScrollRef.current.clientHeight,
        behavior: 'smooth',
      });
    }
  };

  // Drag-to-pan handlers on table felt
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!boardScrollRef.current) return;
    // Don't drag if clicking buttons or clickable tiles
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;

    setIsDragging(true);
    dragStartRef.current = {
      x: e.pageX,
      y: e.pageY,
      scrollLeft: boardScrollRef.current.scrollLeft,
      scrollTop: boardScrollRef.current.scrollTop,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !boardScrollRef.current) return;
    e.preventDefault();
    const dx = e.pageX - dragStartRef.current.x;
    const dy = e.pageY - dragStartRef.current.y;
    boardScrollRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx;
    boardScrollRef.current.scrollTop = dragStartRef.current.scrollTop - dy;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Calculate Auto-Fit Scale: As branches grow longer, dynamically scale so ALL tiles stay visible!
  const totalHorizontalTiles = state.branches.left.length + state.branches.right.length + 1;
  const totalVerticalTiles = state.branches.top.length + state.branches.bottom.length + 1;
  const maxSpan = Math.max(totalHorizontalTiles, totalVerticalTiles);

  const autoScale = useMemo(() => {
    // Estimate width of domino train (each domino ~50px wide + buttons)
    const estChainWidth = Math.max(320, totalHorizontalTiles * 52 + 160);
    const fitFactor = (containerWidth - 36) / estChainWidth;
    // Bound scale between 0.30 and 1.0
    return Math.max(0.30, Math.min(1.0, Number(fitFactor.toFixed(2))));
  }, [totalHorizontalTiles, containerWidth]);

  const effectiveScale = isAutoFit ? autoScale : manualZoom;

  // Auto-center board layout when tiles change
  useEffect(() => {
    centerTable();
  }, [
    state.branches.left.length,
    state.branches.right.length,
    state.branches.top.length,
    state.branches.bottom.length,
    effectiveScale,
  ]);

  const activeEnds = getActiveEnds(state);
  const currentEndsSum = calculateEndsSum(activeEnds);

  const handleTileSelect = (idx: number) => {
    if (!isMyTurn || state.handOver || state.matchOver) return;
    const currentHand = state.hands[mySeat];
    if (!currentHand || idx < 0 || idx >= currentHand.length) return;
    const tile = currentHand[idx];
    if (!tile) return;

    const playableDirs = getPlayableMovesForTile(tile, state);

    if (playableDirs.length === 0) {
      Sound.lose();
      setMessage("This domino doesn't match any exposed open ends. Draw from boneyard!");
      return;
    }

    if (playableDirs.length === 1) {
      playHumanTile(idx, playableDirs[0]);
    } else {
      setSelectedIdx(idx);
      Sound.click();
      setMessage(`Matches multiple open ends! Tap a target on table or the Open Ends bar.`);
    }
  };

  const playHumanTile = (tileIdx: number, direction: BranchDirection) => {
    if (!isMyTurn || state.handOver || state.matchOver) return;

    const result = executeMove(state, mySeat, tileIdx, direction);
    if (!result) return;

    Sound.dominoClack();
    if (result.pointsScored >= 15) {
      Sound.win();
    } else if (result.pointsScored > 0) {
      Sound.chipBet();
    }

    setSelectedIdx(null);
    const { nextState } = result;

    if (nextState.matchOver) {
      if (nextState.matchWinner === mySeat) {
        const { user: updatedUser } = Backend.recordWin(user, 'dominoes');
        onUpdateUser(updatedUser);
        Sound.jackpot();
        setMessage(`🏆 CHAMPION! You hit ${nextState.scores[mySeat]} points and won the 250-point match!`);
      } else {
        Sound.lose();
        setMessage(`Match Over. Opponent reached 250 points.`);
      }
    } else if (nextState.handOver) {
      Sound.win();
      setMessage(`🎉 DOMINO! Hand won! Deal next hand to continue race to 250.`);
    } else {
      if (!pvpRoom && nextState.turn === 1) {
        setMessage('Computer is strategizing for a multiple of 5...');
        scheduleBotTurn(nextState);
      } else {
        setMessage(nextState.turn === mySeat ? 'Your turn to slam a bone!' : 'Waiting for opponent...');
      }
    }

    setState(nextState);
    syncState(nextState);
  };

  const scheduleBotTurn = (s: DominoesGameState) => {
    if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
    botTimeoutRef.current = setTimeout(() => {
      runBotTurn(s);
    }, 750);
  };

  const runBotTurn = (s: DominoesGameState) => {
    if (s.handOver || s.matchOver || s.turn !== 1) return;

    const botHand = s.hands[1];
    if (!botHand) return;

    interface CandidateMove {
      tileIdx: number;
      direction: BranchDirection;
      simulatedScore: number;
    }

    const legalMoves: CandidateMove[] = [];

    botHand.forEach((tile, tIdx) => {
      const dirs = getPlayableMovesForTile(tile, s);
      dirs.forEach((dir) => {
        const sim = executeMove(s, 1, tIdx, dir);
        legalMoves.push({
          tileIdx: tIdx,
          direction: dir,
          simulatedScore: sim ? sim.pointsScored : 0,
        });
      });
    });

    if (legalMoves.length > 0) {
      // Prioritize moves that score multiples of 5, then doubles, then largest pip total
      legalMoves.sort((a, b) => {
        if (b.simulatedScore !== a.simulatedScore) {
          return b.simulatedScore - a.simulatedScore;
        }
        const tileA = botHand[a.tileIdx];
        const tileB = botHand[b.tileIdx];
        if (!tileA || !tileB) return 0;
        const isDoubleA = tileA[0] === tileA[1] ? 1 : 0;
        const isDoubleB = tileB[0] === tileB[1] ? 1 : 0;
        if (isDoubleB !== isDoubleA) return isDoubleB - isDoubleA;
        return tileB[0] + tileB[1] - (tileA[0] + tileA[1]);
      });

      const chosen = legalMoves[0];
      const result = executeMove(s, 1, chosen.tileIdx, chosen.direction);
      if (!result) return;

      Sound.dominoClack();
      if (result.pointsScored >= 15) {
        Sound.lose();
      } else if (result.pointsScored > 0) {
        Sound.chipBet();
      }

      const { nextState } = result;

      if (nextState.matchOver) {
        Sound.lose();
        setMessage(`Computer reached ${nextState.scores[1]} points and won the 250-point match.`);
      } else if (nextState.handOver) {
        Sound.lose();
        setMessage(`Computer called Domino! Hand finished.`);
      } else {
        setMessage('Your turn to slam a bone!');
      }

      setState(nextState);
      syncState(nextState);
    } else {
      // Bot has no legal moves: Draw from boneyard if available
      if (s.boneyard.length > 0) {
        const boneyard = [...s.boneyard];
        const drawn = boneyard.pop();
        if (!drawn) return;

        const hands: [Tile[], Tile[]] = [s.hands[0].slice(), s.hands[1].slice()];
        hands[1].push(drawn);
        Sound.cardDeal();

        const updatedState: DominoesGameState = {
          ...s,
          boneyard,
          hands,
        };

        setState(updatedState);
        syncState(updatedState);
        setMessage('Computer drew a bone from the boneyard...');

        scheduleBotTurn(updatedState);
      } else {
        // Boneyard empty: Bot passes
        const nextPasses = s.passes + 1;
        if (nextPasses >= 2) {
          // Table deadlock
          const pips0 = countPips(s.hands[0]);
          const pips1 = countPips(s.hands[1]);
          const winner = pips0 < pips1 ? 0 : pips1 < pips0 ? 1 : -1;

          let bonus = 0;
          const nextScores: [number, number] = [s.scores[0], s.scores[1]];
          if (winner === 0) {
            bonus = Math.max(5, Math.round((pips1 - pips0) / 5) * 5);
            nextScores[0] += bonus;
          } else if (winner === 1) {
            bonus = Math.max(5, Math.round((pips0 - pips1) / 5) * 5);
            nextScores[1] += bonus;
          }

          const isMatchOver = nextScores[0] >= TARGET_SCORE || nextScores[1] >= TARGET_SCORE;
          const matchWin = isMatchOver ? (nextScores[0] >= TARGET_SCORE ? 0 : 1) : null;

          const blockedState: DominoesGameState = {
            ...s,
            scores: nextScores,
            handOver: true,
            matchOver: isMatchOver,
            matchWinner: matchWin,
          };

          if (isMatchOver && matchWin === 0) {
            const { user: updatedUser } = Backend.recordWin(user, 'dominoes');
            onUpdateUser(updatedUser);
            Sound.jackpot();
          } else {
            Sound.lose();
          }

          setMessage(
            `Table Deadlocked! ${
              winner === 0
                ? 'You won on lowest remaining pips!'
                : winner === 1
                ? 'Computer won on lowest remaining pips.'
                : 'Deadlock tie.'
            }`
          );
          setState(blockedState);
          syncState(blockedState);
        } else {
          const passedState: DominoesGameState = {
            ...s,
            turn: 0,
            passes: nextPasses,
          };
          setState(passedState);
          syncState(passedState);
          setMessage('Computer passed on the table! Your turn.');
        }
      }
    }
  };

  const handleDrawFromBoneyard = () => {
    if (!isMyTurn || state.boneyard.length === 0 || state.handOver || state.matchOver) return;

    const boneyard = [...state.boneyard];
    const drawn = boneyard.pop();
    if (!drawn) return;

    const hands: [Tile[], Tile[]] = [state.hands[0].slice(), state.hands[1].slice()];
    hands[mySeat].push(drawn);

    Sound.cardDeal();

    const nextState: DominoesGameState = {
      ...state,
      boneyard,
      hands,
    };

    setState(nextState);
    syncState(nextState);

    const playable = getPlayableMovesForTile(drawn, nextState);
    if (playable.length > 0) {
      setMessage(`Drew a playable domino! Tap it to play.`);
    } else {
      setMessage(`Drew a bone, but still no match. Draw again or pass if empty.`);
    }
  };

  const handlePassTurn = () => {
    if (!isMyTurn || state.handOver || state.matchOver) return;
    if (state.boneyard.length > 0) {
      setMessage('You must draw from the boneyard before passing!');
      Sound.lose();
      return;
    }

    const nextPasses = state.passes + 1;
    if (nextPasses >= 2) {
      const pips0 = countPips(state.hands[0]);
      const pips1 = countPips(state.hands[1]);
      const winner = pips0 < pips1 ? 0 : pips1 < pips0 ? 1 : -1;

      let bonus = 0;
      const nextScores: [number, number] = [state.scores[0], state.scores[1]];
      if (winner === 0) {
        bonus = Math.max(5, Math.round((pips1 - pips0) / 5) * 5);
        nextScores[0] += bonus;
      } else if (winner === 1) {
        bonus = Math.max(5, Math.round((pips0 - pips1) / 5) * 5);
        nextScores[1] += bonus;
      }

      const isMatchOver = nextScores[0] >= TARGET_SCORE || nextScores[1] >= TARGET_SCORE;
      const matchWin = isMatchOver ? (nextScores[0] >= TARGET_SCORE ? 0 : 1) : null;

      const blockedState: DominoesGameState = {
        ...state,
        scores: nextScores,
        handOver: true,
        matchOver: isMatchOver,
        matchWinner: matchWin,
      };

      if (isMatchOver && matchWin === 0) {
        const { user: updatedUser } = Backend.recordWin(user, 'dominoes');
        onUpdateUser(updatedUser);
        Sound.jackpot();
      }

      setMessage(
        `Table Deadlocked! ${winner === 0 ? 'You won on lowest pips!' : 'Computer won on lowest pips.'}`
      );
      setState(blockedState);
      syncState(blockedState);
    } else {
      const passedState: DominoesGameState = {
        ...state,
        turn: 1,
        passes: nextPasses,
      };
      setState(passedState);
      syncState(passedState);
      setMessage('You passed. Computer is reading the table...');
      scheduleBotTurn(passedState);
    }
  };

  const startNextHand = () => {
    Sound.click();
    if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
    const nextHand = initNewHand(state.scores, state.round + 1);
    setState(nextHand);
    setSelectedIdx(null);
    setMessage(`Round ${state.round + 1} dealt! Score points on multiples of 5.`);
    syncState(nextHand);
  };

  const resetFullMatch = () => {
    Sound.click();
    if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
    const fresh = initNewHand([0, 0], 1);
    setState(fresh);
    setSelectedIdx(null);
    setMessage('New match started! Race to 250 points with Draw Dominoes & Spinner.');
    syncState(fresh);
  };

  const syncState = (s: DominoesGameState) => {
    if (pvpRoom) {
      Backend.updateRoom({
        ...pvpRoom,
        state: s,
        turn: s.turn,
      });
    }
  };

  const myHand = state.hands[mySeat] || [];
  const oppSeat = mySeat === 0 ? 1 : 0;
  const oppTileCount = (state.hands[oppSeat] || []).length;
  const myPipCount = countPips(myHand);

  const oppUid = pvpRoom ? pvpRoom.seats.find((s) => s !== user.uid) : null;
  const oppName = oppUid ? pvpRoom?.names[oppUid] || 'Opponent' : 'Domino Bot';
  const oppAvatar = oppUid ? pvpRoom?.avatars?.[oppUid] : undefined;
  const isOppRobot = !pvpRoom;

  const selectedTile =
    selectedIdx !== null && selectedIdx >= 0 && selectedIdx < myHand.length
      ? myHand[selectedIdx]
      : null;
  const matchingDirections = selectedTile ? getPlayableMovesForTile(selectedTile, state) : [];

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* TOURNAMENT DOMINO TABLE */}
      <div className="relative rounded-3xl p-3 sm:p-5 md:p-6 bg-linear-to-b from-[#3a1d11] via-[#24120a] to-[#170a04] border-4 md:border-8 border-[#4e2717] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.9),inset_0_2px_4px_rgba(255,255,255,0.15)] space-y-3 sm:space-y-4">
        {/* Table Frame Corner Brass Inlays / Drink Cup Holders */}
        <div className="absolute top-2 left-2 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-linear-to-br from-[#1b0d07] to-[#3a1d11] border border-[#6b3820] shadow-inner flex items-center justify-center pointer-events-none">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/25 border border-amber-500/40" />
        </div>
        <div className="absolute top-2 right-2 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-linear-to-br from-[#1b0d07] to-[#3a1d11] border border-[#6b3820] shadow-inner flex items-center justify-center pointer-events-none">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/25 border border-amber-500/40" />
        </div>
        <div className="absolute bottom-2 left-2 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-linear-to-br from-[#1b0d07] to-[#3a1d11] border border-[#6b3820] shadow-inner flex items-center justify-center pointer-events-none">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/25 border border-amber-500/40" />
        </div>
        <div className="absolute bottom-2 right-2 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-linear-to-br from-[#1b0d07] to-[#3a1d11] border border-[#6b3820] shadow-inner flex items-center justify-center pointer-events-none">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/25 border border-amber-500/40" />
        </div>

        {/* 250 POINTS MATCH RACE SCOREBOARD */}
        <div className="bg-black/60 border border-amber-600/40 rounded-2xl p-3 shadow-xl backdrop-blur-sm space-y-2.5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                Match Race to 250 Points · Round {state.round}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowInstructionsModal(!showInstructionsModal)}
                className="py-1 px-2.5 bg-stone-900 hover:bg-stone-800 text-stone-300 text-xs font-semibold rounded-lg border border-stone-700 flex items-center gap-1 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>Rules</span>
              </button>
              <button
                type="button"
                onClick={resetFullMatch}
                className="py-1 px-2.5 bg-stone-900 hover:bg-stone-800 text-amber-300 text-xs font-semibold rounded-lg border border-amber-600/30 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>New Match</span>
              </button>
            </div>
          </div>

          {/* Progress Bars for Both Players */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {/* Player Score Bar */}
            <div className="p-2 bg-stone-950/80 rounded-xl border border-stone-800 space-y-1">
              <div className="flex justify-between items-center font-bold">
                <span className="text-slate-200 truncate">{user.username} (You)</span>
                <span className="text-amber-400 font-mono text-sm">
                  {state.scores[0]} / {TARGET_SCORE} pts
                </span>
              </div>
              <div className="w-full h-2.5 bg-stone-900 rounded-full overflow-hidden border border-stone-800">
                <div
                  className="h-full bg-linear-to-r from-amber-500 to-amber-300 transition-all duration-300"
                  style={{ width: `${Math.min(100, (state.scores[0] / TARGET_SCORE) * 100)}%` }}
                />
              </div>
            </div>

            {/* Opponent Score Bar */}
            <div className="p-2 bg-stone-950/80 rounded-xl border border-stone-800 space-y-1">
              <div className="flex justify-between items-center font-bold">
                <span className="text-slate-200 truncate">{oppName}</span>
                <span className="text-amber-400 font-mono text-sm">
                  {state.scores[1]} / {TARGET_SCORE} pts
                </span>
              </div>
              <div className="w-full h-2.5 bg-stone-900 rounded-full overflow-hidden border border-stone-800">
                <div
                  className="h-full bg-linear-to-r from-indigo-500 to-indigo-300 transition-all duration-300"
                  style={{ width: `${Math.min(100, (state.scores[1] / TARGET_SCORE) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* OPPONENT WOODEN RACK (Top) */}
        <div className="flex items-center justify-between px-2 pt-1">
          <PlayerBadge
            name={oppName}
            avatar={oppAvatar}
            isRobot={isOppRobot}
            subtitle={`${oppTileCount} Bones in Rack`}
            isTurn={!isMyTurn}
            size="sm"
          />

          {/* Boneyard Indicator Pill */}
          <div className="flex items-center gap-1.5 bg-black/60 px-3 py-1 rounded-xl border border-amber-600/30 text-xs">
            <span className="text-stone-400 font-medium">Boneyard:</span>
            <strong className="text-amber-400 font-mono text-sm">{state.boneyard.length}</strong>
            <span className="text-stone-400">bones left</span>
          </div>
        </div>

        {/* OPPONENT RACK TILES (Face Down Standing Bones) */}
        <div className="bg-linear-to-b from-[#1f0d06] to-[#2c1409] border border-[#502614] rounded-2xl p-2.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] flex items-center justify-center gap-1.5 overflow-x-auto min-h-12">
          {Array.from({ length: oppTileCount }).map((_, i) => (
            <DominoTile
              key={i}
              val1={0}
              val2={0}
              faceDown={true}
              size="xs"
              orientation="vertical"
              className="shrink-0 -rotate-1 hover:rotate-0 transition-transform shadow-md"
            />
          ))}
        </div>

        {/* CASINO EMERALD GREEN FELT TABLE WITH SPINNER, BONEYARD & ZOOM VIEWPORT */}
        <div className="relative rounded-2xl bg-radial from-[#0d4a29] via-[#09351d] to-[#041a0e] border-2 border-[#165a34] shadow-[inset_0_4px_16px_rgba(0,0,0,0.7),0_8px_20px_rgba(0,0,0,0.4)] p-3 sm:p-5 md:p-6 min-h-[340px] md:min-h-[420px] flex flex-col justify-between overflow-hidden">
          {/* Watermark Crest */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-10">
            <div className="w-56 h-56 rounded-full border-4 border-amber-300 flex items-center justify-center">
              <span className="text-5xl font-serif">5</span>
            </div>
          </div>

          {/* Table Top Controls & Status Bar */}
          <div className="relative z-10 space-y-2 pb-2 border-b border-emerald-800/40 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-bold text-amber-300">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>{message}</span>
              </div>

              {/* Ends Sum + Table View Scaling Controls */}
              <div className="flex items-center gap-2">
                {/* Current Open Ends Sum Pill */}
                <div
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold transition-all ${
                    currentEndsSum > 0 && currentEndsSum % 5 === 0
                      ? 'bg-amber-500 text-slate-950 border-amber-300 animate-pulse shadow-md shadow-amber-500/30'
                      : 'bg-black/60 border-emerald-500/30 text-emerald-300'
                  }`}
                >
                  <span>Ends Sum:</span>
                  <span className="font-mono text-sm">{currentEndsSum}</span>
                  {currentEndsSum > 0 && currentEndsSum % 5 === 0 && (
                    <span className="text-[10px] bg-black/40 text-amber-300 px-1.5 py-0.5 rounded">
                      + {currentEndsSum} PTS!
                    </span>
                  )}
                </div>

                {/* TABLE VIEW ZOOM / AUTO-FIT CONTROLS (So players can ALWAYS see every domino!) */}
                <div className="flex items-center bg-black/70 backdrop-blur-md rounded-xl border border-emerald-600/40 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAutoFit(false);
                      setManualZoom((z) => Math.max(0.35, z - 0.12));
                    }}
                    className="p-1 text-stone-300 hover:text-white hover:bg-stone-800 rounded transition-colors cursor-pointer"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAutoFit(!isAutoFit);
                      centerTable();
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                      isAutoFit
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'text-stone-300 hover:text-white'
                    }`}
                    title="Auto-Fit all dominoes to table view"
                  >
                    Fit All ({Math.round(effectiveScale * 100)}%)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAutoFit(false);
                      setManualZoom((z) => Math.min(1.4, z + 0.12));
                    }}
                    className="p-1 text-stone-300 hover:text-white hover:bg-stone-800 rounded transition-colors cursor-pointer"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAutoFit(false);
                      setManualZoom(1.0);
                      centerTable();
                    }}
                    className="px-1.5 py-0.5 text-[10px] text-stone-400 hover:text-white hover:bg-stone-800 rounded transition-colors cursor-pointer"
                    title="Reset to 100% Zoom"
                  >
                    100%
                  </button>
                </div>
              </div>
            </div>

            {/* PERSISTENT ACTIVE OPEN ENDS DOCK (Always visible so players never lose sight of playable ends!) */}
            {activeEnds.length > 0 && (
              <div className="flex items-center justify-between gap-2 bg-black/55 backdrop-blur-md px-3 py-1.5 rounded-xl border border-emerald-600/40 text-xs">
                <div className="flex items-center gap-2 overflow-x-auto py-0.5">
                  <span className="text-[11px] font-extrabold text-emerald-300 uppercase tracking-wider shrink-0 flex items-center gap-1">
                    <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                    <span>Open Ends:</span>
                  </span>

                  {activeEnds.map((end) => {
                    const isPlayable =
                      selectedTile && (selectedTile[0] === end.pip || selectedTile[1] === end.pip);

                    return (
                      <button
                        key={end.direction}
                        type="button"
                        onClick={() => {
                          if (isPlayable && selectedIdx !== null) {
                            playHumanTile(selectedIdx, end.direction);
                          } else {
                            jumpToDirection(end.direction);
                          }
                        }}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                          isPlayable
                            ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 font-black animate-pulse shadow-md ring-2 ring-amber-300 cursor-pointer scale-105'
                            : 'bg-stone-900/80 hover:bg-stone-800 text-stone-200 border-stone-700/80 cursor-pointer'
                        }`}
                        title={
                          isPlayable
                            ? `Slam selected domino on ${end.direction} end!`
                            : `Jump view to ${end.direction} end`
                        }
                      >
                        <span className="capitalize font-bold text-[11px]">{end.direction}:</span>
                        <div className="w-4 h-4 bg-amber-50 rounded-xs p-0.5 shadow-xs border border-stone-300 flex items-center justify-center">
                          <DominoTile
                            val1={end.pip}
                            val2={end.pip}
                            size="xs"
                            orientation="vertical"
                            as="div"
                            className="w-full h-full scale-50 origin-top-left pointer-events-none border-0 shadow-none bg-transparent"
                          />
                        </div>
                        {isPlayable && (
                          <span className="text-[10px] bg-black text-amber-400 px-1 rounded uppercase font-black tracking-wider">
                            PLAY
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Quick Navigation Jumpers */}
                <div className="flex items-center gap-1 shrink-0 text-stone-400">
                  <button
                    type="button"
                    onClick={() => jumpToDirection('left')}
                    className="p-1 hover:text-amber-400 transition-colors cursor-pointer"
                    title="Jump to Left End"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={centerTable}
                    className="px-1.5 py-0.5 hover:text-amber-400 transition-colors font-semibold text-[10px] cursor-pointer"
                    title="Center Table"
                  >
                    Center
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToDirection('right')}
                    className="p-1 hover:text-amber-400 transition-colors cursor-pointer"
                    title="Jump to Right End"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* FLOATING SCORE FLASH NOTIFICATION */}
          {showScoreFlash && (
            <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 animate-in zoom-in fade-in duration-200 pointer-events-none">
              <div className="px-5 py-2.5 rounded-2xl bg-linear-to-r from-amber-500 to-amber-300 text-slate-950 font-black text-base shadow-2xl border-2 border-amber-200 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-slate-950 fill-slate-950 animate-spin" />
                <span>ALL FIVES! +{showScoreFlash} POINTS!</span>
              </div>
            </div>
          )}

          {/* ACTIVE DOMINO TABLE VIEWPORT (Auto-Scaled & Panning so ALL tiles remain visible) */}
          <div
            ref={boardScrollRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={`relative z-10 my-auto py-4 overflow-x-auto overflow-y-auto min-h-[220px] md:min-h-[300px] max-h-[460px] scrollbar-thin scrollbar-thumb-emerald-700/60 transition-colors ${
              isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
            }`}
          >
            {!state.centerTile ? (
              <div className="w-full flex items-center justify-center py-12 px-6">
                <div className="text-center py-6 px-8 rounded-2xl bg-black/35 border border-emerald-700/40 text-emerald-200 space-y-2 max-w-sm">
                  <span className="text-base font-black block text-amber-300">
                    Felt Table is Open
                  </span>
                  <span className="text-xs">
                    Slam any domino to open the line. The first double played becomes the <strong>Spinner</strong>!
                  </span>
                </div>
              </div>
            ) : (
              /* DYNAMIC SCALED DOMINO TRAIN WRAPPER WITH FULL SCROLL VISIBILITY */
              <div className="min-w-full w-max flex flex-col items-center justify-center px-16 py-6 mx-auto">
                <div
                  className="transition-transform duration-200 flex flex-col items-center justify-center"
                  style={{
                    transform: `scale(${effectiveScale})`,
                    transformOrigin: 'center center',
                    minWidth: 'max-content',
                  }}
                >
                {/* TOP BRANCH OF SPINNER (Heading Upwards) */}
                {state.spinner && state.spinner.unlocked && (
                  <div className="flex flex-col-reverse items-center gap-1 mb-1">
                    {/* Top Branch End Target Button */}
                    {matchingDirections.includes('top') && (
                      <button
                        type="button"
                        onClick={() => selectedIdx !== null && playHumanTile(selectedIdx, 'top')}
                        className="py-1 px-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[11px] rounded-lg shadow-lg ring-3 ring-amber-400/60 animate-bounce flex items-center gap-1 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                        <span>PLAY TOP</span>
                      </button>
                    )}
                    {state.branches.top.map((item, idx) => (
                      <DominoTile
                        key={`top-${idx}`}
                        val1={item.outer}
                        val2={item.inner}
                        orientation={item.isDouble ? 'horizontal' : 'vertical'}
                        size="xs"
                        className="shadow-md"
                      />
                    ))}
                  </div>
                )}

                {/* MAIN HORIZONTAL CHAIN (Left Branch + Center / Spinner + Right Branch) */}
                <div className="inline-flex items-center gap-1">
                  {/* Left End Target Button */}
                  {matchingDirections.includes('left') && (
                    <button
                      type="button"
                      onClick={() => selectedIdx !== null && playHumanTile(selectedIdx, 'left')}
                      className="py-1 px-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[11px] rounded-lg shadow-lg ring-3 ring-amber-400/60 animate-bounce flex items-center gap-1 shrink-0 cursor-pointer mr-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>PLAY LEFT</span>
                    </button>
                  )}

                  {/* Left Branch Tiles (Rendered Left to Right ending at Center) */}
                  {[...state.branches.left].reverse().map((item, idx) => (
                    <div key={`left-${idx}`} className="shrink-0 flex items-center">
                      <DominoTile
                        val1={item.outer}
                        val2={item.inner}
                        orientation={item.isDouble ? 'vertical' : 'horizontal'}
                        size="xs"
                        className="shadow-md"
                      />
                    </div>
                  ))}

                  {/* Center / Spinner Tile */}
                  <div className="shrink-0 flex flex-col items-center relative mx-1">
                    <DominoTile
                      val1={state.centerTile[0]}
                      val2={state.centerTile[1]}
                      orientation={
                        state.spinner && state.centerTile[0] === state.spinner.tile[0]
                          ? 'vertical'
                          : 'horizontal'
                      }
                      size="sm"
                      className={`shadow-xl ${
                        state.spinner ? 'ring-2 ring-amber-400/80 shadow-amber-500/20' : ''
                      }`}
                    />
                    {state.spinner && (
                      <span className="text-[9px] font-black uppercase text-amber-400 bg-black/80 px-1.5 py-0.2 rounded-xs border border-amber-500/40 mt-0.5 tracking-wider">
                        SPINNER
                      </span>
                    )}
                  </div>

                  {/* Right Branch Tiles */}
                  {state.branches.right.map((item, idx) => (
                    <div key={`right-${idx}`} className="shrink-0 flex items-center">
                      <DominoTile
                        val1={item.inner}
                        val2={item.outer}
                        orientation={item.isDouble ? 'vertical' : 'horizontal'}
                        size="xs"
                        className="shadow-md"
                      />
                    </div>
                  ))}

                  {/* Right End Target Button */}
                  {matchingDirections.includes('right') && (
                    <button
                      type="button"
                      onClick={() => selectedIdx !== null && playHumanTile(selectedIdx, 'right')}
                      className="py-1 px-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[11px] rounded-lg shadow-lg ring-3 ring-amber-400/60 animate-bounce flex items-center gap-1 shrink-0 cursor-pointer ml-1"
                    >
                      <span>PLAY RIGHT</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* BOTTOM BRANCH OF SPINNER (Heading Downwards) */}
                {state.spinner && state.spinner.unlocked && (
                  <div className="flex flex-col items-center gap-1 mt-1">
                    {state.branches.bottom.map((item, idx) => (
                      <DominoTile
                        key={`bot-${idx}`}
                        val1={item.inner}
                        val2={item.outer}
                        orientation={item.isDouble ? 'horizontal' : 'vertical'}
                        size="xs"
                        className="shadow-md"
                      />
                    ))}

                    {/* Bottom Branch End Target Button */}
                    {matchingDirections.includes('bottom') && (
                      <button
                        type="button"
                        onClick={() => selectedIdx !== null && playHumanTile(selectedIdx, 'bottom')}
                        className="py-1 px-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[11px] rounded-lg shadow-lg ring-3 ring-amber-400/60 animate-bounce flex items-center gap-1 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                        <span>PLAY BOTTOM</span>
                      </button>
                    )}
                  </div>
                )}
                </div>
              </div>
            )}
          </div>

          {/* TABLE BOTTOM BAR: BONEYARD PILE + CONTROLS */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-emerald-800/40 text-xs">
            {/* Clickable Boneyard Stack */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDrawFromBoneyard}
                disabled={!isMyTurn || state.boneyard.length === 0}
                className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 transition-all cursor-pointer ${
                  isMyTurn &&
                  state.boneyard.length > 0 &&
                  myHand.every((t) => getPlayableMovesForTile(t, state).length === 0)
                    ? 'bg-amber-500 text-slate-950 border-amber-300 animate-pulse font-black shadow-lg ring-2 ring-amber-400/50'
                    : state.boneyard.length > 0
                    ? 'bg-black/50 text-stone-300 border-amber-600/30 hover:bg-black/70'
                    : 'bg-black/30 text-stone-600 border-stone-800 cursor-not-allowed'
                }`}
                title="Draw from Boneyard"
              >
                <div className="flex -space-x-1.5">
                  <div className="w-3 h-5 rounded-xs bg-amber-950 border border-amber-700/60" />
                  <div className="w-3 h-5 rounded-xs bg-stone-900 border border-amber-600/60" />
                </div>
                <span>Draw Bone ({state.boneyard.length})</span>
              </button>
            </div>

            {/* Turn Action / Pass / Next Hand Button */}
            <div className="flex items-center gap-2">
              {state.handOver ? (
                state.matchOver ? (
                  <button
                    type="button"
                    onClick={resetFullMatch}
                    className="py-2 px-4 bg-linear-to-r from-amber-500 to-amber-300 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
                  >
                    Start New 250-Pt Match
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startNextHand}
                    className="py-2 px-4 bg-linear-to-r from-emerald-500 to-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
                  >
                    Deal Next Hand (Round {state.round + 1}) →
                  </button>
                )
              ) : isMyTurn ? (
                <button
                  type="button"
                  onClick={handlePassTurn}
                  disabled={state.boneyard.length > 0}
                  className={`py-1.5 px-3.5 rounded-xl text-xs font-bold transition-all ${
                    state.boneyard.length === 0 &&
                    myHand.every((t) => getPlayableMovesForTile(t, state).length === 0)
                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-md animate-pulse cursor-pointer'
                      : 'bg-stone-900/60 text-stone-500 border border-stone-800 cursor-not-allowed'
                  }`}
                  title={
                    state.boneyard.length > 0
                      ? 'Must draw from boneyard first'
                      : 'Pass turn to opponent'
                  }
                >
                  Pass Turn
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* PLAYER WOODEN TILE RACK (Bottom) */}
        <div className="bg-linear-to-t from-[#1f0d06] via-[#2d150a] to-[#3a1d11] border-2 border-[#5a2c17] rounded-2xl p-3 md:p-4 shadow-[0_12px_24px_rgba(0,0,0,0.6)] space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <PlayerBadge
              name={user.username}
              avatar={user.avatar}
              subtitle="Your Domino Rack"
              isTurn={isMyTurn}
              size="sm"
            />

            <div className="flex items-center gap-3 text-xs">
              {selectedTile && (
                <button
                  type="button"
                  onClick={() => setSelectedIdx(null)}
                  className="flex items-center gap-1 text-amber-400 hover:text-amber-300 font-bold bg-black/40 px-2 py-0.5 rounded-lg border border-amber-500/30 cursor-pointer"
                >
                  <span>Deselect</span>
                  <X className="w-3 h-3" />
                </button>
              )}
              <span className="text-amber-400 font-bold">{myHand.length} bones</span>
              <span className="text-stone-400 font-medium">
                Pip Sum: <strong className="text-amber-300">{myPipCount}</strong>
              </span>
            </div>
          </div>

          {/* Player Domino Tiles Standing in Rack with Dots */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 py-1 min-h-[95px]">
            {myHand.map((tile, idx) => {
              const playableDirs = isMyTurn ? getPlayableMovesForTile(tile, state) : [];
              const isPlayable = playableDirs.length > 0;
              const isSelected = selectedIdx === idx;

              return (
                <div key={idx} className="relative group">
                  <DominoTile
                    val1={tile[0]}
                    val2={tile[1]}
                    orientation="vertical"
                    size="md"
                    selected={isSelected}
                    playable={isPlayable}
                    onClick={() => handleTileSelect(idx)}
                    className="transition-transform duration-150"
                  />
                </div>
              );
            })}
          </div>

          <div className="text-[11px] text-stone-400 text-center italic">
            {myHand.some((t) => getPlayableMovesForTile(t, state).length > 0)
              ? 'Select a glowing bone to connect it and score multiples of 5!'
              : state.boneyard.length > 0
              ? 'No matching bones in your rack. Click "Draw Bone" above to pull from boneyard.'
              : 'No matching bones and boneyard is empty. Tap Pass Turn.'}
          </div>
        </div>
      </div>

      {/* QUICK RULES MODAL */}
      {showInstructionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-black text-slate-100">
                  Draw Dominoes Rules · All Fives & Spinner
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInstructionsModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
              <p>
                • <strong>Race to 250 Points:</strong> Players accumulate points across rounds. First to reach <strong>250 points</strong> wins the match!
              </p>
              <p>
                • <strong>Scoring by 5s (All Fives):</strong> After every move, add up all exposed open ends of the layout. If the sum is a multiple of 5 (5, 10, 15, 20, 25...), you score that many points immediately!
              </p>
              <p>
                • <strong>The Spinner:</strong> The first double played becomes the Spinner. Once both left and right sides have tiles played on them, the Spinner unlocks top and bottom branches, allowing play in all 4 directions!
              </p>
              <p>
                • <strong>The Boneyard:</strong> If you cannot play a matching domino on any open end, you must draw from the boneyard until you get a playable tile or the boneyard empties.
              </p>
              <p>
                • <strong>Table Visibility:</strong> The table automatically auto-fits all dominoes as the line grows. You can also use the Zoom controls (Fit All, +, -, 100%) and the Open Ends bar to view and play on any end instantly!
              </p>
              <p>
                • <strong>Hand Winner:</strong> The first to empty their rack calls Domino and scores the opponent’s leftover pips rounded to the nearest 5!
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowInstructionsModal(false)}
              className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer"
            >
              Got it, Let's Play!
            </button>
          </div>
        </div>
      )}

      {pvpRoom && <ChatBox channel={`room_${pvpRoom.code}`} currentUser={user} />}
    </div>
  );
};
