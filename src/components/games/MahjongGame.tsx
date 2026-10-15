import React, { useState, useMemo, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  RotateCcw,
  Sparkles,
  Undo2,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Trophy,
  CheckCircle2,
  AlertTriangle,
  Play,
  Clock,
  Shuffle,
} from 'lucide-react';
import { User } from '../../types';
import { PlayerBadge } from '../PlayerBadge';
import { Backend } from '../../utils/backend';
import { Sound } from '../../utils/sound';
import {
  MahjongDesignDef,
  DIFFICULTY_TIERS,
  MAHJONG_TILES,
} from './mahjong/mahjongData';
import { ALL_MAHJONG_DESIGNS } from './mahjong/allDesigns';
import { MahjongDesignsModal } from './mahjong/MahjongDesignsModal';
import { MahjongTileFace } from './mahjong/MahjongTileFace';

interface MahjongTileInstance {
  id: number;
  x: number;
  y: number;
  z: number;
  tileId?: string;
  symbol: string;
  name: string;
  category: string;
  color: string;
  cleared: boolean;
  hinted?: boolean;
}

interface MahjongGameProps {
  user: User;
  onUpdateUser: (updated: User) => void;
}

interface MatchHistoryEntry {
  tile1Id: number;
  tile2Id: number;
  symbol: string;
}

