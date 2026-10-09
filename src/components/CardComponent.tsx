import React from 'react';
import { Card } from '../types';
import hushLogo from '../assets/images/hush_gold_black_bright.png';

interface CardProps {
  card?: Card;
  hidden?: boolean;
  selected?: boolean;
  small?: boolean;
  onClick?: () => void;
  className?: string;
}

export const CardComponent: React.FC<CardProps> = ({
  card,
  hidden = false,
  selected = false,
  small = false,
  onClick,
  className = '',
}) => {
  if (hidden || !card) {
    const cardBackInner = (
      <div className="w-full h-full rounded-[6px] border border-amber-500/40 bg-radial from-slate-900 via-slate-950 to-black p-1 flex flex-col items-center justify-center relative overflow-hidden ring-1 ring-amber-500/20 shadow-inner">
        {/* Subtle decorative geometric borders */}
        <div className="absolute inset-0.5 border border-amber-500/30 rounded-[4px] pointer-events-none" />
        <div className="absolute inset-1 border border-dashed border-amber-500/20 rounded-[3px] pointer-events-none" />

        {/* Corner diamond pips */}
        <div className="absolute top-1 left-1 w-1 h-1 bg-amber-400/70 rotate-45 rounded-[0.5px]" />
        <div className="absolute top-1 right-1 w-1 h-1 bg-amber-400/70 rotate-45 rounded-[0.5px]" />
        <div className="absolute bottom-1 left-1 w-1 h-1 bg-amber-400/70 rotate-45 rounded-[0.5px]" />
        <div className="absolute bottom-1 right-1 w-1 h-1 bg-amber-400/70 rotate-45 rounded-[0.5px]" />

        {/* Center: Official Hush Music Entertainment Logo */}
        <div className="relative z-10 w-full flex items-center justify-center p-0.5">
          <img
            src={hushLogo}
            alt="Hush Music Logo"
            className={`${
              small ? 'w-7 h-7' : 'w-10 h-10 md:w-12 md:h-12'
            } object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] filter transition-transform duration-200`}
          />
        </div>
      </div>
    );

    const backClasses = `rounded-lg border-2 border-amber-600/40 bg-slate-950 p-0.5 shadow-md select-none transition-all duration-150 flex items-center justify-center ${
      small ? 'w-10 h-14' : 'w-14 h-20 md:w-16 md:h-24'
    } ${onClick ? 'hover:-translate-y-0.5 cursor-pointer shadow-amber-500/10' : ''} ${className}`;

    if (!onClick) {
      return (
        <div className={backClasses}>
          {cardBackInner}
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={onClick}
        className={backClasses}
      >
        {cardBackInner}
      </button>
    );
  }

  const isRed = card.s === '♥' || card.s === '♦';

  const cardClasses = `rounded-lg bg-white border border-slate-200 shadow-md flex flex-col items-center justify-between p-1 select-none transition-all duration-150 ${
    small ? 'w-10 h-14 text-xs' : 'w-14 h-20 text-base md:w-16 md:h-24'
  } ${
    selected ? 'ring-3 ring-amber-400 -translate-y-2 shadow-amber-500/20 shadow-lg' : onClick ? 'hover:-translate-y-0.5 cursor-pointer' : ''
  } ${isRed ? 'text-rose-600' : 'text-slate-900'} ${className}`;

  const cardInner = (
    <>
      <div className="w-full flex justify-between items-center text-xs font-bold leading-none px-0.5">
        <span>{card.r}</span>
        <span className="text-xs">{card.s}</span>
      </div>
      <div className="text-lg md:text-2xl my-auto leading-none font-bold">{card.s}</div>
      <div className="w-full flex justify-between items-center text-xs font-bold leading-none px-0.5 rotate-180">
        <span>{card.r}</span>
        <span className="text-xs">{card.s}</span>
      </div>
    </>
  );

  if (!onClick) {
    return (
      <div className={cardClasses}>
        {cardInner}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cardClasses}
    >
      {cardInner}
    </button>
  );
};
