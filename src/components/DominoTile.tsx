import React from 'react';

interface DominoTileProps {
  val1: number; // 0..6
  val2: number; // 0..6
  orientation?: 'vertical' | 'horizontal';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  selected?: boolean;
  playable?: boolean;
  faceDown?: boolean;
  showSpinner?: boolean;
  onClick?: () => void;
  className?: string;
  title?: string;
  as?: 'button' | 'div';
}

// 3x3 Grid Coordinates [row, col] for standard domino pips
const VERTICAL_PIP_COORDS: Record<number, [number, number][]> = {
  0: [],
  1: [[1, 1]],
  2: [
    [0, 2],
    [2, 0],
  ],
  3: [
    [0, 2],
    [1, 1],
    [2, 0],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 2],
  ],
};

const HORIZONTAL_PIP_COORDS: Record<number, [number, number][]> = {
  0: [],
  1: [[1, 1]],
  2: [
    [0, 2],
    [2, 0],
  ],
  3: [
    [0, 2],
    [1, 1],
    [2, 0],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 1],
    [0, 2],
    [2, 0],
    [2, 1],
    [2, 2],
  ],
};

interface PipHalfProps {
  value: number;
  orientation: 'vertical' | 'horizontal';
  size: 'xs' | 'sm' | 'md' | 'lg';
}

const PipHalf: React.FC<PipHalfProps> = ({ value, orientation, size }) => {
  const coords = orientation === 'horizontal' ? HORIZONTAL_PIP_COORDS[value] || [] : VERTICAL_PIP_COORDS[value] || [];

  const hasPip = (r: number, c: number) => {
    return coords.some(([pr, pc]) => pr === r && pc === c);
  };

  const pipSize =
    size === 'xs'
      ? 'w-1.5 h-1.5'
      : size === 'sm'
      ? 'w-2 h-2'
      : size === 'md'
      ? 'w-2.5 h-2.5'
      : 'w-3 h-3';

  return (
    <div className="w-full h-full p-1 flex items-center justify-center">
      <div className="grid grid-cols-3 grid-rows-3 w-full h-full place-items-center">
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => {
            const active = hasPip(r, c);
            return (
              <div key={`${r}-${c}`} className="w-full h-full flex items-center justify-center">
                {active && (
                  <div
                    className={`${pipSize} rounded-full bg-slate-950 shadow-[inset_0_1px_1.5px_rgba(0,0,0,0.9),0_0.5px_0_rgba(255,255,255,0.4)] transition-all`}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export const DominoTile: React.FC<DominoTileProps> = ({
  val1,
  val2,
  orientation = 'vertical',
  size = 'md',
  selected = false,
  playable = false,
  faceDown = false,
  showSpinner = true,
  onClick,
  className = '',
  title,
  as,
}) => {
  const isHorizontal = orientation === 'horizontal';

  // Sizing definitions
  const dimensions = {
    xs: isHorizontal ? 'w-12 h-6' : 'w-6 h-12',
    sm: isHorizontal ? 'w-16 h-8' : 'w-8 h-16',
    md: isHorizontal ? 'w-22 h-11' : 'w-11 h-22',
    lg: isHorizontal ? 'w-28 h-14' : 'w-14 h-28',
  }[size];

  const spinnerSize =
    size === 'xs'
      ? 'w-1 h-1'
      : size === 'sm'
      ? 'w-1.5 h-1.5'
      : size === 'md'
      ? 'w-2 h-2'
      : 'w-2.5 h-2.5';

  if (faceDown) {
    return (
      <div
        className={`${dimensions} rounded-lg bg-linear-to-br from-amber-950 via-stone-900 to-amber-950 border border-amber-800/60 shadow-[0_4px_6px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.15)] flex items-center justify-center select-none relative transition-all ${className}`}
        title="Hidden Domino"
      >
        <div className="w-3/4 h-3/4 border border-amber-700/30 rounded-xs flex items-center justify-center opacity-60">
          <span className="text-[10px] text-amber-500 font-black tracking-widest uppercase">
            HUSH
          </span>
        </div>
      </div>
    );
  }

  const commonClasses = `relative select-none rounded-lg transition-all duration-150 flex ${
    isHorizontal ? 'flex-row' : 'flex-col'
  } ${dimensions} ${
    'bg-linear-to-b from-stone-50 via-amber-50 to-stone-200 border border-stone-300 shadow-[0_4px_8px_rgba(0,0,0,0.4),0_1px_2px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,0.9),inset_0_-2px_3px_rgba(0,0,0,0.12)]'
  } ${
    selected
      ? 'ring-3 ring-amber-400 scale-105 z-20 shadow-[0_8px_16px_rgba(245,158,11,0.35)]'
      : playable
      ? 'hover:-translate-y-1 hover:shadow-lg cursor-pointer ring-1.5 ring-amber-400/60'
      : onClick
      ? 'cursor-pointer hover:shadow-md'
      : 'cursor-default'
  } ${className}`;

  const tileContent = (
    <>
      {/* Half 1 */}
      <div className={`${isHorizontal ? 'w-1/2 h-full' : 'w-full h-1/2'} relative`}>
        <PipHalf value={val1} orientation={orientation} size={size} />
      </div>

      {/* Engraved Center Divider with Brass Spinner Rivet */}
      <div
        className={`relative shrink-0 flex items-center justify-center ${
          isHorizontal
            ? 'w-[2px] h-full bg-stone-400/90 shadow-[inset_0_1px_1px_rgba(0,0,0,0.4)] my-auto'
            : 'h-[2px] w-full bg-stone-400/90 shadow-[inset_0_1px_1px_rgba(0,0,0,0.4)] mx-auto'
        }`}
      >
        {showSpinner && size !== 'xs' && (
          <div
            className={`absolute ${spinnerSize} rounded-full bg-linear-to-br from-amber-300 via-yellow-500 to-amber-700 shadow-xs border border-amber-600/70 pointer-events-none`}
            title="Brass Spinner"
          />
        )}
      </div>

      {/* Half 2 */}
      <div className={`${isHorizontal ? 'w-1/2 h-full' : 'w-full h-1/2'} relative`}>
        <PipHalf value={val2} orientation={orientation} size={size} />
      </div>

      {/* Playable indicator dot */}
      {playable && !selected && (
        <span className="w-2 h-2 rounded-full bg-amber-400 absolute -top-1 -right-1 shadow-xs border border-stone-900 animate-pulse pointer-events-none" />
      )}
    </>
  );

  // If as is explicitly 'div' or no onClick is provided, render div to prevent nested button issues
  if (as === 'div' || !onClick) {
    return (
      <div
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        title={title || `Domino [${val1} | ${val2}]`}
        className={commonClasses}
      >
        {tileContent}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title || `Domino [${val1} | ${val2}]`}
      className={commonClasses}
    >
      {tileContent}
    </button>
  );
};