export const MahjongGame: React.FC<MahjongGameProps> = ({ user, onUpdateUser }) => {
  // Load cleared designs from localStorage
  const [clearedDesignIds, setClearedDesignIds] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('hm_mahjong_cleared');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Current active design (defaults to #1 or saved preference)
  const [currentDesign, setCurrentDesign] = useState<MahjongDesignDef>(() => {
    try {
      const savedId = localStorage.getItem('hm_mahjong_last_design');
      if (savedId) {
        const found = ALL_MAHJONG_DESIGNS.find((d) => d.id === Number(savedId));
        if (found) return found;
      }
    } catch {
      // ignore
    }
    return ALL_MAHJONG_DESIGNS[0];
  });

  // Game board state
  const [tiles, setTiles] = useState<MahjongTileInstance[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [movesCount, setMovesCount] = useState(0);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryEntry[]>([]);
  const [hintedIds, setHintedIds] = useState<number[]>([]);
  const [statusMessage, setStatusMessage] = useState('Select 2 matching open tiles to clear them');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isWon, setIsWon] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const timerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerDimensions, setContainerDimensions] = useState({ width: 750, height: 560 });

  // Measure container dimensions dynamically for responsive auto-fit
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerDimensions({
          width: Math.floor(rect.width),
          height: Math.floor(rect.height),
        });
      }
    };

    updateSize();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updateSize());
      ro.observe(el);
    }
    window.addEventListener('resize', updateSize);

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [isFullscreen]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      } else if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !isModalOpen) {
        // Toggle fullscreen if not typing in input
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
          setIsFullscreen((prev) => !prev);
        }
      } else if (e.key === '0' && !e.ctrlKey && !e.metaKey && !isModalOpen) {
        setZoomLevel(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, isModalOpen]);

  // Initialize board whenever currentDesign changes
  const initBoard = (design: MahjongDesignDef) => {
    const totalTiles = design.positions.length;
    const pairsNeeded = totalTiles / 2;

    // Pick pairs from MAHJONG_TILES pool
    const selectedPairs: typeof MAHJONG_TILES[number][] = [];
    for (let i = 0; i < pairsNeeded; i++) {
      const tileDef = MAHJONG_TILES[i % MAHJONG_TILES.length];
      selectedPairs.push(tileDef, tileDef);
    }

    // Shuffle symbols
    for (let i = selectedPairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [selectedPairs[i], selectedPairs[j]] = [selectedPairs[j], selectedPairs[i]];
    }

    const newTiles: MahjongTileInstance[] = design.positions.map((pos, idx) => {
      const tileDef = selectedPairs[idx];
      return {
        id: idx,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        tileId: tileDef.id,
        symbol: tileDef.symbol,
        name: tileDef.name,
        category: tileDef.category,
        color: tileDef.color,
        cleared: false,
        hinted: false,
      };
    });

    setTiles(newTiles);
    setSelectedId(null);
    setMovesCount(0);
    setMatchHistory([]);
    setHintedIds([]);
    setIsWon(false);
    setElapsedSeconds(0);
    setIsTimerActive(true);
    setStatusMessage(`Playing #${design.id} "${design.name}" (${design.blockCount} blocks)`);

    try {
      localStorage.setItem('hm_mahjong_last_design', String(design.id));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    initBoard(currentDesign);
  }, [currentDesign.id]);

  // Timer effect
  useEffect(() => {
    if (isTimerActive && !isWon) {
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerActive, isWon]);

  // Check if a tile is free (standard Mahjong Solitaire rules)
  const isTileFree = (tile: MahjongTileInstance, allTiles: MahjongTileInstance[]): boolean => {
    if (tile.cleared) return false;

    // 1. Must not have any tile sitting on top of it (z > tile.z)
    const covered = allTiles.some(
      (t) =>
        !t.cleared &&
        t.z > tile.z &&
        Math.abs(t.x - tile.x) < 0.9 &&
        Math.abs(t.y - tile.y) < 0.9
    );
    if (covered) return false;

    // 2. Must be open on left OR right (same layer z)
    const leftBlocked = allTiles.some(
      (t) =>
        !t.cleared &&
        t.z === tile.z &&
        Math.abs(t.y - tile.y) < 0.6 &&
        tile.x - t.x > 0.1 &&
        tile.x - t.x <= 1.1
    );
    const rightBlocked = allTiles.some(
      (t) =>
        !t.cleared &&
        t.z === tile.z &&
        Math.abs(t.y - tile.y) < 0.6 &&
        t.x - tile.x > 0.1 &&
        t.x - tile.x <= 1.1
    );

    return !leftBlocked || !rightBlocked;
  };

  // Find all currently free tiles
  const freeTiles = useMemo(() => {
    return tiles.filter((t) => !t.cleared && isTileFree(t, tiles));
  }, [tiles]);

  // Calculate available matching pairs
  const availablePairs = useMemo(() => {
    const symbolMap = new Map<string, MahjongTileInstance[]>();
    for (const t of freeTiles) {
      const list = symbolMap.get(t.symbol) || [];
      list.push(t);
      symbolMap.set(t.symbol, list);
    }

    const pairs: [MahjongTileInstance, MahjongTileInstance][] = [];
    for (const [, list] of symbolMap.entries()) {
      if (list.length >= 2) {
        pairs.push([list[0], list[1]]);
      }
    }
    return pairs;
  }, [freeTiles]);

  // Tile dimensions and board bounds for auto-fit
  const boardBounds = useMemo(() => {
    if (currentDesign.positions.length === 0)
      return { minX: 0, maxX: 6, minY: 0, maxY: 4, width: 7, height: 5 };
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of currentDesign.positions) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      minX,
      maxX,
      minY,
      maxY,
      width: Math.max(1, maxX - minX + 1),
      height: Math.max(1, maxY - minY + 1),
    };
  }, [currentDesign]);

  // Compute adaptive base tile scale fitting BOTH horizontal and vertical space
  const adaptiveTileWidth = useMemo(() => {
    // Available space inside viewport container (minus inner padding & toolbar margins)
    const availW = Math.max(280, containerDimensions.width - 56);
    const availH = Math.max(320, containerDimensions.height - 60);

    // Virtual grid span including extra room for 3D elevations and shadows
    const totalCols = boardBounds.width + 1.2;
    const totalRows = boardBounds.height + 1.2;

    const maxW_fromWidth = availW / totalCols;
    const maxW_fromHeight = (availH / totalRows) / 1.28;

    // Base fit size guarantees 100% of all blocks fit on screen without scrolling
    const fitSize = Math.max(18, Math.min(56, Math.floor(Math.min(maxW_fromWidth, maxW_fromHeight))));
    return Math.round(fitSize * zoomLevel);
  }, [boardBounds.width, boardBounds.height, containerDimensions.width, containerDimensions.height, zoomLevel]);

  const adaptiveTileHeight = Math.round(adaptiveTileWidth * 1.28);

  // Safety padding around the canvas to ensure high-z elevations and shadows never clip
  const PADDING_X = Math.max(18, Math.round(adaptiveTileWidth * 0.45));
  const PADDING_Y = Math.max(26, Math.round(adaptiveTileHeight * 0.45));
  const canvasWidth = Math.ceil(boardBounds.width * adaptiveTileWidth + PADDING_X * 2);
  const canvasHeight = Math.ceil(boardBounds.height * adaptiveTileHeight + PADDING_Y * 2);

  // Handle tile click
  const handleTileClick = (t: MahjongTileInstance) => {
    if (t.cleared || !isTileFree(t, tiles) || isWon) return;

    // Clear hints
    if (hintedIds.length > 0) setHintedIds([]);

    if (selectedId === null) {
      setSelectedId(t.id);
      Sound.click();
      setStatusMessage(`Selected ${t.name} (${t.symbol}). Choose its pair!`);
      return;
    }

    if (selectedId === t.id) {
      setSelectedId(null);
      Sound.click();
      setStatusMessage('Tile deselected.');
      return;
    }

    const firstTile = tiles.find((x) => x.id === selectedId);
    if (!firstTile) {
      setSelectedId(t.id);
      return;
    }

    if (firstTile.symbol === t.symbol) {
      // MATCH FOUND!
      Sound.chipBet();

      const nextTiles = tiles.map((item) => {
        if (item.id === t.id || item.id === firstTile.id) {
          return { ...item, cleared: true };
        }
        return item;
      });

      setTiles(nextTiles);
      setSelectedId(null);
      setMovesCount((m) => m + 1);
      setMatchHistory((hist) => [
        ...hist,
        { tile1Id: firstTile.id, tile2Id: t.id, symbol: t.symbol },
      ]);

      const remaining = nextTiles.filter((x) => !x.cleared).length;
      if (remaining === 0) {
        // SOLVED! VICTORY!
        setIsWon(true);
        setIsTimerActive(false);
        Sound.win();

        // Confetti burst
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 },
        });

        // Save cleared design
        setClearedDesignIds((prev) => {
          if (!prev.includes(currentDesign.id)) {
            const updated = [...prev, currentDesign.id];
            try {
              localStorage.setItem('hm_mahjong_cleared', JSON.stringify(updated));
            } catch {
              // ignore
            }
            return updated;
          }
          return prev;
        });

        // Record win in backend
        const { user: updatedUser } = Backend.recordWin(user, 'mahjong');
        onUpdateUser(updatedUser);
        setStatusMessage(`🎉 Design #${currentDesign.id} Solved! +100 ⭐ bonus awarded!`);
      } else {
        setStatusMessage(`✨ Matched ${t.name}! ${remaining} blocks remaining.`);
      }
    } else {
      // Not a match
      Sound.lose();
      setSelectedId(t.id);
      setStatusMessage(`No match! Selected ${t.name} instead.`);
    }
  };

  // Hint action
  const handleHint = () => {
    if (availablePairs.length === 0) {
      setStatusMessage('⚠️ No matching open pairs available! Tap "Reshuffle".');
      return;
    }
    const pair = availablePairs[0];
    setHintedIds([pair[0].id, pair[1].id]);
    setSelectedId(null);
    Sound.chipBet();
    setStatusMessage(`💡 Hint: Match ${pair[0].name} (${pair[0].symbol})!`);
  };

  // Undo action
  const handleUndo = () => {
    if (matchHistory.length === 0) return;
    const lastMatch = matchHistory[matchHistory.length - 1];
    setTiles((prev) =>
      prev.map((t) => {
        if (t.id === lastMatch.tile1Id || t.id === lastMatch.tile2Id) {
          return { ...t, cleared: false };
        }
        return t;
      })
    );
    setMatchHistory((prev) => prev.slice(0, -1));
    setSelectedId(null);
    setHintedIds([]);
    Sound.click();
    setStatusMessage(`Undid match for ${lastMatch.symbol}.`);
  };

  // Reshuffle active remaining tiles
  const handleReshuffle = () => {
    const active = tiles.filter((t) => !t.cleared);
    if (active.length === 0) return;

    const symbols = active.map((t) => ({
      symbol: t.symbol,
      name: t.name,
      category: t.category,
      color: t.color,
    }));

    for (let i = symbols.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [symbols[i], symbols[j]] = [symbols[j], symbols[i]];
    }

    let idx = 0;
    const nextTiles = tiles.map((t) => {
      if (t.cleared) return t;
      const s = symbols[idx++];
      return {
        ...t,
        symbol: s.symbol,
        name: s.name,
        category: s.category,
        color: s.color,
      };
    });

    setTiles(nextTiles);
    setSelectedId(null);
    setHintedIds([]);
    Sound.chipBet();
    setStatusMessage('Active blocks reshuffled!');
  };

  // Next / Previous design navigation
  const handlePrevDesign = () => {
    const prevIdx = (currentDesign.id - 2 + 100) % 100;
    setCurrentDesign(ALL_MAHJONG_DESIGNS[prevIdx]);
  };

  const handleNextDesign = () => {
    const nextIdx = currentDesign.id % 100;
    setCurrentDesign(ALL_MAHJONG_DESIGNS[nextIdx]);
  };

  // Quick jump by difficulty level
  const handleSelectDifficultyLevel = (lvl: number) => {
    const target = ALL_MAHJONG_DESIGNS.find((d) => d.difficulty === lvl);
    if (target) setCurrentDesign(target);
  };

  // Remaining block count
  const remainingCount = tiles.filter((t) => !t.cleared).length;
  const currentTier = DIFFICULTY_TIERS.find((t) => t.level === currentDesign.difficulty);

  // Format seconds mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-3">
      {/* 100 Designs Selector Modal */}
      <MahjongDesignsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        designs={ALL_MAHJONG_DESIGNS}
        currentDesignId={currentDesign.id}
        onSelectDesign={(d) => setCurrentDesign(d)}
        clearedDesignIds={clearedDesignIds}
      />

      {/* Top HUD: Player and Solitaire Master */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs">
        <PlayerBadge
          name={user.username}
          avatar={user.avatar}
          subtitle={`Solved: ${clearedDesignIds.length}/100 Layouts`}
          size="sm"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-bold border border-amber-500/40 rounded-lg text-xs transition-all active:scale-95 cursor-pointer shadow-sm"
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span>Browse 100 Designs</span>
          </button>
        </div>
      </div>

      {/* Main Game Enclosure */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-2xl space-y-3">
        {/* Design Header & Navigation Strip */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
          {/* Design Info */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={handlePrevDesign}
              title="Previous Design (# - 1)"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-black text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                  #{currentDesign.id}
                </span>
                <h2 className="font-black text-slate-100 text-sm sm:text-base tracking-tight">
                  {currentDesign.name}
                </h2>
                {clearedDesignIds.includes(currentDesign.id) && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3" /> Solved
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                <span className="text-amber-300 font-semibold">
                  Difficulty {currentDesign.difficulty}/20 ({currentTier?.title})
                </span>
                <span>•</span>
                <span className="text-slate-300 font-mono font-bold">
                  {currentDesign.blockCount} Blocks
                </span>
                <span>•</span>
                <span className="text-slate-500">{currentDesign.theme}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleNextDesign}
              title="Next Design (# + 1)"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Difficulty Jump Dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-400 hidden sm:inline">Difficulty:</label>
            <select
              value={currentDesign.difficulty}
              onChange={(e) => handleSelectDifficultyLevel(Number(e.target.value))}
              aria-label="Select difficulty level"
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-400"
            >
              {DIFFICULTY_TIERS.map((t) => (
                <option key={t.level} value={t.level}>
                  Lvl {t.level}: {t.title} ({t.minBlocks}-{t.maxBlocks}b)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Live Gameplay Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
          <div className="flex items-center gap-3 font-semibold text-slate-300">
            <div className="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>
                Remaining:{' '}
                <strong className="text-amber-400 font-mono">
                  {remainingCount}
                </strong>
                /{currentDesign.blockCount}
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                Open Pairs:{' '}
                <strong
                  className={`font-mono ${
                    availablePairs.length > 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {availablePairs.length}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono text-slate-300">{formatTime(elapsedSeconds)}</span>
            </div>
          </div>

          <div className="text-xs font-bold text-amber-400 max-w-xs truncate text-right">
            {statusMessage}
          </div>
        </div>

        {/* No Moves Alert if board has tiles but zero available pairs */}
        {remainingCount > 0 && availablePairs.length === 0 && (
          <div className="bg-rose-950/50 border border-rose-500/40 rounded-xl p-2.5 flex items-center justify-between text-xs text-rose-300 animate-pulse">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>No matching free pairs left on board! Use <strong>Reshuffle</strong> to continue.</span>
            </div>
            <button
              type="button"
              onClick={handleReshuffle}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-lg text-xs flex items-center gap-1 shadow"
            >
              <Shuffle className="w-3 h-3" />
              <span>Reshuffle</span>
            </button>
          </div>
        )}

        {/* Mahjong Solitaire Board Viewport */}
        <div
          ref={containerRef}
          className={`relative w-full bg-radial from-slate-900 via-slate-950 to-black overflow-auto shadow-inner select-none transition-all duration-200 flex ${
            isFullscreen
              ? 'fixed inset-0 z-50 rounded-none border-none h-screen w-screen p-3 sm:p-6 bg-slate-950 flex-col'
              : 'h-[500px] sm:h-[600px] lg:h-[660px] rounded-2xl border border-slate-800 p-3 sm:p-5'
          }`}
        >
          {/* Fullscreen Mode Top HUD bar */}
          {isFullscreen && (
            <div className="shrink-0 mb-3 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 z-30">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-black text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                  #{currentDesign.id}
                </span>
                <span className="font-black text-slate-100 text-sm">
                  {currentDesign.name}
                </span>
                <span className="text-xs text-amber-300 font-semibold hidden sm:inline">
                  (Lvl {currentDesign.difficulty} · {currentDesign.blockCount}b)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded text-xs text-slate-300">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>{remainingCount}/{currentDesign.blockCount}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded text-xs text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Pairs: <strong className="text-emerald-400">{availablePairs.length}</strong></span>
                </div>
                <button
                  type="button"
                  onClick={handleHint}
                  disabled={availablePairs.length === 0 || isWon}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-amber-300 text-xs font-bold rounded-lg border border-slate-700 flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Hint</span>
                </button>
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={matchHistory.length === 0 || isWon}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs font-bold rounded-lg border border-slate-700 flex items-center gap-1"
                >
                  <Undo2 className="w-3 h-3 text-slate-400" />
                  <span>Undo</span>
                </button>
                <button
                  type="button"
                  onClick={handleReshuffle}
                  disabled={remainingCount === 0 || isWon}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs font-bold rounded-lg border border-slate-700 flex items-center gap-1"
                >
                  <Shuffle className="w-3 h-3 text-slate-400" />
                  <span>Reshuffle</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsFullscreen(false)}
                  title="Exit Fullscreen (Esc)"
                  className="p-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs flex items-center gap-1"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Exit Fullscreen</span>
                </button>
              </div>
            </div>
          )}

          {/* Zoom & Fit Toolbar Overlay */}
          <div className="absolute top-3 right-3 z-30 flex items-center gap-1 bg-slate-950/85 border border-slate-800 rounded-xl p-1 shadow-xl backdrop-blur-xs">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))}
              title="Zoom out"
              className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono font-bold text-slate-300 px-1 min-w-[36px] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(1.8, +(z + 0.15).toFixed(2)))}
              title="Zoom in"
              className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(1)}
              title="Fit all blocks to screen (100% visible)"
              className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1 ${
                zoomLevel === 1
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Maximize2 className="w-3 h-3" />
              <span>Fit</span>
            </button>
            <div className="w-px h-3.5 bg-slate-800 mx-0.5" />
            <button
              type="button"
              onClick={() => setIsFullscreen((prev) => !prev)}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Board (F)'}
              className={`p-1.5 rounded-lg transition-colors ${
                isFullscreen
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'text-slate-400 hover:text-amber-400 hover:bg-slate-800'
              }`}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Victory Modal Overlay if Solved */}
          {isWon && (
            <div className="absolute inset-0 z-40 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-3xl shadow-xl shadow-amber-500/20 mb-3 animate-bounce">
                🏆
              </div>
              <h3 className="text-2xl font-black text-amber-400 tracking-tight">
                Design #{currentDesign.id} Solved!
              </h3>
              <p className="text-sm font-bold text-slate-200 mt-1">
                {currentDesign.name} · {currentDesign.difficultyTitle} (Lvl {currentDesign.difficulty})
              </p>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                Cleared {currentDesign.blockCount} blocks in {movesCount} moves ({formatTime(elapsedSeconds)}).
              </p>

              <div className="flex items-center gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => initBoard(currentDesign)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Replay</span>
                </button>
                <button
                  type="button"
                  onClick={handleNextDesign}
                  className="px-5 py-2 bg-linear-to-r from-amber-500 to-amber-400 hover:from-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/25 flex items-center gap-1.5 transition-all"
                >
                  <span>Next Design #{((currentDesign.id % 100) + 1)}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Board Wrapper with m-auto to prevent negative scroll clipping while centering content */}
          <div
            className="m-auto relative flex items-center justify-center"
            style={{
              minWidth: `${canvasWidth}px`,
              minHeight: `${canvasHeight}px`,
            }}
          >
            {/* Tiles Canvas Area */}
            <div
              className="relative transition-transform duration-150"
              style={{
                width: `${canvasWidth}px`,
                height: `${canvasHeight}px`,
              }}
            >
              {tiles.map((tile) => {
                if (tile.cleared) return null;
                const free = isTileFree(tile, tiles);
                const isSelected = selectedId === tile.id;
                const isHinted = hintedIds.includes(tile.id);

                // Safe 3D positioning: never pushes coordinates negative
                const left = PADDING_X + (tile.x - boardBounds.minX) * adaptiveTileWidth + tile.z * 3;
                const top = PADDING_Y + (tile.y - boardBounds.minY) * adaptiveTileHeight - tile.z * 4;

                return (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => handleTileClick(tile)}
                    style={{
                      left: `${left}px`,
                      top: `${top}px`,
                      width: `${adaptiveTileWidth}px`,
                      height: `${adaptiveTileHeight}px`,
                      zIndex: tile.z * 20 + Math.floor(tile.y * 2) + (isSelected ? 99 : 0),
                      boxShadow: free
                        ? `${tile.z * 2 + 2}px ${tile.z * 3 + 3}px 6px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -2px 0 rgba(0,0,0,0.15)`
                        : `${tile.z * 1 + 1}px ${tile.z * 1 + 1}px 4px rgba(0,0,0,0.4)`,
                    }}
                    className={`absolute rounded-md sm:rounded-lg flex flex-col items-center justify-center select-none transition-all duration-100 ${
                      free
                        ? 'bg-linear-to-b from-amber-50 via-amber-100 to-amber-200 border border-amber-300/80 hover:brightness-105 active:scale-95 cursor-pointer text-slate-900'
                        : 'bg-linear-to-b from-slate-700 via-slate-800 to-slate-900 border border-slate-700/60 opacity-50 cursor-not-allowed text-slate-500'
                    } ${
                      isSelected
                        ? 'ring-3 ring-amber-400 scale-105 bg-linear-to-b from-amber-200 to-amber-300 shadow-xl z-50'
                        : ''
                    } ${
                      isHinted
                        ? 'ring-3 ring-emerald-400 animate-pulse bg-emerald-100 scale-105'
                        : ''
                    }`}
                  >
                    {/* Layer indicator badge for high layers */}
                    {tile.z > 0 && (
                      <span
                        className={`absolute top-0.5 right-0.5 text-[7px] sm:text-[8px] font-mono font-bold leading-none px-1 rounded-full pointer-events-none z-10 ${
                          free
                            ? 'bg-amber-300/80 text-slate-900 ring-1 ring-amber-400/50'
                            : 'bg-slate-700/80 text-slate-300'
                        }`}
                      >
                        +{tile.z}
                      </span>
                    )}

                    {/* Real CSS-rendered Mahjong Tile Face */}
                    <MahjongTileFace
                      tileId={tile.tileId || tile.symbol}
                      name={tile.name}
                      category={tile.category}
                      isFree={free}
                      width={adaptiveTileWidth}
                      height={adaptiveTileHeight}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* In-Game Action Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {/* Left tools: Hint, Undo, Reshuffle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleHint}
              disabled={availablePairs.length === 0 || isWon}
              className="py-2 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-amber-300 font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Hint</span>
            </button>

            <button
              type="button"
              onClick={handleUndo}
              disabled={matchHistory.length === 0 || isWon}
              className="py-2 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              <Undo2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Undo</span>
            </button>

            <button
              type="button"
              onClick={handleReshuffle}
              disabled={remainingCount === 0 || isWon}
              className="py-2 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              <Shuffle className="w-3.5 h-3.5 text-slate-400" />
              <span>Reshuffle</span>
            </button>
          </div>

          {/* Right tools: Restart, Next */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => initBoard(currentDesign)}
              className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restart</span>
            </button>

            <button
              type="button"
              onClick={handleNextDesign}
              className="py-2 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-md shadow-amber-500/20"
            >
              <span>Next Design</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 20 Difficulty Level Tabs for Quick Navigation */}
        <div className="pt-2 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-bold flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              Difficulty Levels (1-20): More blocks as difficulty rises
            </span>
            <span className="text-[11px] text-slate-500">
              5 unique designs per level
            </span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-1.5 text-xs">
            {DIFFICULTY_TIERS.map((tier) => {
              const active = currentDesign.difficulty === tier.level;
              const clearedCountInTier = tier.designIds.filter((id) =>
                clearedDesignIds.includes(id)
              ).length;

              return (
                <button
                  key={tier.level}
                  type="button"
                  onClick={() => handleSelectDifficultyLevel(tier.level)}
                  className={`p-1.5 rounded-lg border text-center transition-all cursor-pointer ${
                    active
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-black shadow-sm'
                      : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-mono text-[11px] leading-tight">
                    Lvl {tier.level}
                  </div>
                  <div className="text-[9px] font-mono opacity-80 leading-tight">
                    {tier.minBlocks}-{tier.maxBlocks}b
                  </div>
                  {clearedCountInTier > 0 && (
                    <div className="text-[8px] text-emerald-400 font-bold leading-tight mt-0.5">
                      ✓ {clearedCountInTier}/5
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
