import React, { useState } from 'react';
import { X, Search, CheckCircle2, Layers, Award } from 'lucide-react';
import { MahjongDesignDef, DIFFICULTY_TIERS } from './mahjongData';

interface MahjongDesignsModalProps {
  isOpen: boolean;
  onClose: () => void;
  designs: MahjongDesignDef[];
  currentDesignId: number;
  onSelectDesign: (design: MahjongDesignDef) => void;
  clearedDesignIds: number[];
}

export const MahjongDesignsModal: React.FC<MahjongDesignsModalProps> = ({
  isOpen,
  onClose,
  designs,
  currentDesignId,
  onSelectDesign,
  clearedDesignIds,
}) => {
  const [search, setSearch] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<number | 'all'>('all');

  if (!isOpen) return null;

  const filteredDesigns = designs.filter((d) => {
    const matchesSearch =
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.theme.toLowerCase().includes(search.toLowerCase()) ||
      `#${d.id}`.includes(search) ||
      d.difficultyTitle.toLowerCase().includes(search.toLowerCase());

    const matchesDifficulty =
      selectedDifficulty === 'all' || d.difficulty === selectedDifficulty;

    return matchesSearch && matchesDifficulty;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black">
              🀄
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-slate-100 tracking-tight">
                  100 Mahjong Layout Designs
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  20 Difficulties
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Solved: <span className="text-emerald-400 font-bold">{clearedDesignIds.length} / 100</span> designs
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="p-3 sm:p-4 border-b border-slate-800 bg-slate-900/60 space-y-3">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by design name, #ID, theme, or difficulty..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs"
              >
                Clear
              </button>
            )}
          </div>

          {/* Difficulty Tiers Scroll */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedDifficulty('all')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all text-xs cursor-pointer ${
                selectedDifficulty === 'all'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              All 20 Levels (100)
            </button>
            {DIFFICULTY_TIERS.map((tier) => {
              const active = selectedDifficulty === tier.level;
              return (
                <button
                  key={tier.level}
                  type="button"
                  onClick={() => setSelectedDifficulty(tier.level)}
                  className={`px-2.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all text-xs flex items-center gap-1.5 cursor-pointer ${
                    active
                      ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
                  }`}
                >
                  <span>Lvl {tier.level}: {tier.title}</span>
                  <span className={`text-[10px] px-1 py-0.2 rounded font-mono ${
                    active ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-900 text-amber-400'
                  }`}>
                    {tier.minBlocks}-{tier.maxBlocks}b
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Designs Grid */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {filteredDesigns.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400">
              <p className="text-sm">No layouts match your filter criteria.</p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSelectedDifficulty('all');
                }}
                className="mt-2 text-xs text-amber-400 hover:underline"
              >
                Reset filters
              </button>
            </div>
          ) : (
            filteredDesigns.map((d) => {
              const isCurrent = d.id === currentDesignId;
              const isCleared = clearedDesignIds.includes(d.id);

              return (
                <div
                  key={d.id}
                  onClick={() => {
                    onSelectDesign(d);
                    onClose();
                  }}
                  className={`group relative rounded-xl border p-3.5 flex flex-col justify-between transition-all cursor-pointer text-left ${
                    isCurrent
                      ? 'bg-amber-950/30 border-amber-500 ring-2 ring-amber-500/40 shadow-lg'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/90'
                  }`}
                >
                  {/* Top card metadata */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-black text-amber-400">
                          #{d.id}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-slate-800 text-slate-300">
                          Lvl {d.difficulty} · {d.difficultyTitle}
                        </span>
                      </div>
                      {isCleared ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3" /> Solved
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">
                          {d.theme}
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-slate-100 text-sm group-hover:text-amber-300 transition-colors flex items-center justify-between">
                      <span>{d.name}</span>
                    </h3>

                    <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 leading-snug">
                      {d.description}
                    </p>
                  </div>

                  {/* Bottom card stats & mini thumbnail */}
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1 text-amber-400 font-bold">
                        <Layers className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-mono">{d.blockCount}</span> Blocks
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                        isCurrent
                          ? 'bg-amber-500 text-slate-950 font-black'
                          : 'bg-slate-800 text-slate-200 group-hover:bg-amber-500 group-hover:text-slate-950'
                      }`}
                    >
                      {isCurrent ? 'Playing' : 'Play'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/90 text-center text-xs text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Award className="w-4 h-4 text-amber-400" />
            <span>Difficulty 1 (24 blocks) up to Difficulty 20 (184 blocks)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
